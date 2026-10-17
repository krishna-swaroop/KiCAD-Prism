//! `prism-kicad bundle build`: the three stages of cli-spec.md §5.2 over the
//! parser core and `prism-projections`.
//!
//! Each stage returns a [`Built`] bundle: the manifest, every member's bytes
//! in archive order, and which members this invocation wrote. Writing the
//! archive atomically (temp file, fsync, self-verify, rename) is the CLI's
//! job; [`Built::write`] streams the canonical zip into any writer.
//!
//! What is recorded and what is not follows bundle-format.md §3.2: a content
//! failure of the design gives a stage `failed` or `partial` in the manifest
//! (the CLI exits 9); everything else is a [`Failure`] and writes nothing.

pub mod board;
pub mod chain;
pub mod crosscheck;
mod design;
mod keys;
pub mod materialize;
pub mod models;
pub mod parse;
mod producers;
mod sexpr_check;

pub use sexpr_check::{BOARD_FORMAT, SCHEMATIC_FORMAT};
mod sheets;
pub mod sources;
pub mod stackup;

use crate::finding::{Failure, Finding, Outcome};
use crate::limits::Limits;
use crate::manifest::{MANIFEST_PATH, Manifest, Role, Stage, a3, to_bytes};
use crate::zip::{WriteError, ZipWriter};
use std::io::Write;
use std::sync::Arc;

/// Where progress and findings go while a stage runs (stderr, in the CLI).
pub trait Reporter {
    /// An `info` progress line (`stage-started`, `sources-selected`, ...).
    fn info(&self, code: &str, message: &str);
    /// A `warning` line for a recorded warning.
    fn warning(&self, finding: &Finding);
    /// An `error` line for a recorded stage or member failure.
    fn error(&self, finding: &Finding);
}

/// A reporter that drops everything.
pub struct Silent;

impl Reporter for Silent {
    fn info(&self, _code: &str, _message: &str) {}
    fn warning(&self, _finding: &Finding) {}
    fn error(&self, _finding: &Finding) {}
}

/// The generator id the bundle records: the `prism-kicad version` document
/// and its canonical bytes.
#[derive(Clone, Debug)]
pub struct Generator {
    /// The document.
    pub document: a3::CliVersionA0,
    /// Its canonical bytes (cli-spec.md §5.1.3).
    pub bytes: Vec<u8>,
}

impl Generator {
    /// Wrap `document`, computing its canonical bytes.
    pub fn new(document: a3::CliVersionA0) -> Outcome<Self> {
        let value = serde_json::to_value(&document).map_err(|error| {
            Failure::internal(format!("the generator does not encode: {error}"))
        })?;
        let bytes = crate::generator::canonical(&value);
        Ok(Self { document, bytes })
    }
}

/// One member's content.
#[derive(Clone, Debug)]
pub struct MemberData {
    /// Archive path.
    pub path: String,
    /// Role.
    pub role: Role,
    /// Uncompressed bytes, shared with every reader that produced them.
    pub bytes: Arc<[u8]>,
    /// `member_schema`, for structured members.
    pub schema: Option<String>,
    /// The key entry of a source member.
    pub source: Option<a3::BundleManifestSourceEntry>,
}

impl MemberData {
    /// The manifest record of this member.
    #[must_use]
    pub fn record(&self) -> a3::BundleManifestMember {
        a3::BundleManifestMember {
            path: a3::ArchivePath(self.path.clone()),
            role: self.role,
            stage: crate::manifest::role_stage(self.role),
            sha256: a3::Sha256Hex(crate::generator::sha256_hex(&self.bytes)),
            bytes: a3::ByteCount(u64::try_from(self.bytes.len()).unwrap_or(u64::MAX)),
            member_schema: self.schema.clone().map(a3::SchemaId),
            source: self.source.clone(),
        }
    }
}

/// A bundle after one stage.
#[derive(Clone, Debug)]
pub struct Built {
    /// The stage this invocation ran.
    pub stage: Stage,
    /// The manifest.
    pub manifest: Manifest,
    /// `bundle.json` bytes.
    pub manifest_bytes: Vec<u8>,
    /// Every member other than `bundle.json`, in archive order.
    pub members: Vec<MemberData>,
    /// Paths this invocation wrote, besides `bundle.json`.
    pub written: Vec<String>,
}

impl Built {
    /// Assemble a bundle: sort the members, list them in the manifest and
    /// serialize it.
    pub fn assemble(
        stage: Stage,
        mut manifest: Manifest,
        mut members: Vec<MemberData>,
        mut written: Vec<String>,
    ) -> Self {
        members.sort_by(|a, b| a.path.cmp(&b.path));
        manifest.members = members.iter().map(MemberData::record).collect();
        written.sort();
        written.dedup();
        let manifest_bytes = to_bytes(&manifest);
        Self {
            stage,
            manifest,
            manifest_bytes,
            members,
            written,
        }
    }

    /// Stream the canonical archive into `out`; return it and the archive
    /// size.
    pub fn write<W: Write>(&self, out: W, limits: &Limits) -> Outcome<(W, u64)> {
        let map = |error: WriteError| match error {
            WriteError::Io(error) => Failure::output(
                "output-write-failed",
                format!("the archive could not be written: {error}"),
            )
            .argument("output"),
            WriteError::Limit(failure) => *failure,
        };
        let mut writer = ZipWriter::new(out, limits);
        writer
            .add(MANIFEST_PATH, &self.manifest_bytes, limits)
            .map_err(map)?;
        for (member, encoded) in self.members.iter().zip(encode_all(&self.members)) {
            writer
                .add_encoded(&member.path, &member.bytes, &encoded, limits)
                .map_err(map)?;
        }
        writer.finish(limits).map_err(map)
    }

    /// The record of this invocation's stage.
    #[must_use]
    pub fn stage_record(&self) -> StageRecord<'_> {
        StageRecord::of(&self.manifest, self.stage)
    }
}

/// Every member encoded for the archive, in `members` order. Deflate is
/// most of a write, and members are independent, so they are encoded on up to
/// eight threads; the archive is still written in member order.
fn encode_all(members: &[MemberData]) -> Vec<crate::zip::Encoded<'_>> {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let workers = std::thread::available_parallelism()
        .map_or(1, std::num::NonZero::get)
        .clamp(1, 8)
        .min(members.len().max(1));
    let next = AtomicUsize::new(0);
    let mut encoded: Vec<(usize, crate::zip::Encoded<'_>)> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..workers)
            .map(|_| {
                scope.spawn(|| {
                    let mut done = Vec::new();
                    loop {
                        let index = next.fetch_add(1, Ordering::Relaxed);
                        let Some(member) = members.get(index) else {
                            break done;
                        };
                        done.push((index, crate::zip::encode_member(&member.bytes)));
                    }
                })
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|handle| {
                handle
                    .join()
                    .unwrap_or_else(|panic| std::panic::resume_unwind(panic))
            })
            .collect()
    });
    encoded.sort_by_key(|(index, _)| *index);
    encoded.into_iter().map(|(_, encoded)| encoded).collect()
}

/// The shared fields of one stage record.
#[derive(Clone, Copy, Debug)]
pub struct StageRecord<'a> {
    /// The stage.
    pub stage: Stage,
    /// Its status.
    pub status: a3::BundleManifestStageStatus,
    /// Its content error.
    pub error: Option<&'a a3::CliFinding>,
    /// Its skip reason.
    pub skip_reason: Option<a3::BundleManifestSkipReason>,
    /// Its warnings.
    pub warnings: &'a [a3::Warning],
    /// Its failed members.
    pub failed_members: &'a [a3::BundleManifestMemberFailure],
}

impl<'a> StageRecord<'a> {
    /// The record of `stage` in `manifest`.
    #[must_use]
    pub fn of(manifest: &'a Manifest, stage: Stage) -> Self {
        let stages = &manifest.stages;
        match stage {
            Stage::Parse => Self {
                stage,
                status: stages.parse.status,
                error: stages.parse.error.as_ref(),
                skip_reason: None,
                warnings: &stages.parse.warnings,
                failed_members: &stages.parse.failed_members,
            },
            Stage::Board => Self {
                stage,
                status: stages.board.status,
                error: stages.board.error.as_ref(),
                skip_reason: stages.board.skip_reason,
                warnings: &stages.board.warnings,
                failed_members: &stages.board.failed_members,
            },
            Stage::Models => Self {
                stage,
                status: stages.models.status,
                error: stages.models.error.as_ref(),
                skip_reason: stages.models.skip_reason,
                warnings: &stages.models.warnings,
                failed_members: &stages.models.failed_members,
            },
        }
    }

    /// The three records of `manifest`, in stage order.
    #[must_use]
    pub fn all(manifest: &'a Manifest) -> [Self; 3] {
        [
            Self::of(manifest, Stage::Parse),
            Self::of(manifest, Stage::Board),
            Self::of(manifest, Stage::Models),
        ]
    }
}

/// Whether a KiCad that produced an input (`--refill-tool`, `--models-tool`)
/// may serve a generator pinned at `kicad_version`: the same major.minor,
/// any patch release (cli-spec.md §5.2.3, decisions.md "KiCad patch
/// releases").
#[must_use]
pub fn same_kicad_release(tool: &str, kicad_version: &str) -> bool {
    let minor = |version: &str| {
        let mut parts = version.split('.');
        (
            parts.next().map(str::to_owned),
            parts.next().map(str::to_owned),
        )
    };
    minor(tool) == minor(kicad_version)
}

pub(crate) fn internal(error: impl std::fmt::Display) -> Failure {
    Failure::internal(error.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn patch_releases_serve_the_pinned_kicad() {
        assert!(super::same_kicad_release("10.0.6", "10.0.6"));
        assert!(super::same_kicad_release("10.0.7", "10.0.6"));
        assert!(!super::same_kicad_release("10.1.0", "10.0.6"));
        assert!(!super::same_kicad_release("11.0.0", "10.0.6"));
    }
}
