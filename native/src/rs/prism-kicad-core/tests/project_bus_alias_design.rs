use prism_kicad_contracts::generated::source_bundle_manifest::{
    SourceBundleManifestA0, SourceBundleSource, SourceKind,
};
use prism_kicad_core::{
    SchematicBundleIndex, SchematicBundleLimits, SchematicDesignNetLimits, SourceBundle,
    SourceBundleErrorKind, SourceBundleLimits, build_schematic_scalar_design_nets,
};
use std::path::PathBuf;

#[test]
fn project_only_alias_fixture_matches_the_kicad_hierarchy_oracle() {
    let index = fixture_index();
    assert_eq!(
        index.project_bus_aliases(),
        [prism_kicad_core::ProjectBusAlias {
            name: "CTRL".to_owned(),
            members: vec!["CTRL_A".to_owned(), "CTRL_B".to_owned()],
        }]
    );
    let design = build_schematic_scalar_design_nets(&index, 1, Default::default())
        .expect("project bus-alias design");
    let terminals = design
        .nets
        .iter()
        .filter(|net| matches!(net.name.as_str(), "/CTRL_A" | "/CTRL_B"))
        .map(|net| (net.name.as_str(), terminal_refs(net)))
        .collect::<std::collections::HashMap<_, _>>();
    assert_eq!(terminals["/CTRL_A"], ["TP1.1", "TP101.1"]);
    assert_eq!(terminals["/CTRL_B"], ["TP102.1", "TP2.1"]);
}

#[test]
fn project_alias_bundle_and_design_limits_accept_exact_and_reject_one_under() {
    let bundle = fixture_bundle();
    let exact = SchematicBundleLimits {
        max_bus_aliases_per_source: 1,
        max_bus_alias_members_per_source: 2,
        ..SchematicBundleLimits::default()
    };
    SchematicBundleIndex::build(&bundle, exact).expect("exact project alias limits");
    for limits in [
        SchematicBundleLimits {
            max_bus_aliases_per_source: 0,
            ..exact
        },
        SchematicBundleLimits {
            max_bus_alias_members_per_source: 1,
            ..exact
        },
    ] {
        let error = SchematicBundleIndex::build(&bundle, limits).expect_err("one under");
        assert_eq!(error.kind, SourceBundleErrorKind::ResourceLimit);
    }

    let compact = project_alias_limit_bundle();
    SchematicBundleIndex::build(
        &compact,
        SchematicBundleLimits {
            max_bus_aliases_per_source: 1,
            max_bus_alias_members_per_source: 2,
            max_decoded_string_bytes: 3,
            ..exact
        },
    )
    .expect("exact project alias string budget");
    let error = SchematicBundleIndex::build(
        &compact,
        SchematicBundleLimits {
            max_bus_aliases_per_source: 1,
            max_bus_alias_members_per_source: 2,
            max_decoded_string_bytes: 2,
            ..exact
        },
    )
    .expect_err("one-under project alias string budget");
    assert_eq!(error.kind, SourceBundleErrorKind::ResourceLimit);

    let index = fixture_index();
    build_schematic_scalar_design_nets(
        &index,
        1,
        SchematicDesignNetLimits {
            max_design_bus_aliases: 1,
            ..SchematicDesignNetLimits::default()
        },
    )
    .expect("exact project alias design limit");
    let error = build_schematic_scalar_design_nets(
        &index,
        1,
        SchematicDesignNetLimits {
            max_design_bus_aliases: 0,
            ..SchematicDesignNetLimits::default()
        },
    )
    .expect_err("one-under project alias design limit");
    assert_eq!(error.kind, SourceBundleErrorKind::ResourceLimit);
}

#[test]
fn project_aliases_override_legacy_and_keep_unrelated_legacy_aliases() {
    let overriding = modified_fixture_bundle(
        serde_json::json!({"CTRL": ["CTRL_A", "CTRL_B"]}),
        &["OLD_A", "OLD_B"],
    );
    assert_eq!(merged_net_count(&overriding), 2);

    let empty_override =
        modified_fixture_bundle(serde_json::json!({"CTRL": []}), &["CTRL_A", "CTRL_B"]);
    assert_eq!(merged_net_count(&empty_override), 0);

    let unrelated = modified_fixture_bundle(
        serde_json::json!({"PROJECT_ONLY": ["P0"]}),
        &["CTRL_A", "CTRL_B"],
    );
    assert_eq!(merged_net_count(&unrelated), 2);
}

#[test]
fn project_alias_members_naming_aliases_are_signal_names() {
    // KiCad 10.0.7 netlists of this fixture: only CTRL_B stays bused across the
    // hierarchy when CTRL's other member names an alias, cyclic or not.
    let nested = modified_fixture_bundle(
        serde_json::json!({"CTRL": ["INNER", "CTRL_B"], "INNER": ["CTRL_A"]}),
        &[],
    );
    assert_eq!(merged_net_count(&nested), 1);

    let cyclic = modified_fixture_bundle(
        serde_json::json!({"CTRL": ["SECOND", "CTRL_B"], "SECOND": ["CTRL"]}),
        &[],
    );
    assert_eq!(merged_net_count(&cyclic), 1);
}

fn merged_net_count(bundle: &SourceBundle) -> usize {
    let index = SchematicBundleIndex::build(bundle, SchematicBundleLimits::default())
        .expect("project alias index");
    build_schematic_scalar_design_nets(&index, 1, Default::default())
        .expect("project alias design")
        .nets
        .iter()
        .filter(|net| net.terminals.len() == 2)
        .count()
}

fn terminal_refs(net: &prism_kicad_core::SchematicDesignNet) -> Vec<String> {
    net.terminals
        .iter()
        .map(|terminal| format!("{}.{}", terminal.designator, terminal.pin))
        .collect()
}

fn fixture_index() -> SchematicBundleIndex {
    SchematicBundleIndex::build(&fixture_bundle(), SchematicBundleLimits::default())
        .expect("project bus-alias schematic index")
}

fn fixture_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("tests/cases/project_bus_alias_hierarchy/input")
}

fn fixture_bundle() -> SourceBundle {
    let root = fixture_root();
    let files = [
        ("project_bus_alias_hierarchy.kicad_pro", SourceKind::Project),
        (
            "project_bus_alias_hierarchy.kicad_sch",
            SourceKind::Schematic,
        ),
        ("member_sheet.kicad_sch", SourceKind::Schematic),
    ];
    let buffers = files
        .iter()
        .map(|(name, _)| std::fs::read(root.join(name)).expect("fixture source"))
        .collect::<Vec<_>>();
    let paths = files
        .iter()
        .map(|(name, kind)| (format!("project-bus-alias/{name}"), *kind))
        .collect::<Vec<_>>();
    source_bundle(&paths, buffers)
}

fn project_alias_limit_bundle() -> SourceBundle {
    source_bundle(
        &[
            ("limits/design.kicad_pro".to_owned(), SourceKind::Project),
            ("limits/design.kicad_sch".to_owned(), SourceKind::Schematic),
        ],
        vec![
            br#"{"schematic":{"bus_aliases":{"A":["B","C"]}}}"#.to_vec(),
            b"(kicad_sch)".to_vec(),
        ],
    )
}

fn modified_fixture_bundle(
    project_aliases: serde_json::Value,
    legacy_members: &[&str],
) -> SourceBundle {
    let root = fixture_root();
    let project = serde_json::to_vec(&serde_json::json!({
        "schematic": {
            "bus_aliases": project_aliases,
            "subpart_first_id": 65,
            "subpart_id_separator": 0,
        }
    }))
    .expect("project JSON");
    let legacy_form = format!(
        "(bus_alias \"CTRL\" (members {}))",
        legacy_members
            .iter()
            .map(|member| format!("\"{member}\""))
            .collect::<Vec<_>>()
            .join(" ")
    );
    let inject_legacy = |name: &str| {
        std::fs::read_to_string(root.join(name))
            .expect("fixture schematic")
            .replacen("(kicad_sch", &format!("(kicad_sch\n  {legacy_form}"), 1)
            .into_bytes()
    };
    source_bundle(
        &[
            (
                "project-bus-alias/project_bus_alias_hierarchy.kicad_pro".to_owned(),
                SourceKind::Project,
            ),
            (
                "project-bus-alias/project_bus_alias_hierarchy.kicad_sch".to_owned(),
                SourceKind::Schematic,
            ),
            (
                "project-bus-alias/member_sheet.kicad_sch".to_owned(),
                SourceKind::Schematic,
            ),
        ],
        vec![
            project,
            inject_legacy("project_bus_alias_hierarchy.kicad_sch"),
            inject_legacy("member_sheet.kicad_sch"),
        ],
    )
}

fn source_bundle(paths: &[(String, SourceKind)], buffers: Vec<Vec<u8>>) -> SourceBundle {
    let sources = paths
        .iter()
        .enumerate()
        .map(|(slot, (path, kind))| descriptor(path, *kind, slot as u32, &buffers[slot]))
        .collect();
    SourceBundle::from_manifest(
        SourceBundleManifestA0 {
            project_path: Some(paths[0].0.clone()),
            root_schematic_path: paths[1].0.clone(),
            schema: "kicad_monkey.source_bundle_manifest.a0".to_owned(),
            sources,
            type_: "kicad_monkey.source_bundle_manifest".to_owned(),
            version: "a0".to_owned(),
        },
        buffers,
        SourceBundleLimits::default(),
    )
    .expect("project alias source bundle")
}

fn descriptor(path: &str, kind: SourceKind, slot: u32, bytes: &[u8]) -> SourceBundleSource {
    SourceBundleSource {
        kind,
        path: path.to_owned(),
        slot: slot.into(),
        source_bytes: bytes.len().to_string().into(),
    }
}
