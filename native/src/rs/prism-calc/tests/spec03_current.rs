//! Spec 03 test vectors.
mod common;

use common::cases;
use prism_calc::current::*;

fn layer(s: &str) -> Layer {
    if s == "external" {
        Layer::External
    } else {
        Layer::Internal
    }
}

#[test]
fn area_vectors() {
    for c in cases("spec03", "cross_section_area") {
        let cs = CrossSection {
            width: c.input("width"),
            thickness: c.input("thickness"),
            etch: Etch::None,
            count: 1,
        };
        c.expect("area", cs.area().expect("valid"));
    }
}

#[test]
fn ipc2221_vectors() {
    for c in cases("spec03", "ipc2221_current") {
        let (i, _) = ipc2221_current(
            c.input("area"),
            c.input("temperature_rise"),
            layer(c.input_str("layer")),
        )
        .expect("valid");
        c.expect("current", i);
    }
    for c in cases("spec03", "ipc2221_area") {
        let (a, _) = ipc2221_area(
            c.input("current"),
            c.input("temperature_rise"),
            layer(c.input_str("layer")),
        )
        .expect("valid");
        c.expect("area", a);
    }
}

#[test]
fn resistance_and_skin_depth_vectors() {
    for c in cases("spec03", "copper_dc_resistance") {
        c.expect(
            "resistance",
            copper_dc_resistance(c.input("length"), c.input("area"), c.input("temperature_c"))
                .expect("valid"),
        );
    }
    for c in cases("spec03", "skin_depth") {
        c.expect(
            "skin_depth",
            skin_depth(
                c.input("frequency"),
                c.input("resistivity"),
                c.input("mu_r"),
            )
            .expect("valid"),
        );
    }
}

#[test]
fn ipc2221_round_trips() {
    let (area, _) = ipc2221_area(3.0, 20.0, Layer::Internal).expect("valid");
    let (i, _) = ipc2221_current(area, 20.0, Layer::Internal).expect("valid");
    let (dt, _) = ipc2221_temperature_rise(3.0, area, Layer::Internal).expect("valid");
    assert!((i - 3.0).abs() < 1e-12 && (dt - 20.0).abs() < 1e-9);
}

#[test]
fn width_for_area_inverts_every_etch_model() {
    for etch in [Etch::None, Etch::OneToOne, Etch::TwoToOne] {
        let cs = CrossSection {
            width: 0.5e-3,
            thickness: 35e-6,
            etch,
            count: 1,
        };
        let w = width_for_area(cs.area().expect("valid"), 35e-6, etch).expect("valid");
        assert!((w - 0.5e-3).abs() < 1e-15, "{etch:?}");
    }
}
