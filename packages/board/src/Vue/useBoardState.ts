// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-board-ui
// File: packages/board/src/Vue/useBoardState.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { ref, computed } from 'vue';
import {
  Board as BoardType,
  Move,
  HfenString,
  createBoard,
  applyMove,
  generateLegalMoves,
} from 'hyperchess-core';
import type { SelectionState } from '../types/props';

/**
 * Vue 3 composable owning the board position and click-to-move selection.
 *
 * Behaviourally identical to the React hook of the same name — the split exists
 * only because the two frameworks' reactivity primitives differ. `initialHfen`
 * seeds the composable once; later changes are ignored, and `reset()` returns to
 * the standard starting position rather than to `initialHfen`.
 *
 * @param initialHfen - Starting position as an HFEN string or a prebuilt
 *   `Board`. A `Board` is adopted by reference, not copied. Omitted means the
 *   standard opening position.
 * @returns Reactive `board` and `selection` refs, a computed `legalMoves` for
 *   the side to move, and the `selectSquare` / `makeMove` / `reset` actions.
 */
export function useBoardState(initialHfen?: HfenString | BoardType) {
  // `ref()` takes a value, not a lazy-initializer function like React's
  // `useState` — compute the initial board up front instead.
  const initialBoard: BoardType =
    !initialHfen ? createBoard() : typeof initialHfen === 'string' ? createBoard(initialHfen) : initialHfen;
  const board = ref<BoardType | null>(initialBoard);

  const selection = ref<SelectionState>({
    selectedSquare: null,
    legalMoves: [],
    lastMove: null,
  });

  const legalMoves = computed(() => {
    if (!board.value) return [];
    return generateLegalMoves(board.value);
  });

  /**
   * Handle a click on a square, driving the three-state selection cycle.
   *
   * Clicking one's own piece selects it, clicking a highlighted destination
   * plays the move, and any other click clears the selection while preserving
   * `lastMove` so the last-move highlight does not flicker.
   *
   * @param square - Flat board index that was clicked.
   */
  const selectSquare = (square: number) => {
    if (!board.value) return;

    const piece = board.value.pieces[square];

    if (piece && piece.color === board.value.toMove) {
      const moves = legalMoves.value.filter((m) => m.from === square).map((m) => m.to);

      selection.value = {
        ...selection.value,
        selectedSquare: square,
        legalMoves: moves,
      };
    } else if (
      selection.value.selectedSquare !== null &&
      selection.value.legalMoves.includes(square)
    ) {
      makeMove({ from: selection.value.selectedSquare, to: square });
    } else {
      selection.value = {
        ...selection.value,
        selectedSquare: null,
        legalMoves: [],
      };
    }
  };

  /**
   * Validate a move against the computed legal moves and apply it.
   *
   * Assigning the new board to `board.value` rather than mutating in place is
   * what lets `legalMoves` recompute.
   *
   * @param move - Move to attempt; only `from` and `to` are matched against the
   *   legal move list.
   * @returns `true` if the move was applied, `false` if it was illegal or no
   *   board is loaded.
   */
  const makeMove = (move: Move) => {
    if (!board.value) return false;

    const isLegal = legalMoves.value.some((m) => m.from === move.from && m.to === move.to);
    if (!isLegal) return false;

    board.value = applyMove(board.value, move);

    selection.value = {
      selectedSquare: null,
      legalMoves: [],
      lastMove: { from: move.from, to: move.to },
    };

    return true;
  };

  /**
   * Return to the standard starting position and clear all selection state,
   * including `lastMove`. Does not restore the composable's `initialHfen`.
   */
  const reset = () => {
    board.value = createBoard();
    selection.value = {
      selectedSquare: null,
      legalMoves: [],
      lastMove: null,
    };
  };

  return {
    board,
    selection,
    selectSquare,
    makeMove,
    reset,
    legalMoves,
  };
}
