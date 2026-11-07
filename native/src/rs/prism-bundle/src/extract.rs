//! `bundle extract`: write selected members below a directory without ever
//! following a link or overwriting other bytes (cli-spec.md §5.4,
//! bundle-format.md §8).
//!
//! The output directory is opened once, as a capability (`cap_std`); every
//! path is resolved relative to it, component by component, and a link or
//! non-directory in the way is `archive-path-collision`. Each file is written
//! to an exclusive temp file beside its target, then renamed into place, so
//! a file that exists is always complete and verified. Files get `0644` and
//! directories `0755`; no archive attribute is applied.

use crate::finding::{Failure, Finding, Outcome};
use crate::generator::sha256_hex;
use crate::reader::BundleReader;
use crate::zip::ReadAt;
use cap_std::ambient_authority;
use cap_std::fs::{Dir, OpenOptions};
#[cfg(unix)]
use cap_std::fs::{Permissions, PermissionsExt};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

static TEMP_SERIAL: AtomicU64 = AtomicU64::new(0);

/// One extracted member.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Extracted {
    /// Member path.
    pub path: String,
    /// Size in bytes.
    pub bytes: u64,
    /// SHA-256 hex.
    pub sha256: String,
}

/// The members `selectors` choose, in code point order. A selector is an
/// exact member path or a directory prefix ending in `/`. `bundle.json` can
/// be selected.
pub fn select<R: ReadAt>(reader: &BundleReader<R>, selectors: &[String]) -> Outcome<Vec<String>> {
    let mut paths: Vec<String> = std::iter::once(crate::manifest::MANIFEST_PATH.to_owned())
        .chain(
            reader
                .manifest()
                .members
                .iter()
                .map(|member| member.path.0.clone()),
        )
        .collect();
    paths.sort();
    let mut chosen = std::collections::BTreeSet::new();
    for selector in selectors {
        let matched: Vec<&String> = if selector.ends_with('/') {
            paths
                .iter()
                .filter(|path| path.starts_with(selector.as_str()))
                .collect()
        } else {
            paths.iter().filter(|path| *path == selector).collect()
        };
        if matched.is_empty() {
            return Err(Failure::precondition(
                "member-not-found",
                format!("{selector:?} selects no member of the bundle"),
            )
            .argument("member"));
        }
        chosen.extend(matched.into_iter().cloned());
    }
    Ok(chosen.into_iter().collect())
}

fn collision(path: &str, why: &str) -> Failure {
    Failure::precondition(
        "archive-path-collision",
        format!("{path} cannot be extracted: {why}"),
    )
    .at_path(path.to_owned())
}

fn io_failure(path: &str, error: &std::io::Error) -> Failure {
    Failure::output(
        "output-write-failed",
        format!("{path} could not be written: {error}"),
    )
    .argument("output")
}

#[cfg(unix)]
fn set_mode(dir: &Dir, name: &str, mode: u32) -> std::io::Result<()> {
    dir.set_permissions(name, Permissions::from_mode(mode))
}

/// Windows has no mode bits; the files this crate writes are already writable.
#[cfg(windows)]
#[allow(
    clippy::unnecessary_wraps,
    reason = "same signature as the Unix version"
)]
fn set_mode(_dir: &Dir, _name: &str, _mode: u32) -> std::io::Result<()> {
    Ok(())
}

fn open_parent(root: &Dir, path: &str) -> Outcome<Dir> {
    let mut dir = root.try_clone().map_err(|error| io_failure(path, &error))?;
    let mut segments: Vec<&str> = path.split('/').collect();
    segments.pop();
    for segment in segments {
        match dir.symlink_metadata(segment) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
            Ok(_) => return Err(collision(path, "a link or file is in the way")),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                match dir.create_dir(segment) {
                    Ok(()) => {
                        set_mode(&dir, segment, 0o755).map_err(|error| io_failure(path, &error))?
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                    Err(error) => return Err(io_failure(path, &error)),
                }
            }
            Err(error) => return Err(io_failure(path, &error)),
        }
        let metadata = dir
            .symlink_metadata(segment)
            .map_err(|error| io_failure(path, &error))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(collision(path, "a link or file is in the way"));
        }
        dir = dir
            .open_dir(segment)
            .map_err(|error| io_failure(path, &error))?;
    }
    Ok(dir)
}

fn write_file(dir: &Dir, output: &Path, path: &str, bytes: &[u8]) -> Outcome<()> {
    let name = crate::paths::file_name(path);
    match dir.symlink_metadata(name) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
            let existing = dir.read(name).map_err(|error| io_failure(path, &error))?;
            return if existing == bytes {
                Ok(())
            } else {
                Err(collision(path, "a file with other bytes is in the way"))
            };
        }
        Ok(_) => return Err(collision(path, "a link or directory is in the way")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(io_failure(path, &error)),
    }
    let serial = TEMP_SERIAL.fetch_add(1, Ordering::Relaxed);
    let temp = format!(".{name}.prism-kicad-{}-{serial}.tmp", std::process::id());
    let temp_path = output
        .join(Path::new(path).parent().unwrap_or_else(|| Path::new("")))
        .join(&temp);
    crate::temp::register(temp_path.clone());
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    let result = (|| -> std::io::Result<()> {
        let mut file = dir.open_with(&temp, &options)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        set_mode(dir, &temp, 0o644)?;
        dir.rename(&temp, dir, name)
    })();
    if let Err(error) = result {
        let _ = dir.remove_file(&temp);
        crate::temp::unregister(&temp_path);
        return Err(io_failure(path, &error));
    }
    crate::temp::unregister(&temp_path);
    Ok(())
}

/// Extract `paths` of `reader` below `output`, which must be an existing
/// directory.
pub fn extract<R: ReadAt>(
    reader: &BundleReader<R>,
    paths: &[String],
    output: &Path,
) -> Outcome<Vec<Extracted>> {
    let metadata = std::fs::metadata(output);
    if !metadata.is_ok_and(|metadata| metadata.is_dir()) {
        return Err(Failure::output(
            "output-not-directory",
            "the output is not an existing directory",
        )
        .argument("output"));
    }
    let root = Dir::open_ambient_dir(output, ambient_authority())
        .map_err(|error| io_failure("the output directory", &error))?;
    let mut extracted = Vec::with_capacity(paths.len());
    for path in paths {
        let bytes = match reader.member(path) {
            Some(Ok(bytes)) => bytes,
            Some(Err(finding)) => return Err(invalid(finding)),
            None => {
                return Err(Failure::precondition(
                    "member-not-found",
                    format!("{path} is not a member"),
                ));
            }
        };
        let dir = open_parent(&root, path)?;
        write_file(&dir, output, path, &bytes)?;
        extracted.push(Extracted {
            path: path.clone(),
            bytes: u64::try_from(bytes.len()).unwrap_or(u64::MAX),
            sha256: sha256_hex(&bytes),
        });
    }
    Ok(extracted)
}

fn invalid(finding: Finding) -> Failure {
    let mut failure = Failure::input(
        "bundle-invalid",
        format!("the bundle is invalid: {}", finding.message),
    )
    .argument("bundle");
    failure.finding.location = finding.location;
    failure
}
