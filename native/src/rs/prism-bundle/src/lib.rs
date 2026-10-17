//! The `.prism` design bundle (`prism.bundle.manifest.a3`): the archive of
//! `native/contracts/prism/bundle-format.md`, moved here from
//! prism-sim-studio's `prism-bundle` (manifest a1) and rebuilt for a2.
//!
//! | Archive path | Role | Stage |
//! |---|---|---|
//! | `bundle.json` | manifest, always the first entry | every stage |
//! | `sources/<repo path>` | `source-*` | parse |
//! | `design.json` | `design` (`kicad_monkey.design.a0`) | parse |
//! | `projections/<name>.json` | `projection` (eight Prism contracts) | parse |
//! | `refilled/<board name>` | `refilled-board` (absent with saved fills) | board |
//! | `materialization/board.kmpack` | `materialization` | board |
//! | `viewer/models/components.glb` | `component-models` | models |
//!
//! **Features.**
//! - The always-built part, also selected by `reader`, has no dependency on
//!   the parser: the zip subset ([`zip`]), the manifest types ([`manifest`]),
//!   JSON Schema validation against the committed contracts ([`schema`]),
//!   reading and verifying ([`reader`], [`verify`]), extraction
//!   ([`extract`]), the generator bytes and bundle key ([`generator`]), the
//!   pure revision-key layer ([`revision_key`]) and the limits ([`limits`]).
//!   prism-sim-studio depends on this part and on the pack crate; it opens
//!   the materialization with `prism_geometry::Geometry::open` on
//!   [`reader::BundleReader::member`] itself (a1's `geometry()` wrapper is
//!   gone, decisions.md "Ownership map" item 6).
//! - The `build` feature adds the three stages of `prism-kicad bundle build`, over the
//!   parser core and `prism-projections` ([`stages`]).
//!
//! Builds are deterministic: the same inputs and generator give
//! byte-identical members and archives (ADR §7). The a1 → a2 mapping is in
//! `A1-TO-A2.md` beside this crate's manifest.

#![allow(
    clippy::result_large_err,
    reason = "a Failure carries its finding, location and limit by value; failures end the command, so their size never matters"
)]

pub mod extract;
pub mod finding;
pub mod generator;
pub mod json_scan;
pub mod limits;
pub mod manifest;
pub mod paths;
pub mod reader;
pub mod revision_key;
pub mod schema;
pub mod verify;
pub mod zip;

#[cfg(feature = "build")]
pub mod read_set;

#[cfg(feature = "build")]
pub mod stages;

pub use finding::{Category, Failure, Finding, LimitHit, Location, Outcome};
pub use limits::{LimitName, Limits, Work};
pub use reader::BundleReader;
