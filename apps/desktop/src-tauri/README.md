# Native desktop wrapper

This directory contains the platform-neutral Tauri v2 configuration, but native
builds are intentionally not part of the default CI path. Add the generated
Rust wrapper and enable `bundle.active` when the daemon IPC and signing setup
are ready. Until then, the Vite app is the supported shell and uses
`MockTransport`.
