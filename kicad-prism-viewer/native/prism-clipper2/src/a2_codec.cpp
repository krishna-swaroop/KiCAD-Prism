#include "a2_types.h"

#include <cstring>
#include <stdexcept>

namespace prism::clipper2 {

namespace {

class Reader {
public:
    Reader(const uint8_t* data, size_t size) : data_(data), size_(size) {}

    void raw(void* out, size_t len) {
        if (offset_ + len > size_) {
            throw std::runtime_error("A2 request ended unexpectedly");
        }
        std::memcpy(out, data_ + offset_, len);
        offset_ += len;
    }

    uint32_t u32() {
        uint32_t value = 0;
        raw(&value, sizeof(value));
        return value;
    }

    int32_t i32() {
        int32_t value = 0;
        raw(&value, sizeof(value));
        return value;
    }

    int64_t i64() {
        int64_t value = 0;
        raw(&value, sizeof(value));
        return value;
    }

    std::string string() {
        const uint32_t size = u32();
        if (offset_ + size > size_) {
            throw std::runtime_error("A2 request string ended unexpectedly");
        }
        std::string value(reinterpret_cast<const char*>(data_ + offset_), size);
        offset_ += size;
        return value;
    }

    Ring ring() {
        const uint32_t count = u32();
        Ring ring;
        ring.reserve(count);
        for (uint32_t i = 0; i < count; ++i) {
            ring.push_back(Point{i64(), i64()});
        }
        return ring;
    }

    void finish() const {
        if (offset_ != size_) {
            throw std::runtime_error("A2 request has trailing bytes");
        }
    }

private:
    const uint8_t* data_;
    size_t size_;
    size_t offset_ = 0;
};

class Writer {
public:
    void raw(const void* value, size_t size) {
        const auto* bytes = static_cast<const uint8_t*>(value);
        data_.insert(data_.end(), bytes, bytes + size);
    }

    void u32(uint32_t value) { raw(&value, sizeof(value)); }
    void i32(int32_t value) { raw(&value, sizeof(value)); }
    void i64(int64_t value) { raw(&value, sizeof(value)); }

    void f64(double value) { raw(&value, sizeof(value)); }

    void string(const std::string& value) {
        if (value.size() > UINT32_MAX) {
            throw std::runtime_error("A2 response string is too large");
        }
        u32(static_cast<uint32_t>(value.size()));
        raw(value.data(), value.size());
    }

    void ring(const Ring& ring) {
        if (ring.size() > UINT32_MAX) {
            throw std::runtime_error("A2 response ring is too large");
        }
        u32(static_cast<uint32_t>(ring.size()));
        for (const Point& point : ring) {
            i64(point.x);
            i64(point.y);
        }
    }

    std::vector<uint8_t> take() { return std::move(data_); }

private:
    std::vector<uint8_t> data_;
};

}  // namespace

Request decode_a2_request(const uint8_t* data, size_t size, Timings& timings) {
    if (!data || size == 0) {
        throw std::runtime_error("A2 request is empty");
    }
    Reader reader(data, size);
    char magic[8] = {};
    reader.raw(magic, sizeof(magic));
    if (std::memcmp(magic, kRequestMagic, sizeof(magic)) != 0) {
        throw std::runtime_error("A2 request has invalid magic");
    }
    const uint32_t version = reader.u32();
    if (version != kProtocolVersion) {
        throw std::runtime_error("unsupported A2 request protocol version");
    }
    const std::string schema = reader.string();
    if (schema != kRequestSchema) {
        throw std::runtime_error("A2 request schema mismatch");
    }

    Request request;
    request.request_digest = reader.string();
    request.geometry_revision = reader.string();
    request.coordinate_scale = reader.u32();
    request.tile_size_nm = reader.i64();
    if (request.coordinate_scale != kCoordinateScaleNmPerMm) {
        throw std::runtime_error("A2 request coordinate scale mismatch");
    }
    if (request.tile_size_nm <= 0) {
        throw std::runtime_error("A2 request tile size must be positive");
    }

    const uint32_t subject_count = reader.u32();
    const uint32_t job_count = reader.u32();
    reader.u32();
    reader.u32();

    request.subjects.reserve(subject_count);
    int64_t unique_vertices = 0;
    for (uint32_t i = 0; i < subject_count; ++i) {
        Subject subject;
        subject.subject_id = reader.string();
        subject.outer = reader.ring();
        unique_vertices += static_cast<int64_t>(subject.outer.size());
        const uint32_t hole_count = reader.u32();
        subject.holes.reserve(hole_count);
        for (uint32_t h = 0; h < hole_count; ++h) {
            subject.holes.push_back(reader.ring());
            unique_vertices += static_cast<int64_t>(subject.holes.back().size());
        }
        request.subjects.push_back(std::move(subject));
    }

    request.jobs.reserve(job_count);
    for (uint32_t i = 0; i < job_count; ++i) {
        Job job;
        job.job_id = reader.string();
        job.subject_id = reader.string();
        job.tile_x = reader.i32();
        job.tile_y = reader.i32();
        job.source_polygon_record_id = reader.string();
        job.source_order = reader.u32();
        request.jobs.push_back(std::move(job));
    }
    reader.finish();

    timings.subject_count = subject_count;
    timings.job_count = job_count;
    timings.unique_subject_vertices = unique_vertices;
    timings.request_bytes = static_cast<int64_t>(size);
    return request;
}

std::vector<uint8_t> encode_a2_response(const Request& request, const std::vector<Result>& results, const Timings& timings) {
    Writer writer;
    writer.raw(kResponseMagic, 8);
    writer.u32(kProtocolVersion);
    writer.string(kResponseSchema);
    writer.string(request.request_digest);
    writer.string(request.geometry_revision);
    writer.u32(request.coordinate_scale);
    writer.i64(request.tile_size_nm);
    writer.string(kVersion);
    writer.u32(kAbiVersion);
    writer.f64(timings.request_decode_ms);
    writer.f64(timings.subject_decode_ms);
    writer.u32(timings.subject_count);
    writer.u32(timings.job_count);
    writer.i64(timings.unique_subject_vertices);
    writer.f64(timings.boolean_ms);
    writer.f64(timings.response_encode_ms);
    writer.f64(timings.total_ms);
    writer.i64(timings.request_bytes);
    writer.i64(timings.response_bytes);
    if (results.size() > UINT32_MAX) {
        throw std::runtime_error("A2 response has too many results");
    }
    writer.u32(static_cast<uint32_t>(results.size()));
    writer.u32(0);
    for (const Result& result : results) {
        writer.string(result.job_id);
        writer.string(result.subject_id);
        writer.i32(result.tile_x);
        writer.i32(result.tile_y);
        writer.u32(static_cast<uint32_t>(result.status));
        writer.string(result.error_code);
        writer.string(result.error_message);
        if (result.regions.size() > UINT32_MAX) {
            throw std::runtime_error("A2 response result has too many regions");
        }
        writer.u32(static_cast<uint32_t>(result.regions.size()));
        for (const Region& region : result.regions) {
            writer.ring(region.outer);
            if (region.holes.size() > UINT32_MAX) {
                throw std::runtime_error("A2 response region has too many holes");
            }
            writer.u32(static_cast<uint32_t>(region.holes.size()));
            for (const Ring& hole : region.holes) {
                writer.ring(hole);
            }
        }
    }
    return writer.take();
}

}  // namespace prism::clipper2
