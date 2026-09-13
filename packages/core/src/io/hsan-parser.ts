// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/io/hsan-parser.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Board } from '../types/board';
import { Move } from '../types/move';
import { generateLegalMoves } from '../moves/index';

/**
 * Parse an HSAN move (this SDK's algebraic notation — named distinctly from
 * standard chess's SAN, since piece letters/disambiguation/square range all
 * differ on this 12x12 board with Eagle/Hawk pieces).
 * Examples: e4, Nf3, Bxc5, O-O (castling), e8=Q
 *
 * Returns Move object or null if invalid
 */
export function parseHsanMove(board: Board, hsanStr: string): Move | null {
  let hsan = hsanStr.trim();

  // Handle castling
  if (hsan === 'O-O' || hsan === '0-0') {
    return parseKingSideCastling(board);
  }
  if (hsan === 'O-O-O' || hsan === '0-0-0') {
    return parseQueenSideCastling(board);
  }

  // Strip trailing check/checkmate marker.
  hsan = hsan.replace(/[+#]$/, '');

  // Strip trailing promotion suffix (=Q, =E, ...).
  let promotion = '';
  const promoMatch = hsan.match(/=([QRBNEH])$/);
  if (promoMatch) {
    promotion = promoMatch[1];
    hsan = hsan.slice(0, -promoMatch[0].length);
  }

  // The destination square is always at the tail: a file letter followed by
  // a rank of 1-12 (this is a 12x12 board, so ranks 10-12 are two digits —
  // parsing left-to-right with a single-digit rank regex would silently
  // truncate "e10" to "e1"; anchoring on the end avoids that ambiguity).
  const destMatch = hsan.match(/([a-l])(1[0-2]|[1-9])$/);
  if (!destMatch) {
    return null;
  }

  const toFile = destMatch[1].charCodeAt(0) - 'a'.charCodeAt(0);
  const toRank = parseInt(destMatch[2], 10) - 1;
  const toSquare = toRank * 12 + toFile;
  hsan = hsan.slice(0, -destMatch[0].length);

  // Piece indicator (optional, pawn if missing) — always leads.
  let piece = '';
  if (hsan.length && /[PNBRQKEH]/.test(hsan[0])) {
    piece = hsan[0];
    hsan = hsan.slice(1);
  }

  // Capture indicator — always immediately precedes the destination.
  if (hsan.endsWith('x')) {
    hsan = hsan.slice(0, -1);
  }

  // Whatever remains is disambiguation: an optional source file letter
  // followed by an optional source rank (1-12).
  let srcFile = -1;
  let srcRank = -1;
  const disMatch = hsan.match(/^([a-l])?(1[0-2]|[1-9])?$/);
  if (hsan.length && !disMatch) {
    return null; // malformed leftover text
  }
  if (disMatch) {
    if (disMatch[1]) srcFile = disMatch[1].charCodeAt(0) - 'a'.charCodeAt(0);
    if (disMatch[2]) srcRank = parseInt(disMatch[2], 10) - 1;
  }

  if (toFile < 0 || toFile >= 12 || toRank < 0 || toRank >= 12) {
    return null;
  }

  // Find matching legal move
  const legalMoves = generateLegalMoves(board);

  for (const move of legalMoves) {
    if (move.to !== toSquare) continue;

    const sourcePiece = board.pieces[move.from];
    if (!sourcePiece || sourcePiece.color !== board.toMove) continue;

    // Check piece type matches (pawn if no piece specified)
    const expectedPiece = piece || 'P';
    if (sourcePiece.type !== expectedPiece) continue;

    // Check disambiguation if specified
    const moveFromRank = Math.floor(move.from / 12);
    const moveFromFile = move.from % 12;

    if (srcFile >= 0 && moveFromFile !== srcFile) continue;
    if (srcRank >= 0 && moveFromRank !== srcRank) continue;

    // Check promotion if specified
    if (promotion && move.promotion !== promotion) continue;

    return move;
  }

  return null; // No matching move found
}

/**
 * Parse king-side castling (O-O).
 *
 * The king always ends on file 8 for kingside castling (this board's king
 * starts on the g-file/file 6, not e-file, so the destination isn't the
 * standard-chess g-file either). Matching on the destination file rather
 * than hardcoded absolute squares keeps this correct for both colors
 * without re-deriving the king's home square here.
 */
function parseKingSideCastling(board: Board): Move | null {
  const legalMoves = generateLegalMoves(board);
  return legalMoves.find((move) => move.isCastling && move.to % 12 === 8) ?? null;
}

/**
 * Parse queen-side castling (O-O-O). The king always ends on file 4.
 */
function parseQueenSideCastling(board: Board): Move | null {
  const legalMoves = generateLegalMoves(board);
  return legalMoves.find((move) => move.isCastling && move.to % 12 === 4) ?? null;
}
