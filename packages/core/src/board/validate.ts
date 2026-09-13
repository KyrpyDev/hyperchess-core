// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/board/validate.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Board } from '../types/board';
import { Move } from '../types/move';
import { generateLegalMoves } from '../moves/index';

/**
 * Check if a move is legal (in the set of all legal moves for the position)
 */
export function isLegalMove(board: Board, move: Move): boolean {
  const legalMoves = generateLegalMoves(board);

  return legalMoves.some((m) => m.from === move.from && m.to === move.to);
}
