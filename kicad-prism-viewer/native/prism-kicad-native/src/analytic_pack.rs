//! Writes the `kicad_monkey.materialization.a0` pack the analytic viewer and
//! the simulation bundle read.

use anyhow::{Context, Result};
use kicad_monkey_core::board_materialization::materialize_project;
use kicad_monkey_materialization_pack::encode_pack;
use serde::Serialize;
use serde_json::json;
use std::path::Path;
use std::time::Instant;

pub const DEFAULT_TILE_MM: f64 = 10.0;

const PRODUCTS: [&str; 7] = [
    "components",
    "copper",
    "dielectric",
    "holes",
    "paste",
    "silkscreen",
    "solder_mask",
];

#[derive(Debug, Serialize)]
pub struct PackMetrics {
    pub operations: usize,
    pub chunks: usize,
    pub pack_bytes: usize,
    pub total_ms: f64,
}

/// Materializes `pcb` (with the `.kicad_pro` beside it, when present) and
/// writes the encoded pack to `output`.
pub fn emit_pack(pcb: &Path, output: &Path, tile_mm: f64) -> Result<PackMetrics> {
    let started = Instant::now();
    let board = std::fs::read_to_string(pcb).with_context(|| format!("read {}", pcb.display()))?;
    let project = std::fs::read_to_string(pcb.with_extension("kicad_pro")).ok();
    let source_bytes = board.len() + project.as_ref().map_or(0, String::len);
    let request = serde_json::from_value(json!({
        "type": "kicad_monkey.materialization.request",
        "version": "a0",
        "products": PRODUCTS,
        "tile_size_nm": (tile_mm * 1e6).round() as i64,
        "max_source_bytes": source_bytes.to_string(),
        "max_operations": 50_000_000,
        "max_points": 500_000_000
    }))
    .context("build materialization request")?;
    let document = materialize_project(&board, project.as_deref(), &request)
        .map_err(|error| anyhow::anyhow!("materialize {}: {error}", pcb.display()))?;
    let pack = encode_pack(&document).map_err(|error| anyhow::anyhow!("encode pack: {error}"))?;
    std::fs::write(output, &pack).with_context(|| format!("write {}", output.display()))?;
    Ok(PackMetrics {
        operations: document.operations.len(),
        chunks: document.chunks.len(),
        pack_bytes: pack.len(),
        total_ms: started.elapsed().as_secs_f64() * 1000.0,
    })
}
