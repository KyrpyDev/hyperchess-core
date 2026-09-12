// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — @hyperchess/core
// File: packages/core/src/wasm/snapshot.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Board, CastlingRights } from '../types/board';
import { Color } from '../types/move';
import { Move, PromotionPiece } from '../types/move';
import { Piece, PieceType } from '../types/piece';
import { algebraicToSquare, squareToAlgebraic } from '../utils/square-notation';
import { parseHfenPosition } from '../board/hfen';

/**
 * The subset of `WasmBoard`'s instance API these helpers need, expressed as
 * a minimal structural interface rather than importing `@hyperchess/wasm`'s
 * own type. That keeps this module free of any dependency on a specific
 * wasm-pack target, so both `wasm/engine.ts` (the main, Node/bundler-backed
 * synchronous API) and `standalone.ts` (the no-bundler-browser async API)
 * can share it without either pulling in the other's WASM loading strategy.
 */
export interface WasmBoardLike {
  /** Pack the piece placement into one byte per square, where 0 means empty
   * and the remaining values encode colour and piece type. */
  encode(): Uint8Array;

  /** Render the position as a HFEN string, the source of the fields
   * (side to move, castling, en passant, clocks) that `encode()` omits. */
  hfen(): string;
}

/** Piece type in `WasmBoard.encode()`'s byte order (index 0 unused — 0 means empty). */
const ENCODE_PIECE_ORDER: PieceType[] = ['P', 'N', 'B', 'R', 'Q', 'K', 'E', 'H'];

function decodePieceByte(byte: number): Piece | undefined {
  if (byte === 0) return undefined;
  const color: Color = byte <= 8 ? 'white' : 'black';
  const type = ENCODE_PIECE_ORDER[(byte <= 8 ? byte : byte - 8) - 1];
  return { type, color };
}

function parseCastlingRights(castlingStr: string): CastlingRights {
  return {
    whiteKingSide: castlingStr.includes('K'),
    whiteQueenSide: castlingStr.includes('Q'),
    blackKingSide: castlingStr.includes('k'),
    blackQueenSide: castlingStr.includes('q'),
  };
}

/** Parse an en passant square (e.g. "e3", "-" for none) from a HFEN field. */
function parseEnPassant(enPassantStr: string): number {
  if (enPassantStr === '-') return -1;
  const match = enPassantStr.match(/^([a-l])(1[0-2]|[1-9])$/);
  if (!match) return -1;
  return algebraicToSquare(match[1] + match[2]);
}

/**
 * Build a plain-JS `Board` snapshot from a `WasmBoard`-like instance.
 *
 * `Board` stays a plain data object (not the opaque WASM handle) so existing
 * direct property access across the SDK (`board.pieces[i]`, `board.toMove`,
 * etc. — used throughout `@hyperchess/board`'s hooks and elsewhere) keeps
 * working unchanged. The HFEN's own metadata fields (side to move, castling,
 * en passant, clocks) are re-derived from `wasmBoard.hfen()` — the engine's
 * own canonical output — rather than trusting whatever HFEN the caller passed
 * in, so the snapshot always reflects what Rust actually parsed.
 */
export function snapshotFromWasmBoard(wasmBoard: WasmBoardLike, history: Board['history'] = []): Board {
  const hfen = wasmBoard.hfen();
  const hfenParts = hfen.split(' ');
  const [positionStr, toMoveStr, castlingStr, enPassantStr, halfmoveStr, fullmoveStr] = hfenParts;

  // Piece placement comes from `encode()` (one byte per square: colour +
  // current type), which is authoritative for *what* each piece is but knows
  // nothing about *which* piece it is. Identity is recovered from the
  // engine's own HFEN-I position field and merged in, so the snapshot — and
  // therefore everything `getBoardHfen` later re-serializes — keeps it.
  //
  // `encode()` stays the source of truth for type and colour; the parsed
  // position only contributes the identity character. That way a disagreement
  // between the two cannot change the position, and a legacy type-only HFEN
  // simply contributes no identity at all.
  const pieces = Array.from(wasmBoard.encode()).map(decodePieceByte);
  let identities: (Piece | undefined)[] | undefined;
  try {
    identities = parseHfenPosition(positionStr);
  } catch {
    // A position field the engine emitted but this parser cannot read is not
    // worth failing the snapshot over — the board is still correct, it just
    // carries no identity. (The Rust side is the canonical parser.)
    identities = undefined;
  }
  if (identities) {
    for (let sq = 0; sq < pieces.length; sq++) {
      const identity = identities[sq]?.identity;
      const piece = pieces[sq];
      if (piece && identity) {
        pieces[sq] = { ...piece, identity };
      }
    }
  }

  return {
    pieces,
    toMove: toMoveStr === 'w' ? 'white' : 'black',
    enPassantSquare: parseEnPassant(enPassantStr),
    castlingRights: parseCastlingRights(castlingStr),
    halfmoveClock: parseInt(halfmoveStr, 10),
    fullmoveNumber: parseInt(fullmoveStr || '1', 10),
    history,
  };
}

/**
 * Convert a structured `Move` to the UCI string `WasmBoard.apply_move`
 * expects (source + destination algebraic squares, plus a lowercase
 * promotion letter — matching `HyperMove::stringify()` in the Rust engine;
 * no `=` separator, unlike this SDK's own algebraic/HSAN notation).
 */
export function moveToUci(move: Move): string {
  const promo = move.promotion ? move.promotion.toLowerCase() : '';
  return `${squareToAlgebraic(move.from)}${squareToAlgebraic(move.to)}${promo}`;
}

/**
 * Parse a UCI move string (as returned by `WasmBoard.legal_moves()`) into a
 * structured `Move`, inferring `isCastling`/`isEnPassant` from board context
 * — the UCI string alone doesn't flag these (it's just src+dst+promo), so
 * they're derived the same way the old hand-written move generator did: a
 * king moving 2 files is always castling (its only 2-file move), and a pawn
 * capturing onto the recorded en passant square is always en passant.
 */
export function uciToMove(uci: string, board: Board): Move {
  const match = uci.match(/^([a-l](?:1[0-2]|[1-9]))([a-l](?:1[0-2]|[1-9]))([qrbneh])?$/);
  if (!match) {
    throw new Error(`Invalid UCI move string: ${uci}`);
  }

  const from = algebraicToSquare(match[1]);
  const to = algebraicToSquare(match[2]);
  const promotion = match[3] ? (match[3].toUpperCase() as PromotionPiece) : undefined;

  const piece = board.pieces[from];
  const move: Move = { from, to, promotion };

  if (piece?.type === 'K' && Math.abs((from % 12) - (to % 12)) === 2) {
    move.isCastling = true;
  }
  if (piece?.type === 'P' && to === board.enPassantSquare && board.pieces[to] === undefined) {
    move.isEnPassant = true;
  }

  return move;
}
