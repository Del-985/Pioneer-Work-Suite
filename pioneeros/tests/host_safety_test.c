#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#define main pws_embedded_main
#include "../src/main.c"
#undef main

#define GUARD_PIXELS 32u
#define GUARD_VALUE 0x5aa55aa5u

static int failures;
static uint32_t cases_run;
static uint32_t *live_surface;
static uint32_t lifecycle_scenario;
static uint32_t lifecycle_event_index;
static uint32_t lifecycle_present_count;
static uint32_t lifecycle_destroy_count;

enum lifecycle_scenarios {
    LIFECYCLE_CLOSE = 0u,
    LIFECYCLE_EVENT_FAILURE = 1u,
    LIFECYCLE_REDRAW_FAILURE = 2u,
    LIFECYCLE_INVALID_SURFACE = 3u,
    LIFECYCLE_THEME_CLOSE = 4u,
    LIFECYCLE_CREATE_FAILURE = 5u,
    LIFECYCLE_WINDOW_SEND_FAILURE = 6u,
    LIFECYCLE_INITIAL_PRESENT_FAILURE = 7u,
};

static void check(int condition, const char *message) {
    if (condition != 0) return;
    ++failures;
    (void)fprintf(stderr, "FAIL: %s\n", message);
}

/* Dependencies used by the retained PioneerOS PUI drawing functions. */
uint32_t p_app_numeric_id(const char *app_id) {
    (void)app_id;
    return 1u;
}

int p_app_metadata_validate(
    const struct pioneer_application_metadata *metadata) {
    return metadata != 0 ? 0 : -1;
}

int p_app_launch_context_init(int argc, char **argv,
                              struct pioneer_launch_context *context) {
    (void)argc;
    (void)argv;
    if (context == 0) return -1;
    context->struct_size = sizeof(*context);
    context->flags = PIONEER_LAUNCH_FLAG_GRAPHICAL;
    context->argc = argc;
    context->argv = argv;
    context->application_id = "com.pioneer.worksuite";
    context->document_path = 0;
    context->working_directory = "/boot/APPS";
    context->desktop_task_id = 1u;
    return 0;
}

int p_log_message(uint32_t level, const char *application_id,
                  const char *component, const char *message) {
    (void)level;
    (void)application_id;
    (void)component;
    (void)message;
    return 0;
}

int32_t p_send(uint32_t task_id, const void *data, uint32_t length) {
    (void)task_id;
    (void)data;
    (void)length;
    return lifecycle_scenario == LIFECYCLE_WINDOW_SEND_FAILURE ? -1 : 0;
}

int32_t p_receive(struct pioneer_message *message) {
    if (message == 0 || lifecycle_scenario == LIFECYCLE_EVENT_FAILURE)
        return -1;
    struct pioneer_window_event_v2 event = {0};
    event.magic = PIONEER_WINDOW_EVENT_V2_MAGIC;
    event.struct_size = sizeof(event);
    event.window_id = 1u + lifecycle_scenario;
    if (lifecycle_scenario == LIFECYCLE_REDRAW_FAILURE) {
        event.type = PIONEER_WINDOW_V2_EVENT_SHOW;
    } else if (lifecycle_scenario == LIFECYCLE_THEME_CLOSE &&
               lifecycle_event_index == 0u) {
        event.type = PIONEER_WINDOW_V2_EVENT_THEME;
    } else {
        event.type = PIONEER_WINDOW_V2_EVENT_CLOSE;
    }
    message->sender_task_id = 1u;
    message->length = sizeof(event);
    for (uint32_t index = 0u; index < sizeof(event); ++index)
        message->data[index] = ((const uint8_t *)(const void *)&event)[index];
    ++lifecycle_event_index;
    return 0;
}

int32_t p_receive_try(struct pioneer_message *message) {
    return p_receive(message);
}

int32_t p_surface_create(struct pioneer_surface_mapping *mapping) {
    if (mapping == 0 || mapping->width == 0u || mapping->height == 0u)
        return -1;
    if (lifecycle_scenario == LIFECYCLE_CREATE_FAILURE) return -1;
    uint32_t pixel_stride = mapping->width;
    if (lifecycle_scenario == LIFECYCLE_INVALID_SURFACE)
        pixel_stride = mapping->width - 1u;
    live_surface = (uint32_t *)calloc(
        (size_t)pixel_stride * mapping->height, sizeof(uint32_t));
    if (live_surface == 0) return -1;
    mapping->surface_id = 42u + lifecycle_scenario;
    mapping->address = (uint32_t)(uintptr_t)live_surface;
    mapping->stride = pixel_stride * sizeof(uint32_t);
    return 0;
}

int32_t p_surface_present(uint32_t surface_id, uint32_t x, uint32_t y) {
    (void)surface_id;
    (void)x;
    (void)y;
    ++lifecycle_present_count;
    if (lifecycle_scenario == LIFECYCLE_INITIAL_PRESENT_FAILURE) return -1;
    return lifecycle_scenario == LIFECYCLE_REDRAW_FAILURE &&
        lifecycle_present_count >= 2u ? -1 : 0;
}

int32_t p_surface_destroy(uint32_t surface_id) {
    (void)surface_id;
    free(live_surface);
    live_surface = 0;
    ++lifecycle_destroy_count;
    return 0;
}

int32_t p_open(const char *path, uint32_t flags) {
    (void)path;
    (void)flags;
    return -1;
}

int32_t p_read(int32_t descriptor, void *buffer, uint32_t length) {
    (void)descriptor;
    (void)buffer;
    (void)length;
    return -1;
}

int32_t p_close(int32_t descriptor) {
    (void)descriptor;
    return 0;
}

uint32_t p_time_ms(void) {
    return 0u;
}

int32_t p_sleep(uint32_t milliseconds) {
    (void)milliseconds;
    return 0;
}

static struct pioneer_theme test_theme(void) {
    const struct pioneer_theme theme = {
        .struct_size = sizeof(struct pioneer_theme),
        .theme_id = PIONEER_THEME_DARK,
        .background = 0x00101828u,
        .surface = 0x00192338u,
        .surface_alt = 0x00233046u,
        .text = 0x00f4f7fbu,
        .text_muted = 0x008fa4b8u,
        .accent = 0x003c82f6u,
        .border = 0x002b3444u,
        .error = 0x00c64242u,
        .warning = 0x00c98a2eu,
        .success = 0x0029b36au,
        .flags = 0u,
    };
    return theme;
}

static void exercise_surface(uint32_t width, uint32_t height,
                             uint32_t padding) {
    const uint32_t stride = width + padding;
    const size_t payload = (size_t)stride * (size_t)height;
    const size_t allocation = payload + GUARD_PIXELS * 2u + 1u;
    uint32_t *memory = (uint32_t *)calloc(allocation, sizeof(uint32_t));
    check(memory != 0, "surface allocation");
    if (memory == 0) return;

    for (uint32_t index = 0u; index < GUARD_PIXELS; ++index) {
        memory[index] = GUARD_VALUE;
        memory[GUARD_PIXELS + payload + index] = GUARD_VALUE;
    }

    struct pioneer_app_window window = {0};
    window.struct_size = sizeof(window);
    window.surface.width = width;
    window.surface.height = height;
    window.surface.stride = stride;
    window.pixels = &memory[GUARD_PIXELS];
    const struct pioneer_theme theme = test_theme();

    paint_fallback(&window, &theme);

    for (uint32_t index = 0u; index < GUARD_PIXELS; ++index) {
        check(memory[index] == GUARD_VALUE, "surface prefix guard");
        check(memory[GUARD_PIXELS + payload + index] == GUARD_VALUE,
              "surface suffix guard");
    }
    ++cases_run;
    free(memory);
}

static void test_surface_matrix(void) {
    static const uint32_t widths[] = {
        0u, 1u, 7u, 64u, 111u, 112u, 175u, 176u, 177u,
        201u, 202u, 225u, 320u, 759u, 760u, 761u, 1024u
    };
    static const uint32_t heights[] = {
        0u, 1u, 41u, 42u, 57u, 58u, 87u, 88u, 141u,
        142u, 237u, 262u, 315u, 316u, 519u, 520u, 768u
    };
    for (uint32_t width_index = 0u;
         width_index < sizeof(widths) / sizeof(widths[0]); ++width_index) {
        for (uint32_t height_index = 0u;
             height_index < sizeof(heights) / sizeof(heights[0]);
             ++height_index) {
            exercise_surface(widths[width_index], heights[height_index], 0u);
            exercise_surface(widths[width_index], heights[height_index], 7u);
        }
    }
}

static void test_surface_validation(void) {
    uint32_t pixel = 0u;
    struct pioneer_app_window window = {0};
    window.pixels = &pixel;
    window.surface.width = 10u;
    window.surface.height = 10u;
    window.surface.stride = 10u;
    check(window_surface_valid(&window) != 0, "valid surface accepted");
    window.surface.stride = 9u;
    check(window_surface_valid(&window) == 0, "short stride rejected");
    window.surface.stride = UINT32_MAX;
    window.surface.height = 2u;
    check(window_surface_valid(&window) == 0, "stride overflow rejected");
    window.surface.stride = 0u;
    window.surface.height = 10u;
    check(window_surface_valid(&window) != 0, "packed surface accepted");
    window.surface.width = UINT32_MAX;
    window.surface.height = 2u;
    check(window_surface_valid(&window) == 0,
          "packed surface overflow rejected");
    window.surface.width = PWS_MAX_SURFACE_DIMENSION + 1u;
    window.surface.height = 1u;
    check(window_surface_valid(&window) == 0,
          "oversized surface dimension rejected");
    window.surface.width = PWS_MAX_SURFACE_DIMENSION;
    window.surface.height = PWS_MAX_SURFACE_DIMENSION;
    check(window_surface_valid(&window) != 0,
          "maximum bounded surface accepted");
    window.pixels = 0;
    check(window_surface_valid(&window) == 0, "null pixels rejected");
}

static void test_runtime_contract(void) {
    struct pws_web_runtime runtime = {0};
    check(pws_web_runtime_start(&runtime, 0) ==
              PWS_WEB_RUNTIME_INVALID_ARGUMENT,
          "null runtime configuration rejected");
    check(runtime.active == 0u, "failed runtime remains inactive");

    uint32_t pixel = 0u;
    struct pioneer_app_window window = {0};
    window.pixels = &pixel;
    const struct pws_web_runtime_config config = {
        .struct_size = sizeof(struct pws_web_runtime_config),
        .contract_version = PWS_WEB_RUNTIME_CONTRACT_VERSION,
        .application_id = "com.pioneer.worksuite",
        .entry_document = "index.html",
        .resource_root = "/boot/APPS/WORKSUIT",
        .window = &window,
    };
    check(pws_web_runtime_start(&runtime, &config) ==
              PWS_WEB_RUNTIME_UNAVAILABLE,
          "fallback runtime reports unavailable");
    check(pws_web_runtime_render(&runtime) == PWS_WEB_RUNTIME_UNAVAILABLE,
          "inactive runtime cannot render");

    struct pioneer_app_event event = {0};
    check(pws_web_runtime_event(&runtime, &event) ==
              PWS_WEB_RUNTIME_INVALID_ARGUMENT,
          "undersized event rejected");
    event.struct_size = sizeof(event);
    check(pws_web_runtime_event(&runtime, &event) ==
              PWS_WEB_RUNTIME_UNAVAILABLE,
          "inactive runtime cannot consume events");
    pws_web_runtime_stop(&runtime);
    check(runtime.active == 0u && runtime.engine == 0,
          "runtime stop clears state");
}

static int run_lifecycle(uint32_t scenario) {
    free(live_surface);
    live_surface = 0;
    lifecycle_scenario = scenario;
    lifecycle_event_index = 0u;
    lifecycle_present_count = 0u;
    lifecycle_destroy_count = 0u;
    char *arguments[] = {"pioneer-work-suite", 0};
    return pws_embedded_main(1, arguments);
}

static void test_application_lifecycle(void) {
    check(run_lifecycle(LIFECYCLE_CLOSE) == 0,
          "close event exits successfully");
    check(lifecycle_present_count == 1u, "initial frame presented");
    check(lifecycle_destroy_count == 1u && live_surface == 0,
          "normal close releases surface");

    check(run_lifecycle(LIFECYCLE_EVENT_FAILURE) == 1,
          "event receive failure exits nonzero");
    check(lifecycle_destroy_count == 1u && live_surface == 0,
          "event failure releases surface");

    check(run_lifecycle(LIFECYCLE_REDRAW_FAILURE) == 1,
          "redraw failure exits nonzero");
    check(lifecycle_present_count == 2u,
          "redraw failure occurs after initial frame");
    check(lifecycle_destroy_count == 1u && live_surface == 0,
          "redraw failure releases surface");

    check(run_lifecycle(LIFECYCLE_INVALID_SURFACE) == 1,
          "invalid surface is rejected");
    check(lifecycle_present_count == 0u,
          "invalid surface is never presented");
    check(lifecycle_destroy_count == 1u && live_surface == 0,
          "invalid surface is released");

    check(run_lifecycle(LIFECYCLE_THEME_CLOSE) == 0,
          "theme update followed by close exits successfully");
    check(lifecycle_present_count == 2u,
          "theme update redraws exactly once");
    check(lifecycle_destroy_count == 1u && live_surface == 0,
          "theme lifecycle releases surface");

    check(run_lifecycle(LIFECYCLE_CREATE_FAILURE) == 1,
          "surface creation failure exits nonzero");
    check(lifecycle_destroy_count == 0u && live_surface == 0,
          "surface creation failure leaves no resource");

    check(run_lifecycle(LIFECYCLE_WINDOW_SEND_FAILURE) == 1,
          "desktop create-message failure exits nonzero");
    check(lifecycle_destroy_count == 1u && live_surface == 0,
          "desktop create-message failure releases surface");

    check(run_lifecycle(LIFECYCLE_INITIAL_PRESENT_FAILURE) == 1,
          "initial present failure exits nonzero");
    check(lifecycle_present_count == 1u,
          "initial present failure stops before event loop");
    check(lifecycle_destroy_count == 1u && live_surface == 0,
          "initial present failure releases surface");
}

int main(void) {
    test_surface_matrix();
    test_surface_validation();
    test_runtime_contract();
    test_application_lifecycle();
    check(inset(0x00030201u, 4u) == 0u, "color inset saturates");
    check(inset(0x00102030u, 0x10u) == 0x00001020u,
          "color inset preserves channels");

    if (failures != 0) {
        (void)fprintf(stderr, "%d failure(s) across %u surface cases\n",
                      failures, cases_run);
        return 1;
    }
    (void)printf(
        "PioneerOS host safety: %u surface cases and 8 lifecycle scenarios passed\n",
        cases_run);
    return 0;
}
