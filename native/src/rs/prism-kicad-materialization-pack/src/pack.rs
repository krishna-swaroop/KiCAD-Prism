//! The whole pack: preamble, JSON header, section directory, and sections.

use crate::columns::{Names, Tables, decode_chunk, encode_chunk};
use crate::tables::{
    Keys, decode_binding, decode_chunks, encode_binding, encode_chunks, intern_binding,
};
use crate::wire::{
    Cursor, LinearTable, StringTable, corrupt, decode_linear, decode_strings, index_i32, pad8,
};
use crate::{PACK_FORMAT_VERSION, PACK_MAGIC, PREAMBLE_BYTES, PackError, PackLimits, aligned};
use prism_kicad_contracts::generated::materialization_document::{
    MaterialOperation, MaterializationDocumentA1,
};
use prism_kicad_contracts::materialization_contract::{
    validate_materialization_document, validate_materialization_header,
};
use std::borrow::Cow;

/// Bytes of the section directory before its per-chunk entries.
const DIRECTORY_HEAD: usize = 72;
/// Bytes of one chunk block entry in the directory.
const DIRECTORY_ENTRY: usize = 16;

fn put_u64(out: &mut Vec<u8>, value: usize) {
    out.extend(u64::try_from(value).unwrap_or(u64::MAX).to_le_bytes());
}

fn keys(document: &MaterializationDocumentA1) -> Result<Keys<'_>, PackError> {
    Ok(Keys {
        slices: document
            .stack
            .slices
            .iter()
            .enumerate()
            .map(|(position, slice)| Ok((slice.key.as_str(), index_i32(position)?)))
            .collect::<Result<_, PackError>>()?,
        nets: document
            .nets
            .iter()
            .enumerate()
            .map(|(position, net)| Ok((net.key.as_str(), index_i32(position)?)))
            .collect::<Result<_, PackError>>()?,
    })
}

/// Preamble and JSON header (without operations, binding, or chunks),
/// padded to 8.
fn encode_preamble_and_header(document: &MaterializationDocumentA1) -> Result<Vec<u8>, PackError> {
    let mut header = document.clone();
    header.operations.clear();
    header.binding.clear();
    header.chunks.clear();
    let json = serde_json::to_vec(&header).map_err(PackError::Header)?;
    let length = u32::try_from(json.len()).map_err(|_| PackError::HeaderTooLarge(json.len()))?;
    let mut bytes = Vec::with_capacity(aligned(PREAMBLE_BYTES + json.len()));
    bytes.extend_from_slice(&PACK_MAGIC);
    bytes.extend_from_slice(&PACK_FORMAT_VERSION.to_le_bytes());
    bytes.extend_from_slice(&0u16.to_le_bytes());
    bytes.extend_from_slice(&length.to_le_bytes());
    bytes.extend_from_slice(&json);
    pad8(&mut bytes);
    Ok(bytes)
}

/// Encode a valid document as a complete pack.
pub fn encode_pack(document: &MaterializationDocumentA1) -> Result<Vec<u8>, PackError> {
    validate_materialization_document(document).map_err(PackError::Invalid)?;
    let keys = keys(document)?;
    let mut strings = StringTable::default();
    intern_binding(&document.binding, &mut strings)?;
    let mut linear = LinearTable::default();
    for operation in &document.operations {
        let affine = match operation {
            MaterialOperation::SurfaceOperation(surface) => {
                strings.optional(surface.group_key.as_deref())?;
                &surface.affine
            }
            MaterialOperation::HoleOperation(hole) => &hole.affine,
        };
        linear.intern([affine.m11, affine.m12, affine.m21, affine.m22])?;
    }
    let mut bytes = encode_preamble_and_header(document)?;
    let directory_at = bytes.len();
    let directory_length = DIRECTORY_HEAD + DIRECTORY_ENTRY * document.chunks.len();
    bytes.resize(aligned(directory_at + directory_length), 0);
    let mut sections = Vec::with_capacity(4);
    for section in [
        strings.encode()?,
        encode_binding(&document.binding, &strings, &keys)?,
        encode_chunks(&document.chunks, &keys)?,
        linear.encode()?,
    ] {
        sections.push((bytes.len(), section.len()));
        bytes.extend(section);
        pad8(&mut bytes);
    }
    let tables = Tables {
        keys: &keys,
        strings: &strings,
        linear: &linear,
    };
    let mut blocks = Vec::with_capacity(document.chunks.len());
    for chunk in &document.chunks {
        let first = usize::try_from(chunk.first_operation_index).map_err(|_| corrupt("index"))?;
        let count = usize::try_from(chunk.operation_count).map_err(|_| corrupt("count"))?;
        let operations = document
            .operations
            .get(first..first + count)
            .ok_or(corrupt("chunk range outside the operations"))?;
        let block = encode_chunk(operations, &tables)?;
        blocks.push((bytes.len(), block.len()));
        bytes.extend(block);
    }
    let mut directory = Vec::with_capacity(directory_length);
    for (offset, length) in &sections {
        put_u64(&mut directory, *offset);
        put_u64(&mut directory, *length);
    }
    put_u64(&mut directory, blocks.len());
    for (offset, length) in &blocks {
        put_u64(&mut directory, *offset);
        put_u64(&mut directory, *length);
    }
    bytes[directory_at..directory_at + directory_length].copy_from_slice(&directory);
    Ok(bytes)
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, PackError> {
    let field = bytes.get(offset..offset + 2).ok_or(PackError::Truncated)?;
    Ok(u16::from_le_bytes([field[0], field[1]]))
}

/// Check the preamble and decode the JSON header; returns it and where the
/// section directory starts.
fn decode_preamble_and_header(
    bytes: &[u8],
    limits: PackLimits,
) -> Result<(MaterializationDocumentA1, usize), PackError> {
    let magic = bytes.get(..8).ok_or(PackError::Truncated)?;
    if magic != PACK_MAGIC {
        return Err(PackError::BadMagic);
    }
    let version = read_u16(bytes, 8)?;
    if version != PACK_FORMAT_VERSION {
        return Err(PackError::UnsupportedVersion(version));
    }
    let flags = read_u16(bytes, 10)?;
    if flags != 0 {
        return Err(PackError::UnsupportedFlags(flags));
    }
    let length_field = bytes.get(12..PREAMBLE_BYTES).ok_or(PackError::Truncated)?;
    let length = usize::try_from(u32::from_le_bytes([
        length_field[0],
        length_field[1],
        length_field[2],
        length_field[3],
    ]))
    .map_err(|_| PackError::Truncated)?;
    if length > limits.max_header_bytes {
        return Err(PackError::HeaderTooLarge(length));
    }
    let end = PREAMBLE_BYTES
        .checked_add(length)
        .ok_or(PackError::Truncated)?;
    let json = bytes.get(PREAMBLE_BYTES..end).ok_or(PackError::Truncated)?;
    // Value first: the workspace's arbitrary-precision numbers do not decode
    // straight from text into the contract's untagged unions.
    let value: serde_json::Value = serde_json::from_slice(json).map_err(PackError::Header)?;
    let document: MaterializationDocumentA1 =
        serde_json::from_value(value).map_err(PackError::Header)?;
    if !(document.operations.is_empty()
        && document.binding.is_empty()
        && document.chunks.is_empty())
    {
        return Err(corrupt("the JSON header carries columns"));
    }
    Ok((document, aligned(end)))
}

/// A pack opened for reading: its header (with binding and chunk directory,
/// validated), the string table, and where each chunk block lies. Chunks are
/// decoded on demand. It borrows its bytes ([`PackReader::open`]) or owns them
/// ([`PackReader::open_owned`]), so a long-lived reader parses the header once.
pub struct PackReader<'a> {
    bytes: Cow<'a, [u8]>,
    header: MaterializationDocumentA1,
    strings: Vec<String>,
    blocks: Vec<(usize, usize)>,
    slices: Vec<String>,
    nets: Vec<String>,
    linear: Vec<[f64; 4]>,
}

impl PackReader<'static> {
    /// [`PackReader::open`], keeping `bytes`.
    pub fn open_owned(bytes: Vec<u8>, limits: PackLimits) -> Result<Self, PackError> {
        let PackReader {
            header,
            strings,
            blocks,
            slices,
            nets,
            linear,
            ..
        } = PackReader::open(&bytes, limits)?;
        Ok(PackReader {
            bytes: Cow::Owned(bytes),
            header,
            strings,
            blocks,
            slices,
            nets,
            linear,
        })
    }
}

impl<'a> PackReader<'a> {
    /// Open `bytes`: preamble, header, directory, strings, binding, and
    /// chunk directory, then the contract's operation-independent rules.
    pub fn open(bytes: &'a [u8], limits: PackLimits) -> Result<Self, PackError> {
        let (mut header, directory_at) = decode_preamble_and_header(bytes, limits)?;
        let mut directory = Cursor::new(bytes.get(directory_at..).ok_or(PackError::Truncated)?);
        let mut section = || -> Result<&'a [u8], PackError> {
            let (offset, length) = (directory.u64()?, directory.u64()?);
            offset
                .checked_add(length)
                .and_then(|end| bytes.get(offset..end))
                .ok_or(PackError::Truncated)
        };
        let (strings, binding, chunks, linear) = (section()?, section()?, section()?, section()?);
        let strings = decode_strings(strings)?;
        let linear = decode_linear(linear)?;
        let slices: Vec<String> = header
            .stack
            .slices
            .iter()
            .map(|slice| slice.key.clone())
            .collect();
        let nets: Vec<String> = header.nets.iter().map(|net| net.key.clone()).collect();
        header.binding = decode_binding(binding, &strings, &nets)?;
        header.chunks = decode_chunks(chunks, &slices, &nets)?;
        validate_materialization_header(&header).map_err(PackError::Invalid)?;
        let block_count = directory.u64()?;
        if block_count != header.chunks.len()
            || block_count.saturating_mul(DIRECTORY_ENTRY) > directory.remaining()
        {
            return Err(corrupt("chunk blocks differ from the chunk directory"));
        }
        let mut blocks = Vec::with_capacity(block_count);
        for _ in 0..block_count {
            let (offset, length) = (directory.u64()?, directory.u64()?);
            if offset
                .checked_add(length)
                .is_none_or(|end| end > bytes.len())
            {
                return Err(PackError::Truncated);
            }
            blocks.push((offset, length));
        }
        Ok(Self {
            bytes: Cow::Borrowed(bytes),
            header,
            strings,
            blocks,
            slices,
            nets,
            linear,
        })
    }

    /// The header document, with binding and chunk directory; its
    /// `operations` are empty.
    pub fn header(&self) -> &MaterializationDocumentA1 {
        &self.header
    }

    /// Decode the operations of chunk `position` of the directory.
    pub fn chunk(&self, position: usize) -> Result<Vec<MaterialOperation>, PackError> {
        let (&(offset, length), entry) = self
            .blocks
            .get(position)
            .zip(self.header.chunks.get(position))
            .ok_or(corrupt("no such chunk"))?;
        let names = Names {
            slices: &self.slices,
            nets: &self.nets,
            strings: &self.strings,
            linear: &self.linear,
        };
        let operations = decode_chunk(
            &self.bytes[offset..offset + length],
            entry.first_operation_index,
            &names,
        )?;
        if u32::try_from(operations.len()).ok() != Some(entry.operation_count) {
            return Err(corrupt("chunk holds a different operation count"));
        }
        Ok(operations)
    }

    /// Decode every chunk and validate the whole document.
    pub fn document(&self) -> Result<MaterializationDocumentA1, PackError> {
        let mut document = self.header.clone();
        for position in 0..self.blocks.len() {
            document.operations.extend(self.chunk(position)?);
        }
        validate_materialization_document(&document).map_err(PackError::Invalid)?;
        Ok(document)
    }
}
