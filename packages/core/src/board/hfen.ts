// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — @hyperchess/core
// File: packages/core/src/board/hfen.ts
// Version: 2.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Board } from '../types/board';
import { Color } from '../types/move';
import { Piece, PieceType } from '../types/piece';

/**
 * HFEN-I identity character → the piece type that identity *starts* as.
 *
 * Mirrors `piece_from_identity` in `crates/hyperchess-rules/src/core/
 * piece_identity.rs`; the two must agree. Note that the identity alphabet and
 * the type alphabet overlap while meaning different things: as an identity,
 * `Q` is the white pawn from f3 and `K` the white hawk from k2.
 */
const IDENTITY_START_TYPE: Record<string, PieceType> = {
  A: 'E', B: 'H', C: 'R', D: 'N', E: 'B', F: 'Q', G: 'K', H: 'B', I: 'N', J: 'R', K: 'H', L: 'E',
  M: 'P', N: 'P', O: 'P', P: 'P', Q: 'P', R: 'P', S: 'P', T: 'P', U: 'P', V: 'P', W: 'P', X: 'P',
};

/** Type letters legal in the right half of an inline `id:Type` pair. */
const PROMOTION_TYPES = 'QRBNEH';

/** The starting type of an identity character, or `undefined` if it is not one. */
export function identityStartType(identity: string): PieceType | undefined {
  return IDENTITY_START_TYPE[identity.toUpperCase()];
}

/** True when `c` is a legal HFEN-I identity character (`A`-`X` / `a`-`x`). */
export function isIdentityChar(c: string): boolean {
  return c.length === 1 && IDENTITY_START_TYPE[c.toUpperCase()] !== undefined;
}

/**
 * Parse the position field of a HFEN/HFEN-I string into 144 squares.
 *
 * Index 0 is a1 and index 143 is l12, matching `Board.pieces`. Ranks in the
 * string run 12 first down to 1 last.
 *
 * Handles the three token shapes the format allows, and nothing else:
 * an inline `id:Type` pair (ONE square), a single piece/identity character,
 * and a multi-digit empty-square run. Multi-digit runs matter — `12` is one
 * fully empty rank, not two squares.
 *
 * Throws on a malformed field rather than returning a partly-filled board:
 * a position that cannot be read is an error, never a default.
 */
export function parseHfenPosition(position: string): (Piece | undefined)[] {
  const squares: (Piece | undefined)[] = new Array(144).fill(undefined);
  const ranks = position.split('/');
  if (ranks.length !== 12) {
    throw new Error(`HFEN position needs 12 ranks, got ${ranks.length}`);
  }

  // Identity mode is on when any character is identity-only — i.e. an
  // identity letter that is not also a legacy type letter. This mirrors
  // `position_uses_identity` in the Rust engine.
  const identityMode = /[ACDFGIJLMOSTUVWXacdfgijlmostuvwx]/.test(position);

  ranks.forEach((rankStr, rankFromTop) => {
    const rank = 11 - rankFromTop;
    let file = 0;
    const tokens = rankStr.match(/[A-Za-z]:[A-Za-z]|[A-Za-z]|\d+/g) ?? [];

    // A rank whose characters did not all get consumed is malformed.
    if (tokens.join('') !== rankStr) {
      throw new Error(`Malformed HFEN rank ${rank + 1}: ${rankStr}`);
    }

    for (const token of tokens) {
      if (/^\d+$/.test(token)) {
        file += parseInt(token, 10);
        continue;
      }
      if (file >= 12) {
        throw new Error(`Too many squares on HFEN rank ${rank + 1}`);
      }

      let identity: string | undefined;
      let typeChar: string;

      if (token.length === 3) {
        identity = token[0];
        typeChar = token[2];
        if (!PROMOTION_TYPES.includes(typeChar.toUpperCase())) {
          throw new Error(
            `Invalid \`id:Type\` type letter '${typeChar}' in ${token}: the type half must be ` +
              `one of ${PROMOTION_TYPES.split('').join(' ')}`
          );
        }
        const identityIsWhite = identity === identity.toUpperCase();
        const typeIsWhite = typeChar === typeChar.toUpperCase();
        if (identityIsWhite !== typeIsWhite) {
          throw new Error(`Type override ${token} changes piece color`);
        }
      } else if (identityMode && isIdentityChar(token)) {
        identity = token;
        typeChar = token;
      } else {
        typeChar = token;
      }

      const color: Color = typeChar === typeChar.toUpperCase() ? 'white' : 'black';
      const type =
        token.length === 3 || !identity
          ? (typeChar.toUpperCase() as PieceType)
          : (identityStartType(identity) as PieceType);

      if (!type) {
        throw new Error(`Invalid HFEN piece character: ${token}`);
      }

      squares[rank * 12 + file] = identity ? { type, color, identity } : { type, color };
      file += 1;
    }

    if (file !== 12) {
      throw new Error(`HFEN rank ${rank + 1} has ${file} squares, expected 12`);
    }
  });

  return squares;
}

/**
 * Serialize one square for the position field.
 *
 * A piece carrying identity writes its identity letter alone when that letter
 * already parses back to the piece's current type, and an inline `id:Type`
 * pair when it does not — which in practice means after a promotion. This is
 * what keeps the string self-contained: both *which* piece it is and *what*
 * it currently is live inside the position field, with no side table.
 */
function serializeSquare(piece: Piece): string {
  const typeChar = piece.color === 'white' ? piece.type : piece.type.toLowerCase();

  if (!piece.identity) {
    return typeChar;
  }
  if (identityStartType(piece.identity) === piece.type) {
    return piece.identity;
  }
  return `${piece.identity}:${typeChar}`;
}

/**
 * Export a board to HFEN-I notation.
 *
 * Identity-preserving whenever the board carries identity. This function is
 * fed straight back into the engine by `generateLegalMoves`, `applyMove` and
 * friends, so a type-only implementation here silently erased piece identity
 * on every single move the SDK made.
 */
export function getBoardHfen(board: Board): string {
  // Piece placement. Standard FEN convention: highest rank first, so we walk
  // rank indices 11 → 0 — within each rank, files still run 0 → 11.
  const rankSegments: string[] = [];

  for (let rank = 11; rank >= 0; rank--) {
    let segment = '';
    let emptyCount = 0;

    for (let file = 0; file < 12; file++) {
      const piece = board.pieces[rank * 12 + file];
      if (!piece) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          segment += emptyCount;
          emptyCount = 0;
        }
        segment += serializeSquare(piece);
      }
    }

    if (emptyCount > 0) segment += emptyCount;
    rankSegments.push(segment);
  }

  let hfen = rankSegments.join('/');

  // Side to move
  hfen += ` ${board.toMove === 'white' ? 'w' : 'b'}`;

  // Castling rights
  const castling =
    (board.castlingRights.whiteKingSide ? 'K' : '') +
    (board.castlingRights.whiteQueenSide ? 'Q' : '') +
    (board.castlingRights.blackKingSide ? 'k' : '') +
    (board.castlingRights.blackQueenSide ? 'q' : '');
  hfen += ` ${castling || '-'}`;

  // En passant
  if (board.enPassantSquare === -1) {
    hfen += ' -';
  } else {
    const col = String.fromCharCode('a'.charCodeAt(0) + (board.enPassantSquare % 12));
    const row = Math.floor(board.enPassantSquare / 12) + 1;
    hfen += ` ${col}${row}`;
  }

  // Halfmove clock
  hfen += ` ${board.halfmoveClock}`;

  // Fullmove number
  hfen += ` ${board.fullmoveNumber}`;

  return hfen;
}
