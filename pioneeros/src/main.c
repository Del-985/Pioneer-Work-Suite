#include <stdint.h>

#include "pioneer_app.h"
#include "pioneer_log.h"
#include "pioneer_pui.h"

#include "web_runtime.h"

#define PWS_VERSION "0.1.17"
#define PWS_WINDOW_WIDTH 760u
#define PWS_WINDOW_HEIGHT 520u
#define PWS_SIDEBAR_WIDTH 176u
#define PWS_HEADER_HEIGHT 58u
#define PWS_MAX_SURFACE_DIMENSION 4096u
#define PWS_MAX_SURFACE_PIXELS 16777216u

P_APP_METADATA(application_metadata,
               "com.pioneer.worksuite",
               "Pioneer Work Suite",
               PWS_VERSION,
               "Pioneer",
               PIONEER_APP_FLAG_GRAPHICAL);

static uint32_t inset(uint32_t color, uint32_t amount) {
    const uint32_t red = (color >> 16u) & 0xffu;
    const uint32_t green = (color >> 8u) & 0xffu;
    const uint32_t blue = color & 0xffu;
    const uint32_t next_red = red > amount ? red - amount : 0u;
    const uint32_t next_green = green > amount ? green - amount : 0u;
    const uint32_t next_blue = blue > amount ? blue - amount : 0u;
    return (next_red << 16u) | (next_green << 8u) | next_blue;
}

static int window_surface_valid(const struct pioneer_app_window *window) {
    if (window == 0 || window->pixels == 0 ||
        window->surface.width == 0u || window->surface.height == 0u)
        return 0;
    if (window->surface.width > PWS_MAX_SURFACE_DIMENSION ||
        window->surface.height > PWS_MAX_SURFACE_DIMENSION)
        return 0;
    const uint32_t stride = window->surface.stride != 0u ?
        window->surface.stride : window->surface.width;
    if (stride < window->surface.width) return 0;
    return window->surface.height <= UINT32_MAX / stride &&
        window->surface.height <= PWS_MAX_SURFACE_PIXELS / stride;
}

static void draw_navigation_item(struct pioneer_app_window *window,
                                 const struct pioneer_theme *theme,
                                 uint32_t y,
                                 const char *label,
                                 int selected) {
    if (selected != 0) {
        pui_fill_rect(window, 12u, y - 8u, PWS_SIDEBAR_WIDTH - 24u, 30u,
                      inset(theme->accent, 28u));
        pui_fill_rect(window, 12u, y - 8u, 3u, 30u, theme->accent);
    }
    pui_draw_text(window, 26u, y, label, 18u,
                  selected != 0 ? theme->text : theme->text_muted);
}

static void paint_fallback(struct pioneer_app_window *window,
                           const struct pioneer_theme *theme) {
    if (window == 0 || theme == 0 || window->pixels == 0) return;
    const uint32_t width = window->surface.width;
    const uint32_t height = window->surface.height;
    const uint32_t workspace_width = width > PWS_SIDEBAR_WIDTH ?
        width - PWS_SIDEBAR_WIDTH : 0u;
    const uint32_t content_x = PWS_SIDEBAR_WIDTH + 26u;
    const uint32_t content_width = width > content_x + 24u ?
        width - content_x - 24u : 0u;

    pui_fill(window, theme->background);
    pui_fill_rect(window, 0u, 0u, PWS_SIDEBAR_WIDTH, height,
                  theme->surface);
    pui_fill_rect(window, PWS_SIDEBAR_WIDTH - 1u, 0u, 1u, height,
                  theme->border);
    if (workspace_width != 0u) {
        pui_fill_rect(window, PWS_SIDEBAR_WIDTH, 0u,
                      workspace_width, PWS_HEADER_HEIGHT, theme->surface);
        pui_fill_rect(window, PWS_SIDEBAR_WIDTH,
                      PWS_HEADER_HEIGHT - 1u, workspace_width, 1u,
                      theme->border);
    }

    pui_fill_rect(window, 18u, 18u, 28u, 28u, theme->accent);
    pui_draw_text(window, 27u, 27u, "P", 1u, 0x00ffffffu);
    pui_draw_text(window, 56u, 22u, "PIONEER", 10u, theme->text);
    pui_draw_text(window, 56u, 35u, "WORK SUITE", 12u,
                  theme->text_muted);

    draw_navigation_item(window, theme, 88u, "DASHBOARD", 1);
    draw_navigation_item(window, theme, 128u, "MAIL", 0);
    draw_navigation_item(window, theme, 168u, "CALENDAR", 0);
    draw_navigation_item(window, theme, 208u, "TASKS", 0);
    draw_navigation_item(window, theme, 248u, "DOCUMENTS", 0);

    pui_draw_text(window, content_x, 22u, "PIONEER WORK SUITE", 28u,
                  theme->text);
    pui_draw_text(window, width > 112u ? width - 112u : 0u, 22u,
                  PWS_VERSION, 16u, theme->text_muted);

    if (content_width != 0u && height > 142u) {
        pui_fill_rect(window, content_x, 88u, content_width, 150u,
                      theme->surface);
        pui_fill_rect(window, content_x, 88u, 4u, 150u, theme->accent);
        pui_draw_text(window, content_x + 24u, 112u,
                      "PIONEEROS HOST READY", 24u, theme->text);
        pui_draw_text(window, content_x + 24u, 144u,
                      "NATIVE WINDOW AND EVENT BRIDGE ACTIVE", 40u,
                      theme->text_muted);
        pui_draw_text(window, content_x + 24u, 170u,
                      "WAITING FOR THE PIONEEROS JAVASCRIPT RUNTIME", 48u,
                      theme->text_muted);
        pui_fill_rect(window, content_x + 24u, 204u, 112u, 22u,
                      inset(theme->accent, 18u));
        pui_draw_text(window, content_x + 36u, 211u,
                      "RUNTIME PENDING", 16u, 0x00ffffffu);
    }

    if (content_width > 24u && height > 316u) {
        const uint32_t card_width = (content_width - 24u) / 2u;
        pui_fill_rect(window, content_x, 262u, card_width, 94u,
                      theme->surface);
        pui_fill_rect(window, content_x + card_width + 24u, 262u,
                      card_width, 94u, theme->surface);
        pui_draw_text(window, content_x + 18u, 282u,
                      "APPLICATION PACKAGE", 24u, theme->text_muted);
        pui_draw_text(window, content_x + 18u, 316u,
                      "PAP / ELF32", 14u, theme->text);
        pui_draw_text(window, content_x + card_width + 42u, 282u,
                      "PIONEER ABI", 16u, theme->text_muted);
        pui_draw_text(window, content_x + card_width + 42u, 316u,
                      "1.5.0", 8u, theme->text);
    }

    if (height > 42u) {
        pui_draw_text(window, content_x, height - 30u,
                      "LOCAL SHELL AVAILABLE - WEB FEATURES ENABLE LATER", 48u,
                      theme->text_muted);
    }
}

static int present(struct pioneer_app_window *window,
                   const struct pioneer_theme *theme,
                   struct pws_web_runtime *runtime) {
    if (!window_surface_valid(window) || theme == 0 || runtime == 0)
        return PIONEER_PUI_INVALID_ARGUMENT;
    if (runtime->active != 0u) {
        const int rendered = pws_web_runtime_render(runtime);
        if (rendered != PWS_WEB_RUNTIME_OK) return rendered;
    } else {
        paint_fallback(window, theme);
    }
    return p_window_present(window);
}

int main(int argc, char **argv) {
    struct pioneer_launch_context launch;
    struct pioneer_app_window window;
    struct pioneer_theme theme;
    struct pws_web_runtime runtime = {0};
    const struct pioneer_app_window_options options = {
        .struct_size = sizeof(struct pioneer_app_window_options),
        .width = PWS_WINDOW_WIDTH,
        .height = PWS_WINDOW_HEIGHT,
        .x = 72u,
        .y = 62u,
        .app_id = 0u,
        .flags = PIONEER_APP_WINDOW_RESIZABLE,
    };

    if (p_app_metadata_validate(&application_metadata) != 0) return 1;
    if (p_app_launch_context_init(argc, argv, &launch) != 0) return 1;
    if (p_theme_get(&theme) != 0) return 1;
    if (p_window_create(&window, &launch, &options) != 0) return 1;
    if (!window_surface_valid(&window)) {
        (void)p_log_error(launch.application_id, "window",
                          "invalid window surface geometry");
        (void)p_window_destroy(&window);
        return 1;
    }

    const struct pws_web_runtime_config runtime_config = {
        .struct_size = sizeof(struct pws_web_runtime_config),
        .contract_version = PWS_WEB_RUNTIME_CONTRACT_VERSION,
        .application_id = launch.application_id,
        .entry_document = "index.html",
        .resource_root = "/boot/APPS/WORKSUIT",
        .window = &window,
    };
    const int runtime_result = pws_web_runtime_start(&runtime,
                                                     &runtime_config);
    if (runtime_result == PWS_WEB_RUNTIME_UNAVAILABLE) {
        (void)p_log_info(launch.application_id, "runtime",
                         "JavaScript runtime unavailable; native shell active");
    } else if (runtime_result != PWS_WEB_RUNTIME_OK) {
        (void)p_log_error(launch.application_id, "runtime",
                          "JavaScript runtime failed to start");
    }

    if (present(&window, &theme, &runtime) != 0) {
        pws_web_runtime_stop(&runtime);
        (void)p_window_destroy(&window);
        return 1;
    }

    int exit_status = 0;
    while (p_window_is_open(&window)) {
        struct pioneer_app_event event;
        const int received = p_event_next(&window, &event,
                                          PIONEER_APP_EVENT_WAIT);
        if (received < 0) {
            (void)p_log_error(launch.application_id, "window",
                              "window event receive failed");
            exit_status = 1;
            break;
        }
        if (received == 0) continue;

        if (runtime.active != 0u) {
            const int handled = pws_web_runtime_event(&runtime, &event);
            if (handled < 0) {
                (void)p_log_error(launch.application_id, "runtime",
                                  "JavaScript runtime event failed");
                exit_status = 1;
                break;
            }
        }

        int redraw = 0;
        if (event.type == PIONEER_APP_EVENT_THEME) {
            (void)p_theme_get(&theme);
            redraw = 1;
        } else if (event.type == PIONEER_APP_EVENT_SHOW ||
                   event.type == PIONEER_APP_EVENT_MOVE ||
                   event.type == PIONEER_APP_EVENT_RESIZE) {
            redraw = 1;
        }
        if (redraw != 0 && present(&window, &theme, &runtime) != 0) {
            (void)p_log_error(launch.application_id, "window",
                              "window redraw failed");
            exit_status = 1;
            break;
        }
    }

    pws_web_runtime_stop(&runtime);
    (void)p_window_destroy(&window);
    return exit_status;
}
