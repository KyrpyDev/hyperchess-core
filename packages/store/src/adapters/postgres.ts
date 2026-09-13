// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-store
// File: packages/store/src/adapters/postgres.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { GameStore } from '../types/game-store.js';
import { GameRecord, GameQueryOptions, GameNotFoundError, Unsubscribe } from '../types/game-record.js';

/**
 * PostgreSQL adapter for production game storage
 * Requires: npm install pg
 *
 * Features:
 * - Connection pooling
 * - LISTEN/NOTIFY for real-time updates
 * - Full-text search ready
 * - Automatic timestamp management
 *
 * Schema assumption: a `games` table must already exist — unlike the SQLite
 * adapter this one never runs DDL, so migrations are the deployment's job. Its
 * columns are `id` (primary key), `hpgn`, `hfen`, `players`, `metadata`,
 * `result`, `user_id`, `synced`, `created_at`, `updated_at`. `players` and
 * `metadata` are written as JSON strings and read back with `JSON.parse`, so
 * they must be `text`/`json` rather than `jsonb` (a `jsonb` column would be
 * returned pre-parsed by `pg` and fail to parse again). The timestamp columns
 * are read as `Date` objects and converted to ISO strings.
 *
 * Real-time updates rely on a database-side trigger publishing
 * `NOTIFY game_updates` with a `{ id, game }` JSON payload; without that trigger
 * `watch()` still fires locally for writes made through this instance.
 */
export class PostgresGameStore implements GameStore {
  private pool: any; // pg.Pool
  private listeners: Map<string, Set<(game: GameRecord) => void>> = new Map();
  private client: any; // For LISTEN/NOTIFY

  /**
   * Open a connection pool and begin listening for `game_updates` notifications.
   *
   * The pool is capped at 20 connections with a 2s connect timeout and 30s idle
   * timeout. One extra connection is checked out and held for the lifetime of
   * the store to service `LISTEN`; call {@link PostgresGameStore.close} to give
   * it back.
   *
   * @param connectionString - Standard `postgres://` DSN passed to `pg.Pool`.
   * @throws Error if the optional `pg` package is not installed.
   */
  constructor(connectionString: string) {
    // Dynamic import to make pg optional
    try {
      const { Pool } = require('pg');
      this.pool = new Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Setup LISTEN for notifications
      this.setupNotifications();
    } catch (error) {
      throw new Error('PostgreSQL adapter requires "pg" package: npm install pg');
    }
  }

  /**
   * Dedicate a pooled client to `LISTEN game_updates` and fan payloads out to
   * local watchers. Failures are logged rather than thrown so a database without
   * the notification trigger still yields a usable store.
   */
  private async setupNotifications(): Promise<void> {
    try {
      this.client = await this.pool.connect();
      await this.client.query('LISTEN game_updates');

      this.client.on('notification', (msg: any) => {
        try {
          const payload = JSON.parse(msg.payload);
          const callbacks = this.listeners.get(payload.id);
          if (callbacks) {
            callbacks.forEach((cb) => cb(payload.game));
          }
        } catch (error) {
          console.warn('Failed to parse notification:', error);
        }
      });
    } catch (error) {
      console.warn('Failed to setup notifications:', error);
    }
  }

  /**
   * Upsert a game via `INSERT ... ON CONFLICT (id) DO UPDATE`.
   *
   * `updated_at` is always set to now. `created_at` is only meaningful on the
   * insert path — the conflict branch deliberately leaves it untouched so the
   * original creation time survives edits. `synced` defaults to `true` here,
   * the opposite of the SQLite adapter, because a successful write to the
   * central database *is* the synced state.
   *
   * @param game - Record to persist; a missing `id` is generated locally.
   * @returns The id reported back by the `RETURNING` clause.
   */
  async saveGame(game: GameRecord): Promise<string> {
    const id = game.id || this.generateId();
    const now = new Date().toISOString();

    const query = `
      INSERT INTO games (
        id, hpgn, hfen, players, metadata, result, user_id, synced, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        hpgn = $2, hfen = $3, players = $4, metadata = $5,
        result = $6, synced = $8, updated_at = $10
      RETURNING id
    `;

    const result = await this.pool.query(query, [
      id,
      game.hpgn,
      game.hfen,
      game.players ? JSON.stringify(game.players) : null,
      game.metadata ? JSON.stringify(game.metadata) : null,
      game.result || null,
      game.userId || null,
      game.synced ?? true,
      game.createdAt || now,
      now,
    ]);

    // Notify listeners
    if (this.listeners.has(id)) {
      const updated = await this.loadGame(id);
      this.listeners.get(id)?.forEach((cb) => cb(updated));
    }

    return result.rows[0].id;
  }

  /**
   * Fetch one row by primary key.
   *
   * @param id - Game id.
   * @returns The row mapped back to camelCase {@link GameRecord} shape.
   * @throws {@link GameNotFoundError} if the query returns no rows.
   */
  async loadGame(id: string): Promise<GameRecord> {
    const result = await this.pool.query('SELECT * FROM games WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      throw new GameNotFoundError(id);
    }

    return this.rowToRecord(result.rows[0]);
  }

  /**
   * Delete one row and forget any watchers registered for it.
   *
   * @param id - Game id.
   * @throws {@link GameNotFoundError} if the `DELETE` affected no rows.
   */
  async deleteGame(id: string): Promise<void> {
    const result = await this.pool.query('DELETE FROM games WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      throw new GameNotFoundError(id);
    }

    this.listeners.delete(id);
  }

  /**
   * List games with SQL-side filtering, ordering and pagination.
   *
   * Filters are appended as parameterised predicates, never string-interpolated.
   * Ordering is by `created_at` and defaults to descending — the reverse of the
   * memory adapter's default.
   *
   * @param options - `userId`/`result` filters, `sort` direction, `limit` and
   *   `offset`. An `offset` without a `limit` is passed through to Postgres,
   *   which permits it.
   * @returns Matching rows in the requested order.
   */
  async listGames(options?: GameQueryOptions): Promise<GameRecord[]> {
    let query = 'SELECT * FROM games WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (options?.userId) {
      query += ` AND user_id = $${paramCount}`;
      params.push(options.userId);
      paramCount++;
    }

    if (options?.result) {
      query += ` AND result = $${paramCount}`;
      params.push(options.result);
      paramCount++;
    }

    query += ` ORDER BY created_at ${options?.sort === 'asc' ? 'ASC' : 'DESC'}`;

    if (options?.limit) {
      query += ` LIMIT $${paramCount}`;
      params.push(options.limit);
      paramCount++;
    }

    if (options?.offset) {
      query += ` OFFSET $${paramCount}`;
      params.push(options.offset);
    }

    const result = await this.pool.query(query, params);
    return result.rows.map((row: any) => this.rowToRecord(row));
  }

  /**
   * Count matching rows with `COUNT(*)`, ignoring `limit`/`offset`.
   *
   * Postgres returns `count` as a bigint string, so the result is parsed to a
   * number before being handed back.
   *
   * @param options - Only `userId` and `result` are honoured.
   * @returns Total number of matching rows.
   */
  async countGames(options?: GameQueryOptions): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM games WHERE 1=1';
    const params: any[] = [];

    if (options?.userId) {
      query += ` AND user_id = $1`;
      params.push(options.userId);
    }

    if (options?.result) {
      query += ` AND result = $${params.length + 1}`;
      params.push(options.result);
    }

    const result = await this.pool.query(query, params);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Subscribe to changes for one game.
   *
   * Two paths feed the callback: writes made through this instance notify
   * directly, and writes made by other processes arrive over the `game_updates`
   * `LISTEN` channel — the latter only if the database publishes them. Watching
   * is purely local bookkeeping and issues no query, so it is cheap.
   *
   * @param id - Game id to observe.
   * @param callback - Receives the updated record.
   * @returns Unsubscribe handle.
   */
  watch(id: string, callback: (game: GameRecord) => void): Unsubscribe {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, new Set());
    }

    this.listeners.get(id)!.add(callback);

    return () => {
      const callbacks = this.listeners.get(id);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.listeners.delete(id);
        }
      }
    };
  }

  /**
   * Probe the pool with `SELECT 1`.
   *
   * Confirms connectivity only — it does not verify that the `games` table
   * exists or is readable.
   *
   * @returns `false` instead of throwing if the query fails.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read every row, newest first, in a single unpaginated query.
   *
   * Materialises the whole table in memory — fine for backups, unsuitable for
   * very large datasets.
   *
   * @returns All stored games.
   */
  async exportAll(): Promise<GameRecord[]> {
    const result = await this.pool.query('SELECT * FROM games ORDER BY created_at DESC');
    return result.rows.map((row: any) => this.rowToRecord(row));
  }

  /**
   * Upsert a batch of games one statement at a time.
   *
   * Not wrapped in a transaction: a row that fails is logged and skipped, so a
   * partial import is a possible outcome.
   *
   * @param games - Records to import.
   * @returns How many were saved successfully.
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
   * Delete every row in the `games` table and drop all local watchers.
   *
   * @returns Number of rows deleted.
   */
  async clear(): Promise<number> {
    const result = await this.pool.query('DELETE FROM games');
    this.listeners.clear();
    return result.rowCount;
  }

  /**
   * Map a snake_case database row to a {@link GameRecord}, parsing the JSON
   * columns and rendering `timestamptz` values as ISO 8601 strings.
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
      synced: row.synced,
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
    };
  }

  private generateId(): string {
    return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Release the `LISTEN` client and drain the pool.
   *
   * Must be called for the process to exit cleanly — the held notification
   * client keeps an open socket that would otherwise pin the event loop. The
   * store is unusable afterwards.
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.release();
    }
    await this.pool.end();
  }
}
