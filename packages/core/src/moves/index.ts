// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/moves/index.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Board } from '../types/board.js';
import { Move } from '../types/move.js';
import { getBoardHfen } from '../board/hfen.js';
import { loadWasmBoard, uciToMove } from '../wasm/engine.js';

/**
 * Generate all legal moves for the current position.
 *
 * Delegates to the Rust engine via WASM — this used to be 8 hand-written
 * per-piece move generators plus a separate check-filtering pass, which
 * drifted out of sync with the canonical rules (wrong Eagle/Hawk rule, wrong
 * castling geometry, a sliding-piece own-capture bug, a board-edge
 * wraparound bug — see docs/sdk-plan/WASM-MIGRATION-PLAN.md for the full
 * list). The Rust engine's `generate_moves()` already returns fully legal
 * moves (king safety included), so no separate "would this leave my king in
 * check" filter is needed here anymore either.
 */
export function generateLegalMoves(board: Board): Move[] {
  const wasmBoard = loadWasmBoard(getBoardHfen(board));
  const uci = wasmBoard.legal_moves();
  if (uci === '') return [];
  return uci.split(' ').map((m) => uciToMove(m, board));
}

/** Check if the current player's king is in check. */
export function isInCheck(board: Board): boolean {
  return loadWasmBoard(getBoardHfen(board)).in_check();
}

/** Check if the current position is checkmate. */
export function isCheckmate(board: Board): boolean {
  return loadWasmBoard(getBoardHfen(board)).termination() === 'checkmate';
}

/** Check if the current position is stalemate. */
export function isStalemate(board: Board): boolean {
  return loadWasmBoard(getBoardHfen(board)).termination() === 'stalemate';
}
