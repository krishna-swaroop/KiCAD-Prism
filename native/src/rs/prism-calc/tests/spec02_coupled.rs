//! Spec 02 test vectors.
mod common;

use common::cases;
use prism_calc::coupled::*;
use prism_calc::tline::{Microstrip, ipc2141_microstrip};

#[test]
fn edge_coupled_microstrip_chain() {
    for c in cases("spec02", "edge_coupled_microstrip_chain") {
        let (w, s, h, t, er) = (
            c.input("width"),
            c.input("spacing"),
            c.input("height"),
            c.input("thickness"),
            c.input("eps_r"),
        );
        let eps_eff = microstrip_eps_eff_schneider(w, h, er).expect("valid");
        c.expect("eps_eff", eps_eff);
        let z0 = ipc2141_microstrip(&Microstrip {
            width: w,
            height: h,
            thickness: t,
            eps_r: er,
        })
        .expect("valid")
        .z0;
        c.expect("z0", z0);
        let (zdiff, _) = edge_coupled_microstrip_zdiff(z0, s, h).expect("valid");
        c.expect("zdiff", zdiff);
        let modes = modes_from_zdiff(z0, zdiff).expect("valid");
        c.expect("z_odd", modes.z_odd);
        c.expect("z_even", modes.z_even);
        let kb = backward_coupling(modes, z0).expect("valid");
        c.expect("kb_terminated", kb.terminated);
        c.expect("kb_unterminated", kb.unterminated);
        let next = near_end_crosstalk(
            kb.terminated,
            c.input("aggressor_voltage"),
            c.input("coupled_length"),
            c.input("rise_time"),
            eps_eff,
        )
        .expect("valid");
        c.expect("saturation_length", next.saturation_length);
        c.expect("next_voltage", next.voltage);
    }
}

#[test]
fn edge_coupled_stripline_chain() {
    for c in cases("spec02", "edge_coupled_stripline_chain") {
        let b = c.input("plane_spacing");
        let z0 =
            stripline_z0_for_coupling(c.input("width"), b, c.input("thickness"), c.input("eps_r"))
                .expect("valid");
        c.expect("z0", z0);
        c.expect(
            "zdiff",
            edge_coupled_stripline_zdiff(z0, c.input("spacing"), b, c.input("k")).expect("valid"),
        );
    }
}

#[test]
fn next_saturates_beyond_saturation_length() {
    let short = near_end_crosstalk(0.1, 1.0, 0.01, 1e-9, 4.0).expect("valid");
    let long = near_end_crosstalk(0.1, 1.0, 10.0, 1e-9, 4.0).expect("valid");
    assert!(short.voltage < long.voltage);
    assert!((long.voltage - 0.1).abs() < 1e-15);
}

#[test]
fn default_stripline_coupling_is_the_published_value() {
    assert!((STRIPLINE_COUPLING_K - 0.347).abs() < f64::EPSILON);
}
