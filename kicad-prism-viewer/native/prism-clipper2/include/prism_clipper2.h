#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef _WIN32
  #ifdef PRISM_CLIPPER2_BUILD
    #define PRISM_CLIPPER2_API __declspec(dllexport)
  #else
    #define PRISM_CLIPPER2_API __declspec(dllimport)
  #endif
#else
  #define PRISM_CLIPPER2_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

PRISM_CLIPPER2_API const char* prism_clipper2_version_string(void);
PRISM_CLIPPER2_API uint32_t prism_clipper2_abi_version(void);
PRISM_CLIPPER2_API uint32_t prism_clipper2_protocol_version(void);

PRISM_CLIPPER2_API int prism_clipper2_batch_a2_bytes(
    const uint8_t* request,
    size_t request_len,
    uint8_t** response,
    size_t* response_len,
    char** error_message
);

PRISM_CLIPPER2_API void prism_clipper2_free_bytes(void* ptr);

#ifdef __cplusplus
}
#endif
