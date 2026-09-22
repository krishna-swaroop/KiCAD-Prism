use serde_json::Value;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn required_string<'a>(value: &'a Value, pointer: &str) -> &'a str {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("Geometer SDK manifest is missing {pointer}"))
}

fn library_name(path: &str) -> String {
    let filename = Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_else(|| panic!("invalid Geometer archive path: {path}"));
    filename
        .strip_prefix("lib")
        .unwrap_or(filename)
        .strip_suffix(".a")
        .or_else(|| filename.strip_suffix(".lib"))
        .unwrap_or_else(|| panic!("unsupported Geometer archive name: {filename}"))
        .to_owned()
}

fn emit_archive(root: &Path, relative: &str) {
    assert!(
        root.join(relative).is_file(),
        "missing Geometer archive {relative}"
    );
    println!("cargo:rustc-link-lib=static={}", library_name(relative));
}

fn archive_path(root: &Path, relative: &str) -> String {
    let path = root.join(relative);
    assert!(path.is_file(), "missing Geometer archive {relative}");
    path.to_string_lossy().into_owned()
}

fn main() {
    println!("cargo:rustc-check-cfg=cfg(geometer_sdk)");
    println!("cargo:rerun-if-env-changed=GEOMETER_SDK_DIR");
    let Ok(raw_sdk) = env::var("GEOMETER_SDK_DIR") else {
        return;
    };
    let sdk = PathBuf::from(raw_sdk)
        .canonicalize()
        .expect("GEOMETER_SDK_DIR must be an extracted Geometer SDK");
    let manifest_path = sdk.join("share/geometer/geometer-sdk.json");
    println!("cargo:rerun-if-changed={}", manifest_path.display());
    let manifest: Value = serde_json::from_slice(
        &fs::read(&manifest_path).expect("could not read Geometer SDK manifest"),
    )
    .expect("could not decode Geometer SDK manifest");
    assert_eq!(
        required_string(&manifest, "/schema"),
        "wn.geometer.static_sdk.a0",
        "unsupported Geometer SDK manifest"
    );
    assert_eq!(
        required_string(&manifest, "/target_triple"),
        env::var("TARGET").expect("Cargo TARGET is missing"),
        "Geometer SDK target does not match Cargo target"
    );

    println!("cargo:rustc-cfg=geometer_sdk");
    println!(
        "cargo:rustc-link-search=native={}",
        sdk.join("lib").display()
    );
    println!(
        "cargo:rustc-link-search=native={}",
        sdk.join("lib/occt").display()
    );
    let entries = manifest
        .pointer("/link/entries")
        .and_then(Value::as_array)
        .expect("Geometer SDK manifest is missing link entries");

    let mut archives = vec![required_string(&manifest, "/archives/geometer")];
    archives.extend(
        entries
            .iter()
            .filter(|entry| required_string(entry, "/kind") == "archive")
            .map(|entry| required_string(entry, "/value")),
    );
    let linux = env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux");
    if linux {
        // Geometer's Linux SDK contains static OCCT archives with intentional
        // cyclic dependencies. GNU ld resolves those only when they are in an
        // archive group; macOS and Windows linkers do not need this treatment.
        println!("cargo:rustc-link-arg=-Wl,--start-group");
        for archive in archives {
            println!("cargo:rustc-link-arg={}", archive_path(&sdk, archive));
        }
        println!("cargo:rustc-link-arg=-Wl,--end-group");
    } else {
        for archive in archives {
            emit_archive(&sdk, archive);
        }
    }

    for entry in entries {
        let kind = required_string(entry, "/kind");
        let value = required_string(entry, "/value");
        match kind {
            "archive" => {}
            // `rustc-link-arg` keeps Linux system libraries after the static
            // archive group. With --as-needed, emitting them as link-lib puts
            // them too early and glibc/libstdc++ symbols remain unresolved.
            "system_library" if linux => println!("cargo:rustc-link-arg=-l{value}"),
            "system_library" => println!("cargo:rustc-link-lib={value}"),
            "apple_framework" => println!("cargo:rustc-link-lib=framework={value}"),
            _ => panic!("unsupported Geometer link entry kind: {kind}"),
        }
    }
    if linux {
        println!("cargo:rustc-link-arg=-latomic");
        println!("cargo:rustc-link-arg=-lgcc");
        println!("cargo:rustc-link-arg=-lc");
    }
}
