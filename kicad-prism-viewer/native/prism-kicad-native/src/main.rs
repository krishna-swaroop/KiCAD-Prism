pub mod analytic_contract;
mod board_body;
mod contract;
mod geometer_ffi;
pub mod geometer_packets;
mod geometry;
mod materialize;
pub mod mesh_pack;
pub mod semantic_compiler;

use anyhow::{Context, Result, bail};
use std::env;
use std::path::PathBuf;
use std::time::Instant;

fn main() {
    if let Err(error) = run() {
        eprintln!("prism-kicad-native: {error:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if arguments.first().map(String::as_str) == Some("compile-semantic") {
        return compile_semantic_command(&arguments[1..]);
    }
    if arguments.first().map(String::as_str) == Some("compile-board-body") {
        return compile_board_body_command(&arguments[1..]);
    }
    let mut pretty = false;
    let mut analytic = false;
    let mut source = None;
    for argument in arguments {
        match argument.as_str() {
            "emit-analytic" if source.is_none() && !analytic => analytic = true,
            "--pretty" => pretty = true,
            "--version" => {
                println!(
                    "prism-kicad-native {} kicad-monkey {}",
                    env!("CARGO_PKG_VERSION"),
                    contract::KICAD_MONKEY_REVISION
                );
                return Ok(());
            }
            value if value.starts_with('-') => bail!("unknown option: {value}"),
            value if source.is_some() => bail!("expected exactly one .kicad_pcb path, got {value}"),
            value => source = Some(PathBuf::from(value)),
        }
    }
    let source =
        source.context("usage: prism-kicad-native [emit-analytic] [--pretty] board.kicad_pcb")?;
    let started = Instant::now();
    if analytic {
        let mut document =
            materialize::materialize_analytic(&source, materialize::DEFAULT_TOLERANCE_MM)?;
        let serialize_started = Instant::now();
        let _ = serde_json::to_vec(&document).context("serialize Prism analytic PCB geometry")?;
        document.metrics.serialization_ms = serialize_started.elapsed().as_secs_f64() * 1000.0;
        document.metrics.total_ms = started.elapsed().as_secs_f64() * 1000.0;
        if pretty {
            serde_json::to_writer_pretty(std::io::stdout().lock(), &document)?;
        } else {
            serde_json::to_writer(std::io::stdout().lock(), &document)?;
        }
        println!();
        return Ok(());
    }
    let mut document = materialize::materialize(&source, materialize::DEFAULT_TOLERANCE_MM)?;
    let serialize_started = Instant::now();
    let _ = serde_json::to_vec(&document).context("serialize Prism PCB geometry")?;
    document.metrics.serialization_ms = serialize_started.elapsed().as_secs_f64() * 1000.0;
    document.metrics.total_ms = started.elapsed().as_secs_f64() * 1000.0;
    if pretty {
        serde_json::to_writer_pretty(std::io::stdout().lock(), &document)?;
    } else {
        serde_json::to_writer(std::io::stdout().lock(), &document)?;
    }
    println!();
    Ok(())
}

fn compile_board_body_command(arguments: &[String]) -> Result<()> {
    let mut pcb = None;
    let mut output = None;
    let mut mesh_tolerance_mm = materialize::DEFAULT_TOLERANCE_MM;
    let mut index = 0usize;
    while index < arguments.len() {
        let option = arguments[index].as_str();
        index += 1;
        let value = || {
            arguments
                .get(index)
                .cloned()
                .with_context(|| format!("{option} requires a value"))
        };
        match option {
            "--pcb" => pcb = Some(PathBuf::from(value()?)),
            "--output" => output = Some(PathBuf::from(value()?)),
            "--mesh-tolerance-mm" => {
                mesh_tolerance_mm = value()?.parse().context("parse --mesh-tolerance-mm")?;
            }
            value => bail!("unknown compile-board-body option {value}"),
        }
        index += 1;
    }
    let pcb = pcb.context(
        "usage: prism-kicad-native compile-board-body --pcb BOARD --output DIRECTORY [--mesh-tolerance-mm 0.005]",
    )?;
    let output = output.context("compile-board-body requires --output")?;
    let pack = board_body::compile_board_body(&pcb, &output, mesh_tolerance_mm)?;
    serde_json::to_writer(std::io::stdout().lock(), &pack.metrics)?;
    println!();
    Ok(())
}

fn compile_semantic_command(arguments: &[String]) -> Result<()> {
    let mut pcb = None;
    let mut output = None;
    let mut tile_size = None;
    let mut mesh_tolerance_mm = materialize::DEFAULT_TOLERANCE_MM;
    let mut meshopt_level = "medium".to_owned();
    let mut index = 0usize;
    while index < arguments.len() {
        let option = arguments[index].as_str();
        index += 1;
        let value = || {
            arguments
                .get(index)
                .cloned()
                .with_context(|| format!("{option} requires a value"))
        };
        match option {
            "--pcb" => pcb = Some(PathBuf::from(value()?)),
            "--output" => output = Some(PathBuf::from(value()?)),
            "--tile-size" => {
                let raw = value()?;
                tile_size = if raw == "auto" {
                    None
                } else {
                    Some(raw.parse::<f64>().context("parse --tile-size")?)
                };
            }
            "--mesh-tolerance-mm" => {
                mesh_tolerance_mm = value()?
                    .parse::<f64>()
                    .context("parse --mesh-tolerance-mm")?;
            }
            "--meshopt-level" => {
                meshopt_level = value()?;
                if !matches!(meshopt_level.as_str(), "low" | "medium" | "high") {
                    bail!("--meshopt-level must be low, medium, or high");
                }
            }
            value => bail!("unknown compile-semantic option {value}"),
        }
        index += 1;
    }
    let pcb = pcb.context(
        "usage: prism-kicad-native compile-semantic --pcb BOARD --output DIRECTORY [--tile-size auto] [--mesh-tolerance-mm 0.005] [--meshopt-level medium]",
    )?;
    let output = output.context("compile-semantic requires --output")?;
    let pack =
        mesh_pack::compile_semantic(&pcb, &output, tile_size, mesh_tolerance_mm, &meshopt_level)?;
    serde_json::to_writer(std::io::stdout().lock(), &pack.metrics)?;
    println!();
    Ok(())
}
