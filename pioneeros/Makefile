APP := pioneer-work-suite
SOURCE := src/main.c
MANIFEST := manifest.json

include $(PIONEER_SDK)/mk/pioneer-app.mk

HOST_CC ?= cc
HOST_TEST_OBJECT := $(BUILD_DIR)/host_safety_test.o
HOST_PUI_OBJECT := $(BUILD_DIR)/host_pioneer_pui.o
HOST_TEST := $(BUILD_DIR)/host-safety-test
HOST_TEST_CFLAGS ?= -m32 -std=c11 -O2 -ffunction-sections -fdata-sections \
                    -Wall -Wextra -Werror -I$(PIONEER_SDK)/include
HOST_TEST_LDFLAGS ?= -m32 -Wl,--gc-sections

.PHONY: test-host

$(HOST_TEST_OBJECT): tests/host_safety_test.c src/main.c \
                     src/web_runtime.h | $(BUILD_DIR) sdk-check
	$(HOST_CC) $(HOST_TEST_CFLAGS) -c -o $@ $<

$(HOST_PUI_OBJECT): $(PIONEER_SDK)/src/pioneer_pui.c | $(BUILD_DIR) sdk-check
	$(HOST_CC) $(HOST_TEST_CFLAGS) -DPIONEER_PUI_IMPLEMENTATION -c -o $@ $<

$(HOST_TEST): $(HOST_TEST_OBJECT) $(HOST_PUI_OBJECT)
	$(HOST_CC) $(HOST_TEST_LDFLAGS) -o $@ $^

test-host: $(HOST_TEST)
	$(HOST_TEST)
