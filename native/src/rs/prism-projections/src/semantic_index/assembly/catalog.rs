//! Pass 6a: the design-variant catalog, a port of
//! `variant_catalog_service.discover_snapshot_catalog`
//! (`backend/app/services/variant_catalog_service.py:270-333`) and the
//! `_CatalogBuilder` it drives (:60-174).
//!
//! The catalog is the union of four source sets, in the order frozen in the
//! design-variant contract packet v1.0 section 2.1:
//!
//! 1. the `.kicad_pro` registry (`schematic.variants`), in file order;
//! 2. board-header names from `(variants …)`, in file order;
//! 3. names in schematic symbol- and sheet-instance variant records, in
//!    hierarchy walk order then file order;
//! 4. names in footprint variant records, in board file order.
//!
//! Board-side names (2 and 4) fold case-insensitively into the first matching
//! catalog entry with a `catalog-name-case-mismatch` diagnostic; schematic
//! names stay distinct. An unreadable source or malformed relevant record is
//! skipped with a `source-unparseable` diagnostic; readable sources still
//! produce a catalog. Every file is read through [`Sources`], and every
//! diagnostic `path` is repository-relative (`RepoPath`, field map D9).

use super::scan;
use crate::{ProjectionError, ProjectionInput, Sources};
use serde_json::{Value, json};
use std::collections::BTreeSet;

const SOURCE_PROJECT: &str = "project";
const SOURCE_PCB: &str = "pcb";
const SOURCE_SCHEMATIC: &str = "schematic";
const SOURCE_FOOTPRINT: &str = "footprint";

const CASE_MISMATCH_CODE: &str = "catalog-name-case-mismatch";
const SOURCE_UNPARSEABLE_CODE: &str = "source-unparseable";

/// The catalog of one revision: `assembly.catalog` and the diagnostics the
/// catalog contributes ahead of the resolver's (`semantic_index_variants.py:1067-1069`).
pub(super) struct Catalog {
    /// `{name, description, sources}` entries, in catalog order.
    pub entries: Vec<Value>,
    /// `catalog-name-case-mismatch` and `source-unparseable`, in emission order.
    pub diagnostics: Vec<Value>,
}

/// Discover the variant catalog for one revision (`variant_catalog_service.py:270-333`).
pub(super) fn discover(input: &ProjectionInput<'_>) -> Result<Catalog, ProjectionError> {
    let mut builder = Builder::default();
    let project_file = input.config.project_file.0.as_str();

    project_names(input.sources, project_file, &mut builder);

    let board = board_records(input, &mut builder);
    if let Some(records) = &board {
        for (name, description) in &records.header {
            builder.add_board_name(name, description.clone(), SOURCE_PCB, "Board header");
        }
    }
    let footprint_names = board.map(|records| records.names).unwrap_or_default();

    schematic_walk(input, &mut builder);

    for name in &footprint_names {
        builder.add_board_name(name, None, SOURCE_FOOTPRINT, "Footprint record");
    }

    Ok(builder.finish())
}

/// `$.schematic.variants` (`variant_catalog_service.py:279-288`, `:177-211`).
fn project_names(sources: &dyn Sources, project_file: &str, builder: &mut Builder) {
    if !project_file.to_lowercase().ends_with(".kicad_pro") {
        return;
    }
    match project_registry(read_text(sources, project_file).as_deref()) {
        Some(entries) => {
            for (name, description) in entries {
                builder.add_project_name(&name, description);
            }
        }
        None => builder.source_unparseable(SOURCE_PROJECT, project_file),
    }
}

/// The board's header and footprint records (`variant_catalog_service.py:290-303`).
fn board_records(
    input: &ProjectionInput<'_>,
    builder: &mut Builder,
) -> Option<scan::SourceRecords> {
    let path = input.config.board.as_ref()?.0.as_str();
    let Some(text) = read_text(input.sources, path) else {
        builder.source_unparseable(SOURCE_PCB, path);
        return None;
    };
    let records = scan::scan(&text, "kicad_pcb");
    if !records.readable {
        builder.source_unparseable(SOURCE_PCB, path);
    }
    Some(records)
}

/// Walk the root schematic and every sheet it reaches in hierarchy order
/// (`variant_catalog_service.py:308-328`).
fn schematic_walk(input: &ProjectionInput<'_>, builder: &mut Builder) {
    let Some(root) = input
        .config
        .root_schematic
        .as_ref()
        .map(|path| path.0.clone())
    else {
        return;
    };
    let project_dir = parent_dir(&input.config.project_file.0).to_owned();
    let mut pending = vec![root];
    let mut visited: BTreeSet<String> = BTreeSet::new();
    while let Some(path) = pending.pop() {
        let Some(resolved) = normalize(&path) else {
            builder.source_unparseable(SOURCE_SCHEMATIC, basename(&path));
            continue;
        };
        if !visited.insert(resolved.clone()) {
            continue;
        }
        // Source files must stay within the project snapshot; never follow a
        // file-authored path into the host filesystem.
        if !within_project(&project_dir, &resolved) {
            builder.source_unparseable(SOURCE_SCHEMATIC, basename(&path));
            continue;
        }
        let records =
            read_text(input.sources, &resolved).map(|text| scan::scan(&text, "kicad_sch"));
        let Some(records) = records.filter(|records| records.readable) else {
            builder.source_unparseable(SOURCE_SCHEMATIC, &resolved);
            continue;
        };
        for name in &records.names {
            builder.add_schematic_name(name);
        }
        let directory = parent_dir(&resolved);
        for sheet in records.sheets.iter().rev() {
            pending.push(join(directory, sheet));
        }
    }
}

/// `(entries, readable)` for `$.schematic.variants` (`variant_catalog_service.py:177-211`);
/// `None` is `readable = False`.
fn project_registry(text: Option<&str>) -> Option<Vec<(String, Option<String>)>> {
    let raw: Value = serde_json::from_str(text?).ok()?;
    let object = raw.as_object()?;
    let Some(schematic) = object.get("schematic") else {
        return Some(Vec::new());
    };
    if schematic.is_null() {
        return Some(Vec::new());
    }
    let schematic = schematic.as_object()?;
    let Some(variants) = schematic.get("variants") else {
        return Some(Vec::new());
    };
    if variants.is_null() {
        return Some(Vec::new());
    }
    let mut entries = Vec::new();
    for item in variants.as_array()? {
        let Some(item) = item.as_object() else {
            continue;
        };
        let Some(name) = item.get("name").and_then(Value::as_str) else {
            continue;
        };
        if name.is_empty() || name == "< Default >" {
            continue;
        }
        let description = item
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_owned);
        entries.push((name.to_owned(), description));
    }
    Some(entries)
}

/// The ordered catalog plus diagnostics, with the packet's fold rules
/// (`variant_catalog_service.py:60-174`).
#[derive(Default)]
struct Builder {
    entries: Vec<Entry>,
    diagnostics: Vec<Value>,
    case_folds: BTreeSet<(String, String)>,
}

/// One catalog entry before it becomes a wire value.
struct Entry {
    name: String,
    description: Option<String>,
    sources: Vec<&'static str>,
}

impl Builder {
    /// `add_project_name` (`variant_catalog_service.py:68-80`).
    fn add_project_name(&mut self, name: &str, description: Option<String>) {
        if let Some(index) = self.exact(name) {
            self.add_source(index, SOURCE_PROJECT);
            self.merge_description(index, description);
            return;
        }
        self.entries.push(Entry {
            name: name.to_owned(),
            description,
            sources: vec![SOURCE_PROJECT],
        });
    }

    /// `add_board_name` (`variant_catalog_service.py:82-101`).
    fn add_board_name(
        &mut self,
        name: &str,
        description: Option<String>,
        source: &'static str,
        kind: &str,
    ) {
        if let Some(index) = self.folded(name) {
            self.add_source(index, source);
            self.merge_description(index, description);
            let folded_into = self.entries[index].name.clone();
            if folded_into != name {
                self.case_mismatch(kind, name, &folded_into);
            }
            return;
        }
        self.entries.push(Entry {
            name: name.to_owned(),
            description,
            sources: vec![source],
        });
    }

    /// `add_schematic_name` (`variant_catalog_service.py:103-110`).
    fn add_schematic_name(&mut self, name: &str) {
        if let Some(index) = self.exact(name) {
            self.add_source(index, SOURCE_SCHEMATIC);
            return;
        }
        self.entries.push(Entry {
            name: name.to_owned(),
            description: None,
            sources: vec![SOURCE_SCHEMATIC],
        });
    }

    /// `source_unparseable` (`variant_catalog_service.py:112-121`).
    fn source_unparseable(&mut self, source: &str, path: &str) {
        self.diagnostics.push(json!({
            "code": SOURCE_UNPARSEABLE_CODE,
            "severity": "error",
            "source": source,
            "path": path,
            "message": format!("Could not read {path} as a KiCad source."),
        }));
    }

    /// `_case_mismatch` (`variant_catalog_service.py:123-136`).
    fn case_mismatch(&mut self, kind: &str, found: &str, folded_into: &str) {
        if !self
            .case_folds
            .insert((found.to_owned(), folded_into.to_owned()))
        {
            return;
        }
        self.diagnostics.push(json!({
            "code": CASE_MISMATCH_CODE,
            "severity": "warning",
            "source": SOURCE_PCB,
            "message": format!("{kind} name \"{found}\" folded into \"{folded_into}\"."),
            "detail": {"found": found, "folded_into": folded_into},
        }));
    }

    /// `_exact` (`variant_catalog_service.py:138-139`).
    fn exact(&self, name: &str) -> Option<usize> {
        self.entries.iter().position(|entry| entry.name == name)
    }

    /// `_folded` (`variant_catalog_service.py:141-150`).
    fn folded(&self, name: &str) -> Option<usize> {
        let folded = name.to_lowercase();
        self.entries
            .iter()
            .position(|entry| entry.name.to_lowercase() == folded)
    }

    /// `_add_source` (`variant_catalog_service.py:166-169`).
    fn add_source(&mut self, index: usize, source: &'static str) {
        let sources = &mut self.entries[index].sources;
        if !sources.contains(&source) {
            sources.push(source);
        }
    }

    /// `_merge_description` (`variant_catalog_service.py:172-174`).
    fn merge_description(&mut self, index: usize, description: Option<String>) {
        let entry = &mut self.entries[index];
        if entry.description.is_none() {
            entry.description = description;
        }
    }

    /// `variants()` and `diagnostics()` (`variant_catalog_service.py:152-163`).
    fn finish(self) -> Catalog {
        let entries = self
            .entries
            .into_iter()
            .map(|entry| {
                json!({
                    "name": entry.name,
                    "description": entry.description,
                    "sources": entry.sources,
                })
            })
            .collect();
        Catalog {
            entries,
            diagnostics: self.diagnostics,
        }
    }
}

/// `_read_text` (`variant_catalog_service.py:53-57`): UTF-8 only, else `None`.
fn read_text(sources: &dyn Sources, path: &str) -> Option<String> {
    String::from_utf8(sources.read(path)?).ok()
}

/// The parent directory of a repository path, `""` at the root.
fn parent_dir(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(dir, _)| dir)
}

/// The last segment of a repository path.
fn basename(path: &str) -> &str {
    path.rsplit_once('/').map_or(path, |(_, name)| name)
}

/// Join a directory and a sheet name (`Path.parent / name`).
fn join(directory: &str, name: &str) -> String {
    if directory.is_empty() {
        name.to_owned()
    } else {
        format!("{directory}/{name}")
    }
}

/// Lexically resolve `.` and `..` (`Path.resolve`); `None` when it escapes
/// above the repository root.
fn normalize(path: &str) -> Option<String> {
    if path.starts_with('/') {
        return None;
    }
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            name => parts.push(name),
        }
    }
    Some(parts.join("/"))
}

/// Whether a repository path stays inside the project directory
/// (`path.is_relative_to(snapshot.root)`).
fn within_project(project_dir: &str, path: &str) -> bool {
    project_dir.is_empty() || path.starts_with(&format!("{project_dir}/"))
}
