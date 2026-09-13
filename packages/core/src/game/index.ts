// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/game/index.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { Game, GameStatus } from '../types/game.js';
import { createBoard } from '../board/create.js';
import { HfenString } from '../types/board.js';
import { addMoveToGame } from './add-move.js';

/**
 * Create a new game from optional starting HFEN
 */
export function createGame(hfen?: HfenString): Game {
  return {
    board: createBoard(hfen),
    moves: [],
    metadata: {},
    status: 'active',
    startHfen: hfen,
  };
}

/**
 * Add a move to the game (in algebraic or HSAN notation)
 * Returns new Game state or null if move is invalid
 */
export function addMove(game: Game, moveStr: string): Game | null {
  const result = addMoveToGame(game, moveStr);
  if (!result) return null;
  return { ...result, startHfen: game.startHfen };
}

/**
 * Remove the last move from the game
 * Reconstructs the game state from move list
 */
export function removeLastMove(game: Game): Game {
  if (game.moves.length === 0) {
    throw new Error('No moves to remove');
  }

  // Reconstruct from the game's actual starting position (not always the
  // default!) + all moves except the last.
  let reconstructedGame = createGame(game.startHfen);
  reconstructedGame.metadata = game.metadata;
  const movesToReplay = game.moves.slice(0, -1);

  for (const moveStr of movesToReplay) {
    const result = addMove(reconstructedGame, moveStr);
    if (!result) {
      throw new Error(`Failed to reconstruct game: invalid move ${moveStr}`);
    }
    reconstructedGame = result;
  }

  return reconstructedGame;
}

/**
 * Get current game status
 */
export function getGameStatus(game: Game): GameStatus {
  return game.status;
}
