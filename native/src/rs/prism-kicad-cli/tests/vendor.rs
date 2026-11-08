//! `prism-kicad vendor run jlcpcb` against the committed synthetic goldens
//! (ADR amendment C3 §4): the four variants' CSVs must be byte-identical to
//! Cruncher 2026.9.7's output (cli-spec.md §5.8).
//!
//! The bundle is the synthetic case's parse-stage bundle, built from the
//! upgraded sources the goldens were captured from; it is small enough to
//! commit (`tests/data/rs-synthetic.prism`).

mod support;

use std::path::{Path, PathBuf};

const VARIANTS: [(&str, &str); 4] = [
    ("base", "base"),
    ("default", "default"),
    ("dnp-led", "dnp-led"),
    ("assembly-reduced", "assembly-reduced"),
];

fn bundle() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data/rs-synthetic.prism")
}

fn config() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../prism-vendors/configs/jlcpcb.config.json")
}

fn golden(variant: &str, name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../parity/goldens/rs-synthetic/vendor-jlcpcb")
        .join(variant)
        .join(name)
}

#[test]
fn the_synthetic_case_matches_the_jlcpcb_goldens() {
    for (variant, directory) in VARIANTS {
        let output = support::scratch(&format!("vendor-{variant}"));
        let (bundle, config) = (bundle(), config());
        let mut argv = vec![
            "vendor",
            "run",
            "jlcpcb",
            "--in",
            support::s(&bundle),
            "--config",
            support::s(&config),
            "-o",
            support::s(&output),
        ];
        if variant != "base" {
            argv.extend(["--variant", variant]);
        }
        let run = support::run(&argv);
        assert_eq!(run.code, 0, "{variant}: {}", run.document);
        for name in ["bom.csv", "cpl.csv"] {
            let expected = std::fs::read(golden(directory, name)).unwrap();
            let actual = std::fs::read(output.join(name)).unwrap();
            assert!(
                expected == actual,
                "{variant}/{name}: the CSV differs from the golden ({} bytes vs {} expected)",
                actual.len(),
                expected.len()
            );
        }
        for name in ["bom.xlsx", "cpl.xlsx"] {
            assert!(
                output.join(name).is_file(),
                "{variant}/{name} was not written"
            );
        }
        let _ = std::fs::remove_dir_all(&output);
    }
}

#[test]
fn an_unknown_vendor_is_vendor_unknown() {
    let run = support::run(&[
        "vendor",
        "run",
        "not-a-vendor",
        "--in",
        support::s(&bundle()),
        "--config",
        support::s(&config()),
        "-o",
        support::s(&support::scratch("vendor-unknown")),
    ]);
    assert_eq!(run.code, 2);
    assert_eq!(run.code_field(), "vendor-unknown");
}

#[test]
fn an_unknown_variant_is_variant_unknown() {
    let run = support::run(&[
        "vendor",
        "run",
        "jlcpcb",
        "--in",
        support::s(&bundle()),
        "--config",
        support::s(&config()),
        "-o",
        support::s(&support::scratch("vendor-variant-unknown")),
        "--variant",
        "not-a-variant",
    ]);
    assert_eq!(run.code, 2);
    assert_eq!(run.code_field(), "variant-unknown");
    let message = run.document["message"].as_str().unwrap_or_default();
    assert!(message.contains("not-a-variant"), "{message}");
    assert!(message.contains("default"), "{message}");
    assert!(message.contains("dnp-led"), "{message}");
    assert!(message.contains("assembly-reduced"), "{message}");
}

#[test]
fn vendor_list_names_the_registered_vendors() {
    let run = support::run(&["vendor", "list"]);
    assert_eq!(run.code, 0);
    assert_eq!(run.document["schema"], "prism.cli.vendor_list.a0");
    assert_eq!(run.document["vendors"][0]["id"], "jlcpcb");
    assert_eq!(
        run.document["vendors"][0]["config_schema"],
        "prism.vendor.jlcpcb.config.a0"
    );
}
