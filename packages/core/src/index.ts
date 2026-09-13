// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/index.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

// Types
export { type Board, type CastlingRights, type BoardState, type HfenString } from './types/board';
export { type Color, type Square, type Move, type AlgebraicMove, type HsanMove, type PromotionPiece } from './types/move';
export { type Piece, type PieceType, type PiecePlacement, PIECE_SYMBOLS } from './types/piece';
export { type Game, type GameMetadata, type GameStatus, type GameResult, type GameInfo } from './types/game';

// Board operations
export { createBoard } from './board/create';
export { applyMove } from './board/move';
export { isLegalMove } from './board/validate';
export { undoMove } from './board/undo';
export { getBoardHfen } from './board/hfen';

// Move generation
export { generateLegalMoves, isInCheck, isCheckmate, isStalemate } from './moves/index';

// Game state
export { createGame, addMove, removeLastMove, getGameStatus } from './game/index';

// I/O & notation
export { parseHsanMove, moveToHsan } from './io/index';
