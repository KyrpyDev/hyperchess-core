// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/wasm/engine.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { WasmBoard } from 'hyperchess-wasm';

export { snapshotFromWasmBoard, moveToUci, uciToMove } from './snapshot';

/**
 * Loads a `WasmBoard` from the Rust engine — starting position if `hfen` is
 * omitted, or parses `hfen` (throws via wasm-pack's `Option::None` → JS
 * `undefined` if it's invalid; callers should check).
 *
 * Imports from the package root, not a specific wasm-pack target subpath:
 * `hyperchess-wasm`'s package.json resolves this to the `nodejs` target
 * under Node (loads synchronously via `fs`) and the `bundler` target
 * everywhere else (a real bundler's module graph resolution is already
 * async, so no explicit init call is needed here either — see
 * docs/sdk-plan/WASM-MIGRATION-PLAN.md Phase 5).
 *
 * NOT usable for a bundler-free browser deployment (a bare
 * `<script type="module">` import with no build step) — the `bundler`
 * target this resolves to there fails to even load (it does a raw
 * `import ... from "./x.wasm"`, which needs a bundler to handle). See
 * `../standalone.ts` for that case instead, which uses the `web` target
 * with an explicit async init and deliberately does NOT import this module.
 */
export function loadWasmBoard(hfen?: string): WasmBoard {
  if (!hfen) {
    return new WasmBoard();
  }
  const board = WasmBoard.from_hfen(hfen);
  if (!board) {
    throw new Error(`Invalid HFEN: ${hfen}`);
  }
  return board;
}
