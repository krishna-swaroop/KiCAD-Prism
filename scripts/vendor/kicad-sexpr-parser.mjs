var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/proto/board.ts
var board_exports = {};
__export(board_exports, {
  DimensionFormatUnits: () => DimensionFormatUnits,
  DimensionFormatUnitsFormat: () => DimensionFormatUnitsFormat,
  DimensionStyleTextFrame: () => DimensionStyleTextFrame,
  DimensionStyleTextPositionMode: () => DimensionStyleTextPositionMode
});
var DimensionFormatUnits = /* @__PURE__ */ ((DimensionFormatUnits2) => {
  DimensionFormatUnits2[DimensionFormatUnits2["inches"] = 0] = "inches";
  DimensionFormatUnits2[DimensionFormatUnits2["mils"] = 1] = "mils";
  DimensionFormatUnits2[DimensionFormatUnits2["millimeters"] = 2] = "millimeters";
  DimensionFormatUnits2[DimensionFormatUnits2["automatic"] = 3] = "automatic";
  return DimensionFormatUnits2;
})(DimensionFormatUnits || {});
var DimensionFormatUnitsFormat = /* @__PURE__ */ ((DimensionFormatUnitsFormat2) => {
  DimensionFormatUnitsFormat2[DimensionFormatUnitsFormat2["none"] = 0] = "none";
  DimensionFormatUnitsFormat2[DimensionFormatUnitsFormat2["bare"] = 1] = "bare";
  DimensionFormatUnitsFormat2[DimensionFormatUnitsFormat2["parenthesis"] = 2] = "parenthesis";
  return DimensionFormatUnitsFormat2;
})(DimensionFormatUnitsFormat || {});
var DimensionStyleTextPositionMode = /* @__PURE__ */ ((DimensionStyleTextPositionMode2) => {
  DimensionStyleTextPositionMode2[DimensionStyleTextPositionMode2["outside"] = 0] = "outside";
  DimensionStyleTextPositionMode2[DimensionStyleTextPositionMode2["inline"] = 1] = "inline";
  DimensionStyleTextPositionMode2[DimensionStyleTextPositionMode2["manual"] = 2] = "manual";
  return DimensionStyleTextPositionMode2;
})(DimensionStyleTextPositionMode || {});
var DimensionStyleTextFrame = /* @__PURE__ */ ((DimensionStyleTextFrame2) => {
  DimensionStyleTextFrame2[DimensionStyleTextFrame2["none"] = 0] = "none";
  DimensionStyleTextFrame2[DimensionStyleTextFrame2["rect"] = 1] = "rect";
  DimensionStyleTextFrame2[DimensionStyleTextFrame2["circle"] = 2] = "circle";
  DimensionStyleTextFrame2[DimensionStyleTextFrame2["roundrect"] = 3] = "roundrect";
  return DimensionStyleTextFrame2;
})(DimensionStyleTextFrame || {});

// src/tokenizer.ts
var Token = class {
  constructor(type, value = null) {
    this.type = type;
    this.value = value;
  }
  static {
    this.OPEN = Symbol("opn");
  }
  static {
    this.CLOSE = Symbol("clo");
  }
  static {
    this.ATOM = Symbol("atm");
  }
  static {
    this.NUMBER = Symbol("num");
  }
  static {
    this.STRING = Symbol("str");
  }
};
var IS_ATOM = new Uint8Array(128);
{
  const mark = (s) => {
    for (let i = 0; i < s.length; i++) IS_ATOM[s.charCodeAt(i)] = 1;
  };
  for (let c = 48; c <= 57; c++) IS_ATOM[c] = 1;
  for (let c = 65; c <= 90; c++) IS_ATOM[c] = 1;
  for (let c = 97; c <= 122; c++) IS_ATOM[c] = 1;
  mark("_-:!.[]{}@*/&#%+=~$");
}
var CC_OPEN = 40;
var CC_CLOSE = 41;
var CC_QUOTE = 34;
var CC_BACKSLASH = 92;
var CC_MINUS = 45;
var CC_PLUS = 43;
var CC_DOT = 46;
var CC_PIPE = 124;
var CC_SPACE = 32;
var CC_TAB = 9;
var CC_LF = 10;
var CC_CR = 13;
var CC_0 = 48;
var CC_9 = 57;
function is_ws_code(c) {
  return c === CC_SPACE || c === CC_LF || c === CC_CR || c === CC_TAB || c === CC_PIPE;
}
function is_digit_code(c) {
  return c >= CC_0 && c <= CC_9;
}
function is_hex_code(c) {
  return c >= CC_0 && c <= CC_9 || c >= 97 && c <= 102 || c >= 65 && c <= 70 || c === 95;
}
function decode_string(input, start, end, firstBs) {
  if (firstBs < 0) return input.substring(start, end);
  let out = input.substring(start, firstBs);
  let i = firstBs;
  while (i < end) {
    const c = input.charCodeAt(i);
    if (c === CC_BACKSLASH && i + 1 < end) {
      const nc = input.charCodeAt(i + 1);
      if (nc === 110) out += "\n";
      else if (nc === CC_BACKSLASH) out += "\\";
      else if (nc === CC_QUOTE) out += '"';
      else out += input[i + 1];
      i += 2;
    } else {
      let r = i;
      while (r < end && input.charCodeAt(r) !== CC_BACKSLASH) r++;
      out += input.substring(i, r);
      i = r;
    }
  }
  return out;
}
function listify(src) {
  const root = [];
  const stack = [root];
  let top = root;
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c === CC_OPEN) {
      const lst = [];
      top.push(lst);
      stack.push(lst);
      top = lst;
      i++;
      continue;
    }
    if (c === CC_CLOSE) {
      if (stack.length > 1) {
        stack.pop();
        top = stack[stack.length - 1];
      }
      i++;
      continue;
    }
    if (is_ws_code(c)) {
      i++;
      continue;
    }
    if (c === CC_QUOTE) {
      const start2 = i + 1;
      let j2 = start2;
      let escaping = false;
      let firstBs = -1;
      while (j2 < n) {
        const cj = src.charCodeAt(j2);
        if (!escaping && cj === CC_QUOTE) break;
        if (!escaping && cj === CC_BACKSLASH) {
          escaping = true;
          if (firstBs < 0) firstBs = j2;
        } else escaping = false;
        j2++;
      }
      top.push(decode_string(src, start2, j2, firstBs));
      i = j2 + 1;
      continue;
    }
    const start = i;
    const startsNumeric = c === CC_MINUS || c === CC_PLUS || is_digit_code(c);
    let j = i + 1;
    while (j < n) {
      const cj = src.charCodeAt(j);
      if (cj === CC_CLOSE || is_ws_code(cj) || cj === CC_OPEN) break;
      j++;
    }
    const text = src.substring(start, j);
    if (startsNumeric) {
      const num = classify_numeric(text);
      top.push(num === void 0 ? text : num);
    } else {
      top.push(text);
    }
    i = j;
  }
  return root;
}
function classify_numeric(text) {
  const len = text.length;
  if (len === 0) return void 0;
  let k = 0;
  const c0 = text.charCodeAt(0);
  if (c0 === CC_MINUS || c0 === CC_PLUS) k = 1;
  if (k >= len) return void 0;
  for (; k < len; k++) {
    const cc = text.charCodeAt(k);
    if (cc === CC_DOT || is_digit_code(cc)) continue;
    if (cc === 120 || cc === 88) {
      k++;
      for (; k < len; k++) {
        if (!is_hex_code(text.charCodeAt(k))) return void 0;
      }
      const hexstr = text.replace("_", "");
      const v2 = Number.parseInt(hexstr, 16);
      return Number.isNaN(v2) ? void 0 : v2;
    }
    return void 0;
  }
  const v = parseFloat(text);
  return Number.isNaN(v) ? void 0 : v;
}

// src/sexpr.ts
var is_string = (e) => typeof e === "string";
var is_number = (e) => typeof e === "number";
var T = {
  any(obj, name, e) {
    return e;
  },
  boolean(obj, name, e) {
    switch (e) {
      case "false":
      case "no":
        return false;
      case "true":
      case "yes":
        return true;
      default:
        return e ? true : false;
    }
  },
  string(obj, name, e) {
    if (is_string(e)) {
      return e;
    } else {
      return void 0;
    }
  },
  number(obj, name, e) {
    if (is_number(e)) {
      return e;
    } else {
      return void 0;
    }
  },
  // A net reference is normally a numeric index into the nets table, e.g.
  // `(net 5)`. Some KiCad exports write the net NAME instead, e.g.
  // `(net "/CAN_A_L")`. Preserve either form (number index or string name) so
  // downstream (the board model, which knows the nets table) can resolve a
  // name to its number. Without this, T.number silently dropped the string and
  // every track/via lost its net — breaking net isolation & the info card.
  net(obj, name, e) {
    if (is_number(e) || is_string(e)) {
      return e;
    }
    return void 0;
  },
  item(factory, ...args) {
    return (obj, name, e) => {
      return factory(e, ...args);
    };
  },
  object(start, ...defs) {
    return (obj, name, e) => {
      let existing = {};
      if (start !== null) {
        existing = obj[name] ?? start ?? {};
      }
      return {
        ...existing,
        ...parse_expr(e, P.start(name), ...defs)
      };
    };
  },
  vec2(obj, name, e) {
    const el = e;
    return { x: el[1] || 0, y: el[2] || 0 };
  },
  vec4(obj, name, e) {
    const el = e;
    return { x: el[1] || 0, y: el[2] || 0, z: el[3] || 0, w: el[4] || 0 };
  },
  color(obj, name, e) {
    const el = e;
    return {
      r: el[1] / 255,
      g: el[2] / 255,
      b: el[3] / 255,
      a: el[4] ?? 1
    };
  }
};
var P = {
  start(name) {
    return {
      kind: 0 /* start */,
      name,
      fn: T.string
    };
  },
  positional(name, typefn = T.any) {
    return {
      kind: 1 /* positional */,
      name,
      fn: typefn
    };
  },
  pair(name, typefn = T.any) {
    return {
      kind: 2 /* pair */,
      name,
      accepts: [name],
      fn: (obj, name2, e) => {
        return typefn(obj, name2, e[1]);
      }
    };
  },
  list(name, typefn = T.any) {
    return {
      kind: 3 /* list */,
      name,
      accepts: [name],
      fn: (obj, name2, e) => {
        return e.slice(1).map((n) => typefn(obj, name2, n));
      }
    };
  },
  collection(name, accept, typefn = T.any) {
    return {
      kind: 5 /* item_list */,
      name,
      accepts: [accept],
      fn: (obj, name2, e) => {
        const list = obj[name2] ?? [];
        list.push(typefn(obj, name2, e));
        return list;
      }
    };
  },
  mapped_collection(name, accept, keyfn, typefn = T.any) {
    return {
      kind: 5 /* item_list */,
      name,
      accepts: [accept],
      fn: (obj, name2, e) => {
        const map = obj[name2] ?? {};
        const val = typefn(obj, name2, e);
        const key = keyfn(val);
        map[key] = val;
        return map;
      }
    };
  },
  dict(name, accept, typefn = T.any) {
    return {
      kind: 5 /* item_list */,
      name,
      accepts: [accept],
      fn: (obj, name2, e) => {
        const el = e;
        const rec = obj[name2] ?? {};
        rec[el[1]] = typefn(obj, name2, el[2]);
        return rec;
      }
    };
  },
  atom(name, values) {
    let typefn;
    const is_flag = !values;
    if (values) {
      typefn = T.string;
    } else {
      typefn = T.boolean;
      values = [name];
    }
    return {
      kind: 4 /* atom */,
      name,
      accepts: values,
      fn(obj, name2, e) {
        if (Array.isArray(e)) {
          if (e.length == 1) {
            e = e[0];
          } else if (is_flag) {
            e = e[1];
          }
        }
        return typefn(obj, name2, e);
      }
    };
  },
  expr(name, typefn = T.any) {
    return {
      kind: 6 /* expr */,
      name,
      accepts: [name],
      fn: typefn
    };
  },
  object(name, start, ...defs) {
    return P.expr(name, T.object(start, ...defs));
  },
  item(name, factory, ...args) {
    return P.expr(name, T.item(factory, ...args));
  },
  vec2(name) {
    return P.expr(name, T.vec2);
  },
  vec4(name) {
    return P.expr(name, T.vec4);
  },
  color(name = "color") {
    return P.expr(name, T.color);
  }
};
function log_unmatched() {
}
function as_array(v) {
  if (Array.isArray(v)) {
    return v;
  } else {
    return [v];
  }
}
function parse_expr(expr, ...defs) {
  if (is_string(expr)) {
    expr = listify(expr);
    if (expr.length == 1 && Array.isArray(expr[0])) {
      expr = expr[0];
    }
  }
  const defs_map = /* @__PURE__ */ new Map();
  let start_def;
  let n = 0;
  for (const def of defs) {
    if (def.kind == 0 /* start */) {
      start_def = def;
    } else if (def.kind == 1 /* positional */) {
      defs_map.set(n, def);
      n++;
    } else {
      for (const a of def.accepts) {
        defs_map.set(a, def);
      }
    }
  }
  if (start_def) {
    const acceptable_start_strings = as_array(start_def.name);
    const first = expr.at(0);
    if (!acceptable_start_strings.includes(first)) {
      throw new Error(
        `Expression must start with ${start_def.name} found ${first} in ${expr}`
      );
    }
    expr = expr.slice(1);
  }
  const out = {};
  n = 0;
  for (const element of expr) {
    let def = null;
    if (is_string(element)) {
      def = defs_map.get(element);
    }
    if (!def && (is_string(element) || is_number(element))) {
      def = defs_map.get(n);
      if (!def) {
        log_unmatched();
        continue;
      }
      n++;
    }
    if (!def && Array.isArray(element)) {
      def = defs_map.get(element[0]);
    }
    if (!def) {
      log_unmatched();
      continue;
    }
    const value = def.fn(out, def.name, element);
    out[def.name] = value;
  }
  return out;
}

// src/common.ts
function parseAt(expr) {
  const parsed = parse_expr(
    expr,
    P.start("at"),
    P.vec2("position"),
    P.positional("x", T.number),
    P.positional("y", T.number),
    P.positional("rotation", T.number),
    P.atom("unlocked")
  );
  return {
    position: {
      x: parsed.position?.x ?? parsed.x ?? 0,
      y: parsed.position?.y ?? parsed.y ?? 0
    },
    rotation: parsed.rotation ?? 0,
    unlocked: parsed.unlocked ?? false
  };
}
function parseStroke(expr) {
  return parse_expr(
    expr,
    P.start("stroke"),
    P.pair("width", T.number),
    P.pair("type", T.string),
    P.color()
  );
}
function parseEffects(expr) {
  return parse_expr(
    expr,
    P.start("effects"),
    P.object(
      "font",
      {},
      P.start("font"),
      P.pair("face", T.string),
      P.vec2("size"),
      P.pair("thickness", T.number),
      P.atom("bold"),
      P.atom("italic"),
      P.pair("line_spacing", T.number),
      P.color()
    ),
    P.item("justify", (e) => {
      let horiz = "center";
      let vert = "center";
      let mirror = false;
      if (Array.isArray(e)) {
        for (let i = 1; i < e.length; i++) {
          const item = e[i];
          if (typeof item === "string") {
            if (item === "left" || item === "right") {
              horiz = item;
            } else if (item === "top" || item === "bottom") {
              vert = item;
            } else if (item === "mirror") {
              mirror = true;
            }
          }
        }
      }
      return { horiz, vert, mirror };
    }),
    P.atom("hide"),
    P.pair("href", T.string)
  );
}
function parseTitleBlock(expr) {
  return parse_expr(
    expr,
    P.start("title_block"),
    P.pair("title", T.string),
    P.pair("date", T.string),
    P.pair("rev", T.string),
    P.pair("company", T.string),
    P.dict("comment", "comment", T.string)
  );
}
function parsePaper(expr) {
  const raw = parse_expr(
    expr,
    P.start("paper"),
    P.positional("size", T.string),
    P.positional("width", T.number),
    P.positional("height", T.number),
    P.atom("portrait")
  );
  return raw;
}

// src/perf_log.ts
function isEcadPerfLogEnabled() {
  try {
    return !!globalThis.__ECAD_PERF_LOG__;
  } catch {
    return false;
  }
}
function ecadPerfLog(...args) {
  if (!isEcadPerfLogEnabled()) return;
  console.info("[ecad-perf]", ...args);
}

// src/board_parser.ts
function parseLayer(expr) {
  return parse_expr(
    expr,
    P.positional("ordinal", T.number),
    P.positional("canonical_name", T.string),
    P.positional("type", T.string),
    P.positional("user_name", T.string)
  );
}
function parseStackupLayer(expr) {
  return parse_expr(
    expr,
    P.positional("name", T.string),
    P.pair("type", T.string),
    P.pair("color", T.string),
    P.pair("thickness", T.number),
    P.pair("material", T.string),
    P.pair("epsilon_r", T.number),
    P.pair("loss_tangent", T.number)
  );
}
function parseStackup(expr) {
  return parse_expr(
    expr,
    P.start("stackup"),
    P.collection("layers", "layer", T.item(parseStackupLayer)),
    P.pair("copper_finish", T.string),
    P.pair("dielectric_constraints", T.boolean),
    P.pair("edge_connector", T.string),
    P.pair("castellated_pads", T.boolean),
    P.pair("edge_plating", T.boolean)
  );
}
function parsePCBPlotParams(expr) {
  return parse_expr(
    expr,
    P.start("pcbplotparams"),
    P.pair("layerselection", T.number),
    P.pair("disableapertmacros", T.boolean),
    P.pair("usegerberextensions", T.boolean),
    P.pair("usegerberattributes", T.boolean),
    P.pair("usegerberadvancedattributes", T.boolean),
    P.pair("creategerberjobfile", T.boolean),
    P.pair("gerberprecision", T.number),
    P.pair("svguseinch", T.boolean),
    P.pair("svgprecision", T.number),
    P.pair("excludeedgelayer", T.boolean),
    P.pair("plotframeref", T.boolean),
    P.pair("viasonmask", T.boolean),
    P.pair("mode", T.number),
    P.pair("useauxorigin", T.boolean),
    P.pair("hpglpennumber", T.number),
    P.pair("hpglpenspeed", T.number),
    P.pair("hpglpendiameter", T.number),
    P.pair("dxfpolygonmode", T.boolean),
    P.pair("dxfimperialunits", T.boolean),
    P.pair("dxfusepcbnewfont", T.boolean),
    P.pair("psnegative", T.boolean),
    P.pair("psa4output", T.boolean),
    P.pair("plotreference", T.boolean),
    P.pair("plotvalue", T.boolean),
    P.pair("plotinvisibletext", T.boolean),
    P.pair("sketchpadsonfab", T.boolean),
    P.pair("subtractmaskfromsilk", T.boolean),
    P.pair("outputformat", T.number),
    P.pair("mirror", T.boolean),
    P.pair("drillshape", T.number),
    P.pair("scaleselection", T.number),
    P.pair("outputdirectory", T.string),
    P.pair("plot_on_all_layers_selection", T.number),
    P.pair("dashed_line_dash_ratio", T.number),
    P.pair("dashed_line_gap_ratio", T.number),
    P.pair("pdf_front_fp_property_popups", T.boolean),
    P.pair("pdf_back_fp_property_popups", T.boolean),
    P.pair("plotfptext", T.boolean)
  );
}
function parseSetup(expr) {
  return parse_expr(
    expr,
    P.start("setup"),
    P.pair("pad_to_mask_clearance", T.number),
    P.pair("solder_mask_min_width", T.number),
    P.pair("pad_to_paste_clearance", T.number),
    P.pair("pad_to_paste_clearance_ratio", T.number),
    P.vec2("aux_axis_origin"),
    P.vec2("grid_origin"),
    P.item("pcbplotparams", parsePCBPlotParams),
    P.item("stackup", parseStackup),
    P.pair("allow_soldermask_bridges_in_footprints", T.boolean)
  );
}
function parseNet(expr) {
  const parsed = parse_expr(
    expr,
    P.start("net"),
    P.positional("number_or_name", T.any),
    P.positional("name", T.string)
  );
  if (typeof parsed.number_or_name === "number") {
    return {
      number: parsed.number_or_name,
      name: parsed.name ?? ""
    };
  }
  if (typeof parsed.number_or_name === "string") {
    return { number: 0, name: parsed.number_or_name };
  }
  return { number: 0, name: parsed.name ?? "" };
}
function parseNetReference(expr) {
  const parsed = parse_expr(
    expr,
    P.start("net"),
    P.positional("number_or_name", T.any),
    P.positional("name", T.string)
  );
  if (typeof parsed.number_or_name === "number") {
    return {
      number: parsed.number_or_name,
      name: parsed.name ?? ""
    };
  }
  if (typeof parsed.number_or_name === "string") {
    return { number: 0, name: parsed.number_or_name };
  }
  return { number: 0, name: parsed.name ?? "" };
}
function parseLine(expr, start) {
  return parse_expr(
    expr,
    P.start(start),
    P.pair("layer", T.string),
    P.pair("tstamp", T.string),
    P.pair("uuid", T.string),
    P.atom("locked"),
    P.vec2("start"),
    P.vec2("end"),
    P.pair("width", T.number),
    P.item("stroke", parseStroke)
  );
}
function parse_gr_Line(expr) {
  return parseLine(expr, "gr_line");
}
function parse_fp_Line(expr) {
  return parseLine(expr, "fp_line");
}
function parseCircle(expr, start) {
  return parse_expr(
    expr,
    P.start(start),
    P.pair("layer", T.string),
    P.pair("tstamp", T.string),
    P.pair("uuid", T.string),
    P.atom("locked"),
    P.vec2("center"),
    P.vec2("end"),
    P.pair("width", T.number),
    P.pair("fill", T.string),
    P.item("stroke", parseStroke)
  );
}
function parse_gr_Circle(expr) {
  return parseCircle(expr, "gr_circle");
}
function parse_fp_Circle(expr) {
  return parseCircle(expr, "fp_circle");
}
function parseArc(expr, start) {
  return parse_expr(
    expr,
    P.start(start),
    // Also fp_arc
    P.pair("layer", T.string),
    P.pair("tstamp", T.string),
    P.pair("uuid", T.string),
    P.atom("locked"),
    P.vec2("start"),
    P.vec2("mid"),
    P.vec2("end"),
    P.pair("angle", T.number),
    P.pair("width", T.number),
    P.item("stroke", parseStroke)
  );
}
function parse_gr_Arc(expr) {
  return parseArc(expr, "gr_arc");
}
function parse_fp_Arc(expr) {
  return parseArc(expr, "fp_arc");
}
function parse_poly_Arc(expr) {
  return parseArc(expr, "arc");
}
function parsePoly(expr, start) {
  return parse_expr(
    expr,
    P.start(start),
    P.pair("layer", T.string),
    P.pair("tstamp", T.string),
    P.pair("uuid", T.string),
    P.atom("locked"),
    P.expr("pts", (obj, name, expr2) => {
      const parsed = parse_expr(
        expr2,
        P.start("pts"),
        P.collection("items", "xy", T.vec2),
        P.collection("items", "arc", T.item(parse_poly_Arc))
      );
      return parsed?.["items"];
    }),
    P.pair("width", T.number),
    P.pair("fill", T.string),
    P.atom("island"),
    P.item("stroke", parseStroke)
  );
}
function parse_gr_poly(expr) {
  return parsePoly(expr, "gr_poly");
}
function parse_fp_poly(expr) {
  return parsePoly(expr, "fp_poly");
}
function parse_polygon(expr) {
  return parsePoly(expr, "polygon");
}
function parse_filled_polygon(expr) {
  return parsePoly(expr, "filled_polygon");
}
function parseRect(expr, start) {
  return parse_expr(
    expr,
    P.start(start),
    P.pair("layer", T.string),
    P.pair("tstamp", T.string),
    P.pair("uuid", T.string),
    P.atom("locked"),
    P.vec2("start"),
    P.vec2("end"),
    P.pair("width", T.number),
    P.pair("fill", T.string),
    P.item("stroke", parseStroke)
  );
}
function parse_gr_Rect(expr) {
  return parseRect(expr, "gr_rect");
}
function parse_fp_Rect(expr) {
  return parseRect(expr, "fp_rect");
}
function parseTextRenderCache(expr) {
  return parse_expr(
    expr,
    P.start("render_cache"),
    P.positional("text", T.string),
    P.positional("angle", T.number),
    P.pair("uuid", T.string),
    P.collection("polygons", "polygon", T.item(parse_polygon))
  );
}
function parseFpText(expr) {
  return parse_expr(
    expr,
    P.start("fp_text"),
    P.atom("locked"),
    P.positional("type", T.string),
    // reference, value, user
    P.positional("text", T.string),
    P.item("at", parseAt),
    P.atom("hide"),
    P.atom("unlocked"),
    P.pair("uuid", T.string),
    P.object(
      "layer",
      {},
      P.start("layer"),
      P.positional("name", T.string),
      P.atom("knockout")
    ),
    P.pair("tstamp", T.string),
    P.item("effects", parseEffects),
    P.item("render_cache", parseTextRenderCache)
  );
}
function parseGrText(expr) {
  return parse_expr(
    expr,
    P.start("gr_text"),
    P.positional("text", T.string),
    P.item("at", parseAt),
    P.object(
      "layer",
      {},
      P.start("layer"),
      P.positional("name", T.string),
      P.atom("knockout")
    ),
    P.atom("unlocked"),
    P.atom("hide"),
    P.atom("locked"),
    P.item("effects", parseEffects),
    P.pair("tstamp", T.string),
    P.pair("uuid", T.string),
    P.item("render_cache", parseTextRenderCache)
  );
}
function parseDimension(expr) {
  return parse_expr(
    expr,
    P.start("dimension"),
    P.atom("locked"),
    P.positional("type", T.string),
    // aligned, leader, etc
    P.pair("layer", T.string),
    P.pair("tstamp", T.string),
    P.pair("uuid", T.string),
    P.collection("pts", "pts", (obj, name, e) => {
      return parse_expr(e, P.collection("points", "xy", T.vec2))["points"];
    }),
    P.pair("height", T.number),
    P.pair("orientation", T.number),
    P.pair("leader_length", T.number),
    P.item("gr_text", parseGrText),
    P.object(
      "format",
      {},
      P.start("format"),
      P.pair("prefix", T.string),
      P.pair("suffix", T.string),
      P.pair("units", T.number),
      P.pair("units_format", T.number),
      P.pair("precision", T.number),
      P.pair("override_value", T.string),
      P.pair("suppress_zeroes", T.boolean)
    ),
    P.object(
      "style",
      {},
      P.start("style"),
      P.pair("thickness", T.number),
      P.pair("arrow_length", T.number),
      P.pair("text_position_mode", T.number),
      P.pair("extension_height", T.number),
      P.pair("text_frame", T.number),
      P.pair("extension_offset", T.number),
      P.pair("keep_text_aligned", T.boolean)
    )
  );
}
function parsePad(expr) {
  return parse_expr(
    expr,
    P.start("pad"),
    P.positional("number", T.string),
    P.positional("type", T.string),
    P.positional("shape", T.string),
    P.atom("locked"),
    P.item("at", parseAt),
    P.vec2("size"),
    P.vec2("rect_delta"),
    P.list("layers", T.string),
    P.pair("remove_unused_layers", T.boolean),
    P.pair("keep_end_layers", T.boolean),
    P.pair("roundrect_rratio", T.number),
    P.pair("chamfer_ratio", T.number),
    P.object(
      "chamfer",
      {},
      P.start("chamfer"),
      P.atom("top_left"),
      P.atom("top_right"),
      P.atom("bottom_right"),
      P.atom("bottom_left")
    ),
    P.pair("pinfunction", T.string),
    P.pair("pintype", T.string),
    P.pair("die_length", T.number),
    P.pair("solder_mask_margin", T.number),
    P.pair("solder_paste_margin", T.number),
    P.pair("solder_paste_margin_ratio", T.number),
    P.pair("clearance", T.number),
    P.pair("thermal_width", T.number),
    P.pair("thermal_gap", T.number),
    P.pair("thermal_bridge_angle", T.number),
    P.pair("zone_connect", T.number),
    P.object(
      "drill",
      {},
      P.start("drill"),
      P.atom("oval"),
      P.positional("diameter", T.number),
      P.positional("width", T.number),
      P.vec2("offset")
    ),
    P.item("net", parseNetReference),
    P.object(
      "options",
      {},
      P.start("options"),
      P.pair("clearance", T.string),
      P.pair("anchor", T.string)
    ),
    P.expr("primitives", (obj, name, expr2) => {
      const parsed = parse_expr(
        expr2,
        P.start("primitives"),
        P.collection("items", "gr_line", T.item(parse_gr_Line)),
        P.collection("items", "gr_circle", T.item(parse_gr_Circle)),
        P.collection("items", "gr_arc", T.item(parse_gr_Arc)),
        P.collection("items", "gr_rect", T.item(parse_gr_Rect)),
        P.collection("items", "gr_poly", T.item(parse_gr_poly))
      );
      return parsed?.["items"];
    }),
    P.pair("tstamp", T.string),
    P.pair("uuid", T.string)
  );
}
function parseModel(expr) {
  return parse_expr(
    expr,
    P.start("model"),
    P.positional("filename", T.string),
    P.object(
      "offset",
      {},
      P.start("offset"),
      P.collection("xyz", "xyz", T.number)
    ),
    P.object(
      "scale",
      {},
      P.start("scale"),
      P.collection("xyz", "xyz", T.number)
    ),
    P.object(
      "rotate",
      {},
      P.start("rotate"),
      P.collection("xyz", "xyz", T.number)
    ),
    P.atom("hide"),
    P.pair("opacity", T.number)
  );
}
function parsePropertyKicad8(expr) {
  return parse_expr(
    expr,
    P.start("property"),
    P.positional("name", T.string),
    P.positional("value", T.string),
    P.item("at", parseAt),
    P.atom("unlocked"),
    P.object(
      "layer",
      {},
      P.start("layer"),
      P.positional("name", T.string),
      P.atom("knockout")
    ),
    P.atom("hide"),
    P.pair("uuid", T.string),
    P.item("effects", parseEffects),
    P.item("render_cache", parseTextRenderCache)
  );
}
function parseZoneFill(expr) {
  return parse_expr(
    expr,
    P.start("fill"),
    P.positional("fill", T.boolean),
    P.pair("mode", T.string),
    P.pair("thermal_gap", T.number),
    P.pair("thermal_bridge_width", T.number),
    P.object(
      "smoothing",
      {},
      P.start("smoothing"),
      P.positional("style", T.string),
      P.pair("radius", T.number)
    ),
    P.pair("radius", T.number),
    P.pair("island_removal_mode", T.number),
    P.pair("island_area_min", T.number),
    P.pair("hatch_thickness", T.number),
    P.pair("hatch_gap", T.number),
    P.pair("hatch_orientation", T.number),
    P.pair("hatch_smoothing_level", T.number),
    P.pair("hatch_smoothing_value", T.number),
    P.pair("hatch_border_algorithm", T.string),
    P.pair("hatch_min_hole_area", T.number),
    P.pair("uuid", T.string)
  );
}
function parseZoneKeepout(expr) {
  return parse_expr(
    expr,
    P.start("keepout"),
    P.pair("tracks", T.string),
    P.pair("vias", T.string),
    P.pair("pads", T.string),
    P.pair("copperpour", T.string),
    P.pair("footprints", T.string),
    P.pair("uuid", T.string)
  );
}
function parseZone(expr) {
  return parse_expr(
    expr,
    P.start("zone"),
    P.atom("locked"),
    P.pair("net", T.net),
    P.pair("net_name", T.string),
    P.pair("name", T.string),
    P.pair("layer", T.string),
    P.list("layers", T.string),
    P.object(
      "hatch",
      {},
      P.start("hatch"),
      P.positional("style", T.string),
      P.positional("pitch", T.number)
    ),
    P.pair("priority", T.number),
    P.object(
      "connect_pads",
      {},
      P.start("connect_pads"),
      P.positional("type", T.string),
      P.pair("clearance", T.number)
    ),
    P.pair("min_thickness", T.number),
    P.pair("filled_areas_thickness", T.boolean),
    P.item("keepout", parseZoneKeepout),
    P.item("fill", parseZoneFill),
    P.collection("polygons", "polygon", T.item(parse_polygon)),
    P.collection(
      "filled_polygons",
      "filled_polygon",
      T.item(parse_filled_polygon)
    ),
    P.pair("tstamp", T.string),
    P.pair("uuid", T.string)
  );
}
function parseFootprint(expr) {
  return parse_expr(
    expr,
    P.start("footprint"),
    P.positional("library_link", T.string),
    P.pair("version", T.number),
    P.pair("embedded_fonts", T.boolean),
    P.pair("generator", T.string),
    P.atom("locked"),
    P.atom("placed"),
    P.pair("layer", T.string),
    P.pair("tedit", T.string),
    P.pair("tstamp", T.string),
    P.item("at", parseAt),
    P.pair("uuid", T.string),
    P.pair("descr", T.string),
    P.pair("tags", T.string),
    P.pair("sheetname", T.string),
    P.pair("sheetfile", T.string),
    P.pair("path", T.string),
    P.pair("autoplace_cost90", T.number),
    P.pair("autoplace_cost180", T.number),
    P.pair("solder_mask_margin", T.number),
    P.pair("solder_paste_margin", T.number),
    P.pair("solder_paste_ratio", T.number),
    P.pair("clearance", T.number),
    P.pair("zone_connect", T.number),
    P.pair("thermal_width", T.number),
    P.pair("thermal_gap", T.number),
    P.object(
      "attr",
      {},
      P.start("attr"),
      P.atom("through_hole"),
      P.atom("smd"),
      P.atom("virtual"),
      P.atom("board_only"),
      P.atom("exclude_from_pos_files"),
      P.atom("exclude_from_bom"),
      P.atom("allow_solder_mask_bridges"),
      P.atom("allow_missing_courtyard")
    ),
    P.dict("properties", "property", T.string),
    P.collection(
      "properties_kicad_8",
      "property",
      T.item(parsePropertyKicad8)
    ),
    P.collection("drawings", "fp_line", T.item(parse_fp_Line)),
    P.collection("drawings", "fp_circle", T.item(parse_fp_Circle)),
    P.collection("drawings", "fp_arc", T.item(parse_fp_Arc)),
    P.collection("drawings", "fp_poly", T.item(parse_fp_poly)),
    P.collection("drawings", "fp_rect", T.item(parse_fp_Rect)),
    P.collection("fp_texts", "fp_text", T.item(parseFpText)),
    P.collection("zones", "zone", T.item(parseZone)),
    P.collection("models", "model", T.item(parseModel)),
    P.collection("pads", "pad", T.item(parsePad))
  );
}
function parseLineSegment(expr) {
  return parse_expr(
    expr,
    P.start("segment"),
    P.vec2("start"),
    P.vec2("end"),
    P.pair("width", T.number),
    P.pair("layer", T.string),
    P.pair("net", T.net),
    P.atom("locked"),
    P.pair("tstamp", T.string),
    P.pair("uuid", T.string)
  );
}
function parseArcSegment(expr) {
  return parse_expr(
    expr,
    P.start("arc"),
    P.vec2("start"),
    P.vec2("mid"),
    P.vec2("end"),
    P.pair("width", T.number),
    P.pair("layer", T.string),
    P.pair("net", T.net),
    P.atom("locked"),
    P.pair("tstamp", T.string),
    P.pair("uuid", T.string)
  );
}
function parseVia(expr) {
  return parse_expr(
    expr,
    P.start("via"),
    P.item("at", parseAt),
    P.pair("size", T.number),
    P.pair("drill", T.number),
    P.list("layers", T.string),
    P.atom("remove_unused_layers"),
    P.atom("keep_end_layers"),
    P.atom("locked"),
    P.atom("free"),
    P.pair("net", T.net),
    P.pair("tstamp", T.string),
    P.pair("uuid", T.string),
    P.atom("type", ["blind", "micro", "through-hole"])
  );
}
function parseGroup(expr) {
  return parse_expr(
    expr,
    P.start("group"),
    P.positional("name", T.string),
    P.pair("id", T.string),
    P.atom("locked"),
    P.collection("members", "members", T.string)
  );
}
var BoardParser = class {
  parse(text) {
    const want_breakdown = isEcadPerfLogEnabled() && text.length > 1e6;
    const t0 = want_breakdown ? performance.now() : 0;
    const expr = listify(text);
    const t1 = want_breakdown ? performance.now() : 0;
    const root = expr.length === 1 && Array.isArray(expr[0]) ? expr[0] : expr;
    const result = parse_expr(
      root,
      P.start("kicad_pcb"),
      P.pair("version", T.number),
      P.pair("generator", T.string),
      P.pair("embedded_fonts", T.boolean),
      P.pair("generator_version", T.string),
      P.object(
        "general",
        {},
        P.start("general"),
        P.pair("thickness", T.number),
        P.atom("legacy_teardrops")
      ),
      P.item("paper", parsePaper),
      P.item("title_block", parseTitleBlock),
      P.item("setup", parseSetup),
      P.dict("properties", "property", (obj, name, e) => {
        const el = e;
        return { name: el[1], value: el[2] };
      }),
      P.list("layers", T.item(parseLayer)),
      P.collection("nets", "net", T.item(parseNet)),
      P.collection("footprints", "footprint", T.item(parseFootprint)),
      P.collection("footprints", "module", T.item(parseFootprint)),
      // Support legacy module
      P.collection("zones", "zone", T.item(parseZone)),
      P.collection("segments", "segment", T.item(parseLineSegment)),
      P.collection("segments", "arc", T.item(parseArcSegment)),
      P.collection("vias", "via", T.item(parseVia)),
      P.collection("drawings", "gr_line", T.item(parse_gr_Line)),
      P.collection("drawings", "gr_circle", T.item(parse_gr_Circle)),
      P.collection("drawings", "gr_arc", T.item(parse_gr_Arc)),
      P.collection("drawings", "gr_poly", T.item(parse_gr_poly)),
      P.collection("drawings", "gr_rect", T.item(parse_gr_Rect)),
      P.collection("drawings", "gr_text", T.item(parseGrText)),
      P.collection("drawings", "dimension", T.item(parseDimension)),
      P.collection("groups", "group", T.item(parseGroup))
    );
    if (want_breakdown) {
      const t2 = performance.now();
      ecadPerfLog(
        `PCB breakdown  ${(text.length / 1048576).toFixed(1)}MB  listify=${(t1 - t0).toFixed(0)}ms  parse_expr=${(t2 - t1).toFixed(0)}ms`
      );
    }
    return result;
  }
};

// src/schematic_serializer.ts
function escapeString(str) {
  if (str === void 0) return "";
  return str.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}
function serializeFlag(name, value) {
  return value ? ` (${name} yes)` : "";
}
function serializeAt(at, level = 0, forceRotation = false) {
  if (!at) {
    return "(at 0 0 0)";
  }
  const x = at.position?.x || 0;
  const y = at.position?.y || 0;
  const rotation = at.rotation || 0;
  if (forceRotation || rotation !== 0) {
    return `(at ${formatDouble(x)} ${formatDouble(y)} ${formatDouble(rotation)})`;
  }
  return `(at ${formatDouble(x)} ${formatDouble(y)})`;
}
function serializeEffects(effects, level = 0) {
  const indent = indentString(level);
  const indent2 = indentString(level + 1);
  const indent3 = indentString(level + 2);
  let result = "(effects";
  if (effects.font) {
    result += `
${indent2}(font`;
    result += `
${indent3}(size ${formatDouble(effects.font.size?.x || 0)} ${formatDouble(effects.font.size?.y || 0)})`;
    if (effects.font.face) {
      result += `
${indent3}(name "${escapeString(effects.font.face)}")`;
    }
    if (effects.font.thickness != null) {
      result += `
${indent3}(thickness ${formatDouble(effects.font.thickness)})`;
    }
    if (effects.font.bold) {
      result += `
${indent3}(bold yes)`;
    }
    if (effects.font.italic) {
      result += `
${indent3}(italic yes)`;
    }
    result += `
${indent2})`;
  }
  if (effects.justify) {
    const parts = [];
    if (effects.justify.horiz && effects.justify.horiz !== "center") parts.push(effects.justify.horiz);
    if (effects.justify.vert && effects.justify.vert !== "center") parts.push(effects.justify.vert);
    if (effects.justify.mirror) parts.push("mirror");
    if (parts.length > 0) {
      result += `
${indent2}(justify ${parts.join(" ")})`;
    }
  }
  if (effects.hide) {
    result += `
${indent2}(hide yes)`;
  }
  if (effects.href) {
    result += `
${indent2}(href "${escapeString(effects.href)}")`;
  }
  result += `
${indent})`;
  return result;
}
function formatDouble(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(6).replace(/\.?0+$/, "");
}
function formatColorAlpha(alpha) {
  if (alpha === 0) {
    return "0.0000";
  }
  return formatDouble(alpha);
}
function serializeStroke(stroke, level = 0) {
  const indent = indentString(level);
  const indent2 = indentString(level + 1);
  let result = "(stroke";
  if (stroke.width !== void 0) {
    result += `
${indent2}(width ${formatDouble(stroke.width)})`;
  }
  if (stroke.type) {
    result += `
${indent2}(type ${stroke.type})`;
  }
  if (stroke.color) {
    result += `
${indent2}(color ${Math.round(stroke.color.r * 255)} ${Math.round(stroke.color.g * 255)} ${Math.round(stroke.color.b * 255)} ${formatColorAlpha(stroke.color.a)})`;
  }
  result += `
${indent})`;
  return result;
}
function serializeFill(fill, level = 0) {
  if (!fill) return "";
  const indent = indentString(level);
  const indent2 = indentString(level + 1);
  let result = "(fill";
  if (fill.type) {
    result += `
${indent2}(type ${fill.type})`;
  }
  if (fill.color) {
    result += `
${indent2}(color ${Math.round(fill.color.r * 255)} ${Math.round(fill.color.g * 255)} ${Math.round(fill.color.b * 255)} ${formatColorAlpha(fill.color.a)})`;
  }
  result += `
${indent})`;
  return result;
}
function serializePaper(paper, level = 0) {
  if (paper.portrait) {
    return `(paper "${paper.size}" portrait)`;
  }
  return `(paper "${paper.size}")`;
}
function serializeTitleBlock(titleBlock, level = 0) {
  const indent = indentString(level);
  const indent2 = indentString(level + 1);
  let result = `${indent}(title_block`;
  if (titleBlock.title) {
    result += `
${indent2}(title "${escapeString(titleBlock.title)}")`;
  }
  if (titleBlock.company) {
    result += `
${indent2}(company "${escapeString(titleBlock.company)}")`;
  }
  if (titleBlock.date) {
    result += `
${indent2}(date "${escapeString(titleBlock.date)}")`;
  }
  if (titleBlock.rev) {
    result += `
${indent2}(rev "${escapeString(titleBlock.rev)}")`;
  }
  if (titleBlock.comment) {
    for (const [key, value] of Object.entries(titleBlock.comment)) {
      result += `
${indent2}(comment ${key} "${escapeString(value)}")`;
    }
  }
  result += `
${indent})`;
  return result;
}
function serializeProperty(property, level = 0) {
  const indent = indentString(level);
  const indent2 = indentString(level + 1);
  let result = indent + "(property";
  if (property.private) {
    result += " private";
  }
  result += ' "' + escapeString(property.name || "") + '" "' + escapeString(property.text || "") + '"';
  result += "\n" + indent2 + serializeAt(property.at, 0, true);
  result += "\n" + indent2 + serializeEffects(property.effects, level + 1);
  if (property.show_name) {
    result += "\n" + indent2 + "(show_name yes)";
  }
  if (property.do_not_autoplace) {
    result += "\n" + indent2 + "(do_not_autoplace yes)";
  }
  if (property.hide) {
    result += "\n" + indent2 + "(hide yes)";
  }
  result += "\n" + indent + ")";
  return result;
}
function serializePinAlternate(alternate, level = 0) {
  return `(alternate "${escapeString(alternate.name)}" ${alternate.type} ${alternate.shape})`;
}
function serializePin(pin, level = 0) {
  const indent = indentString(level);
  const indent2 = indentString(level + 1);
  let result = `${indent}(pin ${pin.type} ${pin.shape}`;
  result += `
${indent2}${serializeAt(pin.at, 0, true)}`;
  result += `
${indent2}(length ${formatDouble(pin.length)})`;
  if (pin.hide) {
    result += `
${indent2}(hide yes)`;
  }
  result += `
${indent2}(name "${escapeString(pin.name.text)}"`;
  const nameEffectsStr = serializeEffects(pin.name.effects, level + 2);
  result += `
${indentString(level + 2)}${nameEffectsStr}`;
  result += `
${indent2})`;
  result += `
${indent2}(number "${escapeString(pin.number.text)}"`;
  const numEffectsStr = serializeEffects(pin.number.effects, level + 2);
  result += `
${indentString(level + 2)}${numEffectsStr}`;
  result += `
${indent2})`;
  if (pin.alternates && pin.alternates.length > 0) {
    for (const alternate of pin.alternates) {
      result += `
${indent2}${serializePinAlternate(alternate)}`;
    }
  }
  result += `
${indent})`;
  return result;
}
function serializeLibSymbol(symbol, level = 0) {
  const indent = indentString(level);
  let result = `${indent}(symbol "${escapeString(symbol.name)}"
`;
  if (symbol.power) result += `${indentString(level + 1)}(power)
`;
  if (symbol.pin_numbers?.hide) {
    result += `${indentString(level + 1)}(pin_numbers
`;
    result += `${indentString(level + 2)}(hide yes)
`;
    result += `${indentString(level + 1)})
`;
  }
  if (symbol.pin_names) {
    result += `${indentString(level + 1)}(pin_names
`;
    if (symbol.pin_names.offset !== void 0)
      result += `${indentString(level + 2)}(offset ${symbol.pin_names.offset})
`;
    if (symbol.pin_names.hide) result += `${indentString(level + 2)}(hide yes)
`;
    result += `${indentString(level + 1)})
`;
  }
  if (symbol.exclude_from_sim !== void 0) result += `${indentString(level + 1)}(exclude_from_sim ${symbol.exclude_from_sim ? "yes" : "no"})
`;
  if (symbol.in_bom !== void 0) result += `${indentString(level + 1)}(in_bom ${symbol.in_bom ? "yes" : "no"})
`;
  if (symbol.on_board !== void 0) result += `${indentString(level + 1)}(on_board ${symbol.on_board ? "yes" : "no"})
`;
  if (symbol.properties && symbol.properties.length > 0) {
    for (const property of symbol.properties) {
      result += `${serializeProperty(property, level + 1)}
`;
    }
  }
  if (symbol.children && symbol.children.length > 0) {
    for (const child of symbol.children) {
      result += serializeLibSymbol(child, level + 1);
    }
  }
  if (symbol.drawings && symbol.drawings.length > 0) {
    for (const drawing of symbol.drawings) {
      if (drawing.type === "arc") {
        const arc = drawing;
        result += `${indentString(level + 1)}(arc (start ${arc.start.x} ${arc.start.y})
`;
        if (arc.mid) {
          result += `${indentString(level + 2)}(mid ${arc.mid.x} ${arc.mid.y})
`;
        }
        result += `${indentString(level + 2)}(end ${arc.end.x} ${arc.end.y})
`;
        if (arc.radius) {
          result += `${indentString(level + 2)}(radius (xy ${arc.radius.at.x} ${arc.radius.at.y}) (length ${arc.radius.length}) (angles ${arc.radius.angles.x} ${arc.radius.angles.y}))
`;
        }
        if (arc.stroke) result += `${indentString(level + 2)}${serializeStroke(arc.stroke, level + 2)}
`;
        if (arc.fill) result += `${indentString(level + 2)}${serializeFill(arc.fill, level + 2)}
`;
        if (arc.uuid) result += `${indentString(level + 2)}(uuid "${escapeString(arc.uuid)}")
`;
        result += `${indentString(level + 1)})
`;
      } else if (drawing.type === "bezier") {
        const bezier = drawing;
        result += `${indentString(level + 1)}(bezier (pts
`;
        for (const pt of bezier.pts) {
          result += `${indentString(level + 3)}(xy ${pt.x} ${pt.y})
`;
        }
        result += `${indentString(level + 2)})
`;
        if (bezier.stroke)
          result += `${indentString(level + 2)}${serializeStroke(bezier.stroke, level + 2)}
`;
        if (bezier.fill) result += `${indentString(level + 2)}${serializeFill(bezier.fill, level + 2)}
`;
        if (bezier.uuid) result += `${indentString(level + 2)}(uuid "${escapeString(bezier.uuid)}")
`;
        result += `${indentString(level + 1)})
`;
      } else if (drawing.type === "circle") {
        const circle = drawing;
        result += `${indentString(level + 1)}(circle
`;
        result += `${indentString(level + 2)}(center ${circle.center.x} ${circle.center.y})
`;
        result += `${indentString(level + 2)}(radius ${circle.radius})
`;
        if (circle.stroke) {
          result += `${indentString(level + 2)}(stroke
`;
          const strokeStr = serializeStroke(circle.stroke, level + 3);
          const strokeLines = strokeStr.split("\n");
          for (let i = 1; i < strokeLines.length - 1; i++) {
            result += strokeLines[i] + "\n";
          }
          result += `${indentString(level + 2)})
`;
        }
        if (circle.fill) {
          result += `${indentString(level + 2)}(fill
`;
          const fillStr = serializeFill(circle.fill, level + 3);
          const fillLines = fillStr.split("\n");
          for (let i = 1; i < fillLines.length - 1; i++) {
            result += fillLines[i] + "\n";
          }
          result += `${indentString(level + 2)})
`;
        }
        if (circle.uuid) result += `${indentString(level + 2)}(uuid "${escapeString(circle.uuid)}")
`;
        result += `${indentString(level + 1)})
`;
      } else if (drawing.type === "polyline") {
        const polyline = drawing;
        result += `${indentString(level + 1)}(polyline
`;
        result += `${indentString(level + 2)}(pts
`;
        for (let i = 0; i < polyline.pts.length; i++) {
          const pt = polyline.pts[i];
          if (i === 0) {
            result += `${indentString(level + 3)}(xy ${pt.x} ${pt.y})`;
          } else {
            result += ` (xy ${pt.x} ${pt.y})`;
          }
        }
        result += `
`;
        result += `${indentString(level + 2)})
`;
        if (polyline.stroke) {
          result += `${indentString(level + 2)}(stroke
`;
          const strokeStr = serializeStroke(polyline.stroke, level + 3);
          const strokeLines = strokeStr.split("\n");
          for (let i = 1; i < strokeLines.length - 1; i++) {
            result += strokeLines[i] + "\n";
          }
          result += `${indentString(level + 2)})
`;
        }
        if (polyline.fill) {
          result += `${indentString(level + 2)}(fill
`;
          const fillStr = serializeFill(polyline.fill, level + 3);
          const fillLines = fillStr.split("\n");
          for (let i = 1; i < fillLines.length - 1; i++) {
            result += fillLines[i] + "\n";
          }
          result += `${indentString(level + 2)})
`;
        }
        if (polyline.uuid) result += `${indentString(level + 2)}(uuid "${escapeString(polyline.uuid)}")
`;
        result += `${indentString(level + 1)})
`;
      } else if (drawing.type === "rectangle") {
        const rectangle = drawing;
        result += `${indentString(level + 1)}(rectangle
`;
        result += `${indentString(level + 2)}(start ${rectangle.start.x} ${rectangle.start.y})
`;
        result += `${indentString(level + 2)}(end ${rectangle.end.x} ${rectangle.end.y})
`;
        if (rectangle.stroke) {
          result += `${indentString(level + 2)}(stroke
`;
          const strokeStr = serializeStroke(rectangle.stroke, level + 3);
          const strokeLines = strokeStr.split("\n");
          for (let i = 1; i < strokeLines.length - 1; i++) {
            result += strokeLines[i] + "\n";
          }
          result += `${indentString(level + 2)})
`;
        }
        if (rectangle.fill) {
          result += `${indentString(level + 2)}(fill
`;
          const fillStr = serializeFill(rectangle.fill, level + 3);
          const fillLines = fillStr.split("\n");
          for (let i = 1; i < fillLines.length - 1; i++) {
            result += fillLines[i] + "\n";
          }
          result += `${indentString(level + 2)})
`;
        }
        if (rectangle.uuid) result += `${indentString(level + 2)}(uuid "${escapeString(rectangle.uuid)}")
`;
        result += `${indentString(level + 1)})
`;
      } else if (drawing.type === "text") {
        const text = drawing;
        result += `${indentString(level + 1)}(text "${escapeString(text.text)}"`;
        if (text.exclude_from_sim != null) {
          result += ` (exclude_from_sim ${text.exclude_from_sim ? "yes" : "no"})`;
        }
        result += ` ${serializeAt(text.at, 0, true)}
`;
        result += `${indentString(level + 2)}${serializeEffects(text.effects, level + 2)}
`;
        if (text.uuid) result += `${indentString(level + 2)}(uuid "${escapeString(text.uuid)}")
`;
        result += `${indentString(level + 1)})
`;
      } else if (drawing.type === "text_box") {
        const textbox = drawing;
        result += `${indentString(level + 1)}(text_box "${escapeString(textbox.text)}" ${serializeAt(textbox.at, 0, true)} (size ${textbox.size.x} ${textbox.size.y})
`;
        if (textbox.exclude_from_sim !== void 0)
          result += `${indentString(level + 2)}(exclude_from_sim ${textbox.exclude_from_sim ? "yes" : "no"})
`;
        if (textbox.margins)
          result += `${indentString(level + 2)}(margins ${textbox.margins.x} ${textbox.margins.y} ${textbox.margins.z} ${textbox.margins.w})
`;
        result += `${indentString(level + 2)}${serializeEffects(textbox.effects, level + 2)}
`;
        if (textbox.stroke)
          result += `${indentString(level + 2)}${serializeStroke(textbox.stroke, level + 2)}
`;
        if (textbox.fill) result += `${indentString(level + 2)}${serializeFill(textbox.fill, level + 2)}
`;
        if (textbox.uuid) result += `${indentString(level + 2)}(uuid "${escapeString(textbox.uuid)}")
`;
        result += `${indentString(level + 1)})
`;
      }
    }
  }
  if (symbol.pins && symbol.pins.length > 0) {
    for (const pin of symbol.pins) {
      result += serializePin(pin, level + 1) + "\n";
    }
  }
  if (symbol.embedded_fonts !== void 0) result += `${indentString(level + 1)}(embedded_fonts ${symbol.embedded_fonts ? "yes" : "no"})
`;
  if (symbol.embedded_files)
    result += `${indentString(level + 1)}(embedded_files "${escapeString(symbol.embedded_files)}")
`;
  result += `${indent})
`;
  return result;
}
function serializeWire(wire) {
  let result = "(wire (pts";
  for (const pt of wire.pts) {
    result += ` (xy ${formatDouble(pt.x)} ${formatDouble(pt.y)})`;
  }
  result += ")";
  result += ` ${serializeStroke(wire.stroke)}`;
  result += ` (uuid "${escapeString(wire.uuid)}")`;
  result += ")";
  return result;
}
function serializeBus(bus) {
  let result = "(bus (pts";
  for (const pt of bus.pts) {
    result += ` (xy ${formatDouble(pt.x)} ${formatDouble(pt.y)})`;
  }
  result += ")";
  result += ` ${serializeStroke(bus.stroke)}`;
  result += ` (uuid "${escapeString(bus.uuid)}")`;
  result += ")";
  return result;
}
function serializeBusEntry(busEntry) {
  let result = `(bus_entry `;
  if (busEntry.at) {
    const x = busEntry.at.position?.x || 0;
    const y = busEntry.at.position?.y || 0;
    result += `(at ${formatDouble(x)} ${formatDouble(y)})`;
  } else {
    result += `(at 0 0)`;
  }
  result += ` (size ${formatDouble(busEntry.size.x)} ${formatDouble(busEntry.size.y)})`;
  result += ` ${serializeStroke(busEntry.stroke)}`;
  result += ` (uuid "${escapeString(busEntry.uuid)}")`;
  result += ")";
  return result;
}
function serializeBusAlias(busAlias) {
  let members = "";
  if (busAlias.members && Array.isArray(busAlias.members)) {
    for (const member of busAlias.members) {
      if (members.length > 0) {
        members += " ";
      }
      members += `"${escapeString(member)}"`;
    }
  }
  return `(bus_alias "${escapeString(busAlias.name)}" (members ${members}))`;
}
function serializeJunction(junction) {
  let result = `(junction `;
  if (junction.at) {
    const x = junction.at.position?.x || 0;
    const y = junction.at.position?.y || 0;
    result += `(at ${formatDouble(x)} ${formatDouble(y)})`;
  } else {
    result += `(at 0 0)`;
  }
  if (junction.diameter !== void 0) result += ` (diameter ${formatDouble(junction.diameter)})`;
  if (junction.color) {
    result += ` (color ${Math.round(junction.color.r * 255)} ${Math.round(junction.color.g * 255)} ${Math.round(junction.color.b * 255)} ${formatColorAlpha(junction.color.a)})`;
  }
  result += ` (uuid "${escapeString(junction.uuid)}")`;
  result += ")";
  return result;
}
function serializeNoConnect(noConnect) {
  let result = `(no_connect `;
  if (noConnect.at) {
    const x = noConnect.at.position?.x || 0;
    const y = noConnect.at.position?.y || 0;
    result += `(at ${formatDouble(x)} ${formatDouble(y)})`;
  } else {
    result += `(at 0 0)`;
  }
  result += ` (uuid "${escapeString(noConnect.uuid)}")`;
  result += ")";
  return result;
}
function serializeNetLabel(label) {
  let result = `(label "${escapeString(label.text)}" ${serializeAt(label.at, 0, true)} ${serializeEffects(label.effects)}`;
  result += serializeFlag("fields_autoplaced", label.fields_autoplaced);
  if (label.uuid) result += ` (uuid "${escapeString(label.uuid)}")`;
  result += ")";
  return result;
}
function serializeGlobalLabel(label) {
  let result = `(global_label "${escapeString(label.text)}" ${serializeAt(label.at, 0, true)} ${serializeEffects(label.effects)}`;
  result += serializeFlag("fields_autoplaced", label.fields_autoplaced);
  if (label.uuid) result += ` (uuid "${escapeString(label.uuid)}")`;
  result += ` (shape ${label.shape})`;
  if (label.properties && label.properties.length > 0) {
    for (const property of label.properties) {
      result += ` ${serializeProperty(property)}`;
    }
  }
  result += ")";
  return result;
}
function serializeHierarchicalLabel(label) {
  let result = `(hierarchical_label "${escapeString(label.text)}" ${serializeAt(label.at, 0, true)} ${serializeEffects(label.effects)}`;
  result += serializeFlag("fields_autoplaced", label.fields_autoplaced);
  if (label.uuid) result += ` (uuid "${escapeString(label.uuid)}")`;
  result += ` (shape ${label.shape})`;
  result += ")";
  return result;
}
function serializePinInstance(pin) {
  let result = "(pin ";
  const pinTypes = ["input", "output", "bidirectional", "tri_state", "passive", "dot", "round", "diamond", "rectangle", "power_in", "power_out", "open_collector", "open_emitter"];
  if (pin.number !== void 0 && pin.number !== null) {
    if (pin.number.trim() !== "" && !pinTypes.includes(pin.number)) {
      result += `"${escapeString(pin.number)}"`;
    } else if (pin.number.trim() !== "" && pinTypes.includes(pin.number)) {
      result += pin.number;
    } else {
      result += `""`;
    }
  } else {
    result += "power_in";
  }
  result += ` (uuid "${escapeString(pin.uuid)}")`;
  if (pin.alternate)
    result += ` (alternate "${escapeString(pin.alternate)}")`;
  result += ")";
  return result;
}
function serializeSchematicSymbol(symbol, level = 0) {
  const indent = indentString(level);
  let result = `${indent}(symbol
`;
  if (symbol.lib_name)
    result += `${indentString(level + 1)}(lib_name "${escapeString(symbol.lib_name)}")
`;
  result += `${indentString(level + 1)}(lib_id "${escapeString(symbol.lib_id)}")
`;
  result += `${indentString(level + 1)}${serializeAt(symbol.at, 0, true)}
`;
  if (symbol.mirror) result += `${indentString(level + 1)}(mirror ${symbol.mirror})
`;
  result += `${indentString(level + 1)}(unit ${symbol.unit || 1})
`;
  if (symbol.exclude_from_sim !== void 0) result += `${indentString(level + 1)}(exclude_from_sim ${symbol.exclude_from_sim ? "yes" : "no"})
`;
  if (symbol.in_bom !== void 0) {
    result += `${indentString(level + 1)}(in_bom ${symbol.in_bom ? "yes" : "no"})
`;
  }
  if (symbol.on_board !== void 0) {
    result += `${indentString(level + 1)}(on_board ${symbol.on_board ? "yes" : "no"})
`;
  }
  if (symbol.dnp !== void 0) result += `${indentString(level + 1)}(dnp ${symbol.dnp ? "yes" : "no"})
`;
  const body_style = symbol.body_style ?? symbol.convert;
  if (typeof body_style !== "undefined" && body_style !== null) {
    const token = typeof symbol.body_style !== "undefined" && symbol.body_style !== null ? "body_style" : "convert";
    result += `${indentString(level + 1)}(${token} ${body_style})
`;
  }
  if (symbol.fields_autoplaced) {
    result += `${indentString(level + 1)}(fields_autoplaced yes)
`;
  }
  result += `${indentString(level + 1)}(uuid "${escapeString(symbol.uuid)}")
`;
  if (symbol.properties && symbol.properties.length > 0) {
    for (const property of symbol.properties) {
      result += `${serializeProperty(property, level + 1)}
`;
    }
  }
  if (symbol.pins && symbol.pins.length > 0) {
    for (const pin of symbol.pins) {
      result += `${indentString(level + 1)}${serializePinInstance(pin)}
`;
    }
  }
  if (symbol.default_instance) {
    const hasReference = symbol.default_instance.reference && symbol.default_instance.reference.trim() !== "";
    const hasUnit = symbol.default_instance.unit !== void 0 && symbol.default_instance.unit !== null;
    const hasValue = symbol.default_instance.value && symbol.default_instance.value.trim() !== "";
    const hasFootprint = symbol.default_instance.footprint && symbol.default_instance.footprint.trim() !== "";
    if (hasReference || hasUnit || hasValue || hasFootprint) {
      result += `${indentString(level + 1)}(default_instance
`;
      if (hasReference) {
        result += `${indentString(level + 2)}(reference "${escapeString(symbol.default_instance.reference)}")
`;
      }
      if (hasUnit) {
        const unitValue = symbol.default_instance.unit !== void 0 && symbol.default_instance.unit !== null ? symbol.default_instance.unit : 1;
        result += `${indentString(level + 2)}(unit ${unitValue})
`;
      }
      if (hasValue) {
        result += `${indentString(level + 2)}(value "${escapeString(symbol.default_instance.value)}")
`;
      }
      if (hasFootprint) {
        result += `${indentString(level + 2)}(footprint "${escapeString(symbol.default_instance.footprint)}")
`;
      }
      result += `${indentString(level + 1)})
`;
    }
  }
  if (symbol.instances) {
    result += `${indentString(level + 1)}(instances
`;
    if (symbol.instances.projects && symbol.instances.projects.length > 0) {
      for (const project of symbol.instances.projects) {
        result += `${indentString(level + 2)}(project "${escapeString(project.name)}"
`;
        if (project.paths && project.paths.length > 0) {
          for (const path of project.paths) {
            result += `${indentString(level + 3)}(path "${escapeString(path.path)}"
`;
            if (path.reference)
              result += `${indentString(level + 4)}(reference "${escapeString(path.reference)}")
`;
            if (path.value)
              result += `${indentString(level + 4)}(value "${escapeString(path.value)}")
`;
            if (path.unit) result += `${indentString(level + 4)}(unit ${path.unit})
`;
            if (path.footprint)
              result += `${indentString(level + 4)}(footprint "${escapeString(path.footprint)}")
`;
            result += `${indentString(level + 3)})
`;
          }
        }
        result += `${indentString(level + 2)})
`;
      }
    }
    result += `${indentString(level + 1)})
`;
  }
  result += `${indent})
`;
  return result;
}
function serializeSheetPin(pin) {
  let result = `(pin "${escapeString(pin.name)}" ${pin.shape} ${serializeAt(pin.at, 0, true)} ${serializeEffects(pin.effects)}`;
  result += ` (uuid "${escapeString(pin.uuid)}")`;
  result += ")";
  return result;
}
function serializeSchematicSheet(sheet, level = 0) {
  const indent = indentString(level);
  const sizeX = sheet.size?.x || 0;
  const sizeY = sheet.size?.y || 0;
  let result = `${indent}(sheet
`;
  result += `${indentString(level + 1)}${serializeAt(sheet.at)}
`;
  result += `${indentString(level + 1)}(size ${formatDouble(sizeX)} ${formatDouble(sizeY)})
`;
  if (sheet.exclude_from_sim !== void 0) {
    result += `${indentString(level + 1)}(exclude_from_sim ${sheet.exclude_from_sim ? "yes" : "no"})
`;
  }
  if (sheet.in_bom !== void 0) {
    result += `${indentString(level + 1)}(in_bom ${sheet.in_bom ? "yes" : "no"})
`;
  }
  if (sheet.on_board !== void 0) {
    result += `${indentString(level + 1)}(on_board ${sheet.on_board ? "yes" : "no"})
`;
  }
  if (sheet.dnp !== void 0) {
    result += `${indentString(level + 1)}(dnp ${sheet.dnp ? "yes" : "no"})
`;
  }
  if (sheet.fields_autoplaced) {
    result += `${indentString(level + 1)}(fields_autoplaced yes)
`;
  }
  result += `${indentString(level + 1)}${serializeStroke(sheet.stroke)}
`;
  const fillStr = serializeFill(sheet.fill);
  if (fillStr) result += `${indentString(level + 1)}${fillStr}
`;
  result += `${indentString(level + 1)}(uuid "${escapeString(sheet.uuid)}")
`;
  if (sheet.properties && sheet.properties.length > 0) {
    for (const property of sheet.properties) {
      result += `${indentString(level + 1)}${serializeProperty(property)}
`;
    }
  }
  if (sheet.pins && sheet.pins.length > 0) {
    for (const pin of sheet.pins) {
      result += `${indentString(level + 1)}${serializeSheetPin(pin)}
`;
    }
  }
  if (sheet.instances) {
    result += `${indentString(level + 1)}(instances
`;
    if (sheet.instances.projects && sheet.instances.projects.length > 0) {
      for (const project of sheet.instances.projects) {
        result += `${indentString(level + 2)}(project "${escapeString(project.name)}"
`;
        if (project.paths && project.paths.length > 0) {
          for (const path of project.paths) {
            result += `${indentString(level + 3)}(path "${escapeString(path.path)}"
`;
            if (path.page)
              result += `${indentString(level + 4)}(page "${escapeString(path.page)}")
`;
            result += `${indentString(level + 3)})
`;
          }
        }
        result += `${indentString(level + 2)})
`;
      }
    }
    result += `${indentString(level + 1)})
`;
  }
  result += `${indent})
`;
  return result;
}
function serializeTableCell(cell, level) {
  const indent = indentString(level);
  const indent2 = indentString(level + 1);
  let result = `${indent}(table_cell "${escapeString(cell.text)}"`;
  if (cell.exclude_from_sim !== void 0) {
    result += ` (exclude_from_sim ${cell.exclude_from_sim ? "yes" : "no"})`;
  }
  result += `
${indent2}${serializeAt(cell.at, 0, true)}`;
  result += `
${indent2}(size ${formatDouble(cell.size.x)} ${formatDouble(cell.size.y)})`;
  if (cell.margins) {
    result += `
${indent2}(margins ${formatDouble(cell.margins.x)} ${formatDouble(cell.margins.y)} ${formatDouble(cell.margins.z)} ${formatDouble(cell.margins.w)})`;
  }
  if (cell.span) {
    result += `
${indent2}(span ${cell.span.rows} ${cell.span.cols})`;
  }
  if (cell.stroke) {
    result += `
${indent2}${serializeStroke(cell.stroke, level + 1)}`;
  }
  if (cell.fill) {
    result += `
${indent2}${serializeFill(cell.fill, level + 1)}`;
  }
  result += `
${indent2}${serializeEffects(cell.effects, level + 1)}`;
  if (cell.uuid) {
    result += `
${indent2}(uuid "${escapeString(cell.uuid)}")`;
  }
  result += `
${indent})`;
  return result;
}
function serializeTable(table, level) {
  const indent = indentString(level);
  const indent2 = indentString(level + 1);
  let result = `${indent}(table
`;
  result += `${indent2}(column_count ${table.column_count})
`;
  if (table.border) {
    result += `${indent2}(border
`;
    if (table.border.external !== void 0) {
      result += `${indentString(level + 2)}(external ${table.border.external ? "yes" : "no"})
`;
    }
    if (table.border.header !== void 0) {
      result += `${indentString(level + 2)}(header ${table.border.header ? "yes" : "no"})
`;
    }
    if (table.border.stroke) {
      result += `${indentString(level + 2)}${serializeStroke(table.border.stroke, level + 2)}
`;
    }
    result += `${indent2})
`;
  }
  if (table.separators) {
    result += `${indent2}(separators
`;
    if (table.separators.rows !== void 0) {
      result += `${indentString(level + 2)}(rows ${table.separators.rows ? "yes" : "no"})
`;
    }
    if (table.separators.cols !== void 0) {
      result += `${indentString(level + 2)}(cols ${table.separators.cols ? "yes" : "no"})
`;
    }
    if (table.separators.stroke) {
      result += `${indentString(level + 2)}${serializeStroke(table.separators.stroke, level + 2)}
`;
    }
    result += `${indent2})
`;
  }
  if (table.column_widths && table.column_widths.length > 0) {
    result += `${indent2}(column_widths ${table.column_widths.map((w) => formatDouble(w)).join(" ")})
`;
  }
  if (table.row_heights && table.row_heights.length > 0) {
    result += `${indent2}(row_heights ${table.row_heights.map((h) => formatDouble(h)).join(" ")})
`;
  }
  if (table.uuid) {
    result += `${indent2}(uuid "${escapeString(table.uuid)}")
`;
  }
  if (table.cells && table.cells.length > 0) {
    result += `${indent2}(cells
`;
    for (const cell of table.cells) {
      result += `${serializeTableCell(cell, level + 2)}
`;
    }
    result += `${indent2})
`;
  }
  result += `${indent})`;
  return result;
}
function indentString(level) {
  return "	".repeat(level);
}
function serializeSchematic(schematic) {
  let result = "(kicad_sch\n";
  const indent = 1;
  result += `${indentString(indent)}(version ${schematic.version || 20231129})
`;
  if (schematic.generator)
    result += `${indentString(indent)}(generator "${escapeString(schematic.generator)}")
`;
  if (schematic.generator_version)
    result += `${indentString(indent)}(generator_version "${escapeString(schematic.generator_version)}")
`;
  if (schematic.uuid)
    result += `${indentString(indent)}(uuid "${escapeString(schematic.uuid)}")
`;
  if (schematic.paper) result += `${indentString(indent)}${serializePaper(schematic.paper)}
`;
  if (schematic.title_block)
    result += `${serializeTitleBlock(schematic.title_block, indent)}
`;
  if (schematic.lib_symbols) {
    result += `${indentString(indent)}(lib_symbols
`;
    for (const symbol of schematic.lib_symbols) {
      result += serializeLibSymbol(symbol, indent + 1);
    }
    result += `${indentString(indent)})
`;
  }
  if (schematic.wires && schematic.wires.length > 0) {
    for (const wire of schematic.wires) {
      result += `${indentString(indent)}${serializeWire(wire)}
`;
    }
  }
  if (schematic.buses && schematic.buses.length > 0) {
    for (const bus of schematic.buses) {
      result += `${indentString(indent)}${serializeBus(bus)}
`;
    }
  }
  if (schematic.bus_entries && schematic.bus_entries.length > 0) {
    for (const busEntry of schematic.bus_entries) {
      result += `${indentString(indent)}${serializeBusEntry(busEntry)}
`;
    }
  }
  if (schematic.bus_aliases && schematic.bus_aliases.length > 0) {
    for (const busAlias of schematic.bus_aliases) {
      result += `${indentString(indent)}${serializeBusAlias(busAlias)}
`;
    }
  }
  if (schematic.junctions && schematic.junctions.length > 0) {
    for (const junction of schematic.junctions) {
      result += `${indentString(indent)}${serializeJunction(junction)}
`;
    }
  }
  if (schematic.no_connects && schematic.no_connects.length > 0) {
    for (const noConnect of schematic.no_connects) {
      result += `${indentString(indent)}${serializeNoConnect(noConnect)}
`;
    }
  }
  if (schematic.net_labels && schematic.net_labels.length > 0) {
    for (const label of schematic.net_labels) {
      result += `${indentString(indent)}${serializeNetLabel(label)}
`;
    }
  }
  if (schematic.global_labels && schematic.global_labels.length > 0) {
    for (const label of schematic.global_labels) {
      result += `${indentString(indent)}${serializeGlobalLabel(label)}
`;
    }
  }
  if (schematic.hierarchical_labels && schematic.hierarchical_labels.length > 0) {
    for (const label of schematic.hierarchical_labels) {
      result += `${indentString(indent)}${serializeHierarchicalLabel(label)}
`;
    }
  }
  if (schematic.symbols && schematic.symbols.length > 0) {
    for (const symbol of schematic.symbols) {
      result += serializeSchematicSymbol(symbol, indent);
    }
  }
  if (schematic.drawings && schematic.drawings.length > 0) {
    for (const drawing of schematic.drawings) {
      if (drawing.type === "arc") {
        const arc = drawing;
        result += `${indentString(indent)}(arc (start ${formatDouble(arc.start.x)} ${formatDouble(arc.start.y)})`;
        if (arc.mid) {
          result += ` (mid ${formatDouble(arc.mid.x)} ${formatDouble(arc.mid.y)})`;
        }
        result += ` (end ${formatDouble(arc.end.x)} ${formatDouble(arc.end.y)})`;
        if (arc.radius) {
          result += ` (radius (xy ${formatDouble(arc.radius.at.x)} ${formatDouble(arc.radius.at.y)}) (length ${formatDouble(arc.radius.length)}) (angles ${formatDouble(arc.radius.angles.x)} ${formatDouble(arc.radius.angles.y)}))`;
        }
        if (arc.stroke) result += ` ${serializeStroke(arc.stroke)}`;
        if (arc.fill) result += ` ${serializeFill(arc.fill)}`;
        if (arc.uuid) result += ` (uuid "${escapeString(arc.uuid)}")`;
        result += `)
`;
      } else if (drawing.type === "bezier") {
        const bezier = drawing;
        result += `${indentString(indent)}(bezier (pts`;
        for (const pt of bezier.pts) {
          result += ` (xy ${formatDouble(pt.x)} ${formatDouble(pt.y)})`;
        }
        result += `)`;
        if (bezier.stroke)
          result += ` ${serializeStroke(bezier.stroke)}`;
        if (bezier.fill) result += ` ${serializeFill(bezier.fill)}`;
        if (bezier.uuid) result += ` (uuid "${escapeString(bezier.uuid)}")`;
        result += `)
`;
      } else if (drawing.type === "circle") {
        const circle = drawing;
        result += `${indentString(indent)}(circle (center ${formatDouble(circle.center.x)} ${formatDouble(circle.center.y)}) (radius ${formatDouble(circle.radius)})`;
        if (circle.stroke)
          result += ` ${serializeStroke(circle.stroke)}`;
        if (circle.fill) result += ` ${serializeFill(circle.fill)}`;
        if (circle.uuid) result += ` (uuid "${escapeString(circle.uuid)}")`;
        result += `)
`;
      } else if (drawing.type === "polyline") {
        const polyline = drawing;
        result += `${indentString(indent)}(polyline (pts`;
        for (const pt of polyline.pts) {
          result += ` (xy ${formatDouble(pt.x)} ${formatDouble(pt.y)})`;
        }
        result += `)`;
        if (polyline.stroke)
          result += ` ${serializeStroke(polyline.stroke)}`;
        if (polyline.fill) result += ` ${serializeFill(polyline.fill)}`;
        if (polyline.uuid) result += ` (uuid "${escapeString(polyline.uuid)}")`;
        result += `)
`;
      } else if (drawing.type === "rectangle") {
        const rectangle = drawing;
        result += `${indentString(indent)}(rectangle (start ${formatDouble(rectangle.start.x)} ${formatDouble(rectangle.start.y)}) (end ${formatDouble(rectangle.end.x)} ${formatDouble(rectangle.end.y)})`;
        if (rectangle.stroke)
          result += ` ${serializeStroke(rectangle.stroke)}`;
        if (rectangle.fill)
          result += ` ${serializeFill(rectangle.fill)}`;
        if (rectangle.uuid) result += ` (uuid "${escapeString(rectangle.uuid)}")`;
        result += `)
`;
      } else if (drawing.type === "text") {
        const text = drawing;
        result += `${indentString(indent)}(text "${escapeString(text.text)}"`;
        if (text.exclude_from_sim != null) {
          result += ` (exclude_from_sim ${text.exclude_from_sim ? "yes" : "no"})`;
        }
        result += ` ${serializeAt(text.at, 0, true)} ${serializeEffects(text.effects)}`;
        if (text.uuid) result += ` (uuid "${escapeString(text.uuid)}")`;
        result += `)
`;
      } else if (drawing.type === "text_box") {
        const textbox = drawing;
        result += `${indentString(indent)}(text_box "${escapeString(textbox.text)}" ${serializeAt(textbox.at, 0, true)} (size ${formatDouble(textbox.size.x)} ${formatDouble(textbox.size.y)})`;
        if (textbox.exclude_from_sim !== void 0)
          result += ` (exclude_from_sim ${textbox.exclude_from_sim ? "yes" : "no"})`;
        if (textbox.margins)
          result += ` (margins ${formatDouble(textbox.margins.x)} ${formatDouble(textbox.margins.y)} ${formatDouble(textbox.margins.z)} ${formatDouble(textbox.margins.w)})`;
        result += ` ${serializeEffects(textbox.effects)}`;
        if (textbox.stroke)
          result += ` ${serializeStroke(textbox.stroke)}`;
        if (textbox.fill) result += ` ${serializeFill(textbox.fill)}`;
        if (textbox.uuid) result += ` (uuid "${escapeString(textbox.uuid)}")`;
        result += `)
`;
      }
    }
  }
  if (schematic.images && schematic.images.length > 0) {
    for (const image of schematic.images) {
      const chunkSize = 76;
      const chunks = [];
      for (let i = 0; i < image.data.length; i += chunkSize) {
        chunks.push(image.data.slice(i, i + chunkSize));
      }
      result += `${indentString(indent)}(image
`;
      result += `${indentString(indent + 1)}${serializeAt(image.at)}
`;
      result += `${indentString(indent + 1)}(data ${chunks.join(" ")})
`;
      result += `${indentString(indent + 1)}(scale ${formatDouble(image.scale)})
`;
      if (image.uuid) {
        result += `${indentString(indent + 1)}(uuid "${escapeString(image.uuid)}")
`;
      }
      result += `${indentString(indent)})
`;
    }
  }
  if (schematic.tables && schematic.tables.length > 0) {
    for (const table of schematic.tables) {
      result += `${serializeTable(table, indent)}
`;
    }
  }
  if (schematic.sheets && schematic.sheets.length > 0) {
    for (const sheet of schematic.sheets) {
      result += serializeSchematicSheet(sheet, indent);
    }
  }
  if (schematic.sheet_instances && schematic.sheet_instances.length > 0) {
    result += `${indentString(indent)}(sheet_instances
`;
    for (const instance of schematic.sheet_instances) {
      result += `${indentString(indent + 1)}(path "${escapeString(instance.path)}"`;
      if (instance.page)
        result += ` (page "${escapeString(instance.page)}")`;
      result += `)
`;
    }
    result += `${indentString(indent)})
`;
  }
  if (schematic.symbol_instances && schematic.symbol_instances.length > 0) {
    result += `${indentString(indent)}(symbol_instances
`;
    for (const instance of schematic.symbol_instances) {
      result += `${indentString(indent + 1)}(path "${escapeString(instance.path)}" (reference "${escapeString(instance.reference)}") (unit ${instance.unit}) (value "${escapeString(instance.value)}") (footprint "${escapeString(instance.footprint)}"))
`;
    }
    result += `${indentString(indent)})
`;
  }
  if (schematic.embedded_fonts !== void 0) {
    result += `${indentString(indent)}(embedded_fonts ${schematic.embedded_fonts ? "yes" : "no"})
`;
  }
  result += `)
`;
  return result;
}

// src/schematic_parser.ts
function parseFill(expr) {
  const parsed = parse_expr(
    expr,
    P.start("fill"),
    P.color(),
    P.pair("type", T.string)
  );
  return {
    type: parsed.type || "none",
    color: parsed.color
  };
}
function parseWire(expr) {
  return parse_expr(
    expr,
    P.start("wire"),
    P.list("pts", T.vec2),
    P.item("stroke", parseStroke),
    P.pair("uuid", T.string)
  );
}
function parseBus(expr) {
  return parse_expr(
    expr,
    P.start("bus"),
    P.list("pts", T.vec2),
    P.item("stroke", parseStroke),
    P.pair("uuid", T.string)
  );
}
function parseBusEntry(expr) {
  return parse_expr(
    expr,
    P.start("bus_entry"),
    P.item("at", parseAt),
    P.vec2("size"),
    P.item("stroke", parseStroke),
    P.pair("uuid", T.string)
  );
}
function parseBusAlias(expr) {
  return parse_expr(
    expr,
    P.start("bus_alias"),
    P.positional("name", T.string),
    P.item("members", (e) => {
      if (Array.isArray(e) && e.length > 1) {
        return e.slice(1).map((member) => {
          if (typeof member === "string") {
            return member;
          }
          return "";
        });
      }
      return [];
    })
  );
}
function parseJunction(expr) {
  return parse_expr(
    expr,
    P.start("junction"),
    P.item("at", parseAt),
    P.pair("diameter", T.number),
    P.color(),
    P.pair("uuid", T.string)
  );
}
function parseNoConnect(expr) {
  return parse_expr(
    expr,
    P.start("no_connect"),
    P.item("at", parseAt),
    P.pair("uuid", T.string)
  );
}
function parsePolyline(expr) {
  const parsed = parse_expr(
    expr,
    P.start("polyline"),
    P.list("pts", T.vec2),
    P.item("stroke", parseStroke),
    P.item("fill", parseFill),
    P.pair("uuid", T.string)
  );
  return { ...parsed, type: "polyline" };
}
function parseCenterOrStartOrEnd(expr, name) {
  if (Array.isArray(expr)) {
    if (expr.length >= 2 && Array.isArray(expr[1]) && expr[1][0] === "xy") {
      return parse_expr(expr, P.start(name), P.vec2("xy"))["xy"];
    } else if (expr.length >= 3 && typeof expr[1] === "number" && typeof expr[2] === "number") {
      return { x: expr[1], y: expr[2] };
    }
  }
  return { x: 0, y: 0 };
}
function parseRectangle(expr) {
  const parsed = parse_expr(
    expr,
    P.start("rectangle"),
    P.item("start", (e) => parseCenterOrStartOrEnd(e, "start")),
    P.item("end", (e) => parseCenterOrStartOrEnd(e, "end")),
    P.item("stroke", parseStroke),
    P.item("fill", parseFill),
    P.pair("uuid", T.string)
  );
  return { ...parsed, type: "rectangle" };
}
function parseCircle2(expr) {
  const parsed = parse_expr(
    expr,
    P.start("circle"),
    P.item("center", (e) => parseCenterOrStartOrEnd(e, "center")),
    P.pair("radius", T.number),
    P.item("stroke", parseStroke),
    P.item("fill", parseFill),
    P.pair("uuid", T.string)
  );
  return { ...parsed, type: "circle" };
}
function parseArc2(expr) {
  const parsed = parse_expr(
    expr,
    P.start("arc"),
    P.item("start", (e) => parseCenterOrStartOrEnd(e, "start")),
    P.item("mid", (e) => parseCenterOrStartOrEnd(e, "mid")),
    P.item("end", (e) => parseCenterOrStartOrEnd(e, "end")),
    P.object(
      "radius",
      {},
      P.start("radius"),
      P.item("at", (e) => parseCenterOrStartOrEnd(e, "at")),
      P.pair("length"),
      P.item("angles", (e) => parseCenterOrStartOrEnd(e, "angles"))
    ),
    P.item("stroke", parseStroke),
    P.item("fill", parseFill),
    P.pair("uuid", T.string)
  );
  return { ...parsed, type: "arc" };
}
function parseBezier(expr) {
  const parsed = parse_expr(
    expr,
    P.start("bezier"),
    P.list("pts", T.vec2),
    P.item("stroke", parseStroke),
    P.item("fill", parseFill),
    P.pair("uuid", T.string)
  );
  return { ...parsed, type: "bezier" };
}
function parseText(expr) {
  const parsed = parse_expr(
    expr,
    P.start("text"),
    P.positional("text", T.string),
    P.item("at", parseAt),
    P.item("effects", parseEffects),
    P.pair("exclude_from_sim", T.boolean),
    P.pair("uuid", T.string)
  );
  return { ...parsed, type: "text" };
}
function parseTextBox(expr) {
  const parsed = parse_expr(
    expr,
    P.start("text_box"),
    P.positional("text", T.string),
    P.item("at", parseAt),
    P.vec2("size"),
    P.item("effects", parseEffects),
    P.item("stroke", parseStroke),
    P.item("fill", parseFill),
    P.pair("exclude_from_sim", T.boolean),
    P.vec4("margins"),
    P.pair("uuid", T.string)
  );
  return { ...parsed, type: "text_box" };
}
function parseImage(expr) {
  let data = "";
  for (const it of expr) {
    if (Array.isArray(it) && it.length && it[0] === "data") {
      data = it.slice(1).join("");
      break;
    }
  }
  const parsed = parse_expr(
    expr,
    P.start("image"),
    P.item("at", parseAt),
    P.pair("scale", T.number),
    P.pair("uuid", T.string)
  );
  return {
    ...parsed,
    data,
    ppi: null,
    scale: typeof parsed["scale"] === "number" ? parsed["scale"] : 1
  };
}
function parseTableCell(expr) {
  const parsed = parse_expr(
    expr,
    P.start("table_cell"),
    P.positional("text", T.string),
    P.item("at", parseAt),
    P.vec2("size"),
    P.vec4("margins"),
    P.item("effects", parseEffects),
    P.item("fill", parseFill),
    P.item("stroke", parseStroke),
    P.pair("exclude_from_sim", T.boolean),
    P.pair("uuid", T.string),
    P.expr("span", (obj, name, e) => {
      if (Array.isArray(e) && e[0] === "span") {
        return { rows: e[1], cols: e[2] };
      }
      return void 0;
    })
  );
  return {
    text: parsed.text || "",
    at: parsed.at,
    size: parsed.size,
    margins: parsed.margins,
    span: parsed.span,
    stroke: parsed.stroke,
    fill: parsed.fill,
    effects: parsed.effects,
    exclude_from_sim: parsed.exclude_from_sim,
    uuid: parsed.uuid
  };
}
function parseTable(expr) {
  const parsed = parse_expr(
    expr,
    P.start("table"),
    P.pair("column_count", T.number),
    P.object(
      "border",
      {},
      P.start("border"),
      P.pair("external", T.boolean),
      P.pair("header", T.boolean),
      P.item("stroke", parseStroke)
    ),
    P.object(
      "separators",
      {},
      P.start("separators"),
      P.pair("rows", T.boolean),
      P.pair("cols", T.boolean),
      P.item("stroke", parseStroke)
    ),
    P.list("column_widths", T.number),
    P.list("row_heights", T.number),
    P.pair("uuid", T.string),
    P.item("cells", (e) => {
      const parsedCells = parse_expr(
        e,
        P.start("cells"),
        P.collection("items", "table_cell", T.item(parseTableCell))
      );
      return parsedCells.items || [];
    })
  );
  return {
    column_count: parsed.column_count,
    border: parsed.border,
    separators: parsed.separators,
    column_widths: parsed.column_widths || [],
    row_heights: parsed.row_heights || [],
    cells: parsed.cells || [],
    uuid: parsed.uuid
  };
}
function parseNetLabel(expr) {
  return parse_expr(
    expr,
    P.start("label"),
    P.positional("text", T.string),
    P.item("at", parseAt),
    P.item("effects", parseEffects),
    P.atom("fields_autoplaced"),
    P.pair("uuid", T.string)
  );
}
function parseProperty(expr) {
  const parsed = parse_expr(
    expr,
    P.start("property"),
    P.positional("name", T.string),
    P.positional("text", T.string),
    P.pair("id", T.number),
    P.item("at", parseAt),
    P.item("effects", parseEffects),
    P.atom("show_name"),
    P.atom("do_not_autoplace"),
    P.atom("hide")
  );
  return {
    name: parsed.name,
    text: parsed.text,
    id: parsed.id || 0,
    at: parsed.at,
    show_name: parsed.show_name || false,
    do_not_autoplace: parsed.do_not_autoplace || false,
    hide: parsed.hide || false,
    effects: parsed.effects
  };
}
function parseGlobalLabel(expr) {
  return parse_expr(
    expr,
    P.start("global_label"),
    P.positional("text", T.string),
    P.item("at", parseAt),
    P.item("effects", parseEffects),
    P.atom("fields_autoplaced"),
    P.pair("uuid", T.string),
    P.pair("shape", T.string),
    P.collection("properties", "property", T.item(parseProperty))
  );
}
function parseHierarchicalLabel(expr) {
  return parse_expr(
    expr,
    P.start("hierarchical_label"),
    P.positional("text", T.string),
    P.item("at", parseAt),
    P.item("effects", parseEffects),
    P.atom("fields_autoplaced"),
    P.pair("uuid", T.string),
    P.pair("shape", T.string)
  );
}
function parsePinAlternate(expr) {
  return parse_expr(
    expr,
    P.start("alternate"),
    P.positional("name", T.string),
    P.positional("type", T.string),
    P.positional("shape", T.string)
  );
}
function parsePin(expr) {
  return parse_expr(
    expr,
    P.start("pin"),
    P.positional("type", T.string),
    P.positional("shape", T.string),
    P.atom("hide"),
    P.item("at", parseAt),
    P.pair("length", T.number),
    P.object(
      "name",
      {},
      P.start("name"),
      P.positional("text", T.string),
      P.item("effects", parseEffects)
    ),
    P.object(
      "number",
      {},
      P.start("number"),
      P.positional("text", T.string),
      P.item("effects", parseEffects)
    ),
    P.collection("alternates", "alternate", T.item(parsePinAlternate))
  );
}
function parsePinInstance(expr) {
  return parse_expr(
    expr,
    P.start("pin"),
    P.positional("number", T.string),
    P.pair("uuid", T.string),
    P.pair("alternate", T.string)
  );
}
function parseLibSymbol(expr) {
  return parse_expr(
    expr,
    P.start("symbol"),
    P.positional("name", T.string),
    P.atom("power"),
    P.object("pin_numbers", {}, P.start("pin_numbers"), P.atom("hide")),
    P.object(
      "pin_names",
      {},
      P.start("pin_names"),
      P.pair("offset", T.number),
      P.atom("hide")
    ),
    P.pair("exclude_from_sim", T.boolean),
    P.pair("in_bom", T.boolean),
    P.pair("embedded_fonts", T.boolean),
    P.pair("embedded_files", T.string),
    // T.any in original, string likely
    P.pair("on_board", T.boolean),
    P.collection("properties", "property", T.item(parseProperty)),
    P.collection("pins", "pin", T.item(parsePin)),
    P.collection("children", "symbol", T.item(parseLibSymbol)),
    // Recursion!
    P.collection("drawings", "arc", T.item(parseArc2)),
    P.collection("drawings", "bezier", T.item(parseBezier)),
    P.collection("drawings", "circle", T.item(parseCircle2)),
    P.collection("drawings", "polyline", T.item(parsePolyline)),
    P.collection("drawings", "rectangle", T.item(parseRectangle)),
    P.collection("drawings", "text", T.item(parseText)),
    P.collection("drawings", "textbox", T.item(parseTextBox))
  );
}
function parseSchematicSymbol(expr) {
  const parsed = parse_expr(
    expr,
    P.start("symbol"),
    P.pair("lib_name", T.string),
    P.pair("lib_id", T.string),
    P.item("at", parseAt),
    P.pair("mirror", T.string),
    P.pair("exclude_from_sim", T.boolean),
    P.pair("unit", T.number),
    // KiCad renamed this token: `convert` is the legacy spelling and
    // `body_style` is what a current KiCad writes. Its own parser accepts
    // both (T_convert and T_body_style share a case in
    // sch_io_kicad_sexpr_parser.cpp), so both are read here. Unmatched
    // tokens are dropped silently by `parse_expr`, which is why reading
    // only `convert` made every modern file look like body style 1.
    P.pair("convert", T.number),
    P.pair("body_style", T.number),
    P.pair("in_bom", T.boolean),
    P.pair("on_board", T.boolean),
    P.pair("dnp", T.boolean),
    P.atom("fields_autoplaced"),
    P.pair("uuid", T.string),
    P.collection("properties", "property", T.item(parseProperty)),
    P.collection("pins", "pin", T.item(parsePinInstance)),
    P.object(
      "default_instance",
      {},
      P.start("default_instance"),
      P.pair("reference", T.string),
      P.pair("unit", T.string),
      P.pair("value", T.string),
      P.pair("footprint", T.string)
    ),
    P.object(
      "instances",
      {},
      P.start("instances"),
      P.collection(
        "projects",
        "project",
        T.object(
          null,
          P.start("project"),
          P.positional("name", T.string),
          P.collection(
            "paths",
            "path",
            T.object(
              null,
              P.start("path"),
              P.positional("path", T.string),
              P.pair("reference", T.string),
              P.pair("value", T.string),
              P.pair("unit", T.number),
              P.pair("footprint", T.string)
            )
          )
        )
      )
    )
  );
  return parsed;
}
function parseSheetPin(expr) {
  return parse_expr(
    expr,
    P.start("pin"),
    P.positional("name", T.string),
    P.positional("shape", T.string),
    P.item("at", parseAt),
    P.item("effects", parseEffects),
    P.pair("uuid", T.string)
  );
}
function parseSchematicSheet(expr) {
  const parsed = parse_expr(
    expr,
    P.start("sheet"),
    P.item("at", parseAt),
    P.vec2("size"),
    P.atom("fields_autoplaced"),
    P.pair("exclude_from_sim", T.boolean),
    P.pair("in_bom", T.boolean),
    P.pair("on_board", T.boolean),
    P.pair("dnp", T.boolean),
    P.item("stroke", parseStroke),
    P.item("fill", parseFill),
    P.pair("uuid", T.string),
    P.collection("properties", "property", T.item(parseProperty)),
    P.collection("pins", "pin", T.item(parseSheetPin)),
    P.object(
      "instances",
      {},
      P.start("instances"),
      P.collection(
        "projects",
        "project",
        T.object(
          null,
          P.start("project"),
          P.positional("name", T.string),
          P.collection(
            "paths",
            "path",
            T.object(
              null,
              P.start("path"),
              P.positional("path", T.string),
              P.pair("page", T.string)
            )
          )
        )
      )
    )
  );
  return {
    at: parsed["at"],
    size: parsed["size"],
    fields_autoplaced: parsed["fields_autoplaced"] || false,
    exclude_from_sim: parsed["exclude_from_sim"] || false,
    in_bom: parsed["in_bom"] || false,
    on_board: parsed["on_board"] || false,
    dnp: parsed["dnp"] || false,
    stroke: parsed["stroke"],
    fill: parsed["fill"],
    properties: parsed["properties"] || [],
    pins: parsed["pins"] || [],
    uuid: parsed["uuid"],
    instances: parsed["instances"] || { projects: [] }
  };
}
function parseSheetInstances(expr) {
  const parsed = parse_expr(
    expr,
    P.start("sheet_instances"),
    P.collection(
      "paths",
      "path",
      T.object(
        null,
        P.start("path"),
        P.positional("path", T.string),
        P.pair("page", T.string)
      )
    )
  );
  return parsed["paths"];
}
function parseSymbolInstances(expr) {
  const parsed = parse_expr(
    expr,
    P.start("symbol_instances"),
    P.collection(
      "paths",
      "path",
      T.object(
        null,
        P.start("path"),
        P.positional("path", T.string),
        P.pair("reference", T.string),
        P.pair("unit", T.number),
        P.pair("value", T.string),
        P.pair("footprint", T.string)
      )
    )
  );
  return parsed["paths"];
}
var SchematicParser = class {
  parse(text) {
    const want_breakdown = isEcadPerfLogEnabled() && text.length > 1e6;
    const t0 = want_breakdown ? performance.now() : 0;
    const expr = listify(text);
    const t1 = want_breakdown ? performance.now() : 0;
    const root = expr.length === 1 && Array.isArray(expr[0]) ? expr[0] : expr;
    const result = parse_expr(
      root,
      P.start("kicad_sch"),
      P.pair("version", T.number),
      P.pair("generator", T.string),
      P.pair("generator_version", T.string),
      P.pair("uuid", T.string),
      P.item("paper", parsePaper),
      P.pair("embedded_fonts", T.boolean),
      P.item("title_block", parseTitleBlock),
      // lib_symbols parsed as collection of symbols inside lib_symbols item
      P.item("lib_symbols", (e) => {
        const parsed = parse_expr(
          e,
          P.start("lib_symbols"),
          P.collection(
            "symbols",
            "symbol",
            T.item(parseLibSymbol)
          )
        );
        return parsed["symbols"] ?? [];
      }),
      P.collection("wires", "wire", T.item(parseWire)),
      P.collection("buses", "bus", T.item(parseBus)),
      P.collection("bus_entries", "bus_entry", T.item(parseBusEntry)),
      P.collection("bus_aliases", "bus_alias", T.item(parseBusAlias)),
      P.collection("junctions", "junction", T.item(parseJunction)),
      P.collection("no_connects", "no_connect", T.item(parseNoConnect)),
      P.collection("net_labels", "label", T.item(parseNetLabel)),
      P.collection(
        "global_labels",
        "global_label",
        T.item(parseGlobalLabel)
      ),
      P.collection(
        "hierarchical_labels",
        "hierarchical_label",
        T.item(parseHierarchicalLabel)
      ),
      P.collection("symbols", "symbol", T.item(parseSchematicSymbol)),
      P.collection("drawings", "polyline", T.item(parsePolyline)),
      P.collection("drawings", "rectangle", T.item(parseRectangle)),
      P.collection("drawings", "arc", T.item(parseArc2)),
      P.collection("drawings", "text", T.item(parseText)),
      P.collection("drawings", "bezier", T.item(parseBezier)),
      P.collection("drawings", "text_box", T.item(parseTextBox)),
      P.collection("drawings", "circle", T.item(parseCircle2)),
      P.collection("images", "image", T.item(parseImage)),
      P.collection("tables", "table", T.item(parseTable)),
      P.item("sheet_instances", parseSheetInstances),
      P.item("symbol_instances", parseSymbolInstances),
      P.collection("sheets", "sheet", T.item(parseSchematicSheet))
    );
    if (want_breakdown) {
      const t2 = performance.now();
      ecadPerfLog(
        `SCH breakdown  ${(text.length / 1048576).toFixed(1)}MB  listify=${(t1 - t0).toFixed(0)}ms  parse_expr=${(t2 - t1).toFixed(0)}ms`
      );
    }
    return result;
  }
  save(schematic) {
    return serializeSchematic(schematic);
  }
  parseLibSymbols(text) {
    const expr = listify(text);
    const root = expr.length === 1 && Array.isArray(expr[0]) ? expr[0] : expr;
    const parsed = parse_expr(
      root,
      P.start("kicad_symbol_lib"),
      P.pair("version", T.number),
      P.pair("generator", T.string),
      P.pair("generator_version", T.string),
      P.collection("symbols", "symbol", T.item(parseLibSymbol))
    );
    return parsed["symbols"] ?? [];
  }
  saveLibSymbols(libSymbols) {
    let result = "(kicad_symbol_lib\n";
    const indent = 1;
    result += `${"	".repeat(indent)}(version 20251024)
`;
    result += `${"	".repeat(indent)}(generator "kicad_symbol_editor")
`;
    result += `${"	".repeat(indent)}(generator_version "10.0")
`;
    for (const symbol of libSymbols) {
      result += serializeLibSymbol(symbol, indent);
    }
    result += `)
`;
    return result;
  }
};

// src/proto/drawing-sheet.ts
var drawing_sheet_exports = {};

// src/drawing_sheet_parser.ts
function parse_drawing_sheet(expr) {
  return parse_expr(
    expr,
    P.start("kicad_wks"),
    P.pair("version", T.number),
    P.pair("generator", T.string),
    P.item("setup", parse_setup),
    P.collection("drawings", "line", T.item(parse_line)),
    P.collection("drawings", "rect", T.item(parse_rect)),
    P.collection("drawings", "polygon", T.item(parse_polygon2)),
    P.collection("drawings", "bitmap", T.item(parse_bitmap)),
    P.collection("drawings", "tbtext", T.item(parse_tbtext))
  );
}
function parse_setup(expr) {
  return parse_expr(
    expr,
    P.start("setup"),
    P.pair("linewidth", T.number),
    P.vec2("textsize"),
    P.pair("textlinewidth", T.number),
    P.pair("top_margin", T.number),
    P.pair("left_margin", T.number),
    P.pair("bottom_margin", T.number),
    P.pair("right_margin", T.number)
  );
}
function parse_coordinate(expr) {
  const parsed = parse_expr(
    expr,
    P.positional("start_token"),
    P.positional("x", T.number),
    P.positional("y", T.number),
    P.positional("anchor", T.string)
  );
  return {
    x: parsed["x"],
    y: parsed["y"],
    anchor: parsed["anchor"]
  };
}
var common_defs = [
  P.pair("name", T.string),
  P.pair("comment", T.string),
  P.pair("option", T.string),
  P.pair("repeat", T.number),
  P.pair("incrx", T.number),
  P.pair("incry", T.number),
  P.pair("linewidth", T.number)
];
function parse_line(expr) {
  return {
    kind: "line",
    ...parse_expr(
      expr,
      P.start("line"),
      P.item("start", parse_coordinate),
      P.item("end", parse_coordinate),
      ...common_defs
    )
  };
}
function parse_rect(expr) {
  return {
    kind: "rect",
    ...parse_expr(
      expr,
      P.start("rect"),
      P.item("start", parse_coordinate),
      P.item("end", parse_coordinate),
      ...common_defs
    )
  };
}
function parse_polygon2(expr) {
  const parsed = {
    kind: "polygon",
    ...parse_expr(
      expr,
      P.start("polygon"),
      P.item("pos", parse_coordinate),
      P.pair("rotate", T.number),
      P.collection(
        "contours",
        "pts",
        (obj, name, value) => parse_expr(
          value,
          P.start("pts"),
          P.collection("points", "xy", T.vec2)
        )["points"] ?? []
      ),
      ...common_defs
    )
  };
  parsed.pts = parsed.contours?.[0] ?? [];
  return parsed;
}
function parse_bitmap(expr) {
  const parsed = parse_expr(
    expr,
    P.start("bitmap"),
    P.item("pos", parse_coordinate),
    P.pair("scale", T.number),
    P.list("data", T.string),
    ...common_defs
  );
  return {
    ...parsed,
    kind: "bitmap",
    pngdata: parsed.data?.join("") ?? ""
  };
}
function parse_tbtext(expr) {
  return {
    kind: "tbtext",
    ...parse_expr(
      expr,
      P.start("tbtext"),
      P.positional("text"),
      P.item("pos", parse_coordinate),
      P.pair("incrlabel", T.number),
      P.pair("maxlen", T.number),
      P.pair("maxheight", T.number),
      P.item("font", parse_font),
      P.pair("rotate", T.number),
      P.pair("justify", T.string),
      ...common_defs
    )
  };
}
function parse_font(expr) {
  return parse_expr(
    expr,
    P.start("font"),
    P.pair("face", T.string),
    P.atom("bold"),
    P.atom("italic"),
    P.vec2("size"),
    P.pair("linewidth", T.number),
    P.color("color")
  );
}

// src/proto/schematic.ts
var schematic_exports = {};
__export(schematic_exports, {
  MANDATORY_FIELD_T: () => MANDATORY_FIELD_T
});
var MANDATORY_FIELD_T = /* @__PURE__ */ ((MANDATORY_FIELD_T2) => {
  MANDATORY_FIELD_T2[MANDATORY_FIELD_T2["INVALID_FIELD"] = -1] = "INVALID_FIELD";
  MANDATORY_FIELD_T2[MANDATORY_FIELD_T2["REFERENCE_FIELD"] = 0] = "REFERENCE_FIELD";
  MANDATORY_FIELD_T2[MANDATORY_FIELD_T2["VALUE_FIELD"] = 1] = "VALUE_FIELD";
  MANDATORY_FIELD_T2[MANDATORY_FIELD_T2["FOOTPRINT_FIELD"] = 2] = "FOOTPRINT_FIELD";
  MANDATORY_FIELD_T2[MANDATORY_FIELD_T2["DATASHEET_FIELD"] = 3] = "DATASHEET_FIELD";
  MANDATORY_FIELD_T2[MANDATORY_FIELD_T2["DESCRIPTION_FIELD"] = 4] = "DESCRIPTION_FIELD";
  MANDATORY_FIELD_T2[MANDATORY_FIELD_T2["MANDATORY_FIELD_COUNT"] = 5] = "MANDATORY_FIELD_COUNT";
  return MANDATORY_FIELD_T2;
})(MANDATORY_FIELD_T || {});

// src/proto/common.ts
var common_exports = {};
__export(common_exports, {
  PaperSize: () => PaperSize
});
var PaperSize = {
  User: [431.8, 279.4],
  A0: [1189, 841],
  A1: [841, 594],
  A2: [594, 420],
  A3: [420, 297],
  A4: [297, 210],
  A5: [210, 148],
  A: [279.4, 215.9],
  B: [431.8, 279.4],
  C: [558.8, 431.8],
  D: [863.6, 558.8],
  E: [1117.6, 863.6],
  USLetter: [279.4, 215.9],
  USLegal: [355.6, 215.9],
  USLedger: [431.8, 279.4]
};
export {
  BoardParser,
  SchematicParser,
  board_exports as boardProto,
  common_exports as commonProto,
  drawing_sheet_exports as drawingSheetProto,
  parseLibSymbol,
  parse_drawing_sheet,
  schematic_exports as schematicProto,
  serializeLibSymbol,
  serializeSchematic,
  serializeSchematicSymbol
};
