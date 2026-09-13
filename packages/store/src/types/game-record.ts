// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-store
// File: packages/store/src/types/game-record.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

/**
 * A complete game record (HPGN + metadata).
 *
 * This is the single wire/storage shape shared by every adapter. Adapters that
 * persist to a relational backend flatten `players`/`metadata` into JSON columns
 * and rename `userId` to `user_id`; consumers always see this camelCase form.
 */
export interface GameRecord {
  /** Unique game identifier */
  id: string;

  /** Game in HPGN format */
  hpgn: string;

  /** Starting position (HFEN) */
  hfen: string;

  /** Player names */
  players?: {
    white?: string;
    black?: string;
  };

  /** Game metadata */
  metadata?: {
    event?: string;
    site?: string;
    date?: string;
    round?: string;
    whiteElo?: number;
    blackElo?: number;
    timeControl?: string;
  };

  /** Game result (1-0, 0-1, 1/2-1/2, *) */
  result?: '1-0' | '0-1' | '1/2-1/2' | '*';

  /** User/owner ID (for multi-user systems) */
  userId?: string;

  /** When created (ISO 8601) */
  createdAt?: string;

  /** When last modified (ISO 8601) */
  updatedAt?: string;

  /** Whether synced to cloud (for offline systems) */
  synced?: boolean;
}

/**
 * Query options for listing games.
 *
 * Filters are combined with AND. All fields are optional; an empty object means
 * "every game, newest first" for the backend-query adapters and "every game,
 * oldest first" for {@link GameRecord} sorting done in memory.
 */
export interface GameQueryOptions {
  /** Filter by user ID */
  userId?: string;

  /** Filter by result */
  result?: '1-0' | '0-1' | '1/2-1/2' | '*';

  /** Maximum results to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Sort order (asc/desc by date) */
  sort?: 'asc' | 'desc';
}

/**
 * Teardown handle returned by `GameStore.watch()`. Calling it detaches the
 * callback and, once the last callback for an id is gone, releases whatever
 * backend resource backed the subscription (poll timer, channel, snapshot).
 */
export type Unsubscribe = () => void;

/**
 * Thrown when a game id does not resolve to a stored record.
 *
 * Raised by `loadGame()` and `deleteGame()` on every adapter, so callers can
 * distinguish "absent" from a genuine backend failure.
 *
 * @param id - The game id that could not be resolved; embedded in the message.
 */
export class GameNotFoundError extends Error {
  constructor(id: string) {
    super(`Game not found: ${id}`);
    this.name = 'GameNotFoundError';
  }
}

/**
 * Thrown when a {@link GameRecord} fails structural validation before it is
 * handed to a backend.
 *
 * @param message - Description of which field or invariant was violated.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when replication between two stores cannot complete — for example an
 * offline SQLite store failing to flush its sync queue upstream.
 *
 * @param message - Description of what failed to sync and why.
 */
export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncError';
  }
}
