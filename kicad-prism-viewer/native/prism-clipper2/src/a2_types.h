#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace prism::clipper2 {

constexpr const char* kVersion = "prism-clipper2 0.1.0";
constexpr uint32_t kAbiVersion = 20260708;
constexpr uint32_t kProtocolVersion = 2;
constexpr uint32_t kCoordinateScaleNmPerMm = 1000000;

constexpr char kRequestMagic[8] = {'G', 'M', 'C', '2', 'Y', 'Q', '0', '1'};
constexpr char kResponseMagic[8] = {'G', 'M', 'C', '2', 'Y', 'S', '0', '1'};
constexpr const char* kRequestSchema = "prism.clipper2_batch_request_a2";
constexpr const char* kResponseSchema = "prism.clipper2_batch_response_a2";

struct Point {
    int64_t x = 0;
    int64_t y = 0;
};

using Ring = std::vector<Point>;

struct Subject {
    std::string subject_id;
    Ring outer;
    std::vector<Ring> holes;
};

struct Job {
    std::string job_id;
    std::string subject_id;
    int32_t tile_x = 0;
    int32_t tile_y = 0;
    std::string source_polygon_record_id;
    uint32_t source_order = 0;
};

struct Region {
    Ring outer;
    std::vector<Ring> holes;
};

enum class ResultStatus : uint32_t {
    Ok = 0,
    Empty = 1,
    Failed = 2,
};

struct Result {
    std::string job_id;
    std::string subject_id;
    int32_t tile_x = 0;
    int32_t tile_y = 0;
    ResultStatus status = ResultStatus::Empty;
    std::string error_code;
    std::string error_message;
    std::vector<Region> regions;
};

struct Request {
    std::string request_digest;
    std::string geometry_revision;
    uint32_t coordinate_scale = 0;
    int64_t tile_size_nm = 0;
    std::vector<Subject> subjects;
    std::vector<Job> jobs;
};

struct Timings {
    double request_decode_ms = 0.0;
    double subject_decode_ms = 0.0;
    uint32_t subject_count = 0;
    uint32_t job_count = 0;
    int64_t unique_subject_vertices = 0;
    double boolean_ms = 0.0;
    double response_encode_ms = 0.0;
    double total_ms = 0.0;
    int64_t request_bytes = 0;
    int64_t response_bytes = 0;
};

Request decode_a2_request(const uint8_t* data, size_t size, Timings& timings);
std::vector<uint8_t> encode_a2_response(const Request& request, const std::vector<Result>& results, const Timings& timings);
std::vector<Result> clip_a2_request(const Request& request);

}  // namespace prism::clipper2
