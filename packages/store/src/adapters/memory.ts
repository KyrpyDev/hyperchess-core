// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-store
// File: packages/store/src/adapters/memory.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { GameStore } from '../types/game-store';
import { GameRecord, GameQueryOptions, GameNotFoundError } from '../types/game-record';

/**
 * In-memory game store for testing and development.
 *
 * Backed by a plain `Map`, so all data is lost when the process exits. It is the
 * package default export and the reference implementation of {@link GameStore}:
 * every other adapter is expected to match its observable behaviour.
 *
 * Records are deep-copied with `structuredClone` on the way out (and into
 * watcher callbacks) so a caller mutating a returned object cannot corrupt the
 * store — a hazard the database adapters don't have because they deserialise
 * fresh rows on every read.
 */
export class MemoryGameStore implements GameStore {
  private games: Map<string, GameRecord> = new Map();
  private watchers: Map<string, Set<(game: GameRecord) => void>> = new Map();

  /**
   * Insert or replace a game, stamping `updatedAt` with the current time.
   *
   * The record fully replaces any existing entry rather than merging into it,
   * and watchers of this id are notified synchronously before returning.
   *
   * @param game - Record to store; if `id` is empty a new one is generated.
   * @returns The id the game was stored under.
   */
  async saveGame(game: GameRecord): Promise<string> {
    // Generate ID if not provided
    const id = game.id || this.generateId();
    const recordWithId = {
      ...game,
      id,
      updatedAt: new Date().toISOString(),
    };

    this.games.set(id, recordWithId);

    // Notify watchers
    this.notifyWatchers(id, recordWithId);

    return id;
  }

  /**
   * Fetch a game by id.
   *
   * @param id - Game id to look up.
   * @returns A deep copy of the stored record, safe for the caller to mutate.
   * @throws {@link GameNotFoundError} if no game is stored under `id`.
   */
  async loadGame(id: string): Promise<GameRecord> {
    const game = this.games.get(id);
    if (!game) {
      throw new GameNotFoundError(id);
    }
    return structuredClone(game); // Deep copy to prevent mutations
  }

  /**
   * Remove a game and drop every watcher registered against it.
   *
   * Watchers are discarded silently — they receive no final notification, so a
   * subscriber must treat "no further updates" as a possible deletion.
   *
   * @param id - Game id to remove.
   * @throws {@link GameNotFoundError} if no game is stored under `id`.
   */
  async deleteGame(id: string): Promise<void> {
    if (!this.games.has(id)) {
      throw new GameNotFoundError(id);
    }
    this.games.delete(id);

    // Notify watchers
    const watchers = this.watchers.get(id);
    if (watchers) {
      this.watchers.delete(id);
    }
  }

  /**
   * List games, filtering, sorting and paginating entirely in memory.
   *
   * Sorting is by `createdAt`, treating a missing timestamp as the epoch so
   * undated records sort oldest. Note the default order is ascending here,
   * whereas the SQL-backed adapters default to descending.
   *
   * @param options - Filters (`userId`, `result`), `sort` direction and
   *   `offset`/`limit` window; omitting `limit` returns everything after
   *   `offset`.
   * @returns Deep copies of the matching records.
   */
  async listGames(options?: GameQueryOptions): Promise<GameRecord[]> {
    let games = Array.from(this.games.values());

    // Filter by userId if provided
    if (options?.userId) {
      games = games.filter((g) => g.userId === options.userId);
    }

    // Filter by result if provided
    if (options?.result) {
      games = games.filter((g) => g.result === options.result);
    }

    // Sort by date
    const sortOrder = options?.sort === 'desc' ? -1 : 1;
    games.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return sortOrder * (dateA - dateB);
    });

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || games.length;
    games = games.slice(offset, offset + limit);

    return games.map((g) => structuredClone(g));
  }

  /**
   * Count games matching the filters.
   *
   * `limit` and `offset` are deliberately ignored so the result is the total
   * size of the match set, not the size of one page.
   *
   * @param options - Only `userId` and `result` are honoured.
   * @returns Number of matching records.
   */
  async countGames(options?: GameQueryOptions): Promise<number> {
    let games = Array.from(this.games.values());

    if (options?.userId) {
      games = games.filter((g) => g.userId === options.userId);
    }

    if (options?.result) {
      games = games.filter((g) => g.result === options.result);
    }

    return games.length;
  }

  /**
   * Subscribe to writes for a single game.
   *
   * Fires only on subsequent `saveGame()` calls — there is no initial emission
   * of the current value, and deletions produce no event.
   *
   * @param id - Game id to observe. Watching an id that does not exist yet is
   *   valid; the callback fires when it is first saved.
   * @param callback - Receives a deep copy of the saved record.
   * @returns Unsubscribe handle; the id's watcher set is dropped once empty.
   */
  watch(id: string, callback: (game: GameRecord) => void): () => void {
    if (!this.watchers.has(id)) {
      this.watchers.set(id, new Set());
    }

    this.watchers.get(id)!.add(callback);

    // Return unsubscribe function
    return () => {
      const watchers = this.watchers.get(id);
      if (watchers) {
        watchers.delete(callback);
        if (watchers.size === 0) {
          this.watchers.delete(id);
        }
      }
    };
  }

  /**
   * Always resolves `true` — there is no backend that can be unreachable.
   */
  async isHealthy(): Promise<boolean> {
    return true; // In-memory store is always healthy
  }

  /**
   * Dump every stored game, unfiltered and in insertion order.
   *
   * @returns Deep copies of all records.
   */
  async exportAll(): Promise<GameRecord[]> {
    return Array.from(this.games.values()).map((g) => structuredClone(g));
  }

  /**
   * Bulk-load records, overwriting any existing game with the same id.
   *
   * Each import goes through `saveGame()`, so `updatedAt` is rewritten to now
   * and watchers fire — importing a backup is not a silent restore.
   *
   * @param games - Records to load.
   * @returns The number of records supplied.
   */
  async importGames(games: GameRecord[]): Promise<number> {
    for (const game of games) {
      await this.saveGame(game);
    }
    return games.length;
  }

  /**
   * Drop every game and every registered watcher.
   *
   * @returns How many games were removed.
   */
  async clear(): Promise<number> {
    const count = this.games.size;
    this.games.clear();
    this.watchers.clear();
    return count;
  }

  private notifyWatchers(id: string, game: GameRecord): void {
    const watchers = this.watchers.get(id);
    if (watchers) {
      watchers.forEach((callback) => callback(structuredClone(game)));
    }
  }

  private generateId(): string {
    return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
