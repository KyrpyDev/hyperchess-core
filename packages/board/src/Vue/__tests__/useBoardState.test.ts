// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-board-ui
// File: packages/board/src/Vue/__tests__/useBoardState.test.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { describe, it, expect } from 'vitest';
import { createBoard } from 'hyperchess-core';
import { useBoardState } from '../useBoardState';

describe('hyperchess-board-ui - Vue useBoardState', () => {
  it('initializes with the default starting position when no hfen is given', () => {
    // Regression: previously called `ref(lazyInitializerFn)(null)`, which
    // throws at runtime since a Vue Ref isn't callable — this composable
    // could not be constructed at all before the fix.
    const { board } = useBoardState();
    expect(board.value).not.toBeNull();
    expect(board.value?.toMove).toBe('white');
  });

  it('initializes from a custom HFEN string', () => {
    // Kings in opposite corners, out of the way — the real (WASM-backed)
    // engine requires both to be present.
    const hfen = '11K/12/12/12/12/3p8/4P7/12/12/12/12/11k w - - 0 1';
    const { board } = useBoardState(hfen);
    expect(board.value?.pieces[64]).toMatchObject({ type: 'P', color: 'white' });
  });

  it('initializes from a pre-built Board object', () => {
    const preBuilt = createBoard();
    const { board } = useBoardState(preBuilt);
    // Vue's ref() wraps the value in a reactive proxy, so it won't be the
    // exact same reference — compare contents instead.
    expect(board.value).toEqual(preBuilt);
  });

  it('selecting an own piece populates legalMoves for that square', () => {
    const { board, selection, selectSquare } = useBoardState();
    const pawnSquare = 26; // e3, a white pawn at the start

    selectSquare(pawnSquare);

    expect(selection.value.selectedSquare).toBe(pawnSquare);
    expect(selection.value.legalMoves.length).toBeGreaterThan(0);
    expect(board.value?.toMove).toBe('white'); // selecting alone doesn't move
  });

  it('clicking a legal destination after selecting makes the move', () => {
    const { board, selection, selectSquare } = useBoardState();
    const pawnSquare = 26; // e3
    const destSquare = 38; // e4 (single advance)

    selectSquare(pawnSquare);
    selectSquare(destSquare);

    expect(board.value?.toMove).toBe('black'); // move applied, turn passed
    expect(board.value?.pieces[destSquare]).toMatchObject({ type: 'P', color: 'white' });
    expect(selection.value.selectedSquare).toBeNull();
    expect(selection.value.lastMove).toEqual({ from: pawnSquare, to: destSquare });
  });

  it('clicking an empty, non-legal square deselects', () => {
    const { selection, selectSquare } = useBoardState();
    selectSquare(26); // select e3 pawn
    expect(selection.value.selectedSquare).toBe(26);

    selectSquare(100); // an empty square that pawn can't reach
    expect(selection.value.selectedSquare).toBeNull();
    expect(selection.value.legalMoves).toEqual([]);
  });

  it('makeMove rejects illegal moves', () => {
    const { board, makeMove } = useBoardState();
    const result = makeMove({ from: 26, to: 100 }); // e3 pawn can't reach this square

    expect(result).toBe(false);
    expect(board.value?.toMove).toBe('white'); // unchanged
  });

  it('reset() restores the default starting position', () => {
    const { board, selection, makeMove, reset } = useBoardState();
    makeMove({ from: 26, to: 38 }); // e3-e4

    reset();

    expect(board.value?.toMove).toBe('white');
    expect(board.value?.pieces[26]).toMatchObject({ type: 'P', color: 'white' });
    expect(selection.value.selectedSquare).toBeNull();
    expect(selection.value.lastMove).toBeNull();
  });
});
