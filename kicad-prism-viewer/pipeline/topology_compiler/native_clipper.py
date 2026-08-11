from __future__ import annotations

import hashlib
import json
import math
import os
import struct
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REQUEST_MAGIC = b"GMC2XQ01"
RESPONSE_MAGIC = b"GMC2XS01"
A2_REQUEST_MAGIC = b"GMC2YQ01"
A2_RESPONSE_MAGIC = b"GMC2YS01"
REQUEST_SCHEMA = "prism.semantic_clipper_request_a1"
RESPONSE_SCHEMA = "prism.semantic_clipper_response_a1"
A2_REQUEST_SCHEMA = "prism.clipper2_batch_request_a2"
A2_RESPONSE_SCHEMA = "prism.clipper2_batch_response_a2"
PROTOCOL_VERSION = 1
A2_PROTOCOL_VERSION = 2
DECIMAL_PRECISION = 6
COORDINATE_SCALE_NM_PER_MM = 1_000_000


class NativeClipperError(RuntimeError):
    pass



@dataclass(frozen=True)
class ClipJob:
    job_id: str
    source_polygon_record_id: str
    source_order: int
    tile_x: int
    tile_y: int
    outer: list[list[float]]
    holes: list[list[list[float]]]
    clip: list[list[float]]


@dataclass(frozen=True)
class ClipSubject:
    subject_id: str
    outer: list[list[float]]
    holes: list[list[list[float]]]


class _Writer:
    def __init__(self) -> None:
        self.data = bytearray()

    def raw(self, value: bytes) -> None:
        self.data.extend(value)

    def u32(self, value: int) -> None:
        if value < 0 or value > 0xFFFFFFFF:
            raise NativeClipperError(f"u32 out of range: {value}")
        self.data.extend(struct.pack("<I", value))

    def i32(self, value: int) -> None:
        if value < -0x80000000 or value > 0x7FFFFFFF:
            raise NativeClipperError(f"i32 out of range: {value}")
        self.data.extend(struct.pack("<i", value))

    def i64(self, value: int) -> None:
        if value < -0x8000000000000000 or value > 0x7FFFFFFFFFFFFFFF:
            raise NativeClipperError(f"i64 out of range: {value}")
        self.data.extend(struct.pack("<q", value))

    def f64(self, value: float) -> None:
        if not math.isfinite(value):
            raise NativeClipperError(f"non-finite coordinate in clip request: {value}")
        self.data.extend(struct.pack("<d", float(value)))

    def string(self, value: str) -> None:
        encoded = value.encode("utf-8")
        self.u32(len(encoded))
        self.raw(encoded)

    def ring(self, ring: list[list[float]]) -> None:
        clean = _clean_ring(ring)
        if len(clean) < 3:
            raise NativeClipperError("clip request ring has fewer than three distinct points")
        self.u32(len(clean))
        for x, y in clean:
            self.f64(x)
            self.f64(y)

    def ring_i64_nm(self, ring: list[list[float]]) -> int:
        clean = _clean_ring(ring)
        if len(clean) < 3:
            raise NativeClipperError("clip request ring has fewer than three distinct points")
        self.u32(len(clean))
        for x, y in clean:
            self.i64(_mm_to_nm(x))
            self.i64(_mm_to_nm(y))
        return len(clean)


class _Reader:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.offset = 0

    def raw(self, size: int) -> bytes:
        end = self.offset + size
        if end > len(self.data):
            raise NativeClipperError("native clipper response ended unexpectedly")
        value = self.data[self.offset:end]
        self.offset = end
        return value

    def u32(self) -> int:
        return struct.unpack("<I", self.raw(4))[0]

    def i32(self) -> int:
        return struct.unpack("<i", self.raw(4))[0]

    def i64(self) -> int:
        return struct.unpack("<q", self.raw(8))[0]

    def f64(self) -> float:
        value = struct.unpack("<d", self.raw(8))[0]
        if not math.isfinite(value):
            raise NativeClipperError("native clipper response contained non-finite coordinate")
        return value

    def string(self) -> str:
        size = self.u32()
        try:
            return self.raw(size).decode("utf-8")
        except UnicodeDecodeError as exc:
            raise NativeClipperError("native clipper response contained invalid UTF-8") from exc

    def ring(self) -> list[list[float]]:
        ring = [[self.f64(), self.f64()] for _ in range(self.u32())]
        clean = _clean_ring(ring)
        if len(clean) < 3:
            raise NativeClipperError("native clipper response ring has fewer than three distinct points")
        return clean

    def ring_i64_nm(self) -> list[list[float]]:
        ring = [[_nm_to_mm(self.i64()), _nm_to_mm(self.i64())] for _ in range(self.u32())]
        clean = _clean_ring(ring)
        if len(clean) < 3:
            raise NativeClipperError("native clipper response ring has fewer than three distinct points")
        return clean

    def finish(self) -> None:
        if self.offset != len(self.data):
            raise NativeClipperError(
                f"native clipper response has {len(self.data) - self.offset} trailing bytes"
            )


def build_native_clip_response(
    semantic_input: dict[str, Any],
    *,
    library: Any | None = None,
    library_path: str | Path | None = None,
    precision: int = DECIMAL_PRECISION,
    protocol: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    started = time.perf_counter()
    tile_size = float(semantic_input.get("tileSizeMm") or 20.0)
    if library is None:
        detail = f" for {library_path}" if library_path else ""
        raise NativeClipperError(
            f"native semantic clipping requires an explicit Prism Clipper2 library{detail}"
        )
    clipper = library
    selected_protocol = _resolve_protocol(protocol, clipper)
    candidate_start = time.perf_counter()
    jobs, _direct_entries, stats = build_clip_jobs(
        semantic_input,
        tile_size=tile_size,
        include_direct_entries=False,
        include_clip_rings=selected_protocol != "a2",
        clean_geometry=selected_protocol != "a2",
    )
    stats["candidate_tile_enumeration_ms"] = _elapsed_ms(candidate_start)
    encode_start = time.perf_counter()
    if selected_protocol == "a2":
        request, request_digest, request_stats = encode_batch_a2_request(
            semantic_input,
            jobs,
            tile_size=tile_size,
            precision=precision,
        )
    else:
        request, request_digest = encode_batch_request(
            semantic_input,
            jobs,
            tile_size=tile_size,
            precision=precision,
        )
        request_stats = {
            "request_bytes": len(request),
            "subject_count": len(jobs),
            "job_count": len(jobs),
            "unique_subject_vertices": _repeated_job_vertex_count(jobs),
            "a1_equivalent_repeated_vertices": _repeated_job_vertex_count(jobs),
            "subject_table_build_ms": 0.0,
            "subject_quantization_ms": 0.0,
            "job_table_build_ms": 0.0,
        }
    encode_ms = _elapsed_ms(encode_start)
    stats.update(request_stats)
    native_start = time.perf_counter()
    response_bytes = clipper.clip_batch_a2(request) if selected_protocol == "a2" else clipper.clip_batch(request)
    native_ms = _elapsed_ms(native_start)
    decode_start = time.perf_counter()
    if selected_protocol == "a2":
        native_response = decode_batch_a2_response(
            response_bytes,
            expected_jobs=jobs,
            expected_request_digest=request_digest,
            expected_geometry_revision=_source_geometry_revision(semantic_input),
            expected_tile_size=tile_size,
        )
    else:
        native_response = decode_batch_response(
            response_bytes,
            expected_jobs=jobs,
            expected_request_digest=request_digest,
            expected_geometry_revision=_source_geometry_revision(semantic_input),
            expected_tile_size=tile_size,
            expected_precision=precision,
        )
    decoded_entries = materialize_clipped_entries(native_response["results"], jobs)
    materialize_start = time.perf_counter()
    clipped_tiles = decoded_entries
    stats["native_boolean_jobs"] = len(jobs)
    stats["empty_clip_results"] = sum(1 for item in decoded_entries if not item.get("regions"))
    stats["non_empty_clip_results"] = sum(1 for item in decoded_entries if item.get("regions"))
    stats["native_clipped_regions"] = sum(len(item.get("regions") or []) for item in clipped_tiles)
    stats["clipped_regions"] = stats["native_clipped_regions"]
    stats["tile_count"] = len({
        f"{item.get('layerId', '')}:{item['tile'][0]}:{item['tile'][1]}"
        for item in clipped_tiles
        if item.get("regions")
    })
    materialize_ms = _elapsed_ms(materialize_start)
    decode_validate_ms = _elapsed_ms(decode_start) - materialize_ms
    timings = {
        "protocol": selected_protocol,
        "request_encode_ms": encode_ms,
        f"{selected_protocol}_request_encode_ms": encode_ms,
        "native_batch_call_ms": native_ms,
        "response_decode_validate_ms": max(0.0, decode_validate_ms),
        "preclip_materialize_ms": materialize_ms,
        "native_total_ms": _elapsed_ms(started),
        "request_bytes": len(request),
        "response_bytes": len(response_bytes),
    }
    identity = clipper.identity(protocol=selected_protocol)
    native_backend = str(identity.get("backend") or "native")
    response = {
        "schema": RESPONSE_SCHEMA,
        "protocolVersion": PROTOCOL_VERSION,
        "requestDigest": request_digest,
        "sourceGeometryRevision": _source_geometry_revision(semantic_input),
        "geometryRevision": semantic_input.get("geometryRevision"),
        "tileSizeMm": tile_size,
        "coordinateSystem": semantic_input.get("coordinateSystem") or {},
        "precisionDecimalPlaces": precision,
        "clipper": {
            "backend": native_backend,
            "libraryPath": identity.get("libraryPath"),
            "librarySha256": identity.get("librarySha256"),
            "version": native_response["nativeVersion"],
            "abi": native_response["nativeAbiVersion"],
            "protocol": selected_protocol,
            "requestedProtocol": protocol
            or os.environ.get(getattr(clipper, "protocol_env", "PRISM_NATIVE_CLIPPER_PROTOCOL"))
            or "auto",
            "batchSymbol": identity.get("batchSymbol"),
            "supportsA2": identity.get("supportsA2"),
        },
        "native": {
            "libraryPath": identity.get("libraryPath"),
            "librarySha256": identity.get("librarySha256"),
            "version": native_response["nativeVersion"],
            "abi": native_response["nativeAbiVersion"],
            "protocol": selected_protocol,
            "requestedProtocol": protocol
            or os.environ.get(getattr(clipper, "protocol_env", "PRISM_NATIVE_CLIPPER_PROTOCOL"))
            or "auto",
            "batchSymbol": identity.get("batchSymbol"),
            "supportsA2": identity.get("supportsA2"),
        },
        "nativeTimings": native_response["timings"],
        "bridgeTimings": timings,
        "stats": stats,
        "clippedTiles": clipped_tiles,
    }
    validate_preclipped_response(semantic_input, response, expected_jobs=jobs)
    return response, timings


def build_clip_jobs(
    semantic_input: dict[str, Any],
    *,
    tile_size: float,
    include_direct_entries: bool = True,
    include_clip_rings: bool = True,
    clean_geometry: bool = True,
) -> tuple[list[ClipJob], list[dict[str, Any]], dict[str, Any]]:
    jobs: list[ClipJob] = []
    direct_entries: list[dict[str, Any]] = []
    stats = {
        "source_polygons": 0,
        "single_tile_polygons": 0,
        "candidate_tiles": 0,
        "native_boolean_jobs": 0,
        "empty_clip_results": 0,
        "non_empty_clip_results": 0,
        "clipped_regions": 0,
        "tile_count": 0,
        "source_bounds_ms": 0.0,
        "source_geometry_clean_ms": 0.0,
        "single_tile_classification_ms": 0.0,
        "multi_tile_candidate_span_ms": 0.0,
        "tile_key_allocation_ms": 0.0,
        "tile_job_generation_ms": 0.0,
    }
    fallback_id = 0
    for obj in semantic_input.get("objects", []) or []:
        for polygon in obj.get("polygons", []) or []:
            fallback_id += 1
            stats["source_polygons"] += 1
            record_id = str(polygon.get("sourcePolygonRecordId", fallback_id))
            source_order = int(polygon.get("sourceOrder", fallback_id - 1))
            bounds_start = time.perf_counter()
            bounds = _raw_outer_bounds(polygon.get("outer") or [])
            stats["source_bounds_ms"] += _elapsed_ms(bounds_start)
            if bounds is None:
                continue
            classify_start = time.perf_counter()
            span = _tile_span_for_bounds(bounds, tile_size)
            tile_count = (span[1] - span[0] + 1) * (span[3] - span[2] + 1)
            stats["candidate_tiles"] += tile_count
            is_single_tile = tile_count == 1
            stats["single_tile_classification_ms"] += _elapsed_ms(classify_start)
            if is_single_tile:
                stats["single_tile_polygons"] += 1
                if not include_direct_entries:
                    continue
            if clean_geometry:
                clean_start = time.perf_counter()
                outer = _clean_ring(polygon.get("outer") or [])
                holes = [_clean_ring(hole) for hole in polygon.get("holes", []) or []]
                holes = [hole for hole in holes if len(hole) >= 3]
                if len(outer) < 3:
                    continue
                outer = _orient_ring(outer, positive=True)
                holes = [_orient_ring(hole, positive=False) for hole in holes]
                stats["source_geometry_clean_ms"] = stats.get("source_geometry_clean_ms", 0.0) + _elapsed_ms(clean_start)
            else:
                outer = polygon.get("outer") or []
                holes = polygon.get("holes", []) or []
            if is_single_tile:
                tile = [span[0], span[2]]
                direct_entries.append(
                    {
                        "jobId": f"direct:{record_id}:{tile[0]}:{tile[1]}",
                        "sourcePolygonRecordId": record_id,
                        "sourceOrder": source_order,
                        "tile": tile,
                        "layerId": int(obj.get("layerId") or 0),
                        "regions": [{"outer": outer, "holes": holes}],
                    }
                )
                continue
            span_start = time.perf_counter()
            tile_pairs = _tile_pairs_for_span(span)
            stats["multi_tile_candidate_span_ms"] += _elapsed_ms(span_start)
            key_start = time.perf_counter()
            tile_keys = [(x, y) for x, y in tile_pairs]
            stats["tile_key_allocation_ms"] += _elapsed_ms(key_start)
            job_start = time.perf_counter()
            for tile_x, tile_y in tile_keys:
                jobs.append(
                    ClipJob(
                        job_id=f"{record_id}:{tile_x}:{tile_y}",
                        source_polygon_record_id=record_id,
                        source_order=source_order,
                        tile_x=tile_x,
                        tile_y=tile_y,
                        outer=outer,
                        holes=holes,
                        clip=_tile_ring((tile_x, tile_y), tile_size) if include_clip_rings else [],
                    )
                )
            stats["tile_job_generation_ms"] += _elapsed_ms(job_start)
    stats["native_boolean_jobs"] = len(jobs)
    return jobs, direct_entries, stats


def _resolve_protocol(protocol: str | None, clipper: Any) -> str:
    env_name = getattr(clipper, "protocol_env", "PRISM_NATIVE_CLIPPER_PROTOCOL")
    requested = (protocol or os.environ.get(env_name) or "auto").strip().lower()
    if requested not in {"a1", "a2", "auto"}:
        raise NativeClipperError(
            f"PRISM_NATIVE_CLIPPER_PROTOCOL must be one of a1, a2, auto; got {requested!r}"
        )
    if requested == "auto":
        return "a2" if clipper.supports_a2 else "a1"
    if requested == "a2" and not clipper.supports_a2:
        raise NativeClipperError(
            f"PRISM_NATIVE_CLIPPER_PROTOCOL=a2 requires prism_clipper2_batch_a2_bytes in {clipper.path}"
        )
    return requested


def encode_batch_request(
    semantic_input: dict[str, Any],
    jobs: list[ClipJob],
    *,
    tile_size: float,
    precision: int = DECIMAL_PRECISION,
) -> tuple[bytes, str]:
    if precision != DECIMAL_PRECISION:
        raise NativeClipperError(f"Prism semantic clipping currently requires decimal precision {DECIMAL_PRECISION}")
    digest_payload = {
        "schema": REQUEST_SCHEMA,
        "version": PROTOCOL_VERSION,
        "sourceGeometryRevision": _source_geometry_revision(semantic_input),
        "tileSizeMm": tile_size,
        "precisionDecimalPlaces": precision,
        "coordinateSystem": semantic_input.get("coordinateSystem") or {},
        "jobs": [
            {
                "jobId": job.job_id,
                "sourcePolygonRecordId": job.source_polygon_record_id,
                "sourceOrder": job.source_order,
                "tile": [job.tile_x, job.tile_y],
                "outer": job.outer,
                "holes": job.holes,
            }
            for job in jobs
        ],
    }
    request_digest = hashlib.sha256(
        json.dumps(digest_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    writer = _Writer()
    writer.raw(REQUEST_MAGIC)
    writer.u32(PROTOCOL_VERSION)
    writer.string(REQUEST_SCHEMA)
    writer.string(request_digest)
    writer.string(_source_geometry_revision(semantic_input))
    writer.u32(precision)
    writer.f64(tile_size)
    writer.string(json.dumps(semantic_input.get("coordinateSystem") or {}, sort_keys=True, separators=(",", ":")))
    writer.u32(len(jobs))
    writer.u32(0)
    for job in jobs:
        writer.string(job.job_id)
        writer.string(job.source_polygon_record_id)
        writer.u32(job.source_order)
        writer.i32(job.tile_x)
        writer.i32(job.tile_y)
        writer.ring(job.outer)
        writer.u32(len(job.holes))
        for hole in job.holes:
            writer.ring(hole)
        writer.ring(job.clip)
    return bytes(writer.data), request_digest


def encode_batch_a2_request(
    semantic_input: dict[str, Any],
    jobs: list[ClipJob],
    *,
    tile_size: float,
    precision: int = DECIMAL_PRECISION,
) -> tuple[bytes, str, dict[str, Any]]:
    if precision != DECIMAL_PRECISION:
        raise NativeClipperError(f"Prism semantic clipping currently requires decimal precision {DECIMAL_PRECISION}")
    subject_start = time.perf_counter()
    subjects = _subjects_for_jobs(jobs)
    subject_table_ms = _elapsed_ms(subject_start)

    body = _Writer()
    body.u32(len(subjects))
    body.u32(len(jobs))
    body.u32(0)
    body.u32(0)
    quantize_start = time.perf_counter()
    unique_subject_vertices = 0
    for subject in subjects:
        body.string(subject.subject_id)
        unique_subject_vertices += body.ring_i64_nm(subject.outer)
        body.u32(len(subject.holes))
        for hole in subject.holes:
            unique_subject_vertices += body.ring_i64_nm(hole)
    subject_quantization_ms = _elapsed_ms(quantize_start)

    job_start = time.perf_counter()
    for job in jobs:
        body.string(job.job_id)
        body.string(job.source_polygon_record_id)
        body.i32(job.tile_x)
        body.i32(job.tile_y)
        body.string(job.source_polygon_record_id)
        body.u32(job.source_order)
    job_table_ms = _elapsed_ms(job_start)
    body_bytes = bytes(body.data)

    digest_start = time.perf_counter()
    digest = hashlib.sha256()
    digest.update(A2_REQUEST_MAGIC)
    digest.update(struct.pack("<I", A2_PROTOCOL_VERSION))
    digest.update(A2_REQUEST_SCHEMA.encode("utf-8"))
    digest.update(_source_geometry_revision(semantic_input).encode("utf-8"))
    digest.update(struct.pack("<Iq", COORDINATE_SCALE_NM_PER_MM, _mm_to_nm(tile_size)))
    digest.update(body_bytes)
    request_digest = digest.hexdigest()
    digest_ms = _elapsed_ms(digest_start)

    assembly_start = time.perf_counter()
    writer = _Writer()
    writer.raw(A2_REQUEST_MAGIC)
    writer.u32(A2_PROTOCOL_VERSION)
    writer.string(A2_REQUEST_SCHEMA)
    writer.string(request_digest)
    writer.string(_source_geometry_revision(semantic_input))
    writer.u32(COORDINATE_SCALE_NM_PER_MM)
    writer.i64(_mm_to_nm(tile_size))
    writer.raw(body_bytes)
    request = bytes(writer.data)
    assembly_ms = _elapsed_ms(assembly_start)
    return request, request_digest, {
        "request_bytes": len(request),
        "subject_count": len(subjects),
        "job_count": len(jobs),
        "unique_subject_vertices": unique_subject_vertices,
        "a1_equivalent_repeated_vertices": _repeated_job_vertex_count(jobs),
        "subject_table_build_ms": subject_table_ms,
        "subject_quantization_ms": subject_quantization_ms,
        "job_table_build_ms": job_table_ms,
        "a2_digest_ms": digest_ms,
        "final_buffer_assembly_ms": assembly_ms,
    }


def decode_batch_response(
    data: bytes,
    *,
    expected_jobs: list[ClipJob],
    expected_request_digest: str,
    expected_geometry_revision: str,
    expected_tile_size: float,
    expected_precision: int = DECIMAL_PRECISION,
) -> dict[str, Any]:
    reader = _Reader(data)
    if reader.raw(8) != RESPONSE_MAGIC:
        raise NativeClipperError("native clipper response has invalid magic")
    version = reader.u32()
    if version != PROTOCOL_VERSION:
        raise NativeClipperError(f"unsupported native clipper response version {version}")
    schema = reader.string()
    if schema != RESPONSE_SCHEMA:
        raise NativeClipperError(f"native clipper response schema mismatch: {schema!r}")
    request_digest = reader.string()
    geometry_revision = reader.string()
    precision = reader.u32()
    tile_size = reader.f64()
    native_version = reader.string()
    native_abi = reader.u32()
    timings = {
        "decode_ms": reader.f64(),
        "boolean_ms": reader.f64(),
        "normalize_ms": reader.f64(),
        "encode_ms": reader.f64(),
        "total_ms": reader.f64(),
    }
    result_count = reader.u32()
    reader.u32()
    if request_digest != expected_request_digest:
        raise NativeClipperError("native clipper response request digest does not match request")
    if geometry_revision != expected_geometry_revision:
        raise NativeClipperError("native clipper response geometry revision does not match request")
    if precision != expected_precision:
        raise NativeClipperError("native clipper response decimal precision does not match request")
    if abs(tile_size - expected_tile_size) > 1e-9:
        raise NativeClipperError("native clipper response tile size does not match request")
    expected_ids = {job.job_id for job in expected_jobs}
    seen_ids: set[str] = set()
    results: list[dict[str, Any]] = []
    for _ in range(result_count):
        job_id = reader.string()
        if job_id in seen_ids:
            raise NativeClipperError(f"native clipper response duplicated job id {job_id!r}")
        if job_id not in expected_ids:
            raise NativeClipperError(f"native clipper response contained unexpected job id {job_id!r}")
        seen_ids.add(job_id)
        source_id = reader.string()
        source_order = reader.u32()
        tile_x = reader.i32()
        tile_y = reader.i32()
        status = reader.u32()
        error_code = reader.string()
        error_message = reader.string()
        region_count = reader.u32()
        regions: list[dict[str, Any]] = []
        for _region_index in range(region_count):
            outer = reader.ring()
            hole_count = reader.u32()
            holes = [reader.ring() for _ in range(hole_count)]
            regions.append({"outer": outer, "holes": holes})
        if status == 2:
            raise NativeClipperError(
                f"native clipper job {job_id} failed: {error_code or '<unknown>'} {error_message}".strip()
            )
        if status not in {0, 1}:
            raise NativeClipperError(f"native clipper job {job_id} returned invalid status {status}")
        if status == 1 and regions:
            raise NativeClipperError(f"native clipper empty job {job_id} returned regions")
        results.append(
            {
                "jobId": job_id,
                "sourcePolygonRecordId": source_id,
                "sourceOrder": source_order,
                "tile": [tile_x, tile_y],
                "status": "ok" if status == 0 else "empty",
                "regions": regions,
            }
        )
    reader.finish()
    missing = sorted(expected_ids - seen_ids)
    if missing:
        preview = ", ".join(missing[:8])
        suffix = "" if len(missing) <= 8 else f", ... +{len(missing) - 8} more"
        raise NativeClipperError(f"native clipper response omitted job id(s): {preview}{suffix}")
    return {
        "schema": schema,
        "requestDigest": request_digest,
        "geometryRevision": geometry_revision,
        "precisionDecimalPlaces": precision,
        "tileSizeMm": tile_size,
        "nativeVersion": native_version,
        "nativeAbiVersion": native_abi,
        "timings": timings,
        "results": results,
    }


def decode_batch_a2_response(
    data: bytes,
    *,
    expected_jobs: list[ClipJob],
    expected_request_digest: str,
    expected_geometry_revision: str,
    expected_tile_size: float,
) -> dict[str, Any]:
    reader = _Reader(data)
    if reader.raw(8) != A2_RESPONSE_MAGIC:
        raise NativeClipperError("native clipper A2 response has invalid magic")
    version = reader.u32()
    if version != A2_PROTOCOL_VERSION:
        raise NativeClipperError(f"unsupported native clipper A2 response version {version}")
    schema = reader.string()
    if schema != A2_RESPONSE_SCHEMA:
        raise NativeClipperError(f"native clipper A2 response schema mismatch: {schema!r}")
    request_digest = reader.string()
    geometry_revision = reader.string()
    coordinate_scale = reader.u32()
    tile_size_nm = reader.i64()
    native_version = reader.string()
    native_abi = reader.u32()
    timings = {
        "request_decode_ms": reader.f64(),
        "subject_decode_ms": reader.f64(),
        "subject_count": reader.u32(),
        "job_count": reader.u32(),
        "unique_subject_vertices": reader.i64(),
        "boolean_ms": reader.f64(),
        "response_encode_ms": reader.f64(),
        "total_ms": reader.f64(),
        "request_bytes": reader.i64(),
        "response_bytes": reader.i64(),
    }
    result_count = reader.u32()
    reader.u32()
    if request_digest != expected_request_digest:
        raise NativeClipperError("native clipper A2 response request digest does not match request")
    if geometry_revision != expected_geometry_revision:
        raise NativeClipperError("native clipper A2 response geometry revision does not match request")
    if coordinate_scale != COORDINATE_SCALE_NM_PER_MM:
        raise NativeClipperError("native clipper A2 coordinate scale does not match request")
    if tile_size_nm != _mm_to_nm(expected_tile_size):
        raise NativeClipperError("native clipper A2 tile size does not match request")
    expected_by_id = {job.job_id: job for job in expected_jobs}
    seen_ids: set[str] = set()
    results: list[dict[str, Any]] = []
    for _ in range(result_count):
        job_id = reader.string()
        if job_id in seen_ids:
            raise NativeClipperError(f"native clipper A2 response duplicated job id {job_id!r}")
        job = expected_by_id.get(job_id)
        if job is None:
            raise NativeClipperError(f"native clipper A2 response contained unexpected job id {job_id!r}")
        seen_ids.add(job_id)
        subject_id = reader.string()
        tile_x = reader.i32()
        tile_y = reader.i32()
        status = reader.u32()
        error_code = reader.string()
        error_message = reader.string()
        region_count = reader.u32()
        regions: list[dict[str, Any]] = []
        for _region_index in range(region_count):
            outer = reader.ring_i64_nm()
            hole_count = reader.u32()
            holes = [reader.ring_i64_nm() for _ in range(hole_count)]
            regions.append({"outer": outer, "holes": holes})
        if subject_id != job.source_polygon_record_id:
            raise NativeClipperError(f"native clipper A2 job {job_id} returned unexpected subjectId {subject_id!r}")
        if [tile_x, tile_y] != [job.tile_x, job.tile_y]:
            raise NativeClipperError(f"native clipper A2 job {job_id} returned unexpected tile")
        if status == 2:
            raise NativeClipperError(
                f"native clipper A2 job {job_id} failed: {error_code or '<unknown>'} {error_message}".strip()
            )
        if status not in {0, 1}:
            raise NativeClipperError(f"native clipper A2 job {job_id} returned invalid status {status}")
        if status == 1 and regions:
            raise NativeClipperError(f"native clipper A2 empty job {job_id} returned regions")
        results.append(
            {
                "jobId": job_id,
                "sourcePolygonRecordId": job.source_polygon_record_id,
                "sourceOrder": job.source_order,
                "tile": [tile_x, tile_y],
                "status": "ok" if status == 0 else "empty",
                "regions": regions,
            }
        )
    reader.finish()
    missing = sorted(set(expected_by_id) - seen_ids)
    if missing:
        preview = ", ".join(missing[:8])
        suffix = "" if len(missing) <= 8 else f", ... +{len(missing) - 8} more"
        raise NativeClipperError(f"native clipper A2 response omitted job id(s): {preview}{suffix}")
    return {
        "schema": schema,
        "requestDigest": request_digest,
        "geometryRevision": geometry_revision,
        "coordinateScaleNmPerMm": coordinate_scale,
        "tileSizeMm": _nm_to_mm(tile_size_nm),
        "nativeVersion": native_version,
        "nativeAbiVersion": native_abi,
        "timings": timings,
        "results": results,
    }


def materialize_clipped_entries(results: list[dict[str, Any]], jobs: list[ClipJob]) -> list[dict[str, Any]]:
    layer_by_source: dict[str, int] = {}
    for job in jobs:
        layer_by_source.setdefault(job.source_polygon_record_id, 0)
    entries: list[dict[str, Any]] = []
    for result in results:
        entries.append(
            {
                "jobId": result["jobId"],
                "sourcePolygonRecordId": result["sourcePolygonRecordId"],
                "sourceOrder": result["sourceOrder"],
                "tile": result["tile"],
                "regions": result["regions"],
            }
        )
    return entries


def validate_preclipped_response(
    semantic_input: dict[str, Any],
    response: dict[str, Any],
    *,
    expected_jobs: list[ClipJob] | None = None,
) -> None:
    if response.get("schema") != RESPONSE_SCHEMA:
        raise NativeClipperError("preclipped response schema mismatch")
    if int(response.get("protocolVersion") or 0) != PROTOCOL_VERSION:
        raise NativeClipperError("preclipped response protocol version mismatch")
    if response.get("sourceGeometryRevision") != _source_geometry_revision(semantic_input):
        raise NativeClipperError("preclipped response source geometry revision mismatch")
    if abs(float(response.get("tileSizeMm") or 0) - float(semantic_input.get("tileSizeMm") or 20.0)) > 1e-9:
        raise NativeClipperError("preclipped response tile size mismatch")
    if int(response.get("precisionDecimalPlaces") or 0) != DECIMAL_PRECISION:
        raise NativeClipperError("preclipped response decimal precision mismatch")
    if (response.get("coordinateSystem") or {}) != (semantic_input.get("coordinateSystem") or {}):
        raise NativeClipperError("preclipped response coordinate system mismatch")
    native = response.get("native") or response.get("clipper") or {}
    protocol = native.get("protocol")
    if protocol == "a2":
        required_identity = ["libraryPath", "librarySha256", "version", "abi", "batchSymbol"]
        missing_identity = [key for key in required_identity if native.get(key) in (None, "")]
        if missing_identity:
            raise NativeClipperError(
                "preclipped native A2 response is missing identity field(s): "
                + ", ".join(missing_identity)
            )
        if native.get("batchSymbol") not in {
            "prism_clipper2_batch_a2_bytes",
        }:
            raise NativeClipperError("preclipped A2 response has wrong batch symbol")
    expected_ids = {job.job_id for job in expected_jobs or []}
    seen_ids: set[str] = set()
    for entry in response.get("clippedTiles", []) or []:
        job_id = str(entry.get("jobId") or "")
        if job_id.startswith("direct:"):
            raise NativeClipperError(f"native preclip response must not include direct job id {job_id}")
        if job_id:
            if job_id in seen_ids:
                raise NativeClipperError(f"duplicate preclipped job id {job_id}")
            seen_ids.add(job_id)
            if expected_ids and job_id not in expected_ids:
                raise NativeClipperError(f"unexpected preclipped job id {job_id}")
        tile = entry.get("tile")
        if not (isinstance(tile, list) and len(tile) == 2 and all(isinstance(v, int) for v in tile)):
            raise NativeClipperError(f"invalid preclipped tile coordinate: {tile!r}")
        for region in entry.get("regions", []) or []:
            _validate_ring(region.get("outer") or [])
            for hole in region.get("holes", []) or []:
                _validate_ring(hole)
    if expected_ids:
        missing = sorted(expected_ids - seen_ids)
        if missing:
            raise NativeClipperError(f"preclipped response missing native job id {missing[0]}")


def _source_geometry_revision(semantic_input: dict[str, Any]) -> str:
    return str(semantic_input.get("sourceGeometryRevision") or semantic_input.get("geometryRevision") or "")


def _subjects_for_jobs(jobs: list[ClipJob]) -> list[ClipSubject]:
    subjects: dict[str, ClipSubject] = {}
    for job in jobs:
        existing = subjects.get(job.source_polygon_record_id)
        if existing is None:
            subjects[job.source_polygon_record_id] = _clean_clip_subject(job)
            continue
    return [subjects[key] for key in sorted(subjects, key=_source_id_sort_key)]


def _clean_clip_subject(job: ClipJob) -> ClipSubject:
    outer = _clean_ring(job.outer)
    holes = [_clean_ring(hole) for hole in job.holes]
    holes = [hole for hole in holes if len(hole) >= 3]
    if len(outer) < 3:
        raise NativeClipperError(f"source polygon {job.source_polygon_record_id!r} has fewer than three points")
    return ClipSubject(
        job.source_polygon_record_id,
        _orient_ring(outer, positive=True),
        [_orient_ring(hole, positive=False) for hole in holes],
    )


def _source_id_sort_key(value: str) -> tuple[int, int | str]:
    try:
        return (0, int(value))
    except ValueError:
        return (1, value)


def _ring_nm(ring: list[list[float]]) -> list[list[int]]:
    return [[_mm_to_nm(point[0]), _mm_to_nm(point[1])] for point in _clean_ring(ring)]


def _mm_to_nm(value: float) -> int:
    if not math.isfinite(value):
        raise NativeClipperError(f"non-finite coordinate in A2 request: {value}")
    return int(round(float(value) * COORDINATE_SCALE_NM_PER_MM))


def _nm_to_mm(value: int) -> float:
    return round(float(value) / COORDINATE_SCALE_NM_PER_MM, DECIMAL_PRECISION)


def _repeated_job_vertex_count(jobs: list[ClipJob]) -> int:
    total = 0
    for job in jobs:
        total += len(job.outer)
        total += sum(len(hole) for hole in job.holes)
    return total


def _polygon_bounds(outer: list[list[float]], holes: list[list[list[float]]]) -> tuple[float, float, float, float]:
    points = [point for ring in [outer, *holes] for point in ring]
    return (
        min(point[0] for point in points),
        min(point[1] for point in points),
        max(point[0] for point in points),
        max(point[1] for point in points),
    )


def _raw_outer_bounds(outer: list[Any]) -> tuple[float, float, float, float] | None:
    min_x = math.inf
    min_y = math.inf
    max_x = -math.inf
    max_y = -math.inf
    count = 0
    for point in outer:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            raise NativeClipperError(f"invalid ring point: {point!r}")
        x = float(point[0])
        y = float(point[1])
        if not math.isfinite(x) or not math.isfinite(y):
            raise NativeClipperError(f"non-finite ring point: {point!r}")
        if x < min_x:
            min_x = x
        if y < min_y:
            min_y = y
        if x > max_x:
            max_x = x
        if y > max_y:
            max_y = y
        count += 1
    if count < 3:
        return None
    return (min_x, min_y, max_x, max_y)


def _tile_span_for_bounds(bounds: tuple[float, float, float, float], tile_size: float) -> tuple[int, int, int, int]:
    epsilon = 1e-9
    min_x, min_y, max_x, max_y = bounds
    inv_tile_size = 1.0 / tile_size
    return (
        math.floor(min_x * inv_tile_size),
        math.floor((max_x - epsilon) * inv_tile_size),
        math.floor(min_y * inv_tile_size),
        math.floor((max_y - epsilon) * inv_tile_size),
    )


def _tile_pairs_for_span(span: tuple[int, int, int, int]) -> list[tuple[int, int]]:
    min_x, max_x, min_y, max_y = span
    return [(x, y) for y in range(min_y, max_y + 1) for x in range(min_x, max_x + 1)]


def _tiles_for_bounds(bounds: tuple[float, float, float, float], tile_size: float) -> list[list[int]]:
    min_x, max_x, min_y, max_y = _tile_span_for_bounds(bounds, tile_size)
    tiles: list[list[int]] = []
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            tiles.append([x, y])
    return tiles


def _tile_ring(tile: list[int] | tuple[int, int], tile_size: float) -> list[list[float]]:
    min_x = tile[0] * tile_size
    min_y = tile[1] * tile_size
    max_x = min_x + tile_size
    max_y = min_y + tile_size
    return [[min_x, min_y], [max_x, min_y], [max_x, max_y], [min_x, max_y]]


def _clean_ring(ring: list[Any]) -> list[list[float]]:
    cleaned: list[list[float]] = []
    for point in ring:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            raise NativeClipperError(f"invalid ring point: {point!r}")
        x = float(point[0])
        y = float(point[1])
        if not math.isfinite(x) or not math.isfinite(y):
            raise NativeClipperError(f"non-finite ring point: {point!r}")
        rounded = [round(x, DECIMAL_PRECISION), round(y, DECIMAL_PRECISION)]
        if not cleaned or cleaned[-1] != rounded:
            cleaned.append(rounded)
    if len(cleaned) > 1 and cleaned[0] == cleaned[-1]:
        cleaned.pop()
    return cleaned


def _validate_ring(ring: list[Any]) -> None:
    cleaned = _clean_ring(ring)
    if len({(point[0], point[1]) for point in cleaned}) < 3:
        raise NativeClipperError("preclipped response ring has fewer than three distinct vertices")


def _orient_ring(ring: list[list[float]], *, positive: bool) -> list[list[float]]:
    area = _signed_area(ring)
    if (area >= 0) == positive:
        return ring
    return list(reversed(ring))


def _signed_area(ring: list[list[float]]) -> float:
    area = 0.0
    for index, point in enumerate(ring):
        next_point = ring[(index + 1) % len(ring)]
        area += point[0] * next_point[1] - next_point[0] * point[1]
    return area / 2.0


def _elapsed_ms(start: float) -> float:
    return (time.perf_counter() - start) * 1000.0
