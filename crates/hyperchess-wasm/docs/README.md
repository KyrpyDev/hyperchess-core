# hyperchess-wasm

Two independent wasm-bindgen surfaces, one wasm-pack build target:

- **`WasmBoard`** — rules + search bindings (legal moves, apply-move, every searcher entry
  point). Depends on `hyperchess-rules` + `hyperchess-search`.
- **`Scene3D`** — WebGPU/WebGL board/piece renderer. Zero dependency on the rules engine —
  takes a 144-byte board encoding as raw bytes (the same format `WasmBoard::encode()`
  produces), not a `Board` reference. The two communicate via that shared byte protocol, not
  Rust-level coupling.

The source repo keeps these as genuinely separate crates/build pipelines (`src/hyperchess`
built directly with `--features wasm`, and a standalone `hyperchess_3d` consumed only by the
private web app's own hand-loaded WASM, never integrated into the npm SDK workspace). Merging
them here is a deliberate improvement, not a copy of existing structure — see
[`docs/hyperchess-core-extraction-plan.md`](../../../docs/hyperchess-core-extraction-plan.md)
§12 Phase 6. It's also why `hyperchess-rules`/`hyperchess-search` have no wasm-bindgen
dependency of their own (Phase 1/3) — that lives only here, in the crate whose whole purpose
is WASM bindings.

`geometry`/`pieces` are plain portable math, native-buildable, and used by the `gen_assets`
dev-tool binary (`cargo run --bin gen_assets`) as well as the wasm32-only renderer — everything
else here (`board`, `camera`, `gpu`, `obj`, `scene`) is `#[cfg(target_arch = "wasm32")]`, so a
plain `cargo build`/`cargo test` (no wasm32 target) only touches the portable half.

## Known trade-off: bundle size

Verified via a real `wasm-pack build --target nodejs` + Node.js smoke test (not just
`cargo build`): the resulting `.wasm` binary is **~4.5MB**, because `wgpu` (pulled in for
`Scene3D`) compiles into the same module as `WasmBoard`, even for consumers who only want 2D
legal-move validation and never touch the 3D renderer. The source repo's `hyperchess-wasm`
package (rules-only, no 3D) was necessarily smaller. This is the direct cost of the "one
wasm-pack build target" merge decision (§12 Phase 6) — worth reconsidering once
`packages/board-3d` (§12 Phase 8) is built: a `scene3d` Cargo feature gating `wgpu`/`camera`/
`gpu`/`obj`/`scene` out of the default build would let a `WasmBoard`-only consumer opt out of
the 3D weight, at the cost of no longer being strictly "one build for everything." Flagged as
an open item, not solved here.
