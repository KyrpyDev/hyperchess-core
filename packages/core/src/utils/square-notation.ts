// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/utils/square-notation.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

/** A file letter (a-l) followed by a rank of 1-12 (10-12 are two digits). */
export const SQUARE_TOKEN = '[a-l](?:1[0-2]|[1-9])';

/** Convert an algebraic square (e.g. "e4", "a12") to a square index (0-143). */
export function algebraicToSquare(algebraic: string): number {
  const file = algebraic.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(algebraic.slice(1), 10) - 1;
  return rank * 12 + file;
}

/**
 * Convert a square index to algebraic notation (e.g. 0 → "a1", 131 → "l11").
 *
 * Ranks 10-12 are two digits on this 12x12 board — building the rank via
 * char-code arithmetic (as if it were always a single digit) silently
 * produces non-digit garbage for those ranks; plain integer math + string
 * concatenation is required instead.
 */
export function squareToAlgebraic(square: number): string {
  const file = String.fromCharCode('a'.charCodeAt(0) + (square % 12));
  const rank = Math.floor(square / 12) + 1;
  return `${file}${rank}`;
}
