// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/types/move.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

/** Color/side in the game */
export type Color = 'white' | 'black';

/** Square coordinate (0-143 for 12x12 board) */
export type Square = number;

/** Promotion piece type */
export type PromotionPiece = 'Q' | 'R' | 'B' | 'N' | 'E' | 'H';

/** Represents a single move */
export interface Move {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
  isEnPassant?: boolean;
  isCastling?: boolean;
}

/** Move in algebraic notation (e.g., "e2e4", "a7a8=Q") */
export type AlgebraicMove = string;

/**
 * Move in HSAN — this SDK's algebraic notation (e.g., "e4", "Nxf3"). Named
 * distinctly from standard chess's SAN since disambiguation, piece letters,
 * and square range all differ on this 12x12 board with Eagle/Hawk pieces —
 * "SAN" on its own would misleadingly imply plain standard-chess notation.
 */
export type HsanMove = string;
