// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-board-ui
// File: packages/board/src/types/props.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Board, HfenString } from 'hyperchess-core';
import { Move } from 'hyperchess-core';

/**
 * Name of a theme to resolve from `hyperchess-theme`.
 *
 * The known names are listed for editor autocompletion only — the trailing
 * `string` widens the union, so any registered custom theme name is accepted and
 * an unknown name is a runtime rather than a compile-time error.
 */
export type Theme = 'classic' | 'modern' | 'dark' | 'highcontrast' | string;

/**
 * What the user is allowed to do with the board: `view` is read-only, `play`
 * accepts only legal moves for the side to move, and `analyze` allows moving
 * either side freely for exploring variations.
 */
export type InteractionMode = 'view' | 'play' | 'analyze';

/**
 * Props accepted by the board component across all framework bindings.
 *
 * Every field is optional; the component is fully usable with no props and falls
 * back to the standard 12x12 HyperChess starting position. Square indices used
 * by the callbacks are flat 0-based offsets into the board, not file/rank pairs.
 */
export interface BoardProps {
  /** Initial board state (HFEN or Board object) */
  hfen?: HfenString | Board;

  /** Theme name or custom theme */
  theme?: Theme;

  /** Called after a move has been validated and applied, never for a rejected one. */
  onMove?: (move: Move) => void;

  /** Called for every square click, including clicks that select nothing. */
  onSquareClick?: (square: number) => void;

  /** Enable drag-and-drop moves */
  enableDragDrop?: boolean;

  /** Show rank/file coordinates */
  showCoordinates?: boolean;

  /** Render from black's perspective. Affects display only — square indices
   * passed to callbacks stay in the engine's orientation. */
  flipBoard?: boolean;

  /** Highlight last move */
  highlightLastMove?: boolean;

  /** Highlight legal moves for selected piece */
  highlightLegalMoves?: boolean;

  /** Interaction mode */
  mode?: InteractionMode;

  /** Disable user interaction */
  disabled?: boolean;

  /** Custom CSS class */
  className?: string;

  /** Piece style (unicode, svg, or font) */
  pieceStyle?: 'unicode' | 'svg' | 'font';

  /** Animation speed (ms for move animation) */
  animationSpeed?: number;

  /** Edge length in pixels, or `'responsive'` to fill the container while
   * holding a square aspect ratio. */
  size?: number | 'responsive';
}

/**
 * Transient UI state tracked while the user interacts with the board.
 *
 * Kept separate from the game state so that selecting and deselecting never
 * touches the position — only a completed move does.
 */
export interface SelectionState {
  /** Square the user has picked up, or `null` when nothing is selected. */
  selectedSquare: number | null;

  /** Destination squares reachable from `selectedSquare`, for highlighting.
   * Empty whenever nothing is selected. */
  legalMoves: number[];

  /** Most recent move played on this board, for the last-move highlight. It
   * survives selection changes and is cleared only by a reset. */
  lastMove: { from: number; to: number } | null;
}

/**
 * The full set of interaction callbacks a board renderer must wire up.
 *
 * Unlike the optional handlers on {@link BoardProps} these are all required —
 * this is the internal contract between a renderer and its state hook, not the
 * public component surface.
 */
export interface BoardHandlers {
  onMove: (move: Move) => void;
  onSquareClick: (square: number) => void;
  onDragStart: (square: number) => void;
  onDragEnd: (square: number) => void;
  /** Fired on a completed drag; the move still has to pass legality checks. */
  onDrop: (from: number, to: number) => void;
}
