//! The manifest's read set (bundle-format.md §2.3): canonical order (I13),
//! the design key it feeds (`prism.semantic_index.a2` `designKey`), and the
//! check against the build's own key record that stage parse performs before
//! it writes the archive (I14, cli-spec.md §5.10 conditions 4–7).
//!
//! [`check`] is the function `prism-kicad bundle reuse` reuses for conditions
//! 4–7 of cli-spec.md §5.10; step C adds conditions 1–3 (config, generator,
//! model-unavailable) around it.

use crate::manifest::{SOURCES_PREFIX, a3, is_source_role};
use crate::paths::is_within;
use crate::stages::MemberData;
use crate::stages::sources::{ReadSet, name_matches};
use prism_kicad_contracts::generated::prism_cli_reuse_result_a0::CliReuseCondition;
use prism_kicad_contracts::generated::prism_revision_key_record_a1 as rk;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

/// The repository path of a source member, or `None` for a derived member.
fn source_path(member: &MemberData) -> Option<&str> {
    if !is_source_role(member.role) {
        return None;
    }
    member.path.strip_prefix(SOURCES_PREFIX)
}

/// Whether `directory` (a listing's directory, `""` = root) holds `path` at
/// any depth.
fn reaches(directory: &str, path: &str) -> bool {
    if directory.is_empty() {
        !path.is_empty()
    } else {
        is_within(path, directory)
    }
}

/// The canonical read set: `tree`'s recording, without a probe that names a
/// source member's path (I13), with the gitlinks `record` adds, sorted and
/// free of duplicates.
#[must_use]
pub fn complete(
    tree: &ReadSet,
    members: &[MemberData],
    record: Option<&rk::RevisionKeyRecordA1>,
) -> ReadSet {
    let member_paths: BTreeSet<&str> = members.iter().filter_map(|m| source_path(m)).collect();
    let mut probes: Vec<_> = tree
        .probes
        .iter()
        .filter(|probe| !member_paths.contains(probe.path.as_str()))
        .cloned()
        .collect();
    probes.sort_by(|a, b| a.path.cmp(&b.path));
    probes.dedup_by(|a, b| a.path == b.path);
    let mut listings = tree.listings.clone();
    listings.sort();
    listings.dedup();
    let gitlinks = record.map_or_else(Vec::new, |record| {
        gitlinks(record, members, &probes, &listings)
    });
    ReadSet {
        probes,
        listings,
        gitlinks,
    }
}

/// Every gitlink of `record` a source member's `source.gitlink`, a probe or a
/// listing reached into, sorted by path without duplicates.
fn gitlinks(
    record: &rk::RevisionKeyRecordA1,
    members: &[MemberData],
    probes: &[crate::stages::sources::Probe],
    listings: &[crate::stages::sources::Listing],
) -> Vec<crate::stages::sources::Gitlink> {
    let member_gitlinks: BTreeSet<&str> = members
        .iter()
        .filter_map(|member| member.source.as_ref()?.gitlink.as_ref())
        .map(|gitlink| gitlink.0.as_str())
        .collect();
    let mut found: Vec<_> = record
        .entries
        .iter()
        .filter(|entry| entry.kind == rk::RevisionKeyEntryKind::Gitlink)
        .filter(|entry| {
            let path = entry.path.0.as_str();
            if member_gitlinks.contains(path) {
                return true;
            }
            let near =
                |other: &str| path == other || is_within(path, other) || is_within(other, path);
            if probes.iter().any(|probe| near(&probe.path)) {
                return true;
            }
            listings.iter().any(|listing| {
                reaches(&listing.directory, path) || is_within(&listing.directory, path)
            })
        })
        .map(|entry| crate::stages::sources::Gitlink {
            path: entry.path.0.clone(),
            commit: entry.object_id.0.clone(),
        })
        .collect();
    found.sort_by(|a, b| a.path.cmp(&b.path));
    found.dedup_by(|a, b| a.path == b.path);
    found
}

/// The read set as the manifest's JSON form.
#[must_use]
pub fn contract(read_set: &ReadSet) -> a3::BundleManifestReadSet {
    a3::BundleManifestReadSet {
        probes: read_set
            .probes
            .iter()
            .map(|probe| a3::BundleManifestProbe {
                path: a3::RepoPath(probe.path.clone()),
                present: probe.present,
            })
            .collect(),
        listings: read_set
            .listings
            .iter()
            .map(|listing| a3::BundleManifestListing {
                directory: if listing.directory.is_empty() {
                    a3::BundleManifestListingDirectory::String(String::new())
                } else {
                    a3::BundleManifestListingDirectory::RepoPath(a3::RepoPath(
                        listing.directory.clone(),
                    ))
                },
                suffixes: listing
                    .suffixes
                    .iter()
                    .map(|suffix| a3::BundleManifestListingSuffix(suffix.clone()))
                    .collect(),
                paths: listing
                    .paths
                    .iter()
                    .map(|path| a3::RepoPath(path.clone()))
                    .collect(),
            })
            .collect(),
        gitlinks: read_set
            .gitlinks
            .iter()
            .map(|gitlink| a3::BundleManifestGitlink {
                path: a3::RepoPath(gitlink.path.clone()),
                commit: a3::GitObjectId(gitlink.commit.clone()),
            })
            .collect(),
    }
}

/// `designKey` (bundle-format.md §2.3): `SHA-256("prism.design_key.a0" NUL
/// config_digest NUL R)`, where `R` streams the source members, probes,
/// listings and gitlinks into the hash. `config_digest` is the key record's,
/// or [`crate::revision_key::config_digest`]'s canonical-config digest without
/// one.
#[must_use]
pub fn design_key(config_digest: &str, members: &[MemberData], read_set: &ReadSet) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"prism.design_key.a0");
    hasher.update([0]);
    hasher.update(config_digest.as_bytes());
    hasher.update([0]);
    let mut sources: Vec<&MemberData> = members
        .iter()
        .filter(|member| is_source_role(member.role))
        .collect();
    sources.sort_by(|a, b| a.path.cmp(&b.path));
    for member in sources {
        let Some(source) = &member.source else {
            continue;
        };
        hasher.update(b"read\t");
        hasher.update(source.path.0.as_bytes());
        hasher.update(b"\t");
        hasher.update(source.kind.to_string().as_bytes());
        hasher.update(b"\t");
        hasher.update(source.object_id.0.as_bytes());
        if let Some(gitlink) = &source.gitlink {
            hasher.update(b"\tgitlink\t");
            hasher.update(gitlink.0.as_bytes());
        }
        hasher.update([0]);
    }
    for probe in &read_set.probes {
        hasher.update(b"probe\t");
        hasher.update(probe.path.as_bytes());
        hasher.update(b"\t");
        hasher.update(if probe.present {
            &b"present"[..]
        } else {
            &b"absent"[..]
        });
        hasher.update([0]);
    }
    for listing in &read_set.listings {
        hasher.update(b"list\t");
        hasher.update(listing.directory.as_bytes());
        hasher.update(b"\t");
        hasher.update(listing.suffixes.join(",").as_bytes());
        hasher.update(b"\t");
        hasher.update(listing.paths.join("\t").as_bytes());
        hasher.update([0]);
    }
    for gitlink in &read_set.gitlinks {
        hasher.update(b"gitlink\t");
        hasher.update(gitlink.path.as_bytes());
        hasher.update(b"\t");
        hasher.update(gitlink.commit.as_bytes());
        hasher.update([0]);
    }
    crate::generator::hex(&hasher.finalize())
}

/// A read set that does not hold in a key record (cli-spec.md §5.10
/// conditions 4–7).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Mismatch {
    /// The first condition, in the spec's order, that failed.
    pub condition: CliReuseCondition,
    /// The repository path the condition failed on, the first in code point
    /// order.
    pub path: String,
    /// One sentence for logs.
    pub message: String,
}

fn entry_of<'a>(
    record: &'a rk::RevisionKeyRecordA1,
    path: &str,
    kinds: &[rk::RevisionKeyEntryKind],
) -> Option<&'a rk::RevisionKeyEntry> {
    record
        .entries
        .iter()
        .find(|entry| entry.path.0 == path && kinds.contains(&entry.kind))
}

/// Check the read set against `record`: conditions 4–7 of cli-spec.md §5.10,
/// in order, each on the first failing path in code point order. `bundle
/// reuse` calls this for a stored manifest; stage parse calls it before
/// writing, where a `Some` result is I14, a defect (exit 1, `internal`).
#[must_use]
pub fn check(
    read_set: &ReadSet,
    members: &[MemberData],
    record: &rk::RevisionKeyRecordA1,
) -> Option<Mismatch> {
    check_reads(members, record)
        .or_else(|| check_probes(read_set, record))
        .or_else(|| check_listings(read_set, record))
        .or_else(|| check_gitlinks(read_set, record))
}

/// Whether `path` lies inside a read-set gitlink's working tree.
fn below_gitlink(read_set: &ReadSet, path: &str) -> bool {
    read_set
        .gitlinks
        .iter()
        .any(|gitlink| is_within(path, &gitlink.path))
}

/// Condition 4: every source member is an entry of the record.
fn check_reads(members: &[MemberData], record: &rk::RevisionKeyRecordA1) -> Option<Mismatch> {
    let mut sources: Vec<&MemberData> = members
        .iter()
        .filter(|member| is_source_role(member.role))
        .collect();
    sources.sort_by(|a, b| a.path.cmp(&b.path));
    for member in &sources {
        let Some(source) = &member.source else {
            continue;
        };
        let ok = match &source.gitlink {
            Some(gitlink) => {
                entry_of(record, &gitlink.0, &[rk::RevisionKeyEntryKind::Gitlink]).is_some()
            }
            None => entry_of(
                record,
                &source.path.0,
                &[
                    rk::RevisionKeyEntryKind::Regular,
                    rk::RevisionKeyEntryKind::Executable,
                ],
            )
            .is_some_and(|entry| {
                entry.kind.to_string() == source.kind.to_string()
                    && entry.object_id.0 == source.object_id.0
            }),
        };
        if !ok {
            return Some(Mismatch {
                condition: CliReuseCondition::Read,
                path: source.path.0.clone(),
                message: format!(
                    "the source member sources/{} is not the entry the key record has",
                    source.path.0
                ),
            });
        }
    }
    None
}

/// Condition 5: the record holds each probed path exactly when it is present.
fn check_probes(read_set: &ReadSet, record: &rk::RevisionKeyRecordA1) -> Option<Mismatch> {
    for probe in &read_set.probes {
        if below_gitlink(read_set, &probe.path) {
            continue;
        }
        let present = entry_of(
            record,
            &probe.path,
            &[
                rk::RevisionKeyEntryKind::Regular,
                rk::RevisionKeyEntryKind::Executable,
            ],
        )
        .is_some();
        if present != probe.present {
            return Some(Mismatch {
                condition: CliReuseCondition::Probe,
                path: probe.path.clone(),
                message: format!(
                    "the probe {} is {} in the read set but {} in the key record",
                    probe.path,
                    if probe.present { "present" } else { "absent" },
                    if present { "present" } else { "absent" }
                ),
            });
        }
    }
    None
}

/// Condition 6: evaluating each listing on the record returns its paths.
fn check_listings(read_set: &ReadSet, record: &rk::RevisionKeyRecordA1) -> Option<Mismatch> {
    for listing in &read_set.listings {
        let mut expected: Vec<String> = record
            .entries
            .iter()
            .filter(|entry| {
                matches!(
                    entry.kind,
                    rk::RevisionKeyEntryKind::Regular | rk::RevisionKeyEntryKind::Executable
                )
            })
            .map(|entry| entry.path.0.clone())
            .filter(|path| reaches(&listing.directory, path))
            .filter(|path| listing.suffixes.is_empty() || name_matches(path, &listing.suffixes))
            .filter(|path| !below_gitlink(read_set, path))
            .collect();
        expected.sort();
        expected.dedup();
        let actual: Vec<String> = listing
            .paths
            .iter()
            .filter(|path| !below_gitlink(read_set, path))
            .cloned()
            .collect();
        if expected != actual {
            let path = expected
                .iter()
                .chain(actual.iter())
                .min()
                .cloned()
                .unwrap_or_default();
            return Some(Mismatch {
                condition: CliReuseCondition::Listing,
                path,
                message: format!(
                    "the listing of {} does not return the same paths in the key record",
                    if listing.directory.is_empty() {
                        "the repository root"
                    } else {
                        &listing.directory
                    }
                ),
            });
        }
    }
    None
}

/// Condition 7: each read-set gitlink is in the record with the same commit,
/// and no record gitlink lies below a listing the read set did not list.
fn check_gitlinks(read_set: &ReadSet, record: &rk::RevisionKeyRecordA1) -> Option<Mismatch> {
    for gitlink in &read_set.gitlinks {
        let ok = entry_of(record, &gitlink.path, &[rk::RevisionKeyEntryKind::Gitlink])
            .is_some_and(|entry| entry.object_id.0 == gitlink.commit);
        if !ok {
            return Some(Mismatch {
                condition: CliReuseCondition::Gitlink,
                path: gitlink.path.clone(),
                message: format!(
                    "the gitlink {} is not in the key record with the same commit",
                    gitlink.path
                ),
            });
        }
    }
    let listed: BTreeSet<&str> = read_set
        .gitlinks
        .iter()
        .map(|gitlink| gitlink.path.as_str())
        .collect();
    for listing in &read_set.listings {
        let stray = record
            .entries
            .iter()
            .filter(|entry| entry.kind == rk::RevisionKeyEntryKind::Gitlink)
            .map(|entry| entry.path.0.as_str())
            .filter(|path| reaches(&listing.directory, path))
            .filter(|path| !listed.contains(path))
            .min();
        if let Some(path) = stray {
            return Some(Mismatch {
                condition: CliReuseCondition::Gitlink,
                path: path.to_owned(),
                message: format!(
                    "the listing of {} reaches the gitlink {path}, which the read set does not list",
                    if listing.directory.is_empty() {
                        "the repository root"
                    } else {
                        &listing.directory
                    }
                ),
            });
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::Role;
    use crate::stages::sources::{Gitlink, Listing, Probe};
    use std::sync::Arc;

    /// The committed revision-key record example: nine regular entries, no
    /// gitlink.
    fn record() -> rk::RevisionKeyRecordA1 {
        serde_json::from_str(include_str!(
            "../../../../contracts/prism/examples/RevisionKeyRecordA1.example.json"
        ))
        .unwrap()
    }

    fn key_entry(record: &rk::RevisionKeyRecordA1, path: &str) -> rk::RevisionKeyEntry {
        record
            .entries
            .iter()
            .find(|entry| entry.path.0 == path)
            .unwrap()
            .clone()
    }

    /// A source member whose key entry mirrors `entry`.
    fn member_of(entry: &rk::RevisionKeyEntry) -> MemberData {
        MemberData {
            path: format!("sources/{}", entry.path.0),
            role: Role::SourceProject,
            bytes: Arc::from(Vec::<u8>::new()),
            schema: None,
            source: Some(a3::BundleManifestSourceEntry {
                path: a3::RepoPath(entry.path.0.clone()),
                kind: entry.kind.to_string().parse().unwrap(),
                object_id: a3::GitObjectId(entry.object_id.0.clone()),
                gitlink: None,
                upgraded_from_version: None,
            }),
        }
    }

    fn source_member(path: &str, kind: a3::RevisionKeyEntryKind, object_id: &str) -> MemberData {
        MemberData {
            path: format!("{SOURCES_PREFIX}{path}"),
            role: Role::SourceProject,
            bytes: Arc::from(Vec::<u8>::new()),
            schema: None,
            source: Some(a3::BundleManifestSourceEntry {
                path: a3::RepoPath(path.to_owned()),
                kind,
                object_id: a3::GitObjectId(object_id.to_owned()),
                gitlink: None,
                upgraded_from_version: None,
            }),
        }
    }

    #[test]
    fn complete_drops_member_probes_and_orders_the_sets() {
        let tree = ReadSet {
            probes: vec![
                Probe {
                    path: "z.kicad_dru".to_owned(),
                    present: false,
                },
                Probe {
                    path: "proj.kicad_pro".to_owned(),
                    present: true,
                },
                Probe {
                    path: "a.kicad_dru".to_owned(),
                    present: true,
                },
            ],
            listings: vec![
                Listing {
                    directory: "b".to_owned(),
                    suffixes: vec![".b".to_owned()],
                    paths: Vec::new(),
                },
                Listing {
                    directory: "a".to_owned(),
                    suffixes: vec![".a".to_owned()],
                    paths: Vec::new(),
                },
            ],
            gitlinks: Vec::new(),
        };
        let members = vec![source_member(
            "proj.kicad_pro",
            a3::RevisionKeyEntryKind::Regular,
            &"0".repeat(40),
        )];
        let complete = complete(&tree, &members, None);
        assert_eq!(
            complete
                .probes
                .iter()
                .map(|probe| probe.path.as_str())
                .collect::<Vec<_>>(),
            vec!["a.kicad_dru", "z.kicad_dru"],
            "the member probe is dropped and the rest sorted"
        );
        assert_eq!(
            complete
                .listings
                .iter()
                .map(|listing| listing.directory.as_str())
                .collect::<Vec<_>>(),
            vec!["a", "b"]
        );
        assert!(complete.gitlinks.is_empty());
    }

    #[test]
    fn check_accepts_the_matching_read_set() {
        let record = record();
        let members = vec![member_of(&key_entry(
            &record,
            "USB-PD-Trigger-Board.kicad_pro",
        ))];
        assert_eq!(check(&ReadSet::default(), &members, &record), None);
    }

    #[test]
    fn check_rejects_a_read_that_is_not_in_the_record() {
        let record = record();
        let members = vec![source_member(
            "ghost.kicad_sch",
            a3::RevisionKeyEntryKind::Regular,
            &"0".repeat(40),
        )];
        let mismatch = check(&ReadSet::default(), &members, &record).unwrap();
        assert_eq!(mismatch.condition, CliReuseCondition::Read);
        assert_eq!(mismatch.path, "ghost.kicad_sch");
    }

    #[test]
    fn check_rejects_a_probe_the_record_contradicts() {
        let record = record();
        let members = vec![member_of(&key_entry(
            &record,
            "USB-PD-Trigger-Board.kicad_pro",
        ))];
        // The path is a regular entry, so a probe saying it is absent fails.
        let read_set = ReadSet {
            probes: vec![Probe {
                path: "USB-PD-Trigger-Board.kicad_pro".to_owned(),
                present: false,
            }],
            ..ReadSet::default()
        };
        let mismatch = check(&read_set, &members, &record).unwrap();
        assert_eq!(mismatch.condition, CliReuseCondition::Probe);
        assert_eq!(mismatch.path, "USB-PD-Trigger-Board.kicad_pro");
    }

    #[test]
    fn check_rejects_a_listing_that_returns_other_paths() {
        let record = record();
        let members = vec![member_of(&key_entry(
            &record,
            "USB-PD-Trigger-Board.kicad_pro",
        ))];
        // The root listing returns every regular entry; an empty answer fails.
        let read_set = ReadSet {
            listings: vec![Listing {
                directory: String::new(),
                suffixes: Vec::new(),
                paths: Vec::new(),
            }],
            ..ReadSet::default()
        };
        let mismatch = check(&read_set, &members, &record).unwrap();
        assert_eq!(mismatch.condition, CliReuseCondition::Listing);
    }

    #[test]
    fn check_rejects_a_gitlink_the_record_does_not_hold() {
        let record = record();
        let members = vec![member_of(&key_entry(
            &record,
            "USB-PD-Trigger-Board.kicad_pro",
        ))];
        let read_set = ReadSet {
            gitlinks: vec![Gitlink {
                path: "vendor/footprints".to_owned(),
                commit: "0".repeat(40),
            }],
            ..ReadSet::default()
        };
        let mismatch = check(&read_set, &members, &record).unwrap();
        assert_eq!(mismatch.condition, CliReuseCondition::Gitlink);
        assert_eq!(mismatch.path, "vendor/footprints");
    }

    #[test]
    fn check_rejects_a_record_gitlink_a_listing_reaches() {
        let mut record = record();
        record.entries.push(rk::RevisionKeyEntry {
            path: rk::RepoPath("vendor/footprints".to_owned()),
            kind: rk::RevisionKeyEntryKind::Gitlink,
            object_id: rk::GitObjectId("4c6e735ea5e5d28ea90a1294ab45bf2b367a6ac0".to_owned()),
            category: rk::RevisionKeySourceCategory::Footprint,
        });
        let members = vec![member_of(&key_entry(
            &record,
            "USB-PD-Trigger-Board.kicad_pro",
        ))];
        // The listing returns exactly the record's regular entries, so only the
        // second gitlink clause can fail: the root listing reaches the gitlink,
        // which the read set does not list.
        let mut paths: Vec<String> = record
            .entries
            .iter()
            .filter(|entry| {
                matches!(
                    entry.kind,
                    rk::RevisionKeyEntryKind::Regular | rk::RevisionKeyEntryKind::Executable
                )
            })
            .map(|entry| entry.path.0.clone())
            .collect();
        paths.sort();
        let read_set = ReadSet {
            listings: vec![Listing {
                directory: String::new(),
                suffixes: Vec::new(),
                paths,
            }],
            ..ReadSet::default()
        };
        let mismatch = check(&read_set, &members, &record).unwrap();
        assert_eq!(mismatch.condition, CliReuseCondition::Gitlink);
        assert_eq!(mismatch.path, "vendor/footprints");
    }

    #[test]
    fn design_key_matches_the_hand_written_preimage() {
        // Written out byte by byte, the preimage of bundle-format.md §2.3:
        // one source member, one absent probe, one root listing.
        let config_digest = "cd".repeat(32);
        let object_id = "12".repeat(20);
        let mut preimage = Vec::new();
        preimage.extend_from_slice(b"prism.design_key.a0");
        preimage.push(0);
        preimage.extend_from_slice(config_digest.as_bytes());
        preimage.push(0);
        preimage.extend_from_slice(b"read\tproj.kicad_pro\tregular\t");
        preimage.extend_from_slice(object_id.as_bytes());
        preimage.push(0);
        preimage.extend_from_slice(b"probe\tfp-lib-table\tabsent");
        preimage.push(0);
        preimage.extend_from_slice(b"list\t\t.kicad_jobset\t");
        preimage.push(0);
        let expected = Sha256::digest(&preimage);

        let members = vec![source_member(
            "proj.kicad_pro",
            a3::RevisionKeyEntryKind::Regular,
            &object_id,
        )];
        let read_set = ReadSet {
            probes: vec![Probe {
                path: "fp-lib-table".to_owned(),
                present: false,
            }],
            listings: vec![Listing {
                directory: String::new(),
                suffixes: vec![".kicad_jobset".to_owned()],
                paths: Vec::new(),
            }],
            gitlinks: Vec::new(),
        };
        let digest = design_key(&config_digest, &members, &read_set);
        assert_eq!(digest, crate::generator::hex(&expected));
        assert_eq!(
            digest,
            "701c5d6dbb4bce45e93cf79b45be0fd527ebb4acd10a9747e3a788eb4ff3d7fc"
        );
    }
}
