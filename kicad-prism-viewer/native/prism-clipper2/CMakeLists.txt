cmake_minimum_required(VERSION 3.18)

project(prism_clipper2 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN YES)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(CLIPPER2_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/third_party/clipper2")

add_library(prism_clipper2 SHARED
  src/prism_clipper2.cpp
  src/a2_codec.cpp
  src/a2_clip.cpp
  "${CLIPPER2_ROOT}/Clipper2Lib/src/clipper.engine.cpp"
  "${CLIPPER2_ROOT}/Clipper2Lib/src/clipper.offset.cpp"
  "${CLIPPER2_ROOT}/Clipper2Lib/src/clipper.rectclip.cpp"
)

target_compile_definitions(prism_clipper2 PRIVATE PRISM_CLIPPER2_BUILD)
target_include_directories(prism_clipper2
  PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include"
  PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src"
  PRIVATE "${CLIPPER2_ROOT}/Clipper2Lib/include"
)

if(NOT MSVC)
  target_compile_options(prism_clipper2 PRIVATE -Wall -Wextra -Wpedantic)
endif()

add_executable(prism_clipper2_tests tests/prism_clipper2_tests.cpp)
target_link_libraries(prism_clipper2_tests PRIVATE prism_clipper2)
target_include_directories(prism_clipper2_tests PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/include")

enable_testing()
add_test(NAME prism_clipper2_tests COMMAND prism_clipper2_tests)
