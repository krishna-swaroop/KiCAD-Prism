"""Generate the PCBWay spec-config schemas from the captured quote forms.

Three schemas, one per saved PCBWay page (standard prototype, advanced/HDI,
flex), with the exact option values from each page collected into
``pcbway_fields.json``. Sections, gating, defaults, the dimension inputs and the
shipping carrier list are curated here on purpose; options are verbatim.

Usage:
    python scripts/generate_pcbway_spec_config.py \
        scripts/pcbway_fields.json /tmp/std.cfg /tmp/adv.cfg /tmp/flex.cfg
"""
import json
import re
import sys

DATA = json.load(open(sys.argv[1], encoding="utf-8"))

CARRIER = (
    "carrier: choice(DHL, FedEx IE, FedEx IP, UPS Saver, UPS Expedited, "
    "SF Express, EMS, Register Air Mail, PCBWay Ship) | Shipping carrier"
)


def _clean(opt):
    # Trailing capability arrows ("8/8mil ^") are a UI hint, not part of the value.
    return re.sub(r"\s*↑\s*$", "", opt).strip()


def opts(source, label):
    o = DATA[source].get(label)
    if o is None:
        raise SystemExit(f"MISSING [{source}] {label!r}")
    return [_clean(x) for x in o]


def choice(source, label):
    return "choice(" + ", ".join(opts(source, label)) + ")"


def line(key, type_expr, *, default=None, when=None, label=None):
    s = f"{key}: {type_expr}"
    if default is not None:
        s += f" = {default}"
    if when is not None:
        s += f" when {when}"
    if label is not None:
        s += f" | {label}"
    return s


def default0(source, label):
    return opts(source, label)[0]


# --------------------------------------------------------------- STANDARD
def build_standard():
    S = "standard"
    L = ["# PCBWay standard PCB quote, field by field with the exact site options.", ""]
    L += ["[Base]"]
    L.append(line("board_type", choice(S, "Board type"), default=default0(S, "Board type"), label="Board type"))
    L.append(line("route_process", choice(S, "Route Process"), default=default0(S, "Route Process"), when="board_type != Single pieces", label="Route process"))
    L.append(line("different_design", choice(S, "Different design in panel"), default="1", when="board_type != Single pieces", label="Different designs in panel"))
    L.append(line("board_width_mm", "number", label="Size width (mm)"))
    L.append(line("board_height_mm", "number", label="Size height (mm)"))
    L.append(line("quantity", choice(S, "Quantity (single)"), default="5", label="Quantity"))
    L.append(line("layer_count", choice(S, "Layers"), default="2 Layers", label="Layers"))
    L += ["", "[Material]"]
    L.append(line("material", choice(S, "Material"), default="FR-4", label="Material"))
    L.append(line("rogers_material", choice(S, "Rogers"), default=default0(S, "Rogers"), when="material = Rogers", label="Rogers laminate"))
    L.append(line("thermal_conductivity", choice(S, "Thermal conductivity"), default=default0(S, "Thermal conductivity"), when="material = Aluminum", label="Thermal conductivity"))
    L.append(line("mcpcb_structure", choice(S, "Structure of MCPCB"), default=default0(S, "Structure of MCPCB"), when="material = Aluminum", label="Structure of MCPCB"))
    L.append(line("fr4_tg", choice(S, "FR4-TG"), default=default0(S, "FR4-TG"), when="material = FR-4", label="FR4 TG"))
    L.append(line("board_thickness_mm", choice(S, "Thickness"), default="1.6", label="Board thickness (mm)"))
    L += ["", "[Tolerances]"]
    L.append(line("min_track_spacing", choice(S, "Min track/spacing"), default=default0(S, "Min track/spacing"), label="Min track / spacing"))
    L.append(line("min_hole_size", choice(S, "Min hole size"), default=default0(S, "Min hole size"), label="Min hole size"))
    L += ["", "[Colour]"]
    L.append(line("solder_mask", choice(S, "Solder mask"), default="Green", label="Solder mask"))
    L.append(line("silkscreen", choice(S, "Silkscreen"), default="White", label="Silkscreen"))
    L.append(line("uv_printing", choice(S, "UV printing Multi-color"), default="None", label="UV printing / multi-colour"))
    L += ["", "[Finish]"]
    L.append(line("surface_finish", choice(S, "Surface finish"), default="HASL lead free", label="Surface finish"))
    L.append(line("via_process", choice(S, "Via process"), default=default0(S, "Via process"), label="Via process"))
    L.append(line("edge_connector", choice(S, "Edge connector"), default="No", label="Edge connector (gold fingers)"))
    L += ["", "[Copper]"]
    L.append(line("finished_copper", choice(S, "Finished copper"), default="1 oz Cu", label="Outer copper"))
    L.append(line("inner_copper", choice(S, "Inner Copper"), default="1 oz", when="layer_count != 1 Layer", label="Inner copper"))
    L += ["", "[Options]"]
    L.append(line("remove_product_no", choice(S, "Remove product No."), default="No", label="Remove PCBWay order number"))
    L.append(line("other_special_request", "text", label="Other special request"))
    L += ["", "[Delivery]", CARRIER]
    L += ["", "[+Stencil]"]
    L.append(line("stencil_type", choice(S, "Stencil type"), default=default0(S, "Stencil type"), label="Stencil type"))
    L.append(line("stencil_step", choice(S, "Multi-level/Step stencil"), default="No", label="Multi-level / step stencil"))
    L.append(line("stencil_size", choice(S, "Size (mm)"), default=default0(S, "Size (mm)"), label="Stencil size"))
    L.append(line("stencil_side", choice(S, "Stencil side"), default="Top", label="Stencil side"))
    L.append(line("stencil_fiducials", choice(S, "Existing fiducials"), default="None", label="Existing fiducials"))
    L.append(line("stencil_electropolishing", choice(S, "Electropolishing"), default="No", label="Electropolishing"))
    L += ["", "[+Assembly]"]
    L.append(line("assembly_side", choice(S, "Assembly side(s)"), default="Top side", label="Assembly side(s)"))
    L.append(line("assembly_qty", "int", label="Boards to assemble"))
    L.append(line("unique_parts", "int", label="Unique parts"))
    L.append(line("smd_parts", "int", label="SMD parts"))
    L.append(line("bga_qfp_parts", "int", label="BGA / QFP parts"))
    L.append(line("through_hole_parts", "int", label="Through-hole parts"))
    L.append(line("assembly_notes", "text", label="Assembly details"))
    return "\n".join(L) + "\n"


# --------------------------------------------------------------- ADVANCED
def build_advanced():
    A = "advanced"
    L = ["# PCBWay advanced / HDI / high-frequency / thick-copper quote, field by field.", ""]
    L += ["[Base]"]
    if "PCB Type" in DATA[A]:
        L.append(line("pcb_type", choice(A, "PCB Type"), default=default0(A, "PCB Type"), label="PCB type"))
    if "Board Spec" in DATA[A]:
        L.append(line("board_spec", choice(A, "Board Spec"), default=default0(A, "Board Spec"), label="Board spec"))
    L.append(line("board_type", choice(A, "Board type"), default=default0(A, "Board type"), label="Board type"))
    L.append(line("board_width_mm", "number", label="Size width (mm)"))
    L.append(line("board_height_mm", "number", label="Size height (mm)"))
    L.append(line("quantity", "int", default="5", label="Quantity"))
    L.append(line("layer_count", choice(A, "Layers"), default="4 Layers", label="Layers"))
    L += ["", "[Material]"]
    # The advanced page flattens its material picker (base + laminate brand + Dk)
    # into one control that does not extract as a clean top-level list; use the
    # standard page's real top-level Material choice, which is the same fab's set.
    L.append(line("material", choice("standard", "Material"), default="FR-4", label="Material"))
    L.append(line("board_thickness_mm", choice(A, "Thickness"), default="1.6", label="Board thickness (mm)"))
    L += ["", "[Tolerances]"]
    L.append(line("min_track_spacing", choice(A, "Min track/spacing"), default=default0(A, "Min track/spacing"), label="Min track / spacing"))
    L.append(line("min_hole_size", choice(A, "Min hole size"), default=default0(A, "Min hole size"), label="Min hole size"))
    L += ["", "[Colour]"]
    L.append(line("solder_mask", choice(A, "Solder mask"), default="Green", label="Solder mask"))
    L.append(line("silkscreen", choice(A, "Silkscreen"), default="White", label="Silkscreen"))
    L += ["", "[Finish]"]
    L.append(line("surface_finish", choice(A, "Surface finish"), default="Immersion gold(ENIG)", label="Surface finish"))
    L.append(line("edge_connector", choice(A, "Edge connector"), default="No", label="Edge connector (gold fingers)"))
    L += ["", "[Copper]"]
    L.append(line("finished_copper", choice(A, "Finished copper"), default="1 oz Cu", label="Outer copper"))
    L.append(line("inner_copper", choice(A, "Inner Copper"), default="1 oz", when="layer_count != 1 Layer", label="Inner copper"))
    L += ["", "[Options]"]
    if "Final Inspection Report(free)" in DATA[A]:
        L.append(line("final_inspection_report", choice(A, "Final Inspection Report(free)"), default=default0(A, "Final Inspection Report(free)"), label="Final inspection report"))
    L.append(line("other_special_request", "text", label="Other special request"))
    L += ["", "[Delivery]", CARRIER]
    return "\n".join(L) + "\n"


# --------------------------------------------------------------- FLEX
def build_flex():
    F = "flex"
    L = ["# PCBWay flexible / rigid-flex PCB quote, field by field.", ""]
    L += ["[Base]"]
    L.append(line("pcb_type", choice(F, "PCB Type"), default=default0(F, "PCB Type"), label="PCB type"))
    L.append(line("board_type", choice(F, "Board type"), default=default0(F, "Board type"), label="Board type"))
    L.append(line("different_design", choice(F, "Different design in panel"), default="1", when="board_type != Single pieces", label="Different designs in panel"))
    L.append(line("board_width_mm", "number", label="Size width (mm)"))
    L.append(line("board_height_mm", "number", label="Size height (mm)"))
    L.append(line("layer_count", choice(F, "Layers"), default="2 Layers", label="Layers"))
    L += ["", "[Material]"]
    L.append(line("base_material", choice(F, "Polyimide base material"), default="Polyimide Flex", label="Base material"))
    L.append(line("pet_material", choice(F, "Material (PET)"), default=default0(F, "Material (PET)"), when="base_material = PET", label="PET type"))
    L.append(line("fpc_thickness_mm", choice(F, "FPC Thickness"), default="0.2", label="FPC thickness (mm)"))
    L += ["", "[Tolerances]"]
    L.append(line("min_track_spacing", choice(F, "Min track/spacing"), default=default0(F, "Min track/spacing"), label="Min track / spacing"))
    L.append(line("min_hole_size", choice(F, "Min hole size/ Pad size(diameter)"), default=default0(F, "Min hole size/ Pad size(diameter)"), label="Min hole / pad size"))
    L += ["", "[Colour]"]
    L.append(line("coverlay", choice(F, "Solder mask(Coverlay)"), default=default0(F, "Solder mask(Coverlay)"), label="Solder mask / coverlay"))
    L.append(line("silkscreen", choice(F, "Silkscreen"), default="White", label="Silkscreen"))
    L += ["", "[Finish]"]
    L.append(line("surface_finish", choice(F, "Surface finish"), default="Immersion gold (ENIG)", label="Surface finish"))
    L.append(line("edge_connector", choice(F, "Edge connector"), default="No", label="Edge connector"))
    L += ["", "[Copper]"]
    L.append(line("finished_copper", choice(F, "Finished copper"), default="1 oz Cu(35µm)", label="Outer copper"))
    L.append(line("inner_copper", choice(F, "Inner Copper"), default="1 oz Cu(35µm)", when="layer_count != 1 Layer", label="Inner copper"))
    L += ["", "[Flex options]"]
    L.append(line("stiffener", choice(F, "Stiffener"), default="without", label="Stiffener"))
    L.append(line("tape_3m_tesa", choice(F, "3M/Tesa tape"), default="without", label="3M / Tesa tape"))
    L.append(line("conductive_tape", choice(F, "Conductive doublesided tape"), default="without", label="Conductive double-sided tape"))
    L.append(line("emi_shielding_film", choice(F, "EMI shielding film"), default="without", label="EMI shielding film"))
    L.append(line("e_test", choice(F, "E-test"), default="100%", label="Electrical test"))
    L += ["", "[Delivery]", CARRIER]
    return "\n".join(L) + "\n"


std, adv, flex = build_standard(), build_advanced(), build_flex()
open(sys.argv[2], "w", encoding="utf-8").write(std)
open(sys.argv[3], "w", encoding="utf-8").write(adv)
open(sys.argv[4], "w", encoding="utf-8").write(flex)
print("standard lines:", std.count("\n"), "advanced:", adv.count("\n"), "flex:", flex.count("\n"))
