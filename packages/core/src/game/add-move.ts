// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/game/add-move.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Game, GameStatus } from '../types/game.js';
import { Move } from '../types/move.js';
import { generateLegalMoves, isCheckmate, isStalemate } from '../moves/index.js';
import { applyMove } from '../board/move.js';
import { parseHsanMove } from '../io/hsan-parser.js';
import { SQUARE_TOKEN, algebraicToSquare, squareToAlgebraic } from '../utils/square-notation.js';

/**
 * Add a move to the game (in algebraic or HSAN notation)
 * Returns new Game state or null if move is invalid
 */
export function addMoveToGame(game: Game, moveStr: string): Game | null {
  const board = game.board;

  // Generate all legal moves
  const legalMoves = generateLegalMoves(board);
  if (legalMoves.length === 0) {
    // Game already ended
    return null;
  }

  // Try to parse as HSAN first, then as algebraic
  let move: Move | null = null;

  // Try HSAN parsing
  const hsanMove = parseHsanMove(board, moveStr);
  if (hsanMove) {
    move = hsanMove;
  } else {
    // Try as algebraic (e.g., "e2e4" or "e2-e4")
    move = parseAlgebraicMove(moveStr);
  }

  if (!move) {
    return null; // Invalid move format
  }

  // Check if move is in legal moves
  const isLegal = legalMoves.some((m) => m.from === move.from && m.to === move.to);
  if (!isLegal) {
    return null; // Illegal move
  }

  // Apply the move
  const newBoard = applyMove(board, move);

  // Determine new game status
  let status: GameStatus = 'active';
  if (isCheckmate(newBoard)) {
    status = 'checkmate';
  } else if (isStalemate(newBoard)) {
    status = 'stalemate';
  }

  // Add move to history (in algebraic format)
  const algebraicMove = `${squareToAlgebraic(move.from)}${squareToAlgebraic(move.to)}${move.promotion ? '=' + move.promotion : ''}`;

  return {
    board: newBoard,
    moves: [...game.moves, algebraicMove],
    metadata: game.metadata,
    status,
  };
}

/**
 * Parse algebraic move notation (e.g., "e2e4", "e2-e4", "e3e11").
 *
 * Ranks 10-12 are two digits on this 12x12 board, so the from/to squares
 * can't be sliced at fixed offsets — each is matched as a variable-length
 * file+rank token.
 */
function parseAlgebraicMove(moveStr: string): Move | null {
  const normalized = moveStr.replace('-', '');

  const match = normalized.match(new RegExp(`^(${SQUARE_TOKEN})(${SQUARE_TOKEN})(?:=([QRBNEH]))?$`));
  if (!match) {
    return null;
  }

  const from = algebraicToSquare(match[1]);
  const to = algebraicToSquare(match[2]);
  const promotion = match[3] as 'Q' | 'R' | 'B' | 'N' | 'E' | 'H' | undefined;

  return { from, to, promotion };
}
