// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/io/hsan-exporter.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Board } from '../types/board';
import { Move } from '../types/move';
import { generateLegalMoves, isInCheck, isCheckmate } from '../moves/index';

/**
 * Convert a move to HSAN (this SDK's algebraic notation — named distinctly
 * from standard chess's SAN, since piece letters/disambiguation/square range
 * all differ on this 12x12 board with Eagle/Hawk pieces).
 * Examples: e4, Nf3, Bxc5, O-O, e8=Q
 */
export function moveToHsan(board: Board, move: Move): string {
  // Handle castling. The king always ends on file 8 (kingside) or file 4
  // (queenside), regardless of its home square, so there's no need to know
  // where the king started to tell the sides apart.
  if (move.isCastling) {
    const toFile = move.to % 12;
    if (toFile === 8) return 'O-O';
    if (toFile === 4) return 'O-O-O';
  }

  let hsan = '';

  const piece = board.pieces[move.from];
  if (!piece) {
    return ''; // Invalid move
  }

  // Piece prefix (omit for pawns)
  if (piece.type !== 'P') {
    hsan += piece.type;
  }

  // Disambiguation (if needed)
  const legalMoves = generateLegalMoves(board);
  const samePieceMoves = legalMoves.filter(
    (m) =>
      board.pieces[m.from]?.type === piece.type &&
      m.to === move.to &&
      m.from !== move.from
  );

  if (samePieceMoves.length > 0) {
    // Need disambiguation
    const moveFromFile = move.from % 12;
    const moveFromRank = Math.floor(move.from / 12);

    // Check if file disambiguation is enough
    const fileConflicts = samePieceMoves.some((m) => (m.from % 12) === moveFromFile);

    if (fileConflicts) {
      // Use rank
      hsan += (moveFromRank + 1).toString();
    } else {
      // Use file
      hsan += String.fromCharCode('a'.charCodeAt(0) + moveFromFile);
    }
  }

  // Capture indicator
  if (board.pieces[move.to] || move.isEnPassant) {
    hsan += 'x';
  }

  // Destination square
  const toFile = String.fromCharCode('a'.charCodeAt(0) + (move.to % 12));
  const toRank = (Math.floor(move.to / 12) + 1).toString();
  hsan += toFile + toRank;

  // Promotion
  if (move.promotion) {
    hsan += '=' + move.promotion;
  }

  // Check/checkmate marker
  // Note: This requires making the move first to check the resulting position
  // For now, omit this for performance

  return hsan;
}
