// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/board/undo.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Board } from '../types/board.js';

/** Undo the last move */
export function undoMove(board: Board): Board {
  if (board.history.length === 0) {
    throw new Error('No moves to undo');
  }

  const lastState = board.history[board.history.length - 1];

  return {
    pieces: lastState.pieces,
    toMove: lastState.toMove,
    enPassantSquare: lastState.enPassantSquare,
    castlingRights: lastState.castlingRights,
    halfmoveClock: lastState.halfmoveClock,
    fullmoveNumber: lastState.fullmoveNumber,
    history: board.history.slice(0, -1),
  };
}
