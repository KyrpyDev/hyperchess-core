// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/board/create.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Board } from '../types/board';
import { loadWasmBoard, snapshotFromWasmBoard } from '../wasm/engine';

/**
 * Create a board from HFEN-I notation (or the default starting position if
 * `hfen` is omitted).
 *
 * Delegates parsing entirely to the Rust engine via WASM — this used to be
 * a hand-written parser here that never implemented HFEN-I identity decoding
 * and mis-parsed multi-digit empty-square runs, so `createBoard()` with no
 * arguments (the SDK's own default starting position!) threw on every call.
 * See docs/sdk-plan/WASM-MIGRATION-PLAN.md for the full history.
 */
export function createBoard(hfen?: string): Board {
  const wasmBoard = loadWasmBoard(hfen);
  return snapshotFromWasmBoard(wasmBoard);
}
