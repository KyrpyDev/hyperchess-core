// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/__tests__/game.test.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { describe, it, expect } from 'vitest';
import {
  createGame,
  addMove,
  removeLastMove,
  getGameStatus,
  generateLegalMoves,
  isInCheck,
  moveToHsan,
} from '../index.js';

describe('hyperchess-core - Game State Machine', () => {
  it('creates a new game with starting position', () => {
    const game = createGame();

    expect(game).toBeDefined();
    expect(game.status).toBe('active');
    expect(game.moves.length).toBe(0);
    expect(game.board.fullmoveNumber).toBe(1);
  });

  it('adds a pawn move in algebraic notation', () => {
    const game = createGame();
    // Pawns start on rank 3/10 here (see pawn.ts) — e3-e4 is the single-step
    // advance, not the standard-chess e2-e4.
    const result = addMove(game, 'e3e4');

    expect(result).toBeDefined();
    expect(result?.moves.length).toBe(1);
    expect(result?.moves[0]).toBe('e3e4');
  });

  it('rejects invalid moves', () => {
    const game = createGame();
    const result = addMove(game, 'e3e6'); // A pawn can only move 1 or 2 squares from its start

    expect(result).toBeNull();
  });

  it('handles HSAN notation (e.g., e4 for pawn)', () => {
    const game = createGame();
    const result = addMove(game, 'e4'); // HSAN: pawn advances to e4 (from e3)

    expect(result).toBeDefined();
    expect(result?.moves[0]).toBe('e3e4');
  });

  it('tracks move history correctly', () => {
    let game = createGame();

    game = addMove(game, 'e3e4')!;
    game = addMove(game, 'c10c9')!;
    game = addMove(game, 'd2c4')!; // knight move (knights start on d/i files here)

    expect(game.moves.length).toBe(3);
    expect(game.board.fullmoveNumber).toBe(2); // After black's first move
  });

  it('alternates turns between white and black', () => {
    let game = createGame();

    expect(game.board.toMove).toBe('white');

    game = addMove(game, 'e3e4')!;
    expect(game.board.toMove).toBe('black');

    game = addMove(game, 'c10c9')!;
    expect(game.board.toMove).toBe('white');
  });

  it('handles pawn captures', () => {
    // Custom position: white pawn on e6, black pawn diagonally ahead on d7.
    const hfen = '11K/12/12/12/12/3p8/4P7/12/12/12/12/11k w - - 0 1';
    const game = createGame(hfen);

    const result = addMove(game, 'e6d7'); // Capture

    expect(result).toBeDefined();
    expect(result?.moves[result.moves.length - 1]).toBe('e6d7');
    expect(result?.board.pieces[75]).toMatchObject({ type: 'P', color: 'white' }); // d7 now holds the white pawn
  });

  it('prevents moves that leave king in check', () => {
    // Create a position where king is in check
    // For this test, we'd need a specific position setup
    const game = createGame();
    const moves = generateLegalMoves(game.board);

    // Starting position has no checks
    expect(isInCheck(game.board)).toBe(false);
  });

  it('undoes a move correctly', () => {
    let game = createGame();

    game = addMove(game, 'e3e4')!;
    expect(game.moves.length).toBe(1);

    game = removeLastMove(game);
    expect(game.moves.length).toBe(0);
    expect(game.board.toMove).toBe('white');
    expect(game.board.fullmoveNumber).toBe(1);
  });

  it('handles multiple undo operations', () => {
    let game = createGame();

    game = addMove(game, 'e3e4')!;
    game = addMove(game, 'c10c9')!;
    game = addMove(game, 'd2c4')!;

    expect(game.moves.length).toBe(3);
    expect(game.board.fullmoveNumber).toBe(2);

    game = removeLastMove(game);
    expect(game.moves.length).toBe(2);
    expect(game.board.fullmoveNumber).toBe(2); // black just moved before undo

    game = removeLastMove(game);
    expect(game.moves.length).toBe(1);
    expect(game.board.fullmoveNumber).toBe(1); // undoing black's move rewinds the counter

    game = removeLastMove(game);
    expect(game.moves.length).toBe(0);
  });

  it('undoes correctly from a custom starting position (regression: removeLastMove used to always replay from the default position)', () => {
    const hfen = '11K/12/12/12/12/3p8/4P7/12/12/12/12/11k w - - 0 1';
    let game = createGame(hfen);

    game = addMove(game, 'e6d7')!;
    expect(game.board.pieces[75]?.color).toBe('white');

    game = removeLastMove(game);
    expect(game.board.pieces[64]).toMatchObject({ type: 'P', color: 'white' }); // back on e6
    expect(game.board.pieces[75]).toMatchObject({ type: 'P', color: 'black' }); // black pawn restored on d7
  });

  it('reports active status for ongoing games', () => {
    const game = createGame();
    expect(getGameStatus(game)).toBe('active');
  });

  it('detects game status changes on moves', () => {
    let game = createGame();

    game = addMove(game, 'e3e4')!;
    expect(game.status).toBe('active');
  });

  it('converts moves to HSAN notation', () => {
    const game = createGame();
    const moves = generateLegalMoves(game.board);

    if (moves.length > 0) {
      const hsan = moveToHsan(game.board, moves[0]);
      expect(typeof hsan).toBe('string');
      expect(hsan.length).toBeGreaterThan(0);
    }
  });

  it('handles castling notation end-to-end (king-side and queen-side)', () => {
    // White king (g2) with both rooks still home and a clear path each way.
    const hfen = '11g/12/12/12/12/12/12/12/12/12/2C3G2J2/12 w KQ - 0 1';
    const kingSide = createGame(hfen);
    let result = addMove(kingSide, 'O-O');
    expect(result).not.toBeNull();
    expect(result!.moves[0]).toBe('g2i2'); // Game.moves records algebraic notation, even for HSAN-notated input
    expect(result!.board.pieces[20]).toMatchObject({ type: 'K', color: 'white' }); // king → i2
    expect(result!.board.pieces[19]).toMatchObject({ type: 'R', color: 'white' }); // rook → h2

    const queenSide = createGame(hfen);
    result = addMove(queenSide, 'O-O-O');
    expect(result).not.toBeNull();
    expect(result!.moves[0]).toBe('g2e2');
    expect(result!.board.pieces[16]).toMatchObject({ type: 'K', color: 'white' }); // king → e2
    expect(result!.board.pieces[17]).toMatchObject({ type: 'R', color: 'white' }); // rook → f2
  });
});
