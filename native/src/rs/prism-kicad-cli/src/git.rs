//! Running `git` for `revision-key` (cli-spec.md §5.5, revision-key.md §3,
//! §9): an environment of `PATH`, `GIT_CONFIG_NOSYSTEM=1`,
//! `GIT_TERMINAL_PROMPT=0` and an empty `HOME`, `--no-optional-locks`, and
//! its own process group so the timeout watchdog can kill it.

use crate::process;
use prism_bundle::{Failure, Outcome};
use std::ffi::OsStr;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

/// What git inherits from the environment. Windows also needs `SystemRoot`
/// and the temp and command-search variables to start at all.
#[cfg(unix)]
const INHERITED_ENV: &[&str] = &["PATH"];
#[cfg(windows)]
const INHERITED_ENV: &[&str] = &["PATH", "SystemRoot", "TEMP", "TMP", "PATHEXT", "COMSPEC"];

static HOME_SERIAL: AtomicU64 = AtomicU64::new(0);

/// A repository and the sanitized environment git runs in.
pub struct Git {
    repo: PathBuf,
    home: PathBuf,
    extra: Vec<String>,
}

/// A git invocation that exited non-zero.
#[derive(Debug)]
pub struct GitError {
    /// Its stderr, trimmed.
    pub stderr: String,
}

impl Drop for Git {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.home);
        prism_bundle::temp::unregister(&self.home);
    }
}

impl Git {
    /// Prepare to run git in `repo`.
    pub fn new(repo: &Path) -> Outcome<Self> {
        let serial = HOME_SERIAL.fetch_add(1, Ordering::Relaxed);
        let home =
            std::env::temp_dir().join(format!("prism-kicad-home-{}-{serial}", std::process::id()));
        std::fs::create_dir_all(&home).map_err(|error| {
            Failure::internal(format!("the empty HOME for git could not be made: {error}"))
        })?;
        prism_bundle::temp::register(home.clone());
        Ok(Self {
            repo: repo.to_path_buf(),
            home,
            extra: Vec::new(),
        })
    }

    /// Add `-c <setting>` to every later invocation.
    pub fn configure(&mut self, setting: String) {
        self.extra.push(setting);
    }

    fn command(&self, directory: &Path, args: &[&OsStr]) -> Command {
        let mut command = Command::new("git");
        command.env_clear();
        for name in INHERITED_ENV {
            if let Some(value) = std::env::var_os(name) {
                command.env(name, value);
            }
        }
        command
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("HOME", &self.home)
            .arg("--no-optional-locks");
        for setting in &self.extra {
            command.arg("-c").arg(setting);
        }
        command.arg("-C").arg(directory).args(args);
        #[cfg(unix)]
        std::os::unix::process::CommandExt::process_group(&mut command, 0);
        command
    }

    /// Run git in the repository with `args`, feeding `stdin`.
    pub fn run(&self, args: &[&str], stdin: Option<&[u8]>) -> Outcome<Result<Vec<u8>, GitError>> {
        let args: Vec<&OsStr> = args.iter().map(OsStr::new).collect();
        self.run_in(&self.repo, &args, stdin)
    }

    /// Run git in `directory` with `args`.
    pub fn run_in(
        &self,
        directory: &Path,
        args: &[&OsStr],
        stdin: Option<&[u8]>,
    ) -> Outcome<Result<Vec<u8>, GitError>> {
        let mut command = self.command(directory, args);
        command
            .stdin(if stdin.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command
            .spawn()
            .map_err(|error| git_failed(&format!("git could not be started: {error}")))?;
        process::track_child(&child);
        if let (Some(bytes), Some(mut pipe)) = (stdin, child.stdin.take()) {
            let bytes = bytes.to_vec();
            std::thread::spawn(move || {
                let _ = pipe.write_all(&bytes);
            });
        }
        let output = child.wait_with_output();
        process::untrack_child();
        let output = output.map_err(|error| git_failed(&format!("git did not finish: {error}")))?;
        if output.status.success() {
            Ok(Ok(output.stdout))
        } else {
            Ok(Err(GitError {
                stderr: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
            }))
        }
    }

    /// Run git and fail `git-failed` on a non-zero exit.
    pub fn must(&self, args: &[&str], stdin: Option<&[u8]>) -> Outcome<Vec<u8>> {
        self.run(args, stdin)?.map_err(|error| {
            git_failed(&format!(
                "git {} failed: {}",
                args.first().copied().unwrap_or_default(),
                first_line(&error.stderr)
            ))
        })
    }

    /// The repository directory.
    #[must_use]
    pub fn repo(&self) -> &Path {
        &self.repo
    }
}

fn first_line(text: &str) -> &str {
    text.lines().next().unwrap_or_default()
}

/// `git-failed`, exit 1 (revision-key.md §11).
pub fn git_failed(message: &str) -> Failure {
    let mut failure = Failure::internal(message.to_owned());
    failure.finding.code = "git-failed".to_owned();
    failure
}

/// Whether `git-lfs` is on `PATH` (`git-lfs.exe` on Windows).
#[must_use]
pub fn lfs_on_path() -> bool {
    let name = if cfg!(windows) {
        "git-lfs.exe"
    } else {
        "git-lfs"
    };
    std::env::var_os("PATH")
        .is_some_and(|paths| std::env::split_paths(&paths).any(|dir| dir.join(name).is_file()))
}

/// Split NUL-terminated records.
pub fn records(output: &[u8]) -> impl Iterator<Item = &[u8]> {
    output
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
}
