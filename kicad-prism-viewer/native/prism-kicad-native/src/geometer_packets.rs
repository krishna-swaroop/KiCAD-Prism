//! Strict codecs for Geometer's supported packed planar operations.
//!
//! This module is an adapter only. Geometer remains the clipping, offset, and
//! triangulation implementation; Prism owns request partitioning and semantic
//! feature assignment around those calls.

use anyhow::{Result, bail};

const BOOLEAN_REQUEST_MAGIC: &[u8; 8] = b"GMC2BQ01";
const BOOLEAN_RESPONSE_MAGIC: &[u8; 8] = b"GMC2BS01";
const INFLATE_REQUEST_MAGIC: &[u8; 8] = b"GMC2IQ01";
const INFLATE_RESPONSE_MAGIC: &[u8; 8] = b"GMC2IS01";
const TRIANGULATE_REQUEST_MAGIC: &[u8; 8] = b"GMTRRQ01";
const TRIANGULATE_RESPONSE_MAGIC: &[u8; 8] = b"GMTRRS01";
const FORMAT_VERSION: u32 = 1;

pub type Point = [f64; 2];
pub type Path = Vec<Point>;

#[derive(Clone, Debug, PartialEq)]
pub struct Region {
    pub outline: Path,
    pub holes: Vec<Path>,
}

#[derive(Clone, Copy, Debug)]
#[repr(u32)]
pub enum ClipType {
    Intersection = 1,
    Union = 2,
    Difference = 3,
    Xor = 4,
}

#[derive(Clone, Copy, Debug)]
#[repr(u32)]
pub enum FillRule {
    EvenOdd = 0,
    NonZero = 1,
    Positive = 2,
    Negative = 3,
}

#[derive(Clone, Copy, Debug)]
#[repr(u32)]
pub enum JoinType {
    Square = 0,
    Bevel = 1,
    Round = 2,
    Miter = 3,
}

#[derive(Clone, Copy, Debug)]
#[repr(u32)]
pub enum EndType {
    Polygon = 0,
    Joined = 1,
    Butt = 2,
    Square = 3,
    Round = 4,
}

#[derive(Clone, Debug)]
pub struct BooleanRequest<'a> {
    pub clip_type: ClipType,
    pub fill_rule: FillRule,
    pub decimal_precision: u32,
    pub cleanup_radius_mm: f64,
    pub cleanup_miter_limit: f64,
    pub cleanup_arc_tolerance_mm: f64,
    pub subjects: &'a [Path],
    pub clips: &'a [Path],
}

#[derive(Clone, Debug)]
pub struct InflateOpenRequest<'a> {
    pub join_type: JoinType,
    pub end_type: EndType,
    pub fill_rule: FillRule,
    pub decimal_precision: u32,
    pub delta_mm: f64,
    pub miter_limit: f64,
    pub arc_tolerance_mm: f64,
    pub paths: &'a [Path],
}

#[derive(Clone, Debug)]
pub struct TriangulateRequest<'a> {
    pub decimal_precision: u32,
    pub regions: &'a [Region],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum TriangulateStatus {
    Ok = 0,
    Fail = 1,
    NoPolygons = 2,
    PathsIntersect = 3,
    InputTooSmall = 4,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TriangulatedRegion {
    pub status: TriangulateStatus,
    pub indices: Vec<u32>,
}

pub fn encode_boolean_request(request: &BooleanRequest<'_>) -> Result<Vec<u8>> {
    validate_precision(request.decimal_precision)?;
    let mut writer = Writer::default();
    writer.bytes(BOOLEAN_REQUEST_MAGIC);
    writer.u32(FORMAT_VERSION);
    writer.u32(request.clip_type as u32);
    writer.u32(request.fill_rule as u32);
    writer.u32(request.decimal_precision);
    writer.f64(request.cleanup_radius_mm)?;
    writer.f64(request.cleanup_miter_limit)?;
    writer.f64(request.cleanup_arc_tolerance_mm)?;
    writer.u32(0);
    writer.paths(request.subjects)?;
    writer.paths(request.clips)?;
    Ok(writer.finish())
}

pub fn encode_inflate_open_request(request: &InflateOpenRequest<'_>) -> Result<Vec<u8>> {
    validate_precision(request.decimal_precision)?;
    let mut writer = Writer::default();
    writer.bytes(INFLATE_REQUEST_MAGIC);
    writer.u32(FORMAT_VERSION);
    writer.u32(request.join_type as u32);
    writer.u32(request.end_type as u32);
    writer.u32(request.fill_rule as u32);
    writer.u32(request.decimal_precision);
    writer.f64(request.delta_mm)?;
    writer.f64(request.miter_limit)?;
    writer.f64(request.arc_tolerance_mm)?;
    writer.u32(0);
    writer.paths(request.paths)?;
    Ok(writer.finish())
}

pub fn decode_boolean_response(bytes: &[u8]) -> Result<Vec<Region>> {
    decode_region_response(bytes, BOOLEAN_RESPONSE_MAGIC)
}

pub fn decode_inflate_open_response(bytes: &[u8]) -> Result<Vec<Region>> {
    decode_region_response(bytes, INFLATE_RESPONSE_MAGIC)
}

pub fn encode_triangulate_request(request: &TriangulateRequest<'_>) -> Result<Vec<u8>> {
    validate_precision(request.decimal_precision)?;
    let mut writer = Writer::default();
    writer.bytes(TRIANGULATE_REQUEST_MAGIC);
    writer.u32(FORMAT_VERSION);
    writer.u32(checked_count(request.regions.len(), "region count")?);
    writer.u32(request.decimal_precision);
    writer.u32(0);
    for region in request.regions {
        writer.u32(checked_count(region.outline.len(), "outline point count")?);
        writer.u32(checked_count(region.holes.len(), "hole count")?);
        writer.points(&region.outline)?;
        for hole in &region.holes {
            writer.path(hole)?;
        }
    }
    Ok(writer.finish())
}

pub fn decode_triangulate_response(bytes: &[u8]) -> Result<Vec<TriangulatedRegion>> {
    let mut reader = Reader::new(bytes);
    reader.magic(TRIANGULATE_RESPONSE_MAGIC)?;
    reader.version()?;
    let region_count = reader.u32()? as usize;
    if reader.u32()? != 0 {
        bail!("Geometer triangulation response reserved field is nonzero");
    }
    let mut regions = Vec::with_capacity(region_count);
    for _ in 0..region_count {
        let status = match reader.u32()? {
            0 => TriangulateStatus::Ok,
            1 => TriangulateStatus::Fail,
            2 => TriangulateStatus::NoPolygons,
            3 => TriangulateStatus::PathsIntersect,
            4 => TriangulateStatus::InputTooSmall,
            value => bail!("unknown Geometer triangulation status {value}"),
        };
        let triangle_count = reader.u32()? as usize;
        let index_count = triangle_count
            .checked_mul(3)
            .ok_or_else(|| anyhow::anyhow!("triangulation index count overflow"))?;
        let mut indices = Vec::with_capacity(index_count);
        for _ in 0..index_count {
            indices.push(reader.u32()?);
        }
        regions.push(TriangulatedRegion { status, indices });
    }
    reader.done()?;
    Ok(regions)
}

fn decode_region_response(bytes: &[u8], magic: &[u8; 8]) -> Result<Vec<Region>> {
    let mut reader = Reader::new(bytes);
    reader.magic(magic)?;
    reader.version()?;
    if reader.u32()? != 0 {
        bail!("Geometer planar response reported a nonzero status");
    }
    if reader.u32()? != 0 {
        bail!("Geometer planar response reserved field is nonzero");
    }
    let region_count = reader.u32()? as usize;
    let mut regions = Vec::with_capacity(region_count);
    for _ in 0..region_count {
        let outline = reader.path()?;
        let hole_count = reader.u32()? as usize;
        let mut holes = Vec::with_capacity(hole_count);
        for _ in 0..hole_count {
            holes.push(reader.path()?);
        }
        regions.push(Region { outline, holes });
    }
    reader.done()?;
    Ok(regions)
}

fn validate_precision(value: u32) -> Result<()> {
    if value > 8 {
        bail!("Geometer decimal precision must be between 0 and 8");
    }
    Ok(())
}

fn checked_count(value: usize, label: &str) -> Result<u32> {
    value
        .try_into()
        .map_err(|_| anyhow::anyhow!("{label} exceeds uint32 range"))
}

#[derive(Default)]
struct Writer {
    bytes: Vec<u8>,
}

impl Writer {
    fn bytes(&mut self, value: &[u8]) {
        self.bytes.extend_from_slice(value);
    }

    fn u32(&mut self, value: u32) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn f64(&mut self, value: f64) -> Result<()> {
        if !value.is_finite() {
            bail!("Geometer packet contains a non-finite number");
        }
        self.bytes.extend_from_slice(&value.to_le_bytes());
        Ok(())
    }

    fn points(&mut self, points: &[Point]) -> Result<()> {
        for point in points {
            self.f64(point[0])?;
            self.f64(point[1])?;
        }
        Ok(())
    }

    fn path(&mut self, path: &Path) -> Result<()> {
        self.u32(checked_count(path.len(), "path point count")?);
        self.points(path)
    }

    fn paths(&mut self, paths: &[Path]) -> Result<()> {
        self.u32(checked_count(paths.len(), "path count")?);
        for path in paths {
            self.path(path)?;
        }
        Ok(())
    }

    fn finish(self) -> Vec<u8> {
        self.bytes
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> Reader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    fn take(&mut self, count: usize) -> Result<&'a [u8]> {
        let end = self
            .offset
            .checked_add(count)
            .ok_or_else(|| anyhow::anyhow!("Geometer packet offset overflow"))?;
        let Some(value) = self.bytes.get(self.offset..end) else {
            bail!("Geometer packet ended unexpectedly");
        };
        self.offset = end;
        Ok(value)
    }

    fn magic(&mut self, expected: &[u8; 8]) -> Result<()> {
        if self.take(8)? != expected {
            bail!("Geometer packet magic mismatch");
        }
        Ok(())
    }

    fn version(&mut self) -> Result<()> {
        let version = self.u32()?;
        if version != FORMAT_VERSION {
            bail!("unsupported Geometer packet version {version}");
        }
        Ok(())
    }

    fn u32(&mut self) -> Result<u32> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }

    fn f64(&mut self) -> Result<f64> {
        let value = f64::from_le_bytes(self.take(8)?.try_into().unwrap());
        if !value.is_finite() {
            bail!("Geometer packet contains a non-finite number");
        }
        Ok(value)
    }

    fn path(&mut self) -> Result<Path> {
        let count = self.u32()? as usize;
        let mut path = Vec::with_capacity(count);
        for _ in 0..count {
            path.push([self.f64()?, self.f64()?]);
        }
        Ok(path)
    }

    fn done(&self) -> Result<()> {
        if self.offset != self.bytes.len() {
            bail!("Geometer packet has trailing bytes");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square() -> Path {
        vec![[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0]]
    }

    #[test]
    fn boolean_request_matches_the_public_geometer_header() {
        let subjects = vec![square()];
        let bytes = encode_boolean_request(&BooleanRequest {
            clip_type: ClipType::Difference,
            fill_rule: FillRule::NonZero,
            decimal_precision: 6,
            cleanup_radius_mm: 0.0,
            cleanup_miter_limit: 2.0,
            cleanup_arc_tolerance_mm: 0.005,
            subjects: &subjects,
            clips: &[],
        })
        .unwrap();
        assert_eq!(&bytes[..8], BOOLEAN_REQUEST_MAGIC);
        assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(bytes[12..16].try_into().unwrap()), 3);
        assert_eq!(u32::from_le_bytes(bytes[16..20].try_into().unwrap()), 1);
        assert_eq!(u32::from_le_bytes(bytes[20..24].try_into().unwrap()), 6);
    }

    #[test]
    fn region_response_preserves_holes() {
        let mut writer = Writer::default();
        writer.bytes(BOOLEAN_RESPONSE_MAGIC);
        writer.u32(1);
        writer.u32(0);
        writer.u32(0);
        writer.u32(1);
        writer.path(&square()).unwrap();
        writer.u32(1);
        writer
            .path(&vec![[0.5, 0.5], [1.5, 0.5], [1.0, 1.5]])
            .unwrap();
        let decoded = decode_boolean_response(&writer.finish()).unwrap();
        assert_eq!(decoded.len(), 1);
        assert_eq!(decoded[0].holes.len(), 1);
    }

    #[test]
    fn triangulation_response_rejects_trailing_data() {
        let mut bytes = Vec::from(TRIANGULATE_RESPONSE_MAGIC.as_slice());
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.push(1);
        assert!(decode_triangulate_response(&bytes).is_err());
    }

    #[test]
    fn invalid_precision_fails_before_native_dispatch() {
        let regions = vec![Region {
            outline: square(),
            holes: Vec::new(),
        }];
        assert!(
            encode_triangulate_request(&TriangulateRequest {
                decimal_precision: 9,
                regions: &regions,
            })
            .is_err()
        );
    }
}
