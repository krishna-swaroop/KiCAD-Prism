//! The source set under `--source-root` (cli-spec.md §5.2.2, "Source
//! selection").
//!
//! The tree is walked without following links; a link or special file under
//! the root is `source-not-regular-file`. Files are selected by the revision
//! key's name rules ([`category_for_name`]), outside the effective config's
//! `excluded_dirs`; `.git` is never walked, as git never lists it. The
//! selected set is checked against the path rules (`source-path-invalid`),
//! for collisions under NFC and case folding (`source-path-collision`) and
//! against the source limits (exit 4) before any file is read.
//!
//! Reading goes through [`SourceTree::read`], which records every file read:
//! the bundle's `sources/` are exactly those files (bundle-format.md §2.2).
//!
//! A producer needs exactly three queries (ADR amendment K2 §3.1):
//! [`SourceTree::read`], [`SourceTree::exists`] and [`SourceTree::list`]. Each
//! call is recorded — a successful read becomes a member, a read that finds
//! nothing and every `exists` is a *probe*, every `list` is a *listing* — so a
//! later build can decide whether the read set still holds ([`ReadSet`]).
//! Producers run in parallel, so every recording is a set, sorted at read
//! time and free of duplicates whatever order the calls arrive in.

use crate::finding::{Failure, Outcome};
use crate::limits::{LimitName, Limits};
use crate::paths::{PathProblem, check_path, first_collision};
use crate::revision_key::{Category, category_for_name};
use std::collections::{BTreeMap, BTreeSet};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

/// One selected file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SourceInfo {
    /// Size from the directory walk.
    pub size: u64,
    /// The owner-execute bit.
    pub executable: bool,
    /// The name rule it matched.
    pub category: Category,
}

/// One recorded probe: a path tested with `exists`, or a `read` that found no
/// such file, and whether it was in the source set.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Probe {
    /// The repository path.
    pub path: String,
    /// Whether the path was in the source set.
    pub present: bool,
}

/// One recorded listing: `list(directory, suffixes)` and the paths it
/// returned, both sorted.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Listing {
    /// The directory the listing was under.
    pub directory: String,
    /// The suffixes asked for, sorted.
    pub suffixes: Vec<String>,
    /// The paths returned, in code point order.
    pub paths: Vec<String>,
}

/// One submodule the build looked into, with the commit its gitlink records
/// (bundle-format.md §2.3).
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Gitlink {
    /// The gitlink entry's repository path.
    pub path: String,
    /// The commit the gitlink records.
    pub commit: String,
}

/// The recorded read set of one build (ADR amendment K2 §3.1): every probe,
/// listing and gitlink, sorted and without duplicates. Reads are not repeated
/// here: they are the `sources/` members.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ReadSet {
    /// Every probe, by path.
    pub probes: Vec<Probe>,
    /// Every listing, by directory then suffixes.
    pub listings: Vec<Listing>,
    /// Every gitlink the build looked into, by path.
    pub gitlinks: Vec<Gitlink>,
}

/// The selected files under one source root, and the ones read so far.
pub struct SourceTree {
    root: PathBuf,
    files: BTreeMap<String, SourceInfo>,
    read: Mutex<BTreeMap<String, Arc<[u8]>>>,
    /// Every probe: the path and whether it was present. Producers run in
    /// parallel, so this is a set, not a log in call order.
    probes: Mutex<BTreeMap<String, bool>>,
    /// Every listing, a set for the same reason.
    listings: Mutex<BTreeSet<Listing>>,
    /// Read failures by path. Producers run in parallel, so the reported
    /// failure is the first by path, not the first in time.
    failure: Mutex<BTreeMap<String, Failure>>,
    max_file_bytes: u64,
}

fn link_failure(relative: &[u8]) -> Failure {
    let text = String::from_utf8_lossy(relative);
    let failure = Failure::input(
        "source-not-regular-file",
        format!(
            "sources/{text} is a symbolic link or special file; only regular files are bundled"
        ),
    )
    .argument("source-root");
    if check_path(&text, usize::MAX).is_ok() {
        failure.at_path(format!("sources/{text}"))
    } else {
        failure
    }
}

fn walk_failure(error: &std::io::Error) -> Failure {
    Failure::input(
        "input-not-found",
        format!("the source root could not be listed: {error}"),
    )
    .argument("source-root")
}

struct Walk<'a> {
    excluded: &'a [String],
    found: Vec<(Vec<u8>, std::fs::Metadata, Category)>,
}

impl Walk<'_> {
    fn directory(&mut self, dir: &Path, prefix: &[u8]) -> Outcome<()> {
        let mut entries: Vec<std::fs::DirEntry> = std::fs::read_dir(dir)
            .map_err(|error| walk_failure(&error))?
            .collect::<Result<_, _>>()
            .map_err(|error| walk_failure(&error))?;
        entries.sort_by_key(std::fs::DirEntry::file_name);
        for entry in entries {
            let name = entry.file_name();
            let name = name.as_bytes();
            if name == b".git" {
                continue;
            }
            let mut relative = prefix.to_vec();
            if !relative.is_empty() {
                relative.push(b'/');
            }
            relative.extend_from_slice(name);
            if self
                .excluded
                .iter()
                .any(|excluded| excluded.as_bytes() == relative.as_slice())
            {
                continue;
            }
            let metadata =
                std::fs::symlink_metadata(entry.path()).map_err(|error| walk_failure(&error))?;
            let kind = metadata.file_type();
            if kind.is_dir() {
                self.directory(&entry.path(), &relative)?;
            } else if kind.is_file() {
                if let Some(category) = category_for_name(name, false) {
                    self.found.push((relative, metadata, category));
                }
            } else {
                return Err(link_failure(&relative));
            }
        }
        Ok(())
    }
}

fn path_failure(path: &[u8], problem: Option<PathProblem>, limits: &Limits) -> Failure {
    let text = String::from_utf8_lossy(path);
    match problem {
        Some(PathProblem::TooLong) => limits.exceeded(
            LimitName::MaxPathBytes,
            Some(u64::try_from(path.len()).unwrap_or(u64::MAX)),
            &format!("the length of source path {text:?}"),
        ),
        Some(problem) => Failure::input(
            "source-path-invalid",
            format!("source path {text:?} {}", problem.describe()),
        )
        .argument("source-root"),
        None => Failure::input(
            "source-path-invalid",
            format!("source path {text:?} is not valid UTF-8"),
        )
        .argument("source-root"),
    }
}

impl SourceTree {
    /// Walk `root` and select its source set.
    pub fn scan(root: &Path, excluded: &[String], limits: &Limits) -> Outcome<Self> {
        let mut walk = Walk {
            excluded,
            found: Vec::new(),
        };
        walk.directory(root, b"")?;
        let max_path = limits.get_usize(LimitName::MaxPathBytes);
        let mut files = BTreeMap::new();
        let mut total = 0u64;
        for (relative, metadata, category) in walk.found {
            let text = std::str::from_utf8(&relative)
                .map_err(|_| path_failure(&relative, None, limits))?;
            check_path(text, max_path)
                .map_err(|problem| path_failure(&relative, Some(problem), limits))?;
            limits
                .check(
                    LimitName::MaxSourceFileBytes,
                    metadata.len(),
                    &format!("sources/{text}"),
                )
                .map_err(|failure| failure.at_path(format!("sources/{text}")))?;
            total = total.saturating_add(metadata.len());
            let executable = metadata.permissions().mode() & 0o100 != 0;
            files.insert(
                text.to_owned(),
                SourceInfo {
                    size: metadata.len(),
                    executable,
                    category,
                },
            );
        }
        let count = u64::try_from(files.len()).unwrap_or(u64::MAX);
        limits.check(
            LimitName::MaxSourceFiles,
            count,
            "the number of selected source files",
        )?;
        limits.check(
            LimitName::MaxTotalSourceBytes,
            total,
            "the size of the selected sources",
        )?;
        if let Some((first, second)) = first_collision(files.keys().map(String::as_str)) {
            return Err(Failure::input(
                "source-path-collision",
                format!("sources/{first} and sources/{second} are equal after NFC normalization and case folding"),
            )
            .argument("source-root")
            .at_path(format!("sources/{second}")));
        }
        Ok(Self {
            root: root.to_path_buf(),
            files,
            read: Mutex::new(BTreeMap::new()),
            probes: Mutex::new(BTreeMap::new()),
            listings: Mutex::new(BTreeSet::new()),
            failure: Mutex::new(BTreeMap::new()),
            max_file_bytes: limits.get(LimitName::MaxSourceFileBytes),
        })
    }

    /// Whether `path` is in the source set. Records a probe.
    #[must_use]
    pub fn exists(&self, path: &str) -> bool {
        let present = self.files.contains_key(path);
        locked(&self.probes).insert(path.to_owned(), present);
        present
    }

    /// The source-set paths under `dir` (`""` = the repository root), at any
    /// depth, whose lowered name (the bytes after the last `/`) ends with one
    /// of `suffixes` (any name when empty), in code point order. ASCII only
    /// (revision-key.md §5.2). Records a listing.
    pub fn list(&self, dir: &str, suffixes: &[&str]) -> Vec<String> {
        let mut suffixes: Vec<String> = suffixes
            .iter()
            .map(|suffix| suffix.to_ascii_lowercase())
            .collect();
        suffixes.sort();
        let prefix = if dir.is_empty() {
            String::new()
        } else {
            format!("{dir}/")
        };
        let paths: Vec<String> = self
            .files
            .range(prefix.clone()..)
            .take_while(|(path, _)| path.starts_with(&prefix))
            .filter(|(path, _)| suffixes.is_empty() || name_matches(path, &suffixes))
            .map(|(path, _)| path.clone())
            .collect();
        locked(&self.listings).insert(Listing {
            directory: dir.to_owned(),
            suffixes,
            paths: paths.clone(),
        });
        paths
    }

    /// The selected file at `path`.
    #[must_use]
    pub fn info(&self, path: &str) -> Option<&SourceInfo> {
        self.files.get(path)
    }

    /// The selected files, for the `sources-selected` log count only. Never
    /// use it to decide what a build reads: that goes through [`read`],
    /// [`exists`] and [`list`] so the read set is exact.
    ///
    /// [`read`]: SourceTree::read
    /// [`exists`]: SourceTree::exists
    /// [`list`]: SourceTree::list
    pub fn selected(&self) -> impl Iterator<Item = (&String, &SourceInfo)> {
        self.files.iter()
    }

    /// Read `path`, recording it as a member. `None` when it is not in the
    /// source set (recorded as an absent probe); an I/O failure keeps today's
    /// handling and records nothing.
    pub fn read(&self, path: &str) -> Outcome<Option<Arc<[u8]>>> {
        if let Some(bytes) = locked(&self.read).get(path) {
            return Ok(Some(Arc::clone(bytes)));
        }
        if !self.files.contains_key(path) {
            locked(&self.probes).insert(path.to_owned(), false);
            return Ok(None);
        }
        let host = self.root.join(path);
        let metadata =
            std::fs::symlink_metadata(&host).map_err(|error| read_failure(path, &error))?;
        if !metadata.file_type().is_file() {
            return Err(link_failure(path.as_bytes()));
        }
        if metadata.len() > self.max_file_bytes {
            return Err(Failure::limit(
                LimitName::MaxSourceFileBytes,
                self.max_file_bytes,
                Some(metadata.len()),
                format!(
                    "sources/{path} is {} bytes, over max-source-file-bytes {}",
                    metadata.len(),
                    self.max_file_bytes
                ),
            )
            .at_path(format!("sources/{path}")));
        }
        let bytes: Arc<[u8]> =
            Arc::from(std::fs::read(&host).map_err(|error| read_failure(path, &error))?);
        locked(&self.read).insert(path.to_owned(), Arc::clone(&bytes));
        Ok(Some(bytes))
    }

    /// Every file read so far, by path, shared.
    #[must_use]
    pub fn read_files(&self) -> BTreeMap<String, Arc<[u8]>> {
        locked(&self.read).clone()
    }

    /// The recorded read set: every probe and listing, sorted and without
    /// duplicates.
    #[must_use]
    pub fn read_set(&self) -> ReadSet {
        ReadSet {
            probes: locked(&self.probes)
                .iter()
                .map(|(path, present)| Probe {
                    path: path.clone(),
                    present: *present,
                })
                .collect(),
            listings: locked(&self.listings).iter().cloned().collect(),
            gitlinks: Vec::new(),
        }
    }

    /// The failure of the first path, in code point order, that a
    /// projection's read could not read, if any; clears every recorded one.
    pub fn take_failure(&self) -> Option<Failure> {
        std::mem::take(&mut *locked(&self.failure))
            .into_values()
            .next()
    }
}

/// `mutex`'s guard. A producer that panicked mid-read cannot leave the map
/// half-written (every update is one insert), so a poisoned lock is still
/// sound to read.
fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
impl SourceTree {
    /// A tree over `paths` with no host root, for the recording tests. No
    /// `read` of a listed path succeeds: only `exists`, `list` and a miss are
    /// exercised.
    fn for_test(paths: &[&str]) -> Self {
        let files = paths
            .iter()
            .map(|path| {
                (
                    (*path).to_owned(),
                    SourceInfo {
                        size: 0,
                        executable: false,
                        category: Category::KicadSchematic,
                    },
                )
            })
            .collect();
        Self {
            root: PathBuf::from("/nonexistent"),
            files,
            read: Mutex::new(BTreeMap::new()),
            probes: Mutex::new(BTreeMap::new()),
            listings: Mutex::new(BTreeSet::new()),
            failure: Mutex::new(BTreeMap::new()),
            max_file_bytes: u64::MAX,
        }
    }
}

fn read_failure(path: &str, error: &std::io::Error) -> Failure {
    Failure::input(
        "input-not-found",
        format!("sources/{path} could not be read: {error}"),
    )
    .argument("source-root")
    .at_path(format!("sources/{path}"))
}

impl prism_projections::Sources for SourceTree {
    fn read(&self, path: &str) -> Option<Arc<[u8]>> {
        match SourceTree::read(self, path) {
            Ok(bytes) => bytes,
            Err(failure) => {
                locked(&self.failure)
                    .entry(path.to_owned())
                    .or_insert(failure);
                None
            }
        }
    }

    fn exists(&self, path: &str) -> bool {
        SourceTree::exists(self, path)
    }

    fn list(&self, dir: &str, suffixes: &[&str]) -> Vec<String> {
        SourceTree::list(self, dir, suffixes)
    }
}

/// Whether `path`'s lowered name (the bytes after the last `/`) ends with one
/// of `suffixes` (already lowered), ASCII only (revision-key.md §5.2).
pub(crate) fn name_matches(path: &str, suffixes: &[String]) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    let lowered = name.to_ascii_lowercase();
    suffixes
        .iter()
        .any(|suffix| lowered.ends_with(suffix.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree(paths: &[&str]) -> SourceTree {
        SourceTree::for_test(paths)
    }

    #[test]
    fn probes_and_listings_are_sorted_and_free_of_duplicates() {
        let tree = tree(&[
            "lib/fp.kicad_mod",
            "lib/x.kicad_sch",
            "library/y.kicad_sch",
            "root.kicad_jobset",
            "src/b.kicad_jobset",
        ]);
        // Calls arrive in any order, from several threads.
        std::thread::scope(|scope| {
            scope.spawn(|| {
                assert!(tree.exists("lib/fp.kicad_mod"));
                assert!(!tree.exists("lib/missing"));
                assert_eq!(tree.list("lib", &[".kicad_mod"]), ["lib/fp.kicad_mod"]);
                assert_eq!(
                    tree.list("", &[".kicad_jobset"]),
                    ["root.kicad_jobset", "src/b.kicad_jobset"]
                );
            });
            scope.spawn(|| {
                assert!(tree.read("absent/path").unwrap().is_none());
                assert!(tree.exists("lib/x.kicad_sch"));
                // A different suffix case is the same listing.
                assert_eq!(tree.list("lib", &[".KICAD_MOD"]), ["lib/fp.kicad_mod"]);
                assert_eq!(
                    tree.list("", &[".kicad_jobset"]),
                    ["root.kicad_jobset", "src/b.kicad_jobset"]
                );
            });
        });
        let read_set = tree.read_set();
        assert_eq!(
            read_set.probes,
            vec![
                Probe {
                    path: "absent/path".to_owned(),
                    present: false,
                },
                Probe {
                    path: "lib/fp.kicad_mod".to_owned(),
                    present: true,
                },
                Probe {
                    path: "lib/missing".to_owned(),
                    present: false,
                },
                Probe {
                    path: "lib/x.kicad_sch".to_owned(),
                    present: true,
                },
            ]
        );
        // Sorted by directory then suffixes; the two calls to `list("lib", …)`
        // differ only by suffix case, so they are one listing.
        assert_eq!(
            read_set.listings,
            vec![
                Listing {
                    directory: String::new(),
                    suffixes: vec![".kicad_jobset".to_owned()],
                    paths: vec![
                        "root.kicad_jobset".to_owned(),
                        "src/b.kicad_jobset".to_owned()
                    ],
                },
                Listing {
                    directory: "lib".to_owned(),
                    suffixes: vec![".kicad_mod".to_owned()],
                    paths: vec!["lib/fp.kicad_mod".to_owned()],
                },
            ]
        );
    }

    #[test]
    fn list_keeps_the_directory_boundary_at_any_depth() {
        let tree = tree(&[
            "lib/a.KICAD_SCH",
            "lib/deep/c.kicad_sch",
            "lib/d.kicad_mod",
            "library/b.kicad_sch",
        ]);
        assert_eq!(
            tree.list("lib", &[".kicad_sch"]),
            ["lib/a.KICAD_SCH", "lib/deep/c.kicad_sch"]
        );
        // `lib` must not match `library/b.kicad_sch`.
        assert_eq!(
            tree.list("lib", &[]),
            ["lib/a.KICAD_SCH", "lib/d.kicad_mod", "lib/deep/c.kicad_sch"]
        );
        assert_eq!(tree.list("library", &[]), ["library/b.kicad_sch"]);
        assert_eq!(tree.list("", &[]).len(), 4);
    }

    #[test]
    fn list_lowers_ascii_only() {
        let tree = tree(&["Lib.KICAD_SCH", "Lib.KİCAD_SCH"]);
        // ASCII case folds; the non-ASCII `İ` does not.
        assert_eq!(tree.list("", &[".kicad_sch"]), ["Lib.KICAD_SCH"]);
    }
}
