# PioneerOS target

This target packages Pioneer Work Suite as a normal PioneerOS application. It
uses the public Pioneer Application ABI 1.5, creates a themed desktop window,
handles the PioneerOS application event lifecycle, and produces an installable
PAP package.

The current target deliberately renders a native readiness shell. PioneerOS
does not yet expose a JavaScript runtime capable of executing the React client.
`src/web_runtime.h` is the integration contract for that future runtime; the
window lifecycle, metadata, capabilities, and PAP packaging can remain intact
when the runtime implementation arrives.

## Requirements

- PioneerOS SDK 1.5.0
- GCC with 32-bit support
- GNU binutils and Make
- Python 3

Build the SDK from the PioneerOS repository on Debian or Ubuntu if an extracted
SDK is not already available:

```sh
sudo apt-get install nasm make gcc-multilib binutils python3
make -C /path/to/PioneerOS verify
```

The SDK is emitted as
`/path/to/PioneerOS/dist/pioneeros-sdk-1.5.0.tar.gz`. Extract it, then build and
verify the Work Suite package:

```sh
export PIONEER_SDK=/absolute/path/to/pioneeros-sdk-1.5.0
make -C pioneeros package
```

Outputs:

- `pioneeros/build/pioneer-work-suite.elf`
- `pioneeros/build/pioneer-work-suite.pap`

Run the native host safety suite against the SDK's real PUI renderer:

```sh
make -C pioneeros test-host
```

The suite exercises zero-sized, tiny, boundary-sized, normal, and oversized
window surfaces with packed and padded row strides. Canary regions detect
out-of-bounds rendering, while focused checks cover invalid surface geometry
and runtime-adapter state validation. Lifecycle scenarios cover normal close,
event-receive failure, redraw failure, invalid surface rejection, theme redraw,
surface-creation failure, desktop-message failure, initial-present failure, and
resource cleanup.

Install the PAP through PioneerOS Application Manager. The package requests
file read/write, settings, and outbound network capabilities required by the
local-first workspace and future API synchronization.

## JavaScript runtime handoff

The future adapter must implement the contract represented by
`src/web_runtime.h`:

1. attach an engine instance to the existing `pioneer_app_window` surface;
2. load `index.html` and its bundled resources;
3. translate PioneerOS application events into DOM input/window events;
4. paint into the supplied XRGB8888 surface;
5. expose filesystem, settings, and networking through capability-checked host
   bindings; and
6. release all engine resources before the host destroys its window.

The current header contains safe no-engine implementations and returns
`PWS_WEB_RUNTIME_UNAVAILABLE`, which keeps the package runnable before the
JavaScript update lands.
