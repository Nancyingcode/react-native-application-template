cmake_minimum_required(VERSION 3.13)
set(CMAKE_VERBOSE_MAKEFILE ON)

set(LIB_LITERAL safeareacontext)
set(LIB_TARGET_NAME react_codegen_${LIB_LITERAL})
set(LIB_PACKAGE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../node_modules/react-native-safe-area-context)
set(LIB_ANDROID_DIR ${LIB_PACKAGE_DIR}/android)
set(LIB_COMMON_DIR ${LIB_PACKAGE_DIR}/common/cpp)
set(LIB_ANDROID_GENERATED_JNI_DIR ${LIB_ANDROID_DIR}/build/generated/source/codegen/jni)
set(LIB_ANDROID_GENERATED_COMPONENTS_DIR ${LIB_ANDROID_GENERATED_JNI_DIR}/react/renderer/components/${LIB_LITERAL})
set(LIB_COMMON_COMPONENTS_DIR ${LIB_COMMON_DIR}/react/renderer/components/${LIB_LITERAL})
set(LIB_WRAPPER_INCLUDE_DIR ${CMAKE_CURRENT_BINARY_DIR}/include)

configure_file(
  ${CMAKE_CURRENT_SOURCE_DIR}/ComponentDescriptors.h.in
  ${LIB_WRAPPER_INCLUDE_DIR}/react/renderer/components/${LIB_LITERAL}/ComponentDescriptors.h
  @ONLY
)

file(
  GLOB LIB_CUSTOM_SOURCE_FILES
  CONFIGURE_DEPENDS
  *.cpp
  ${LIB_COMMON_DIR}/react/renderer/components/${LIB_LITERAL}/*.cpp
)
file(
  GLOB LIB_CODEGEN_SOURCE_FILES
  CONFIGURE_DEPENDS
  ${LIB_ANDROID_GENERATED_JNI_DIR}/*.cpp
  ${LIB_ANDROID_GENERATED_COMPONENTS_DIR}/*.cpp
)

# CMake 3.22 expands dependency sources to absolute paths. Stage the small
# source set under the short binary directory so Ninja stays below MAX_PATH.
set(LIB_STAGED_SOURCE_DIR ${CMAKE_CURRENT_BINARY_DIR}/src)
foreach(SOURCE_FILE IN LISTS LIB_CUSTOM_SOURCE_FILES LIB_CODEGEN_SOURCE_FILES)
  get_filename_component(SOURCE_NAME ${SOURCE_FILE} NAME)
  configure_file(
    ${SOURCE_FILE}
    ${LIB_STAGED_SOURCE_DIR}/${SOURCE_NAME}
    COPYONLY
  )
  list(APPEND LIB_STAGED_SRCS ${LIB_STAGED_SOURCE_DIR}/${SOURCE_NAME})
endforeach()

add_library(
  ${LIB_TARGET_NAME}
  SHARED
  ${LIB_STAGED_SRCS}
)

target_include_directories(
  ${LIB_TARGET_NAME}
  PUBLIC
  ${LIB_WRAPPER_INCLUDE_DIR}
  .
  ${LIB_COMMON_DIR}
  ${LIB_COMMON_COMPONENTS_DIR}
  ${LIB_ANDROID_GENERATED_JNI_DIR}
  ${LIB_ANDROID_GENERATED_COMPONENTS_DIR}
)

if(REACTNATIVE_MERGED_SO)
  target_link_libraries(
    ${LIB_TARGET_NAME}
    fbjni
    jsi
    reactnative
  )
else()
  target_link_libraries(
    ${LIB_TARGET_NAME}
    fbjni
    folly_runtime
    glog
    jsi
    react_codegen_rncore
    react_debug
    react_nativemodule_core
    react_render_core
    react_render_debug
    react_render_graphics
    react_render_mapbuffer
    react_render_componentregistry
    react_utils
    rrc_view
    turbomodulejsijni
    yoga
  )
endif()

target_include_directories(
  ${CMAKE_PROJECT_NAME}
  PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}
)

if(ReactAndroid_VERSION_MINOR GREATER_EQUAL 80)
  target_compile_reactnative_options(${LIB_TARGET_NAME} PUBLIC)
else()
  target_compile_options(
    ${LIB_TARGET_NAME}
    PRIVATE
    -fexceptions
    -frtti
    -std=c++20
    -Wall
  )
endif()

target_compile_options(
  ${LIB_TARGET_NAME}
  PRIVATE
  -Wpedantic
  -Wno-gnu-zero-variadic-macro-arguments
  -Wno-dollar-in-identifier-extension
)
