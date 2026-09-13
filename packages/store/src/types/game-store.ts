// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-store
// File: packages/store/src/types/game-store.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { GameRecord, GameQueryOptions, Unsubscribe } from './game-record';

/**
 * Universal game storage interface
 * Implementations: PostgreSQL, SQLite, Firebase, Supabase, Memory
 *
 * All methods are async for compatibility with remote backends
 */
export interface GameStore {
  /**
   * Save a new game or update existing
   * @param game Game record to save
   * @returns ID of saved game (auto-generated if not provided)
   */
  saveGame(game: GameRecord): Promise<string>;

  /**
   * Load a game by ID
   * @param id Game ID
   * @returns Game record or throws GameNotFoundError
   */
  loadGame(id: string): Promise<GameRecord>;

  /**
   * Delete a game
   * @param id Game ID
   */
  deleteGame(id: string): Promise<void>;

  /**
   * List games (optionally filtered)
   * @param options Query options
   * @returns Array of game records
   */
  listGames(options?: GameQueryOptions): Promise<GameRecord[]>;

  /**
   * Count games (optionally filtered)
   * @param options Query options (omit limit/offset for count)
   * @returns Total count
   */
  countGames(options?: GameQueryOptions): Promise<number>;

  /**
   * Watch a game for real-time updates
   * @param id Game ID
   * @param callback Called when game changes
   * @returns Unsubscribe function
   */
  watch(id: string, callback: (game: GameRecord) => void): Unsubscribe;

  /**
   * Health check - verify backend is accessible
   * @returns true if backend is operational
   */
  isHealthy(): Promise<boolean>;

  /**
   * Export all games (useful for backups)
   * @returns Array of all games
   */
  exportAll?(): Promise<GameRecord[]>;

  /**
   * Import games from backup
   * @param games Array of games to import
   * @returns Number of imported games
   */
  importGames?(games: GameRecord[]): Promise<number>;

  /**
   * Clear all games (dangerous!)
   * @returns Number of games deleted
   */
  clear?(): Promise<number>;
}

/**
 * Check if a game store is reachable, without letting a backend failure escape.
 *
 * Wraps `isHealthy()` so that a driver-level throw (connection refused, expired
 * credentials) reads as "offline" rather than crashing the caller — the intended
 * use is an availability probe on a sync path, not error reporting.
 *
 * @param store - Store to probe.
 * @returns `true` only if `isHealthy()` resolved `true`; `false` if it resolved
 *   `false` or threw.
 */
export async function isStoreOnline(store: GameStore): Promise<boolean> {
  try {
    return await store.isHealthy();
  } catch {
    return false;
  }
}

/**
 * Copy games from one store into another, one record at a time.
 *
 * Best-effort and non-transactional: a game that fails to save is logged and
 * skipped so a single bad record cannot abort the whole sync, which matters when
 * draining an offline queue on reconnect. Records are not deleted from the
 * source, so this is a copy rather than a move.
 *
 * @param fromStore - Source of truth to read from.
 * @param toStore - Destination the games are written into.
 * @param options - `userId` restricts the copy to one owner's games;
 *   `overwrite` deletes the destination record first so the source version wins
 *   outright instead of being merged by the destination's upsert semantics.
 * @returns How many games were saved successfully — may be fewer than the number
 *   read from the source.
 */
export async function syncStores(
  fromStore: GameStore,
  toStore: GameStore,
  options?: { userId?: string; overwrite?: boolean }
): Promise<number> {
  const games = await fromStore.listGames({
    userId: options?.userId,
  });

  let syncedCount = 0;

  for (const game of games) {
    try {
      if (options?.overwrite) {
        // Delete if exists, then save
        try {
          await toStore.deleteGame(game.id);
        } catch {
          // Game doesn't exist in target, that's ok
        }
      }

      await toStore.saveGame(game);
      syncedCount++;
    } catch (error) {
      console.warn(`Failed to sync game ${game.id}:`, error);
    }
  }

  return syncedCount;
}
