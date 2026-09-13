#!/usr/bin/env bash
# build-wasm-sdk.sh — compile crates/hyperchess-wasm to WebAssembly for the
# hyperchess-wasm SDK package (packages/wasm/).
#
# Adapted from the source repo's scripts/build-wasm-sdk.sh, which built
# src/hyperchess directly (there was no separate wasm crate there — see
# docs/hyperchess-core-extraction-plan.md §12 Phase 6 for why this repo has
# one). Unlike the source script, no --no-default-features/--features wasm
# flags are needed: crates/hyperchess-wasm gates its wasm-bindgen code by
# `#[cfg(target_arch = "wasm32")]`, not a Cargo feature, so targeting wasm32
# via wasm-pack's --target flag is sufficient on its own.
#
# Targets:
#   - bundler: for apps that import hyperchess-wasm through webpack/vite/etc.
#   - nodejs:  for server-side consumers (e.g. an HTMX backend)
#   - web:     for consumers who want a plain <script type="module"> import
#              with no bundler
#
# Usage:
#   ./scripts/build-wasm-sdk.sh
#
# Requires: wasm-pack and the wasm32-unknown-unknown target
#   cargo install wasm-pack
#   rustup target add wasm32-unknown-unknown

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT/packages/wasm/dist"

build_target() {
  local target="$1"
  local out_dir="$DIST_DIR/$target"

  echo "[build-wasm-sdk] Building hyperchess-wasm → $out_dir (target: $target)"
  cd "$ROOT/crates/hyperchess-wasm"

  wasm-pack build \
    --target "$target" \
    --out-dir "$out_dir"

  # Don't let wasm-pack's own .gitignore override the repo root's — keep the
  # directory trackable via .gitkeep while the build output itself (already
  # covered by the repo-wide dist/ rule) stays gitignored.
  rm -f "$out_dir/.gitignore"
  touch "$out_dir/.gitkeep"
}

build_target bundler
build_target nodejs
build_target web

echo "[build-wasm-sdk] Done. Artifacts:"
ls -1 "$DIST_DIR"/bundler/hyperchess_wasm_bg.wasm "$DIST_DIR"/nodejs/hyperchess_wasm_bg.wasm "$DIST_DIR"/web/hyperchess_wasm_bg.wasm
