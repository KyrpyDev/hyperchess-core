# hyperchess-wasm

A thin JS/TS wrapper around `crates/hyperchess-wasm` compiled to WebAssembly — **not** a
separate implementation of the game rules or the 3D renderer. This package has no Rust source
of its own; `npm run build` (or `../../scripts/build-wasm-sdk.sh` directly) compiles that
crate for three targets:

| Export | wasm-pack target | Use case |
| --- | --- | --- |
| `hyperchess-wasm` | `bundler` | apps importing this through webpack/vite/etc. |
| `hyperchess-wasm/nodejs` | `nodejs` | server-side consumers (e.g. an HTMX backend) |
| `hyperchess-wasm/web` | `web` | plain `<script type="module">`, no bundler |

All three expose:
- **`WasmBoard`** — rules + search bindings (`from_hfen`, `legal_moves`, `apply_move`, `hfen`,
  `termination`, `encode`, every searcher entry point). Consumed today by `hyperchess-core`.
- **`Scene3D`** — WebGPU/WebGL board/piece renderer, taking `WasmBoard::encode()`'s 144-byte
  board format directly. Not yet consumed by any package here — `hyperchess-board-ui-3d`
  (extraction plan §12 Phase 8) will wrap it.

**GPLv3, not MIT** (unlike `hyperchess-core`/`board`/`store`/`theme`) — this package's `.wasm`
binary directly contains the compiled rules+search engine, so it's a GPL derivative by
construction. Bundling it directly into an app's own bundle makes that app a GPL derivative
too; consuming it via a Web Worker (`postMessage`) or over the network (the API driver) does
not — see the extraction plan §4/§5 for the full reasoning and the recommended integration
patterns.

See `docs/sdk-plan/WASM-MIGRATION-PLAN.md` (carried over from the source repo, historical
context only) for why this package exists and what still used the hand-written TypeScript
rules engine in `hyperchess-core` before it was replaced by a wrapper around this package.

**Known trade-off:** the compiled `.wasm` is ~4.5MB because `Scene3D`'s `wgpu` dependency
compiles into the same binary as `WasmBoard`, even for consumers who only need 2D rules
validation — see `crates/hyperchess-wasm/docs/README.md` for the full discussion and the
proposed Phase 8 fix (a Cargo feature split).
