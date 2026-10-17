//! Chaining stages through `--in` (cli-spec.md §5.2.1): load the earlier
//! archive with every reader check, check that it fits this invocation, and
//! drop what a re-run replaces.

use super::{Generator, MemberData, internal};
use crate::finding::{Failure, Outcome};
use crate::generator::{canonical, sha256_hex};
use crate::manifest::{Manifest, Stage, Status, a3, role_stage};
use crate::reader::BundleReader;
use crate::revision_key::{EffectiveConfig, canonical_config};
use crate::zip::ReadAt;

/// The bundle a later stage builds on.
#[derive(Clone, Debug)]
pub struct Input {
    /// Its manifest.
    pub manifest: Manifest,
    /// SHA-256 of its `bundle.json`, compared again before the rename.
    pub manifest_sha256: String,
    /// Every member, read and checked.
    pub members: Vec<MemberData>,
}

impl Input {
    /// The bytes of member `path`.
    #[must_use]
    pub fn member(&self, path: &str) -> Option<&[u8]> {
        self.members
            .iter()
            .find(|member| member.path == path)
            .map(|member| member.bytes.as_ref())
    }
}

/// Read every member of `reader` (bundle-format.md §9 step 6).
pub fn load<R: ReadAt>(reader: &BundleReader<R>) -> Outcome<Input> {
    let manifest = reader.manifest().clone();
    let mut members = Vec::with_capacity(manifest.members.len());
    for record in &manifest.members {
        let bytes = match reader.member(&record.path) {
            Some(Ok(bytes)) => bytes,
            Some(Err(finding)) => {
                let mut failure = Failure::input(
                    "bundle-invalid",
                    format!("the input bundle is invalid: {}", finding.message),
                )
                .argument("in");
                failure.finding.location = finding.location;
                return Err(failure);
            }
            None => return Err(internal("a listed member is not in the archive")),
        };
        members.push(MemberData {
            path: record.path.0.clone(),
            role: record.role,
            bytes: std::sync::Arc::from(bytes),
            schema: record.member_schema.as_ref().map(|schema| schema.0.clone()),
            source: record.source.clone(),
        });
    }
    Ok(Input {
        manifest,
        manifest_sha256: sha256_hex(&reader.manifest_read().bytes),
        members,
    })
}

fn status(manifest: &Manifest, stage: Stage) -> Status {
    match stage {
        Stage::Parse => manifest.stages.parse.status,
        Stage::Board => manifest.stages.board.status,
        Stage::Models => manifest.stages.models.status,
    }
}

/// Checks 3–5 of cli-spec.md §5.2.1.
pub fn check(
    input: &Input,
    stage: Stage,
    generator: &Generator,
    revision_key: Option<&str>,
    config: Option<&EffectiveConfig>,
) -> Outcome<()> {
    let recorded = serde_json::to_value(&input.manifest.generator).map_err(internal)?;
    if canonical(&recorded) != generator.bytes {
        return Err(Failure::precondition(
            "generator-mismatch",
            "the input bundle was written by another generator id",
        )
        .argument("in"));
    }
    let name = crate::manifest::stage_name(stage);
    if status(&input.manifest, stage) == Status::Skipped {
        return Err(Failure::precondition(
            "stage-not-applicable",
            format!("stage {name} is skipped in the input bundle"),
        )
        .argument("stage"));
    }
    let ready = match stage {
        Stage::Parse => false,
        Stage::Board => matches!(
            input.manifest.stages.parse.status,
            Status::Complete | Status::Partial
        ),
        Stage::Models => input.manifest.stages.board.status == Status::Complete,
    };
    if !ready {
        return Err(Failure::precondition(
            "stage-order",
            format!("the input bundle's earlier stages do not allow stage {name}"),
        )
        .argument("stage"));
    }
    if let Some(key) = revision_key
        && input
            .manifest
            .revision_key
            .as_ref()
            .map(|recorded| recorded.0.as_str())
            != Some(key)
    {
        return Err(Failure::precondition(
            "revision-key-mismatch",
            "--revision-key differs from the input bundle's",
        )
        .argument("revision-key"));
    }
    if let Some(config) = config {
        let recorded: EffectiveConfig =
            crate::manifest::retype(&input.manifest.config).map_err(internal)?;
        if canonical_config(&recorded) != canonical_config(config) {
            return Err(Failure::precondition(
                "config-mismatch",
                "--config differs from the input bundle's",
            )
            .argument("config"));
        }
    }
    Ok(())
}

/// The members a run of `stage` keeps: those of earlier stages.
#[must_use]
pub fn earlier_members(input: &Input, stage: Stage) -> Vec<MemberData> {
    let order = |stage: Stage| match stage {
        Stage::Parse => 0,
        Stage::Board => 1,
        Stage::Models => 2,
    };
    input
        .members
        .iter()
        .filter(|member| order(role_stage(member.role)) < order(stage))
        .cloned()
        .collect()
}

/// A models record reset to `pending`.
#[must_use]
pub fn pending_models() -> a3::BundleManifestModelsStage {
    crate::manifest::models_stage(Status::Pending, None)
}
