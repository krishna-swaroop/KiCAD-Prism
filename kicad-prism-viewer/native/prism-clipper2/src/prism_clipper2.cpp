#include "prism_clipper2.h"

#include "a2_types.h"

#include <chrono>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <new>
#include <string>
#include <vector>

namespace {

using Clock = std::chrono::steady_clock;

double elapsed_ms(Clock::time_point start) {
    const auto elapsed = Clock::now() - start;
    return std::chrono::duration<double, std::milli>(elapsed).count();
}

char* heap_string(const std::string& value) {
    char* buffer = static_cast<char*>(std::malloc(value.size() + 1));
    if (!buffer) return nullptr;
    std::memcpy(buffer, value.c_str(), value.size() + 1);
    return buffer;
}

uint8_t* heap_bytes(const std::vector<uint8_t>& value) {
    uint8_t* buffer = static_cast<uint8_t*>(std::malloc(value.size()));
    if (!buffer) return nullptr;
    std::memcpy(buffer, value.data(), value.size());
    return buffer;
}

}  // namespace

extern "C" {

const char* prism_clipper2_version_string(void) {
    return prism::clipper2::kVersion;
}

uint32_t prism_clipper2_abi_version(void) {
    return prism::clipper2::kAbiVersion;
}

uint32_t prism_clipper2_protocol_version(void) {
    return prism::clipper2::kProtocolVersion;
}

int prism_clipper2_batch_a2_bytes(
    const uint8_t* request,
    size_t request_len,
    uint8_t** response,
    size_t* response_len,
    char** error_message
) {
    if (response) *response = nullptr;
    if (response_len) *response_len = 0;
    if (error_message) *error_message = nullptr;
    if (!response || !response_len || !error_message) {
        return 2;
    }

    const auto total_start = Clock::now();
    try {
        prism::clipper2::Timings timings;
        const auto decode_start = Clock::now();
        prism::clipper2::Request decoded = prism::clipper2::decode_a2_request(request, request_len, timings);
        timings.request_decode_ms = elapsed_ms(decode_start);

        const auto boolean_start = Clock::now();
        std::vector<prism::clipper2::Result> results = prism::clipper2::clip_a2_request(decoded);
        timings.boolean_ms = elapsed_ms(boolean_start);

        const auto encode_start = Clock::now();
        timings.total_ms = elapsed_ms(total_start);
        std::vector<uint8_t> encoded = prism::clipper2::encode_a2_response(decoded, results, timings);
        timings.response_encode_ms = elapsed_ms(encode_start);
        timings.response_bytes = static_cast<int64_t>(encoded.size());
        timings.total_ms = elapsed_ms(total_start);
        encoded = prism::clipper2::encode_a2_response(decoded, results, timings);

        uint8_t* out = heap_bytes(encoded);
        if (!out) {
            throw std::bad_alloc();
        }
        *response = out;
        *response_len = encoded.size();
        return 0;
    } catch (const std::exception& exc) {
        *error_message = heap_string(exc.what());
        return 1;
    } catch (...) {
        *error_message = heap_string("unknown prism_clipper2 failure");
        return 1;
    }
}

void prism_clipper2_free_bytes(void* ptr) {
    std::free(ptr);
}

}  // extern "C"
