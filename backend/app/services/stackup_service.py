"""Parse PCB stackup from a .kicad_pcb file."""

from __future__ import annotations

from pathlib import Path

from app.services.sch_diff_service import _get, _get_all, _parse_sexp


def _str(node: list, key: str) -> str | None:
    n = _get(node, key)
    return str(n[1]) if n and len(n) > 1 else None


def _float(node: list, key: str) -> float | None:
    n = _get(node, key)
    if n and len(n) > 1:
        try:
            return float(n[1])
        except (ValueError, TypeError):
            pass
    return None


def parse_stackup(pcb_path: str) -> dict:
    """
    Parse the (setup (stackup ...)) block from a .kicad_pcb file.

    Returns a dict with:
      - layers: list of layer dicts (in order, top to bottom)
      - board_thickness: float | None  (mm, from (general (thickness ...)))
      - copper_finish: str | None
      - edge_connector: str | None
      - castellated_pads: bool
      - edge_plating: bool
      - has_stackup: bool  (False if no explicit stackup block)
    """
    text = Path(pcb_path).read_text(encoding="utf-8", errors="replace")
    tree = _parse_sexp(text)

    # Board thickness from (general (thickness ...))
    general = _get(tree, "general")
    board_thickness = _float(general, "thickness") if general else None

    # Copper layer names from (layers ...) — used as fallback
    layers_node = _get(tree, "layers")
    copper_layer_names: list[str] = []
    all_layer_names: list[str] = []
    if layers_node:
        for entry in layers_node[1:]:
            if isinstance(entry, list) and len(entry) >= 3:
                all_layer_names.append(str(entry[1]))
                if str(entry[2]) in ("signal", "power", "mixed", "jumper"):
                    copper_layer_names.append(str(entry[1]))

    # Try to find stackup block
    setup = _get(tree, "setup")
    stackup_node = _get(setup, "stackup") if setup else None

    if not stackup_node:
        return {
            "has_stackup": False,
            "board_thickness": board_thickness,
            "copper_finish": None,
            "edge_connector": None,
            "castellated_pads": False,
            "edge_plating": False,
            "layers": _fallback_layers(copper_layer_names, board_thickness),
        }

    layers = []
    for layer_node in _get_all(stackup_node, "layer"):
        if not layer_node or len(layer_node) < 2:
            continue
        name = str(layer_node[1])
        layer_type = _str(layer_node, "type") or ""
        thickness = _float(layer_node, "thickness")
        material = _str(layer_node, "material")
        epsilon_r = _float(layer_node, "epsilon_r")
        loss_tangent = _float(layer_node, "loss_tangent")
        color = _str(layer_node, "color")

        layers.append(
            {
                "name": name,
                "type": layer_type,
                "thickness": thickness,
                "material": material,
                "epsilon_r": epsilon_r,
                "loss_tangent": loss_tangent,
                "color": color,
            }
        )

    copper_finish_node = _get(stackup_node, "copper_finish")
    copper_finish = (
        str(copper_finish_node[1])
        if copper_finish_node and len(copper_finish_node) > 1
        else None
    )

    edge_connector_node = _get(stackup_node, "edge_connector")
    edge_connector = (
        str(edge_connector_node[1])
        if edge_connector_node and len(edge_connector_node) > 1
        else None
    )

    castellated_node = _get(stackup_node, "castellated_pads")
    castellated_pads = (
        str(castellated_node[1]).lower() == "yes"
        if castellated_node and len(castellated_node) > 1
        else False
    )

    edge_plating_node = _get(stackup_node, "edge_plating")
    edge_plating = (
        str(edge_plating_node[1]).lower() == "yes"
        if edge_plating_node and len(edge_plating_node) > 1
        else False
    )

    return {
        "has_stackup": True,
        "board_thickness": board_thickness,
        "copper_finish": copper_finish,
        "edge_connector": edge_connector,
        "castellated_pads": castellated_pads,
        "edge_plating": edge_plating,
        "layers": layers,
    }


def _fallback_layers(
    copper_names: list[str], board_thickness: float | None
) -> list[dict]:
    """Build a minimal layer list when no explicit stackup is defined."""
    if not copper_names:
        return []

    layers = []

    def _cu_label(name: str) -> str:
        if name == "F.Cu":
            return "Top Copper"
        if name == "B.Cu":
            return "Bottom Copper"
        return name

    n_cu = len(copper_names)
    # Distribute remaining thickness evenly across dielectric layers
    cu_thickness = 0.035
    total_cu = n_cu * cu_thickness
    n_diel = max(1, n_cu - 1)
    remaining = (board_thickness or 1.6) - total_cu
    diel_thickness = round(remaining / n_diel, 4) if n_diel else remaining

    layers.append(
        {
            "name": "F.SilkS",
            "type": "Top Silk Screen",
            "thickness": None,
            "material": None,
            "epsilon_r": None,
            "loss_tangent": None,
            "color": None,
        }
    )
    layers.append(
        {
            "name": "F.Mask",
            "type": "Top Solder Mask",
            "thickness": 0.01,
            "material": None,
            "epsilon_r": None,
            "loss_tangent": None,
            "color": None,
        }
    )

    for i, cu in enumerate(copper_names):
        layers.append(
            {
                "name": cu,
                "type": "copper",
                "thickness": cu_thickness,
                "material": None,
                "epsilon_r": None,
                "loss_tangent": None,
                "color": None,
            }
        )
        if i < len(copper_names) - 1:
            diel_type = "core" if i % 2 == 0 else "prepreg"
            layers.append(
                {
                    "name": f"dielectric {i + 1}",
                    "type": diel_type,
                    "thickness": diel_thickness,
                    "material": "FR4",
                    "epsilon_r": None,
                    "loss_tangent": None,
                    "color": None,
                }
            )

    layers.append(
        {
            "name": "B.Mask",
            "type": "Bottom Solder Mask",
            "thickness": 0.01,
            "material": None,
            "epsilon_r": None,
            "loss_tangent": None,
            "color": None,
        }
    )
    layers.append(
        {
            "name": "B.SilkS",
            "type": "Bottom Silk Screen",
            "thickness": None,
            "material": None,
            "epsilon_r": None,
            "loss_tangent": None,
            "color": None,
        }
    )

    return layers
