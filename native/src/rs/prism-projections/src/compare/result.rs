//! `prism.design_compare.result.a1`: every Design Comparison tab except
//! fabrication, from two revisions' members (ADR amendment C2r §2 item 1).
//!
//! [`build`] runs the object diff ([`super::diff_entries`]) and hands each tab
//! to its module. A tab module is a pure function of typed members (and, for
//! the object changes, the object delta): no file access, no Node or Python
//! shape kept for its own sake. The field map
//! (`native/contracts/prism/field-maps/design-compare.md`) is the spec of each
//! field; the C2r harness compares every tab with the reference results of the
//! recorded pairs.

mod bom;
mod connectivity;
mod files;
mod hydrate;
mod objects;
mod project_diff;
mod review;
mod route_metrics;
mod stackup;
mod targets;

pub use review::{ReviewChange, VisualRole, VisualSide, VisualStatus, VisualTarget};

use super::{CompareError, Entries, diff};
use prism_kicad_contracts::generated::prism_design_compare_result_a1 as dc;
use prism_kicad_contracts::generated::prism_occurrences_a0::OccurrencesA0;
use prism_kicad_contracts::generated::prism_route_metrics_a0::RouteMetricsA0;
use prism_kicad_contracts::generated::prism_semantic_index_a2::SemanticIndexA2;
use prism_kicad_contracts::generated::prism_stackup_a0::StackupA0;
use serde_json::Value;

/// Which revision a document or object belongs to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    /// `--base`, the old revision.
    Base,
    /// `--head`, the new revision.
    Head,
}

/// One revision's identity, as the result records it.
#[derive(Clone, Debug)]
pub struct RevisionIdentity {
    /// The revision key (revision-key.md).
    pub revision_key: String,
    /// The bundle key, when the revision was read from a bundle.
    pub bundle_key: Option<String>,
    /// `config.project_file`.
    pub project_file: String,
}

/// One revision's inputs: its members, typed, and its source list.
pub struct Revision {
    /// Who the revision is.
    pub identity: RevisionIdentity,
    /// The repository paths of the revision's `sources/` members, in code
    /// point order.
    pub sources: Vec<String>,
    /// The project's committed `.prism.json`, when the revision has one.
    pub prism_settings: Option<Value>,
    /// `projections/board-objects.json`, rebuilt as the object diff's entries
    /// (the member's parsed JSON is dropped once these exist).
    pub objects: Entries,
    /// `projections/semantic-index.json`.
    pub semantic_index: SemanticIndexA2,
    /// `projections/occurrences.json`.
    pub occurrences: OccurrencesA0,
    /// `projections/stackup.json`.
    pub stackup: StackupA0,
    /// `projections/route-metrics.json`.
    pub route_metrics: RouteMetricsA0,
}

/// Options that are not in either revision.
#[derive(Clone, Copy, Debug, Default)]
pub struct Options {
    /// List unchanged BOM rows too (today's `include_unchanged`).
    pub include_unchanged: bool,
}

/// The project directory of `project_file` (`config.project_file` up to its
/// last `/`), the base of every document path in the result (amendment C2 D1).
#[must_use]
pub fn project_dir(project_file: &str) -> &str {
    super::anchor_directory(project_file)
}

/// What [`build`] gives: the document, and the object diff's counts for the
/// command's stdout (`CliCompareResultA0`).
pub struct Output {
    /// The `-o` document.
    pub result: dc::DesignCompareResultA1,
    /// The object diff's `counts` (added, removed, modified, unchanged,
    /// ignored, baseObjects, headObjects).
    pub object_counts: Value,
    /// The number of objects on each side, `(base, head)`.
    pub objects: (usize, usize),
}

/// Build the result of `base` against `head`.
///
/// # Errors
///
/// Never today; the signature keeps room for a tab that can fail.
pub fn build(base: Revision, head: Revision, options: Options) -> Result<Output, CompareError> {
    let files = files::build(&base, &head);
    let stackup = stackup::build(&base.stackup, &head.stackup);
    let route_metrics = route_metrics::build(&base, &head);
    let bom = bom::build(&base, &head, options);
    let connectivity = connectivity::build(&base, &head);
    let identity = (revision(&base.identity), revision(&head.identity));
    let base_entries = base.objects.0;
    let head_entries = head.objects.0;
    let (objects, object_counts, object_totals) = {
        let outcome = diff::outcome(&base_entries, &head_entries);
        let objects = objects::build(&base_entries, &head_entries, &outcome);
        let counts = outcome.counts(base_entries.len(), head_entries.len());
        (objects, counts, (base_entries.len(), head_entries.len()))
    };
    let mut schematic = Vec::new();
    let mut pcb = Vec::new();
    for change in objects.into_iter().chain(connectivity) {
        match change.change.domain {
            dc::DesignCompareDomain::Schematic => schematic.push(change),
            dc::DesignCompareDomain::Pcb => pcb.push(change),
        }
    }
    // C2r chunk 5: hydration reads the entries here, before they are dropped.
    hydrate::build(&base_entries, &head_entries, &mut schematic);
    drop(base_entries);
    drop(head_entries);
    targets::attach(&mut schematic);
    targets::attach(&mut pcb);
    // ecad-viewer's diffs are built in the change order (objects, then
    // connectivity; design_compare_service.py:1167-1171), before the tabs sort.
    let project_diff = project_diff::build(&schematic, &pcb, &files);
    schematic.sort_by(|a, b| a.change.id.cmp(&b.change.id));
    pcb.sort_by(|a, b| a.change.id.cmp(&b.change.id));
    let counts = dc::DesignCompareCounts {
        schematic: summary(&schematic),
        pcb: summary(&pcb),
        bom: bom.summary.clone(),
    };
    let result = dc::DesignCompareResultA1 {
        schema: "prism.design_compare.result.a1".to_owned(),
        base: identity.0,
        head: identity.1,
        files,
        schematic: dc::DesignCompareChanges {
            changes: schematic.into_iter().map(|change| change.change).collect(),
        },
        pcb: dc::DesignCompareChanges {
            changes: pcb.into_iter().map(|change| change.change).collect(),
        },
        bom,
        stackup,
        route_metrics,
        project_diff,
        counts,
    };
    Ok(Output {
        result,
        object_counts,
        objects: object_totals,
    })
}

fn revision(identity: &RevisionIdentity) -> dc::DesignCompareRevision {
    dc::DesignCompareRevision {
        revision_key: dc::Sha256Hex(identity.revision_key.clone()),
        bundle_key: identity.bundle_key.clone().map(dc::Sha256Hex),
        project_file: dc::RepoPath(identity.project_file.clone()),
    }
}

fn summary(changes: &[ReviewChange]) -> dc::DesignCompareSummary {
    let count = |kind: dc::DesignCompareChangeKind| {
        dc::Count(
            changes
                .iter()
                .filter(|change| change.change.kind == kind)
                .count() as u64,
        )
    };
    dc::DesignCompareSummary {
        added: count(dc::DesignCompareChangeKind::Added),
        removed: count(dc::DesignCompareChangeKind::Removed),
        changed: count(dc::DesignCompareChangeKind::Changed),
    }
}
