// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-store
// File: packages/store/src/index.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

/**
 * Persistence layer for HyperChess games.
 *
 * Every adapter implements the same {@link GameStore} contract over a different
 * backend, so an application can swap storage without touching game logic. The
 * database-backed adapters (`postgres`, `sqlite`, `firebase`, `supabase`) load
 * their driver lazily via `require()` and throw from their constructor if the
 * driver is absent — this keeps all four out of the dependency graph of a
 * consumer that only uses one of them.
 *
 * @packageDocumentation
 */

// Export types
export type { GameStore } from './types/game-store';
export { isStoreOnline, syncStores } from './types/game-store';
export type { GameRecord, GameQueryOptions, Unsubscribe } from './types/game-record';
export { GameNotFoundError, ValidationError, SyncError } from './types/game-record';

// Export adapters
export { MemoryGameStore } from './adapters/memory';
export { PostgresGameStore } from './adapters/postgres';
export { SqliteGameStore } from './adapters/sqlite';
export { FirebaseGameStore } from './adapters/firebase';
export { SupabaseGameStore } from './adapters/supabase';

// Default export is memory store for development
export { MemoryGameStore as default } from './adapters/memory';
