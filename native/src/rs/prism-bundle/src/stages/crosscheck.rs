//! Cross-check of the materialized binding table against the design JSON
//! (sim-adr-0008, board-model "Sources And Bundle Build"). Moved from a1
//! (sim: `src/prism-bundle/src/crosscheck.rs`) unchanged in its rules; a2
//! records it in `stages.board.cross_check` with warnings and errors sorted by
//! code, then message ([`manifest_report`]).
//!
//! The binding table and the design JSON join on reference designator plus
//! pad number, so both must agree on reference designators, pad numbers,
//! and the net of every pad. Findings fall in three groups:
//!
//! - **Errors** are recorded in the manifest with status `failed`; the
//!   bundle is still written, and simulation refuses it (sim-adr-0020).
//!   They mean an engine would join a pad to the wrong pin or net:
//!   - `component-missing-from-schematic`: a footprint with at least one
//!     pad on a net has no symbol, yet the design's nets name its pins.
//!   - `component-missing-from-board`: a symbol placed on the board (not
//!     excluded from the board) has no footprint.
//!   - `pad-missing-from-schematic`: a pad on a net has no matching pin.
//!   - `net-mismatch`: a pad's board net differs from its pin's design net,
//!     and no known mapping explains it.
//! - **Warnings** are recorded in the manifest:
//!   - `pin-missing-from-board`: a pin of a placed symbol has no pad (shield
//!     and cage pins a footprint merges). No pad, so nothing joins wrongly.
//!   - `board-only-component`: a footprint the design never names, by
//!     symbol or by pin (logos, fiducials, mounting holes, including holes
//!     tied to a net). Its pads keep their board nets; with no pin there is
//!     nothing to join them to wrongly.
//!   - `board-net-not-in-schematic`: copper on a net that no pad joins and
//!     the schematic does not name.
//!   - `schematic-net-not-on-board`: a design net with no pin on the board
//!     and no board net of the same name.
//! - **Known mappings** are tool renames accepted as equal and recorded:
//!   - `single-pin-net-name`: KiCad names a net with one pin
//!     `unconnected-(...)` on the board, while the schematic netlister may
//!     name the same one-pin net `Net-(...)`. The mapping applies only when
//!     both sides hold exactly that one pin.
//!   - `same-pins-net-name`: the board and the schematic name a net
//!     differently but it joins exactly the same pins on both sides (the
//!     netlister and the board disagree on hierarchical names). Connectivity
//!     is what an engine joins on, so the board's name is used.
//!   - `split-net`: the schematic netlister splits one board net into
//!     several, each joining only pins of that board net (bus members passed
//!     through hierarchical sheet pins). Every pad keeps its board net and no
//!     pin moves to another one. A design net spanning two board nets is
//!     still a `net-mismatch`: the board really separates that copper.
//!
//! Pads without a net (mechanical pads, unnamed pads) take no part in the
//! join and are not compared.

use crate::manifest::a3;
use prism_kicad_contracts::generated::materialization_document::{
    BindingSourceKind, MaterializationDocumentA0,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

/// The kind of a cross-check finding.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum IssueKind {
    /// Error: footprint with netted pads has no symbol, but the design's nets name its pins.
    ComponentMissingFromSchematic,
    /// Error: placed symbol has no footprint.
    ComponentMissingFromBoard,
    /// Error: netted pad has no pin.
    PadMissingFromSchematic,
    /// Warning: pin of a placed symbol has no pad.
    PinMissingFromBoard,
    /// Error: pad and pin are on different nets.
    NetMismatch,
    /// Warning: footprint the design never names (no symbol, no pins).
    BoardOnlyComponent,
    /// Warning: board net with no pad, unknown to the schematic.
    BoardNetNotInSchematic,
    /// Warning: design net with no pin on the board.
    SchematicNetNotOnBoard,
}

impl IssueKind {
    /// Stable code used in reports and the manifest.
    #[must_use]
    pub fn code(self) -> &'static str {
        match self {
            Self::ComponentMissingFromSchematic => "component-missing-from-schematic",
            Self::ComponentMissingFromBoard => "component-missing-from-board",
            Self::PadMissingFromSchematic => "pad-missing-from-schematic",
            Self::PinMissingFromBoard => "pin-missing-from-board",
            Self::NetMismatch => "net-mismatch",
            Self::BoardOnlyComponent => "board-only-component",
            Self::BoardNetNotInSchematic => "board-net-not-in-schematic",
            Self::SchematicNetNotOnBoard => "schematic-net-not-on-board",
        }
    }

    /// Whether the finding stops the build.
    #[must_use]
    pub fn is_error(self) -> bool {
        matches!(
            self,
            Self::ComponentMissingFromSchematic
                | Self::ComponentMissingFromBoard
                | Self::PadMissingFromSchematic
                | Self::NetMismatch
        )
    }
}

/// One cross-check finding.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct CrossCheckIssue {
    /// What was found.
    pub kind: IssueKind,
    /// The reference designator, pin (`U1.5`), or net concerned.
    pub subject: String,
    /// Board-side value, when there is one.
    pub board: Option<String>,
    /// Design-side value, when there is one.
    pub design: Option<String>,
}

impl fmt::Display for CrossCheckIssue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.kind.code(), self.subject)?;
        if let Some(board) = &self.board {
            write!(formatter, " (board {board:?})")?;
        }
        if let Some(design) = &self.design {
            write!(formatter, " (design {design:?})")?;
        }
        Ok(())
    }
}

/// A finding: a stable code and a message.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BundleWarning {
    /// Stable code.
    pub code: String,
    /// Human-readable message.
    pub message: String,
}

/// A tool rename accepted as equal.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CrossCheckMapping {
    /// Mapping kind, e.g. `single-pin-net-name`.
    pub kind: String,
    /// Board name.
    pub board: String,
    /// Design JSON name.
    pub design: String,
}

/// Cross-check status written to the manifest.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CrossCheckStatus {
    /// No findings.
    Passed,
    /// Only warnings.
    PassedWithWarnings,
    /// Errors: an engine would join a pad to the wrong pin or net.
    Failed,
    /// No schematic, so nothing was compared.
    Skipped,
}

impl CrossCheckStatus {
    /// Whether engines may run on the bundle.
    #[must_use]
    pub fn allows_simulation(self) -> bool {
        matches!(self, Self::Passed | Self::PassedWithWarnings)
    }
}

/// The manifest's `cross_check` block.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CrossCheckReport {
    /// Overall status.
    pub status: CrossCheckStatus,
    /// Reference designators compared.
    pub components_compared: u64,
    /// Netted pads compared.
    pub pads_compared: u64,
    /// Distinct board nets on compared pads.
    pub nets_compared: u64,
    /// Known mappings applied.
    pub mappings: Vec<CrossCheckMapping>,
    /// Warnings.
    pub warnings: Vec<BundleWarning>,
    /// Errors; non-empty exactly when the status is `failed`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub errors: Vec<BundleWarning>,
}

impl CrossCheckReport {
    /// The report of a project with no schematic: nothing compared.
    #[must_use]
    pub fn skipped() -> Self {
        Self {
            status: CrossCheckStatus::Skipped,
            components_compared: 0,
            pads_compared: 0,
            nets_compared: 0,
            mappings: Vec::new(),
            warnings: Vec::new(),
            errors: Vec::new(),
        }
    }
}

/// Everything the cross-check found.
#[derive(Clone, Debug)]
pub struct CrossCheckOutcome {
    /// Report for the manifest; its `errors` mirror [`Self::errors`].
    pub report: CrossCheckReport,
    /// Errors, typed.
    pub errors: Vec<CrossCheckIssue>,
}

#[derive(Deserialize)]
struct DesignParameters {
    #[serde(default)]
    kicad_on_board: Option<String>,
}

#[derive(Deserialize)]
struct DesignComponent {
    designator: String,
    #[serde(default)]
    parameters: Option<DesignParameters>,
}

#[derive(Deserialize)]
struct DesignTerminal {
    designator: String,
    pin: String,
}

#[derive(Deserialize)]
struct DesignNet {
    name: String,
    #[serde(default)]
    terminals: Vec<DesignTerminal>,
}

/// The parts of the design JSON the cross-check reads.
#[derive(Deserialize)]
pub struct DesignView {
    components: Vec<DesignComponent>,
    nets: Vec<DesignNet>,
}

type Pin = (String, String);

/// Board side: components, netted pads, and nets.
struct BoardSide {
    components: BTreeSet<String>,
    /// (refdes, pad) to the names of the non-empty nets on that pad.
    pads: BTreeMap<Pin, BTreeSet<String>>,
    nets: BTreeSet<String>,
}

impl BoardSide {
    fn of(header: &MaterializationDocumentA0) -> Self {
        let names: BTreeMap<&str, &str> = header
            .nets
            .iter()
            .map(|net| (net.key.as_str(), net.name.as_str()))
            .collect();
        let mut pads: BTreeMap<Pin, BTreeSet<String>> = BTreeMap::new();
        for entry in &header.binding {
            let (Some(refdes), Some(pad), BindingSourceKind::Pad) =
                (&entry.refdes, &entry.pad_number, entry.source_kind)
            else {
                continue;
            };
            let nets = pads.entry((refdes.clone(), pad.clone())).or_default();
            let net = entry.net_key.as_deref().and_then(|key| names.get(key));
            if let Some(name) = net.filter(|name| !name.is_empty()) {
                nets.insert((*name).to_owned());
            }
        }
        Self {
            components: header.components.iter().map(|c| c.refdes.clone()).collect(),
            pads,
            nets: names
                .values()
                .filter(|n| !n.is_empty())
                .map(|n| (*n).to_owned())
                .collect(),
        }
    }

    fn netted(&self, refdes: &str) -> bool {
        self.pads
            .range((refdes.to_owned(), String::new())..)
            .take_while(|((owner, _), _)| owner == refdes)
            .any(|(_, nets)| !nets.is_empty())
    }
}

/// Design side: placed components, pin nets, and net sizes.
struct DesignSide {
    /// Designator to "placed on the board".
    components: BTreeMap<String, bool>,
    pins: BTreeMap<Pin, String>,
    /// Designators that some net's terminals name.
    pinned: BTreeSet<String>,
    net_sizes: BTreeMap<String, usize>,
}

impl DesignSide {
    fn of(view: &DesignView) -> Self {
        let mut components = BTreeMap::new();
        for component in &view.components {
            let placed = component
                .parameters
                .as_ref()
                .and_then(|p| p.kicad_on_board.as_deref())
                != Some("false");
            *components
                .entry(component.designator.clone())
                .or_insert(false) |= placed;
        }
        let mut pins = BTreeMap::new();
        let mut net_sizes = BTreeMap::new();
        for net in &view.nets {
            net_sizes.insert(net.name.clone(), net.terminals.len());
            for terminal in &net.terminals {
                pins.insert(
                    (terminal.designator.clone(), terminal.pin.clone()),
                    net.name.clone(),
                );
            }
        }
        let pinned = pins
            .keys()
            .map(|(designator, _)| designator.clone())
            .collect();
        Self {
            components,
            pins,
            pinned,
            net_sizes,
        }
    }
}

struct Checker<'a> {
    board: &'a BoardSide,
    design: &'a DesignSide,
    issues: BTreeSet<CrossCheckIssue>,
    mappings: BTreeSet<CrossCheckMapping>,
    board_net_pads: BTreeMap<&'a str, usize>,
    /// Pins each net joins, counting only pins that are pads on the board and pins in the design.
    board_net_pins: BTreeMap<&'a str, BTreeSet<&'a Pin>>,
    design_net_pins: BTreeMap<&'a str, BTreeSet<&'a Pin>>,
}

fn issue(
    kind: IssueKind,
    subject: String,
    board: Option<&str>,
    design: Option<&str>,
) -> CrossCheckIssue {
    CrossCheckIssue {
        kind,
        subject,
        board: board.map(str::to_owned),
        design: design.map(str::to_owned),
    }
}

impl<'a> Checker<'a> {
    fn new(board: &'a BoardSide, design: &'a DesignSide) -> Self {
        let mut board_net_pads = BTreeMap::new();
        for net in board.pads.values().flatten() {
            *board_net_pads.entry(net.as_str()).or_insert(0) += 1;
        }
        let mut board_net_pins: BTreeMap<&str, BTreeSet<&Pin>> = BTreeMap::new();
        for (pin, nets) in &board.pads {
            if design.pins.contains_key(pin) {
                for net in nets {
                    board_net_pins.entry(net.as_str()).or_default().insert(pin);
                }
            }
        }
        let mut design_net_pins: BTreeMap<&str, BTreeSet<&Pin>> = BTreeMap::new();
        for (pin, net) in &design.pins {
            if board.pads.contains_key(pin) {
                design_net_pins.entry(net.as_str()).or_default().insert(pin);
            }
        }
        Self {
            board,
            design,
            issues: BTreeSet::new(),
            mappings: BTreeSet::new(),
            board_net_pads,
            board_net_pins,
            design_net_pins,
        }
    }

    fn components(&mut self) {
        for refdes in &self.board.components {
            if !self.design.components.contains_key(refdes) {
                let kind = if self.board.netted(refdes) && self.design.pinned.contains(refdes) {
                    IssueKind::ComponentMissingFromSchematic
                } else {
                    IssueKind::BoardOnlyComponent
                };
                self.issues
                    .insert(issue(kind, refdes.clone(), Some(refdes), None));
            }
        }
        for (designator, placed) in &self.design.components {
            if *placed && !self.board.components.contains(designator) {
                let kind = IssueKind::ComponentMissingFromBoard;
                self.issues
                    .insert(issue(kind, designator.clone(), None, Some(designator)));
            }
        }
    }

    /// A one-pin net KiCad names `unconnected-(...)` on the board.
    fn single_pin_rename(&self, board: &str, design: &str) -> bool {
        board.starts_with("unconnected-(")
            && self.board_net_pads.get(board) == Some(&1)
            && self.design.net_sizes.get(design) == Some(&1)
    }

    /// The design net joins only pins of this board net (all of them, or a split piece).
    fn within(&self, board: &str, design: &str) -> bool {
        matches!(
            (self.board_net_pins.get(board), self.design_net_pins.get(design)),
            (Some(on_board), Some(in_design)) if in_design.is_subset(on_board)
        )
    }

    /// The two names join exactly the same pins.
    fn same_pins(&self, board: &str, design: &str) -> bool {
        matches!(
            (self.board_net_pins.get(board), self.design_net_pins.get(design)),
            (Some(on_board), Some(in_design)) if on_board == in_design
        )
    }

    fn pad(&mut self, pin: &Pin, nets: &BTreeSet<String>) {
        let subject = format!("{}.{}", pin.0, pin.1);
        let Some(design) = self.design.pins.get(pin) else {
            if !nets.is_empty() {
                let kind = IssueKind::PadMissingFromSchematic;
                self.issues
                    .insert(issue(kind, subject, nets.first().map(String::as_str), None));
            }
            return;
        };
        if nets.is_empty() {
            self.issues.insert(issue(
                IssueKind::NetMismatch,
                subject,
                Some(""),
                Some(design),
            ));
            return;
        }
        for board in nets.iter().filter(|board| *board != design) {
            if self.single_pin_rename(board, design) {
                self.mappings.insert(CrossCheckMapping {
                    kind: "single-pin-net-name".to_owned(),
                    board: board.clone(),
                    design: design.clone(),
                });
            } else if self.same_pins(board, design) {
                self.mappings.insert(CrossCheckMapping {
                    kind: "same-pins-net-name".to_owned(),
                    board: board.clone(),
                    design: design.clone(),
                });
            } else if self.within(board, design) {
                self.mappings.insert(CrossCheckMapping {
                    kind: "split-net".to_owned(),
                    board: board.clone(),
                    design: design.clone(),
                });
            } else {
                let kind = IssueKind::NetMismatch;
                self.issues
                    .insert(issue(kind, subject.clone(), Some(board), Some(design)));
            }
        }
    }

    fn pads(&mut self) -> u64 {
        let mut compared = 0;
        for (pin, nets) in &self.board.pads {
            if self.design.components.contains_key(&pin.0) {
                compared += u64::from(!nets.is_empty());
                self.pad(pin, nets);
            }
        }
        for (pin, net) in &self.design.pins {
            if self.board.components.contains(&pin.0) && !self.board.pads.contains_key(pin) {
                let kind = IssueKind::PinMissingFromBoard;
                let subject = format!("{}.{}", pin.0, pin.1);
                self.issues.insert(issue(kind, subject, None, Some(net)));
            }
        }
        compared
    }

    fn nets(&mut self) {
        let mapped: BTreeSet<&str> = self.mappings.iter().map(|m| m.design.as_str()).collect();
        for net in &self.board.nets {
            let on_pad = self.board_net_pads.contains_key(net.as_str());
            if !on_pad && !self.design.net_sizes.contains_key(net) {
                let kind = IssueKind::BoardNetNotInSchematic;
                self.issues
                    .insert(issue(kind, net.clone(), Some(net), None));
            }
        }
        let pinned: BTreeSet<&str> = self
            .design
            .pins
            .iter()
            .filter(|(pin, _)| self.board.pads.contains_key(*pin))
            .map(|(_, name)| name.as_str())
            .collect();
        for net in self.design.net_sizes.keys() {
            let name = net.as_str();
            let on_board = self.board.nets.contains(net) || mapped.contains(name);
            if !on_board && !pinned.contains(name) {
                let kind = IssueKind::SchematicNetNotOnBoard;
                self.issues
                    .insert(issue(kind, net.clone(), None, Some(net)));
            }
        }
    }
}

/// Cross-check the binding table in `header` against `design`.
#[must_use]
pub fn cross_check(header: &MaterializationDocumentA0, design: &DesignView) -> CrossCheckOutcome {
    let board = BoardSide::of(header);
    let design = DesignSide::of(design);
    let mut checker = Checker::new(&board, &design);
    checker.components();
    let pads_compared = checker.pads();
    checker.nets();
    let (errors, warnings): (Vec<_>, Vec<_>) = checker
        .issues
        .into_iter()
        .partition(|issue| issue.kind.is_error());
    let finding = |issue: &CrossCheckIssue| BundleWarning {
        code: issue.kind.code().to_owned(),
        message: issue.to_string(),
    };
    let warnings: Vec<BundleWarning> = warnings.iter().map(finding).collect();
    let report = CrossCheckReport {
        status: if !errors.is_empty() {
            CrossCheckStatus::Failed
        } else if warnings.is_empty() {
            CrossCheckStatus::Passed
        } else {
            CrossCheckStatus::PassedWithWarnings
        },
        components_compared: count(
            board
                .components
                .iter()
                .filter(|r| design.components.contains_key(*r))
                .count(),
        ),
        pads_compared,
        nets_compared: count(checker.board_net_pads.len()),
        mappings: checker.mappings.into_iter().collect(),
        warnings,
        errors: errors.iter().map(finding).collect(),
    };
    CrossCheckOutcome { report, errors }
}

/// The report as the manifest records it (bundle-manifest-a3.tsp,
/// `BundleManifestCrossCheck`): `errors` always written, warnings and errors
/// sorted by code then message without repeats, mappings by kind, board,
/// design.
pub fn manifest_report(report: &CrossCheckReport) -> Result<a3::BundleManifestCrossCheck, String> {
    let sorted = |findings: &[BundleWarning]| {
        let mut findings = findings.to_vec();
        findings.sort();
        findings.dedup();
        findings
    };
    let mut value = serde_json::to_value(report).map_err(|error| error.to_string())?;
    value["warnings"] =
        serde_json::to_value(sorted(&report.warnings)).map_err(|error| error.to_string())?;
    value["errors"] =
        serde_json::to_value(sorted(&report.errors)).map_err(|error| error.to_string())?;
    serde_json::from_value(value).map_err(|error| error.to_string())
}

fn count(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}
