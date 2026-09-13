// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/__tests__/identity.test.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

// Regression tests for the self-contained notation law in the TypeScript SDK:
// a HFEN-I string carries both *which* piece occupies a square and *what* that
// piece currently is, with no side table — and the SDK must not drop either
// half when it re-serializes a board for the engine.
//
// See docs/baremetal-hyperchess-notations-v01.md for the normative definition.

import { describe, it, expect } from 'vitest';
import { createBoard, getBoardHfen, applyMove } from '../board/index';
import { parseHfenPosition, identityStartType, isIdentityChar } from '../board/hfen';
import { generateLegalMoves } from '../moves/index';

const CANONICAL_START =
  '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1';

describe('HFEN-I identity in the TS SDK', () => {
  it('maps identity characters to their starting types', () => {
    expect(identityStartType('A')).toBe('E'); // eagle from a2
    expect(identityStartType('G')).toBe('K'); // king from g2
    expect(identityStartType('F')).toBe('Q'); // queen from f2
    expect(identityStartType('M')).toBe('P'); // pawn from a3
    expect(identityStartType('K')).toBe('H'); // hawk from k2 — NOT the king
    expect(identityStartType('E')).toBe('B'); // bishop from e2 — NOT the eagle
    expect(isIdentityChar('G')).toBe(true);
    expect(isIdentityChar('y')).toBe(false);
    expect(isIdentityChar('1')).toBe(false);
  });

  it('parses the canonical start position with identity intact', () => {
    const squares = parseHfenPosition(CANONICAL_START.split(' ')[0]);
    expect(squares.filter(Boolean)).toHaveLength(48);
    // g2 = square 18 = the white king, identity G.
    expect(squares[18]).toEqual({ type: 'K', color: 'white', identity: 'G' });
    // a3 = square 24 = the white pawn from the a-file, identity M.
    expect(squares[24]).toEqual({ type: 'P', color: 'white', identity: 'M' });
    // a11 = square 120 = the black eagle, identity a.
    expect(squares[120]).toEqual({ type: 'E', color: 'black', identity: 'a' });
  });

  it('reads an inline id:Type pair as one square holding the current type', () => {
    // `M:Q` — the pawn that started on a3, now a queen, on a12.
    const squares = parseHfenPosition('M:Q11/12/6g5/12/12/12/12/12/12/12/6G5/12');
    expect(squares[132]).toEqual({ type: 'Q', color: 'white', identity: 'M' });
    expect(squares.filter(Boolean)).toHaveLength(3);
  });

  it('rejects a malformed position field instead of returning a partial board', () => {
    expect(() => parseHfenPosition('12/12/12')).toThrow(/12 ranks/);
    expect(() => parseHfenPosition('11/12/12/12/12/12/12/12/12/12/12/12')).toThrow(/11 squares/);
    // The type half of a pair is restricted to the promotion set.
    expect(() => parseHfenPosition('M:K11/12/6g5/12/12/12/12/12/12/12/6G5/12')).toThrow(/type half/);
    expect(() => parseHfenPosition('M:P11/12/6g5/12/12/12/12/12/12/12/6G5/12')).toThrow(/type half/);
    // A pair may not change colour.
    expect(() => parseHfenPosition('M:q11/12/6g5/12/12/12/12/12/12/12/6G5/12')).toThrow(/color/);
  });

  it('round-trips the start position byte-identically', () => {
    const board = createBoard();
    expect(getBoardHfen(board)).toBe(CANONICAL_START);
  });

  it('keeps identity across a move — the SDK no longer erases it per ply', () => {
    const board = createBoard();
    expect(board.pieces[18]?.identity).toBe('G');

    const moves = generateLegalMoves(board);
    const push = moves.find((m) => m.from === 24 && m.to === 36); // a3 → a4
    expect(push).toBeDefined();

    const after = applyMove(board, push!);
    // The pawn that started on a3 is still `M` on a4.
    expect(after.pieces[36]).toMatchObject({ type: 'P', color: 'white', identity: 'M' });
    expect(after.pieces[24]).toBeUndefined();
    // ... and it survives serialization, which is what the engine is handed.
    expect(getBoardHfen(after).split(' ')[0]).toContain('M');
  });

  it('emits an id:Type pair only when identity and current type disagree', () => {
    const promoted = parseHfenPosition('M:Q11/12/6g5/12/12/12/12/12/12/12/6G5/12');
    const board = {
      ...createBoard(),
      pieces: promoted,
    };
    const position = getBoardHfen(board).split(' ')[0];
    expect(position.startsWith('M:Q')).toBe(true);
    // Unpromoted pieces stay a single character — no gratuitous pairs.
    expect(position).not.toMatch(/G:/);
    expect(position).not.toMatch(/g:/);
  });

  it('still handles a legacy, type-only position with no identity at all', () => {
    const legacy = parseHfenPosition('6k5/12/12/12/12/12/12/12/12/12/6K5/12');
    expect(legacy[18]).toEqual({ type: 'K', color: 'white' });
    expect(legacy[18]?.identity).toBeUndefined();
    expect(legacy[138]).toEqual({ type: 'K', color: 'black' }); // g12 = 11*12+6
  });
});
