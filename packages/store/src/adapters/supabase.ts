// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-store
// File: packages/store/src/adapters/supabase.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { GameStore } from '../types/game-store.js';
import { GameRecord, GameQueryOptions, GameNotFoundError, Unsubscribe } from '../types/game-record.js';

/**
 * Supabase adapter - PostgreSQL + Realtime + Auth
 * Requires: npm install @supabase/supabase-js
 *
 * Features:
 * - Realtime subscriptions via postgres_changes
 * - Row Level Security aware (games scoped to authenticated user)
 * - Range-based pagination
 *
 * Schema assumption: a `public.games` table exposed through PostgREST with
 * columns `id` (primary key), `hpgn`, `hfen`, `players`, `metadata`, `result`,
 * `user_id`, `synced`, `created_at`, `updated_at`. `players` and `metadata` are
 * sent as objects and read back as objects, so those columns must be `json`/
 * `jsonb` — the opposite of the raw Postgres adapter, which round-trips them as
 * JSON strings.
 *
 * Because every call goes through PostgREST, Row Level Security applies: what a
 * query returns depends on the key the client was built with. Under RLS a
 * "missing" row and a forbidden one are indistinguishable, so
 * {@link GameNotFoundError} can also mean "not visible to you". Realtime
 * subscriptions likewise require the `games` table to be in the realtime
 * publication.
 *
 * Errors from the client are surfaced as plain `Error`s carrying the PostgREST
 * message rather than being swallowed — only `isHealthy()` degrades quietly.
 */
export class SupabaseGameStore implements GameStore {
  private client: any; // SupabaseClient
  private channels: Map<string, any> = new Map();

  /**
   * Create the underlying Supabase client.
   *
   * The key determines the store's effective permissions: an anon key leaves RLS
   * in force (games scoped to the signed-in user), a service-role key bypasses
   * it entirely and must never reach a browser.
   *
   * @param supabaseUrl - Project URL, e.g. `https://<ref>.supabase.co`.
   * @param supabaseKey - Anon or service-role API key.
   * @throws Error if the optional `@supabase/supabase-js` package is not
   *   installed.
   */
  constructor(supabaseUrl: string, supabaseKey: string) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      this.client = createClient(supabaseUrl, supabaseKey);
    } catch (error) {
      throw new Error(
        'Supabase adapter requires "@supabase/supabase-js" package: npm install @supabase/supabase-js'
      );
    }
  }

  /**
   * Upsert a game, conflicting on `id`, and read the stored row back.
   *
   * `updated_at` is always stamped with the current time; `created_at` falls
   * back to now only when the record carries none, which means re-saving a
   * record whose `createdAt` was dropped will rewrite the creation time.
   *
   * @param game - Record to persist; a missing `id` is generated locally.
   * @returns The id reported by the returned row.
   * @throws Error carrying the PostgREST message if the upsert is rejected —
   *   including RLS denials.
   */
  async saveGame(game: GameRecord): Promise<string> {
    const id = game.id || this.generateId();
    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from('games')
      .upsert(
        {
          id,
          hpgn: game.hpgn,
          hfen: game.hfen,
          players: game.players ?? null,
          metadata: game.metadata ?? null,
          result: game.result ?? null,
          user_id: game.userId ?? null,
          synced: game.synced ?? true,
          created_at: game.createdAt || now,
          updated_at: now,
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase saveGame failed: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Fetch one row by id.
   *
   * Uses `maybeSingle()` so an absent row comes back as `null` data rather than
   * a PostgREST error, letting the missing case be reported as a typed
   * {@link GameNotFoundError}.
   *
   * @param id - Game id.
   * @returns The row in {@link GameRecord} shape.
   * @throws {@link GameNotFoundError} if no row is visible under `id`.
   * @throws Error carrying the PostgREST message on a query failure.
   */
  async loadGame(id: string): Promise<GameRecord> {
    const { data, error } = await this.client.from('games').select('*').eq('id', id).maybeSingle();

    if (error) {
      throw new Error(`Supabase loadGame failed: ${error.message}`);
    }
    if (!data) {
      throw new GameNotFoundError(id);
    }

    return this.rowToRecord(data);
  }

  /**
   * Delete a row, using the returned representation to prove it existed.
   *
   * The trailing `.select()` is what makes the not-found case detectable: a
   * `DELETE` matching nothing is not an error to PostgREST, it simply returns an
   * empty set.
   *
   * @param id - Game id.
   * @throws {@link GameNotFoundError} if no row was deleted.
   * @throws Error carrying the PostgREST message on a query failure.
   */
  async deleteGame(id: string): Promise<void> {
    const { data, error } = await this.client.from('games').delete().eq('id', id).select();

    if (error) {
      throw new Error(`Supabase deleteGame failed: ${error.message}`);
    }
    if (!data || data.length === 0) {
      throw new GameNotFoundError(id);
    }
  }

  /**
   * List games using PostgREST filters and range-based pagination.
   *
   * `range()` bounds are inclusive, so a page is expressed as
   * `[offset, offset + limit - 1]`. An `offset` given without a `limit` falls
   * back to a fixed 1000-row window, since PostgREST needs an upper bound.
   *
   * @param options - `userId`/`result` equality filters, `sort` direction
   *   (default descending by `created_at`), `limit` and `offset`.
   * @returns Matching rows in the requested order.
   * @throws Error carrying the PostgREST message on a query failure.
   */
  async listGames(options?: GameQueryOptions): Promise<GameRecord[]> {
    let q = this.client.from('games').select('*');

    if (options?.userId) q = q.eq('user_id', options.userId);
    if (options?.result) q = q.eq('result', options.result);

    q = q.order('created_at', { ascending: options?.sort === 'asc' });

    if (options?.limit !== undefined) {
      const from = options?.offset ?? 0;
      q = q.range(from, from + options.limit - 1);
    } else if (options?.offset) {
      q = q.range(options.offset, options.offset + 999);
    }

    const { data, error } = await q;

    if (error) {
      throw new Error(`Supabase listGames failed: ${error.message}`);
    }

    return (data ?? []).map((row: any) => this.rowToRecord(row));
  }

  /**
   * Count matching rows without transferring them.
   *
   * `head: true` issues a `HEAD` request so only the count header comes back;
   * `count: 'exact'` is accurate but does a full scan on large tables.
   *
   * @param options - Only `userId` and `result` are honoured.
   * @returns Total number of matching rows, or 0 if the count header is absent.
   * @throws Error carrying the PostgREST message on a query failure.
   */
  async countGames(options?: GameQueryOptions): Promise<number> {
    let q = this.client.from('games').select('*', { count: 'exact', head: true });

    if (options?.userId) q = q.eq('user_id', options.userId);
    if (options?.result) q = q.eq('result', options.result);

    const { count, error } = await q;

    if (error) {
      throw new Error(`Supabase countGames failed: ${error.message}`);
    }

    return count ?? 0;
  }

  /**
   * Subscribe to a game over a Realtime `postgres_changes` channel.
   *
   * Listens for `UPDATE` events only — inserts and deletes are not delivered, so
   * watching an id before it exists yields nothing until the first update after
   * creation. Each id gets its own channel, tracked so `clear()` can tear them
   * all down.
   *
   * @param id - Game id to observe.
   * @param callback - Receives the new row from the change payload.
   * @returns Unsubscribe handle that removes the channel.
   */
  watch(id: string, callback: (game: GameRecord) => void): Unsubscribe {
    const channelName = `games:${id}`;
    const channel = this.client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` },
        (payload: any) => callback(this.rowToRecord(payload.new))
      )
      .subscribe();

    this.channels.set(channelName, channel);

    return () => {
      this.client.removeChannel(channel);
      this.channels.delete(channelName);
    };
  }

  /**
   * Probe with a bounded head request against the `games` table.
   *
   * Verifies both reachability and that the table is readable under the current
   * key and RLS policy.
   *
   * @returns `false` instead of throwing on any error.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const { error } = await this.client.from('games').select('id', { head: true, count: 'exact' }).limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Read every visible row, newest first.
   *
   * No range is applied, so the result is still subject to the project's
   * PostgREST `max-rows` setting — on a large table this may silently return a
   * truncated backup.
   *
   * @returns All games visible to the current key.
   * @throws Error carrying the PostgREST message on a query failure.
   */
  async exportAll(): Promise<GameRecord[]> {
    const { data, error } = await this.client.from('games').select('*').order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Supabase exportAll failed: ${error.message}`);
    }

    return (data ?? []).map((row: any) => this.rowToRecord(row));
  }

  /**
   * Upsert a batch of games with one request per record.
   *
   * Sequential and non-transactional; a record rejected by RLS or a constraint
   * is logged and skipped, so a partial import is possible.
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
   * Delete every visible row and close all Realtime channels.
   *
   * The `neq('id', '')` predicate exists because PostgREST refuses an unfiltered
   * `DELETE` as a footgun guard; matching "id is not the empty string" selects
   * everything while satisfying that requirement. RLS still applies, so this
   * clears only what the current key can see.
   *
   * @returns Number of rows deleted.
   * @throws Error carrying the PostgREST message on a query failure.
   */
  async clear(): Promise<number> {
    const { data, error } = await this.client.from('games').delete().neq('id', '').select();

    if (error) {
      throw new Error(`Supabase clear failed: ${error.message}`);
    }

    this.channels.forEach((channel) => this.client.removeChannel(channel));
    this.channels.clear();

    return data?.length ?? 0;
  }

  /**
   * Map a snake_case PostgREST row to a {@link GameRecord}. The JSON columns
   * arrive already deserialised, so only the key renaming and `null`-to-
   * `undefined` normalisation is needed.
   */
  private rowToRecord(row: any): GameRecord {
    return {
      id: row.id,
      hpgn: row.hpgn,
      hfen: row.hfen,
      players: row.players ?? undefined,
      metadata: row.metadata ?? undefined,
      result: row.result ?? undefined,
      userId: row.user_id ?? undefined,
      synced: row.synced ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private generateId(): string {
    return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Row Level Security - games scoped to user

  /**
   * Resolve the id of the currently signed-in Supabase user.
   *
   * Useful for stamping `GameRecord.userId` so saved games line up with the
   * `user_id` an RLS policy filters on.
   *
   * @returns The auth user id, or `null` when nobody is signed in or the lookup
   *   fails — the two cases are not distinguished.
   */
  async getAuthenticatedUser(): Promise<string | null> {
    const { data, error } = await this.client.auth.getUser();

    if (error || !data?.user) {
      return null;
    }

    return data.user.id;
  }
}
