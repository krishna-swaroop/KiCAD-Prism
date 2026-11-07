//! Process guards (cli-spec.md §5.2.5, §7.3, §7.4): the counting allocator
//! that enforces `max-memory-bytes`, the wall-clock watchdog for
//! `timeout-ms`, the SIGTERM/SIGINT/SIGHUP handlers (console control events
//! on Windows), the Linux `RLIMIT_AS` backstop (a job object's process memory
//! limit on Windows, where a kill-on-close job object also ends `git`'s tree), and the raw writes
//! and `_exit` they end with.
//!
//! This is the only module that uses `unsafe`, each block for one libc or
//! Win32 call or for the `GlobalAlloc` contract.

use std::alloc::{GlobalAlloc, Layout, System};
use std::process::Child;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicUsize, Ordering};
use std::time::{Duration, Instant};

static LIVE: AtomicUsize = AtomicUsize::new(0);
static LIMIT: AtomicUsize = AtomicUsize::new(usize::MAX);
static OUT_OF_MEMORY: OnceLock<(Vec<u8>, Vec<u8>)> = OnceLock::new();
static SIGNAL: AtomicI32 = AtomicI32::new(0);
/// The process group of a running `git`. Unix only: Windows confines children with a job object.
#[cfg(unix)]
static CHILD_GROUP: AtomicUsize = AtomicUsize::new(0);
static STDOUT_TAKEN: AtomicBool = AtomicBool::new(false);

/// A global allocator that counts live heap bytes and refuses to go over
/// `max-memory-bytes`: it writes the pre-serialized `CliErrorA0` and
/// diagnostic without allocating, then `_exit(4)`.
pub struct CountingAllocator;

/// What a thread takes from [`LIVE`] at a time. Each thread keeps between 0
/// and twice this as its own spare, so [`LIVE`] can run ahead of the real heap
/// by at most twice this per thread, and the threads that run the parse
/// stage's producers do not all update one atomic on every allocation.
const CREDIT_CHUNK: usize = 1 << 20;

thread_local! {
    /// Bytes this thread holds in [`LIVE`] but has not allocated yet. A
    /// `const`-initialized `Cell` has no destructor, so reading it never
    /// allocates; a thread's spare at exit stays counted (at most
    /// `2 * CREDIT_CHUNK`).
    static CREDIT: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

fn reserve_shared(bytes: usize) -> bool {
    let before = LIVE.fetch_add(bytes, Ordering::Relaxed);
    if before.saturating_add(bytes) > LIMIT.load(Ordering::Relaxed) {
        LIVE.fetch_sub(bytes, Ordering::Relaxed);
        return false;
    }
    true
}

fn reserve(bytes: usize) -> bool {
    CREDIT
        .try_with(|credit| {
            let have = credit.get();
            if have >= bytes {
                credit.set(have - bytes);
                return true;
            }
            let missing = bytes - have;
            // Take a chunk more than is missing, so the next allocations stay
            // local; near the limit, take exactly what is missing.
            if reserve_shared(missing.saturating_add(CREDIT_CHUNK)) {
                credit.set(CREDIT_CHUNK);
                true
            } else if reserve_shared(missing) {
                credit.set(0);
                true
            } else {
                false
            }
        })
        .unwrap_or_else(|_| reserve_shared(bytes))
}

fn release(bytes: usize) {
    let returned = CREDIT.try_with(|credit| {
        let have = credit.get().saturating_add(bytes);
        if have > 2 * CREDIT_CHUNK {
            credit.set(CREDIT_CHUNK);
            have - CREDIT_CHUNK
        } else {
            credit.set(have);
            0
        }
    });
    match returned {
        Ok(0) => {}
        Ok(excess) => {
            LIVE.fetch_sub(excess, Ordering::Relaxed);
        }
        Err(_) => {
            LIVE.fetch_sub(bytes, Ordering::Relaxed);
        }
    }
}

/// Write `bytes` to file descriptor `fd` (1 or 2) with `write(2)`, retrying
/// partial writes; allocates nothing.
#[cfg(unix)]
pub fn raw_write(fd: i32, mut bytes: &[u8]) -> bool {
    while !bytes.is_empty() {
        // SAFETY: the pointer and length describe a live slice.
        let written = unsafe { libc::write(fd, bytes.as_ptr().cast(), bytes.len()) };
        let Ok(written) = usize::try_from(written) else {
            return false;
        };
        if written == 0 {
            return false;
        }
        bytes = &bytes[written..];
    }
    true
}

/// Write `bytes` to standard output (1) or error (2) with `WriteFile`,
/// retrying partial writes; allocates nothing.
#[cfg(windows)]
pub fn raw_write(fd: i32, mut bytes: &[u8]) -> bool {
    use windows_sys::Win32::Storage::FileSystem::WriteFile;
    use windows_sys::Win32::System::Console::{GetStdHandle, STD_ERROR_HANDLE, STD_OUTPUT_HANDLE};
    // SAFETY: `GetStdHandle` takes a constant and returns a handle or null.
    let handle = unsafe {
        GetStdHandle(if fd == 2 {
            STD_ERROR_HANDLE
        } else {
            STD_OUTPUT_HANDLE
        })
    };
    if handle.is_null() {
        return false;
    }
    while !bytes.is_empty() {
        let chunk = u32::try_from(bytes.len()).unwrap_or(u32::MAX);
        let mut written = 0u32;
        // SAFETY: the pointer and length describe a live slice, `written` is
        // a valid out-parameter, and no OVERLAPPED is used.
        let done = unsafe {
            WriteFile(
                handle,
                bytes.as_ptr(),
                chunk,
                &raw mut written,
                std::ptr::null_mut(),
            )
        };
        if done == 0 || written == 0 {
            return false;
        }
        bytes = &bytes[written as usize..];
    }
    true
}

/// End the process at once with `code`, running no destructor or handler.
#[cfg(unix)]
pub fn exit_now(code: i32) -> ! {
    // SAFETY: `_exit` takes any status and never returns.
    unsafe { libc::_exit(code) }
}

/// End the process at once with `code`, running no destructor or handler.
#[cfg(windows)]
pub fn exit_now(code: i32) -> ! {
    // SAFETY: `ExitProcess` takes any status and never returns.
    unsafe { windows_sys::Win32::System::Threading::ExitProcess(code.cast_unsigned()) }
}

fn out_of_memory() -> ! {
    if let Some((stdout, stderr)) = OUT_OF_MEMORY.get()
        && !STDOUT_TAKEN.swap(true, Ordering::SeqCst)
    {
        raw_write(1, stdout);
        raw_write(2, stderr);
    }
    remove_temp_file();
    exit_now(4)
}

// SAFETY: every method forwards to `System` with the caller's layout and
// pointers unchanged; the counter only decides whether to call it.
unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if !reserve(layout.size()) {
            out_of_memory();
        }
        // SAFETY: forwarded under the caller's contract.
        let pointer = unsafe { System.alloc(layout) };
        if pointer.is_null() {
            release(layout.size());
        }
        pointer
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        if !reserve(layout.size()) {
            out_of_memory();
        }
        // SAFETY: forwarded under the caller's contract.
        let pointer = unsafe { System.alloc_zeroed(layout) };
        if pointer.is_null() {
            release(layout.size());
        }
        pointer
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        // SAFETY: forwarded under the caller's contract.
        unsafe { System.dealloc(pointer, layout) };
        release(layout.size());
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let old = layout.size();
        if new_size > old && !reserve(new_size - old) {
            out_of_memory();
        }
        // SAFETY: forwarded under the caller's contract.
        let moved = unsafe { System.realloc(pointer, layout, new_size) };
        if moved.is_null() {
            if new_size > old {
                release(new_size - old);
            }
        } else if new_size < old {
            release(old - new_size);
        }
        moved
    }
}

/// Arm the memory cap at `limit` bytes. `stdout` and `stderr` are the
/// documents written when an allocation would cross it.
pub fn arm_memory_cap(limit: u64, stdout: Vec<u8>, stderr: Vec<u8>, threads: u64) {
    let _ = OUT_OF_MEMORY.set((stdout, stderr));
    LIMIT.store(
        usize::try_from(limit).unwrap_or(usize::MAX),
        Ordering::SeqCst,
    );
    address_space_backstop(limit, threads);
}

#[cfg(target_os = "linux")]
fn address_space_backstop(limit: u64, threads: u64) {
    let margin = (1u64 << 30) + (128u64 << 20) * threads.max(1);
    let bound = limit.saturating_add(margin);
    let value = libc::rlimit {
        rlim_cur: bound,
        rlim_max: bound,
    };
    // SAFETY: `setrlimit` reads one valid `rlimit`.
    unsafe {
        libc::setrlimit(libc::RLIMIT_AS, &value);
    }
}

#[cfg(windows)]
fn address_space_backstop(limit: u64, threads: u64) {
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_PROCESS_MEMORY,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
        SetInformationJobObject,
    };
    use windows_sys::Win32::System::Threading::GetCurrentProcess;
    let margin = (1u64 << 30) + (128u64 << 20) * threads.max(1);
    let bound = usize::try_from(limit.saturating_add(margin)).unwrap_or(usize::MAX);
    // SAFETY: an all-zero limit structure is valid; the fields set below are
    // the ones the flag names.
    let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_PROCESS_MEMORY;
    info.ProcessMemoryLimit = bound;
    // SAFETY: null attributes and name are allowed; the handle is kept open
    // for the life of the process, which is what holds the limit.
    let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if job.is_null() {
        return;
    }
    // SAFETY: `info` is a live structure of the size passed. Failure (the
    // process already belongs to a job that forbids nesting) leaves only the
    // counting allocator, which is the primary limit.
    unsafe {
        if SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            (&raw const info).cast(),
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) != 0
        {
            AssignProcessToJobObject(job, GetCurrentProcess());
        }
    }
}

#[cfg(all(not(target_os = "linux"), not(windows)))]
fn address_space_backstop(_limit: u64, _threads: u64) {}

/// Claim stdout for the one document of this invocation. Returns false when
/// a guard already wrote it.
pub fn take_stdout() -> bool {
    !STDOUT_TAKEN.swap(true, Ordering::SeqCst)
}

/// Remove every registered temp file or directory, if any.
pub fn remove_temp_file() {
    prism_bundle::temp::remove_all();
}

/// Remember a running `git`, for the watchdog to kill: on Unix its process group. On Windows
/// nothing is kept: this process is in a kill-on-close job object (see
/// [`install_signal_handlers`]) that `git` and everything it starts inherit at creation, and
/// the process exits right after the watchdog fires, which ends the whole tree.
pub fn track_child(child: &Child) {
    #[cfg(unix)]
    CHILD_GROUP.store(child.id() as usize, Ordering::SeqCst);
    #[cfg(windows)]
    let _ = child;
}

/// Forget the tracked `git` once it has exited.
pub fn untrack_child() {
    #[cfg(unix)]
    CHILD_GROUP.store(0, Ordering::SeqCst);
}

#[cfg(unix)]
fn kill_child_group() {
    let group = CHILD_GROUP.load(Ordering::SeqCst);
    if group != 0 {
        // SAFETY: `kill` with a negative pid signals that process group.
        unsafe {
            libc::kill(-(group as i32), libc::SIGKILL);
        }
    }
}

/// Windows ends a running `git` by exiting: the job object kills the tree.
#[cfg(windows)]
fn kill_child_group() {}

#[cfg(unix)]
extern "C" fn on_signal(signal: libc::c_int) {
    SIGNAL.store(signal, Ordering::SeqCst);
}

/// Install the SIGTERM, SIGINT and SIGHUP handlers.
#[cfg(unix)]
pub fn install_signal_handlers() {
    let handler = on_signal as extern "C" fn(libc::c_int) as libc::sighandler_t;
    for signal in [libc::SIGTERM, libc::SIGINT, libc::SIGHUP] {
        // SAFETY: the handler only stores into an atomic.
        unsafe {
            libc::signal(signal, handler);
        }
    }
}

#[cfg(windows)]
unsafe extern "system" fn on_console_event(event: u32) -> i32 {
    use windows_sys::Win32::System::Console::{CTRL_BREAK_EVENT, CTRL_C_EVENT};
    // Ctrl+C and break are SIGINT (2); close, logoff and shutdown are SIGHUP (1).
    let signal = if event == CTRL_C_EVENT || event == CTRL_BREAK_EVENT {
        2
    } else {
        1
    };
    SIGNAL.store(signal, Ordering::SeqCst);
    1
}

/// Put this process in a job object that kills everything in it when its last handle closes, which
/// is when this process exits. `git` and its children are created inside it, so no child can outlive
/// a timeout or a signal, and there is no handle to close or reuse while the watchdog runs.
#[cfg(windows)]
fn join_kill_on_exit_job() {
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
        SetInformationJobObject,
    };
    use windows_sys::Win32::System::Threading::GetCurrentProcess;
    // SAFETY: an all-zero limit structure is valid; the field set is the one the flag names.
    let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    // SAFETY: null attributes and name are allowed. The handle is never closed: the job must
    // outlive every use of it, and process exit closes it.
    let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if job.is_null() {
        return;
    }
    // SAFETY: `info` is a live structure of the size passed. A failure (the process is already
    // in a job that forbids nesting) leaves `git` unconfined, as on a platform without jobs.
    unsafe {
        if SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            (&raw const info).cast(),
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        ) != 0
        {
            AssignProcessToJobObject(job, GetCurrentProcess());
        }
    }
}

/// Handle Ctrl+C, Ctrl+Break and console close like the Unix signals, and confine child
/// processes to this one's lifetime.
#[cfg(windows)]
pub fn install_signal_handlers() {
    join_kill_on_exit_job();
    // SAFETY: the handler only stores into an atomic.
    unsafe {
        windows_sys::Win32::System::Console::SetConsoleCtrlHandler(Some(on_console_event), 1);
    }
}

/// Start the watchdog: at `deadline` it removes the registered temp files,
/// kills a running `git`, writes the timeout documents and exits 5; on a
/// signal it removes them and exits 128+n without a document.
pub fn start_watchdog(started: Instant, timeout: Duration, stdout: Vec<u8>, stderr: Vec<u8>) {
    let deadline = started.checked_add(timeout);
    let spawned = std::thread::Builder::new()
        .name("prism-kicad-watchdog".to_owned())
        .spawn(move || {
            loop {
                let signal = SIGNAL.load(Ordering::SeqCst);
                if signal != 0 {
                    kill_child_group();
                    remove_temp_file();
                    exit_now(128 + signal);
                }
                if deadline.is_some_and(|deadline| Instant::now() >= deadline) {
                    kill_child_group();
                    remove_temp_file();
                    if take_stdout() {
                        raw_write(1, &stdout);
                        raw_write(2, &stderr);
                    }
                    exit_now(5);
                }
                std::thread::sleep(Duration::from_millis(10));
            }
        });
    // Without a watchdog the backend's outer timeout still applies.
    drop(spawned);
}

/// Volume serial number and file index of the file at `path`, which tell two
/// names for one file apart from two files.
#[cfg(windows)]
pub fn file_identity(path: &std::path::Path) -> Option<(u32, u32, u32)> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
    };
    let file = std::fs::File::open(path).ok()?;
    // SAFETY: an all-zero information structure is valid.
    let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
    // SAFETY: the handle is open for the call and `info` is a valid out-parameter.
    let ok = unsafe { GetFileInformationByHandle(file.as_raw_handle(), &raw mut info) };
    (ok != 0).then_some((
        info.dwVolumeSerialNumber,
        info.nFileIndexHigh,
        info.nFileIndexLow,
    ))
}
