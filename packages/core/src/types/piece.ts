// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/types/piece.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Color } from './move';

/** Piece type (side-agnostic) */
export type PieceType = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'E' | 'H';

/** Represents a piece on the board */
export interface Piece {
  type: PieceType;
  color: Color;

  /**
   * The piece's stable HFEN-I identity character, when known.
   *
   * Identity is *which individual piece* this is — the pawn that started on
   * a3 stays `M` for the whole game, including after it promotes. It is
   * metadata: it never affects legality or move generation.
   *
   * Optional because a board built from a legacy, type-only HFEN has no
   * identity to carry. When it IS present, `getBoardHfen` round-trips it, so
   * the SDK stops silently discarding identity every time it re-serializes a
   * position for the engine.
   */
  identity?: string;
}

/** Piece position on board */
export interface PiecePlacement {
  piece: Piece;
  square: number; // 0-143
}

/** Piece symbols for display */
export const PIECE_SYMBOLS = {
  white: {
    P: '♙',
    N: '♘',
    B: '♗',
    R: '♖',
    Q: '♕',
    K: '♔',
    E: '🦅',
    H: '🦅',
  },
  black: {
    P: '♟',
    N: '♞',
    B: '♝',
    R: '♜',
    Q: '♛',
    K: '♚',
    E: '🦅',
    H: '🦅',
  },
};
