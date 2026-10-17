//! The key entry of each source member (bundle-format.md §2.2, cli-spec.md
//! §5.2.2 "Key entries"): copied from `--key-record`, or computed for a local
//! build without one.

use super::internal;
use super::parse::member;
use crate::finding::{Failure, Outcome};
use crate::manifest::a3;
use crate::paths::is_within;
use crate::revision_key::ObjectFormat;
use prism_kicad_contracts::generated::prism_revision_key_record_a1 as rk;
use std::collections::BTreeMap;

/// The key entries of a record, by path.
fn key_entries(record: &rk::RevisionKeyRecordA1) -> BTreeMap<&str, &rk::RevisionKeyEntry> {
    record
        .entries
        .iter()
        .map(|entry| (entry.path.0.as_str(), entry))
        .collect()
}

pub(super) fn source_entry(
    path: &str,
    bytes: &[u8],
    executable: bool,
    record: Option<&rk::RevisionKeyRecordA1>,
) -> Outcome<a3::BundleManifestSourceEntry> {
    let kind = if executable {
        rk::RevisionKeyEntryKind::Executable
    } else {
        rk::RevisionKeyEntryKind::Regular
    };
    let Some(record) = record else {
        return entry_json(path, kind, &ObjectFormat::Sha1.blob_id(bytes), None);
    };
    let entries = key_entries(record);
    if let Some(entry) = entries.get(path)
        && matches!(
            entry.kind,
            rk::RevisionKeyEntryKind::Regular | rk::RevisionKeyEntryKind::Executable
        )
    {
        return entry_json(path, entry.kind, &entry.object_id.0, None);
    }
    let format = match record.object_format {
        rk::RevisionKeyObjectFormat::Sha1 => ObjectFormat::Sha1,
        rk::RevisionKeyObjectFormat::Sha256 => ObjectFormat::Sha256,
    };
    let gitlink = record.entries.iter().find(|entry| {
        entry.kind == rk::RevisionKeyEntryKind::Gitlink
            && is_within(path, &entry.path.0)
            && entry.path.0 != path
    });
    match gitlink {
        Some(gitlink) => entry_json(path, kind, &format.blob_id(bytes), Some(&gitlink.path.0)),
        None => Err(Failure::precondition(
            "revision-key-mismatch",
            format!("{} has no entry in --key-record", member(path)),
        )
        .argument("key-record")
        .at_path(member(path))),
    }
}

pub(super) fn upgrade_invalid(message: String) -> Failure {
    Failure::input("upgrade-record-invalid", message).argument("upgraded")
}

fn entry_json(
    path: &str,
    kind: rk::RevisionKeyEntryKind,
    object_id: &str,
    gitlink: Option<&str>,
) -> Outcome<a3::BundleManifestSourceEntry> {
    let mut value = serde_json::json!({ "path": path, "kind": kind, "object_id": object_id });
    if let Some(gitlink) = gitlink {
        value["gitlink"] = gitlink.into();
    }
    serde_json::from_value(value).map_err(internal)
}
