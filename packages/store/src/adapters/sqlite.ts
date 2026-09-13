// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-store
// File: packages/store/src/adapters/sqlite.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { GameStore } from '../types/game-store';
import { GameRecord, GameQueryOptions, GameNotFoundError, Unsubscribe } from '../types/game-record';

/**
 * SQLite adapter for mobile and offline-first apps
 * Requires: npm install better-sqlite3
 *
 * Features:
 * - WAL mode for concurrent access
 * - Sync queue for offline-first architecture
 * - Automatic timestamp management
 * - Efficient local queries
 *
 * Schema is self-managing: the constructor runs `CREATE TABLE IF NOT EXISTS` for
 * a `games` table plus indexes on `user_id`, `created_at` and `synced`, so no
 * external migration step is needed. `players` and `metadata` are stored as JSON
 * text; timestamps are stored as ISO 8601 strings (not SQLite date types), which
 * is why lexicographic `ORDER BY created_at` sorts chronologically.
 *
 * Unlike the server-backed adapters this one treats `synced` as false by
 * default: rows written locally are pending until something drains
 * {@link SqliteGameStore.getSyncQueue} and calls
 * {@link SqliteGameStore.markSynced}.
 *
 * `better-sqlite3` is synchronous; the async signatures exist purely to satisfy
 * the {@link GameStore} contract and never actually yield.
 */
export class SqliteGameStore implements GameStore {
  private db: any; // better-sqlite3.Database
  private watchers: Map<string, Set<(game: GameRecord) => void>> = new Map();
  private pollIntervals: Map<string, any> = new Map();

  /**
   * Open (or create) the database file and ensure the schema exists.
   *
   * Sets `journal_mode = WAL` so readers don't block the writer, and
   * `synchronous = NORMAL`, which trades a small durability window on OS crash
   * for markedly faster writes — an acceptable bargain for a local cache whose
   * source of truth lives upstream.
   *
   * @param dbPath - Filesystem path to the database; `:memory:` is accepted for
   *   an ephemeral database.
   * @throws Error if the optional `better-sqlite3` package is not installed.
   */
  constructor(dbPath: string) {
    try {
      const Database = require('better-sqlite3');
      this.db = new Database(dbPath);

      // Enable WAL mode for better concurrent access
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');

      this.initSchema();
    } catch (error) {
      throw new Error('SQLite adapter requires "better-sqlite3" package: npm install better-sqlite3');
    }
  }

  /**
   * Create the `games` table and its lookup indexes if they are missing.
   * Idempotent, so it runs unconditionally on every open.
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        hpgn TEXT NOT NULL,
        hfen TEXT NOT NULL,
        players TEXT,
        metadata TEXT,
        result TEXT,
        user_id TEXT,
        synced BOOLEAN DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_user_id ON games(user_id);
      CREATE INDEX IF NOT EXISTS idx_created_at ON games(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_synced ON games(synced);
    `);
  }

  /**
   * Write a game with `INSERT OR REPLACE`.
   *
   * This is a whole-row replace, not a merge: columns absent from `game` are
   * reset rather than preserved. `updated_at` is stamped with the current time,
   * and `synced` defaults to 0 so the record enters the offline sync queue.
   *
   * @param game - Record to persist; a missing `id` is generated locally.
   * @returns The id the row was written under.
   */
  async saveGame(game: GameRecord): Promise<string> {
    const id = game.id || this.generateId();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO games (
        id, hpgn, hfen, players, metadata, result, user_id, synced, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      game.hpgn,
      game.hfen,
      game.players ? JSON.stringify(game.players) : null,
      game.metadata ? JSON.stringify(game.metadata) : null,
      game.result || null,
      game.userId || null,
      game.synced ?? 0, // Mark as unsynced by default
      game.createdAt || now,
      now
    );

    // Notify watchers
    const updated = await this.loadGame(id);
    this.watchers.get(id)?.forEach((cb) => cb(updated));

    return id;
  }

  /**
   * Fetch one row by primary key.
   *
   * @param id - Game id.
   * @returns The row mapped to {@link GameRecord} shape, with `synced` coerced
   *   from SQLite's integer boolean.
   * @throws {@link GameNotFoundError} if no row matches.
   */
  async loadGame(id: string): Promise<GameRecord> {
    const stmt = this.db.prepare('SELECT * FROM games WHERE id = ?');
    const row = stmt.get(id);

    if (!row) {
      throw new GameNotFoundError(id);
    }

    return this.rowToRecord(row);
  }

  /**
   * Delete a row and tear down its watcher, including the backing poll timer.
   *
   * @param id - Game id.
   * @throws {@link GameNotFoundError} if the statement changed no rows.
   */
  async deleteGame(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM games WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      throw new GameNotFoundError(id);
    }

    this.stopWatching(id);
  }

  /**
   * List games, filtering and paginating in SQL.
   *
   * Ordering is by `created_at` and defaults to descending. Filter values are
   * bound as parameters, never interpolated into the SQL text.
   *
   * @param options - `userId`/`result` filters, `sort` direction, `limit` and
   *   `offset`.
   * @returns Matching rows in the requested order.
   */
  async listGames(options?: GameQueryOptions): Promise<GameRecord[]> {
    let query = 'SELECT * FROM games WHERE 1=1';
    const params: any[] = [];

    if (options?.userId) {
      query += ' AND user_id = ?';
      params.push(options.userId);
    }

    if (options?.result) {
      query += ' AND result = ?';
      params.push(options.result);
    }

    query += ` ORDER BY created_at ${options?.sort === 'asc' ? 'ASC' : 'DESC'}`;

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    return rows.map((row: any) => this.rowToRecord(row));
  }

  /**
   * Count matching rows with `COUNT(*)`, ignoring `limit`/`offset`.
   *
   * @param options - Only `userId` and `result` are honoured.
   * @returns Total number of matching rows.
   */
  async countGames(options?: GameQueryOptions): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM games WHERE 1=1';
    const params: any[] = [];

    if (options?.userId) {
      query += ' AND user_id = ?';
      params.push(options.userId);
    }

    if (options?.result) {
      query += ' AND result = ?';
      params.push(options.result);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as any;

    return result.count;
  }

  /**
   * Observe a game by polling.
   *
   * SQLite has no change-notification channel, so the first watcher for an id
   * starts a 1s interval that re-reads the row and pushes it to every callback.
   * Consequences worth knowing: updates arrive with up to a second of latency,
   * the callback fires on every tick whether or not the row actually changed,
   * and if the row disappears the poll stops and all watchers for that id are
   * dropped without a final event.
   *
   * @param id - Game id to observe.
   * @param callback - Receives the current record on each poll.
   * @returns Unsubscribe handle; the interval is cleared once the last callback
   *   for the id is removed.
   */
  watch(id: string, callback: (game: GameRecord) => void): Unsubscribe {
    if (!this.watchers.has(id)) {
      this.watchers.set(id, new Set());

      // Start polling
      const interval = setInterval(async () => {
        try {
          const game = await this.loadGame(id);
          const callbacks = this.watchers.get(id);
          callbacks?.forEach((cb) => cb(game));
        } catch {
          // Game deleted or doesn't exist
          this.stopWatching(id);
        }
      }, 1000); // Poll every 1 second

      this.pollIntervals.set(id, interval);
    }

    this.watchers.get(id)!.add(callback);

    return () => {
      const callbacks = this.watchers.get(id);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.stopWatching(id);
        }
      }
    };
  }

  /**
   * Clear the poll interval for an id and forget its callbacks. Safe to call
   * for an id that is not being watched.
   */
  private stopWatching(id: string): void {
    const interval = this.pollIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(id);
    }
    this.watchers.delete(id);
  }

  /**
   * Probe the open database handle with `SELECT 1`.
   *
   * @returns `false` instead of throwing if the handle is closed or the file is
   *   unreadable.
   */
  async isHealthy(): Promise<boolean> {
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  // Offline-first sync management

  /**
   * Return the games still pending upload — every row with `synced = 0`.
   *
   * Intended to be drained on reconnect and pushed to a remote store, marking
   * each one with {@link SqliteGameStore.markSynced} as it lands.
   *
   * @returns Unsynced records, unordered.
   */
  async getSyncQueue(): Promise<GameRecord[]> {
    const stmt = this.db.prepare('SELECT * FROM games WHERE synced = 0');
    return stmt.all().map((row: any) => this.rowToRecord(row));
  }

  /**
   * Flag a single game as uploaded, refreshing its `updated_at`.
   *
   * A no-op if the id is unknown — this reports nothing and throws nothing, so
   * callers cannot use it to detect a missing row.
   *
   * @param id - Game id to mark.
   */
  async markSynced(id: string): Promise<void> {
    const stmt = this.db.prepare('UPDATE games SET synced = 1, updated_at = ? WHERE id = ?');
    stmt.run(new Date().toISOString(), id);
  }

  /**
   * Mark every pending game as synced in one statement, without uploading
   * anything. Use only when the queue is known to be reconciled — it discards
   * the record of what still needs pushing. `updated_at` is left alone here.
   */
  async clearSyncQueue(): Promise<void> {
    const stmt = this.db.prepare('UPDATE games SET synced = 1 WHERE synced = 0');
    stmt.run();
  }

  /**
   * Read every row, newest first, in one unpaginated query.
   *
   * @returns All stored games.
   */
  async exportAll(): Promise<GameRecord[]> {
    const stmt = this.db.prepare('SELECT * FROM games ORDER BY created_at DESC');
    return stmt.all().map((row: any) => this.rowToRecord(row));
  }

  /**
   * Write a batch of games one statement at a time.
   *
   * Not wrapped in a transaction, so a failure part-way leaves earlier rows
   * committed. Because it routes through `saveGame()`, imported rows land
   * unsynced unless the source record says otherwise.
   *
   * @param games - Records to import.
   * @returns How many were written successfully.
   */
  async importGames(games: GameRecord[]): Promise<number> {
    let count = 0;

    for (const game of games) {
      try {
        await this.saveGame(game);
        count++;
      } catch (error) {
        console.warn(`Failed to import game ${game.id}:`, error);
      }
    }

    return count;
  }

  /**
   * Delete every row and stop all polling watchers.
   *
   * The table and indexes survive; only the data is removed.
   *
   * @returns Number of rows deleted.
   */
  async clear(): Promise<number> {
    const stmt = this.db.prepare('DELETE FROM games');
    const result = stmt.run();
    this.watchers.clear();
    this.pollIntervals.forEach((interval) => clearInterval(interval));
    this.pollIntervals.clear();
    return result.changes;
  }

  /**
   * Map a snake_case row to a {@link GameRecord}, parsing the JSON text columns
   * and coercing SQLite's integer `synced` flag to a boolean. Timestamps pass
   * through unchanged because they are already stored as ISO 8601 strings.
   */
  private rowToRecord(row: any): GameRecord {
    return {
      id: row.id,
      hpgn: row.hpgn,
      hfen: row.hfen,
      players: row.players ? JSON.parse(row.players) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      result: row.result,
      userId: row.user_id,
      synced: !!row.synced,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private generateId(): string {
    return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Stop every poll timer and close the database handle.
   *
   * Required for the process to exit cleanly, since active `watch()` intervals
   * would otherwise keep the event loop alive. The store is unusable afterwards.
   */
  close(): void {
    this.pollIntervals.forEach((interval) => clearInterval(interval));
    this.pollIntervals.clear();
    this.watchers.clear();
    this.db.close();
  }
}
