//! The process-exit temp registry: every temp file or directory this process
//! creates is registered here so a timeout, signal or out-of-memory guard can
//! remove it before `_exit`, which runs no destructor. The normal path
//! unregisters each path once it has been renamed into place or removed, so
//! cleanup only removes what a guard interrupted.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// A set of temp paths to remove on an abnormal exit.
pub struct Registry(Mutex<BTreeSet<PathBuf>>);

impl Registry {
    /// An empty registry.
    #[must_use]
    pub const fn new() -> Self {
        Self(Mutex::new(BTreeSet::new()))
    }

    /// Remember `path` until [`Registry::unregister`] or [`Registry::remove_all`].
    pub fn register(&self, path: PathBuf) {
        if let Ok(mut paths) = self.0.lock() {
            paths.insert(path);
        }
    }

    /// Forget `path`, which has been renamed into place or removed.
    pub fn unregister(&self, path: &Path) {
        if let Ok(mut paths) = self.0.lock() {
            paths.remove(path);
        }
    }

    /// Remove every registered path, a directory recursively. `try_lock` keeps
    /// the out-of-memory guard from deadlocking when the allocation that
    /// crossed the cap happened inside [`Registry::register`] on this thread;
    /// that guard exits at once, and the paths stay for the next cleanup.
    pub fn remove_all(&self) {
        if let Ok(mut paths) = self.0.try_lock() {
            for path in std::mem::take(&mut *paths) {
                remove(&path);
            }
        }
    }
}

impl Default for Registry {
    fn default() -> Self {
        Self::new()
    }
}

static TEMP_PATHS: Registry = Registry::new();

/// Register `path` with the process registry.
pub fn register(path: PathBuf) {
    TEMP_PATHS.register(path);
}

/// Unregister `path` from the process registry.
pub fn unregister(path: &Path) {
    TEMP_PATHS.unregister(path);
}

/// Remove every path in the process registry.
pub fn remove_all() {
    TEMP_PATHS.remove_all();
}

fn remove(path: &Path) {
    let _ = match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() => std::fs::remove_dir_all(path),
        _ => std::fs::remove_file(path),
    };
}

#[cfg(test)]
mod tests {
    use super::Registry;

    #[test]
    fn cleanup_removes_every_registered_path_including_a_directory() {
        // Its own registry: the process one is shared with tests running in parallel.
        let registry = Registry::new();
        let root = std::env::temp_dir().join(format!("prism-temp-registry-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let kept_file = root.join("kept.tmp");
        let kept_directory = root.join("kept-dir");
        let unregistered = root.join("unregistered.tmp");
        std::fs::write(&kept_file, b"x").unwrap();
        std::fs::create_dir(&kept_directory).unwrap();
        std::fs::write(kept_directory.join("nested.tmp"), b"y").unwrap();
        std::fs::write(&unregistered, b"z").unwrap();
        registry.register(kept_file.clone());
        registry.register(kept_directory.clone());
        registry.register(unregistered.clone());
        registry.unregister(&unregistered);
        registry.remove_all();
        assert!(!kept_file.exists());
        assert!(!kept_directory.exists());
        assert!(unregistered.exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
