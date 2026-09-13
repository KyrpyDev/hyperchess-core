// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/types/game.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Board, HfenString } from './board.js';
import { Move, AlgebraicMove } from './move.js';

/** Represents a complete game */
export interface Game {
  /** Current board state */
  board: Board;

  /** All moves played (in algebraic notation) */
  moves: AlgebraicMove[];

  /** Metadata about the game */
  metadata: GameMetadata;

  /** Game status */
  status: GameStatus;

  /**
   * The HFEN the game started from, if not the default position. Needed so
   * `removeLastMove` can replay from the correct origin instead of silently
   * falling back to the default starting position.
   */
  startHfen?: HfenString;
}

/** Game metadata */
export interface GameMetadata {
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white?: string;
  black?: string;
  whiteElo?: number;
  blackElo?: number;
  result?: GameResult;
  timeControl?: string;
}

/** Possible game outcomes */
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

/** Game status */
export type GameStatus = 'active' | 'checkmate' | 'stalemate' | 'draw' | 'resigned';

/** Additional game info */
export interface GameInfo {
  legalMoves: Move[];
  inCheck: boolean;
  inCheckmate: boolean;
  inStalemate: boolean;
  canClaimDraw: boolean;
}
