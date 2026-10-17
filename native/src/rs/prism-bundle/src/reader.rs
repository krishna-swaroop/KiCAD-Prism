//! Opening a `.prism` archive: the reader validation of bundle-format.md §9.
//!
//! [`BundleReader::open`] runs steps 1–4 (container, central directory and
//! local headers, manifest, listing) and rejects the archive on the first
//! failure. [`BundleReader::member`] runs step 6 for one member (inflate
//! bounded by its size, CRC-32, SHA-256) and [`check_structured`] step 7.
//! Step 5, the bundle key the caller expected, is the caller's: compare
//! [`BundleReader::manifest`]'s `bundle_key` with the key you asked for.

use crate::finding::{Failure, Finding, Location};
use crate::generator::sha256_hex;
use crate::json_scan::{JsonBound, scan};
use crate::limits::{LimitName, Limits};
use crate::manifest::{
    DESIGN_SCHEMA, MANIFEST_PATH, MANIFEST_SCHEMA, MATERIALIZATION_SCHEMA, Manifest, a3,
};
use crate::zip::{Entry, ReadAt, ZipError, ZipIndex};
use serde_json::Value;

/// Why an archive was rejected on open.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OpenError {
    /// Its structure (step 1–2) or a limit.
    Zip(ZipError),
    /// `bundle.json` is not `prism.bundle.manifest.a3` (`manifest-unsupported`).
    Unsupported(Finding),
    /// `bundle.json` is invalid (`manifest-invalid`) or over a JSON limit.
    Manifest(ZipError),
    /// The entries differ from the manifest's member list (step 4).
    Listing(Vec<Finding>),
}

impl OpenError {
    /// Every finding this error reports.
    #[must_use]
    pub fn findings(&self) -> Vec<Finding> {
        match self {
            Self::Zip(error) | Self::Manifest(error) => vec![error.finding()],
            Self::Unsupported(finding) => vec![finding.clone()],
            Self::Listing(findings) => findings.clone(),
        }
    }

    /// The failure `--in` and `extract` report (cli-spec.md §5.2.1, §5.4):
    /// exit 7 `manifest-unsupported`, exit 4 for a limit, else exit 3
    /// `bundle-invalid` with the first finding's location.
    #[must_use]
    pub fn failure(&self, argument: &'static str) -> Failure {
        match self {
            Self::Unsupported(finding) => {
                Failure::precondition("manifest-unsupported", finding.message.clone())
                    .argument(argument)
            }
            Self::Zip(ZipError::Limit(failure)) | Self::Manifest(ZipError::Limit(failure)) => {
                failure.clone().argument(argument)
            }
            other => {
                let first = other
                    .findings()
                    .into_iter()
                    .next()
                    .unwrap_or_else(|| Finding::new("zip-malformed", "the bundle is invalid"));
                let mut failure = Failure::input(
                    "bundle-invalid",
                    format!("the bundle is invalid: {}", first.message),
                )
                .argument(argument);
                failure.finding.location = first.location;
                failure
            }
        }
    }
}

/// The parsed manifest and its exact bytes.
#[derive(Clone, Debug)]
pub struct ManifestRead {
    /// The bytes of `bundle.json`.
    pub bytes: Vec<u8>,
    /// As JSON.
    pub value: Value,
    /// As the generated contract.
    pub manifest: Manifest,
}

fn manifest_finding(code: &str, message: String, pointer: Option<String>) -> ZipError {
    let mut finding = Finding::new(code, message);
    finding.location = Some(match pointer {
        Some(pointer) => Location::pointer(Some(MANIFEST_PATH.to_owned()), pointer),
        None => Location::path(MANIFEST_PATH),
    });
    ZipError::Finding(finding)
}

/// Bounds of a JSON document: depth always, nodes when `nodes` is set.
pub fn json_bounds(bytes: &[u8], limits: &Limits, nodes: bool, path: &str) -> Result<(), Failure> {
    let max_nodes = nodes.then(|| limits.get_usize(LimitName::MaxJsonNodes));
    scan(bytes, limits.get_usize(LimitName::MaxJsonDepth), max_nodes).map_err(|bound| {
        let name = match bound {
            JsonBound::Depth => LimitName::MaxJsonDepth,
            JsonBound::Nodes => LimitName::MaxJsonNodes,
        };
        limits.exceeded(name, None, path).at_path(path.to_owned())
    })
}

/// Read and validate `bundle.json`, the archive's first entry (step 3).
pub fn read_manifest<R: ReadAt + ?Sized>(
    source: &R,
    index: &ZipIndex,
    limits: &Limits,
) -> Result<ManifestRead, OpenError> {
    let first = index
        .entries
        .first()
        .filter(|entry| entry.name == MANIFEST_PATH)
        .ok_or_else(|| {
            OpenError::Manifest(manifest_finding(
                "manifest-invalid",
                "the first entry is not bundle.json".to_owned(),
                None,
            ))
        })?;
    let bytes = index.read(source, first).map_err(OpenError::Manifest)?;
    let invalid = |message: String, pointer: Option<String>| {
        OpenError::Manifest(manifest_finding("manifest-invalid", message, pointer))
    };
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) || std::str::from_utf8(&bytes).is_err() {
        return Err(invalid(
            "bundle.json is not UTF-8 without a BOM".to_owned(),
            None,
        ));
    }
    json_bounds(&bytes, limits, true, MANIFEST_PATH)
        .map_err(|failure| OpenError::Manifest(ZipError::Limit(failure)))?;
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|error| invalid(format!("bundle.json is not JSON: {error}"), None))?;
    let schema = value
        .get("schema")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if schema != MANIFEST_SCHEMA {
        let version = value.get("version").and_then(Value::as_str);
        let named = match version {
            Some(version) => format!("{schema} {version}"),
            None => schema.to_owned(),
        };
        return Err(OpenError::Unsupported(
            Finding::new(
                "manifest-unsupported",
                format!(
                    "bundle.json is {named:?}, not {MANIFEST_SCHEMA}; the bundle needs a rebuild"
                ),
            )
            .at_path(MANIFEST_PATH),
        ));
    }
    crate::schema::validate(MANIFEST_SCHEMA, &value)
        .map_err(|violation| invalid(violation.message, Some(violation.pointer)))?;
    let manifest: Manifest = serde_json::from_value(value.clone())
        .map_err(|error| invalid(format!("bundle.json does not decode: {error}"), None))?;
    Ok(ManifestRead {
        bytes,
        value,
        manifest,
    })
}

/// Compare the entries after `bundle.json` with the manifest's members, one
/// to one and in order (step 4).
#[must_use]
pub fn check_listing(index: &ZipIndex, manifest: &Manifest) -> Vec<Finding> {
    let entries: Vec<&str> = index
        .entries
        .iter()
        .skip(1)
        .map(|entry| entry.name.as_str())
        .collect();
    let listed: Vec<&str> = manifest
        .members
        .iter()
        .map(|member| member.path.as_str())
        .collect();
    let mut findings = Vec::new();
    for path in &listed {
        if !entries.contains(path) {
            findings.push(
                Finding::new(
                    "member-missing",
                    format!("{path} is listed but not in the archive"),
                )
                .at_path(*path),
            );
        }
    }
    for name in &entries {
        if !listed.contains(name) {
            findings.push(
                Finding::new(
                    "member-unlisted",
                    format!("{name} is in the archive but not listed"),
                )
                .at_path(*name),
            );
        }
    }
    if findings.is_empty() && entries != listed {
        let at = entries
            .iter()
            .zip(&listed)
            .find(|(entry, member)| entry != member)
            .map_or(String::new(), |(entry, _)| (*entry).to_owned());
        findings.push(
            Finding::new(
                "member-order",
                "the archive's entries are not in the manifest's member order",
            )
            .at_path(at),
        );
    }
    findings
}

/// An opened archive whose structure, manifest and listing are valid.
pub struct BundleReader<R: ReadAt> {
    source: R,
    index: ZipIndex,
    manifest: ManifestRead,
}

impl<R: ReadAt> BundleReader<R> {
    /// Open `source` (bundle-format.md §9 steps 1–4).
    pub fn open(source: R, limits: &Limits) -> Result<Self, OpenError> {
        let index = ZipIndex::open(&source, limits).map_err(OpenError::Zip)?;
        let manifest = read_manifest(&source, &index, limits)?;
        let listing = check_listing(&index, &manifest.manifest);
        if !listing.is_empty() {
            return Err(OpenError::Listing(listing));
        }
        for member in &manifest.manifest.members {
            let declared = index.entry(&member.path).map_or(0, |entry| entry.size);
            if declared != member.bytes.0 {
                return Err(OpenError::Listing(vec![size_finding(member, declared)]));
            }
        }
        Ok(Self {
            source,
            index,
            manifest,
        })
    }

    /// The manifest.
    #[must_use]
    pub fn manifest(&self) -> &Manifest {
        &self.manifest.manifest
    }

    /// The manifest as read: bytes, JSON and contract.
    #[must_use]
    pub fn manifest_read(&self) -> &ManifestRead {
        &self.manifest
    }

    /// The checked zip entries.
    #[must_use]
    pub fn index(&self) -> &ZipIndex {
        &self.index
    }

    /// The bytes of member `path`, checked against the manifest (step 6).
    /// `None` when the bundle has no such member.
    pub fn member(&self, path: &str) -> Option<Result<Vec<u8>, Finding>> {
        if path == MANIFEST_PATH {
            return Some(Ok(self.manifest.bytes.clone()));
        }
        let listed = self
            .manifest
            .manifest
            .members
            .iter()
            .find(|member| member.path.as_str() == path)?;
        let entry = self.index.entry(path)?;
        Some(read_checked(&self.source, &self.index, entry, listed))
    }

    /// The underlying bytes.
    pub fn source(&self) -> &R {
        &self.source
    }
}

fn size_finding(member: &a3::BundleManifestMember, declared: u64) -> Finding {
    Finding::new(
        "member-digest-mismatch",
        format!(
            "{} is {declared} bytes in the archive; the manifest lists {} bytes",
            member.path.as_str(),
            member.bytes.0
        ),
    )
    .at_path(member.path.as_str())
}

/// Inflate `entry` and check it against its manifest record.
pub fn read_checked<R: ReadAt + ?Sized>(
    source: &R,
    index: &ZipIndex,
    entry: &Entry,
    member: &a3::BundleManifestMember,
) -> Result<Vec<u8>, Finding> {
    let bytes = index.read(source, entry).map_err(|error| error.finding())?;
    let size = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
    let sha256 = sha256_hex(&bytes);
    if size != member.bytes.0 || sha256 != member.sha256.0 {
        return Err(Finding::new(
            "member-digest-mismatch",
            format!(
                "{} is {size} bytes with sha256 {sha256}; the manifest lists {} bytes with sha256 {}",
                member.path.as_str(),
                member.bytes.0,
                member.sha256.0
            ),
        )
        .at_path(member.path.as_str()));
    }
    Ok(bytes)
}

/// Check a structured member's content against its `member_schema` (step 7).
/// An unknown schema id is not checked.
pub fn check_structured(
    member: &a3::BundleManifestMember,
    bytes: &[u8],
    pack_format_version: u16,
    limits: &Limits,
) -> Result<(), Finding> {
    let Some(schema) = member
        .member_schema
        .as_ref()
        .map(|schema| schema.0.as_str())
    else {
        return Ok(());
    };
    let path = member.path.as_str();
    let invalid = |message: String, pointer: Option<String>| {
        let finding = Finding::new("member-schema-invalid", message);
        match pointer {
            Some(pointer) => finding.at(Location::pointer(Some(path.to_owned()), pointer)),
            None => finding.at_path(path),
        }
    };
    if schema == MATERIALIZATION_SCHEMA {
        return check_pack(path, bytes, pack_format_version);
    }
    let prism = crate::schema::registry().knows(schema);
    if !prism && schema != DESIGN_SCHEMA {
        return Ok(());
    }
    json_bounds(bytes, limits, false, path).map_err(|failure| failure.finding)?;
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|error| invalid(format!("{path} is not JSON: {error}"), None))?;
    if value.get("schema").and_then(Value::as_str) != Some(schema) {
        return Err(invalid(
            format!("{path} does not declare schema {schema}"),
            Some("/schema".to_owned()),
        ));
    }
    if prism {
        crate::schema::validate(schema, &value)
            .map_err(|violation| invalid(violation.message, Some(violation.pointer)))?;
    }
    Ok(())
}

fn check_pack(path: &str, bytes: &[u8], pack_format_version: u16) -> Result<(), Finding> {
    use prism_kicad_materialization_pack::{PACK_MAGIC, PackLimits, PackReader};
    let unreadable = |message: String| Finding::new("member-unreadable", message).at_path(path);
    if bytes.len() < 10 || bytes[..8] != PACK_MAGIC {
        return Err(unreadable(format!(
            "{path} does not start with the pack magic"
        )));
    }
    let version = u16::from_le_bytes([bytes[8], bytes[9]]);
    if version != pack_format_version {
        return Err(unreadable(format!(
            "{path} has pack format {version}, not the generator's {pack_format_version}"
        )));
    }
    PackReader::open(bytes, PackLimits::default())
        .map(|_| ())
        .map_err(|error| unreadable(format!("{path} does not open: {error}")))
}
