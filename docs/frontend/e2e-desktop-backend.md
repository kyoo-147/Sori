# Desktop UI with the local backend

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
