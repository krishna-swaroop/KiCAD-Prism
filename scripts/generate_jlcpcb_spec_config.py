"""Generate the JLCPCB spec-config schemas from the captured quote forms.

Option values come verbatim from the saved JLCPCB pages, collected once into
``jlcpcb_fields.json`` (the field->options map for the standard, assembly and
advanced quote pages). Sections, gating, defaults, the dimension inputs and the
shipping carrier list are curated here on purpose.

To refresh from new JLCPCB captures: re-save each quote page (PCB, Assembly,
Advanced) as MHTML with the sections expanded, rebuild ``jlcpcb_fields.json``
from them, then run this script and paste the two blocks into
``backend/app/services/spec_config_service.py`` (JLCPCB_SPEC_CONFIG and
JLCPCB_ADVANCED_SPEC_CONFIG).

Usage:
    python scripts/generate_jlcpcb_spec_config.py \
        scripts/jlcpcb_fields.json /tmp/standard.cfg /tmp/advanced.cfg
"""
import json
import sys

DATA = json.load(open(sys.argv[1], encoding="utf-8"))


def opts(source, label):
    o = DATA[source].get(label)
    if o is None:
        raise SystemExit(f"MISSING option list: [{source}] {label!r}")
    return o


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


# ---------------------------------------------------------------- STANDARD
# PCB fields from the standard capture; Assembly (PCBA) from the assembly
# capture; Stencil from the standard capture's stencil section.
def build_standard():
    S = "standard"
    A = "assembly"
    L = []
    L.append("# Spec schema built field by field from the JLCPCB PCB quote form, with the")
    L.append("# exact option values from the site. Fields are gated to mirror how the form")
    L.append("# reveals them (FR-4-only, Flex-only, multilayer-only, panel-only).")
    L.append("")
    L.append("[Base]")
    L.append(line("base_material", choice(S, "Base Material"), default="FR-4", label="Base material"))
    L.append(line("layer_count", choice(S, "Layers"), default="2", label="Layers"))
    L.append(line("board_width_mm", "number", label="Dimension width (mm)"))
    L.append(line("board_height_mm", "number", label="Dimension height (mm)"))
    L.append(line("product_type", choice(S, "Product Type"), default="Industrial/Consumer electronics", label="Product type"))
    L.append(line("different_design", choice(S, "Different Design"), default="1", label="Different design"))
    L.append(line("delivery_format", choice(S, "Delivery Format"), default="Single PCB", label="Delivery format"))
    L.append("# Panel layout only applies when the board is delivered as a panel.")
    L.append(line("panel_columns", "int", when="delivery_format != Single PCB", label="Panel columns"))
    L.append(line("panel_rows", "int", when="delivery_format != Single PCB", label="Panel rows"))
    L.append("")
    L.append("[Stackup]")
    L.append(line("board_thickness_mm", choice(S, "PCB Thickness"), default="1.6mm", label="PCB thickness"))
    L.append(line("outer_copper_weight_oz", choice(S, "Outer Copper Weight"), default="1 oz", label="Outer copper weight"))
    L.append("# Inner copper only exists on multilayer boards.")
    L.append(line("inner_copper_weight_oz", "choice(0.5 oz, 1 oz, 2 oz)", default="0.5 oz", when="layer_count != 1", label="Inner copper weight"))
    L.append("# FR-4 TG material grade.")
    L.append(line("material_type", choice(S, "Material Type"), default="FR4 TG135", when="base_material = FR-4", label="Material Type"))
    L.append("")
    L.append("[Colour]")
    L.append(line("solder_mask_color", choice(S, "PCB Color"), default="Green", label="PCB color"))
    L.append(line("silkscreen_color", choice(S, "Silkscreen"), default="White", label="Silkscreen"))
    L.append("")
    L.append("[Surface finish]")
    L.append(line("surface_finish", choice(S, "Surface Finish"), default="HASL(with lead)", label="Surface finish"))
    L.append("")
    L.append("[Flex]")
    L.append("# Flex-only options, revealed when the material is Flex.")
    L.append(line("eda_software", choice(S, "EDA Software"), default="Other", when="base_material = Flex", label="EDA software"))
    L.append(line("stiffener", choice(S, "Stiffener"), default="Without", when="base_material = Flex", label="Stiffener"))
    L.append(line("emi_shielding_film", choice(S, "EMI Shielding Film"), default="Without", when="base_material = Flex", label="EMI shielding film"))
    L.append(line("coverlay_thickness", choice(S, "Coverlay Thickness"), default="PI:25um/AD:25um", when="base_material = Flex", label="Coverlay thickness"))
    L.append(line("cutting_method", choice(S, "Cutting Method"), default="Laser Cutting", when="base_material = Flex", label="Cutting method"))
    L.append("")
    L.append("[Vias]")
    L.append(line("via_covering", choice(S, "Via Covering"), default="Tented", label="Via covering"))
    L.append(line("via_plating_method", choice(S, "Via Plating Method"), default="Not Specified", label="Via plating method"))
    L.append("# Via size only matters on boards that have vias (multilayer).")
    L.append(line("min_via_hole", choice(S, "Min via hole size/diameter"), default="0.3mm/(0.4/0.45mm)", when="layer_count != 1", label="Min via hole size / diameter"))
    L.append("")
    L.append("[Options]")
    L.append(line("board_outline_tolerance", choice(S, "Board Outline Tolerance"), default="±0.2mm(Regular)", label="Board outline tolerance"))
    L.append("# Gold fingers, castellation and edge plating are FR-4 features.")
    L.append(line("gold_fingers", choice(S, "Gold Fingers"), default="No", when="base_material = FR-4", label="Gold fingers"))
    L.append(line("castellated_holes", choice(S, "Castellated Holes"), default="No", when="base_material = FR-4", label="Castellated holes"))
    L.append(line("edge_plating", choice(S, "Edge Plating"), default="No", when="base_material = FR-4", label="Edge plating"))
    L.append(line("blind_slots", choice(S, "Blind Slots"), default="No", label="Blind slots"))
    L.append(line("mark_on_pcb", choice(S, "Mark on PCB"), default="Remove Mark", label="Mark on PCB"))
    L.append(line("confirm_production_file", choice(S, "Confirm Production file"), default="No", label="Confirm production file"))
    L.append("")
    L.append("[Testing & quality]")
    L.append(line("electrical_test", choice(S, "Electrical Test"), default="Flying Probe Fully Test", label="Electrical test"))
    L.append(line("appearance_quality", choice(S, "Appearance Quality"), default="IPC Class 2 Standard", label="Appearance quality"))
    L.append(line("silkscreen_technology", choice(S, "Silkscreen Technology"), default="Ink-jet Printing Silkscreen", label="Silkscreen technology"))
    L.append(line("paper_between_pcbs", choice(S, "Paper between PCBs"), default="No", label="Paper between PCBs"))
    L.append(line("ul_marking", choice(S, "UL Marking"), default="No", label="UL marking"))
    L.append(line("humidity_indicator_card", choice(S, "Humidity Indicator Card"), default="No", label="Humidity indicator card"))
    L.append(line("kelvin_test", choice(S, "4-Wire Kelvin Test"), default="No", label="4-Wire Kelvin test"))
    L.append(line("package_box", choice(S, "Package Box"), default="With JLCPCB logo", label="Package box"))
    L.append(line("inspection_report", choice(S, "Inspection Report"), default="No", label="Inspection report"))
    L.append(line("pcb_remark", "text", label="PCB remark"))
    L.append("")
    L.append("[Delivery]")
    # Carrier list preserved verbatim from the user's choice.
    L.append("carrier: choice(DHL Express, DHL Express (DDP), UPS Worldwide Express Saver, FedEx Express, EuroPacket, Global Standard Direct Line, Sea Shipment, My UPS Account, My DHL Account, My FedEx Account) | Shipping carrier")
    L.append("")
    L.append("[+Assembly]")
    L.append("# JLCPCB PCB Assembly (PCBA) options, from the assembly quote form.")
    L.append(line("pcba_type", choice(A, "PCBA Type"), default="Standard", label="PCBA type"))
    L.append(line("assembly_side", choice(A, "Assembly Side"), default="Top Side", label="Assembly side"))
    L.append(line("assembly_qty", "int", label="Boards to assemble"))
    L.append(line("edge_rails_fiducials", choice(A, "Edge Rails/Fiducials"), default="Added by JLCPCB", label="Edge rails / fiducials"))
    L.append(line("parts_selection", choice(A, "Parts Selection"), default="By Customer (Self-Service)", label="Parts selection"))
    L.append(line("confirm_parts_placement", choice(A, "Confirm Parts Placement"), default="No", label="Confirm parts placement"))
    L.append(line("stencil_storage", choice(A, "Stencil Storage"), default="No", label="Stencil storage"))
    L.append(line("fixture_storage", choice(A, "Fixture Storage"), default="No", label="Fixture storage"))
    L.append(line("unique_parts", "int", label="Unique part count (BOM lines)"))
    L.append(line("smt_parts", "int", label="SMT joints"))
    L.append(line("through_hole_parts", "int", label="Through-hole joints"))
    L.append(line("assembly_notes", "text", label="Assembly notes"))
    L.append("")
    L.append("[+Stencil]")
    L.append("# JLCPCB Stencil options, from the stencil quote form.")
    L.append(line("stencil_side", choice(S, "Stencil Side"), default="Top only", label="Stencil side"))
    L.append(line("stencil_dimensions", choice(S, "Dimensions"), default="Standard Size", label="Stencil size"))
    L.append(line("stencil_thickness", choice(S, "Thickness"), default="Select by JLCPCB", label="Stencil thickness"))
    L.append(line("stencil_process_type", choice(S, "Stencil Process Type"), default="Solder paste stencil", label="Stencil process"))
    L.append(line("polishing_process", choice(S, "Polishing Process"), default="Sanding", label="Polishing process"))
    L.append(line("stencil_fiducials", choice(S, "Fiducials"), default="No Fiducial", label="Fiducials"))
    L.append(line("stencil_framework", choice(S, "Framework"), default="No", label="Framework"))
    L.append(line("step_stencil", choice(S, "Step Stencil"), default="No", label="Step stencil"))
    L.append(line("nano_coating", choice(S, "Nano-Coating"), default="No", label="Nano-coating"))
    L.append(line("engrave_text", choice(S, "Engrave Text"), default="No", label="Engrave text"))
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------- ADVANCED
def build_advanced():
    V = "advanced"
    L = []
    L.append("# Spec schema for advanced / HDI JLCPCB boards, field by field from the")
    L.append("# advanced quote form with the exact option values. The extra stackup,")
    L.append("# drilling and impedance controls are the point of this schema.")
    L.append("")
    L.append("[Base]")
    L.append(line("base_material", choice(V, "Base Material"), default="FR-4", label="Base material"))
    L.append(line("layer_count", choice(V, "Layers"), default="6", label="Layers"))
    L.append(line("board_width_mm", "number", label="Dimension width (mm)"))
    L.append(line("board_height_mm", "number", label="Dimension height (mm)"))
    L.append(line("product_type", choice(V, "Product Type"), default="Industrial/Consumer electronics", label="Product type"))
    L.append(line("different_design", choice(V, "Different Design"), default="1", label="Different design"))
    L.append(line("delivery_format", choice(V, "Delivery Format"), default="Single PCB", label="Delivery format"))
    L.append("")
    L.append("[Stackup]")
    L.append(line("board_thickness_mm", choice(V, "PCB Thickness"), default="1.6mm", label="PCB thickness"))
    L.append(line("outer_copper_weight_oz", choice(V, "Outer Copper Weight"), default="1 oz", label="Outer copper weight"))
    L.append(line("inner_copper_weight_oz", choice(V, "Inner Copper Weight"), default="0.5 oz", when="layer_count != 1", label="Inner copper weight"))
    L.append(line("material_type", choice(V, "Material Type"), default="FR4 TG135", when="base_material = FR-4", label="Material Type"))
    L.append(line("specify_layer_sequence", choice(V, "Specify Layer Sequence"), default="No", label="Specify layer sequence"))
    L.append(line("specify_stackup", choice(V, "Specify Stackup"), default="No", label="Specify stackup"))
    L.append("")
    L.append("[Colour]")
    L.append(line("solder_mask_color", choice(V, "PCB Color"), default="Green", label="PCB color"))
    L.append(line("silkscreen_color", choice(V, "Silkscreen"), default="White", label="Silkscreen"))
    L.append("")
    L.append("[Surface finish]")
    L.append(line("surface_finish", choice(V, "Surface Finish"), default="ENIG", label="Surface finish"))
    L.append("")
    L.append("[Vias & drilling]")
    L.append(line("via_covering", choice(V, "Via Covering"), default="Tented", label="Via covering"))
    L.append(line("min_via_hole", choice(V, "Min via hole size/diameter"), default="0.3mm/(0.4/0.45mm)", label="Min via hole size / diameter"))
    L.append(line("press_fit_hole", choice(V, "Press-Fit Hole"), default="No", label="Press-fit hole"))
    L.append(line("backdrill", choice(V, "Backdrill"), default="No", label="Back-drill"))
    L.append("")
    L.append("[Options]")
    L.append(line("board_outline_tolerance", choice(V, "Board Outline Tolerance"), default="±0.2mm(Regular)", label="Board outline tolerance"))
    L.append(line("gold_fingers", choice(V, "Gold Fingers"), default="No", label="Gold fingers"))
    L.append(line("castellated_holes", choice(V, "Castellated Holes"), default="No", label="Castellated holes"))
    L.append(line("edge_plating", choice(V, "Edge Plating"), default="No", label="Edge plating"))
    L.append(line("blind_slots", choice(V, "Blind Slots"), default="No", label="Blind slots"))
    L.append(line("mark_on_pcb", choice(V, "Mark on PCB"), default="Remove Mark", label="Mark on PCB"))
    L.append(line("ul_marking", choice(V, "UL Marking"), default="No", label="UL marking"))
    L.append(line("confirm_production_file", choice(V, "Confirm Production file"), default="No", label="Confirm production file"))
    L.append("")
    L.append("[Testing & quality]")
    L.append(line("electrical_test", choice(V, "Electrical Test"), default="Flying Probe Fully Test", label="Electrical test"))
    L.append(line("appearance_quality", choice(V, "Appearance Quality"), default="IPC Class 2 Standard", label="Appearance quality"))
    L.append(line("silkscreen_technology", choice(V, "Silkscreen Technology"), default="Ink-jet Printing Silkscreen", label="Silkscreen technology"))
    L.append(line("kelvin_test", choice(V, "4-Wire Kelvin Test"), default="No", label="4-Wire Kelvin test"))
    L.append(line("paper_between_pcbs", choice(V, "Paper between PCBs"), default="No", label="Paper between PCBs"))
    L.append(line("humidity_indicator_card", choice(V, "Humidity Indicator Card"), default="No", label="Humidity indicator card"))
    L.append(line("package_box", choice(V, "Package Box"), default="With JLCPCB logo", label="Package box"))
    L.append(line("inspection_report", choice(V, "Inspection Report"), default="No", label="Inspection report"))
    L.append(line("pcb_remark", "text", label="PCB remark"))
    L.append("")
    L.append("[Delivery]")
    L.append("carrier: choice(DHL Express, DHL Express (DDP), UPS Worldwide Express Saver, FedEx Express, EuroPacket, Global Standard Direct Line, Sea Shipment, My UPS Account, My DHL Account, My FedEx Account) | Shipping carrier")
    return "\n".join(L) + "\n"


std = build_standard()
adv = build_advanced()
open(sys.argv[2], "w", encoding="utf-8").write(std)
open(sys.argv[3], "w", encoding="utf-8").write(adv)
print("standard lines:", std.count("\n"), " advanced lines:", adv.count("\n"))
