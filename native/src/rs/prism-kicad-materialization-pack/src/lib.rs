//! Packed encoding for `kicad_monkey.materialization.a1` (and a0, which has
//! the same binary layout and no `design_facts` in its header).
//!
//! The pack is the canonical serialized materialization. It depends only on
//! the generated contracts, so viewers (through WASM) and simulation engines
//! read it without the KiCad parser.
//!
//! Byte layout, little-endian, every section starting on 8 bytes:
//!
//! | Offset | Size | Field |
//! |---|---|---|
//! | 0 | 8 | magic `KMMATPK\0` |
//! | 8 | 2 | format version, `0` for a0 and a1 |
//! | 10 | 2 | flags, `0` |
//! | 12 | 4 | header length in bytes |
//! | 16 | header length | header: the document as JSON without operations, binding, or chunks |
//! | aligned | 72 + 16 per chunk | section directory |
//! | aligned | | string table, binding, chunk directory, linear-part table, one column block per chunk |
//!
//! The section directory holds `u64` offset and length pairs (from the start
//! of the pack) for the string table, the binding, the chunk directory, and
//! the linear-part table, then the chunk count (`u64`) and an offset and length pair per chunk
//! block, in chunk order.
//!
//! - String table (`wire.rs`): every source UID, refdes, pad number, and
//!   group key once, in order of first use.
//! - Binding and chunk directory (`tables.rs`): columns indexing the string,
//!   net, and stack tables.
//! - Linear-part table (`wire.rs`): each distinct affine `m11 m12 m21 m22`
//!   once, as `f64`; operations index it.
//! - Column blocks (`columns.rs`) with their int32 parameter stream
//!   (`params.rs`).
//!
//! Opening a pack reads the header, binding, and chunk directory and checks
//! the contract's operation-independent rules, so a reader can seek to the
//! chunks it needs. A full decode validates the whole document. Every value
//! round-trips exactly, including the affines' `f64` bits.

#![forbid(unsafe_code)]

mod columns;
mod pack;
mod params;
mod tables;
mod wire;

pub use pack::{PackReader, encode_pack};

use prism_kicad_contracts::ValidationError;
use std::fmt;

/// File magic.
pub const PACK_MAGIC: [u8; 8] = *b"KMMATPK\0";
/// Format version of the a0 and a1 packs: a1 grew only the JSON header.
pub const PACK_FORMAT_VERSION: u16 = 0;
/// Size of the fixed preamble before the header.
pub const PREAMBLE_BYTES: usize = 16;
/// Column sections start on this alignment.
pub const COLUMN_ALIGNMENT: usize = 8;

/// Reader ceilings. Readers reject input beyond them before allocating.
#[derive(Clone, Copy, Debug)]
pub struct PackLimits {
    pub max_header_bytes: usize,
}

impl Default for PackLimits {
    fn default() -> Self {
        Self {
            max_header_bytes: 64 * 1024 * 1024,
        }
    }
}

/// Pack encode or decode failure.
#[derive(Debug)]
pub enum PackError {
    BadMagic,
    UnsupportedVersion(u16),
    UnsupportedFlags(u16),
    Truncated,
    HeaderTooLarge(usize),
    Header(serde_json::Error),
    /// The header decodes but breaks a contract rule.
    Invalid(ValidationError),
    /// The binary sections are inconsistent.
    Corrupt(&'static str),
}

impl fmt::Display for PackError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::BadMagic => formatter.write_str("not a materialization pack"),
            Self::UnsupportedVersion(version) => {
                write!(formatter, "unsupported pack format version {version}")
            }
            Self::UnsupportedFlags(flags) => write!(formatter, "unsupported pack flags {flags}"),
            Self::Truncated => formatter.write_str("pack is truncated"),
            Self::HeaderTooLarge(bytes) => {
                write!(formatter, "pack header of {bytes} bytes exceeds limit")
            }
            Self::Header(error) => write!(formatter, "pack header: {error}"),
            Self::Invalid(error) => write!(formatter, "pack contract: {error}"),
            Self::Corrupt(what) => write!(formatter, "corrupt pack: {what}"),
        }
    }
}

impl std::error::Error for PackError {}

pub(crate) fn aligned(offset: usize) -> usize {
    offset.div_ceil(COLUMN_ALIGNMENT) * COLUMN_ALIGNMENT
}
