#include "prism_clipper2.h"

#include <cassert>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

void require(bool condition, const char* message) {
    if (!condition) {
        throw std::runtime_error(message);
    }
}

void require_bounds(bool condition, const char* message, size_t offset, size_t size, size_t total) {
    if (!condition) {
        throw std::runtime_error(std::string(message) + " offset=" + std::to_string(offset) + " size=" + std::to_string(size) + " total=" + std::to_string(total));
    }
}

class Writer {
public:
    void raw(const void* ptr, size_t size) {
        const auto* bytes = static_cast<const uint8_t*>(ptr);
        data.insert(data.end(), bytes, bytes + size);
    }
    void u32(uint32_t value) { raw(&value, sizeof(value)); }
    void i32(int32_t value) { raw(&value, sizeof(value)); }
    void i64(int64_t value) { raw(&value, sizeof(value)); }
    void f64(double value) { raw(&value, sizeof(value)); }
    void string(const std::string& value) {
        u32(static_cast<uint32_t>(value.size()));
        raw(value.data(), value.size());
    }
    void ring(std::initializer_list<std::pair<int64_t, int64_t>> points) {
        u32(static_cast<uint32_t>(points.size()));
        for (const auto& point : points) {
            i64(point.first);
            i64(point.second);
        }
    }
    std::vector<uint8_t> data;
};

struct TestJob {
    std::string job_id;
    std::string subject_id;
    int32_t tile_x;
    int32_t tile_y;
};

std::vector<uint8_t> request_with(
    const std::string& schema,
    const std::vector<TestJob>& jobs,
    bool include_subject = true,
    bool include_hole = false
) {
    Writer body;
    body.u32(include_subject ? 1 : 0);
    body.u32(static_cast<uint32_t>(jobs.size()));
    body.u32(0);
    body.u32(0);
    if (include_subject) {
        body.string("1");
        if (include_hole) {
            body.ring({{-30000000, -30000000}, {30000000, -30000000}, {30000000, 30000000}, {-30000000, 30000000}});
        } else {
            body.ring({{0, 0}, {30000000, 0}, {30000000, 30000000}, {0, 30000000}});
        }
        body.u32(include_hole ? 1 : 0);
        if (include_hole) {
            body.ring({{-18000000, -18000000}, {-12000000, -18000000}, {-12000000, -12000000}, {-18000000, -12000000}});
        }
    }
    for (const auto& job : jobs) {
        body.string(job.job_id);
        body.string(job.subject_id);
        body.i32(job.tile_x);
        body.i32(job.tile_y);
        body.string(job.subject_id);
        body.u32(0);
    }

    Writer out;
    const char magic[8] = {'G', 'M', 'C', '2', 'Y', 'Q', '0', '1'};
    out.raw(magic, 8);
    out.u32(2);
    out.string(schema);
    out.string("test-digest");
    out.string("test-revision");
    out.u32(1000000);
    out.i64(20000000);
    out.raw(body.data.data(), body.data.size());
    return out.data;
}

std::vector<uint8_t> rectangle_request() {
    return request_with(
        "prism.clipper2_batch_request_a2",
        {
            {"1:0:0", "1", 0, 0},
            {"1:1:0", "1", 1, 0},
        }
    );
}

uint32_t read_u32(const std::vector<uint8_t>& data, size_t& offset) {
    require_bounds(offset + sizeof(uint32_t) <= data.size(), "read_u32 out of bounds", offset, sizeof(uint32_t), data.size());
    uint32_t value = 0;
    std::memcpy(&value, data.data() + offset, sizeof(value));
    offset += sizeof(value);
    return value;
}

int32_t read_i32(const std::vector<uint8_t>& data, size_t& offset) {
    require_bounds(offset + sizeof(int32_t) <= data.size(), "read_i32 out of bounds", offset, sizeof(int32_t), data.size());
    int32_t value = 0;
    std::memcpy(&value, data.data() + offset, sizeof(value));
    offset += sizeof(value);
    return value;
}

int64_t read_i64(const std::vector<uint8_t>& data, size_t& offset) {
    require_bounds(offset + sizeof(int64_t) <= data.size(), "read_i64 out of bounds", offset, sizeof(int64_t), data.size());
    int64_t value = 0;
    std::memcpy(&value, data.data() + offset, sizeof(value));
    offset += sizeof(value);
    return value;
}

double read_f64(const std::vector<uint8_t>& data, size_t& offset) {
    require_bounds(offset + sizeof(double) <= data.size(), "read_f64 out of bounds", offset, sizeof(double), data.size());
    double value = 0;
    std::memcpy(&value, data.data() + offset, sizeof(value));
    offset += sizeof(value);
    return value;
}

std::string read_string(const std::vector<uint8_t>& data, size_t& offset) {
    const uint32_t size = read_u32(data, offset);
    require_bounds(offset + size <= data.size(), "read_string out of bounds", offset, size, data.size());
    std::string value(reinterpret_cast<const char*>(data.data() + offset), size);
    offset += size;
    return value;
}

void skip_ring(const std::vector<uint8_t>& data, size_t& offset) {
    const uint32_t count = read_u32(data, offset);
    require_bounds(offset + static_cast<size_t>(count) * 16 <= data.size(), "skip_ring out of bounds", offset, static_cast<size_t>(count) * 16, data.size());
    offset += static_cast<size_t>(count) * 16;
}

struct ParsedResponse {
    uint32_t result_count = 0;
    uint32_t ok_count = 0;
    uint32_t empty_count = 0;
    uint32_t hole_count = 0;
    bool saw_negative_tile = false;
};

ParsedResponse parse_response(const std::vector<uint8_t>& bytes) {
    size_t offset = 0;
    require(std::memcmp(bytes.data(), "GMC2YS01", 8) == 0, "bad response magic");
    offset += 8;
    require(read_u32(bytes, offset) == 2, "bad response protocol");
    require(read_string(bytes, offset) == "prism.clipper2_batch_response_a2", "bad response schema");
    require(read_string(bytes, offset) == "test-digest", "bad response digest");
    require(read_string(bytes, offset) == "test-revision", "bad response revision");
    require(read_u32(bytes, offset) == 1000000, "bad coordinate scale");
    require(read_i64(bytes, offset) == 20000000, "bad tile size");
    require(read_string(bytes, offset).find("prism-clipper2") != std::string::npos, "bad version string");
    require(read_u32(bytes, offset) == 20260708, "bad abi");
    read_f64(bytes, offset);
    read_f64(bytes, offset);
    read_u32(bytes, offset);
    read_u32(bytes, offset);
    read_i64(bytes, offset);
    read_f64(bytes, offset);
    read_f64(bytes, offset);
    read_f64(bytes, offset);
    read_i64(bytes, offset);
    read_i64(bytes, offset);
    ParsedResponse parsed;
    parsed.result_count = read_u32(bytes, offset);
    read_u32(bytes, offset);
    for (uint32_t i = 0; i < parsed.result_count; ++i) {
        read_string(bytes, offset);
        read_string(bytes, offset);
        const int32_t tile_x = read_i32(bytes, offset);
        const int32_t tile_y = read_i32(bytes, offset);
        parsed.saw_negative_tile = parsed.saw_negative_tile || tile_x < 0 || tile_y < 0;
        const uint32_t status = read_u32(bytes, offset);
        if (status == 0) parsed.ok_count += 1;
        if (status == 1) parsed.empty_count += 1;
        read_string(bytes, offset);
        read_string(bytes, offset);
        const uint32_t region_count = read_u32(bytes, offset);
        for (uint32_t r = 0; r < region_count; ++r) {
            skip_ring(bytes, offset);
            const uint32_t holes = read_u32(bytes, offset);
            parsed.hole_count += holes;
            for (uint32_t h = 0; h < holes; ++h) skip_ring(bytes, offset);
        }
    }
    require(offset == bytes.size(), "response parser did not consume all bytes");
    return parsed;
}

std::vector<uint8_t> call_success(const std::vector<uint8_t>& request) {
    uint8_t* response = nullptr;
    size_t response_len = 0;
    char* error = nullptr;
    const int code = prism_clipper2_batch_a2_bytes(
        request.data(),
        request.size(),
        &response,
        &response_len,
        &error
    );
    require(code == 0, "native call failed");
    require(error == nullptr, "unexpected native error string");
    require(response != nullptr, "native response pointer missing");
    require(response_len > 0, "native response length missing");
    std::vector<uint8_t> bytes(response, response + response_len);
    prism_clipper2_free_bytes(response);
    return bytes;
}

void call_failure(const std::vector<uint8_t>& request) {
    uint8_t* response = nullptr;
    size_t response_len = 0;
    char* error = nullptr;
    const int code = prism_clipper2_batch_a2_bytes(
        request.data(),
        request.size(),
        &response,
        &response_len,
        &error
    );
    require(code != 0, "native failure call unexpectedly succeeded");
    require(response == nullptr, "failure response pointer must be null");
    require(response_len == 0, "failure response length must be zero");
    require(error != nullptr, "failure error string missing");
    prism_clipper2_free_bytes(error);
}

}  // namespace

int main() {
    require(std::string(prism_clipper2_version_string()).find("prism-clipper2") != std::string::npos, "bad version function");
    require(prism_clipper2_abi_version() == 20260708, "bad abi function");
    require(prism_clipper2_protocol_version() == 2, "bad protocol function");

    std::vector<uint8_t> rect_bytes = call_success(rectangle_request());
    ParsedResponse rect = parse_response(rect_bytes);
    require(rect.result_count == 2, "rectangle result count mismatch");
    require(rect.ok_count == 2, "rectangle ok count mismatch");

    auto negative_hole_request = request_with(
        "prism.clipper2_batch_request_a2",
        {{"negative-hole", "1", -1, -1}},
        true,
        true
    );
    ParsedResponse negative_hole = parse_response(call_success(negative_hole_request));
    require(negative_hole.result_count == 1, "negative hole result count mismatch");
    require(negative_hole.ok_count == 1, "negative hole ok count mismatch");
    require(negative_hole.saw_negative_tile, "negative tile was not represented");
    require(negative_hole.hole_count >= 1, "hole was not preserved");

    std::vector<uint8_t> deterministic_a = call_success(negative_hole_request);
    std::vector<uint8_t> deterministic_b = call_success(negative_hole_request);
    require(deterministic_a.size() == deterministic_b.size(), "deterministic response size mismatch");
    require(parse_response(deterministic_a).hole_count == parse_response(deterministic_b).hole_count, "deterministic hole count mismatch");

    call_failure(std::vector<uint8_t>{'b', 'a', 'd'});
    call_failure(request_with("bad.schema", {{"bad-schema", "1", 0, 0}}));
    call_failure(request_with("prism.clipper2_batch_request_a2", {{"missing-subject", "missing", 0, 0}}, false));
    call_failure(request_with(
        "prism.clipper2_batch_request_a2",
        {{"duplicate", "1", 0, 0}, {"duplicate", "1", 1, 0}}
    ));

    std::cout << "prism_clipper2_tests passed\n";
    return 0;
}
