//! `prism-kicad version`: the generator id (cli-spec.md §5.1).
//!
//! It is compiled in and bumped explicitly (§5.1.2): `crate_version` with any
//! change that could change a member's bytes or a recorded stage outcome for
//! the same inputs, `kicad_version` with the worker image's KiCad, and
//! `member_schemas` with every member schema version.

use prism_bundle::manifest::{a3, member_schemas};
use prism_bundle::stages::Generator;
use prism_bundle::{Failure, Outcome};

/// The KiCad of the KiCad-produced members (the refilled board, the GLB).
/// Raise `prism_bundle::stages::{BOARD_FORMAT, SCHEMATIC_FORMAT}` with it: the
/// `(version N)` it writes, `kicad_file_formats` in the generator id.
pub const KICAD_VERSION: &str = "10.0.6";

/// The generator document of this binary.
pub fn generator() -> Outcome<Generator> {
    let document = serde_json::json!({
        "schema": "prism.cli.version.a0",
        "crate_version": env!("CARGO_PKG_VERSION"),
        "engine_version": prism_kicad_core::ENGINE_VERSION,
        "kicad_file_formats": {
            "board": prism_bundle::stages::BOARD_FORMAT,
            "schematic": prism_bundle::stages::SCHEMATIC_FORMAT,
        },
        "kicad_version": KICAD_VERSION,
        "member_schemas": member_schemas()
            .into_iter()
            .map(|(path, schema)| serde_json::json!({"path": path, "schema": schema}))
            .collect::<Vec<_>>(),
        "models_procedure": "kicad-cli-glb-a0",
        "pack_format_version": prism_kicad_materialization_pack::PACK_FORMAT_VERSION,
        "refill_procedure": "pcbnew-zone-filler-a0",
        "upgrade_procedure": "kicad-seeded-upgrade-a0",
    });
    let document: a3::CliVersionA0 = serde_json::from_value(document)
        .map_err(|error| Failure::internal(format!("the generator id does not encode: {error}")))?;
    Generator::new(document)
}
