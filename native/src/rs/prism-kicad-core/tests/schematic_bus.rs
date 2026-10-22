use prism_kicad_contracts::generated::source_bundle_manifest::{
    SourceBundleManifestA0, SourceBundleSource, SourceKind,
};
use prism_kicad_core::{
    SchematicBundleIndex, SchematicBundleLimits, SchematicBusExpansionErrorKind,
    SchematicBusExpansionLimits, SourceBundle, SourceBundleErrorKind, SourceBundleLimits,
    canonical_bus_member_name, expand_schematic_bus_label, is_schematic_bus_label,
    parse_schematic_bus_group, parse_schematic_bus_vector,
};
use std::collections::HashMap;

#[test]
fn vector_parity_covers_order_suffixes_and_invalid_forms() {
    let limits = SchematicBusExpansionLimits::default();
    let parsed = parse_schematic_bus_vector("D[7..0]", limits)
        .expect("descending vector")
        .expect("vector syntax");
    assert_eq!(parsed.prefix, "D");
    assert_eq!(
        parsed.members,
        ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7"]
    );
    for (text, expected) in [
        ("DIFF[0..1]+", ["DIFF0+", "DIFF1+"]),
        ("D[0..1]-", ["D0-", "D1-"]),
        ("DP[0..1]P", ["DP0P", "DP1P"]),
        ("DN[0..1]N", ["DN0N", "DN1N"]),
    ] {
        assert_eq!(
            parse_schematic_bus_vector(text, limits)
                .expect("valid suffixed vector")
                .expect("vector")
                .members,
            expected
        );
    }
    for text in [
        "X[3..3]", "D[0..1]Z", "[0..3]", "D[0..3", "D[A..B]", "D[..3]", "D[1..]", "VCC", "{A,B,C}",
    ] {
        assert_eq!(
            parse_schematic_bus_vector(text, limits).expect("invalid form"),
            None,
            "{text}"
        );
    }
}

#[test]
fn group_parity_covers_separators_prefixes_and_recursive_members() {
    let limits = SchematicBusExpansionLimits::default();
    for (text, prefix, members) in [
        ("{A,B,C}", "", vec!["A", "B", "C"]),
        ("{A B C}", "", vec!["A", "B", "C"]),
        ("MIX{A,B}", "MIX", vec!["A", "B"]),
        ("{D[0..3],CLK}", "", vec!["D[0..3]", "CLK"]),
        ("{A, B,C  D}", "", vec!["A", "B", "C", "D"]),
    ] {
        let parsed = parse_schematic_bus_group(text, limits)
            .expect("valid group")
            .expect("group syntax");
        assert_eq!(parsed.prefix, prefix);
        assert_eq!(parsed.members, members, "{text}");
    }
    for text in ["{A,B,C", "{A,B}xx", "ABC", "{}", "My Bus{A B}"] {
        assert_eq!(
            parse_schematic_bus_group(text, limits).expect("invalid group"),
            None,
            "{text}"
        );
    }
}

#[test]
fn current_kicad_formatting_quoting_and_escaping_vectors_are_preserved() {
    let limits = SchematicBusExpansionLimits::default();
    for (text, prefix, members) in [
        ("D_{[1..2]}", "D", vec!["D1", "D2"]),
        (
            "bus_~{label}[0..2]",
            "bus_~{label}",
            vec!["bus_~{label}0", "bus_~{label}1", "bus_~{label}2"],
        ),
        (
            "bus_^{label}[0..2]",
            "bus_^{label}",
            vec!["bus_^{label}0", "bus_^{label}1", "bus_^{label}2"],
        ),
        (
            "bus__{label}[0..2]",
            "bus__{label}",
            vec!["bus__{label}0", "bus__{label}1", "bus__{label}2"],
        ),
        (
            "\"Data Bus\"[1..2]",
            "Data Bus",
            vec!["Data Bus1", "Data Bus2"],
        ),
        (
            "Data\\ Bus[1..2]",
            "Data Bus",
            vec!["Data Bus1", "Data Bus2"],
        ),
        ("I^{2}C[0..1]", "I^{2}C", vec!["I^{2}C0", "I^{2}C1"]),
        (
            "~{BE[0..3]}",
            "~{BE",
            vec!["~{BE0}", "~{BE1}", "~{BE2}", "~{BE3}"],
        ),
    ] {
        let parsed = parse_schematic_bus_vector(text, limits)
            .expect("KiCad vector")
            .expect("vector syntax");
        assert_eq!(parsed.prefix, prefix, "{text}");
        assert_eq!(parsed.members, members, "{text}");
    }

    for (text, prefix, members) in [
        (
            "MEM{D_{[1..2]} ~{LATCH}}",
            "MEM",
            vec!["D_{[1..2]}", "~{LATCH}"],
        ),
        ("My\\ Bus{NET1 NET2}", "My Bus", vec!["NET1", "NET2"]),
        ("\"My Bus\"{NET1 NET2}", "My Bus", vec!["NET1", "NET2"]),
        (
            "BUS{Net\\ One Net\\ Two}",
            "BUS",
            vec!["Net\\ One", "Net\\ Two"],
        ),
        (
            "BUS{\"Net One\" \"Net Two\"}",
            "BUS",
            vec!["Net\\ One", "Net\\ Two"],
        ),
        (
            "MEM{~{CAS} ~{RAS} ~{WE} A[2..0]}",
            "MEM",
            vec!["~{CAS}", "~{RAS}", "~{WE}", "A[2..0]"],
        ),
        ("I^{2}C{SDA SCL}", "I^{2}C", vec!["SDA", "SCL"]),
    ] {
        let parsed = parse_schematic_bus_group(text, limits)
            .expect("KiCad group")
            .expect("group syntax");
        assert_eq!(parsed.prefix, prefix, "{text}");
        assert_eq!(parsed.members, members, "{text}");
    }
}

#[test]
fn expansion_matches_kicad_alias_group_and_vector_semantics() {
    let limits = SchematicBusExpansionLimits::default();
    let aliases = HashMap::from([
        (
            "INNER".to_owned(),
            vec!["X[0..1]".to_owned(), "Y".to_owned()],
        ),
        ("OUTER".to_owned(), vec!["INNER".to_owned(), "Z".to_owned()]),
    ]);
    for (text, expected) in [
        ("VCC", vec!["VCC"]),
        ("D[0..2]", vec!["D0", "D1", "D2"]),
        ("{D[0..1]+,CLK}", vec!["D0+", "D1+", "CLK"]),
        ("MIX{A,B}", vec!["MIX.A", "MIX.B"]),
        ("INNER", vec!["X0", "X1", "Y"]),
        // An alias member naming another alias is a signal name (KiCad 10.0.7).
        ("OUTER", vec!["INNER", "Z"]),
        ("TOP{OUTER,CLK}", vec!["TOP.INNER", "TOP.Z", "TOP.CLK"]),
        (
            "BUS{\"Data Bus\"[1..2] PLAIN}",
            vec!["BUS.Data Bus1", "BUS.Data Bus2", "BUS.PLAIN"],
        ),
    ] {
        assert_eq!(
            expand_schematic_bus_label(text, &aliases, limits).expect("bus expansion"),
            expected,
            "{text}"
        );
    }
    assert_eq!(canonical_bus_member_name("ADC0{slash}GPIO0"), "ADC0/GPIO0");
}

#[test]
fn predicate_recognizes_only_valid_vector_and_group_forms() {
    let limits = SchematicBusExpansionLimits::default();
    for text in ["D[7..0]", "D[0..1]+", "{A,B,C}", "MIX{A,B}"] {
        assert!(is_schematic_bus_label(text, limits).expect("bus predicate"));
    }
    for text in ["VCC", "/SIG", "Net-(R1-1)", "GND"] {
        assert!(!is_schematic_bus_label(text, limits).expect("plain predicate"));
    }
}

#[test]
fn expansion_limits_fail_before_unbounded_growth() {
    let defaults = SchematicBusExpansionLimits::default();
    let exact = parse_schematic_bus_vector(
        "D[0..2]",
        SchematicBusExpansionLimits {
            max_expanded_members: 3,
            max_parsed_member_bytes: 6,
            ..defaults
        },
    )
    .expect("exact vector limits")
    .expect("vector");
    assert_eq!(exact.members, ["D0", "D1", "D2"]);
    for limits in [
        SchematicBusExpansionLimits {
            max_expanded_members: 2,
            ..defaults
        },
        SchematicBusExpansionLimits {
            max_parsed_member_bytes: 5,
            ..defaults
        },
        SchematicBusExpansionLimits {
            max_input_bytes: 6,
            ..defaults
        },
    ] {
        let error =
            parse_schematic_bus_vector("D[0..2]", limits).expect_err("one-over vector limit");
        assert_eq!(error.kind, SchematicBusExpansionErrorKind::ResourceLimit);
    }
    let huge = parse_schematic_bus_vector(
        "D[0..2147483647]",
        SchematicBusExpansionLimits {
            max_expanded_members: 4,
            ..defaults
        },
    )
    .expect_err("huge vector rejected before allocation");
    assert_eq!(huge.kind, SchematicBusExpansionErrorKind::ResourceLimit);
}

#[test]
fn group_alias_work_and_depth_limits_are_independent() {
    let defaults = SchematicBusExpansionLimits::default();
    let group_error = parse_schematic_bus_group(
        "{A,B,C}",
        SchematicBusExpansionLimits {
            max_group_members: 2,
            ..defaults
        },
    )
    .expect_err("group member ceiling");
    assert_eq!(
        group_error.kind,
        SchematicBusExpansionErrorKind::ResourceLimit
    );
    let escaped = parse_schematic_bus_group(
        "{A/B}",
        SchematicBusExpansionLimits {
            max_parsed_member_bytes: 9,
            ..defaults
        },
    )
    .expect("exact escaped member bytes")
    .expect("escaped group");
    assert_eq!(escaped.members, ["A{slash}B"]);
    let escaped_error = parse_schematic_bus_group(
        "{A/B}",
        SchematicBusExpansionLimits {
            max_parsed_member_bytes: 8,
            ..defaults
        },
    )
    .expect_err("one-over escaped member bytes");
    assert_eq!(
        escaped_error.kind,
        SchematicBusExpansionErrorKind::ResourceLimit
    );

    let aliases = HashMap::from([
        ("A".to_owned(), vec!["B".to_owned()]),
        ("B".to_owned(), vec!["C".to_owned()]),
        ("C".to_owned(), vec!["A".to_owned()]),
        (
            "SELF".to_owned(),
            vec!["SELF".to_owned(), "SELF2".to_owned()],
        ),
    ]);
    assert_eq!(
        expand_schematic_bus_label("A", &aliases, defaults).expect("alias members are names"),
        ["B"]
    );
    assert_eq!(
        expand_schematic_bus_label("SELF", &aliases, defaults).expect("self-named member"),
        ["SELF", "SELF2"]
    );
    let grouped = HashMap::from([("A".to_owned(), vec!["X{A}".to_owned()])]);
    let cycle = expand_schematic_bus_label("A", &grouped, defaults)
        .expect_err("a group re-entering its alias must fail closed");
    assert_eq!(cycle.kind, SchematicBusExpansionErrorKind::AliasCycle);

    let deep = HashMap::from([
        ("A".to_owned(), vec!["X{B}".to_owned()]),
        ("B".to_owned(), vec!["Y{C}".to_owned()]),
        ("C".to_owned(), vec!["leaf".to_owned()]),
    ]);
    let depth = expand_schematic_bus_label(
        "A",
        &deep,
        SchematicBusExpansionLimits {
            max_nesting_depth: 2,
            ..defaults
        },
    )
    .expect_err("alias depth limit");
    assert_eq!(depth.kind, SchematicBusExpansionErrorKind::ResourceLimit);

    let fanout = HashMap::from([(
        "A".to_owned(),
        vec!["X".to_owned(), "Y".to_owned(), "Z".to_owned()],
    )]);
    let work = expand_schematic_bus_label(
        "A",
        &fanout,
        SchematicBusExpansionLimits {
            max_expansion_work_items: 3,
            ..defaults
        },
    )
    .expect_err("work-item ceiling");
    assert_eq!(work.kind, SchematicBusExpansionErrorKind::ResourceLimit);

    let plain_error = expand_schematic_bus_label(
        "LONG",
        &HashMap::new(),
        SchematicBusExpansionLimits {
            max_expanded_output_bytes: 3,
            ..defaults
        },
    )
    .expect_err("plain output byte ceiling");
    assert_eq!(
        plain_error.kind,
        SchematicBusExpansionErrorKind::ResourceLimit
    );
}

#[test]
fn live_work_and_output_budgets_are_independent_at_exact_boundaries() {
    let aliases = HashMap::from([(
        "FAN".to_owned(),
        vec!["AA".to_owned(), "BB".to_owned(), "CC".to_owned()],
    )]);
    let defaults = SchematicBusExpansionLimits::default();
    let exact = SchematicBusExpansionLimits {
        max_expansion_work_items: 4,
        max_expansion_work_bytes: 9,
        max_expanded_members: 3,
        max_expanded_output_bytes: 12,
        ..defaults
    };
    assert_eq!(
        expand_schematic_bus_label("Q{FAN}", &aliases, exact).expect("exact live budgets"),
        ["Q.AA", "Q.BB", "Q.CC"]
    );

    for (limits, message) in [
        (
            SchematicBusExpansionLimits {
                max_expansion_work_items: 3,
                ..exact
            },
            "work items",
        ),
        (
            SchematicBusExpansionLimits {
                max_expansion_work_bytes: 8,
                ..exact
            },
            "work bytes",
        ),
        (
            SchematicBusExpansionLimits {
                max_expanded_members: 2,
                ..exact
            },
            "member count",
        ),
        (
            SchematicBusExpansionLimits {
                max_expanded_output_bytes: 11,
                ..exact
            },
            "member bytes",
        ),
    ] {
        let error = expand_schematic_bus_label("Q{FAN}", &aliases, limits)
            .expect_err("one-over independent expansion budget");
        assert_eq!(error.kind, SchematicBusExpansionErrorKind::ResourceLimit);
        assert!(error.message.contains(message), "{}", error.message);
    }
}

#[test]
fn alias_inputs_and_nested_qualifiers_are_preflighted_before_cloning() {
    let oversized = HashMap::from([("A".to_owned(), vec!["X".repeat(1_024)])]);
    let error = expand_schematic_bus_label(
        "A",
        &oversized,
        SchematicBusExpansionLimits {
            max_input_bytes: 16,
            ..SchematicBusExpansionLimits::default()
        },
    )
    .expect_err("oversized borrowed alias member");
    assert_eq!(error.kind, SchematicBusExpansionErrorKind::ResourceLimit);
    assert!(error.message.contains("expression bytes"));

    let defaults = SchematicBusExpansionLimits::default();
    let exact = SchematicBusExpansionLimits {
        max_expansion_work_items: 4,
        max_expansion_work_bytes: 30,
        max_expanded_members: 3,
        max_expanded_output_bytes: 33,
        ..defaults
    };
    let aliases = HashMap::from([("INNER".to_owned(), vec!["SUB{A,B,C}".to_owned()])]);
    let text = "OUTER{INNER}";
    assert_eq!(
        expand_schematic_bus_label(text, &aliases, exact).expect("exact nested qualifier budgets"),
        ["OUTER.SUB.A", "OUTER.SUB.B", "OUTER.SUB.C"]
    );
    let error = expand_schematic_bus_label(
        text,
        &aliases,
        SchematicBusExpansionLimits {
            max_expansion_work_items: 3,
            ..exact
        },
    )
    .expect_err("nested qualifier one item over work limit");
    assert_eq!(error.kind, SchematicBusExpansionErrorKind::ResourceLimit);
    assert!(error.message.contains("work items"));
    let error = expand_schematic_bus_label(
        text,
        &aliases,
        SchematicBusExpansionLimits {
            max_expansion_work_bytes: 29,
            ..exact
        },
    )
    .expect_err("nested qualifier one byte over work limit");
    assert_eq!(error.kind, SchematicBusExpansionErrorKind::ResourceLimit);
    assert!(error.message.contains("work bytes"));
}

#[test]
fn empty_aliases_do_not_consume_nonexistent_child_depth() {
    let aliases = HashMap::from([("EMPTY".to_owned(), Vec::new())]);
    let root_limits = SchematicBusExpansionLimits {
        max_nesting_depth: 0,
        ..SchematicBusExpansionLimits::default()
    };
    assert_eq!(
        expand_schematic_bus_label("EMPTY", &aliases, root_limits).expect("empty root alias"),
        Vec::<String>::new()
    );
    let nested_limits = SchematicBusExpansionLimits {
        max_nesting_depth: 1,
        ..SchematicBusExpansionLimits::default()
    };
    assert_eq!(
        expand_schematic_bus_label("Q{EMPTY}", &aliases, nested_limits)
            .expect("empty alias exactly at nested depth limit"),
        Vec::<String>::new()
    );
}

#[test]
fn alias_fanout_count_is_rejected_before_member_content_scan() {
    let aliases = HashMap::from([("FAN".to_owned(), vec!["OK".to_owned(), "X".repeat(1_024)])]);
    let error = expand_schematic_bus_label(
        "FAN",
        &aliases,
        SchematicBusExpansionLimits {
            max_input_bytes: 16,
            max_expansion_work_items: 2,
            ..SchematicBusExpansionLimits::default()
        },
    )
    .expect_err("fanout plus alias sentinel exceeds the work-item limit");
    assert_eq!(error.kind, SchematicBusExpansionErrorKind::ResourceLimit);
    assert!(error.message.contains("work items"), "{}", error.message);
}

#[test]
fn schematic_bus_aliases_are_typed_in_source_order_and_bounded() {
    let root = br#"(kicad_sch
      (bus_alias "MEM" (members "A0" "A1"))
      (bus_alias "CTRL" (members "CLK")))"#
        .to_vec();
    let source = bundle(root);
    let index = SchematicBundleIndex::build(&source, SchematicBundleLimits::default())
        .expect("typed bus aliases");
    let aliases = &index
        .definition("design/root.kicad_sch")
        .expect("root definition")
        .bus_aliases;
    assert_eq!(aliases.len(), 2);
    assert_eq!(aliases[0].name, "MEM");
    assert_eq!(aliases[0].members, ["A0", "A1"]);
    assert_eq!(aliases[1].name, "CTRL");
    assert_eq!(aliases[1].members, ["CLK"]);

    for limits in [
        SchematicBundleLimits {
            max_bus_aliases_per_source: 1,
            ..SchematicBundleLimits::default()
        },
        SchematicBundleLimits {
            max_bus_alias_members_per_source: 2,
            ..SchematicBundleLimits::default()
        },
    ] {
        let error =
            SchematicBundleIndex::build(&source, limits).expect_err("bus alias source limit");
        assert_eq!(error.kind, SourceBundleErrorKind::ResourceLimit);
    }
    SchematicBundleIndex::build(
        &source,
        SchematicBundleLimits {
            max_bus_aliases_per_source: 2,
            max_bus_alias_members_per_source: 3,
            ..SchematicBundleLimits::default()
        },
    )
    .expect("exact bus alias source limits");
}

fn bundle(root: Vec<u8>) -> SourceBundle {
    let project = b"{}".to_vec();
    let sources = vec![
        descriptor("design/root.kicad_pro", SourceKind::Project, 0, &project),
        descriptor("design/root.kicad_sch", SourceKind::Schematic, 1, &root),
    ];
    SourceBundle::from_manifest(
        SourceBundleManifestA0 {
            project_path: Some("design/root.kicad_pro".to_owned()),
            root_schematic_path: "design/root.kicad_sch".to_owned(),
            schema: "kicad_monkey.source_bundle_manifest.a0".to_owned(),
            sources,
            type_: "kicad_monkey.source_bundle_manifest".to_owned(),
            version: "a0".to_owned(),
        },
        vec![project, root],
        SourceBundleLimits::default(),
    )
    .expect("source bundle")
}

fn descriptor(path: &str, kind: SourceKind, slot: u32, bytes: &[u8]) -> SourceBundleSource {
    SourceBundleSource {
        kind,
        path: path.to_owned(),
        slot: slot.into(),
        source_bytes: bytes.len().to_string().into(),
    }
}
