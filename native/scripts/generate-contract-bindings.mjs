import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "json-schema-to-typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaRoot = path.join(root, "contracts/generated/schema");
const check = process.argv.includes("--check");
const generatePython = process.argv.includes("--python");
const generateTypeScript = process.argv.includes("--typescript");
assert(generatePython || generateTypeScript, "select --python and/or --typescript");

const roots = [
  ["BuildRequest.json", "SExpressionBuildRequestA0", "build-request.ts"],
  ["BuildResult.json", "SExpressionBuildResultA0", "build-result.ts"],
  ["ScanRequest.json", "SExpressionScanRequestA0", "scan-request.ts"],
  ["ScanResult.json", "SExpressionScanResultA0", "scan-result.ts"],
  ["FootprintEditRequest.json", "FootprintEditRequestA0", "footprint-edit-request.ts"],
  ["FootprintEditResult.json", "FootprintEditResultA0", "footprint-edit-result.ts"],
  ["FootprintReadRequest.json", "FootprintReadRequestA0", "footprint-read-request.ts"],
  ["FootprintReadResult.json", "FootprintReadResultA0", "footprint-read-result.ts"],
  ["FootprintPlotDocument.json", "FootprintPlotDocumentA0", "footprint-plot-document.ts"],
  ["FootprintPlotRequest.json", "FootprintPlotRequestA0", "footprint-plot-request.ts"],
  ["FootprintPlotResult.json", "FootprintPlotResultA0", "footprint-plot-result.ts"],
  ["BoardPlotDocument.json", "BoardPlotDocumentA0", "board-plot-document.ts"],
  ["BoardPlotRequest.json", "BoardPlotRequestA0", "board-plot-request.ts"],
  ["BoardPlotResult.json", "BoardPlotResultA0", "board-plot-result.ts"],
  ["SymbolPlotDocument.json", "SymbolPlotDocumentA0", "symbol-plot-document.ts"],
  ["SymbolPlotRequest.json", "SymbolPlotRequestA0", "symbol-plot-request.ts"],
  ["SymbolPlotResult.json", "SymbolPlotResultA0", "symbol-plot-result.ts"],
  ["SchematicPlotDocument.json", "SchematicPlotDocumentA0", "schematic-plot-document.ts"],
  ["SchematicPlotRequest.json", "SchematicPlotRequestA0", "schematic-plot-request.ts"],
  ["SchematicPlotResult.json", "SchematicPlotResultA0", "schematic-plot-result.ts"],
  ["SymbolLibraryEditRequest.json", "SymbolLibraryEditRequestA0", "symbol-library-edit-request.ts"],
  ["SymbolLibraryEditResult.json", "SymbolLibraryEditResultA0", "symbol-library-edit-result.ts"],
  ["SymbolLibraryReadRequest.json", "SymbolLibraryReadRequestA0", "symbol-library-read-request.ts"],
  ["SymbolLibraryReadResult.json", "SymbolLibraryReadResultA0", "symbol-library-read-result.ts"],
  ["CompiledSchematicGraph.json", "CompiledSchematicGraphA0", "compiled-schematic-graph.ts"],
  ["SourceBundleManifest.json", "SourceBundleManifestA0", "source-bundle-manifest.ts"],
  ["FontBundleManifest.json", "FontBundleManifestA0", "font-bundle-manifest.ts"],
  ["FontResolutionRequest.json", "FontResolutionRequestA0", "font-resolution-request.ts"],
  ["ShapingRecord.json", "ShapingRecordA0", "shaping-record.ts"],
  ["OutlineVector.json", "OutlineVectorA0", "outline-vector.ts"],
  ["NativeHandshake.json", "NativeHandshakeA0", "native-handshake.ts"],
  ["NativeHandshakeA1.json", "NativeHandshakeA1", "native-handshake-a1.ts"],
  ["NativeHandshakeA2.json", "NativeHandshakeA2", "native-handshake-a2.ts"],
  ["NativeDesignFactsRequest.json", "NativeDesignFactsRequestA0", "native-design-facts-request.ts"],
  ["NativeDesignFactsResult.json", "NativeDesignFactsResultA0", "native-design-facts-result.ts"],
  ["NativeDesignFactsRequestA1.json", "NativeDesignFactsRequestA1", "native-design-facts-request-a1.ts"],
  ["NativeDesignFactsResultA1.json", "NativeDesignFactsResultA1", "native-design-facts-result-a1.ts"],
  ["NativeSvgRenderRequest.json", "NativeSVGRenderRequestA0", "native-svg-render-request.ts"],
  ["NativeSvgRenderResult.json", "NativeSVGRenderResultA0", "native-svg-render-result.ts"],
  ["NativeError.json", "NativeErrorA0", "native-error.ts"],
  ["MaterializationRequest.json", "MaterializationRequestA0", "materialization-request.ts"],
  ["MaterializationDocument.json", "MaterializationDocumentA0", "materialization-document.ts"],
  ["MaterializationDocumentA1.json", "MaterializationDocumentA1", "materialization-document-a1.ts"],
];
const schemas = new Map();
for (const [file] of roots) {
  const document = JSON.parse(await readFile(path.join(schemaRoot, file), "utf8"));
  assert(document.$schema === "https://json-schema.org/draft/2020-12/schema", `${file}: draft`);
  schemas.set(file, document);
}

const externalSchemaTypes = new Map([
  [
    "urn:wavenumber:schema:kicad_monkey.source_bundle_manifest:a0",
    ["SourceBundleManifest.json", "SourceBundleManifestA0"],
  ],
  [
    "urn:wavenumber:schema:kicad_monkey.compiled_schematic_graph:a0",
    ["CompiledSchematicGraph.json", "CompiledSchematicGraphA0"],
  ],
  [
    "urn:wavenumber:schema:kicad_monkey.footprint_plot.document:a0",
    ["FootprintPlotDocument.json", "FootprintPlotDocumentA0"],
  ],
  [
    "urn:wavenumber:schema:kicad_monkey.symbol_plot.document:a0",
    ["SymbolPlotDocument.json", "SymbolPlotDocumentA0"],
  ],
  [
    "urn:wavenumber:schema:kicad_monkey.board_plot.document:a0",
    ["BoardPlotDocument.json", "BoardPlotDocumentA0"],
  ],
  [
    "urn:wavenumber:schema:kicad_monkey.schematic_plot.document:a0",
    ["SchematicPlotDocument.json", "SchematicPlotDocumentA0"],
  ],
]);

if (generatePython) {
  const output = renderPython();
  await emit(path.join(root, "src/py/kicad_monkey/contracts/generated.py"), output);
  await emit(
    path.join(root, "src/py/kicad_monkey/contracts/__init__.py"),
    [
      '"""TypeSpec-generated KiCad Monkey transport contracts."""',
      "",
      "from .generated import *  # noqa: F403",
      "from .generated import __all__ as __all__",
      "",
    ].join("\n"),
  );
}

if (generateTypeScript) {
  const outputRoot = path.join(root, "src/ts/kicad_monkey/contracts/generated");
  const exports = [];
  for (const [file, typeName, outputName] of roots) {
    const projected = projectSchema(bundleExternalReferences(structuredClone(schemas.get(file))));
    const source = await compile(projected, typeName, {
      bannerComment: "/** Generated from KiCad Monkey TypeSpec JSON Schema. Do not edit. */",
      format: true,
      unknownAny: false,
    });
    const forbiddenAny = source.match(/.{0,80}(?:[:<]\s*any\b|\bany\[\]).{0,80}/u)?.[0];
    assert(!forbiddenAny, `${outputName}: forbidden any near ${JSON.stringify(forbiddenAny)}`);
    await emit(path.join(outputRoot, outputName), source);
    exports.push(
      `export type { ${typeName} } from "./${outputName.replace(/\.ts$/u, ".js")}";`,
    );
  }
  await emit(path.join(outputRoot, "index.ts"), `${exports.join("\n")}\n`);
}

function renderPython() {
  const definitions = new Map();
  for (const [file] of roots) {
    const schema = schemas.get(file);
    for (const [name, definition] of Object.entries(schema.$defs ?? {})) {
      const projected = flattenPythonObjectExtension(definition, schema.$defs ?? {});
      const encoded = JSON.stringify(projected);
      if (definitions.has(name)) {
        assert(definitions.get(name).encoded === encoded, `${name}: conflicting definitions`);
      } else {
        definitions.set(name, { encoded, schema: projected });
      }
    }
  }
  const taggedStructs = new Map();
  for (const { schema } of definitions.values()) {
    if (!Array.isArray(schema.anyOf)) continue;
    for (const variant of schema.anyOf) {
      const name = variant.$ref?.split("/").at(-1);
      const target = definitions.get(name)?.schema;
      const tagField = ["kind", "mode"].find(
        (field) => typeof target?.properties?.[field]?.const === "string",
      );
      const tag = tagField === undefined ? undefined : target.properties[tagField].const;
      if (typeof name === "string" && typeof tagField === "string" && typeof tag === "string") {
        taggedStructs.set(name, { field: tagField, value: tag });
        continue;
      }
      // msgspec cannot give one struct several tag values, so union members
      // whose discriminator is an enum expand to one tagged struct per value
      // beneath a Union alias that keeps the published member name.
      const enumField = ["kind", "mode"].find(
        (field) => typeof target?.properties?.[field]?.$ref === "string",
      );
      const enumName = target?.properties?.[enumField]?.$ref?.split("/").at(-1);
      const values = definitions.get(enumName)?.schema?.enum;
      if (
        typeof name === "string" &&
        typeof enumField === "string" &&
        Array.isArray(values) &&
        values.every((value) => typeof value === "string")
      ) {
        taggedStructs.set(name, { field: enumField, values });
      }
    }
  }

  const lines = [
    '"""Generated strict msgspec transport bindings. Do not edit."""',
    "",
    "from __future__ import annotations",
    "",
    "import base64",
    "import binascii",
    "import hashlib",
    "import math",
    "from dataclasses import dataclass",
    "",
    "from typing import Annotated, Literal, Union, cast",
    "",
    "import msgspec",
    "from msgspec import UNSET, Meta, Struct, UnsetType, field",
  ];
  for (const [name, value] of definitions) {
    lines.push("", "", ...renderPythonDeclaration(name, value.schema, taggedStructs.get(name)));
  }
  for (const [file, typeName] of roots) {
    lines.push("", "", ...renderPythonDeclaration(typeName, schemas.get(file)));
  }
  lines.push("", "");
  for (const [, typeName] of roots) {
    const functionName = `decode_${snakeCase(typeName.replace(/^SExpression/u, "sexpr_"))}`;
    if (typeName === "FootprintPlotDocumentA0") {
      lines.push(...renderPythonPlotterValidation(functionName, typeName));
    } else if (typeName === "BoardPlotDocumentA0") {
      lines.push(...renderPythonBoardPlotterValidation(functionName, typeName));
    } else if (typeName === "SymbolPlotDocumentA0") {
      lines.push(...renderPythonSymbolPlotterValidation(functionName, typeName));
    } else if (typeName === "SchematicPlotDocumentA0") {
      lines.push(...renderPythonSchematicPlotterValidation(functionName, typeName));
    } else if (typeName === "SchematicPlotRequestA0") {
      lines.push(...renderPythonSchematicPlotRequestValidation(functionName, typeName));
    } else if (typeName === "SourceBundleManifestA0") {
      lines.push(...renderPythonSourceBundleValidation(functionName, typeName));
    } else if (typeName === "NativeHandshakeA0") {
      lines.push(...renderPythonNativeHandshakeValidation(functionName, typeName));
    } else if (typeName === "NativeHandshakeA1") {
      lines.push(...renderPythonNativeHandshakeA1Validation(functionName, typeName));
    } else if (typeName === "NativeHandshakeA2") {
      lines.push(...renderPythonNativeHandshakeA2Validation(functionName, typeName));
    } else if (typeName === "NativeDesignFactsRequestA0") {
      lines.push(...renderPythonNativeRequestValidation(functionName, typeName));
    } else if (typeName === "NativeDesignFactsResultA0") {
      lines.push(...renderPythonNativeResultValidation(functionName, typeName));
    } else if (typeName === "NativeDesignFactsRequestA1") {
      lines.push(...renderPythonNativeRequestA1Validation(functionName, typeName));
    } else if (typeName === "NativeDesignFactsResultA1") {
      lines.push(...renderPythonNativeResultA1Validation(functionName, typeName));
    } else if (typeName === "NativeSVGRenderRequestA0") {
      lines.push(...renderPythonNativeSvgRequestValidation(functionName, typeName));
    } else if (typeName === "NativeSVGRenderResultA0") {
      lines.push(...renderPythonNativeSvgResultValidation(functionName, typeName));
    } else if (typeName === "FontBundleManifestA0") {
      lines.push(...renderPythonFontBundleValidation(functionName, typeName));
    } else if (typeName === "ShapingRecordA0") {
      lines.push(...renderPythonShapingRecordValidation(functionName, typeName));
    } else if (typeName === "OutlineVectorA0") {
      lines.push(...renderPythonOutlineVectorValidation(functionName, typeName));
    } else {
      lines.push(`${functionName} = msgspec.json.Decoder(${typeName}).decode`);
    }
  }
  const exported = [
    ...definitions.keys(),
    ...roots.map(([, typeName]) => typeName),
    ...roots.map(([, typeName]) => `decode_${snakeCase(typeName.replace(/^SExpression/u, "sexpr_"))}`),
    "validate_footprint_plot_document_a0",
    "validate_board_plot_document_a0",
    "resolve_font_selection_a0",
    "validate_font_bundle_manifest_a0",
    "validate_outline_vector_a0",
    "validate_shaping_record_a0",
    "validate_symbol_plot_document_a0",
    "validate_schematic_plot_request_a0",
    "validate_schematic_plot_document_a0",
    "validate_native_handshake_a0",
    "validate_native_handshake_a1",
    "validate_native_handshake_a2",
    "validate_native_design_facts_request_a0",
    "validate_native_design_facts_result_a0",
    "validate_native_design_facts_request_a1",
    "validate_native_design_facts_result_a1",
    "validate_native_svg_render_request_a0",
    "validate_native_svg_render_result_a0",
  ];
  lines.push("", "", "__all__ = (", ...exported.map((name) => `    ${pythonLiteral(name)},`), ")", "");
  return lines.join("\n");
}

function flattenPythonObjectExtension(definition, definitions) {
  const projected = structuredClone(definition);
  if (!Array.isArray(projected.allOf) || projected.allOf.length !== 1) return projected;
  const reference = projected.allOf[0]?.$ref;
  const baseName = typeof reference === "string" ? reference.split("/").at(-1) : undefined;
  const base = definitions[baseName];
  assert(base?.type === "object", `${baseName}: unsupported Python object extension base`);
  projected.properties = { ...(base.properties ?? {}), ...(projected.properties ?? {}) };
  projected.required = [...new Set([...(base.required ?? []), ...(projected.required ?? [])])];
  delete projected.allOf;
  return projected;
}

function renderPythonBoardPlotterValidation(functionName, typeName) {
  return [
    `_board_plot_document_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _board_plot_document_a0_decoder.decode(data)",
    "    validate_board_plot_document_a0(value)",
    "    return value",
    "",
    "",
    `def validate_board_plot_document_a0(value: ${typeName}) -> None:`,
    '    if value.schema != "kicad.plotter_ir.a0" or value.source_kind != "PCB" or value.coordinate_space.unit != "nm" or value.coordinate_space.y_axis != "down":',
    '        raise msgspec.ValidationError("invalid_board_document at $")',
    "    total_operations = 0",
    "    saw_footprint = False",
    "    for record_index, record in enumerate(value.records):",
    "        path = f'$.records[{record_index}]'",
    "        _validate_board_record_operations(record.operations, path)",
    "        if isinstance(record, BoardFootprintPlotRecord):",
    "            saw_footprint = True",
    "            _validate_board_footprint_plot_record(record, path)",
    "        elif saw_footprint:",
    '            raise msgspec.ValidationError(f"invalid_board_record_order at {path}")',
    "        if record.operation_count != len(record.operations):",
    '            raise msgspec.ValidationError(f"operation_count_mismatch at {path}.operation_count")',
    "        total_operations += len(record.operations)",
    "        if isinstance(record, DimensionPlotRecord):",
    "            _validate_dimension_plot_record(record, path)",
    "    if value.total_operations != total_operations:",
    '        raise msgspec.ValidationError("operation_count_mismatch at $.total_operations")',
    "",
    "",
    "def _validate_board_record_operations(operations: list[PlotterOperation] | list[BoardFootprintOperation], path: str) -> None:",
    "    for operation in operations:",
    "        if isinstance(operation, TextOperation) and operation.context is not UNSET:",
    '            raise msgspec.ValidationError(f"invalid_board_text_context at {path}.operations")',
    "        if isinstance(operation, ThickSegmentOperation) and operation.stroke_color is not UNSET:",
    '            raise msgspec.ValidationError(f"invalid_board_segment_color at {path}.operations")',
    "        if isinstance(operation, PlotImageOperation):",
    '            raise msgspec.ValidationError(f"invalid_board_operation at {path}.operations")',
    "",
    "",
    "def _validate_dimension_plot_record(record: DimensionPlotRecord, path: str) -> None:",
    "    if not record.layers or record.layers != sorted(set(record.layers)):",
    '        raise msgspec.ValidationError(f"invalid_dimension at {path}.layers")',
    "    saw_text = False",
    "    marker_count = 0",
    "    for operation_index, operation in enumerate(record.operations):",
    "        operation_path = f'{path}.operations[{operation_index}]'",
    "        if operation.index != operation_index:",
    '            raise msgspec.ValidationError(f"operation_index_mismatch at {operation_path}.index")',
    "        if isinstance(operation, TextOperation):",
    "            if operation_index != 0 or saw_text:",
    '                raise msgspec.ValidationError(f"invalid_dimension at {operation_path}")',
    "            saw_text = True",
    "        elif isinstance(operation, CircleOperation):",
    "            marker_count += 1",
    "        _validate_dimension_operation(record, operation, marker_count, operation_path)",
    "",
    "",
    "def _validate_dimension_operation(record: DimensionPlotRecord, operation: PlotterOperation, marker_count: int, path: str) -> None:",
    "    if isinstance(operation, TextOperation):",
    "        layer = None if operation.layer is UNSET else operation.layer",
    "        if not operation.font_face or layer not in record.layers:",
    '            raise msgspec.ValidationError(f"invalid_dimension at {path}")',
    "        _validate_board_text_payload(operation, path)",
    "    elif isinstance(operation, ThickSegmentOperation):",
    "        layer = None if operation.layer is UNSET else operation.layer",
    "        layers = [] if operation.layers is UNSET else operation.layers",
    "        forbidden = (operation.role is not UNSET, bool(layers), operation.mask_margin_nm is not UNSET, operation.pad_size_x_nm is not UNSET, operation.pad_size_y_nm is not UNSET, operation.stroke_color is not UNSET)",
    "        if layer not in record.layers or any(forbidden):",
    '            raise msgspec.ValidationError(f"invalid_dimension at {path}")',
    "    elif isinstance(operation, CircleOperation):",
    "        layer = None if operation.layer is UNSET else operation.layer",
    "        layers = [] if operation.layers is UNSET else operation.layers",
    "        forbidden = (operation.role is not UNSET, bool(layers), operation.mask_margin_nm is not UNSET, operation.pad_size_x_nm is not UNSET, operation.pad_size_y_nm is not UNSET, operation.stroke_color is not UNSET, operation.fill_color is not UNSET, operation.line_style is not UNSET)",
    '        if record.dimension_type != "orthogonal" or marker_count > 1 or layer not in record.layers or operation.fill != "FILLED_SHAPE" or operation.diameter_nm != 200_000 or operation.width_nm != 0 or any(forbidden):',
    '            raise msgspec.ValidationError(f"invalid_dimension at {path}")',
    "    else:",
    '        raise msgspec.ValidationError(f"invalid_dimension at {path}")',
    "",
    "",
    "def _validate_board_text_payload(operation: TextOperation, path: str) -> None:",
    "    if operation.context is not UNSET:",
    '        raise msgspec.ValidationError(f"invalid_board_text_context at {path}.context")',
    "    markers = (operation.mirror, operation.text_as_polygons, operation.polyline_per_segment, operation.knockout)",
    "    if any(marker is not UNSET and marker is not True for marker in markers):",
    '        raise msgspec.ValidationError(f"invalid_board_text at {path}")',
    "    if (operation.text_as_polygons is not UNSET) != (not operation.font_face):",
    '        raise msgspec.ValidationError(f"invalid_board_text at {path}")',
    "    has_cache = operation.render_cache is not UNSET",
    "    polygons = [] if operation.render_cache_polygons is UNSET else operation.render_cache_polygons",
    "    if has_cache != (operation.render_cache_source is not UNSET) or has_cache != (operation.render_cache_exact is not UNSET) or has_cache == (not polygons):",
    '        raise msgspec.ValidationError(f"invalid_board_text at {path}")',
    "    if not has_cache:",
    "        if operation.knockout is not UNSET:",
    '            raise msgspec.ValidationError(f"invalid_board_text at {path}")',
    "        return",
    "    _validate_board_text_cache(operation, polygons, path)",
    "",
    "",
    "def _validate_board_text_cache(operation: TextOperation, polygons: list[list[list[int]]], path: str) -> None:",
    "    cache = cast(TextRenderCache, operation.render_cache)",
    '    if cache.schema != "kicad.render_cache.v1" or cache.unit != "nm" or cache.coordinate_space != "board" or cache.source != operation.render_cache_source or cache.text != operation.text or cache.angle != operation.orient_deg or cache.exact != operation.render_cache_exact or cache.knockout != operation.knockout:',
    '        raise msgspec.ValidationError(f"invalid_board_text at {path}")',
    "    if len(cache.polygons) != len(polygons):",
    '        raise msgspec.ValidationError(f"invalid_board_text at {path}")',
    "    for polygon, exterior in zip(cache.polygons, polygons):",
    "        if not polygon.contours or any(len(contour) < 3 for contour in polygon.contours) or polygon.contours[0] != exterior:",
    '            raise msgspec.ValidationError(f"invalid_board_text at {path}")',
    ...renderPythonBoardFootprintValidation(),
  ];
}

function renderPythonBoardFootprintValidation() {
  return [
    "",
    "",
    "def _validate_board_footprint_plot_record(record: BoardFootprintPlotRecord, path: str) -> None:",
    '    if record.object_id != record.library_link or not math.isfinite(record.placement.angle_deg):',
    '        raise msgspec.ValidationError(f"invalid_board_footprint at {path}")',
    "    operation_index = 0",
    "    pad_phase = False",
    "    last_key = None",
    "    while operation_index < len(record.operations):",
    "        operation = record.operations[operation_index]",
    "        operation_path = f'{path}.operations[{operation_index}]'",
    "        if isinstance(operation, BoardFootprintStartBlockOperation):",
    "            pad_phase = True",
    "            if operation_index + 2 >= len(record.operations) or not isinstance(record.operations[operation_index + 2], BoardFootprintEndBlockOperation):",
    '                raise msgspec.ValidationError(f"invalid_board_footprint at {operation_path}")',
    "            inner = record.operations[operation_index + 1]",
    "            end = record.operations[operation_index + 2]",
    "            _validate_board_footprint_header(operation, operation_index, 'StartBlock', operation_path)",
    "            _validate_board_footprint_header(inner, operation_index + 1, _board_footprint_expected_kind(inner), f'{path}.operations[{operation_index + 1}]')",
    "            _validate_board_footprint_header(end, operation_index + 2, 'EndBlock', f'{path}.operations[{operation_index + 2}]')",
    "            _validate_board_footprint_pad_block(record, operation, inner, operation_path)",
    "            operation_index += 3",
    "            continue",
    "        if pad_phase or isinstance(operation, BoardFootprintEndBlockOperation):",
    '            raise msgspec.ValidationError(f"invalid_board_footprint at {operation_path}")',
    "        key = _validate_board_footprint_child(record, operation, operation_index, operation_path)",
    "        if last_key is not None and last_key >= key:",
    '            raise msgspec.ValidationError(f"invalid_board_footprint_order at {operation_path}")',
    "        last_key = key",
    "        operation_index += 1",
    "",
    "",
    "def _validate_board_footprint_header(operation: BoardFootprintOperation, index: int, kind: str, path: str) -> None:",
    "    if operation.index != index:",
    '        raise msgspec.ValidationError(f"invalid_board_footprint_header at {path}")',
    "",
    "",
    "def _board_footprint_expected_kind(operation: BoardFootprintOperation) -> str:",
    "    kinds = ((BoardFootprintThickSegmentOperation, 'ThickSegment'), (BoardFootprintArcThreePointOperation, 'ArcThreePoint'), (BoardFootprintCircleOperation, 'Circle'), (BoardFootprintRectOperation, 'Rect'), (BoardFootprintPlotPolyOperation, 'PlotPoly'), (BoardFootprintBezierCurveOperation, 'BezierCurve'), (BoardFootprintTextOperation, 'Text'), (BoardFootprintFlashPadCircleOperation, 'FlashPadCircle'), (BoardFootprintFlashPadOvalOperation, 'FlashPadOval'), (BoardFootprintFlashPadRectOperation, 'FlashPadRect'), (BoardFootprintFlashPadRoundRectOperation, 'FlashPadRoundRect'), (BoardFootprintFlashPadCustomOperation, 'FlashPadCustom'), (BoardFootprintFlashPadTrapezOperation, 'FlashPadTrapez'), (BoardFootprintStartBlockOperation, 'StartBlock'), (BoardFootprintEndBlockOperation, 'EndBlock'))",
    "    for operation_type, kind in kinds:",
    "        if isinstance(operation, operation_type):",
    "            return kind",
    '    raise msgspec.ValidationError("invalid_board_footprint_operation")',
    "",
    "",
    "_BoardFootprintChildOperation = Union[BoardFootprintThickSegmentOperation, BoardFootprintArcThreePointOperation, BoardFootprintCircleOperation, BoardFootprintRectOperation, BoardFootprintPlotPolyOperation, BoardFootprintTextOperation]",
    "",
    "",
    "def _validate_board_footprint_child(record: BoardFootprintPlotRecord, operation: BoardFootprintOperation, index: int, path: str) -> tuple[int, int, int]:",
    "    allowed = (BoardFootprintThickSegmentOperation, BoardFootprintArcThreePointOperation, BoardFootprintCircleOperation, BoardFootprintRectOperation, BoardFootprintPlotPolyOperation, BoardFootprintTextOperation)",
    "    if not isinstance(operation, allowed):",
    '        raise msgspec.ValidationError(f"invalid_board_footprint_child at {path}")',
    "    child = cast(_BoardFootprintChildOperation, operation)",
    "    _validate_board_footprint_header(child, index, _board_footprint_expected_kind(child), path)",
    "    metadata = (child.label, child.data_uuid, child.data_ref, child.object_id, child.extra_attrs)",
    "    if any(value is UNSET for value in metadata):",
    '        raise msgspec.ValidationError(f"invalid_board_footprint_metadata at {path}")',
    "    attrs = cast(BoardFootprintChildAttrs, child.extra_attrs)",
    "    layer = None if child.layer is UNSET else child.layer",
    "    layer_name = None if attrs.layer_name is UNSET else attrs.layer_name",
    "    if not child.label or not child.data_uuid or not child.object_id or child.data_ref != attrs.footprint_primitive or attrs.component != record.reference or attrs.component_uid != record.uuid or attrs.component_uuid != record.uuid or attrs.footprint != record.library_link or layer_name != layer or (attrs.layer_name is UNSET) != (attrs.layer_role is UNSET) or (layer is not None and attrs.layer_role != _board_footprint_layer_role(layer)):",
    '        raise msgspec.ValidationError(f"invalid_board_footprint_metadata at {path}")',
    "    _validate_board_footprint_child_shape(child, attrs, path)",
    "    phases = {'property': 0, 'fp_text': 1, 'fp_text_box': 2, 'fp_line': 3, 'fp_arc': 4, 'fp_circle': 5, 'fp_rect': 6, 'fp_poly': 7}",
    "    sub_index = 0 if attrs.footprint_subop_index is UNSET else attrs.footprint_subop_index",
    "    return (phases[cast(str, child.data_ref)], attrs.footprint_object_index, sub_index)",
    "",
    "",
    "def _validate_board_footprint_child_shape(operation: _BoardFootprintChildOperation, attrs: BoardFootprintChildAttrs, path: str) -> None:",
    "    data_ref = operation.data_ref",
    "    if isinstance(operation, BoardFootprintTextOperation):",
    "        valid_ref = data_ref in ('property', 'fp_text', 'fp_text_box')",
    "        valid_attrs = attrs.primitive == 'footprint-text' and attrs.footprint_text_role is not UNSET and attrs.footprint_graphic_kind is UNSET and ((data_ref == 'property') == (attrs.property_name is not UNSET)) and ((data_ref == 'fp_text') == (attrs.fp_text_type is not UNSET))",
    "        _validate_board_footprint_text(operation, path)",
    "    else:",
    "        expected = None",
    "        if isinstance(operation, BoardFootprintThickSegmentOperation):",
    "            if operation.stroke_color is not UNSET:",
    '                raise msgspec.ValidationError(f"invalid_board_footprint_segment_color at {path}")',
    "            expected = 'text-box-border' if data_ref == 'fp_text_box' else 'line'",
    "        elif isinstance(operation, BoardFootprintArcThreePointOperation):",
    "            expected = 'arc'",
    "        elif isinstance(operation, BoardFootprintCircleOperation):",
    "            expected = 'circle'",
    "        elif isinstance(operation, BoardFootprintRectOperation):",
    "            expected = 'text-box-border' if data_ref == 'fp_text_box' else 'rect'",
    "        elif isinstance(operation, BoardFootprintPlotPolyOperation):",
    "            expected = 'poly'",
    "        valid_refs = {BoardFootprintThickSegmentOperation: ('fp_text_box', 'fp_line'), BoardFootprintArcThreePointOperation: ('fp_arc',), BoardFootprintCircleOperation: ('fp_circle',), BoardFootprintRectOperation: ('fp_text_box', 'fp_rect'), BoardFootprintPlotPolyOperation: ('fp_poly',)}",
    "        valid_ref = data_ref in valid_refs[type(operation)]",
    "        valid_attrs = attrs.primitive == 'footprint-graphic' and attrs.footprint_text_role is UNSET and attrs.property_name is UNSET and attrs.fp_text_type is UNSET and attrs.footprint_graphic_kind == expected",
    "    subop_required = data_ref in ('fp_text_box', 'fp_line', 'fp_arc')",
    "    if not valid_ref or not valid_attrs or ((attrs.footprint_subop_index is not UNSET) != subop_required):",
    '        raise msgspec.ValidationError(f"invalid_board_footprint_shape at {path}")',
    "",
    "",
    "def _board_footprint_layer_role(layer: str) -> str:",
    "    if layer.endswith('.Cu') or layer in ('*.Cu', 'F&B.Cu'):",
    "        return 'copper'",
    "    if layer.endswith('.SilkS'):",
    "        return 'silkscreen'",
    "    if layer.endswith('.Mask') or layer == '*.Mask':",
    "        return 'soldermask'",
    "    if layer.endswith('.Paste'):",
    "        return 'paste'",
    "    if layer.endswith('.Fab'):",
    "        return 'fab'",
    "    if layer.endswith('.Courtyard'):",
    "        return 'courtyard'",
    "    if layer == 'Edge.Cuts':",
    "        return 'board-outline'",
    "    if layer == 'DRILLS':",
    "        return 'drill'",
    "    if layer.endswith('.User') or layer.startswith('User.'):",
    "        return 'user'",
    "    return 'other'",
    "",
    "",
    "def _validate_board_footprint_text(operation: BoardFootprintTextOperation, path: str) -> None:",
    "    if not math.isfinite(operation.orient_deg) or operation.context is not UNSET or operation.mirror is not UNSET or operation.text_as_polygons is not UNSET or operation.polyline_per_segment is not UNSET or operation.knockout is False:",
    '        raise msgspec.ValidationError(f"invalid_board_footprint_cache at {path}")',
    "    has_cache = operation.render_cache is not UNSET",
    "    polygons = [] if operation.render_cache_polygons is UNSET else operation.render_cache_polygons",
    "    if has_cache != (operation.render_cache_source is not UNSET) or has_cache != (operation.render_cache_exact is not UNSET) or has_cache == (not polygons):",
    '        raise msgspec.ValidationError(f"invalid_board_footprint_cache at {path}")',
    "    if not has_cache:",
    "        if operation.knockout is not UNSET:",
    "            raise msgspec.ValidationError(f'invalid_board_footprint_cache at {path}')",
    "        return",
    "    cache = cast(TextRenderCache, operation.render_cache)",
    "    if cache.schema != 'kicad.render_cache.v1' or cache.unit != 'nm' or cache.coordinate_space != 'footprint_local' or cache.source != operation.render_cache_source or cache.text != operation.text or not math.isfinite(cache.angle) or cache.exact != operation.render_cache_exact or cache.knockout != operation.knockout or len(cache.polygons) != len(polygons):",
    '        raise msgspec.ValidationError(f"invalid_board_footprint_cache at {path}")',
    "    for polygon, exterior in zip(cache.polygons, polygons):",
    "        if not polygon.contours or any(len(contour) < 3 for contour in polygon.contours) or polygon.contours[0] != exterior:",
    '            raise msgspec.ValidationError(f"invalid_board_footprint_cache at {path}")',
    "",
    "",
    "def _validate_board_footprint_pad_block(record: BoardFootprintPlotRecord, start: BoardFootprintStartBlockOperation, inner: object, path: str) -> None:",
    "    attrs = start.extra_attrs",
    "    expected_component = record.reference if record.reference else UNSET",
    "    expected_uuid = record.uuid if record.uuid else UNSET",
    "    expected_footprint = record.library_link if record.library_link else UNSET",
    "    pad_number_valid = (attrs.pad_number == start.object_id) if attrs.pad_number is not UNSET else start.object_id == 'pad'",
    "    expected_designator = UNSET if attrs.pad_number is UNSET else (f'{record.reference}-{attrs.pad_number}' if record.reference else attrs.pad_number)",
    "    inner_layers_value = getattr(inner, 'layers', UNSET)",
    "    inner_layers = [] if inner_layers_value is UNSET else inner_layers_value",
    "    expected_layer_names = ','.join(inner_layers) if inner_layers else UNSET",
    "    common = attrs.component == expected_component and attrs.component_uid == expected_uuid and attrs.component_uuid == expected_uuid and attrs.footprint == expected_footprint and pad_number_valid and attrs.pad_designator == expected_designator and (attrs.pad_type is UNSET or bool(attrs.pad_type)) and (attrs.pad_shape is UNSET or bool(attrs.pad_shape)) and attrs.layer_names == expected_layer_names and start.label == start.data_uuid",
    "    metadata = tuple(getattr(inner, name, UNSET) for name in ('label', 'data_uuid', 'data_ref', 'object_id', 'extra_attrs'))",
    "    if not common or any(value is not UNSET for value in metadata):",
    '        raise msgspec.ValidationError(f"invalid_board_footprint_pad at {path}")',
    "    if start.data_ref == 'pad':",
    "        hole_names = ('hole_owner', 'hole_kind', 'hole_plating', 'hole_render', 'hole_width_mm', 'hole_height_mm', 'hole_diameter_mm')",
    "        layers = [] if start.layers is UNSET else start.layers",
    "        valid = attrs.primitive == 'pad' and all(getattr(attrs, name) is UNSET for name in hole_names) and bool(layers) and isinstance(inner, (BoardFootprintFlashPadCircleOperation, BoardFootprintFlashPadOvalOperation, BoardFootprintFlashPadRectOperation, BoardFootprintFlashPadRoundRectOperation, BoardFootprintFlashPadCustomOperation, BoardFootprintFlashPadTrapezOperation)) and inner.layers == layers",
    "        if isinstance(inner, BoardFootprintFlashPadCircleOperation):",
    "            valid = valid and inner.mask_margin_nm is not UNSET and inner.role is UNSET",
    "        if isinstance(inner, BoardFootprintFlashPadCustomOperation):",
    "            valid = valid and (inner.polygon_widths_nm is UNSET or not inner.polygon_widths_nm or len(inner.polygon_widths_nm) == len(inner.polygons))",
    "    else:",
    "        round_hole = attrs.hole_kind == 'round' and attrs.hole_diameter_mm is not UNSET and attrs.hole_width_mm is UNSET and attrs.hole_height_mm is UNSET",
    "        slot_hole = attrs.hole_kind == 'slot' and attrs.hole_diameter_mm is UNSET and attrs.hole_width_mm is not UNSET and attrs.hole_height_mm is not UNSET",
    "        valid = attrs.primitive == 'pad-hole' and start.label.endswith(':hole') and attrs.hole_owner == start.label[:-5] and attrs.hole_plating in ('plated', 'non_plated') and attrs.hole_render == 'drill' and (round_hole or slot_hole) and isinstance(inner, (BoardFootprintCircleOperation, BoardFootprintThickSegmentOperation)) and inner.layer is UNSET and bool(inner.layers)",
    "        if not isinstance(inner, (BoardFootprintCircleOperation, BoardFootprintThickSegmentOperation)):",
    "            valid = False",
    "        elif valid and attrs.hole_plating == 'plated':",
    "            valid = inner.role == 'pad_drill' and inner.mask_margin_nm is UNSET and inner.pad_size_x_nm is UNSET and inner.pad_size_y_nm is UNSET",
    "        elif valid:",
    "            valid = inner.role == 'npth_hole' and inner.mask_margin_nm is not UNSET and inner.pad_size_x_nm is not UNSET and inner.pad_size_y_nm is not UNSET",
    "    if not valid:",
    '        raise msgspec.ValidationError(f"invalid_board_footprint_pad at {path}")',
  ];
}

function renderPythonShapingRecordValidation(functionName, typeName) {
  return [
    `_shaping_record_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _shaping_record_a0_decoder.decode(data)",
    "    validate_shaping_record_a0(value)",
    "    return value",
    "",
    "",
    `def validate_shaping_record_a0(value: ${typeName}) -> None:`,
    '    if value.schema != "kicad_monkey.shaping_record.a0" or value.type_ != "kicad_monkey.shaping_record" or value.version != "a0":',
    '        raise msgspec.ValidationError("unsupported_contract at $")',
    "    if not isinstance(value.comparison, ExactComparisonPolicy):",
    '        raise msgspec.ValidationError("invalid_comparison at $.comparison")',
    '    if value.input.text_index_unit != "utf8_byte_offset":',
    '        raise msgspec.ValidationError("invalid_text_index at $.input.text_index_unit")',
    "    _validate_font_text_identity(value.case_id, '$.case_id')",
    "    _validate_font_text_identity(value.input.font_id, '$.input.font_id')",
    "    _validate_font_hash(value.input.font_sha256, '$.input.font_sha256')",
    "    _validate_font_variations(value.input.variations, '$.input.variations')",
    "    if value.input.script is not UNSET and not _font_tag_valid(value.input.script):",
    '        raise msgspec.ValidationError("invalid_tag at $.input.script")',
    "    if value.input.language is not UNSET and not value.input.language:",
    '        raise msgspec.ValidationError("invalid_language at $.input.language")',
    "    char_starts: set[int] = set()",
    "    offset = 0",
    "    for char in value.input.text:",
    "        char_starts.add(offset)",
    "        offset += _font_utf8_len(char)",
    "    _validate_shaping_features(value.input.features, {*char_starts, offset})",
    "    _validate_shaping_glyphs(value.glyphs, char_starts)",
    "",
    "",
    "def _validate_shaping_features(features: list[ShapingFeature], endpoints: set[int]) -> None:",
    "    feature_tags: set[str] = set()",
    "    for index, feature in enumerate(features):",
    "        if not _font_tag_valid(feature.tag):",
    '            raise msgspec.ValidationError(f"invalid_tag at $.input.features[{index}].tag")',
    "        if feature.tag in feature_tags:",
    '            raise msgspec.ValidationError(f"duplicate_feature_tag at $.input.features[{index}].tag")',
    "        feature_tags.add(feature.tag)",
    "        global_range = feature.start == 0 and feature.end == 4_294_967_295",
    "        bounded = feature.start <= feature.end and feature.start in endpoints and feature.end in endpoints",
    "        if not global_range and not bounded:",
    '            raise msgspec.ValidationError(f"invalid_text_index at $.input.features[{index}]")',
    "",
    "",
    "def _validate_shaping_glyphs(glyphs: list[ShapedGlyph], char_starts: set[int]) -> None:",
    "    for index, glyph in enumerate(glyphs):",
    "        if glyph.cluster not in char_starts:",
    '            raise msgspec.ValidationError(f"invalid_text_index at $.glyphs[{index}].cluster")',
  ];
}

function renderPythonOutlineVectorValidation(functionName, typeName) {
  return [
    `_outline_vector_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _outline_vector_a0_decoder.decode(data)",
    "    validate_outline_vector_a0(value)",
    "    return value",
    "",
    "",
    `def validate_outline_vector_a0(value: ${typeName}) -> None:`,
    '    if value.schema != "kicad_monkey.outline_vector.a0" or value.type_ != "kicad_monkey.outline_vector" or value.version != "a0":',
    '        raise msgspec.ValidationError("unsupported_contract at $")',
    '    if value.coordinate_format != "font_design_units_f64":',
    '        raise msgspec.ValidationError("unsupported_contract at $.coordinate_format")',
    "    _validate_font_text_identity(value.case_id, '$.case_id')",
    "    _validate_font_text_identity(value.font_id, '$.font_id')",
    "    _validate_font_hash(value.font_sha256, '$.font_sha256')",
    "    _validate_font_variations(value.variations, '$.variations')",
    "    if value.units_per_em <= 0:",
    '        raise msgspec.ValidationError("invalid_units_per_em at $.units_per_em")',
    "    _validate_outline_comparison(value.coordinate_comparison)",
    "    for index, command in enumerate(value.commands):",
    "        coordinates = _outline_command_coordinates(command)",
    "        if any(not math.isfinite(coordinate) for coordinate in coordinates):",
    '            raise msgspec.ValidationError(f"invalid_coordinate at $.commands[{index}]")',
    "",
    "",
    "def _validate_outline_comparison(comparison: ExactComparisonPolicy | AbsoluteToleranceComparisonPolicy) -> None:",
    "    if isinstance(comparison, AbsoluteToleranceComparisonPolicy):",
    "        if not math.isfinite(comparison.absolute_tolerance) or comparison.absolute_tolerance < 0:",
    '            raise msgspec.ValidationError("invalid_comparison at $.coordinate_comparison")',
    "    elif not isinstance(comparison, ExactComparisonPolicy):",
    '        raise msgspec.ValidationError("invalid_comparison at $.coordinate_comparison")',
    "",
    "",
    "def _outline_command_coordinates(command: OutlineCommand) -> tuple[float, ...]:",
    "    if isinstance(command, (OutlineMoveTo, OutlineLineTo)):",
    "        return (command.x, command.y)",
    "    if isinstance(command, OutlineQuadTo):",
    "        return (command.control_x, command.control_y, command.x, command.y)",
    "    if isinstance(command, OutlineCurveTo):",
    "        return (command.control1_x, command.control1_y, command.control2_x, command.control2_y, command.x, command.y)",
    "    return ()",
  ];
}

function renderPythonFontBundleValidation(functionName, typeName) {
  return [
    "@dataclass(frozen=True, slots=True)",
    "class _ValidatedFontBundleA0:",
    `    manifest: ${typeName}`,
    "    id_index: dict[str, int]",
    "    alias_index: dict[str, int | None]",
    "",
    "",
    `_font_bundle_manifest_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    return _font_bundle_manifest_a0_decoder.decode(data)",
    "",
    "",
    `def validate_font_bundle_manifest_a0(`,
    `    value: ${typeName},`,
    "    buffers: list[bytes] | tuple[bytes, ...],",
    "    *,",
    "    max_fonts: int = 4_096,",
    "    max_font_bytes: int = 256 * 1024 * 1024,",
    "    max_total_font_bytes: int = 1024 * 1024 * 1024,",
    "    max_aliases_per_font: int = 4_096,",
    "    max_variations_per_font: int = 4_096,",
    "    max_metadata_string_bytes: int = 64 * 1024 * 1024,",
    ") -> _ValidatedFontBundleA0:",
    "    _validate_font_bundle_preflight(value, buffers, (max_fonts, max_font_bytes, max_total_font_bytes, max_aliases_per_font, max_variations_per_font, max_metadata_string_bytes))",
    "    ids: set[str] = set()",
    "    slots: set[int] = set()",
    "    id_index: dict[str, int] = {}",
    "    alias_index: dict[str, int | None] = {}",
    "    total_bytes = 0",
    "    metadata_string_bytes = 0",
    "    for index, font in enumerate(value.fonts):",
    '        path = f"$.fonts[{index}]"',
    "        metadata_string_bytes += _index_font_bundle_entry(font, index, len(buffers), ids, slots, id_index, alias_index, max_aliases_per_font, max_variations_per_font, path)",
    "        if metadata_string_bytes > max_metadata_string_bytes:",
    '            raise msgspec.ValidationError("resource_limit at $.fonts")',
    "        buffer = buffers[font.slot]",
    "        if len(buffer) > max_font_bytes:",
    '            raise msgspec.ValidationError(f"resource_limit at {path}.slot")',
    "        total_bytes += len(buffer)",
    "        if total_bytes > max_total_font_bytes:",
    '            raise msgspec.ValidationError("resource_limit at $.fonts")',
    "    for index, font in enumerate(value.fonts):",
    "        if hashlib.sha256(buffers[font.slot]).hexdigest() != font.sha256:",
    '            path = f"$.fonts[{index}]"',
    '            raise msgspec.ValidationError(f"hash_mismatch at {path}.sha256")',
    "    return _ValidatedFontBundleA0(value, id_index, alias_index)",
    "",
    "",
    "def _validate_font_bundle_preflight(value: FontBundleManifestA0, buffers: list[bytes] | tuple[bytes, ...], limits: tuple[int, int, int, int, int, int]) -> None:",
    '    if value.schema != "kicad_monkey.font_bundle.a0" or value.type_ != "kicad_monkey.font_bundle" or value.version != "a0":',
    '        raise msgspec.ValidationError("unsupported_contract at $")',
    "    if any(limit < 0 for limit in limits):",
    '        raise msgspec.ValidationError("invalid_limit at $")',
    "    if len(value.fonts) > limits[0]:",
    '        raise msgspec.ValidationError("resource_limit at $.fonts")',
    "    if len(value.fonts) != len(buffers):",
    '        raise msgspec.ValidationError("buffer_count_mismatch at $.fonts")',
    "",
    "",
    "def _index_font_bundle_entry(font: FontBundleEntry, index: int, buffer_count: int, ids: set[str], slots: set[int], id_index: dict[str, int], alias_index: dict[str, int | None], max_aliases: int, max_variations: int, path: str) -> int:",
    "    if not font.id or font.id in ids:",
    '        raise msgspec.ValidationError(f"duplicate_font_id at {path}.id")',
    "    _validate_font_text_identity(font.id, f'{path}.id')",
    "    ids.add(font.id)",
    "    id_index[font.id] = index",
    "    if font.slot in slots:",
    '        raise msgspec.ValidationError(f"duplicate_font_slot at {path}.slot")',
    "    slots.add(font.slot)",
    "    if font.slot >= buffer_count:",
    '        raise msgspec.ValidationError(f"invalid_slot at {path}.slot")',
    "    _validate_font_bundle_entry_metadata(font, max_aliases, max_variations, path)",
    "    for alias in font.aliases:",
    "        alias_index[alias] = None if alias in alias_index and alias_index[alias] != index else index",
    "    strings = [font.id, font.sha256, *font.aliases, *(variation.axis for variation in font.variations)]",
    "    strings.extend(value for value in (font.family, font.style, font.postscript_name) if value is not UNSET)",
    "    return sum(_font_utf8_len(value) for value in strings)",
    "",
    "",
    "def _validate_font_bundle_entry_metadata(font: FontBundleEntry, max_aliases: int, max_variations: int, path: str) -> None:",
    "    if len(font.sha256) != 64 or any(char not in '0123456789abcdef' for char in font.sha256):",
    '        raise msgspec.ValidationError(f"invalid_hash at {path}.sha256")',
    "    if len(font.aliases) > max_aliases or len(font.variations) > max_variations:",
    '        raise msgspec.ValidationError(f"resource_limit at {path}")',
    "    if any(not alias for alias in font.aliases) or len(set(font.aliases)) != len(font.aliases):",
    '        raise msgspec.ValidationError(f"invalid_alias at {path}.aliases")',
    "    axes: set[str] = set()",
    "    for variation_index, variation in enumerate(font.variations):",
    "        axis = variation.axis",
    "        if len(axis) != 4 or any(ord(char) < 32 or ord(char) > 126 for char in axis) or not math.isfinite(variation.value) or axis in axes:",
    '            raise msgspec.ValidationError(f"invalid_variation at {path}.variations[{variation_index}]")',
    "        axes.add(axis)",
    "",
    "",
    "def resolve_font_selection_a0(",
    "    bundle: _ValidatedFontBundleA0,",
    "    request: FontResolutionRequestA0,",
    "    *,",
    "    max_request_aliases: int = 4_096,",
    "    max_request_string_bytes: int = 16 * 1024 * 1024,",
    ") -> FontBundleEntry:",
    "    _validate_font_resolution_request(request, max_request_aliases, max_request_string_bytes)",
    "    font_id = None if request.selection.font_id is UNSET else request.selection.font_id",
    "    if font_id is not None:",
    "        if font_id in bundle.id_index:",
    "            return bundle.manifest.fonts[bundle.id_index[font_id]]",
    '        raise msgspec.ValidationError("missing_font at $.selection.font_id")',
    "    matched: int | None = None",
    "    for alias in request.selection.aliases:",
    "        if alias not in bundle.alias_index:",
    "            continue",
    "        target = bundle.alias_index[alias]",
    "        if target is None or (matched is not None and matched != target):",
    '            raise msgspec.ValidationError("ambiguous_font at $.selection.aliases")',
    "        matched = target",
    "    if matched is None:",
    '        raise msgspec.ValidationError("missing_font at $.selection")',
    "    return bundle.manifest.fonts[matched]",
    "",
    "",
    "def _validate_font_resolution_request(request: FontResolutionRequestA0, max_aliases: int, max_string_bytes: int) -> None:",
    '    if request.schema != "kicad_monkey.font_resolution_request.a0" or request.type_ != "kicad_monkey.font_resolution_request" or request.version != "a0":',
    '        raise msgspec.ValidationError("unsupported_contract at $")',
    "    if max_aliases < 0 or max_string_bytes < 0:",
    '        raise msgspec.ValidationError("invalid_limit at $.selection")',
    "    if len(request.selection.aliases) > max_aliases:",
    '        raise msgspec.ValidationError("resource_limit at $.selection.aliases")',
    "    font_id = None if request.selection.font_id is UNSET else request.selection.font_id",
    "    request_strings = [*request.selection.aliases]",
    "    if font_id is not None:",
    "        _validate_font_text_identity(font_id, '$.selection.font_id')",
    "        request_strings.append(font_id)",
    "    if sum(_font_utf8_len(value) for value in request_strings) > max_string_bytes:",
    '        raise msgspec.ValidationError("resource_limit at $.selection")',
    "    if font_id == '':",
    '        raise msgspec.ValidationError("invalid_selection at $.selection.font_id")',
    "    if any(not alias for alias in request.selection.aliases) or len(set(request.selection.aliases)) != len(request.selection.aliases):",
    '        raise msgspec.ValidationError("invalid_selection at $.selection.aliases")',
    "",
    "",
    "def _font_utf8_len(value: str) -> int:",
    "    total = 0",
    "    for char in value:",
    "        codepoint = ord(char)",
    "        total += 1 if codepoint < 0x80 else 2 if codepoint < 0x800 else 3 if codepoint < 0x10000 else 4",
    "    return total",
    "",
    "",
    "def _validate_font_text_identity(value: str, path: str) -> None:",
    "    if not value or not value[0].isascii() or not value[0].isalnum() or any(",
    "        not char.isascii() or (not char.isalnum() and char not in '._:-') for char in value[1:]",
    "    ):",
    '        raise msgspec.ValidationError(f"invalid_text_id at {path}")',
    "",
    "",
    "def _font_tag_valid(value: str) -> bool:",
    "    return len(value) == 4 and all(char.isascii() and ' ' <= char <= '~' for char in value)",
    "",
    "",
    "def _validate_font_hash(value: str, path: str) -> None:",
    "    if len(value) != 64 or any(char not in '0123456789abcdef' for char in value):",
    '        raise msgspec.ValidationError(f"invalid_hash at {path}")',
    "",
    "",
    "def _validate_font_variations(value: list[FontVariationCoordinate], path: str) -> None:",
    "    axes: set[str] = set()",
    "    for index, variation in enumerate(value):",
    "        if not _font_tag_valid(variation.axis) or not math.isfinite(variation.value) or variation.axis in axes:",
    '            raise msgspec.ValidationError(f"invalid_variation at {path}[{index}]")',
    "        axes.add(variation.axis)",
  ];
}

function renderPythonSourceBundleValidation(functionName, typeName) {
  return [
    `_source_bundle_manifest_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _source_bundle_manifest_a0_decoder.decode(data)",
    "    for source in value.sources:",
    "        if int(source.source_bytes) > 18_446_744_073_709_551_615:",
    '            raise msgspec.ValidationError("source_bytes exceeds uint64")',
    "    return value",
  ];
}

function renderPythonNativeHandshakeValidation(functionName, typeName) {
  return [
    `_native_handshake_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _native_handshake_a0_decoder.decode(data)",
    "    validate_native_handshake_a0(value)",
    "    return value",
    "",
    "",
    `def validate_native_handshake_a0(value: ${typeName}) -> None:`,
    "    if not value.engine_version:",
    '        raise msgspec.ValidationError("invalid_value at $.engine_version")',
    "    if len(value.operations) != 1 or value.operations[0] != 'design-facts':",
    '        raise msgspec.ValidationError("unsupported_contract at $.operations")',
  ];
}

function renderPythonNativeHandshakeA1Validation(functionName, typeName) {
  return [
    `_native_handshake_a1_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _native_handshake_a1_decoder.decode(data)",
    "    validate_native_handshake_a1(value)",
    "    return value",
    "",
    "",
    `def validate_native_handshake_a1(value: ${typeName}) -> None:`,
    "    if not value.engine_version:",
    '        raise msgspec.ValidationError("invalid_value at $.engine_version")',
    "    if value.operations != ('design-facts', 'render-svg'):",
    '        raise msgspec.ValidationError("unsupported_contract at $.operations")',
  ];
}

function renderPythonNativeHandshakeA2Validation(functionName, typeName) {
  return [
    `_native_handshake_a2_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _native_handshake_a2_decoder.decode(data)",
    "    validate_native_handshake_a2(value)",
    "    return value",
    "",
    "",
    `def validate_native_handshake_a2(value: ${typeName}) -> None:`,
    "    if not value.engine_version:",
    '        raise msgspec.ValidationError("invalid_value at $.engine_version")',
    "    if value.operations != ('design-facts', 'render-svg', 'design-facts-a1'):",
    '        raise msgspec.ValidationError("unsupported_contract at $.operations")',
  ];
}

function renderPythonNativeRequestValidation(functionName, typeName) {
  return [
    `_native_design_facts_request_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _native_design_facts_request_a0_decoder.decode(data)",
    "    validate_native_design_facts_request_a0(value)",
    "    return value",
    "",
    "",
    `def validate_native_design_facts_request_a0(value: ${typeName}) -> None:`,
    "    fields = ('max_source_bytes', 'max_total_source_bytes', 'max_output_bytes')",
    "    for field_name in fields:",
    "        encoded = getattr(value.limits, field_name)",
    "        if int(encoded) > 18_446_744_073_709_551_615:",
    '            raise msgspec.ValidationError(f"invalid_uint64 at $.limits.{field_name}")',
    "    for index, source in enumerate(value.manifest.sources):",
    "        if int(source.source_bytes) > 18_446_744_073_709_551_615:",
    '            raise msgspec.ValidationError(f"invalid_uint64 at $.manifest.sources[{index}].source_bytes")',
  ];
}

function renderPythonNativeResultValidation(functionName, typeName) {
  return [
    `_native_design_facts_result_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _native_design_facts_result_a0_decoder.decode(data)",
    "    validate_native_design_facts_result_a0(value)",
    "    return value",
    "",
    "",
    `def validate_native_design_facts_result_a0(value: ${typeName}) -> None:`,
    "    if not value.engine_version:",
    '        raise msgspec.ValidationError("invalid_value at $.engine_version")',
  ];
}

function renderPythonNativeRequestA1Validation(functionName, typeName) {
  return [
    `_native_design_facts_request_a1_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _native_design_facts_request_a1_decoder.decode(data)",
    "    validate_native_design_facts_request_a1(value)",
    "    return value",
    "",
    "",
    `def validate_native_design_facts_request_a1(value: ${typeName}) -> None:`,
    "    fields = ('max_source_bytes', 'max_total_source_bytes', 'max_output_bytes')",
    "    for field_name in fields:",
    "        encoded = getattr(value.limits, field_name)",
    "        if int(encoded) > 18_446_744_073_709_551_615:",
    '            raise msgspec.ValidationError(f"invalid_uint64 at $.limits.{field_name}")',
    "    for index, source in enumerate(value.manifest.sources):",
    "        if int(source.source_bytes) > 18_446_744_073_709_551_615:",
    '            raise msgspec.ValidationError(f"invalid_uint64 at $.manifest.sources[{index}].source_bytes")',
  ];
}

function renderPythonNativeResultA1Validation(functionName, typeName) {
  return [
    `_native_design_facts_result_a1_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _native_design_facts_result_a1_decoder.decode(data)",
    "    validate_native_design_facts_result_a1(value)",
    "    return value",
    "",
    "",
    `def validate_native_design_facts_result_a1(value: ${typeName}) -> None:`,
    "    if not value.engine_version:",
    '        raise msgspec.ValidationError("invalid_value at $.engine_version")',
    "    if not value.kicad_netlist:",
    '        raise msgspec.ValidationError("invalid_value at $.kicad_netlist")',
    "    declared_bytes = int(value.kicad_netlist_bytes)",
    "    if declared_bytes > 18_446_744_073_709_551_615:",
    '        raise msgspec.ValidationError("invalid_uint64 at $.kicad_netlist_bytes")',
    "    encoded = value.kicad_netlist.encode('utf-8')",
    "    if declared_bytes != len(encoded):",
    '        raise msgspec.ValidationError("length_mismatch at $.kicad_netlist_bytes")',
    "    if value.kicad_netlist_sha256 != hashlib.sha256(encoded).hexdigest():",
    '        raise msgspec.ValidationError("hash_mismatch at $.kicad_netlist_sha256")',
  ];
}

function renderPythonNativeSvgRequestValidation(functionName, typeName) {
  return [
    `_native_svg_render_request_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _native_svg_render_request_a0_decoder.decode(data)",
    "    validate_native_svg_render_request_a0(value)",
    "    return value",
    "",
    "",
    `def validate_native_svg_render_request_a0(value: ${typeName}) -> None:`,
    "    for field_name in (",
    "        'max_points',",
    "        'max_text_bytes',",
    "        'max_image_encoded_bytes',",
    "        'max_svg_elements',",
    "        'max_render_work',",
    "        'max_svg_bytes',",
    "        'max_result_bytes',",
    "    ):",
    "        _validate_native_uint64(getattr(value.limits, field_name), f'$.limits.{field_name}')",
    "    document = value.document",
    "    if isinstance(document, NativeFootprintSvgDocument):",
    "        validate_footprint_plot_document_a0(document.value)",
    "        expected_source_kind = 'MOD'",
    "    elif isinstance(document, NativeSymbolSvgDocument):",
    "        validate_symbol_plot_document_a0(document.value)",
    "        expected_source_kind = 'SYM'",
    "    elif isinstance(document, NativeBoardSvgDocument):",
    "        validate_board_plot_document_a0(document.value)",
    "        expected_source_kind = 'PCB'",
    "    elif isinstance(document, NativeSchematicSvgDocument):",
    "        validate_schematic_plot_document_a0(document.value)",
    "        expected_source_kind = 'SCH'",
    "        canvas = document.value.canvas",
    "        viewport = value.viewport",
    "        if (",
    "            viewport.min_x_nm != 0",
    "            or viewport.min_y_nm != 0",
    "            or viewport.width_nm != canvas.width_nm",
    "            or viewport.height_nm != canvas.height_nm",
    "        ):",
    '            raise msgspec.ValidationError("viewport_mismatch at $.viewport")',
    "    else:",
    '        raise msgspec.ValidationError("unsupported_contract at $.document.kind")',
    "    if not document.value.document_id:",
    '        raise msgspec.ValidationError("invalid_value at $.document.value.document_id")',
    "    if document.value.source_kind != expected_source_kind:",
    '        raise msgspec.ValidationError("source_kind_mismatch at $.document.value.source_kind")',
    "",
    "",
    "def _validate_native_uint64(value: str, path: str) -> None:",
    "    canonical = value == '0' or (",
    "        bool(value)",
    "        and value[0] in '123456789'",
    "        and value.isascii()",
    "        and value.isdecimal()",
    "    )",
    "    if (",
    "        not canonical",
    "        or len(value) > 20",
    "        or (len(value) == 20 and value > '18446744073709551615')",
    "    ):",
    '        raise msgspec.ValidationError(f"invalid_uint64 at {path}")',
  ];
}

function renderPythonNativeSvgResultValidation(functionName, typeName) {
  return [
    `_native_svg_render_result_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _native_svg_render_result_a0_decoder.decode(data)",
    "    validate_native_svg_render_result_a0(value)",
    "    return value",
    "",
    "",
    `def validate_native_svg_render_result_a0(value: ${typeName}) -> None:`,
    "    if not value.engine_version:",
    '        raise msgspec.ValidationError("invalid_value at $.engine_version")',
    "    if not value.document_id:",
    '        raise msgspec.ValidationError("invalid_value at $.document_id")',
    "    if not value.svg_utf8:",
    '        raise msgspec.ValidationError("invalid_value at $.svg_utf8")',
    "    _validate_native_uint64(value.svg_bytes, '$.svg_bytes')",
    "    if int(value.svg_bytes) != len(value.svg_utf8.encode('utf-8')):",
    '        raise msgspec.ValidationError("length_mismatch at $.svg_bytes")',
    "    if value.svg_sha256 != hashlib.sha256(value.svg_utf8.encode('utf-8')).hexdigest():",
    '        raise msgspec.ValidationError("hash_mismatch at $.svg_sha256")',
  ];
}

function renderPythonPlotterValidation(functionName, typeName) {
  return [
    `_footprint_plot_document_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _footprint_plot_document_a0_decoder.decode(data)",
    "    validate_footprint_plot_document_a0(value)",
    "    return value",
    "",
    "",
    `def validate_footprint_plot_document_a0(value: ${typeName}) -> None:`,
    "    if len(value.records) != 1:",
    '        raise msgspec.ValidationError("invalid_footprint_document at $.records")',
    "    record = value.records[0]",
    "    _validate_footprint_record(record, '$.records[0]')",
    "    if value.total_operations != len(record.operations):",
    '        raise msgspec.ValidationError("operation_count_mismatch at $.total_operations")',
    "",
    "",
    "def _validate_footprint_record(record: FootprintPlotRecord, path: str) -> None:",
    "    if record.object_id != record.name:",
    '        raise msgspec.ValidationError(f"invalid_footprint_record at {path}")',
    "    if record.operation_count != len(record.operations):",
    '        raise msgspec.ValidationError(f"operation_count_mismatch at {path}.operation_count")',
    "    for operation_index, operation in enumerate(record.operations):",
    "        operation_path = f'{path}.operations[{operation_index}]'",
    "        if operation.index != operation_index:",
    '            raise msgspec.ValidationError(f"operation_index_mismatch at {operation_path}.index")',
    "        _validate_footprint_operation(operation, operation_path)",
    "",
    "",
    "def _validate_footprint_operation(operation: PlotterOperation, path: str) -> None:",
    "    if isinstance(operation, (ThickSegmentOperation, CircleOperation)):",
    "        _validate_shared_graphic_or_drill(operation, path)",
    "    elif isinstance(operation, TextOperation):",
    "        _validate_footprint_text(operation, path)",
    "    elif isinstance(operation, (ArcThreePointOperation, RectOperation, PlotPolyOperation, BezierCurveOperation)):",
    "        if operation.layer is UNSET or not operation.layer:",
    '            raise msgspec.ValidationError(f"missing_layer at {path}")',
    "    elif isinstance(operation, (FlashPadCircleOperation, FlashPadOvalOperation, FlashPadRectOperation, FlashPadRoundRectOperation, FlashPadCustomOperation, FlashPadTrapezOperation)):",
    "        _validate_footprint_pad_operation(operation, path)",
    "    else:",
    '        raise msgspec.ValidationError(f"invalid_footprint_operation at {path}")',
    "",
    "",
    "def _validate_footprint_pad_operation(operation: FlashPadCircleOperation | FlashPadOvalOperation | FlashPadRectOperation | FlashPadRoundRectOperation | FlashPadCustomOperation | FlashPadTrapezOperation, path: str) -> None:",
    "    if not operation.layers:",
    '        raise msgspec.ValidationError(f"missing_layers at {path}")',
    "    if isinstance(operation, FlashPadCircleOperation) and (operation.mask_margin_nm is UNSET or operation.role is not UNSET):",
    '        raise msgspec.ValidationError(f"invalid_pad_operation at {path}")',
    "    if isinstance(operation, FlashPadCustomOperation):",
    "        widths = operation.polygon_widths_nm",
    "        if widths is not UNSET and widths and len(widths) != len(operation.polygons):",
    '            raise msgspec.ValidationError(f"polygon_width_count_mismatch at {path}.polygon_widths_nm")',
    "",
    "",
    "def _validate_footprint_text(operation: TextOperation, path: str) -> None:",
    "    forbidden = (",
    "        operation.context is not UNSET,",
    "        operation.mirror is not UNSET,",
    "        operation.text_as_polygons is not UNSET,",
    "        operation.polyline_per_segment is not UNSET,",
    "        operation.knockout is not UNSET,",
    "        operation.render_cache_polygons is not UNSET,",
    "        operation.render_cache is not UNSET,",
    "        operation.render_cache_source is not UNSET,",
    "        operation.render_cache_exact is not UNSET,",
    "    )",
    "    if operation.layer is UNSET or not operation.layer or any(forbidden):",
    '        raise msgspec.ValidationError(f"invalid_footprint_text at {path}")',
    "",
    "",
    "def _validate_shared_graphic_or_drill(operation: ThickSegmentOperation | CircleOperation, path: str) -> None:",
    "    layer = None if operation.layer is UNSET else operation.layer",
    "    role = None if operation.role is UNSET else operation.role",
    "    layers = [] if operation.layers is UNSET else operation.layers",
    "    has_mask = operation.mask_margin_nm is not UNSET",
    "    has_size_x = operation.pad_size_x_nm is not UNSET",
    "    has_size_y = operation.pad_size_y_nm is not UNSET",
    "    if isinstance(operation, ThickSegmentOperation) and operation.stroke_color is not UNSET:",
    '        raise msgspec.ValidationError(f"invalid_segment_color at {path}.stroke_color")',
    "    graphic = (",
    "        role is None and layer is not None and not layers",
    "        and not has_mask and not has_size_x and not has_size_y",
    "    )",
    "    pad_drill = (",
    '        role == "pad_drill" and layer is None and bool(layers)',
    "        and not has_mask and not has_size_x and not has_size_y",
    "    )",
    "    npth_hole = (",
    '        role == "npth_hole" and layer is None and bool(layers)',
    "        and has_mask and has_size_x and has_size_y",
    "    )",
    "    if not (graphic or pad_drill or npth_hole):",
    '        raise msgspec.ValidationError(f"conflicting_plotter_fields at {path}")',
  ];
}

function renderPythonSymbolPlotterValidation(functionName, typeName) {
  return [
    "def _optional_operation_layer(operation: object) -> str | None:",
    "    value = getattr(operation, 'layer', UNSET)",
    "    return None if value is UNSET else cast(str, value)",
    "",
    "",
    `_symbol_plot_document_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _symbol_plot_document_a0_decoder.decode(data)",
    "    validate_symbol_plot_document_a0(value)",
    "    return value",
    "",
    "",
    `def validate_symbol_plot_document_a0(value: ${typeName}) -> None:`,
    '    if value.schema != "kicad.plotter_ir.a0" or value.source_kind != "SYM" or value.coordinate_space.unit != "nm" or value.coordinate_space.y_axis != "down":',
    '        raise msgspec.ValidationError("invalid_symbol_document at $")',
    "    if not value.records or not isinstance(value.records[0], SymbolHeaderPlotRecord):",
    '        raise msgspec.ValidationError("missing_symbol_header at $.records[0]")',
    "    total_operations = 0",
    "    for record_index, record in enumerate(value.records):",
    "        _validate_symbol_record(record, record_index)",
    "        if record.operation_count != len(record.operations):",
    '            raise msgspec.ValidationError(f"operation_count_mismatch at $.records[{record_index}].operation_count")',
    "        total_operations += len(record.operations)",
    "        for operation_index, operation in enumerate(record.operations):",
    '            path = f"$.records[{record_index}].operations[{operation_index}]"',
    "            if operation.index != total_operations - len(record.operations) + operation_index:",
    '                raise msgspec.ValidationError(f"operation_index_mismatch at {path}.index")',
    "            _validate_symbol_operation(operation, path)",
    "    if value.total_operations != total_operations:",
    '        raise msgspec.ValidationError("operation_count_mismatch at $.total_operations")',
    "",
    "",
    "def _validate_symbol_record(record: SymbolPlotRecord, record_index: int) -> None:",
    "    if isinstance(record, SymbolHeaderPlotRecord):",
    "        if record_index != 0 or record.object_id != record.name or record.operation_count != 0 or record.operations:",
    '            raise msgspec.ValidationError(f"invalid_symbol_header at $.records[{record_index}]")',
    "    elif not record.object_id:",
    '        raise msgspec.ValidationError(f"invalid_symbol_record at $.records[{record_index}]")',
    "",
    "",
    "def _validate_symbol_operation(operation: PlotterOperation, path: str) -> None:",
    "    allowed = isinstance(operation, (ArcThreePointOperation, CircleOperation, RectOperation, PlotPolyOperation, BezierCurveOperation, TextOperation))",
    "    layer = _optional_operation_layer(operation)",
    "    if not allowed or (not isinstance(operation, TextOperation) and layer is not None):",
    '        raise msgspec.ValidationError(f"invalid_symbol_operation at {path}")',
    "    if isinstance(operation, CircleOperation):",
    "        role = None if operation.role is UNSET else operation.role",
    "        layers = [] if operation.layers is UNSET else operation.layers",
    "        if role is not None or layers or operation.mask_margin_nm is not UNSET or operation.pad_size_x_nm is not UNSET or operation.pad_size_y_nm is not UNSET:",
    '            raise msgspec.ValidationError(f"invalid_symbol_operation at {path}")',
    "    if isinstance(operation, TextOperation):",
    "        forbidden = (layer is not None, operation.mirror is not UNSET, operation.text_as_polygons is not UNSET, operation.polyline_per_segment is not UNSET, operation.knockout is not UNSET, operation.render_cache_polygons is not UNSET, operation.render_cache is not UNSET, operation.render_cache_source is not UNSET, operation.render_cache_exact is not UNSET, operation.context is not UNSET)",
    "        if any(forbidden):",
    '            raise msgspec.ValidationError(f"invalid_symbol_text at {path}")',
  ];
}

function renderPythonSchematicPlotterValidation(functionName, typeName) {
  return [
    `_schematic_plot_document_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _schematic_plot_document_a0_decoder.decode(data)",
    "    validate_schematic_plot_document_a0(value)",
    "    return value",
    "",
    "",
    `def validate_schematic_plot_document_a0(value: ${typeName}) -> None:`,
    '    if value.schema != "kicad.plotter_ir.a0" or value.source_kind != "SCH" or value.coordinate_space.unit != "nm" or value.coordinate_space.y_axis != "down":',
    '        raise msgspec.ValidationError("invalid_schematic_document at $")',
    "    if not value.records or not isinstance(value.records[0], SchematicSheetHeaderPlotRecord):",
    '        raise msgspec.ValidationError("missing_sheet_header at $.records[0]")',
    "    phases = {SchematicSheetHeaderPlotRecord: 0, SchematicWirePlotRecord: 1, SchematicBusPlotRecord: 2, SchematicBusEntryPlotRecord: 3, SchematicJunctionPlotRecord: 4, SchematicNoConnectPlotRecord: 5, SchematicLabelPlotRecord: 6, SchematicGlobalLabelPlotRecord: 7, SchematicHierarchicalLabelPlotRecord: 8, SchematicNetclassFlagPlotRecord: 9, SchematicTextPlotRecord: 10, SchematicTextBoxPlotRecord: 11, SchematicGraphicPolylinePlotRecord: 12, SchematicGraphicArcPlotRecord: 13, SchematicGraphicCirclePlotRecord: 14, SchematicGraphicRectanglePlotRecord: 15, SchematicGraphicBezierPlotRecord: 16, SchematicRuleAreaPlotRecord: 17, SchematicImagePlotRecord: 18, SchematicTablePlotRecord: 19, SchematicSymbolInstancePlotRecord: 20, SchematicSymbolOverplotPlotRecord: 21, SchematicSheetPlotRecord: 22}",
    "    previous_phase = -1",
    "    total_operations = 0",
    "    for record_index, record in enumerate(value.records):",
    "        path = f'$.records[{record_index}]'",
    "        phase = phases[type(record)]",
    "        if phase < previous_phase or (phase == 0 and record_index != 0):",
    '            raise msgspec.ValidationError(f"invalid_schematic_record_order at {path}")',
    "        previous_phase = phase",
    "        _validate_schematic_record_identity(record, path)",
    "        if record.operation_count != len(record.operations):",
    '            raise msgspec.ValidationError(f"operation_count_mismatch at {path}.operation_count")',
    "        for operation_index, operation in enumerate(record.operations):",
    "            if operation.index != operation_index:",
    '                raise msgspec.ValidationError(f"operation_index_mismatch at {path}.operations[{operation_index}].index")',
    "        _validate_schematic_record_payload(value, record, path)",
    "        total_operations += len(record.operations)",
    "    if value.total_operations != total_operations:",
    '        raise msgspec.ValidationError("operation_count_mismatch at $.total_operations")',
    "",
    "",
    "def _validate_schematic_record_identity(record: SchematicPlotRecord, path: str) -> None:",
    "    label_record = isinstance(record, (SchematicLabelPlotRecord, SchematicGlobalLabelPlotRecord, SchematicHierarchicalLabelPlotRecord))",
    "    symbol_record = isinstance(record, (SchematicSymbolInstancePlotRecord, SchematicSymbolOverplotPlotRecord))",
    "    sheet_record = isinstance(record, SchematicSheetPlotRecord)",
    "    invalid = (label_record and record.object_id != record.text) or (sheet_record and record.object_id != record.sheet_name)",
    "    invalid = invalid or (not label_record and not isinstance(record, SchematicNetclassFlagPlotRecord) and not symbol_record and not sheet_record and record.object_id != record.uuid)",
    "    if invalid:",
    '        raise msgspec.ValidationError(f"invalid_schematic_record_identity at {path}")',
    "",
    "",
    "def _validate_schematic_record_payload(value: SchematicPlotDocumentA0, record: SchematicPlotRecord, path: str) -> None:",
    "    if isinstance(record, SchematicSheetHeaderPlotRecord):",
    "        _validate_schematic_sheet_header(value, record, path)",
    "    elif isinstance(record, (SchematicWirePlotRecord, SchematicBusPlotRecord, SchematicBusEntryPlotRecord)):",
    "        _validate_schematic_polyline_record(record, path)",
    "    elif isinstance(record, SchematicJunctionPlotRecord):",
    "        _validate_schematic_junction_record(record, path)",
    "    elif isinstance(record, SchematicNoConnectPlotRecord):",
    "        _validate_schematic_no_connect_record(record, path)",
    "    elif isinstance(record, (SchematicLabelPlotRecord, SchematicGlobalLabelPlotRecord, SchematicHierarchicalLabelPlotRecord)):",
    "        _validate_schematic_label_record(record, path)",
    "    elif isinstance(record, SchematicNetclassFlagPlotRecord):",
    "        _validate_schematic_netclass_flag_record(record, path)",
    "    elif isinstance(record, SchematicTextPlotRecord):",
    "        _validate_schematic_text_record(record, path)",
    "    elif isinstance(record, SchematicTextBoxPlotRecord):",
    "        _validate_schematic_text_box_record(record, path)",
    "    else:",
    "        _validate_schematic_record_payload_tail(record, path)",
    "",
    "",
    "def _validate_schematic_record_payload_tail(record: SchematicPlotRecord, path: str) -> None:",
    "    if isinstance(record, (SchematicGraphicPolylinePlotRecord, SchematicGraphicArcPlotRecord, SchematicGraphicCirclePlotRecord, SchematicGraphicRectanglePlotRecord)):",
    "        _validate_schematic_graphic_record(record, path)",
    "    elif isinstance(record, SchematicGraphicBezierPlotRecord):",
    "        _validate_schematic_bezier_record(record, path)",
    "    elif isinstance(record, SchematicRuleAreaPlotRecord):",
    "        _validate_schematic_rule_area_record(record, path)",
    "    elif isinstance(record, SchematicImagePlotRecord):",
    "        _validate_schematic_image_record(record, path)",
    "    elif isinstance(record, SchematicTablePlotRecord):",
    "        _validate_schematic_table_record(record, path)",
    "    elif isinstance(record, (SchematicSymbolInstancePlotRecord, SchematicSymbolOverplotPlotRecord)):",
    "        _validate_schematic_symbol_record(record, path)",
    "    else:",
    "        _validate_schematic_sheet_record(cast(SchematicSheetPlotRecord, record), path)",
    "",
    "",
    "def _validate_schematic_sheet_header(value: SchematicPlotDocumentA0, record: SchematicSheetHeaderPlotRecord, path: str) -> None:",
    "    if value.canvas.width_nm != record.sheet_width_nm or value.canvas.height_nm != record.sheet_height_nm or record.sheet_width_nm <= 0 or record.sheet_height_nm <= 0:",
    '        raise msgspec.ValidationError(f"invalid_sheet_header at {path}")',
    "    if not record.operations or not isinstance(record.operations[0], RectOperation):",
    '        raise msgspec.ValidationError(f"invalid_sheet_background at {path}.operations[0]")',
    "    background = record.operations[0]",
    "    background_layer = None if background.layer is UNSET else background.layer",
    "    if (background.x1, background.y1, background.x2, background.y2) != (0, 0, record.sheet_width_nm, record.sheet_height_nm) or background.fill != 'FILLED_SHAPE' or background.width_nm != 100 or background.corner_radius_nm != 0 or background_layer is not None or background.stroke_color != '#F5F4EFFF' or background.fill_color != '#F5F4EFFF':",
    '        raise msgspec.ValidationError(f"invalid_sheet_background at {path}.operations[0]")',
    "    for operation_index, operation in enumerate(record.operations[1:], start=1):",
    "        operation_path = f'{path}.operations[{operation_index}]'",
    "        _validate_schematic_worksheet_operation(operation, operation_path)",
    "",
    "",
    "def _validate_schematic_worksheet_operation(operation: PlotterOperation, path: str) -> None:",
    "    if not isinstance(operation, (RectOperation, PlotPolyOperation, TextOperation, PlotImageOperation)):",
    '        raise msgspec.ValidationError(f"invalid_worksheet_operation at {path}")',
    "    layer = _optional_operation_layer(operation)",
    "    if layer is not None:",
    '        raise msgspec.ValidationError(f"invalid_worksheet_operation at {path}")',
    "    if isinstance(operation, RectOperation) and (operation.fill != 'NO_FILL' or operation.width_nm < 152_400 or operation.corner_radius_nm != 0 or operation.stroke_color != '#840000FF' or operation.fill_color is not UNSET or operation.line_style is not UNSET):",
    '        raise msgspec.ValidationError(f"invalid_worksheet_rect at {path}")',
    "    if isinstance(operation, PlotPolyOperation) and (len(operation.points) != 2 or operation.fill != 'NO_FILL' or operation.width_nm < 152_400 or operation.stroke_color != '#840000FF' or operation.fill_color is not UNSET or operation.line_style is not UNSET):",
    '        raise msgspec.ValidationError(f"invalid_worksheet_polyline at {path}")',
    "    if isinstance(operation, TextOperation):",
    "        forbidden = (operation.context is not UNSET, operation.mirror is not UNSET, operation.text_as_polygons is not UNSET, operation.polyline_per_segment is not UNSET, operation.knockout is not UNSET, operation.render_cache_polygons is not UNSET, operation.render_cache is not UNSET, operation.render_cache_source is not UNSET, operation.render_cache_exact is not UNSET)",
    "        if any(forbidden) or not math.isfinite(operation.orient_deg):",
    '            raise msgspec.ValidationError(f"invalid_worksheet_text at {path}")',
    "    if isinstance(operation, PlotImageOperation) and (operation.image_format != 'png' or not math.isfinite(operation.scale) or operation.scale <= 0 or operation.width_nm < 0 or operation.height_nm < 0 or operation.stroke_color != '#840000FF' or not _valid_schematic_png_base64(operation.image_data_b64)):",
    '        raise msgspec.ValidationError(f"invalid_worksheet_image at {path}")',
    "",
    "",
    "def _valid_schematic_png_base64(value: str) -> bool:",
    "    prefix = bytearray()",
    "    quartet: list[int] = []",
    "    ended = False",
    "    for character in value:",
    "        if character in ' \\t\\r\\n\\v\\f':",
    "            return False",
    "        if ended:",
    "            return False",
    "        sextet = _schematic_base64_sextet(character)",
    "        if sextet is None:",
    "            return False",
    "        quartet.append(sextet)",
    "        if len(quartet) != 4:",
    "            continue",
    "        decoded_len = _schematic_base64_quartet_length(quartet)",
    "        if decoded_len is None:",
    "            return False",
    "        ended = decoded_len != 3",
    "        decoded = ((quartet[0] << 2) | (quartet[1] >> 4), ((quartet[1] << 4) | (quartet[2] >> 2)) & 0xFF, ((quartet[2] << 6) | quartet[3]) & 0xFF)",
    "        prefix.extend(decoded[:min(decoded_len, 33 - len(prefix))])",
    "        quartet.clear()",
    "    if quartet or len(prefix) < 33:",
    "        return False",
    "    width = int.from_bytes(prefix[16:20], 'big')",
    "    height = int.from_bytes(prefix[20:24], 'big')",
    "    return prefix[:8] == b'\\x89PNG\\r\\n\\x1a\\n' and prefix[8:12] == b'\\x00\\x00\\x00\\r' and prefix[12:16] == b'IHDR' and width > 0 and height > 0",
    "",
    "",
    "def _schematic_base64_sextet(character: str) -> int | None:",
    "    code = ord(character)",
    "    if 65 <= code <= 90:",
    "        return code - 65",
    "    if 97 <= code <= 122:",
    "        return code - 97 + 26",
    "    if 48 <= code <= 57:",
    "        return code - 48 + 52",
    "    return {'+': 62, '/': 63, '=': 64}.get(character)",
    "",
    "",
    "def _schematic_base64_quartet_length(quartet: list[int]) -> int | None:",
    "    if quartet[0] >= 64 or quartet[1] >= 64:",
    "        return None",
    "    if quartet[2] == 64:",
    "        return 1 if quartet[3] == 64 and not quartet[1] & 0x0F else None",
    "    if quartet[3] == 64:",
    "        return 2 if not quartet[2] & 0x03 else None",
    "    return 3",
    "",
    "",
    "def _validate_schematic_polyline_record(record: SchematicWirePlotRecord | SchematicBusPlotRecord | SchematicBusEntryPlotRecord, path: str) -> None:",
    "    if len(record.operations) != 1 or not isinstance(record.operations[0], PlotPolyOperation):",
    '        raise msgspec.ValidationError(f"invalid_connectivity_record at {path}")',
    "    operation = record.operations[0]",
    "    layer = None if operation.layer is UNSET else operation.layer",
    "    if layer is not None or operation.fill != 'NO_FILL' or operation.width_nm < 0 or operation.stroke_color is UNSET or not operation.stroke_color or operation.line_style is UNSET or not operation.points:",
    '        raise msgspec.ValidationError(f"invalid_connectivity_polyline at {path}.operations[0]")',
    "    if isinstance(record, SchematicBusEntryPlotRecord) and len(operation.points) != 2:",
    '        raise msgspec.ValidationError(f"invalid_bus_entry at {path}.operations[0].points")',
    "",
    "",
    "def _validate_schematic_junction_record(record: SchematicJunctionPlotRecord, path: str) -> None:",
    "    if len(record.operations) != 1 or not isinstance(record.operations[0], CircleOperation):",
    '        raise msgspec.ValidationError(f"invalid_junction at {path}")',
    "    operation = record.operations[0]",
    "    layer = None if operation.layer is UNSET else operation.layer",
    "    role = None if operation.role is UNSET else operation.role",
    "    layers = [] if operation.layers is UNSET else operation.layers",
    "    forbidden = (role is not None, bool(layers), operation.mask_margin_nm is not UNSET, operation.pad_size_x_nm is not UNSET, operation.pad_size_y_nm is not UNSET)",
    "    if layer is not None or any(forbidden) or operation.fill != 'FILLED_SHAPE' or operation.width_nm != 0 or operation.diameter_nm <= 0 or operation.stroke_color is UNSET or operation.fill_color is UNSET or operation.stroke_color != operation.fill_color:",
    '        raise msgspec.ValidationError(f"invalid_junction at {path}.operations[0]")',
    "    expected_color = '#009600FF' if record.color is UNSET or record.color is None else record.color",
    "    if expected_color != operation.stroke_color:",
    '        raise msgspec.ValidationError(f"invalid_junction_color at {path}.color")',
    "",
    "",
    "def _validate_schematic_no_connect_record(record: SchematicNoConnectPlotRecord, path: str) -> None:",
    "    if len(record.operations) != 2 or not all(isinstance(operation, PlotPolyOperation) for operation in record.operations):",
    '        raise msgspec.ValidationError(f"invalid_no_connect at {path}")',
    "    first = cast(PlotPolyOperation, record.operations[0])",
    "    second = cast(PlotPolyOperation, record.operations[1])",
    "    for operation_index, operation in enumerate((first, second)):",
    "        layer = None if operation.layer is UNSET else operation.layer",
    "        if layer is not None or operation.fill != 'NO_FILL' or operation.width_nm <= 0 or operation.stroke_color != '#000084FF' or operation.line_style is not UNSET or len(operation.points) != 2:",
    '            raise msgspec.ValidationError(f"invalid_no_connect at {path}.operations[{operation_index}]")',
    "    if first.width_nm != second.width_nm or first.points[0][0] != second.points[0][0] or first.points[1][0] != second.points[1][0] or first.points[0][1] != second.points[1][1] or first.points[1][1] != second.points[0][1]:",
    '        raise msgspec.ValidationError(f"invalid_no_connect_geometry at {path}.operations")',
    "",
    "",
    "def _validate_schematic_annotation_text(operation: TextOperation, path: str) -> None:",
    "    forbidden = (operation.layer is not UNSET, operation.mirror is not UNSET, operation.text_as_polygons is not UNSET, operation.polyline_per_segment is not UNSET, operation.knockout is not UNSET, operation.render_cache_polygons is not UNSET, operation.render_cache is not UNSET, operation.render_cache_source is not UNSET, operation.render_cache_exact is not UNSET)",
    "    if any(forbidden) or not math.isfinite(operation.orient_deg):",
    '        raise msgspec.ValidationError(f"invalid_annotation_text at {path}")',
    "    if operation.context is not UNSET:",
    "        href = operation.context.hyperlink.href",
    "        if not href or href != href.strip():",
    '            raise msgspec.ValidationError(f"invalid_hyperlink_context at {path}.context.hyperlink.href")',
    "",
    "",
    "def _validate_schematic_label_record(record: SchematicLabelPlotRecord | SchematicGlobalLabelPlotRecord | SchematicHierarchicalLabelPlotRecord, path: str) -> None:",
    "    decorated = isinstance(record, (SchematicGlobalLabelPlotRecord, SchematicHierarchicalLabelPlotRecord)) and record.shape in ('input', 'output', 'bidirectional', 'tri_state', 'passive')",
    "    expected_count = 2 if decorated else 1",
    "    if len(record.operations) != expected_count or not isinstance(record.operations[0], TextOperation):",
    '        raise msgspec.ValidationError(f"invalid_label_record at {path}.operations")',
    "    text = record.operations[0]",
    "    _validate_schematic_annotation_text(text, f'{path}.operations[0]')",
    "    if text.text != record.text.replace('{slash}', '/'):",
    '        raise msgspec.ValidationError(f"invalid_label_text at {path}.text")',
    "    if not decorated:",
    "        return",
    "    decoration = record.operations[1]",
    "    if not isinstance(decoration, PlotPolyOperation):",
    '        raise msgspec.ValidationError(f"invalid_label_decoration at {path}.operations[1]")',
    "    if isinstance(record, SchematicGlobalLabelPlotRecord):",
    "        expected_color, expected_points = '#840000FF', 7",
    "    elif isinstance(record, SchematicHierarchicalLabelPlotRecord):",
    "        expected_color = '#725600FF'",
    "        expected_points = 6 if record.shape in ('input', 'output') else 5",
    "    else:",
    '        raise msgspec.ValidationError(f"invalid_label_decoration at {path}.operations[1]")',
    "    layer = None if decoration.layer is UNSET else decoration.layer",
    "    if layer is not None or decoration.fill != 'NO_FILL' or decoration.width_nm != 152_400 or decoration.stroke_color != expected_color or decoration.fill_color is not UNSET or decoration.line_style is not UNSET or len(decoration.points) != expected_points or decoration.points[0] != decoration.points[-1]:",
    '        raise msgspec.ValidationError(f"invalid_label_decoration at {path}.operations[1]")',
    "",
    "",
    "def _validate_schematic_netclass_flag_record(record: SchematicNetclassFlagPlotRecord, path: str) -> None:",
    "    if record.shape in ('round', 'dot'):",
    "        if len(record.operations) < 2 or not isinstance(record.operations[0], ThickSegmentOperation) or not isinstance(record.operations[1], CircleOperation):",
    '            raise msgspec.ValidationError(f"invalid_netclass_marker at {path}.operations")',
    "        segment = cast(ThickSegmentOperation, record.operations[0])",
    "        marker = cast(CircleOperation, record.operations[1])",
    "        segment_layer = None if segment.layer is UNSET else segment.layer",
    "        segment_layers = [] if segment.layers is UNSET else segment.layers",
    "        segment_forbidden = (segment.role is not UNSET, bool(segment_layers), segment.mask_margin_nm is not UNSET, segment.pad_size_x_nm is not UNSET, segment.pad_size_y_nm is not UNSET)",
    "        if segment_layer is not None or any(segment_forbidden) or segment.width_nm <= 0 or segment.stroke_color != '#484848FF' or (segment.start_x, segment.start_y) != (record.at_x_nm, record.at_y_nm):",
    '            raise msgspec.ValidationError(f"invalid_netclass_segment at {path}.operations[0]")',
    "        marker_layer = None if marker.layer is UNSET else marker.layer",
    "        marker_layers = [] if marker.layers is UNSET else marker.layers",
    "        marker_forbidden = (marker.role is not UNSET, bool(marker_layers), marker.mask_margin_nm is not UNSET, marker.pad_size_x_nm is not UNSET, marker.pad_size_y_nm is not UNSET, marker.line_style is not UNSET)",
    "        symbol_size = 355_600 if record.shape == 'dot' else 508_000",
    "        expected_fill = 'FILLED_SHAPE' if record.shape == 'dot' else 'NO_FILL'",
    "        expected_width = 0 if record.shape == 'dot' else segment.width_nm",
    "        expected_fill_color = '#484848FF' if record.shape == 'dot' else UNSET",
    "        if marker_layer is not None or any(marker_forbidden) or marker.diameter_nm != 2 * symbol_size or marker.fill != expected_fill or marker.width_nm != expected_width or marker.stroke_color != '#484848FF' or marker.fill_color != expected_fill_color:",
    '            raise msgspec.ValidationError(f"invalid_netclass_circle at {path}.operations[1]")',
    "        text_start = 2",
    "    else:",
    "        if not record.operations or not isinstance(record.operations[0], PlotPolyOperation):",
    '            raise msgspec.ValidationError(f"invalid_netclass_marker at {path}.operations")',
    "        marker = record.operations[0]",
    "        layer = None if marker.layer is UNSET else marker.layer",
    "        expected_points = 7 if record.shape == 'diamond' else 8",
    "        if layer is not None or marker.fill != 'NO_FILL' or marker.width_nm <= 0 or marker.stroke_color != '#484848FF' or marker.fill_color is not UNSET or marker.line_style is not UNSET or len(marker.points) != expected_points or marker.points[0] != [record.at_x_nm, record.at_y_nm] or marker.points[-1] != marker.points[0]:",
    '            raise msgspec.ValidationError(f"invalid_netclass_polygon at {path}.operations[0]")',
    "        text_start = 1",
    "    for index, operation in enumerate(record.operations[text_start:], start=text_start):",
    "        if not isinstance(operation, TextOperation):",
    '            raise msgspec.ValidationError(f"invalid_netclass_property at {path}.operations[{index}]")',
    "        _validate_schematic_annotation_text(operation, f'{path}.operations[{index}]')",
    "",
    "",
    "def _validate_schematic_text_record(record: SchematicTextPlotRecord, path: str) -> None:",
    "    if len(record.operations) != 1 or not isinstance(record.operations[0], TextOperation):",
    '        raise msgspec.ValidationError(f"invalid_schematic_text at {path}.operations")',
    "    operation = record.operations[0]",
    "    _validate_schematic_annotation_text(operation, f'{path}.operations[0]')",
    "    expected = record.text[:-1] if record.text.endswith('\\n') else record.text",
    "    if operation.text != expected or operation.multiline != ('\\n' in operation.text):",
    '        raise msgspec.ValidationError(f"invalid_schematic_text at {path}.text")',
    "",
    "",
    "def _validate_schematic_text_box_record(record: SchematicTextBoxPlotRecord, path: str) -> None:",
    "    text_start = _validate_schematic_text_box_prefix(record.operations, path)",
    "    _validate_schematic_text_box_lines(record.operations, text_start, path)",
    "",
    "",
    "def _validate_schematic_text_box_prefix(operations: list[PlotterOperation], path: str) -> int:",
    "    if not operations or not isinstance(operations[0], RectOperation):",
    '        raise msgspec.ValidationError(f"invalid_text_box at {path}.operations")',
    "    first = operations[0]",
    "    first_layer = None if first.layer is UNSET else first.layer",
    "    fill_color = None if first.fill_color is UNSET else first.fill_color",
    "    single_fill_valid = (first.fill == 'NO_FILL' and first.fill_color is UNSET) or first.fill != 'NO_FILL'",
    "    if first_layer is not None or first.corner_radius_nm != 0 or first.width_nm < 0 or not _valid_schematic_color(first.stroke_color) or (fill_color is not None and not _valid_schematic_color(fill_color)) or first.line_style is UNSET or not single_fill_valid:",
    '        raise msgspec.ValidationError(f"invalid_text_box_outline at {path}.operations[0]")',
    "    if first.fill in ('NO_FILL', 'FILLED_SHAPE'):",
    "        return 1",
    "    else:",
    "        if len(operations) < 2 or not isinstance(operations[1], RectOperation):",
    '            raise msgspec.ValidationError(f"invalid_text_box_fill_pass at {path}.operations")',
    "        outline = operations[1]",
    "        outline_layer = None if outline.layer is UNSET else outline.layer",
    "        same_geometry = (first.x1, first.y1, first.x2, first.y2, first.corner_radius_nm) == (outline.x1, outline.y1, outline.x2, outline.y2, outline.corner_radius_nm)",
    "        if first.width_nm != 0 or first.fill_color is UNSET or first.stroke_color != first.fill_color or outline_layer is not None or not same_geometry or outline.fill != 'NO_FILL' or outline.width_nm < 0 or not _valid_schematic_color(outline.stroke_color) or outline.fill_color is not UNSET or outline.line_style != first.line_style:",
    '            raise msgspec.ValidationError(f"invalid_text_box_fill_pass at {path}.operations[:2]")',
    "        return 2",
    "",
    "",
    "def _validate_schematic_text_box_lines(operations: list[PlotterOperation], text_start: int, path: str) -> None:",
    "    for index, operation in enumerate(operations[text_start:], start=text_start):",
    "        if not isinstance(operation, TextOperation) or not operation.text or operation.multiline:",
    '            raise msgspec.ValidationError(f"invalid_text_box_line at {path}.operations[{index}]")',
    "        _validate_schematic_annotation_text(operation, f'{path}.operations[{index}]')",
    "",
    "",
    "def _valid_schematic_color(value: object) -> bool:",
    "    return isinstance(value, str) and len(value) == 9 and value[0] == '#' and all(char in '0123456789ABCDEF' for char in value[1:])",
    "",
    "",
    "def _schematic_graphic_geometry(operation: PlotterOperation) -> tuple:",
    "    if isinstance(operation, PlotPolyOperation):",
    "        return tuple(tuple(point) for point in operation.points)",
    "    if isinstance(operation, ArcThreePointOperation):",
    "        return (operation.start_x, operation.start_y, operation.mid_x, operation.mid_y, operation.end_x, operation.end_y)",
    "    if isinstance(operation, CircleOperation):",
    "        return (operation.cx, operation.cy, operation.diameter_nm)",
    "    if isinstance(operation, RectOperation):",
    "        return (operation.x1, operation.y1, operation.x2, operation.y2, operation.corner_radius_nm)",
    "    raise msgspec.ValidationError('invalid_graphic_operation')",
    "",
    "",
    "_SchematicGraphicOperation = Union[PlotPolyOperation, ArcThreePointOperation, CircleOperation, RectOperation]",
    "",
    "",
    "def _validate_schematic_graphic_operation(operation: PlotterOperation, path: str) -> None:",
    "    if not isinstance(operation, (PlotPolyOperation, ArcThreePointOperation, CircleOperation, RectOperation)):",
    '        raise msgspec.ValidationError(f"invalid_graphic_operation at {path}")',
    "    graphic = cast(_SchematicGraphicOperation, operation)",
    "    layer = None if graphic.layer is UNSET else graphic.layer",
    "    if layer is not None or graphic.width_nm < 0 or graphic.stroke_color is UNSET or not _valid_schematic_color(graphic.stroke_color) or (graphic.fill_color is not UNSET and not _valid_schematic_color(graphic.fill_color)) or graphic.line_style is UNSET:",
    '        raise msgspec.ValidationError(f"invalid_graphic_style at {path}")',
    "    if isinstance(graphic, PlotPolyOperation) and len(graphic.points) < 2:",
    '        raise msgspec.ValidationError(f"invalid_graphic_points at {path}.points")',
    "    if isinstance(graphic, CircleOperation):",
    "        forbidden = (graphic.role is not UNSET, bool([] if graphic.layers is UNSET else graphic.layers), graphic.mask_margin_nm is not UNSET, graphic.pad_size_x_nm is not UNSET, graphic.pad_size_y_nm is not UNSET)",
    "        if any(forbidden) or graphic.diameter_nm < 0:",
    '            raise msgspec.ValidationError(f"invalid_graphic_circle at {path}")',
    "    if isinstance(graphic, RectOperation) and graphic.corner_radius_nm < 0:",
    '        raise msgspec.ValidationError(f"invalid_graphic_rectangle at {path}")',
    "",
    "",
    "def _validate_schematic_graphic_operations(operations: list[PlotterOperation], expected_type: type, path: str, *, closed: bool = False) -> None:",
    "    if len(operations) not in (1, 2) or not all(isinstance(operation, expected_type) for operation in operations):",
    '        raise msgspec.ValidationError(f"invalid_graphic_record at {path}.operations")',
    "    narrowed = cast(list[_SchematicGraphicOperation], operations)",
    "    for index, operation in enumerate(narrowed):",
    "        _validate_schematic_graphic_operation(operation, f'{path}.operations[{index}]')",
    "    first = narrowed[0]",
    "    if closed and (not isinstance(first, PlotPolyOperation) or first.points[0] != first.points[-1]):",
    '        raise msgspec.ValidationError(f"open_rule_area at {path}.operations[0].points")',
    "    if len(operations) == 1:",
    "        valid_fill = (first.fill == 'NO_FILL' and first.fill_color is UNSET) or first.fill == 'FILLED_SHAPE'",
    "        if not valid_fill:",
    '            raise msgspec.ValidationError(f"invalid_graphic_fill at {path}.operations[0]")',
    "        return",
    "    outline = narrowed[1]",
    "    if first.fill in ('NO_FILL', 'FILLED_SHAPE') or first.width_nm != 0 or first.fill_color is UNSET or first.stroke_color != first.fill_color or outline.fill != 'NO_FILL' or outline.fill_color is not UNSET or outline.line_style != first.line_style or _schematic_graphic_geometry(first) != _schematic_graphic_geometry(outline):",
    '        raise msgspec.ValidationError(f"invalid_graphic_fill_pair at {path}.operations")',
    "",
    "",
    "def _validate_schematic_graphic_record(record: SchematicGraphicPolylinePlotRecord | SchematicGraphicArcPlotRecord | SchematicGraphicCirclePlotRecord | SchematicGraphicRectanglePlotRecord, path: str) -> None:",
    "    expected = PlotPolyOperation if isinstance(record, SchematicGraphicPolylinePlotRecord) else ArcThreePointOperation if isinstance(record, SchematicGraphicArcPlotRecord) else CircleOperation if isinstance(record, SchematicGraphicCirclePlotRecord) else RectOperation",
    "    _validate_schematic_graphic_operations(record.operations, expected, path)",
    "",
    "",
    "def _validate_schematic_bezier_operation(operation: BezierCurveOperation, path: str) -> None:",
    "    layer = None if operation.layer is UNSET else operation.layer",
    "    if layer is not None or operation.width_nm < 0 or operation.tolerance_nm != 0 or operation.stroke_color is UNSET or not _valid_schematic_color(operation.stroke_color) or operation.line_style is UNSET:",
    '        raise msgspec.ValidationError(f"invalid_graphic_bezier at {path}")',
    "",
    "",
    "def _validate_schematic_bezier_record(record: SchematicGraphicBezierPlotRecord, path: str) -> None:",
    "    if len(record.operations) != 1 or not isinstance(record.operations[0], BezierCurveOperation):",
    '        raise msgspec.ValidationError(f"invalid_graphic_bezier at {path}.operations")',
    "    _validate_schematic_bezier_operation(record.operations[0], f'{path}.operations[0]')",
    "",
    "",
    "def _validate_schematic_rule_area_record(record: SchematicRuleAreaPlotRecord, path: str) -> None:",
    "    expected = {'polyline': PlotPolyOperation, 'rectangle': RectOperation, 'arc': ArcThreePointOperation, 'circle': CircleOperation, 'bezier': BezierCurveOperation}[record.shape]",
    "    if expected is BezierCurveOperation:",
    "        if len(record.operations) != 1 or not isinstance(record.operations[0], BezierCurveOperation):",
    '            raise msgspec.ValidationError(f"invalid_rule_area at {path}.operations")',
    "        _validate_schematic_bezier_operation(record.operations[0], f'{path}.operations[0]')",
    "    else:",
    "        _validate_schematic_graphic_operations(record.operations, expected, path, closed=record.shape == 'polyline')",
    "",
    "",
    "def _schematic_image_metadata(value: str) -> tuple[str, int, int, int | None, int | None] | None:",
    "    if any(character in ' \\t\\r\\n\\v\\f' for character in value):",
    "        return None",
    "    try:",
    "        data = base64.b64decode(value, validate=True)",
    "    except (binascii.Error, ValueError):",
    "        return None",
    "    if base64.b64encode(data).decode('ascii') != value:",
    "        return None",
    "    if len(data) >= 33 and data[:8] == b'\\x89PNG\\r\\n\\x1a\\n' and data[8:16] == b'\\x00\\x00\\x00\\rIHDR':",
    "        return _schematic_png_metadata(data)",
    "    if len(data) >= 4 and data[:2] == b'\\xff\\xd8':",
    "        return _schematic_jpeg_metadata(data)",
    "    if len(data) >= 26 and data[:2] == b'BM':",
    "        return _schematic_bmp_metadata(data)",
    "    return None",
    "",
    "",
    "def _schematic_png_metadata(data: bytes) -> tuple[str, int, int, int | None, int | None] | None:",
    "    width, height = int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')",
    "    ppm_x = ppm_y = None",
    "    position = 8",
    "    while position + 12 <= len(data):",
    "        length = int.from_bytes(data[position:position + 4], 'big')",
    "        end = position + 12 + length",
    "        if end > len(data):",
    "            return None",
    "        kind = data[position + 4:position + 8]",
    "        payload = data[position + 8:position + 8 + length]",
    "        if kind == b'pHYs' and length >= 9 and payload[8] == 1:",
    "            ppm_x = int.from_bytes(payload[:4], 'big') or None",
    "            ppm_y = int.from_bytes(payload[4:8], 'big') or None",
    "        position = end",
    "        if kind == b'IEND':",
    "            break",
    "    return ('png', width, height, _schematic_ppi_from_ppm(ppm_x), _schematic_ppi_from_ppm(ppm_y)) if width > 0 and height > 0 else None",
    "",
    "",
    "def _schematic_jpeg_metadata(data: bytes) -> tuple[str, int, int, int | None, int | None] | None:",
    "    position, ppi_x, ppi_y = 2, None, None",
    "    while position + 9 <= len(data):",
    "        if data[position] != 0xFF:",
    "            position += 1",
    "            continue",
    "        marker = data[position + 1]",
    "        position += 2",
    "        if marker in (0xD8, 0xD9):",
    "            continue",
    "        if position + 2 > len(data):",
    "            return None",
    "        length = int.from_bytes(data[position:position + 2], 'big')",
    "        if length < 2 or position + length > len(data):",
    "            return None",
    "        payload = data[position + 2:position + length]",
    "        density = _schematic_jpeg_density(marker, payload)",
    "        if density is not None:",
    "            ppi_x, ppi_y = density",
    "        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):",
    "            if length < 7:",
    "                return None",
    "            height, width = int.from_bytes(data[position + 3:position + 5], 'big'), int.from_bytes(data[position + 5:position + 7], 'big')",
    "            return ('jpeg', width, height, ppi_x, ppi_y) if width > 0 and height > 0 else None",
    "        position += length",
    "    return None",
    "",
    "",
    "def _schematic_jpeg_density(marker: int, payload: bytes) -> tuple[int, int] | None:",
    "    if marker != 0xE0 or not payload.startswith(b'JFIF\\x00') or len(payload) < 12:",
    "        return None",
    "    units = payload[7]",
    "    density_x, density_y = int.from_bytes(payload[8:10], 'big'), int.from_bytes(payload[10:12], 'big')",
    "    if density_x <= 0 or density_y <= 0:",
    "        return None",
    "    if units == 1:",
    "        return density_x, density_y",
    "    if units == 2:",
    "        return round(density_x * 2.54), round(density_y * 2.54)",
    "    return None",
    "",
    "",
    "def _schematic_bmp_metadata(data: bytes) -> tuple[str, int, int, int | None, int | None] | None:",
    "    dib = int.from_bytes(data[14:18], 'little')",
    "    if dib == 12:",
    "        width, height, ppi_x, ppi_y = int.from_bytes(data[18:20], 'little'), int.from_bytes(data[20:22], 'little'), None, None",
    "    elif dib >= 40 and len(data) >= 54:",
    "        width = abs(int.from_bytes(data[18:22], 'little', signed=True))",
    "        height = abs(int.from_bytes(data[22:26], 'little', signed=True))",
    "        ppi_x = _schematic_bmp_ppi(int.from_bytes(data[38:42], 'little', signed=True))",
    "        ppi_y = _schematic_bmp_ppi(int.from_bytes(data[42:46], 'little', signed=True))",
    "    else:",
    "        return None",
    "    return ('bmp', width, height, ppi_x, ppi_y) if width > 0 and height > 0 else None",
    "",
    "",
    "def _schematic_ppi_from_ppm(value: int | None) -> int | None:",
    "    if value is None or value <= 0:",
    "        return None",
    "    return round(value * 0.0254) or None",
    "",
    "",
    "def _schematic_bmp_ppi(value: int) -> int | None:",
    "    if value <= 0:",
    "        return None",
    "    return round((value // 100) * 2.54) or None",
    "",
    "",
    "def _schematic_image_extent(size_px: int, scale: float, ppi: int | None) -> int:",
    "    return round(size_px * scale * 25.4 / (ppi if ppi and ppi > 0 else 300.0) * 1_000_000.0)",
    "",
    "",
    "def _validate_schematic_image_record(record: SchematicImagePlotRecord, path: str) -> None:",
    "    if len(record.operations) != 1 or not isinstance(record.operations[0], PlotImageOperation):",
    '        raise msgspec.ValidationError(f"invalid_schematic_image at {path}.operations")',
    "    operation = record.operations[0]",
    "    metadata = _schematic_image_metadata(operation.image_data_b64)",
    "    if metadata is None or not math.isfinite(operation.scale) or operation.scale <= 0 or operation.stroke_color != '#0000C2FF':",
    '        raise msgspec.ValidationError(f"invalid_schematic_image at {path}.operations[0]")',
    "    image_format, width_px, height_px, ppi_x, ppi_y = metadata",
    "    try:",
    "        width_nm, height_nm = _schematic_image_extent(width_px, operation.scale, ppi_x), _schematic_image_extent(height_px, operation.scale, ppi_y)",
    "    except (OverflowError, ValueError):",
    '        raise msgspec.ValidationError(f"invalid_schematic_image_extent at {path}.operations[0]") from None',
    "    if image_format != operation.image_format or (record.scale, record.image_format, record.width_nm, record.height_nm) != (operation.scale, operation.image_format, operation.width_nm, operation.height_nm) or (operation.width_nm, operation.height_nm) != (width_nm, height_nm) or width_nm <= 0 or height_nm <= 0:",
    '        raise msgspec.ValidationError(f"invalid_schematic_image_metadata at {path}")',
    "",
    "",
    "def _validate_schematic_table_record(record: SchematicTablePlotRecord, path: str) -> None:",
    "    operation_index = 0",
    "    cells = 0",
    "    while operation_index < len(record.operations):",
    "        cell_path = f'{path}.operations[{operation_index}]'",
    "        prefix = _validate_schematic_text_box_prefix(record.operations[operation_index:], cell_path)",
    "        operation_index += prefix",
    "        while operation_index < len(record.operations) and isinstance(record.operations[operation_index], TextOperation):",
    "            operation = cast(TextOperation, record.operations[operation_index])",
    "            if not operation.text or operation.multiline:",
    '                raise msgspec.ValidationError(f"invalid_table_cell_line at {path}.operations[{operation_index}]")',
    "            _validate_schematic_annotation_text(operation, f'{path}.operations[{operation_index}]')",
    "            operation_index += 1",
    "        cells += 1",
    "    if cells != record.cell_count:",
    '        raise msgspec.ValidationError(f"table_cell_count_mismatch at {path}.cell_count")',
    "",
    "",
    "def _validate_schematic_symbol_text(operation: TextOperation, path: str, in_pin: bool) -> None:",
    "    _validate_schematic_annotation_text(operation, path)",
    "    if in_pin and operation.context is not UNSET:",
    '        raise msgspec.ValidationError(f"invalid_symbol_pin_text at {path}")',
    "",
    "",
    "def _validate_schematic_symbol_record(record: SchematicSymbolInstancePlotRecord | SchematicSymbolOverplotPlotRecord, path: str) -> None:",
    "    if isinstance(record, SchematicSymbolInstancePlotRecord):",
    "        if record.object_id != (record.lib_id or record.uuid) or not math.isfinite(record.at_angle_deg) or record.mirror not in (None, 'x', 'y'):",
    '            raise msgspec.ValidationError(f"invalid_symbol_instance at {path}")',
    "        parent_uuid = record.uuid",
    "    else:",
    "        if record.uuid != f'{record.source_symbol_uuid}:overplot' or record.object_id != (record.lib_id or record.source_symbol_uuid):",
    '            raise msgspec.ValidationError(f"invalid_symbol_overplot at {path}")',
    "        parent_uuid = record.source_symbol_uuid",
    "    block_start = None",
    "    allowed_attrs = {'primitive', 'object-type', 'pin', 'symbol-uuid', 'designator', 'lib-pin-uuid'}",
    "    for operation_index, operation in enumerate(record.operations):",
    "        operation_path = f'{path}.operations[{operation_index}]'",
    "        block_start = _validate_schematic_symbol_operation(operation, operation_index, block_start, parent_uuid, allowed_attrs, operation_path)",
    "    if block_start is not None:",
    '        raise msgspec.ValidationError(f"invalid_symbol_pin_block at {path}.operations")',
    "",
    "",
    "def _validate_schematic_symbol_operation(operation: SchematicSymbolOperation, operation_index: int, block_start: int | None, parent_uuid: str, allowed_attrs: set[str], path: str) -> int | None:",
    "    if isinstance(operation, SchematicSymbolStartBlockOperation):",
    "        if block_start is not None or operation.label != operation.data_uuid or not operation.label or operation.data_ref != 'symbol_pin' or not operation.object_id:",
    '            raise msgspec.ValidationError(f"invalid_symbol_pin_block at {path}")',
    "        attrs = operation.extra_attrs",
    "        if set(attrs) - allowed_attrs or attrs.get('primitive') != 'pin' or attrs.get('object-type') != 'pin' or attrs.get('symbol-uuid') != parent_uuid or any(not isinstance(value, str) or not value for value in attrs.values()):",
    '            raise msgspec.ValidationError(f"invalid_symbol_pin_attrs at {path}.extra_attrs")',
    "        return operation_index",
    "    if isinstance(operation, SchematicSymbolEndBlockOperation):",
    "        if block_start is None or operation_index == block_start + 1:",
    '            raise msgspec.ValidationError(f"invalid_symbol_pin_block at {path}")',
    "        return None",
    "    if isinstance(operation, (PlotImageOperation, FlashPadCircleOperation, FlashPadOvalOperation, FlashPadRectOperation, FlashPadRoundRectOperation, FlashPadCustomOperation, FlashPadTrapezOperation)):",
    '        raise msgspec.ValidationError(f"invalid_symbol_operation at {path}")',
    "    if isinstance(operation, TextOperation):",
    "        _validate_schematic_symbol_text(operation, path, block_start is not None)",
    "    elif _optional_operation_layer(operation) is not None:",
    '        raise msgspec.ValidationError(f"invalid_symbol_operation at {path}")',
    "    return block_start",
    "",
    "",
    "def _schematic_sheet_rect_state(operation: RectOperation) -> tuple:",
    "    return (operation.x1, operation.y1, operation.x2, operation.y2, operation.fill, operation.width_nm, operation.corner_radius_nm, operation.layer, operation.stroke_color, operation.fill_color, operation.line_style)",
    "",
    "",
    "def _validate_schematic_sheet_outline(operation: RectOperation, record: SchematicSheetPlotRecord, path: str) -> None:",
    "    expected = (record.at_x_nm, record.at_y_nm, record.at_x_nm + record.size_x_nm, record.at_y_nm + record.size_y_nm)",
    "    layer = None if operation.layer is UNSET else operation.layer",
    "    if (operation.x1, operation.y1, operation.x2, operation.y2) != expected or operation.fill != 'NO_FILL' or operation.width_nm < 0 or operation.corner_radius_nm != 0 or layer is not None or not _valid_schematic_color(operation.stroke_color) or operation.fill_color is not UNSET or operation.line_style is UNSET:",
    '        raise msgspec.ValidationError(f"invalid_sheet_outline at {path}")',
    "",
    "",
    "def _validate_schematic_sheet_pin(text: TextOperation, decoration: PlotPolyOperation | None, record: SchematicSheetPlotRecord, path: str, attrs: dict[str, str] | None = None) -> None:",
    "    _validate_schematic_annotation_text(text, f'{path}.text')",
    "    if text.multiline:",
    '        raise msgspec.ValidationError(f"invalid_sheet_pin_text at {path}.text")',
    "    shape = None",
    "    if attrs is not None:",
    "        required = {'primitive', 'object-type', 'sheet-uuid', 'sheet-name', 'sheet-file', 'pin', 'pin-name', 'shape'}",
    "        if set(attrs) != required or attrs.get('primitive') != 'sheet-entry' or attrs.get('object-type') != 'sheet-pin' or attrs.get('sheet-uuid') != record.uuid or attrs.get('sheet-name') != record.sheet_name or attrs.get('sheet-file') != record.sheet_file or attrs.get('pin') != attrs.get('pin-name'):",
    '            raise msgspec.ValidationError(f"invalid_sheet_pin_attrs at {path}.extra_attrs")',
    "        shape = attrs.get('shape')",
    "        if shape not in ('input', 'output', 'bidirectional', 'tri_state', 'passive', 'dot', 'round', 'diamond', 'rectangle') or text.text != attrs['pin-name'].replace('{slash}', '/'):",
    '            raise msgspec.ValidationError(f"invalid_sheet_pin_attrs at {path}.extra_attrs")',
    "    decoration_required = shape is None or shape in ('input', 'output', 'bidirectional', 'tri_state', 'passive')",
    "    if decoration_required != (decoration is not None):",
    '        raise msgspec.ValidationError(f"invalid_sheet_pin_decoration at {path}.decoration")',
    "    if decoration is None:",
    "        return",
    "    expected_points = (6,) if shape in ('input', 'output') else (5,) if shape is not None else (5, 6)",
    "    layer = None if decoration.layer is UNSET else decoration.layer",
    "    expected_color = '#949391FF' if record.dnp else '#006464FF'",
    "    if layer is not None or decoration.fill != 'NO_FILL' or decoration.width_nm != text.pen_width_nm or decoration.stroke_color != expected_color or decoration.fill_color is not UNSET or decoration.line_style is not UNSET or len(decoration.points) not in expected_points or decoration.points[0] != decoration.points[-1]:",
    '        raise msgspec.ValidationError(f"invalid_sheet_pin_decoration at {path}.decoration")',
    "",
    "",
    "def _validate_schematic_sheet_marker(operation: ThickSegmentOperation, path: str) -> None:",
    "    forbidden = (operation.layer is not UNSET, operation.role is not UNSET, operation.layers is not UNSET, operation.mask_margin_nm is not UNSET, operation.pad_size_x_nm is not UNSET, operation.pad_size_y_nm is not UNSET)",
    "    if any(forbidden) or operation.width_nm != 457_200 or operation.stroke_color != '#DC090DD9':",
    '        raise msgspec.ValidationError(f"invalid_sheet_dnp_marker at {path}")',
    "",
    "",
    "def _validate_schematic_sheet_record(record: SchematicSheetPlotRecord, path: str) -> None:",
    "    if record.object_id != record.sheet_name or record.size_x_nm <= 0 or record.size_y_nm <= 0 or len(record.operations) < 2 or not isinstance(record.operations[0], RectOperation) or not isinstance(record.operations[1], RectOperation):",
    '        raise msgspec.ValidationError(f"invalid_sheet_record at {path}")',
    "    first = cast(RectOperation, record.operations[0])",
    "    outline = cast(RectOperation, record.operations[1])",
    "    _validate_schematic_sheet_frames(first, outline, record, path)",
    "    content_end = len(record.operations) - (2 if record.dnp else 0)",
    "    _validate_schematic_sheet_dnp(record, content_end, path)",
    "    _validate_schematic_sheet_contents(record, content_end, path)",
    "",
    "",
    "def _validate_schematic_sheet_frames(first: RectOperation, outline: RectOperation, record: SchematicSheetPlotRecord, path: str) -> None:",
    "    _validate_schematic_sheet_outline(outline, record, f'{path}.operations[1]')",
    "    if first.fill == 'FILLED_SHAPE':",
    "        expected = (record.at_x_nm, record.at_y_nm, record.at_x_nm + record.size_x_nm, record.at_y_nm + record.size_y_nm)",
    "        layer = None if first.layer is UNSET else first.layer",
    "        if (first.x1, first.y1, first.x2, first.y2) != expected or first.width_nm != 0 or first.corner_radius_nm != 0 or layer is not None or not _valid_schematic_color(first.stroke_color) or first.fill_color != first.stroke_color or first.line_style is not UNSET:",
    '            raise msgspec.ValidationError(f"invalid_sheet_background at {path}.operations[0]")',
    "    else:",
    "        _validate_schematic_sheet_outline(first, record, f'{path}.operations[0]')",
    "        if _schematic_sheet_rect_state(first) != _schematic_sheet_rect_state(outline):",
    '            raise msgspec.ValidationError(f"invalid_sheet_outline_pair at {path}.operations[:2]")',
    "",
    "",
    "def _validate_schematic_sheet_dnp(record: SchematicSheetPlotRecord, content_end: int, path: str) -> None:",
    "    if content_end < 2:",
    '        raise msgspec.ValidationError(f"invalid_sheet_dnp_marker at {path}.operations")',
    "    if record.dnp:",
    "        first_marker, second_marker = record.operations[-2:]",
    "        if not isinstance(first_marker, ThickSegmentOperation) or not isinstance(second_marker, ThickSegmentOperation):",
    '            raise msgspec.ValidationError(f"invalid_sheet_dnp_marker at {path}.operations")',
    "        _validate_schematic_sheet_marker(first_marker, f'{path}.operations[{content_end}]')",
    "        _validate_schematic_sheet_marker(second_marker, f'{path}.operations[{content_end + 1}]')",
    "        if first_marker.start_x != second_marker.end_x or first_marker.end_x != second_marker.start_x or first_marker.start_y != second_marker.start_y or first_marker.end_y != second_marker.end_y:",
    '            raise msgspec.ValidationError(f"invalid_sheet_dnp_geometry at {path}.operations[-2:]")',
    "",
    "",
    "def _validate_schematic_sheet_contents(record: SchematicSheetPlotRecord, content_end: int, path: str) -> None:",
    "    operation_index = 2",
    "    saw_property = False",
    "    while operation_index < content_end:",
    "        operation = record.operations[operation_index]",
    "        operation_path = f'{path}.operations[{operation_index}]'",
    "        if isinstance(operation, SchematicSheetStartBlockOperation):",
    "            has_decoration = operation_index + 3 < content_end and isinstance(record.operations[operation_index + 2], PlotPolyOperation) and isinstance(record.operations[operation_index + 3], SchematicSheetEndBlockOperation)",
    "            no_decoration = operation_index + 2 < content_end and isinstance(record.operations[operation_index + 2], SchematicSheetEndBlockOperation)",
    "            if saw_property or operation.label != operation.data_uuid or operation.label != operation.object_id or not operation.label or operation.data_ref != 'sheet_pin' or operation_index + 1 >= content_end or not isinstance(record.operations[operation_index + 1], TextOperation) or not (has_decoration or no_decoration):",
    '                raise msgspec.ValidationError(f"invalid_sheet_pin_block at {operation_path}")',
    "            decoration = cast(PlotPolyOperation, record.operations[operation_index + 2]) if has_decoration else None",
    "            pin_text = cast(TextOperation, record.operations[operation_index + 1])",
    "            _validate_schematic_sheet_pin(pin_text, decoration, record, operation_path, operation.extra_attrs)",
    "            operation_index += 4 if has_decoration else 3",
    "            continue",
    "        if isinstance(operation, TextOperation):",
    "            if operation_index + 1 < content_end and isinstance(record.operations[operation_index + 1], PlotPolyOperation):",
    "                if saw_property:",
    '                    raise msgspec.ValidationError(f"invalid_sheet_pin_order at {operation_path}")',
    "                decoration = cast(PlotPolyOperation, record.operations[operation_index + 1])",
    "                _validate_schematic_sheet_pin(operation, decoration, record, operation_path)",
    "                operation_index += 2",
    "                continue",
    "            saw_property = True",
    "            _validate_schematic_annotation_text(operation, operation_path)",
    "            if operation.multiline:",
    '                raise msgspec.ValidationError(f"invalid_sheet_property_text at {operation_path}")',
    "            operation_index += 1",
    "            continue",
    '        raise msgspec.ValidationError(f"invalid_sheet_operation at {operation_path}")',
  ];
}

function renderPythonSchematicPlotRequestValidation(functionName, typeName) {
  return [
    `_schematic_plot_request_a0_decoder = msgspec.json.Decoder(${typeName})`,
    "",
    "",
    `def ${functionName}(data: bytes) -> ${typeName}:`,
    "    value = _schematic_plot_request_a0_decoder.decode(data)",
    "    validate_schematic_plot_request_a0(value)",
    "    return value",
    "",
    "",
    `def validate_schematic_plot_request_a0(value: ${typeName}) -> None:`,
    "    fields = ('max_source_bytes', 'max_worksheet_bytes', 'max_output_bytes', 'max_text_bytes', 'max_metadata_bytes', 'max_image_encoded_bytes', 'max_image_decoded_bytes', 'max_image_pixels', 'max_image_decode_work', 'max_symbol_overlap_checks', 'max_text_variable_bytes', 'max_worksheet_bitmap_encoded_bytes', 'max_worksheet_bitmap_decoded_bytes', 'max_worksheet_bitmap_pixels', 'max_worksheet_bitmap_decode_work')",
    "    for field_name in fields:",
    "        encoded = getattr(value, field_name)",
    "        if not encoded or not encoded.isascii() or not encoded.isdigit() or int(encoded) > 18_446_744_073_709_551_615:",
    '            raise msgspec.ValidationError(f"invalid_uint64 at $.{field_name}")',
  ];
}

function renderPythonDeclaration(name, schema, tag = undefined) {
  if (Array.isArray(schema.enum)) {
    return [`${name} = Literal[${schema.enum.map(pythonLiteral).join(", ")}]`];
  }
  if (Array.isArray(schema.anyOf)) {
    return [`${name} = Union[${schema.anyOf.map(pythonForwardType).join(", ")}]`];
  }
  if (schema.type === "integer") {
    const constraints = [];
    if (Number.isSafeInteger(schema.minimum)) constraints.push(`ge=${schema.minimum}`);
    if (Number.isSafeInteger(schema.maximum)) constraints.push(`le=${schema.maximum}`);
    assert(constraints.length > 0, `${name}: unconstrained integer alias`);
    return [`${name} = Annotated[int, Meta(${constraints.join(", ")})]`];
  }
  if (schema.type === "number") {
    const constraints = [];
    if (Number.isFinite(schema.minimum)) constraints.push(`ge=${schema.minimum}`);
    if (Number.isFinite(schema.maximum)) constraints.push(`le=${schema.maximum}`);
    assert(constraints.length > 0, `${name}: unconstrained number alias`);
    return [`${name} = Annotated[float, Meta(${constraints.join(", ")})]`];
  }
  if (schema.type === "string") {
    const constraints = [];
    if (typeof schema.pattern === "string") {
      constraints.push(`pattern=${pythonLiteral(schema.pattern)}`);
    }
    if (Number.isSafeInteger(schema.minLength)) constraints.push(`min_length=${schema.minLength}`);
    if (Number.isSafeInteger(schema.maxLength)) constraints.push(`max_length=${schema.maxLength}`);
    assert(constraints.length > 0, `${name}: unconstrained string alias`);
    return [`${name} = Annotated[str, Meta(${constraints.join(", ")})]`];
  }
  if (schema.type === "array") {
    const itemType = pythonType(schema.items);
    const constraints = [];
    if (Number.isSafeInteger(schema.minItems)) constraints.push(`min_length=${schema.minItems}`);
    if (Number.isSafeInteger(schema.maxItems)) constraints.push(`max_length=${schema.maxItems}`);
    const listType = `list[${itemType}]`;
    return [
      constraints.length > 0
        ? `${name} = Annotated[${listType}, Meta(${constraints.join(", ")})]`
        : `${name} = ${listType}`,
    ];
  }
  const mapValues = schema.additionalProperties ?? schema.unevaluatedProperties;
  if (
    schema.type === "object"
    && mapValues !== undefined
    && mapValues !== false
    && !isFalseSchema(mapValues)
    && Object.keys(schema.properties ?? {}).length === 0
  ) {
    return [`${name} = dict[str, ${pythonType(mapValues)}]`];
  }
  assert(schema.type === "object", `${name}: expected object or enum`);
  if (Array.isArray(tag?.values)) {
    const lines = [];
    const members = [];
    for (const value of tag.values) {
      const member = `${name}${pascalCase(value)}`;
      members.push(member);
      if (lines.length > 0) lines.push("", "");
      lines.push(...renderPythonDeclaration(member, schema, { field: tag.field, value }));
    }
    return [...lines, "", "", `${name} = Union[${members.join(", ")}]`];
  }
  const required = new Set(schema.required ?? []);
  const properties = Object.entries(schema.properties ?? {}).filter(
    ([property]) => property !== tag?.field,
  );
  const ordered = [
    ...properties.filter(([property]) => required.has(property)),
    ...properties.filter(([property]) => !required.has(property)),
  ];
  const tagOptions = tag
    ? `, tag=${pythonLiteral(tag.value)}, tag_field=${pythonLiteral(tag.field)}`
    : "";
  const lines = [`class ${name}(Struct, forbid_unknown_fields=True, frozen=True${tagOptions}):`];
  if (ordered.length === 0) return [...lines, "    pass"];
  for (const [property, propertySchema] of ordered) {
    const sanitized = property.replace(/[^A-Za-z0-9_]/gu, "_");
    const identifier = /^[A-Za-z_]/u.test(sanitized) ? sanitized : `_${sanitized}`;
    const pythonName = ["type", "float", "extends"].includes(identifier)
      ? `${identifier}_`
      : identifier;
    const annotation = pythonType(propertySchema);
    const rename = pythonName === property ? "" : `, name=${pythonLiteral(property)}`;
    if (required.has(property)) {
      lines.push(
        rename
          ? `    ${pythonName}: ${annotation} = field(${rename.slice(2)})`
          : `    ${pythonName}: ${annotation}`,
      );
    } else {
      lines.push(`    ${pythonName}: ${annotation} | UnsetType = field(default=UNSET${rename})`);
    }
  }
  return lines;
}

function pythonType(schema) {
  if (typeof schema.$ref === "string") return pythonReferenceType(schema.$ref);
  if ("const" in schema) return `Literal[${pythonLiteral(schema.const)}]`;
  if (
    Array.isArray(schema.anyOf)
    && Object.keys(schema).every((key) => key === "anyOf" || key === "description")
  ) {
    const nullArm = schema.anyOf.findIndex((arm) => arm?.type === "null");
    if (nullArm !== -1 && schema.anyOf.length === 2) {
      return `${pythonType(schema.anyOf[1 - nullArm])} | None`;
    }
    return `Union[${schema.anyOf.map(pythonType).join(", ")}]`;
  }
  if (schema.type === "string") {
    const constraints = [];
    if (typeof schema.pattern === "string") {
      constraints.push(`pattern=${pythonLiteral(schema.pattern)}`);
    }
    if (Number.isSafeInteger(schema.minLength)) constraints.push(`min_length=${schema.minLength}`);
    if (Number.isSafeInteger(schema.maxLength)) constraints.push(`max_length=${schema.maxLength}`);
    return constraints.length > 0
      ? `Annotated[str, Meta(${constraints.join(", ")})]`
      : "str";
  }
  if (schema.type === "number") {
    const constraints = [];
    if (Number.isFinite(schema.minimum)) constraints.push(`ge=${schema.minimum}`);
    if (Number.isFinite(schema.maximum)) constraints.push(`le=${schema.maximum}`);
    return constraints.length > 0
      ? `Annotated[float, Meta(${constraints.join(", ")})]`
      : "float";
  }
  if (schema.type === "integer") {
    const constraints = [];
    if (Number.isSafeInteger(schema.minimum)) constraints.push(`ge=${schema.minimum}`);
    if (Number.isSafeInteger(schema.maximum)) constraints.push(`le=${schema.maximum}`);
    return constraints.length > 0
      ? `Annotated[int, Meta(${constraints.join(", ")})]`
      : "int";
  }
  if (schema.type === "boolean") return "bool";
  if (schema.type === "array" && Array.isArray(schema.prefixItems)) {
    return `tuple[${schema.prefixItems.map(pythonType).join(", ")}]`;
  }
  if (schema.type === "array") {
    const constraints = [];
    if (Number.isSafeInteger(schema.minItems)) constraints.push(`min_length=${schema.minItems}`);
    if (Number.isSafeInteger(schema.maxItems)) constraints.push(`max_length=${schema.maxItems}`);
    const listType = `list[${pythonType(schema.items)}]`;
    return constraints.length > 0
      ? `Annotated[${listType}, Meta(${constraints.join(", ")})]`
      : listType;
  }
  const mapValues = schema.additionalProperties ?? schema.unevaluatedProperties;
  if (schema.type === "object" && mapValues && !isFalseSchema(mapValues)) {
    return `dict[str, ${pythonType(mapValues)}]`;
  }
  fail(`unsupported Python schema: ${JSON.stringify(schema)}`);
}

function pythonForwardType(schema) {
  if (typeof schema.$ref === "string") return pythonLiteral(pythonReferenceType(schema.$ref));
  return pythonType(schema);
}

function pythonReferenceType(reference) {
  const external = externalSchemaTypes.get(reference);
  return external === undefined ? reference.split("/").at(-1) : external[1];
}

function bundleExternalReferences(schema) {
  const bundled = new Map();
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (value === null || typeof value !== "object") return;
    const external = externalSchemaTypes.get(value.$ref);
    if (external !== undefined) {
      const [file, typeName] = external;
      value.$ref = `#/$defs/${typeName}`;
      bundled.set(typeName, file);
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(schema);
  schema.$defs ??= {};
  for (const [typeName, file] of bundled) {
    const external = structuredClone(schemas.get(file));
    const definitions = external.$defs ?? {};
    delete external.$schema;
    delete external.$id;
    delete external.$defs;
    delete external.title;
    for (const [name, definition] of Object.entries(definitions)) {
      if (schema.$defs[name] !== undefined) {
        assert(
          JSON.stringify(schema.$defs[name]) === JSON.stringify(definition),
          `${typeName}: conflicting bundled definition ${name}`,
        );
      } else {
        schema.$defs[name] = definition;
      }
    }
    schema.$defs[typeName] = external;
  }
  return schema;
}

function projectSchema(value) {
  if (Array.isArray(value)) return value.map(projectSchema);
  if (value === null || typeof value !== "object") return value;
  for (const [key, child] of Object.entries(value)) value[key] = projectSchema(child);
  if (Array.isArray(value.prefixItems)) {
    assert(value.type === "array", "prefixItems requires an array schema");
    value.items = value.prefixItems;
    value.additionalItems = false;
    delete value.prefixItems;
  }
  if (value.unevaluatedProperties !== undefined) {
    value.additionalProperties = isFalseSchema(value.unevaluatedProperties)
      ? false
      : value.unevaluatedProperties;
    delete value.unevaluatedProperties;
  }
  return value;
}

function isFalseSchema(value) {
  return value === false || (value?.not && Object.keys(value).length === 1 && Object.keys(value.not).length === 0);
}

async function emit(outputPath, content) {
  if (check) {
    const current = await readFile(outputPath, "utf8").catch(() => undefined);
    assert(current === content, `stale generated binding: ${path.relative(root, outputPath)}`);
  } else {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, "utf8");
  }
}

function pythonLiteral(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "None";
  return String(value);
}

function pascalCase(value) {
  return value
    .split(/[^a-zA-Z0-9]+/u)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

function snakeCase(value) {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/gu, "_")
    .toLowerCase();
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(message);
}
