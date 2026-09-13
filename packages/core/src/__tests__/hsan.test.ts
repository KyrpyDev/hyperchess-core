// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/__tests__/hsan.test.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { describe, it, expect } from 'vitest';
import { Board } from '../types/board';
import { parseHsanMove } from '../io/hsan-parser';
import { moveToHsan } from '../io/hsan-exporter';
import { generateLegalMoves } from '../moves/index';
import { createBoard } from '../board/create';

function emptyBoard(toMove: 'white' | 'black' = 'white'): Board {
  return {
    pieces: new Array(144).fill(undefined),
    toMove,
    enPassantSquare: -1,
    castlingRights: {
      whiteKingSide: false,
      whiteQueenSide: false,
      blackKingSide: false,
      blackQueenSide: false,
    },
    halfmoveClock: 0,
    fullmoveNumber: 1,
    history: [],
  };
}

const sq = (rank: number, file: number) => rank * 12 + file;

describe('hyperchess-core - HSAN round-trip', () => {
  it('parses and exports a simple pawn move', () => {
    const board = createBoard();
    const move = parseHsanMove(board, 'e4');
    expect(move).not.toBeNull();
    expect(moveToHsan(board, move!)).toBe('e4');
  });

  it('round-trips destinations on rank 10, 11 and 12 (regression: single-digit rank regex used to truncate these)', () => {
    const board = emptyBoard();
    board.pieces[sq(0, 4)] = { type: 'R', color: 'white' }; // rook on e1
    board.pieces[sq(11, 11)] = { type: 'K', color: 'white' };
    board.pieces[sq(0, 11)] = { type: 'K', color: 'black' };

    for (const targetRank of [9, 10, 11]) {
      // ranks 10, 11, 12 (1-indexed) — piece letter required, since a bare
      // "e10" would imply a pawn move and there's no pawn on this board.
      const move = { from: sq(0, 4), to: sq(targetRank, 4) };
      const hsan = moveToHsan(board, move);
      expect(hsan).toBe(`Re${targetRank + 1}`);

      const parsed = parseHsanMove(board, hsan);
      expect(parsed).not.toBeNull();
      expect(parsed!.to).toBe(sq(targetRank, 4));
      expect(parsed!.from).toBe(sq(0, 4));
    }
  });

  it('does not confuse a rank-12 destination with a rank-1 destination', () => {
    const board = emptyBoard();
    board.pieces[sq(0, 4)] = { type: 'R', color: 'white' };
    board.pieces[sq(11, 11)] = { type: 'K', color: 'white' };
    board.pieces[sq(0, 11)] = { type: 'K', color: 'black' };

    const parsed = parseHsanMove(board, 'Re12');
    expect(parsed).not.toBeNull();
    expect(parsed!.to).toBe(sq(11, 4)); // rank 12, not rank 1
  });

  it('parses captures with a two-digit destination rank', () => {
    const board = emptyBoard();
    board.pieces[sq(0, 4)] = { type: 'R', color: 'white' };
    board.pieces[sq(11, 4)] = { type: 'P', color: 'black' };
    board.pieces[sq(11, 11)] = { type: 'K', color: 'white' };
    board.pieces[sq(0, 11)] = { type: 'K', color: 'black' };

    const move = parseHsanMove(board, 'Rxe12');
    expect(move).not.toBeNull();
    expect(move!.to).toBe(sq(11, 4));
  });

  it('parses promotion to a two-digit destination rank', () => {
    const board = emptyBoard();
    board.pieces[sq(10, 4)] = { type: 'P', color: 'white' }; // rank 11, one from promotion
    board.pieces[sq(11, 11)] = { type: 'K', color: 'white' };
    board.pieces[sq(0, 11)] = { type: 'K', color: 'black' };

    const move = parseHsanMove(board, 'e12=Q');
    expect(move).not.toBeNull();
    expect(move!.to).toBe(sq(11, 4));
    expect(move!.promotion).toBe('Q');
  });

  it('resolves file disambiguation between two rooks', () => {
    const board = emptyBoard();
    board.pieces[sq(0, 0)] = { type: 'R', color: 'white' };
    board.pieces[sq(0, 7)] = { type: 'R', color: 'white' };
    board.pieces[sq(11, 11)] = { type: 'K', color: 'white' };
    board.pieces[sq(0, 11)] = { type: 'K', color: 'black' };

    const move = parseHsanMove(board, 'Rae1');
    expect(move).not.toBeNull();
    expect(move!.from).toBe(sq(0, 0));
  });

  it('round-trips both castling sides', () => {
    const board = createBoard();
    const legal = generateLegalMoves(board);
    const kingSide = legal.find((m) => m.isCastling && m.to === sq(0, 6));
    const queenSide = legal.find((m) => m.isCastling && m.to === sq(0, 2));

    if (kingSide) {
      expect(moveToHsan(board, kingSide)).toBe('O-O');
      expect(parseHsanMove(board, 'O-O')).toEqual(kingSide);
    }
    if (queenSide) {
      expect(moveToHsan(board, queenSide)).toBe('O-O-O');
      expect(parseHsanMove(board, 'O-O-O')).toEqual(queenSide);
    }
  });

  it('returns null for garbage input', () => {
    const board = createBoard();
    expect(parseHsanMove(board, '')).toBeNull();
    expect(parseHsanMove(board, 'zz99')).toBeNull();
    expect(parseHsanMove(board, 'e4extragarbage')).toBeNull();
  });
});
