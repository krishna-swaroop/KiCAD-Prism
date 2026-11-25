//! Spec 01 test vectors and physics cross-checks.
mod common;

use common::cases;
use prism_calc::elliptic_k_ratio;
use prism_calc::tline::*;
use std::f64::consts::PI;

fn microstrip(c: &common::Case) -> Microstrip {
    Microstrip {
        width: c.input("width"),
        height: c.input("height"),
        thickness: c.input("thickness"),
        eps_r: c.input("eps_r"),
    }
}

fn check(c: &common::Case, r: &LineResult) {
    c.expect("z0", r.z0);
    c.expect("eps_eff", r.eps_eff);
}

#[test]
fn ipc2141_microstrip_vectors() {
    for c in cases("spec01", "ipc2141_microstrip") {
        check(&c, &ipc2141_microstrip(&microstrip(&c)).expect("valid"));
    }
}

#[test]
fn ipc2141_embedded_microstrip_vectors() {
    for c in cases("spec01", "ipc2141_embedded_microstrip") {
        let g = EmbeddedMicrostrip {
            width: c.input("width"),
            height: c.input("height"),
            thickness: c.input("thickness"),
            dielectric_height: c.input("dielectric_height"),
            eps_r: c.input("eps_r"),
        };
        check(&c, &ipc2141_embedded_microstrip(&g).expect("valid"));
    }
}

#[test]
fn hammerstad_jensen_vectors() {
    for c in cases("spec01", "hammerstad_jensen") {
        check(&c, &hammerstad_jensen(&microstrip(&c)).expect("valid"));
    }
}

#[test]
fn dispersive_microstrip_vectors() {
    for c in cases("spec01", "microstrip_dispersive") {
        check(
            &c,
            &microstrip_dispersive(&microstrip(&c), c.input("frequency")).expect("valid"),
        );
    }
}

fn stripline(c: &common::Case) -> Stripline {
    Stripline {
        width: c.input("width"),
        height: c.input("height"),
        thickness: c.input("thickness"),
        eps_r: c.input("eps_r"),
    }
}

#[test]
fn stripline_vectors() {
    for c in cases("spec01", "ipc2141_stripline") {
        check(&c, &ipc2141_stripline(&stripline(&c)).expect("valid"));
    }
    for c in cases("spec01", "wheeler_stripline") {
        check(&c, &wheeler_stripline(&stripline(&c)).expect("valid"));
    }
}

#[test]
fn dual_and_asymmetric_stripline_vectors() {
    for c in cases("spec01", "ipc2141_dual_stripline") {
        let g = DualStripline {
            width: c.input("width"),
            thickness: c.input("thickness"),
            height: c.input("height"),
            separation: c.input("separation"),
            eps_r: c.input("eps_r"),
        };
        check(&c, &ipc2141_dual_stripline(&g).expect("valid"));
    }
    for c in cases("spec01", "ipc2141_asymmetric_stripline") {
        let g = AsymmetricStripline {
            width: c.input("width"),
            thickness: c.input("thickness"),
            height_a: c.input("height_a"),
            height_b: c.input("height_b"),
            eps_r: c.input("eps_r"),
        };
        check(&c, &ipc2141_asymmetric_stripline(&g).expect("valid"));
    }
}

#[test]
fn cpw_vectors() {
    for c in cases("spec01", "conductor_backed_cpw") {
        let g = CoplanarWaveguide {
            strip_width: c.input("strip_width"),
            gap: c.input("gap"),
            height: c.input("height"),
            eps_r: c.input("eps_r"),
        };
        check(&c, &conductor_backed_cpw(&g).expect("valid"));
    }
}

/// Wheeler's thick-strip formula at T → 0 against the exact zero-thickness stripline
/// Z₀ = (η₀/4√εr)·K(k)/K(k′), k = sech(πW/2b) (Cohn). Wheeler quotes ~0.5 % accuracy.
#[test]
fn wheeler_matches_exact_zero_thickness_stripline() {
    let b = 1e-3;
    for w_over_b in [0.2, 0.5, 1.0, 2.0] {
        let g = Stripline {
            width: w_over_b * b,
            height: b / 2.0,
            thickness: 0.0,
            eps_r: 1.0,
        };
        let wheeler = wheeler_stripline(&g).expect("valid").z0;
        let k = 1.0 / (PI * w_over_b / 2.0).cosh();
        let exact = prism_calc::constants::ETA0 / 4.0 * elliptic_k_ratio(k);
        assert!(
            (wheeler - exact).abs() / exact < 0.01,
            "W/b={w_over_b}: wheeler {wheeler} exact {exact}"
        );
    }
}

#[test]
fn asymmetric_stripline_reduces_to_symmetric_when_centred() {
    let (w, t, h, er) = (0.15e-3, 0.035e-3, 0.2e-3, 4.0);
    let asym = ipc2141_asymmetric_stripline(&AsymmetricStripline {
        width: w,
        thickness: t,
        height_a: h,
        height_b: h,
        eps_r: er,
    })
    .expect("valid");
    let sym = wheeler_stripline(&Stripline {
        width: w,
        height: h,
        thickness: t,
        eps_r: er,
    })
    .expect("valid");
    assert!((asym.z0 - sym.z0).abs() < 1e-9 * sym.z0);
}

#[test]
fn dispersion_at_dc_equals_static() {
    let g = Microstrip {
        width: 0.3e-3,
        height: 0.2e-3,
        thickness: 35e-6,
        eps_r: 4.2,
    };
    let stat = hammerstad_jensen(&g).expect("valid");
    let dc = microstrip_dispersive(&g, 0.0).expect("valid");
    assert!((stat.z0 - dc.z0).abs() < 1e-12 && (stat.eps_eff - dc.eps_eff).abs() < 1e-12);
}

#[test]
fn derived_quantities_are_consistent() {
    let r = hammerstad_jensen(&Microstrip {
        width: 0.3e-3,
        height: 0.2e-3,
        thickness: 35e-6,
        eps_r: 4.2,
    })
    .expect("valid");
    assert!(((r.inductance_per_m / r.capacitance_per_m).sqrt() - r.z0).abs() < 1e-9 * r.z0);
    assert!(
        ((r.inductance_per_m * r.capacitance_per_m).sqrt() - r.delay_per_m).abs()
            < 1e-12 * r.delay_per_m
    );
}

#[test]
fn invalid_geometry_is_rejected() {
    let bad = Microstrip {
        width: -1.0,
        height: 1e-4,
        thickness: 0.0,
        eps_r: 4.0,
    };
    assert!(ipc2141_microstrip(&bad).is_err());
    let buried_too_thin = EmbeddedMicrostrip {
        width: 1e-4,
        height: 1e-4,
        thickness: 3e-5,
        dielectric_height: 1.1e-4,
        eps_r: 4.0,
    };
    assert!(ipc2141_embedded_microstrip(&buried_too_thin).is_err());
}

#[test]
fn out_of_range_inputs_warn() {
    let wide = Microstrip {
        width: 3.5e-4,
        height: 1e-4,
        thickness: 0.0,
        eps_r: 4.0,
    };
    let r = ipc2141_microstrip(&wide).expect("still computes");
    assert!(r.warnings.iter().any(|w| w.parameter == "W/H"));
}
