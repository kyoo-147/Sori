# Local IPC runtime

`sorid` exposes the Sori request/response protocol as HTTP/JSON on
`127.0.0.1:17373`. `sori-ipc::LocalIpcClient` sends a single `POST /ipc`
request per operation; the JSON body is the canonical `Request` and the JSON
response is the canonical `Response`.

The listener is explicitly loopback-only and rejects non-loopback bind
addresses. It does not listen on `0.0.0.0`, and the endpoint carries no
credentials or microphone data. This transport is intended for local CLI,
browser, and Tauri integrations. Requests and responses are bounded, and the
server handles each connection in a Tokio task so daemon runtime work is not
performed inline on the audio hot path.

The fixed endpoint is the MVP default. Tests can bind `LocalIpcServer` to
`127.0.0.1:0` and discover the assigned port with `local_addr()`.
