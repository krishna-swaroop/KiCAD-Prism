//! Spec 04 (fusing) and spec 05 (vias) test vectors.
mod common;

use common::cases;
use prism_calc::fusing::{adiabatic_copper, onderdonk_copper};
use prism_calc::via::*;

#[test]
fn fusing_vectors() {
    for c in cases("spec04", "onderdonk_copper") {
        c.expect(
            "current",
            onderdonk_copper(c.input("area"), c.input("time"), c.input("ambient_c"))
                .expect("valid"),
        );
    }
    for c in cases("spec04", "adiabatic_copper") {
        c.expect(
            "current",
            adiabatic_copper(c.input("area"), c.input("time"), c.input("ambient_c"))
                .expect("valid"),
        );
    }
}

#[test]
fn via_vectors() {
    for c in cases("spec05", "via_properties") {
        let v = Via {
            hole_diameter: c.input("hole_diameter"),
            plating: c.input("plating"),
            pad_diameter: c.input("pad_diameter"),
            antipad_diameter: c.input("antipad_diameter"),
            length: c.input("length"),
            eps_r: c.input("eps_r"),
        };
        let p = via_properties(&v).expect("valid");
        c.expect("barrel_area", p.barrel_area);
        c.expect("capacitance", p.capacitance);
        c.expect("inductance", p.inductance);
        c.expect("impedance", p.impedance);
        c.expect("resonant_frequency", p.resonant_frequency);
        c.expect(
            "rise_time_degradation",
            p.rise_time_degradation(c.input("line_z0")),
        );
        c.expect(
            "thermal_resistance",
            barrel_thermal_resistance(v.length, p.barrel_area).expect("valid"),
        );
        c.expect(
            "resistance_20c",
            barrel_resistance(v.length, p.barrel_area, 20.0).expect("valid"),
        );
    }
}

#[test]
fn diff_via_vectors() {
    for c in cases("spec05", "diff_via_pair") {
        let p = DiffViaPair {
            drill_diameter: c.input("drill_diameter"),
            spacing: c.input("spacing"),
            antipad_height: c.input("antipad_height"),
            antipad_width: c.input("antipad_width"),
            eps_r: c.input("eps_r"),
            anisotropy_pct: c.input("anisotropy_pct"),
        };
        let r = diff_via_pair(&p).expect("valid");
        c.expect("eps_avg", r.eps_avg);
        c.expect("z_single", r.z_single);
        c.expect("z_diff", r.z_diff);
        c.expect("eps_eff", r.eps_eff);
        c.expect("max_stub_length", r.max_stub_length(c.input("baud_rate")));
    }
}

#[test]
fn via_rejects_antipad_smaller_than_pad() {
    let v = Via {
        hole_diameter: 2.5e-4,
        plating: 2.5e-5,
        pad_diameter: 5e-4,
        antipad_diameter: 4e-4,
        length: 1.6e-3,
        eps_r: 4.3,
    };
    assert!(via_properties(&v).is_err());
}
