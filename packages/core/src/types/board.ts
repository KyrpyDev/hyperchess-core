// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/types/board.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Color } from './move';
import { Piece } from './piece';

/** Represents the state of a single board */
export interface Board {
  /** Pieces on board: square index → piece (or undefined if empty) */
  pieces: (Piece | undefined)[];

  /** Whose turn to move */
  toMove: Color;

  /** En passant target square (or -1 if none) */
  enPassantSquare: number;

  /** Castling rights: bitmask for White-King-Side, etc */
  castlingRights: CastlingRights;

  /** Halfmove clock for 50-move rule */
  halfmoveClock: number;

  /** Full move number */
  fullmoveNumber: number;

  /** Move history (for undo) */
  history: BoardState[];
}

/** Castling availability */
export interface CastlingRights {
  whiteKingSide: boolean;
  whiteQueenSide: boolean;
  blackKingSide: boolean;
  blackQueenSide: boolean;
}

/** Snapshot of board state for undo */
export interface BoardState {
  pieces: (Piece | undefined)[];
  toMove: Color;
  enPassantSquare: number;
  castlingRights: CastlingRights;
  halfmoveClock: number;
  fullmoveNumber: number;
}

/** HFEN notation (HFEN-I format) */
export type HfenString = string;
