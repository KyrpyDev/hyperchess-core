// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/index.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

// Types
export { type Board, type CastlingRights, type BoardState, type HfenString } from './types/board.js';
export { type Color, type Square, type Move, type AlgebraicMove, type HsanMove, type PromotionPiece } from './types/move.js';
export { type Piece, type PieceType, type PiecePlacement, PIECE_SYMBOLS } from './types/piece.js';
export { type Game, type GameMetadata, type GameStatus, type GameResult, type GameInfo } from './types/game.js';

// Board operations
export { createBoard } from './board/create.js';
export { applyMove } from './board/move.js';
export { isLegalMove } from './board/validate.js';
export { undoMove } from './board/undo.js';
export { getBoardHfen } from './board/hfen.js';

// Move generation
export { generateLegalMoves, isInCheck, isCheckmate, isStalemate } from './moves/index.js';

// Game state
export { createGame, addMove, removeLastMove, getGameStatus } from './game/index.js';

// I/O & notation
export { parseHsanMove, moveToHsan } from './io/index.js';
