//! Writing `-o` atomically (cli-spec.md §5.2.5): a hidden exclusive temp file
//! in `-o`'s directory, streamed, fsynced, self-verified, compared with the
//! `--in` the build read when they are the same file, renamed over `-o`, and
//! the directory fsynced. Any failure before the rename removes the temp
//! file and leaves `-o` as it was.

#[cfg(windows)]
use crate::process;
use prism_bundle::generator::{hex, sha256_hex};
use prism_bundle::stages::Built;
use prism_bundle::temp;
use prism_bundle::verify::{Depth, verify};
use prism_bundle::zip::{FileSource, ZipIndex};
use prism_bundle::{Failure, Limits, Outcome};
use sha2::{Digest, Sha256};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static SERIAL: AtomicU64 = AtomicU64::new(0);

/// The archive as written.
pub struct Written {
    /// File size.
    pub bytes: u64,
    /// SHA-256 hex of the file.
    pub sha256: String,
}

struct Hashing<W> {
    inner: W,
    hasher: Sha256,
}

impl<W: Write> Write for Hashing<W> {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        let written = self.inner.write(bytes)?;
        self.hasher.update(&bytes[..written]);
        Ok(written)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

fn write_failed(message: String) -> Failure {
    Failure::output("output-write-failed", message).argument("output")
}

/// The `--in` file this invocation built on, and its `bundle.json` digest.
pub struct InputGuard<'a> {
    /// The `--in` path.
    pub path: &'a Path,
    /// SHA-256 of the `bundle.json` read at the start.
    pub manifest_sha256: &'a str,
}

#[cfg(unix)]
fn same_file(a: &Path, b: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    match (std::fs::metadata(a), std::fs::metadata(b)) {
        (Ok(a), Ok(b)) => a.dev() == b.dev() && a.ino() == b.ino(),
        _ => false,
    }
}

/// Same volume and file index.
#[cfg(windows)]
fn same_file(a: &Path, b: &Path) -> bool {
    matches!(
        (process::file_identity(a), process::file_identity(b)),
        (Some(a), Some(b)) if a == b
    )
}

fn manifest_digest(path: &Path, limits: &Limits) -> Option<String> {
    let source = FileSource::new(std::fs::File::open(path).ok()?).ok()?;
    let index = ZipIndex::open(&source, limits).ok()?;
    let first = index.entries.first()?;
    index
        .read(&source, first)
        .ok()
        .map(|bytes| sha256_hex(&bytes))
}

struct Temp {
    path: PathBuf,
    armed: bool,
}

impl Drop for Temp {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_file(&self.path);
            temp::unregister(&self.path);
        }
    }
}

/// Write `built` to `output`.
pub fn write(
    built: &Built,
    output: &Path,
    guard: Option<InputGuard<'_>>,
    limits: &Limits,
    generator_bytes: &[u8],
) -> Outcome<Written> {
    let name = output
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| write_failed("-o does not name a file".to_owned()))?;
    let dir = match output.parent() {
        Some(dir) if !dir.as_os_str().is_empty() => dir.to_path_buf(),
        _ => PathBuf::from("."),
    };
    if !dir.is_dir() {
        return Err(write_failed("-o's directory does not exist".to_owned()));
    }
    let serial = SERIAL.fetch_add(1, Ordering::Relaxed);
    let mut temp = Temp {
        path: dir.join(format!(
            ".{name}.prism-kicad-{}-{serial}.tmp",
            std::process::id()
        )),
        armed: false,
    };
    let file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp.path)
        .map_err(|error| write_failed(format!("the temp file could not be created: {error}")))?;
    temp.armed = true;
    temp::register(temp.path.clone());
    let hashing = Hashing {
        inner: BufWriter::new(file),
        hasher: Sha256::new(),
    };
    let (hashing, bytes) = built.write(hashing, limits)?;
    let file = hashing
        .inner
        .into_inner()
        .map_err(|error| write_failed(format!("the archive could not be written: {error}")))?;
    file.sync_all()
        .map_err(|error| write_failed(format!("the archive could not be synced: {error}")))?;
    drop(file);
    let sha256 = hex(&hashing.hasher.finalize());
    self_verify(&temp.path, limits, generator_bytes)?;
    if let Some(guard) = guard
        && same_file(guard.path, output)
        && manifest_digest(output, limits).as_deref() != Some(guard.manifest_sha256)
    {
        return Err(
            Failure::precondition("output-changed", "-o changed while the stage ran")
                .argument("output"),
        );
    }
    std::fs::rename(&temp.path, output).map_err(|error| {
        write_failed(format!(
            "the archive could not be renamed into place: {error}"
        ))
    })?;
    temp.armed = false;
    temp::unregister(&temp.path);
    if let Ok(directory) = std::fs::File::open(&dir) {
        let _ = directory.sync_all();
    }
    Ok(Written { bytes, sha256 })
}

fn self_verify(path: &Path, limits: &Limits, generator_bytes: &[u8]) -> Outcome<()> {
    let file = std::fs::File::open(path)
        .map_err(|error| write_failed(format!("the temp file could not be re-read: {error}")))?;
    let source = FileSource::new(file)
        .map_err(|error| write_failed(format!("the temp file could not be re-read: {error}")))?;
    let report = verify(&source, limits, generator_bytes, Depth::SelfVerify);
    match report.findings.first() {
        None => Ok(()),
        Some(finding) => {
            let mut failure = Failure::internal(format!(
                "the written archive does not verify: {}",
                finding.message
            ));
            failure.finding.code = "self-verify-failed".to_owned();
            failure.finding.location = finding.location.clone();
            Err(failure)
        }
    }
}
