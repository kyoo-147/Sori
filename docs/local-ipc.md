# Local IPC

Sori clients use the `sori-ipc` request/response contracts for daemon status,
diagnostics, configuration summaries, and recent events. The client boundary is
transport-independent; `MockIpcServer` is provided for deterministic tests.

The production transport is intentionally not enabled by this scaffold. The
planned deployment is a Windows named pipe (`\\.\pipe\sori`) and a Unix domain
socket on macOS/Linux. Both should use bounded, framed messages and the same
contracts without running work on the daemon's audio/transcription hot path.

## Security model

IPC is local-only: it must bind to a per-user endpoint, reject remote/network
connections, and rely on the operating system's user/ACL checks. The protocol
must not carry microphone bytes, secrets, or credentials. Requests should be
small and bounded; event payloads are diagnostic metadata and remain subject to
local retention settings. Future transports must authenticate the peer using
OS credentials (Windows pipe ACLs or Unix socket ownership/mode) and return
explicit errors when the daemon is absent.
