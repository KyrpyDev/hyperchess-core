// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/__tests__/board.test.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { describe, it, expect } from 'vitest';
import { createBoard, getBoardHfen, applyMove, undoMove } from '../board/index.js';
import { createGame } from '../game/index.js';

describe('hyperchess-core - Board', () => {
  it('creates a board from default position', () => {
    const board = createBoard();
    expect(board).toBeDefined();
    expect(board.pieces.length).toBe(144); // 12x12 board
    expect(board.toMove).toBe('white');
    expect(board.fullmoveNumber).toBe(1);
  });

  it('parses HFEN correctly', () => {
    const hfen = '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1';
    const board = createBoard(hfen);
    expect(board.toMove).toBe('white');
    expect(board.castlingRights.whiteKingSide).toBe(true);
  });

  it('exports HFEN correctly', () => {
    const board = createBoard();
    const hfen = getBoardHfen(board);
    expect(hfen).toContain('w');
    // The canonical starting position (Rust engine's START_HFEN_I) starts
    // with all four castling rights available — CastleRights::update_for_move
    // only ever clears bits, never sets them, so starting from '-' would mean
    // no game could ever castle (that was the bug START_HFEN_I's `KQkq` fixed).
    expect(hfen.split(' ')[2]).toBe('KQkq');
  });

  it('can create a game from HFEN', () => {
    const game = createGame();
    expect(game).toBeDefined();
    expect(game.status).toBe('active');
    expect(game.moves.length).toBe(0);
  });

  it('handles board history for undo', () => {
    const board = createBoard();
    const initialHistoryLength = board.history.length;
    // Note: full undo testing requires move validation (Phase 3.0.2.2)
    expect(initialHistoryLength).toBe(0);
  });
});
