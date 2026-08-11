# Desktop UI with the local backend

## Native bridge flow

Inside Tauri, `RuntimeClient` invokes the `sori_ipc` command. The thin Rust
command deserializes the canonical `sori-ipc::Request`, calls the daemon over
loopback IPC, and returns the serialized response. The React UI therefore does
not know whether the request used Tauri or HTTP. In a browser, or when native
invocation is unavailable, the boundary tries HTTP and finally the in-memory
mock for preview status.

The desktop Vite app probes the local daemon first at
`http://127.0.0.1:17373/ipc`. Set `VITE_SORI_IPC_URL` to use another local
endpoint, for example:

```sh
VITE_SORI_IPC_URL=http://127.0.0.1:17373/ipc npm run desktop:dev
```

The transport sends the JSON representation of the canonical `sori-ipc::Request`
(`Status`, `Doctor`, `ConfigSummary`, or `RecentEvents`) as a POST body. The
UI remains usable when the daemon is not running: status is labelled **Mock
fallback** and keeps the preview client in memory. A failed pause/resume is
labelled unavailable rather than throwing or blocking the shell.

Build and preview do not require a daemon:

```sh
npm run desktop:build
npm --prefix apps/desktop run preview
```

Only loopback HTTP is used; no cloud credentials or microphone data are sent by
this bridge.
