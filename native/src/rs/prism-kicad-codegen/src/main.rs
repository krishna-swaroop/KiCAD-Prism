//! Deterministic Rust projection from TypeSpec-generated JSON Schemas.

use anyhow::{Context, Result, bail};
use schemars::schema::RootSchema;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use typify::{TypeSpace, TypeSpaceSettings};

mod config_projection;
mod materialization_projection;
mod prism_presence;
mod schemas;

use prism_presence::{is_nested_option_type, is_option_type};
use schemas::SCHEMAS;

const PLOTTER_OPERATION_KINDS: [(&str, &str, &str); 14] = [
    (
        "ThickSegmentOperation",
        "ThickSegment",
        "deserialize_thick_segment_kind",
    ),
    (
        "ArcThreePointOperation",
        "ArcThreePoint",
        "deserialize_arc_three_point_kind",
    ),
    ("CircleOperation", "Circle", "deserialize_circle_kind"),
    ("RectOperation", "Rect", "deserialize_rect_kind"),
    (
        "PlotPolyOperation",
        "PlotPoly",
        "deserialize_plot_poly_kind",
    ),
    (
        "BezierCurveOperation",
        "BezierCurve",
        "deserialize_bezier_curve_kind",
    ),
    ("TextOperation", "Text", "deserialize_text_kind"),
    (
        "PlotImageOperation",
        "PlotImage",
        "deserialize_plot_image_kind",
    ),
    (
        "FlashPadCircleOperation",
        "FlashPadCircle",
        "deserialize_flash_pad_circle_kind",
    ),
    (
        "FlashPadOvalOperation",
        "FlashPadOval",
        "deserialize_flash_pad_oval_kind",
    ),
    (
        "FlashPadRectOperation",
        "FlashPadRect",
        "deserialize_flash_pad_rect_kind",
    ),
    (
        "FlashPadRoundRectOperation",
        "FlashPadRoundRect",
        "deserialize_flash_pad_round_rect_kind",
    ),
    (
        "FlashPadCustomOperation",
        "FlashPadCustom",
        "deserialize_flash_pad_custom_kind",
    ),
    (
        "FlashPadTrapezOperation",
        "FlashPadTrapez",
        "deserialize_flash_pad_trapez_kind",
    ),
];

const BOARD_FOOTPRINT_OPERATION_KINDS: [(&str, &str, &str); 15] = [
    (
        "BoardFootprintThickSegmentOperation",
        "ThickSegment",
        "deserialize_thick_segment_kind",
    ),
    (
        "BoardFootprintArcThreePointOperation",
        "ArcThreePoint",
        "deserialize_arc_three_point_kind",
    ),
    (
        "BoardFootprintCircleOperation",
        "Circle",
        "deserialize_circle_kind",
    ),
    (
        "BoardFootprintRectOperation",
        "Rect",
        "deserialize_rect_kind",
    ),
    (
        "BoardFootprintPlotPolyOperation",
        "PlotPoly",
        "deserialize_plot_poly_kind",
    ),
    (
        "BoardFootprintBezierCurveOperation",
        "BezierCurve",
        "deserialize_bezier_curve_kind",
    ),
    (
        "BoardFootprintTextOperation",
        "Text",
        "deserialize_text_kind",
    ),
    (
        "BoardFootprintFlashPadCircleOperation",
        "FlashPadCircle",
        "deserialize_flash_pad_circle_kind",
    ),
    (
        "BoardFootprintFlashPadOvalOperation",
        "FlashPadOval",
        "deserialize_flash_pad_oval_kind",
    ),
    (
        "BoardFootprintFlashPadRectOperation",
        "FlashPadRect",
        "deserialize_flash_pad_rect_kind",
    ),
    (
        "BoardFootprintFlashPadRoundRectOperation",
        "FlashPadRoundRect",
        "deserialize_flash_pad_round_rect_kind",
    ),
    (
        "BoardFootprintFlashPadCustomOperation",
        "FlashPadCustom",
        "deserialize_flash_pad_custom_kind",
    ),
    (
        "BoardFootprintFlashPadTrapezOperation",
        "FlashPadTrapez",
        "deserialize_flash_pad_trapez_kind",
    ),
    (
        "BoardFootprintStartBlockOperation",
        "StartBlock",
        "deserialize_start_block_kind",
    ),
    (
        "BoardFootprintEndBlockOperation",
        "EndBlock",
        "deserialize_end_block_kind",
    ),
];

const SCHEMATIC_RECORD_KINDS: [(&str, &str, &str); 23] = [
    (
        "SchematicSheetHeaderPlotRecord",
        "sheet_header",
        "deserialize_sheet_header_kind",
    ),
    (
        "SchematicWirePlotRecord",
        "wire",
        "deserialize_wire_record_kind",
    ),
    (
        "SchematicBusPlotRecord",
        "bus",
        "deserialize_bus_record_kind",
    ),
    (
        "SchematicBusEntryPlotRecord",
        "bus_entry",
        "deserialize_bus_entry_record_kind",
    ),
    (
        "SchematicJunctionPlotRecord",
        "junction",
        "deserialize_junction_record_kind",
    ),
    (
        "SchematicNoConnectPlotRecord",
        "no_connect",
        "deserialize_no_connect_record_kind",
    ),
    (
        "SchematicLabelPlotRecord",
        "label",
        "deserialize_label_record_kind",
    ),
    (
        "SchematicGlobalLabelPlotRecord",
        "global_label",
        "deserialize_global_label_record_kind",
    ),
    (
        "SchematicHierarchicalLabelPlotRecord",
        "hierarchical_label",
        "deserialize_hierarchical_label_record_kind",
    ),
    (
        "SchematicNetclassFlagPlotRecord",
        "netclass_flag",
        "deserialize_netclass_flag_record_kind",
    ),
    (
        "SchematicTextPlotRecord",
        "text",
        "deserialize_text_record_kind",
    ),
    (
        "SchematicTextBoxPlotRecord",
        "text_box",
        "deserialize_text_box_record_kind",
    ),
    (
        "SchematicGraphicPolylinePlotRecord",
        "graphic_polyline",
        "deserialize_graphic_polyline_record_kind",
    ),
    (
        "SchematicGraphicArcPlotRecord",
        "graphic_arc",
        "deserialize_graphic_arc_record_kind",
    ),
    (
        "SchematicGraphicCirclePlotRecord",
        "graphic_circle",
        "deserialize_graphic_circle_record_kind",
    ),
    (
        "SchematicGraphicRectanglePlotRecord",
        "graphic_rectangle",
        "deserialize_graphic_rectangle_record_kind",
    ),
    (
        "SchematicGraphicBezierPlotRecord",
        "graphic_bezier",
        "deserialize_graphic_bezier_record_kind",
    ),
    (
        "SchematicRuleAreaPlotRecord",
        "rule_area",
        "deserialize_rule_area_record_kind",
    ),
    (
        "SchematicImagePlotRecord",
        "image",
        "deserialize_image_record_kind",
    ),
    (
        "SchematicTablePlotRecord",
        "table",
        "deserialize_table_record_kind",
    ),
    (
        "SchematicSymbolInstancePlotRecord",
        "symbol_instance",
        "deserialize_symbol_instance_record_kind",
    ),
    (
        "SchematicSymbolOverplotPlotRecord",
        "symbol_overplot",
        "deserialize_symbol_overplot_record_kind",
    ),
    (
        "SchematicSheetPlotRecord",
        "sheet",
        "deserialize_sheet_record_kind",
    ),
];

const SCHEMATIC_SYMBOL_OPERATION_KINDS: [(&str, &str, &str); 16] = [
    (
        "ThickSegmentOperation",
        "ThickSegment",
        "deserialize_thick_segment_kind",
    ),
    (
        "ArcThreePointOperation",
        "ArcThreePoint",
        "deserialize_arc_three_point_kind",
    ),
    ("CircleOperation", "Circle", "deserialize_circle_kind"),
    ("RectOperation", "Rect", "deserialize_rect_kind"),
    (
        "PlotPolyOperation",
        "PlotPoly",
        "deserialize_plot_poly_kind",
    ),
    (
        "BezierCurveOperation",
        "BezierCurve",
        "deserialize_bezier_curve_kind",
    ),
    ("TextOperation", "Text", "deserialize_text_kind"),
    (
        "PlotImageOperation",
        "PlotImage",
        "deserialize_plot_image_kind",
    ),
    (
        "FlashPadCircleOperation",
        "FlashPadCircle",
        "deserialize_flash_pad_circle_kind",
    ),
    (
        "FlashPadOvalOperation",
        "FlashPadOval",
        "deserialize_flash_pad_oval_kind",
    ),
    (
        "FlashPadRectOperation",
        "FlashPadRect",
        "deserialize_flash_pad_rect_kind",
    ),
    (
        "FlashPadRoundRectOperation",
        "FlashPadRoundRect",
        "deserialize_flash_pad_round_rect_kind",
    ),
    (
        "FlashPadCustomOperation",
        "FlashPadCustom",
        "deserialize_flash_pad_custom_kind",
    ),
    (
        "FlashPadTrapezOperation",
        "FlashPadTrapez",
        "deserialize_flash_pad_trapez_kind",
    ),
    (
        "SchematicSymbolStartBlockOperation",
        "StartBlock",
        "deserialize_start_block_kind",
    ),
    (
        "SchematicSymbolEndBlockOperation",
        "EndBlock",
        "deserialize_end_block_kind",
    ),
];

const SCHEMATIC_SHEET_OPERATION_KINDS: [(&str, &str, &str); 6] = [
    (
        "ThickSegmentOperation",
        "ThickSegment",
        "deserialize_thick_segment_kind",
    ),
    ("RectOperation", "Rect", "deserialize_rect_kind"),
    (
        "PlotPolyOperation",
        "PlotPoly",
        "deserialize_plot_poly_kind",
    ),
    ("TextOperation", "Text", "deserialize_text_kind"),
    (
        "SchematicSheetStartBlockOperation",
        "StartBlock",
        "deserialize_start_block_kind",
    ),
    (
        "SchematicSheetEndBlockOperation",
        "EndBlock",
        "deserialize_end_block_kind",
    ),
];

const SCHEMATIC_REQUEST_U64_FIELDS: [&str; 15] = [
    "max_source_bytes",
    "max_worksheet_bytes",
    "max_output_bytes",
    "max_text_bytes",
    "max_metadata_bytes",
    "max_image_encoded_bytes",
    "max_image_decoded_bytes",
    "max_image_pixels",
    "max_image_decode_work",
    "max_symbol_overlap_checks",
    "max_text_variable_bytes",
    "max_worksheet_bitmap_encoded_bytes",
    "max_worksheet_bitmap_decoded_bytes",
    "max_worksheet_bitmap_pixels",
    "max_worksheet_bitmap_decode_work",
];

fn main() -> Result<()> {
    let arguments: Vec<String> = env::args().skip(1).collect();
    if arguments
        .first()
        .is_some_and(|value| value == "--standalone")
    {
        return generate_standalone(&arguments[1..]);
    }
    let check = env::args().skip(1).any(|argument| argument == "--check");
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let schema_root = root.join("contracts/generated/schema");
    let output_root = root.join("src/rs/prism-kicad-contracts/src/generated");
    let mut expected = BTreeMap::new();
    let mut modules = Vec::new();

    for (schema_name, output_name) in materialization_projection::with_schemas(SCHEMAS) {
        let schema_path = schema_root.join(schema_name);
        let mut schema: Value = serde_json::from_slice(
            &fs::read(&schema_path).with_context(|| format!("read {}", schema_path.display()))?,
        )?;
        let published_schema = schema.clone();
        validate_plotter_operation_kinds(schema_name, &schema)?;
        materialization_projection::project_schema(schema_name, &mut schema)?;
        flatten_board_footprint_operation_extensions(schema_name, &mut schema)?;
        project_schematic_request_fields(schema_name, &mut schema)?;
        project_native_external_references(schema_name, &mut schema)?;
        inline_prism_external_roots(&schema_root, &mut schema)?;
        strip_prism_patterns(&mut schema);
        if schema
            .get("$id")
            .and_then(Value::as_str)
            .is_some_and(|id| id.starts_with("urn:prism:schema:"))
        {
            // Name the generated root after its model (BundleManifestA3,
            // CliVersionA0), not after its human title.
            let model = schema_name.trim_end_matches(".json").to_owned();
            schema["title"] = Value::String(model);
        }
        project_native_handshake_tuple(schema_name, &mut schema)?;
        project_for_typify(&mut schema);
        promote_disjoint_record_unions(&mut schema);
        project_tri_state_via_drill_layers(&mut schema);
        let is_prism = schema
            .get("$id")
            .and_then(Value::as_str)
            .is_some_and(|id| id.starts_with("urn:prism:schema:"));
        let declared_order = if is_prism {
            declared_property_order(&schema)
        } else {
            BTreeMap::new()
        };
        let kind_constants = if is_prism {
            variant_kind_constants(&schema)
        } else {
            BTreeMap::new()
        };
        let mut generated = project_generated_presence(
            schema_name,
            &published_schema,
            generate(schema_name, schema)?,
        )?;
        if is_prism {
            generated = prism_presence::project_optional_nullable(
                schema_name,
                &published_schema,
                generated,
            )?;
            generated = buffer_untagged_through_value(schema_name, &generated, &kind_constants)?;
            generated = restore_declared_field_order(schema_name, &generated, &declared_order)?;
            generated = rustfmt(&generated)?;
        }
        expected.insert(output_root.join(output_name), generated);
        modules.push(output_name.trim_end_matches(".rs"));
    }
    modules.sort_unstable();
    let module_source = format!(
        "//! TypeSpec-generated modules. Regenerate; do not edit module contents.\n\n{}\n",
        modules
            .into_iter()
            .map(|module| format!("pub mod {module};"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    expected.insert(output_root.join("mod.rs"), module_source);

    for (path, content) in expected {
        if check {
            let current = fs::read_to_string(&path)
                .with_context(|| format!("missing generated Rust file {}", path.display()))?;
            if current != content {
                bail!("stale generated Rust file {}", path.display());
            }
        } else {
            fs::write(&path, content).with_context(|| format!("write {}", path.display()))?;
        }
    }
    Ok(())
}

/// Generate a downstream-owned contract without modifying Monkey's catalog.
fn generate_standalone(arguments: &[String]) -> Result<()> {
    if !(arguments.len() == 2 || (arguments.len() == 3 && arguments[2] == "--check")) {
        bail!("usage: prism-kicad-codegen --standalone SCHEMA OUTPUT [--check]");
    }
    let schema_path = PathBuf::from(&arguments[0]);
    let output = PathBuf::from(&arguments[1]);
    let mut schema: Value = serde_json::from_slice(&fs::read(&schema_path)?)?;
    let published = schema.clone();
    project_for_typify(&mut schema);
    let generated = config_projection::preserve_config_presence(
        &published,
        generate("Cruncher PCB SVG config", schema)?,
    )?;
    if arguments.len() == 3 {
        if fs::read_to_string(&output)? != generated {
            bail!("stale generated Rust file {}", output.display());
        }
    } else {
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(output, generated)?;
    }
    Ok(())
}

fn flatten_board_footprint_operation_extensions(
    schema_name: &str,
    schema: &mut Value,
) -> Result<()> {
    if schema_name != "BoardPlotDocument.json" {
        return Ok(());
    }
    for (structure, _, _) in BOARD_FOOTPRINT_OPERATION_KINDS.iter().take(13) {
        if schema
            .pointer(&format!("/$defs/{structure}/allOf"))
            .is_none()
        {
            continue;
        }
        let base_reference = schema
            .pointer(&format!("/$defs/{structure}/allOf/0/$ref"))
            .and_then(Value::as_str)
            .with_context(|| format!("missing generated {structure} base reference"))?;
        let base = base_reference
            .strip_prefix("#/$defs/")
            .with_context(|| format!("{structure} base reference leaves $defs"))?;
        let base_properties = schema
            .pointer(&format!("/$defs/{base}/properties"))
            .and_then(Value::as_object)
            .with_context(|| format!("missing generated {base} properties"))?
            .clone();
        let base_required = schema.pointer(&format!("/$defs/{base}/required")).cloned();
        let extension = schema
            .pointer_mut(&format!("/$defs/{structure}"))
            .and_then(Value::as_object_mut)
            .with_context(|| format!("missing generated {structure}"))?;
        extension.remove("allOf");
        let properties = extension
            .get_mut("properties")
            .and_then(Value::as_object_mut)
            .with_context(|| format!("missing generated {structure} properties"))?;
        for (name, property) in base_properties {
            if properties.insert(name.clone(), property).is_some() {
                bail!("{structure} unexpectedly redeclared base property {name}");
            }
        }
        if let Some(required) = base_required {
            extension.insert("required".to_owned(), required);
        }
    }
    Ok(())
}

fn validate_plotter_operation_kinds(schema_name: &str, schema: &Value) -> Result<()> {
    if !matches!(
        schema_name,
        "BoardPlotDocument.json"
            | "FootprintPlotDocument.json"
            | "SchematicPlotDocument.json"
            | "SymbolPlotDocument.json"
    ) {
        return Ok(());
    }
    validate_operation_union(
        schema_name,
        schema,
        "PlotterOperation",
        &PLOTTER_OPERATION_KINDS,
    )?;
    if schema_name == "BoardPlotDocument.json" {
        validate_operation_union(
            schema_name,
            schema,
            "BoardFootprintOperation",
            &BOARD_FOOTPRINT_OPERATION_KINDS,
        )?;
    }
    if schema_name == "SchematicPlotDocument.json" {
        validate_operation_union(
            schema_name,
            schema,
            "SchematicPlotRecord",
            &SCHEMATIC_RECORD_KINDS,
        )?;
        validate_operation_union(
            schema_name,
            schema,
            "SchematicSymbolOperation",
            &SCHEMATIC_SYMBOL_OPERATION_KINDS,
        )?;
        validate_operation_union(
            schema_name,
            schema,
            "SchematicSheetOperation",
            &SCHEMATIC_SHEET_OPERATION_KINDS,
        )?;
    }
    Ok(())
}

pub(crate) fn validate_operation_union(
    schema_name: &str,
    schema: &Value,
    union: &str,
    expected_kinds: &[(&str, &str, &str)],
) -> Result<()> {
    let members = schema
        .pointer(&format!("/$defs/{union}/anyOf"))
        .and_then(Value::as_array)
        .with_context(|| format!("missing {schema_name} {union} union"))?;
    let mut actual = BTreeMap::new();
    for member in members {
        let reference = member
            .get("$ref")
            .and_then(Value::as_str)
            .with_context(|| format!("{schema_name} {union} member is not a reference"))?;
        let structure = reference
            .strip_prefix("#/$defs/")
            .with_context(|| format!("{schema_name} {union} reference leaves $defs"))?;
        let kind = literal_kind_for_structure(schema, structure)?;
        if actual.insert(structure, kind).is_some() {
            bail!("duplicate {schema_name} {union} member {structure}");
        }
    }
    let expected = expected_kinds
        .iter()
        .map(|(structure, kind, _)| (*structure, *kind))
        .collect::<BTreeMap<_, _>>();
    if actual != expected {
        bail!("{schema_name} {union} union changed; update exact-kind projection");
    }
    Ok(())
}

fn literal_kind_for_structure<'a>(schema: &'a Value, structure: &str) -> Result<&'a str> {
    if let Some(kind) = schema
        .pointer(&format!("/$defs/{structure}/properties/kind/const"))
        .and_then(Value::as_str)
    {
        return Ok(kind);
    }
    let reference = schema
        .pointer(&format!("/$defs/{structure}/allOf/0/$ref"))
        .and_then(Value::as_str)
        .with_context(|| format!("missing literal kind or base operation for {structure}"))?;
    let base = reference
        .strip_prefix("#/$defs/")
        .with_context(|| format!("{structure} base operation reference leaves $defs"))?;
    schema
        .pointer(&format!("/$defs/{base}/properties/kind/const"))
        .and_then(Value::as_str)
        .with_context(|| format!("missing literal kind for {structure} base {base}"))
}

fn project_generated_presence(
    schema_name: &str,
    published_schema: &Value,
    source: String,
) -> Result<String> {
    if !uses_strict_presence_projection(schema_name) {
        return Ok(source);
    }
    let mut projected = source;
    if schema_name == "SchematicPlotRequest.json" {
        projected = project_schematic_request_u64_strings(projected)?;
    }
    let is_document = matches!(
        schema_name,
        "BoardPlotDocument.json"
            | "FootprintPlotDocument.json"
            | "SchematicPlotDocument.json"
            | "SymbolPlotDocument.json"
    );
    if is_document
        && matches!(
            schema_name,
            "FootprintPlotDocument.json" | "SchematicPlotDocument.json" | "SymbolPlotDocument.json"
        )
    {
        let original = r#"    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub render_cache_polygons: ::std::vec::Vec<::std::vec::Vec<PlotterPoint>>,"#;
        let replacement = r#"    #[serde(
        default,
        deserialize_with = "crate::reject_present_render_cache_polygons",
        skip_serializing_if = "::std::vec::Vec::is_empty"
    )]
    pub render_cache_polygons: ::std::vec::Vec<::std::vec::Vec<PlotterPoint>>,"#;
        if !projected.contains(original) {
            bail!("{schema_name} Text render-cache polygon projection changed");
        }
        projected = projected.replace(original, replacement);
    }
    if is_document {
        for (structure, _, deserializer) in PLOTTER_OPERATION_KINDS {
            projected = project_kind_deserializer(projected, structure, deserializer)?;
        }
    }
    if schema_name == "BoardPlotDocument.json" {
        for (structure, _, deserializer) in BOARD_FOOTPRINT_OPERATION_KINDS {
            projected = project_kind_deserializer(projected, structure, deserializer)?;
        }
    }
    if schema_name == "SchematicPlotDocument.json" {
        for (structure, _, deserializer) in SCHEMATIC_RECORD_KINDS {
            projected = project_kind_deserializer(projected, structure, deserializer)?;
        }
        for (structure, _, deserializer) in SCHEMATIC_SYMBOL_OPERATION_KINDS
            .into_iter()
            .filter(|(structure, _, _)| structure.starts_with("SchematicSymbol"))
        {
            projected = project_kind_deserializer(projected, structure, deserializer)?;
        }
        for (structure, _, deserializer) in SCHEMATIC_SHEET_OPERATION_KINDS
            .into_iter()
            .filter(|(structure, _, _)| structure.starts_with("SchematicSheet"))
        {
            projected = project_kind_deserializer(projected, structure, deserializer)?;
        }
        projected = project_schematic_record_string(projected)?;
        projected = project_schematic_junction_color(projected)?;
        projected = project_schematic_segment_layers(projected)?;
    }
    projected = materialization_projection::project_kinds(schema_name, projected)?;
    projected = project_schema_presence(schema_name, published_schema, projected)?;
    // Presence and deterministic-map substitutions can cross rustfmt's line-width
    // boundary, so normalize the fully projected source as the final step.
    rustfmt(&projected)
}

fn project_schematic_segment_layers(mut source: String) -> Result<String> {
    let marker = "pub struct ThickSegmentOperation {";
    let start = source
        .find(marker)
        .context("missing generated ThickSegmentOperation")?;
    let end = source[start..]
        .find("\n}")
        .map(|offset| start + offset)
        .context("unterminated generated ThickSegmentOperation")?;
    let field = r#"    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub layers: ::std::vec::Vec<::std::string::String>,"#;
    let offset = source[start..end]
        .find(field)
        .map(|offset| start + offset)
        .context("missing generated ThickSegmentOperation.layers")?;
    let replacement = r#"    #[serde(
        default,
        deserialize_with = "crate::reject_present_schematic_segment_layers",
        skip_serializing_if = "::std::vec::Vec::is_empty"
    )]
    pub layers: ::std::vec::Vec<::std::string::String>,"#;
    source.replace_range(offset..offset + field.len(), replacement);
    Ok(source)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum FieldPresence {
    OptionalNonnullable,
    OptionalNullable,
    RequiredNullable,
}

fn uses_strict_presence_projection(schema_name: &str) -> bool {
    matches!(
        schema_name,
        "CompiledSchematicGraph.json"
            | "SourceBundleManifest.json"
            | "BoardPlotDocument.json"
            | "BoardPlotRequest.json"
            | "BoardPlotResult.json"
            | "FootprintPlotDocument.json"
            | "FootprintPlotRequest.json"
            | "FootprintPlotResult.json"
            | "SymbolPlotDocument.json"
            | "SymbolPlotRequest.json"
            | "SymbolPlotResult.json"
            | "SchematicPlotDocument.json"
            | "SchematicPlotRequest.json"
            | "SchematicPlotResult.json"
    ) || materialization_projection::is_schema(schema_name)
}

fn project_schema_presence(schema_name: &str, schema: &Value, source: String) -> Result<String> {
    let rules = schema_presence_rules(schema_name, schema)?;
    let mut syntax =
        syn::parse_file(&source).context("parse generated Rust for presence projection")?;
    let mut seen = BTreeSet::new();
    let mut projected_optionals = 0usize;
    let mut required_nullables = 0usize;

    for item in &mut syntax.items {
        let syn::Item::Struct(structure) = item else {
            continue;
        };
        let syn::Fields::Named(fields) = &mut structure.fields else {
            continue;
        };
        let structure_name = structure.ident.to_string();
        for field in &mut fields.named {
            let Some(field_ident) = &field.ident else {
                continue;
            };
            let rust_name = field_ident.to_string();
            let wire_name = serde_field_name(field)?.unwrap_or_else(|| rust_name.clone());
            let key = (structure_name.clone(), wire_name.clone());
            let Some(presence) = rules.get(&key).copied() else {
                continue;
            };
            seen.insert(key.clone());
            if !is_option_type(&field.ty) {
                // Vec/map/defaulted scalar projections already reject JSON null through
                // their native deserializers; only Option<T> needs a presence projection.
                continue;
            }
            let (optional_count, required_count) =
                project_presence_field(schema_name, field, presence, &wire_name, &rust_name, &key)?;
            projected_optionals += optional_count;
            required_nullables += required_count;
        }
    }

    let missing = rules
        .keys()
        .filter(|key| !seen.contains(*key))
        .map(|(structure, field)| format!("{structure}.{field}"))
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        bail!(
            "{schema_name} generated presence fields are missing: {}",
            missing.join(", ")
        );
    }
    let expected_required_nullables = rules
        .values()
        .filter(|presence| **presence == FieldPresence::RequiredNullable)
        .count();
    if required_nullables != expected_required_nullables {
        bail!(
            "{schema_name} required-nullable projection changed: {required_nullables} != {expected_required_nullables}"
        );
    }
    if rules
        .values()
        .any(|presence| *presence == FieldPresence::OptionalNonnullable)
        && projected_optionals == 0
    {
        bail!("{schema_name} has no projected optional nonnullable Option<T> fields");
    }
    Ok(prettyplease::unparse(&syntax))
}

fn project_presence_field(
    schema_name: &str,
    field: &mut syn::Field,
    presence: FieldPresence,
    wire_name: &str,
    rust_name: &str,
    key: &(String, String),
) -> Result<(usize, usize)> {
    let span = field
        .ident
        .as_ref()
        .context("generated field has no name")?
        .span();
    match presence {
        FieldPresence::OptionalNonnullable => {
            let replacement = if wire_name == rust_name {
                syn::parse_quote!(#[serde(
                    default,
                    deserialize_with = "crate::deserialize_present_nonnull",
                    skip_serializing_if = "::std::option::Option::is_none"
                )])
            } else {
                let wire_name = syn::LitStr::new(wire_name, span);
                syn::parse_quote!(#[serde(
                    rename = #wire_name,
                    default,
                    deserialize_with = "crate::deserialize_present_nonnull",
                    skip_serializing_if = "::std::option::Option::is_none"
                )])
            };
            replace_serde_presence_attr(field, replacement)?;
            Ok((1, 0))
        }
        FieldPresence::RequiredNullable => {
            let replacement = if wire_name == rust_name {
                syn::parse_quote!(#[serde(
                    deserialize_with = "crate::deserialize_required_nullable"
                )])
            } else {
                let wire_name = syn::LitStr::new(wire_name, span);
                syn::parse_quote!(#[serde(
                    rename = #wire_name,
                    deserialize_with = "crate::deserialize_required_nullable"
                )])
            };
            replace_serde_presence_attr(field, replacement)?;
            Ok((0, 1))
        }
        FieldPresence::OptionalNullable => {
            if key != &("SchematicJunctionPlotRecord".to_owned(), "color".to_owned())
                || !is_nested_option_type(&field.ty)
                || !has_deserializer(field, "deserialize_present_nullable_string")
            {
                bail!(
                    "{schema_name} optional-nullable projection changed at {}.{}",
                    key.0,
                    key.1
                );
            }
            Ok((0, 0))
        }
    }
}

fn serde_field_name(field: &syn::Field) -> Result<Option<String>> {
    let mut rename = None;
    for attribute in field
        .attrs
        .iter()
        .filter(|attribute| attribute.path().is_ident("serde"))
    {
        attribute.parse_nested_meta(|meta| {
            if meta.path.is_ident("rename") {
                let value = meta.value()?;
                rename = Some(value.parse::<syn::LitStr>()?.value());
            } else if meta.input.peek(syn::Token![=]) {
                let _ = meta.value()?.parse::<syn::Expr>()?;
            }
            Ok(())
        })?;
    }
    Ok(rename)
}

fn replace_serde_presence_attr(field: &mut syn::Field, replacement: syn::Attribute) -> Result<()> {
    let serde_attributes = field
        .attrs
        .iter()
        .filter(|attribute| attribute.path().is_ident("serde"))
        .count();
    if serde_attributes > 1 {
        bail!("generated optional field has multiple serde attributes");
    }
    field
        .attrs
        .retain(|attribute| !attribute.path().is_ident("serde"));
    field.attrs.push(replacement);
    Ok(())
}

fn has_deserializer(field: &syn::Field, needle: &str) -> bool {
    field.attrs.iter().any(|attribute| {
        attribute.path().is_ident("serde")
            && matches!(&attribute.meta, syn::Meta::List(list) if list.tokens.to_string().contains(needle))
    })
}

fn schema_presence_rules(
    schema_name: &str,
    schema: &Value,
) -> Result<BTreeMap<(String, String), FieldPresence>> {
    let mut objects = BTreeMap::new();
    objects.insert(
        schema_name.trim_end_matches(".json").to_owned() + "A0",
        schema,
    );
    if let Some(definitions) = schema.get("$defs").and_then(Value::as_object) {
        objects.extend(
            definitions
                .iter()
                .map(|(name, value)| (name.clone(), value)),
        );
    }

    let mut rules = BTreeMap::new();
    for (structure, object) in objects {
        let mut properties = BTreeMap::new();
        let mut required = BTreeSet::new();
        collect_object_shape(schema, object, &mut properties, &mut required)?;
        for (field, property) in properties {
            let nullable = schema_allows_null(property);
            let presence = match (required.contains(&field), nullable) {
                (false, false) => Some(FieldPresence::OptionalNonnullable),
                (false, true) => Some(FieldPresence::OptionalNullable),
                (true, true) => Some(FieldPresence::RequiredNullable),
                (true, false) => None,
            };
            if let Some(presence) = presence {
                rules.insert((structure.clone(), field.clone()), presence);
            }
        }
    }
    Ok(rules)
}

fn collect_object_shape<'a>(
    root: &'a Value,
    object: &'a Value,
    properties: &mut BTreeMap<String, &'a Value>,
    required: &mut BTreeSet<String>,
) -> Result<()> {
    if let Some(reference) = object.get("$ref").and_then(Value::as_str) {
        let name = reference
            .strip_prefix("#/$defs/")
            .with_context(|| format!("presence reference leaves $defs: {reference}"))?;
        let target = root
            .pointer(&format!("/$defs/{name}"))
            .with_context(|| format!("missing presence reference {reference}"))?;
        collect_object_shape(root, target, properties, required)?;
    }
    if let Some(parts) = object.get("allOf").and_then(Value::as_array) {
        for part in parts {
            collect_object_shape(root, part, properties, required)?;
        }
    }
    if let Some(fields) = object.get("properties").and_then(Value::as_object) {
        properties.extend(fields.iter().map(|(name, value)| (name.clone(), value)));
    }
    if let Some(names) = object.get("required").and_then(Value::as_array) {
        for name in names.iter().filter_map(Value::as_str) {
            if !properties.contains_key(name) {
                bail!("required presence field {name} has no property");
            }
            required.insert(name.to_owned());
        }
    }
    Ok(())
}

fn schema_allows_null(schema: &Value) -> bool {
    match schema.get("type") {
        Some(Value::String(kind)) if kind == "null" => return true,
        Some(Value::Array(kinds))
            if kinds
                .iter()
                .any(|kind| kind.as_str().is_some_and(|kind| kind == "null")) =>
        {
            return true;
        }
        _ => {}
    }
    ["anyOf", "oneOf"].into_iter().any(|key| {
        schema
            .get(key)
            .and_then(Value::as_array)
            .is_some_and(|members| members.iter().any(schema_allows_null))
    })
}

fn project_schematic_request_u64_strings(mut source: String) -> Result<String> {
    for field_name in SCHEMATIC_REQUEST_U64_FIELDS {
        let field = format!("    pub {field_name}: ::std::string::String,");
        if source.matches(&field).count() != 1 {
            bail!("SchematicPlotRequest.json {field_name} uint64 projection changed");
        }
        let replacement =
            format!("    #[serde(deserialize_with = \"crate::deserialize_u64_string\")]\n{field}");
        source = source.replacen(&field, &replacement, 1);
    }
    rustfmt(&source)
}

fn project_schematic_junction_color(mut source: String) -> Result<String> {
    let structure = "SchematicJunctionPlotRecord";
    let structure_marker = format!("pub struct {structure} {{");
    let structure_start = source
        .find(&structure_marker)
        .with_context(|| format!("missing generated {structure}"))?;
    let structure_end = source[structure_start..]
        .find("\n}")
        .map(|offset| structure_start + offset)
        .with_context(|| format!("unterminated generated {structure}"))?;
    let field = r#"    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub color: ::std::option::Option<::std::string::String>,"#;
    let field_offset = source[structure_start..structure_end]
        .find(field)
        .map(|offset| structure_start + offset)
        .with_context(|| format!("missing generated {structure}.color"))?;
    let replacement = r#"    #[serde(
        default,
        deserialize_with = "crate::deserialize_present_nullable_string",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub color: ::std::option::Option<::std::option::Option<::std::string::String>>,"#;
    source.replace_range(field_offset..field_offset + field.len(), replacement);
    Ok(source)
}

fn project_schematic_record_string(source: String) -> Result<String> {
    let hash_map = "::std::collections::HashMap<::std::string::String, ::std::string::String>";
    if !source.contains(hash_map) {
        bail!("SchematicPlotDocument.json RecordString map projection changed");
    }
    Ok(source.replace(
        hash_map,
        "::std::collections::BTreeMap<::std::string::String, ::std::string::String>",
    ))
}

pub(crate) fn project_kind_deserializer(
    mut source: String,
    structure: &str,
    deserializer: &str,
) -> Result<String> {
    let structure_marker = format!("pub struct {structure} {{");
    let structure_start = source
        .find(&structure_marker)
        .with_context(|| format!("missing generated {structure}"))?;
    let structure_end = source[structure_start..]
        .find("\n}")
        .map(|offset| structure_start + offset)
        .with_context(|| format!("unterminated generated {structure}"))?;
    let field = "    pub kind: ::std::string::String,";
    let field_offset = source[structure_start..structure_end]
        .find(field)
        .map(|offset| structure_start + offset)
        .with_context(|| format!("missing generated {structure}.kind"))?;
    let replacement =
        format!("    #[serde(deserialize_with = \"crate::{deserializer}\")]\n{field}");
    source.replace_range(field_offset..field_offset + field.len(), &replacement);
    Ok(source)
}

fn generate(schema_name: &str, value: Value) -> Result<String> {
    let is_prism = value
        .get("$id")
        .and_then(Value::as_str)
        .is_some_and(|id| id.starts_with("urn:prism:schema:"));
    let schema: RootSchema = serde_json::from_value(value)?;
    let mut settings = TypeSpaceSettings::default();
    settings.with_struct_builder(false);
    if is_prism {
        // conventions.md §9: maps serialize with keys in code point order.
        settings.with_map_type("::std::collections::BTreeMap");
    }
    settings.with_replacement(
        "JavaScriptSafeInteger",
        "crate::JavaScriptSafeInteger",
        [].into_iter(),
    );
    settings.with_replacement(
        "TextSafeInteger",
        "crate::JavaScriptSafeInteger",
        [].into_iter(),
    );
    settings.with_replacement(
        "NonNegativeFiniteFloat",
        "crate::NonNegativeFiniteFloat",
        [].into_iter(),
    );
    settings.with_replacement("FiniteFloat", "crate::FiniteFloat", [].into_iter());
    settings.with_replacement("PositiveUint32", "crate::PositiveU32", [].into_iter());
    settings.with_replacement(
        "SchematicPositiveUint32",
        "::std::num::NonZeroU32",
        [].into_iter(),
    );
    settings.with_replacement(
        "SchematicDefaultLineWidthNm",
        "crate::SchematicDefaultLineWidthNm",
        [].into_iter(),
    );
    settings.with_replacement(
        "SchematicTextOffsetRatio",
        "crate::NonNegativeFiniteFloat",
        [].into_iter(),
    );
    settings.with_replacement("StableTextId", "crate::StableTextId", [].into_iter());
    settings.with_replacement("NonEmptyText", "::std::string::String", [].into_iter());
    if matches!(
        schema_name,
        "NativeDesignFactsRequest.json" | "NativeDesignFactsRequestA1.json"
    ) {
        settings.with_replacement(
            "NativeSourceBundleManifestProjection",
            "crate::generated::source_bundle_manifest::SourceBundleManifestA0",
            [].into_iter(),
        );
    }
    if matches!(
        schema_name,
        "NativeDesignFactsResult.json" | "NativeDesignFactsResultA1.json"
    ) {
        settings.with_replacement(
            "NativeCompiledSchematicGraphProjection",
            "crate::generated::compiled_schematic_graph::CompiledSchematicGraphA0",
            [].into_iter(),
        );
    }
    if schema_name == "NativeSvgRenderRequest.json" {
        settings.with_replacement(
            "NativeFootprintPlotDocumentProjection",
            "::serde_json::Value",
            [].into_iter(),
        );
        settings.with_replacement(
            "NativeSymbolPlotDocumentProjection",
            "::serde_json::Value",
            [].into_iter(),
        );
        settings.with_replacement(
            "NativeBoardPlotDocumentProjection",
            "::serde_json::Value",
            [].into_iter(),
        );
        settings.with_replacement(
            "NativeSchematicPlotDocumentProjection",
            "::serde_json::Value",
            [].into_iter(),
        );
    }
    let mut type_space = TypeSpace::new(&settings);
    type_space.add_root_schema(schema)?;
    let body = type_space.to_stream().to_string();
    let source =
        format!("// Generated from TypeSpec JSON Schema through typify. Do not edit.\n\n{body}\n");
    let syntax = syn::parse_file(&source).context("parse generated Rust")?;
    rustfmt(&prettyplease::unparse(&syntax))
}

fn project_native_handshake_tuple(schema_name: &str, schema: &mut Value) -> Result<()> {
    let expected: &[&str] = match schema_name {
        "NativeHandshakeA1.json" => &["design-facts", "render-svg"],
        "NativeHandshakeA2.json" => &["design-facts", "render-svg", "design-facts-a1"],
        _ => return Ok(()),
    };
    let operations = schema
        .pointer_mut("/properties/operations")
        .and_then(Value::as_object_mut)
        .context("NativeHandshakeA1.json missing operations schema")?;
    if operations.get("minItems") != Some(&Value::from(expected.len()))
        || operations.get("maxItems") != Some(&Value::from(expected.len()))
    {
        bail!("{schema_name} operations tuple length changed");
    }
    let prefix_items = operations
        .remove("prefixItems")
        .and_then(|value| value.as_array().cloned())
        .with_context(|| format!("{schema_name} operations tuple projection changed"))?;
    if prefix_items.len() != expected.len()
        || prefix_items
            .iter()
            .zip(expected.iter().copied())
            .any(|(item, expected)| item.get("const").and_then(Value::as_str) != Some(expected))
    {
        bail!("{schema_name} operations tuple order changed");
    }
    operations.insert(
        "items".to_owned(),
        serde_json::json!({ "anyOf": prefix_items }),
    );
    Ok(())
}

fn project_native_external_references(schema_name: &str, schema: &mut Value) -> Result<()> {
    if schema_name == "NativeSvgRenderRequest.json" {
        let references = [
            (
                "/$defs/NativeFootprintSvgDocument/properties/value/$ref",
                "urn:wavenumber:schema:kicad_monkey.footprint_plot.document:a0",
                "NativeFootprintPlotDocumentProjection",
            ),
            (
                "/$defs/NativeSymbolSvgDocument/properties/value/$ref",
                "urn:wavenumber:schema:kicad_monkey.symbol_plot.document:a0",
                "NativeSymbolPlotDocumentProjection",
            ),
            (
                "/$defs/NativeBoardSvgDocument/properties/value/$ref",
                "urn:wavenumber:schema:kicad_monkey.board_plot.document:a0",
                "NativeBoardPlotDocumentProjection",
            ),
            (
                "/$defs/NativeSchematicSvgDocument/properties/value/$ref",
                "urn:wavenumber:schema:kicad_monkey.schematic_plot.document:a0",
                "NativeSchematicPlotDocumentProjection",
            ),
        ];
        for (pointer, external, projection) in references {
            project_native_reference(schema_name, schema, pointer, external, projection)?;
        }
        return Ok(());
    }
    let (pointer, external, projection) = match schema_name {
        "NativeDesignFactsRequest.json" | "NativeDesignFactsRequestA1.json" => (
            "/properties/manifest/$ref",
            "urn:wavenumber:schema:kicad_monkey.source_bundle_manifest:a0",
            "NativeSourceBundleManifestProjection",
        ),
        "NativeDesignFactsResult.json" | "NativeDesignFactsResultA1.json" => (
            "/properties/compiled_schematic_graph/$ref",
            "urn:wavenumber:schema:kicad_monkey.compiled_schematic_graph:a0",
            "NativeCompiledSchematicGraphProjection",
        ),
        _ => return Ok(()),
    };
    project_native_reference(schema_name, schema, pointer, external, projection)
}

fn project_native_reference(
    schema_name: &str,
    schema: &mut Value,
    pointer: &str,
    external: &str,
    projection: &str,
) -> Result<()> {
    let reference = schema
        .pointer_mut(pointer)
        .with_context(|| format!("missing {schema_name} external contract reference"))?;
    if reference.as_str() != Some(external) {
        bail!("{schema_name} external contract reference changed");
    }
    *reference = Value::String(format!("#/$defs/{projection}"));
    let definitions = schema
        .as_object_mut()
        .context("native transport schema root must be an object")?
        .entry("$defs")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()
        .with_context(|| format!("invalid {schema_name} definitions"))?;
    definitions.insert(projection.to_owned(), serde_json::json!({"type": "object"}));
    Ok(())
}

fn rustfmt(source: &str) -> Result<String> {
    let mut child = Command::new("rustfmt")
        .args(["--edition", "2024", "--emit", "stdout"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .context("start rustfmt for generated contract")?;
    child
        .stdin
        .take()
        .context("open rustfmt stdin")?
        .write_all(source.as_bytes())?;
    let output = child.wait_with_output()?;
    if !output.status.success() {
        bail!("rustfmt rejected generated contract source");
    }
    String::from_utf8(output.stdout).context("rustfmt output was not UTF-8")
}

fn promote_disjoint_record_unions(schema: &mut Value) {
    // TypeSpec emits record unions as `anyOf`. The board record variants are
    // value-disjoint on their `kind` discriminators, but typify's structural
    // exclusivity check cannot see const/enum property values (graphic and
    // track_arc records share the same required property names), so it
    // degrades the union to an unusable `subtype_N` option struct. Carrying
    // the disjointness assertion as `oneOf` in the Rust projection yields a
    // proper enum; the published schema keeps `anyOf` alongside the other
    // record unions.
    for pointer in [
        "/$defs/BoardPlotRecord",
        "/$defs/BoardFootprintOperation",
        "/$defs/SchematicPlotRecord",
    ] {
        if let Some(record) = schema.pointer_mut(pointer).and_then(Value::as_object_mut)
            && let Some(members) = record.remove("anyOf")
        {
            record.insert("oneOf".to_owned(), members);
        }
    }
}

fn project_tri_state_via_drill_layers(schema: &mut Value) {
    // The established board serializer distinguishes an absent `layers` key
    // (layerless graphic circles) from a present-but-empty `layers` array
    // (drill circles of unrouted vias). typify folds optional arrays into
    // `Vec` with `skip_serializing_if(is_empty)`, which cannot express the
    // present-but-empty state, so the Rust projection widens the board
    // circle's `layers` to a nullable array and gains `Option<Vec<String>>`.
    // The published schema keeps the plain optional array.
    if schema.pointer("/$defs/BoardPlotRecord").is_some()
        && let Some(layers) = schema
            .pointer_mut("/$defs/CircleOperation/properties/layers")
            .and_then(Value::as_object_mut)
    {
        layers.insert("type".to_owned(), serde_json::json!(["array", "null"]));
    }
}

fn project_schematic_request_fields(schema_name: &str, schema: &mut Value) -> Result<()> {
    if schema_name != "SchematicPlotRequest.json" {
        return Ok(());
    }
    let bounded = serde_json::json!({
        "type": "integer",
        "minimum": 1,
        "maximum": 4_294_967_295_u64,
    });
    for field in ["sheet_index", "sheet_count"] {
        let pointer = format!("/properties/{field}");
        let property = schema
            .pointer_mut(&pointer)
            .with_context(|| format!("missing SchematicPlotRequest.{field}"))?;
        if property != &bounded {
            bail!("SchematicPlotRequest.{field} positive-u32 schema changed");
        }
        *property = serde_json::json!({"$ref": "#/$defs/SchematicPositiveUint32"});
    }
    let definitions = schema
        .pointer_mut("/$defs")
        .and_then(Value::as_object_mut)
        .context("missing SchematicPlotRequest $defs")?;
    definitions.insert("SchematicPositiveUint32".to_owned(), bounded);

    let default_width = serde_json::json!({
        "type": "integer",
        "minimum": 84_700,
        "maximum": 9_007_199_254_740_991_i64,
    });
    let default_width_property = schema
        .pointer("/properties/default_line_width_nm")
        .context("missing SchematicPlotRequest.default_line_width_nm")?;
    let mut default_width_definition = schema
        .pointer("/$defs/SchematicDefaultLineWidthNm")
        .cloned()
        .context("missing SchematicDefaultLineWidthNm definition")?;
    default_width_definition
        .as_object_mut()
        .context("SchematicDefaultLineWidthNm must be an object")?
        .remove("description");
    if default_width_property != &serde_json::json!({"$ref": "#/$defs/SchematicDefaultLineWidthNm"})
        || default_width_definition != default_width
    {
        bail!("SchematicPlotRequest.default_line_width_nm schema changed");
    }

    let ratio = serde_json::json!({
        "type": "number",
        "minimum": 0,
        "maximum": 1.7976931348623157e308_f64,
    });
    let ratio_property = schema
        .pointer("/properties/text_offset_ratio")
        .context("missing SchematicPlotRequest.text_offset_ratio")?;
    let mut ratio_definition = schema
        .pointer("/$defs/SchematicTextOffsetRatio")
        .cloned()
        .context("missing SchematicTextOffsetRatio definition")?;
    ratio_definition
        .as_object_mut()
        .context("SchematicTextOffsetRatio must be an object")?
        .remove("description");
    if ratio_property != &serde_json::json!({"$ref": "#/$defs/SchematicTextOffsetRatio"})
        || ratio_definition != ratio
    {
        bail!("SchematicPlotRequest.text_offset_ratio schema changed");
    }
    Ok(())
}

fn project_for_typify(value: &mut Value) {
    match value {
        Value::Object(object) => {
            object.remove("$schema");
            if matches!(
                object.get("pattern").and_then(Value::as_str),
                Some("^(0|[1-9][0-9]{0,19})$")
                    | Some("^[0-9a-f]{64}$")
                    | Some("^[ -~]{4}$")
                    | Some("^[A-Za-z0-9][A-Za-z0-9._:-]*$")
            ) {
                // JSON Schema and the promoted semantic validators retain
                // the closed string grammars. Avoid adding a regex runtime to
                // generated Rust merely for small fixed tags and hashes.
                object.remove("pattern");
            }
            if let Some(entry) = object.remove("unevaluatedProperties") {
                let projected = if entry == serde_json::json!({"not": {}}) {
                    Value::Bool(false)
                } else {
                    entry
                };
                object
                    .entry("additionalProperties".to_owned())
                    .or_insert(projected);
            }
            for child in object.values_mut() {
                project_for_typify(child);
            }
        }
        Value::Array(values) => {
            for child in values {
                project_for_typify(child);
            }
        }
        _ => {}
    }
}

/// Prism's roots embed other Prism roots by `$id` (`urn:prism:schema:…`), which
/// typify cannot follow. Copy each referenced root into `$defs` under its
/// title-free root name and point the reference there, recursively. Two
/// different definitions under one name are an error, never merged.
fn inline_prism_external_roots(schema_root: &std::path::Path, schema: &mut Value) -> Result<()> {
    const PREFIX: &str = "urn:prism:schema:";
    let mut by_id: BTreeMap<String, (String, Value)> = BTreeMap::new();
    for entry in fs::read_dir(schema_root)? {
        let path = entry?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let root: Value = serde_json::from_slice(&fs::read(&path)?)?;
        if let Some(id) = root.get("$id").and_then(Value::as_str)
            && id.starts_with(PREFIX)
        {
            let name = path
                .file_stem()
                .and_then(|n| n.to_str())
                .context("schema file name")?
                .to_owned();
            by_id.insert(id.to_owned(), (name, root));
        }
    }
    let mut pending: Vec<String> = Vec::new();
    collect_prism_references(schema, PREFIX, &mut pending);
    let mut inlined = BTreeSet::new();
    while let Some(id) = pending.pop() {
        if !inlined.insert(id.clone()) {
            continue;
        }
        let (name, root) = by_id
            .get(&id)
            .with_context(|| format!("unknown Prism schema {id}"))?
            .clone();
        let mut body = root.clone();
        let nested = body
            .as_object_mut()
            .context("Prism root is not an object")?
            .remove("$defs");
        if let Some(object) = body.as_object_mut() {
            object.remove("$schema");
            object.remove("$id");
        }
        collect_prism_references(&body, PREFIX, &mut pending);
        let mut additions = vec![(name, body)];
        if let Some(Value::Object(definitions)) = nested {
            for (key, value) in definitions {
                collect_prism_references(&value, PREFIX, &mut pending);
                additions.push((key, value));
            }
        }
        let defs = schema
            .as_object_mut()
            .context("schema is not an object")?
            .entry("$defs")
            .or_insert_with(|| Value::Object(serde_json::Map::new()))
            .as_object_mut()
            .context("$defs is not an object")?;
        for (key, value) in additions {
            match defs.get(&key) {
                Some(existing) if *existing != value => {
                    bail!("inlining {id}: $defs/{key} already holds a different definition")
                }
                Some(_) => {}
                None => {
                    defs.insert(key, value);
                }
            }
        }
    }
    rewrite_prism_references(schema, PREFIX, &by_id);
    Ok(())
}

fn collect_prism_references(value: &Value, prefix: &str, out: &mut Vec<String>) {
    match value {
        Value::Object(object) => {
            if let Some(reference) = object.get("$ref").and_then(Value::as_str)
                && reference.starts_with(prefix)
            {
                out.push(reference.to_owned());
            }
            for child in object.values() {
                collect_prism_references(child, prefix, out);
            }
        }
        Value::Array(items) => items
            .iter()
            .for_each(|item| collect_prism_references(item, prefix, out)),
        _ => {}
    }
}

fn rewrite_prism_references(
    value: &mut Value,
    prefix: &str,
    by_id: &BTreeMap<String, (String, Value)>,
) {
    match value {
        Value::Object(object) => {
            if let Some(Value::String(reference)) = object.get_mut("$ref")
                && reference.starts_with(prefix)
                && let Some((name, _)) = by_id.get(reference.as_str())
            {
                *reference = format!("#/$defs/{name}");
            }
            for child in object.values_mut() {
                rewrite_prism_references(child, prefix, by_id);
            }
        }
        Value::Array(items) => items
            .iter_mut()
            .for_each(|item| rewrite_prism_references(item, prefix, by_id)),
        _ => {}
    }
}

/// Prism's string grammars (paths, ids, digests) stay in JSON Schema, which
/// the bundle tests and K's reader validate against; like the fork's fixed
/// tags above, they are not compiled into the generated Rust, which would need
/// a regex runtime. Applies only to Prism roots. Also promotes scalar unions
/// (see `promote_disjoint_scalar_union`).
fn strip_prism_patterns(schema: &mut Value) {
    if !schema
        .get("$id")
        .and_then(Value::as_str)
        .is_some_and(|id| id.starts_with("urn:prism:schema:"))
    {
        return;
    }
    fn walk(value: &mut Value) {
        match value {
            Value::Object(object) => {
                object.remove("pattern");
                promote_disjoint_scalar_union(object);
                object.values_mut().for_each(walk);
            }
            Value::Array(items) => items.iter_mut().for_each(walk),
            _ => {}
        }
    }
    walk(schema);
}

/// TypeSpec writes a union of scalars and models without `@oneOf` as `anyOf`,
/// which typify turns into a struct of flattened options that cannot hold a
/// bare value. When the members' JSON types are pairwise distinct (string,
/// number, boolean, object, null, and arrays told apart by element type),
/// exactly one can match, so `oneOf`
/// says the same thing and typify generates an untagged enum.
fn promote_disjoint_scalar_union(object: &mut serde_json::Map<String, Value>) {
    let Some(Value::Array(members)) = object.get("anyOf") else {
        return;
    };
    let mut kinds = BTreeSet::new();
    for member in members {
        let kind = match member.get("type").and_then(Value::as_str) {
            Some("integer") | Some("number") => "number".to_owned(),
            // Arrays are disjoint when their element types are.
            Some("array") => {
                let items = member.get("items").unwrap_or(&Value::Null);
                match (
                    items.get("type").and_then(Value::as_str),
                    items.get("$ref").and_then(Value::as_str),
                ) {
                    (Some("integer") | Some("number"), _) => "array:number".to_owned(),
                    (Some(item), _) => format!("array:{item}"),
                    (None, Some(_)) => "array:object".to_owned(),
                    (None, None) => return,
                }
            }
            Some(other) => other.to_owned(),
            // A reference to a named model or record is an object.
            None if member.get("$ref").is_some() => "object".to_owned(),
            None => return,
        };
        if !kinds.insert(kind) {
            return;
        }
    }
    if let Some(members) = object.remove("anyOf") {
        object.insert("oneOf".to_owned(), members);
    }
}

/// serde_json's `arbitrary_precision` feature, which the workspace enables,
/// breaks numbers inside a derived `#[serde(untagged)]` enum: serde buffers the
/// input and a decimal comes back as serde_json's private number map. For
/// Prism modules, an untagged enum therefore derives only `Serialize`, and
/// its `Deserialize` reads a `serde_json::Value`, which keeps numbers intact,
/// then tries the variants in declared order, as `untagged` does.
fn buffer_untagged_through_value(
    schema_name: &str,
    source: &str,
    kind_constants: &BTreeMap<String, String>,
) -> Result<String> {
    let mut file = syn::parse_file(source)
        .with_context(|| format!("parse generated Rust for {schema_name}"))?;
    let mut impls = Vec::new();
    for item in &mut file.items {
        let syn::Item::Enum(item_enum) = item else {
            continue;
        };
        let untagged = item_enum.attrs.iter().any(|attribute| {
            attribute.path().is_ident("serde")
                && attribute
                    .parse_args::<syn::Ident>()
                    .is_ok_and(|ident| ident == "untagged")
        });
        if !untagged {
            continue;
        }
        let name = item_enum.ident.to_string();
        let mut attempts = String::new();
        for variant in &item_enum.variants {
            let syn::Fields::Unnamed(fields) = &variant.fields else {
                bail!(
                    "{schema_name}: untagged {name}::{} is not a one-field tuple variant",
                    variant.ident
                );
            };
            if fields.unnamed.len() != 1 {
                bail!(
                    "{schema_name}: untagged {name}::{} has {} fields",
                    variant.ident,
                    fields.unnamed.len()
                );
            }
            let field = &fields.unnamed[0].ty;
            let ty = prettyplease::unparse(&syn::parse_quote!(type T = #field;))
                .trim()
                .trim_start_matches("type T = ")
                .trim_end_matches(';')
                .to_owned();
            // A @oneOf union of models: each variant's first property is a
            // `kind` constant (conventions.md §12). typify types `kind` as a
            // plain string, so dispatch on it exactly instead of trying.
            if let Some(kind) = kind_constants.get(&ty) {
                attempts.push_str(&format!(
                    "if value.get(\"kind\").and_then(::serde_json::Value::as_str) == Some({kind:?}) {{ return ::serde_json::from_value::<{ty}>(value).map(Self::{}).map_err(<D::Error as ::serde::de::Error>::custom); }}\n",
                    variant.ident
                ));
            } else {
                attempts.push_str(&format!(
                    "if let Ok(inner) = ::serde_json::from_value::<{ty}>(value.clone()) {{ return Ok(Self::{}(inner)); }}\n",
                    variant.ident
                ));
            }
        }
        for attribute in &mut item_enum.attrs {
            if attribute.path().is_ident("derive") {
                let paths: syn::punctuated::Punctuated<syn::Path, syn::Token![,]> =
                    attribute.parse_args_with(syn::punctuated::Punctuated::parse_terminated)?;
                let kept: Vec<String> = paths
                    .iter()
                    .filter(|path| {
                        path.segments
                            .last()
                            .is_none_or(|last| last.ident != "Deserialize")
                    })
                    .map(|path| {
                        prettyplease::unparse(&syn::parse_quote!(type T = #path;))
                            .trim()
                            .trim_start_matches("type T = ")
                            .trim_end_matches(';')
                            .to_owned()
                    })
                    .collect();
                *attribute = syn::parse_str::<syn::DeriveInput>(&format!(
                    "#[derive({})] struct S;",
                    kept.join(", ")
                ))?
                .attrs
                .remove(0);
            }
        }
        impls.push(format!(
            "impl<'de> ::serde::Deserialize<'de> for {name} {{\n\
             #[allow(clippy::too_many_lines, reason = \"generated: one dispatch arm per union variant\")]\n\
             fn deserialize<D: ::serde::Deserializer<'de>>(deserializer: D) -> ::std::result::Result<Self, D::Error> {{\n\
             let value = <::serde_json::Value as ::serde::Deserialize>::deserialize(deserializer)?;\n\
             {attempts}\
             Err(<D::Error as ::serde::de::Error>::custom(\"data did not match any variant of untagged enum {name}\"))\n\
             }}\n}}\n"
        ));
    }
    for source in impls {
        file.items
            .push(syn::parse_str(&source).context("parse generated Deserialize impl")?);
    }
    Ok(prettyplease::unparse(&file))
}

/// Property names in declared order, for the root (under its `title`) and for
/// every `$defs` entry. typify reads properties through schemars' sorted map,
/// so its structs come out in alphabetical order; conventions.md §13 wants
/// Prism members written in declared order, `schema` first.
fn declared_property_order(schema: &Value) -> BTreeMap<String, (Vec<String>, BTreeSet<String>)> {
    let mut order = BTreeMap::new();
    let mut add = |name: &str, definition: &Value| {
        if let Some(properties) = definition.get("properties").and_then(Value::as_object) {
            let required = definition
                .get("required")
                .and_then(Value::as_array)
                .map(|names| {
                    names
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            order.insert(
                name.to_owned(),
                (properties.keys().cloned().collect(), required),
            );
        }
    };
    if let Some(title) = schema.get("title").and_then(Value::as_str) {
        add(title, schema);
    }
    if let Some(definitions) = schema.get("$defs").and_then(Value::as_object) {
        for (name, definition) in definitions {
            add(name, definition);
        }
    }
    order
}

fn restore_declared_field_order(
    schema_name: &str,
    source: &str,
    order: &BTreeMap<String, (Vec<String>, BTreeSet<String>)>,
) -> Result<String> {
    let mut file = syn::parse_file(source)
        .with_context(|| format!("parse generated Rust for {schema_name}"))?;
    for item in &mut file.items {
        let syn::Item::Struct(item_struct) = item else {
            continue;
        };
        let Some((properties, required)) = order.get(&item_struct.ident.to_string()) else {
            continue;
        };
        let syn::Fields::Named(fields) = &mut item_struct.fields else {
            continue;
        };
        let json_name = |field: &syn::Field| -> String {
            for attribute in &field.attrs {
                if !attribute.path().is_ident("serde") {
                    continue;
                }
                let mut renamed = None;
                let _ = attribute.parse_nested_meta(|meta| {
                    if meta.path.is_ident("rename") {
                        renamed = Some(meta.value()?.parse::<syn::LitStr>()?.value());
                    } else if meta.input.peek(syn::Token![=]) {
                        let _ = meta.value()?.parse::<syn::Expr>()?;
                    }
                    Ok(())
                });
                if let Some(renamed) = renamed {
                    return renamed;
                }
            }
            field
                .ident
                .as_ref()
                .map(|ident| ident.to_string().trim_start_matches("r#").to_owned())
                .unwrap_or_default()
        };
        let mut sorted: Vec<syn::Field> = fields.named.iter().cloned().collect();
        let position = |field: &syn::Field| {
            let name = json_name(field);
            properties
                .iter()
                .position(|property| *property == name)
                .unwrap_or(usize::MAX)
        };
        if sorted.iter().any(|field| position(field) == usize::MAX) {
            bail!(
                "{schema_name}: {} has a field outside its declared properties",
                item_struct.ident
            );
        }
        sorted.sort_by_key(position);
        for field in &mut sorted {
            let optional = !required.contains(&json_name(field));
            drop_empty_collection_skip(field)?;
            if optional {
                wrap_optional_collection(field)?;
            }
        }
        fields.named = sorted.into_iter().collect();
    }
    Ok(prettyplease::unparse(&file))
}

/// For every `$defs` model whose `kind` property is a string constant, its name
/// and that constant: the discriminators of Prism's `@oneOf` unions.
fn variant_kind_constants(schema: &Value) -> BTreeMap<String, String> {
    let mut constants = BTreeMap::new();
    if let Some(definitions) = schema.get("$defs").and_then(Value::as_object) {
        for (name, definition) in definitions {
            if let Some(kind) = definition
                .pointer("/properties/kind/const")
                .and_then(Value::as_str)
            {
                constants.insert(name.clone(), kind.to_owned());
            }
        }
    }
    constants
}

/// typify skips an empty optional array or map on output
/// (`skip_serializing_if = "…is_empty"`). Prism writes `[]` and `{}` whenever
/// the value is present: arrays and maps are always present in new documents
/// (conventions.md §10), and parity documents reproduce today's empty lists.
/// Only `Option` fields are skipped when absent.
fn drop_empty_collection_skip(field: &mut syn::Field) -> Result<()> {
    for attribute in &mut field.attrs {
        if !attribute.path().is_ident("serde") {
            continue;
        }
        let mut kept: Vec<String> = Vec::new();
        let mut dropped = false;
        attribute.parse_nested_meta(|meta| {
            let path = meta
                .path
                .get_ident()
                .map(ToString::to_string)
                .unwrap_or_default();
            if meta.input.peek(syn::Token![=]) {
                let value: syn::Expr = meta.value()?.parse()?;
                let text = prettyplease::unparse(&syn::parse_quote!(const C: () = #value;));
                if path == "skip_serializing_if" && text.contains("is_empty") {
                    dropped = true;
                } else {
                    let value = text
                        .trim()
                        .trim_start_matches("const C: () = ")
                        .trim_end_matches(';')
                        .to_owned();
                    kept.push(format!("{path} = {value}"));
                }
            } else {
                kept.push(path);
            }
            Ok(())
        })?;
        if dropped {
            *attribute = syn::parse_str::<syn::DeriveInput>(&format!(
                "#[serde({})] struct S;",
                kept.join(", ")
            ))?
            .attrs
            .remove(0);
        }
    }
    Ok(())
}

/// typify gives an optional array or map `#[serde(default)]`, so an absent
/// field reads back as empty and is written as `[]`. Absent and empty are
/// different JSON values (conventions.md §10, and parity documents reproduce
/// today's absent fields), so an optional collection becomes an `Option`.
fn wrap_optional_collection(field: &mut syn::Field) -> Result<()> {
    let syn::Type::Path(path) = &field.ty else {
        return Ok(());
    };
    let Some(last) = path.path.segments.last() else {
        return Ok(());
    };
    if !matches!(last.ident.to_string().as_str(), "Vec" | "BTreeMap") {
        return Ok(());
    }
    let inner = field.ty.clone();
    field.ty = syn::parse_quote!(::std::option::Option<#inner>);
    for attribute in &mut field.attrs {
        if !attribute.path().is_ident("serde") {
            continue;
        }
        let mut kept: Vec<String> = Vec::new();
        attribute.parse_nested_meta(|meta| {
            let path = meta
                .path
                .get_ident()
                .map(ToString::to_string)
                .unwrap_or_default();
            if meta.input.peek(syn::Token![=]) {
                let value: syn::Expr = meta.value()?.parse()?;
                if path == "rename" {
                    let text = prettyplease::unparse(&syn::parse_quote!(const C: () = #value;));
                    kept.push(format!(
                        "rename = {}",
                        text.trim()
                            .trim_start_matches("const C: () = ")
                            .trim_end_matches(';')
                    ));
                }
            }
            Ok(())
        })?;
        kept.push("default".to_owned());
        kept.push("skip_serializing_if = \"::std::option::Option::is_none\"".to_owned());
        *attribute = syn::parse_str::<syn::DeriveInput>(&format!(
            "#[serde({})] struct S;",
            kept.join(", ")
        ))?
        .attrs
        .remove(0);
        return Ok(());
    }
    field.attrs.push(syn::parse_quote!(
        #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    ));
    Ok(())
}
