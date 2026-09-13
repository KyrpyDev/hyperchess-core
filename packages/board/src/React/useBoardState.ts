// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-board-ui
// File: packages/board/src/React/useBoardState.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { useState, useCallback, useMemo } from 'react';
import { Board as BoardType, Move, HfenString, createBoard, applyMove, generateLegalMoves } from 'hyperchess-core';
import { SelectionState } from '../types/props';

/**
 * React hook owning the board position and the user's click-to-move selection.
 *
 * `initialHfen` seeds the first render only; later changes to it are ignored,
 * so remount the component (or key it) to load a different position. Note that
 * `reset()` returns to the standard starting position rather than back to
 * `initialHfen`.
 *
 * @param initialHfen - Starting position as an HFEN string or a prebuilt
 *   `Board`. A `Board` is adopted by reference, not copied. Omitted means the
 *   standard opening position.
 * @returns The current `board`, the transient `selection` state, the memoised
 *   `legalMoves` for the side to move, and the `selectSquare` / `makeMove` /
 *   `reset` actions.
 */
export function useBoardState(initialHfen?: HfenString | BoardType) {
  const [board, setBoard] = useState<BoardType | null>(() => {
    if (!initialHfen) {
      return createBoard();
    }
    if (typeof initialHfen === 'string') {
      return createBoard(initialHfen);
    }
    return initialHfen;
  });

  const [selection, setSelection] = useState<SelectionState>({
    selectedSquare: null,
    legalMoves: [],
    lastMove: null,
  });

  const legalMoves = useMemo(() => {
    if (!board) return [];
    return generateLegalMoves(board);
  }, [board]);

  /**
   * Handle a click on a square, driving the three-state selection cycle.
   *
   * Clicking one's own piece selects it (and re-selects when another own piece
   * is clicked), clicking a highlighted destination plays the move, and any
   * other click clears the selection. `lastMove` is deliberately preserved
   * across a deselect so the last-move highlight does not flicker.
   *
   * @param square - Flat board index that was clicked.
   */
  const selectSquare = useCallback(
    (square: number) => {
      if (!board) return;

      const piece = board.pieces[square];

      // Click on own piece: select it
      if (piece && piece.color === board.toMove) {
        const moves = legalMoves
          .filter((m) => m.from === square)
          .map((m) => m.to);

        setSelection({
          ...selection,
          selectedSquare: square,
          legalMoves: moves,
        });
      }
      // Click on destination: try move
      else if (selection.selectedSquare !== null && selection.legalMoves.includes(square)) {
        makeMove({ from: selection.selectedSquare, to: square });
      }
      // Click elsewhere: deselect
      else {
        setSelection({
          ...selection,
          selectedSquare: null,
          legalMoves: [],
        });
      }
    },
    [board, selection, legalMoves]
  );

  /**
   * Validate a move against the generated legal moves and apply it.
   *
   * Rejection is reported by return value rather than an exception, so a UI can
   * treat an illegal drop as a no-op. `applyMove` produces a new board rather
   * than mutating, which is what makes the position safe to hold in state.
   *
   * @param move - Move to attempt; only `from` and `to` are matched against the
   *   legal move list.
   * @returns `true` if the move was applied, `false` if it was illegal or no
   *   board is loaded.
   */
  const makeMove = useCallback(
    (move: Move) => {
      if (!board) return false;

      const isLegal = legalMoves.some((m) => m.from === move.from && m.to === move.to);
      if (!isLegal) return false;

      const newBoard = applyMove(board, move);
      setBoard(newBoard);

      setSelection({
        selectedSquare: null,
        legalMoves: [],
        lastMove: { from: move.from, to: move.to },
      });

      return true;
    },
    [board, legalMoves]
  );

  /**
   * Return to the standard starting position and clear all selection state,
   * including `lastMove`. Does not restore the hook's `initialHfen`.
   */
  const reset = useCallback(() => {
    setBoard(createBoard());
    setSelection({
      selectedSquare: null,
      legalMoves: [],
      lastMove: null,
    });
  }, []);

  return {
    board,
    selection,
    selectSquare,
    makeMove,
    reset,
    legalMoves,
  };
}
