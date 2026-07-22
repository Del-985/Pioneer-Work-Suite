#ifndef PIONEER_WORK_SUITE_WEB_RUNTIME_H
#define PIONEER_WORK_SUITE_WEB_RUNTIME_H

#include <stdint.h>

#include "pioneer_app.h"

/*
 * Stable boundary between the PioneerOS application host and the planned
 * JavaScript/web runtime. The host intentionally does not assume a particular
 * engine. When PioneerOS publishes its runtime, replace these fallback
 * implementations with an adapter that satisfies the same contract.
 */

#define PWS_WEB_RUNTIME_CONTRACT_VERSION 1u

enum pws_web_runtime_result {
    PWS_WEB_RUNTIME_OK = 0,
    PWS_WEB_RUNTIME_UNAVAILABLE = 1,
    PWS_WEB_RUNTIME_INVALID_ARGUMENT = -1,
    PWS_WEB_RUNTIME_START_FAILED = -2,
    PWS_WEB_RUNTIME_EVENT_FAILED = -3,
    PWS_WEB_RUNTIME_RENDER_FAILED = -4
};

struct pws_web_runtime_config {
    uint32_t struct_size;
    uint32_t contract_version;
    const char *application_id;
    const char *entry_document;
    const char *resource_root;
    struct pioneer_app_window *window;
};

struct pws_web_runtime {
    uint32_t struct_size;
    uint32_t contract_version;
    uint32_t active;
    void *engine;
};

static inline int pws_web_runtime_start(
    struct pws_web_runtime *runtime,
    const struct pws_web_runtime_config *config) {
    if (runtime == 0) return PWS_WEB_RUNTIME_INVALID_ARGUMENT;
    runtime->struct_size = sizeof(*runtime);
    runtime->contract_version = PWS_WEB_RUNTIME_CONTRACT_VERSION;
    runtime->active = 0u;
    runtime->engine = 0;
    if (config == 0 || config->window == 0 ||
        config->application_id == 0 || config->entry_document == 0 ||
        config->resource_root == 0 ||
        config->struct_size < sizeof(*config) ||
        config->contract_version != PWS_WEB_RUNTIME_CONTRACT_VERSION)
        return PWS_WEB_RUNTIME_INVALID_ARGUMENT;
    return PWS_WEB_RUNTIME_UNAVAILABLE;
}

static inline int pws_web_runtime_event(
    struct pws_web_runtime *runtime,
    const struct pioneer_app_event *event) {
    if (runtime == 0 || event == 0 ||
        runtime->struct_size < sizeof(*runtime) ||
        runtime->contract_version != PWS_WEB_RUNTIME_CONTRACT_VERSION ||
        event->struct_size < sizeof(*event))
        return PWS_WEB_RUNTIME_INVALID_ARGUMENT;
    return runtime->active != 0u ? PWS_WEB_RUNTIME_OK :
        PWS_WEB_RUNTIME_UNAVAILABLE;
}

static inline int pws_web_runtime_render(struct pws_web_runtime *runtime) {
    if (runtime == 0 || runtime->struct_size < sizeof(*runtime) ||
        runtime->contract_version != PWS_WEB_RUNTIME_CONTRACT_VERSION)
        return PWS_WEB_RUNTIME_INVALID_ARGUMENT;
    return runtime->active != 0u ? PWS_WEB_RUNTIME_OK :
        PWS_WEB_RUNTIME_UNAVAILABLE;
}

static inline void pws_web_runtime_stop(struct pws_web_runtime *runtime) {
    if (runtime == 0) return;
    runtime->active = 0u;
    runtime->engine = 0;
}

#endif
