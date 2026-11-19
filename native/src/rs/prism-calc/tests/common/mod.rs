//! Shared fixture loading for the spec-vector tests.
#![allow(dead_code, reason = "each test binary uses a subset of the helpers")]

use serde_json::Value;

pub struct Case {
    pub id: String,
    pub inputs: Value,
    pub expected: Value,
    pub rel_tol: f64,
}

impl Case {
    pub fn input(&self, key: &str) -> f64 {
        self.inputs[key]
            .as_f64()
            .unwrap_or_else(|| panic!("{}: missing input {key}", self.id))
    }

    pub fn input_str(&self, key: &str) -> &str {
        self.inputs[key]
            .as_str()
            .unwrap_or_else(|| panic!("{}: missing input {key}", self.id))
    }

    pub fn expect(&self, key: &str, actual: f64) {
        let want = self.expected[key]
            .as_f64()
            .unwrap_or_else(|| panic!("{}: missing expected {key}", self.id));
        let err = (actual - want).abs() / want.abs().max(1e-300);
        assert!(
            err <= self.rel_tol,
            "{} {key}: got {actual}, want {want} (rel err {err:e} > {})",
            self.id,
            self.rel_tol
        );
    }
}

/// Cases from `fixtures/<spec>.json` whose `model` equals `model`.
pub fn cases(spec: &str, model: &str) -> Vec<Case> {
    let path = format!("{}/tests/fixtures/{spec}.json", env!("CARGO_MANIFEST_DIR"));
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    let doc: Value = serde_json::from_str(&text).expect("valid fixture JSON");
    let out: Vec<Case> = doc["cases"]
        .as_array()
        .expect("cases array")
        .iter()
        .filter(|c| c["model"] == model)
        .map(|c| Case {
            id: c["id"].as_str().unwrap_or_default().to_owned(),
            inputs: c["inputs"].clone(),
            expected: c["expected"].clone(),
            rel_tol: c["rel_tol"].as_f64().unwrap_or(1e-9),
        })
        .collect();
    assert!(!out.is_empty(), "no {model} cases in {spec}.json");
    out
}
