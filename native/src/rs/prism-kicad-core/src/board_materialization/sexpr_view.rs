//! Deterministic S-expression debug view of a materialization document.
//!
//! The view is generated from the JSON form with sorted keys, so it is
//! byte-stable for a given document. Objects carrying a `kind` render as
//! `(kind fields...)`; other objects render as `(field value)` lists; an
//! affine renders as `(affine m11 m12 m21 m22 tx_nm ty_nm)` to match the
//! issue #20 sketch. It is a debug view, not a parse target.

use prism_kicad_contracts::generated::materialization_document::MaterializationDocumentA1;
use serde_json::{Map, Value};
use std::fmt::Write as _;

const AFFINE_TERMS: [&str; 6] = ["m11", "m12", "m21", "m22", "tx_nm", "ty_nm"];

/// Render `document` as an indented S-expression.
pub fn materialization_sexpr(document: &MaterializationDocumentA1) -> String {
    let value = serde_json::to_value(document).unwrap_or(Value::Null);
    let mut output = String::new();
    match value.as_object() {
        Some(fields) => write_object("pcb_analytic_materialization", fields, 0, &mut output),
        None => output.push_str("(pcb_analytic_materialization)"),
    }
    output.push('\n');
    output
}

fn indent(depth: usize, output: &mut String) {
    output.push('\n');
    output.push_str(&"  ".repeat(depth));
}

fn write_object(head: &str, fields: &Map<String, Value>, depth: usize, output: &mut String) {
    output.push('(');
    output.push_str(head);
    let mut keys: Vec<&String> = fields.keys().filter(|key| key.as_str() != "kind").collect();
    keys.sort();
    for key in keys {
        if let Some(value) = fields.get(key) {
            indent(depth + 1, output);
            write_field(key, value, depth + 1, output);
        }
    }
    output.push(')');
}

fn write_field(key: &str, value: &Value, depth: usize, output: &mut String) {
    match value {
        Value::Object(fields) if key == "affine" => write_affine(fields, output),
        Value::Object(fields) => write_object_value(key, fields, depth, output),
        Value::Array(items) if items.iter().all(is_scalar) => {
            output.push('(');
            output.push_str(key);
            for item in items {
                output.push(' ');
                write_scalar(item, output);
            }
            output.push(')');
        }
        Value::Array(items) => {
            output.push('(');
            output.push_str(key);
            for item in items {
                indent(depth + 1, output);
                write_element(item, depth + 1, output);
            }
            output.push(')');
        }
        scalar => {
            let _ = write!(output, "({key} ");
            write_scalar(scalar, output);
            output.push(')');
        }
    }
}

/// A field holding an object: tagged objects nest under the field name,
/// plain objects become the field's own list.
fn write_object_value(key: &str, fields: &Map<String, Value>, depth: usize, output: &mut String) {
    match fields.get("kind").and_then(Value::as_str) {
        Some(kind) => {
            output.push('(');
            output.push_str(key);
            indent(depth + 1, output);
            write_object(kind, fields, depth + 1, output);
            output.push(')');
        }
        None => write_object(key, fields, depth, output),
    }
}

fn write_element(value: &Value, depth: usize, output: &mut String) {
    match value {
        Value::Object(fields) => {
            let head = fields.get("kind").and_then(Value::as_str).unwrap_or("item");
            write_object(head, fields, depth, output);
        }
        Value::Array(items) => {
            output.push('(');
            for (position, item) in items.iter().enumerate() {
                if position > 0 {
                    output.push(' ');
                }
                write_element(item, depth, output);
            }
            output.push(')');
        }
        scalar => write_scalar(scalar, output),
    }
}

fn write_affine(fields: &Map<String, Value>, output: &mut String) {
    output.push_str("(affine");
    for term in AFFINE_TERMS {
        output.push(' ');
        write_scalar(fields.get(term).unwrap_or(&Value::Null), output);
    }
    output.push(')');
}

fn is_scalar(value: &Value) -> bool {
    !matches!(value, Value::Array(_) | Value::Object(_))
}

fn write_scalar(value: &Value, output: &mut String) {
    match value {
        Value::String(text) => {
            output.push('"');
            for character in text.chars() {
                if matches!(character, '"' | '\\') {
                    output.push('\\');
                }
                output.push(character);
            }
            output.push('"');
        }
        Value::Number(number) => write_number(number, output),
        Value::Bool(flag) => output.push_str(if *flag { "yes" } else { "no" }),
        Value::Null => output.push_str("null"),
        Value::Array(_) | Value::Object(_) => {}
    }
}

/// Integral floats print without a fractional part so affine terms read as
/// `0 1 -1 0`.
fn write_number(number: &serde_json::Number, output: &mut String) {
    if let Some(value) = number.as_f64().filter(|_| number.is_f64())
        && value.fract() == 0.0
        && value.abs() < 9.0e15
    {
        let _ = write!(output, "{}", value as i64);
        return;
    }
    let _ = write!(output, "{number}");
}
