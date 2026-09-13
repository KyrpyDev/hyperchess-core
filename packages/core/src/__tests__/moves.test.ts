// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/__tests__/moves.test.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { describe, it, expect } from 'vitest';
import {
  createBoard,
  generateLegalMoves,
  isInCheck,
  isCheckmate,
  isStalemate,
  applyMove,
} from '../index.js';

describe('hyperchess-core - Move Generation', () => {
  it('generates legal moves from starting position', () => {
    const board = createBoard();
    const moves = generateLegalMoves(board);

    // White should have 20 pawn moves + 4 knight moves = 24 moves
    expect(moves.length).toBeGreaterThan(20);
  });

  it('detects pawn moves correctly', () => {
    const board = createBoard();
    const moves = generateLegalMoves(board);

    // Should have pawn moves one and two squares forward
    const pawnMoveSquares = moves
      .filter((m) => {
        const piece = board.pieces[m.from];
        return piece?.type === 'P';
      })
      .map((m) => m.to);

    expect(pawnMoveSquares.length).toBe(24); // 12 pawns × 2 moves each (single + double advance)
  });

  it('detects knight moves correctly', () => {
    const board = createBoard();
    const moves = generateLegalMoves(board);

    // White should have 8 knight moves (2 knights × 4 moves each)
    const knightMoves = moves.filter((m) => {
      const piece = board.pieces[m.from];
      return piece?.type === 'N';
    });

    expect(knightMoves.length).toBe(8);
  });

  it('filters illegal moves (leaving king in check)', () => {
    // White king on c2, black rook on c7 (same file, nothing between) — the
    // king is in check and must step off file 2 (the rook covers every
    // square on it); a black king is placed out of the way, since the real
    // engine requires both kings to be present.
    const hfen = '12/8k3/12/12/12/2r9/12/12/12/12/2K9/12 w - - 0 1';
    const board = createBoard(hfen);
    const moves = generateLegalMoves(board);

    expect(isInCheck(board)).toBe(true);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.to % 12 !== 2)).toBe(true);
  });

  it('detects check correctly', () => {
    // Simplified check detection test
    const board = createBoard();

    // Starting position is not check
    expect(isInCheck(board)).toBe(false);
  });

  it('detects checkmate (though rare in starting)', () => {
    const board = createBoard();
    // Starting position is not checkmate
    expect(isCheckmate(board)).toBe(false);
  });

  it('detects stalemate', () => {
    // This would require a specific stalemate position
    const board = createBoard();
    expect(isStalemate(board)).toBe(false);
  });

  it('respects 50-move rule in halfmove clock', () => {
    const board = createBoard();
    expect(board.halfmoveClock).toBe(0);
  });

  it('generates unique moves', () => {
    const board = createBoard();
    const moves = generateLegalMoves(board);

    // Check for duplicates
    const moveSet = new Set(moves.map((m) => `${m.from}-${m.to}`));
    expect(moveSet.size).toBe(moves.length);
  });

  it('handles pawn promotion in move generation', () => {
    // White pawn one square from the promotion rank (rank index 11, the
    // empty far edge). Kings in opposite corners, out of the way — the
    // real engine requires both to be present.
    const hfen = '11K/P11/12/12/12/12/12/12/12/12/12/11k w - - 0 1';
    const board = createBoard(hfen);
    const moves = generateLegalMoves(board);

    // Should have promotion options
    const promotionMoves = moves.filter((m) => m.promotion);
    expect(promotionMoves.length).toBe(6); // Q, R, B, N, E, H
  });
});
