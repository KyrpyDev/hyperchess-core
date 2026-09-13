// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/board/move.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Board } from '../types/board.js';
import { Move } from '../types/move.js';
import { getBoardHfen } from './hfen.js';
import { loadWasmBoard, snapshotFromWasmBoard, moveToUci } from '../wasm/engine.js';

/**
 * Apply a move to the board, returning a new board state.
 * Does NOT validate legality - use isLegalMove() first.
 *
 * Delegates to the Rust engine via WASM — this used to hand-roll castling
 * rook relocation, en passant capture removal, and castling-rights
 * invalidation here, which drifted out of sync with the real rules more than
 * once (see docs/sdk-plan/WASM-MIGRATION-PLAN.md). Round-trips through HFEN
 * on each call rather than keeping a live `WasmBoard` across calls, trading
 * some overhead for keeping `Board` a plain, directly-inspectable snapshot
 * object everywhere else in the SDK.
 */
export function applyMove(board: Board, move: Move): Board {
  const piece = board.pieces[move.from];
  if (!piece) {
    throw new Error(`No piece at source square ${move.from}`);
  }

  const wasmBoard = loadWasmBoard(getBoardHfen(board));
  const applied = wasmBoard.apply_move(moveToUci(move));
  if (!applied) {
    throw new Error(`Illegal move: ${move.from} -> ${move.to}`);
  }

  const history = [
    ...board.history,
    {
      pieces: [...board.pieces],
      toMove: board.toMove,
      enPassantSquare: board.enPassantSquare,
      castlingRights: { ...board.castlingRights },
      halfmoveClock: board.halfmoveClock,
      fullmoveNumber: board.fullmoveNumber,
    },
  ];

  return snapshotFromWasmBoard(wasmBoard, history);
}
