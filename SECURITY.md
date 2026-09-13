# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Instead:

- Use GitHub's **private vulnerability reporting** on this repository
  (*Security → Report a vulnerability*), or
- Email **hyperchessapp@gmail.com** with the details.

Include what you can: affected component (crate/package), a reproduction (an HFEN string, API
request, or code snippet), and the impact you see. You'll get an acknowledgment within a few
days; please allow a reasonable window for a fix before public disclosure. Credit is given in the
release notes unless you prefer otherwise.

## Scope — what counts as a vulnerability here

This engine is designed to accept **untrusted input** at these boundaries, and flaws there are
in scope:

- **HFEN / HSAN / UCI parsing** (`hyperchess-rules`, `hyperchess-core`) — panics, out-of-bounds
  access, or resource exhaustion from crafted position/move strings.
- **The REST driver** (`hyperchess-driver api`) — request handling, resource limits, and the
  statelessness guarantee (no cross-request contamination).
- **The WASM boundary** (`hyperchess-wasm`, `hyperchess-wasm`) — memory safety across the
  JS↔WASM interface.
- **Search resource limits** — inputs that cause the search to ignore its time/node budget
  (denial of service against apps embedding the engine).

Out of scope: engine strength issues (a lost game is not a CVE), unsafe use of the private CUDA
crate (it is never published), and vulnerabilities in third-party dependencies (report upstream —
though a heads-up so we can bump the pin is appreciated).

## Supported versions

Pre-1.0, only the latest published minor release receives security fixes.

## Hardening notes for embedders

- Run the WASM engine in a **dedicated Web Worker** and communicate via `postMessage` — this
  isolates the engine and keeps your UI thread responsive.
- Always pass a `movetime_ms` or `node_limit` budget when searching positions you did not
  construct yourself.
- Validate HFEN input with the provided validators before persisting it.
