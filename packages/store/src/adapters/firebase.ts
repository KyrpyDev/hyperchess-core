// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-store
// File: packages/store/src/adapters/firebase.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { GameStore } from '../types/game-store';
import { GameRecord, GameQueryOptions, GameNotFoundError, Unsubscribe } from '../types/game-record';

/**
 * Firebase Firestore adapter for real-time multiplayer
 * Requires: npm install firebase
 *
 * Features:
 * - Real-time updates via onSnapshot
 * - Server-side count (getCountFromServer) with client fallback
 * - Batched deletes (respects Firestore's 500-op batch limit)
 *
 * Schema assumption: a single top-level `games` collection whose document id is
 * the game id, so `id` is never stored as a field. Fields are camelCase and
 * written as native Firestore values — `players` and `metadata` are nested maps
 * rather than JSON strings, unlike the SQL adapters. Timestamps are ISO 8601
 * strings, not Firestore `Timestamp`s, which keeps ordering lexicographic and
 * comparable across backends.
 *
 * Composite queries (`listGames` with a filter plus `orderBy('createdAt')`)
 * require matching composite indexes in the project's Firestore configuration;
 * without them Firestore rejects the query at runtime.
 */
export class FirebaseGameStore implements GameStore {
  private db: any; // firebase.firestore.Firestore
  private fs: any; // firebase/firestore module (getFirestore, doc, collection, ...)

  /**
   * Bind the store to an already-initialised Firebase app.
   *
   * The whole `firebase/firestore` module is captured rather than individual
   * functions, because the modular v9+ SDK exposes everything as free functions
   * that must be called with the `Firestore` instance.
   *
   * @param firebaseApp - A `FirebaseApp` from `initializeApp()`; authentication
   *   and security-rule context come from that app, not from this store.
   * @throws Error if the optional `firebase` package is not installed.
   */
  constructor(firebaseApp: any) {
    try {
      const firestoreApi = require('firebase/firestore');
      this.fs = firestoreApi;
      this.db = firestoreApi.getFirestore(firebaseApp);
    } catch (error) {
      throw new Error('Firebase adapter requires "firebase" package: npm install firebase');
    }
  }

  /** Reference to the top-level `games` collection this adapter operates on. */
  private collectionRef() {
    return this.fs.collection(this.db, 'games');
  }

  /**
   * Write a game as a merged document under `games/{id}`.
   *
   * Reads the existing document first so an update preserves its original
   * `createdAt` — that costs an extra round trip on every save, but it is the
   * only way to keep creation time stable given `{ merge: true }` would happily
   * overwrite it. Optional fields are written as explicit `null` rather than
   * omitted, so a cleared field is actually cleared instead of surviving the
   * merge.
   *
   * @param game - Record to persist; a missing `id` is generated locally.
   * @returns The document id the game was written to.
   */
  async saveGame(game: GameRecord): Promise<string> {
    const { doc, getDoc, setDoc } = this.fs;
    const id = game.id || this.generateId();
    const now = new Date().toISOString();
    const ref = doc(this.db, 'games', id);

    const existing = await getDoc(ref);
    const createdAt = existing.exists() ? existing.data().createdAt : game.createdAt || now;

    await setDoc(
      ref,
      {
        hpgn: game.hpgn,
        hfen: game.hfen,
        players: game.players ?? null,
        metadata: game.metadata ?? null,
        result: game.result ?? null,
        userId: game.userId ?? null,
        synced: game.synced ?? true,
        createdAt,
        updatedAt: now,
      },
      { merge: true }
    );

    return id;
  }

  /**
   * Fetch one document by id.
   *
   * @param id - Game id, used directly as the document id.
   * @returns The document data with `id` reattached from the document key.
   * @throws {@link GameNotFoundError} if the document does not exist.
   */
  async loadGame(id: string): Promise<GameRecord> {
    const { doc, getDoc } = this.fs;
    const snap = await getDoc(doc(this.db, 'games', id));

    if (!snap.exists()) {
      throw new GameNotFoundError(id);
    }

    return this.docToRecord(id, snap.data());
  }

  /**
   * Delete a document, first confirming it exists.
   *
   * The existence check is a deliberate extra read: Firestore's `deleteDoc`
   * succeeds silently on a missing document, which would make it impossible to
   * report {@link GameNotFoundError} consistently with the other adapters.
   *
   * @param id - Game id.
   * @throws {@link GameNotFoundError} if the document does not exist.
   */
  async deleteGame(id: string): Promise<void> {
    const { doc, getDoc, deleteDoc } = this.fs;
    const ref = doc(this.db, 'games', id);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      throw new GameNotFoundError(id);
    }

    await deleteDoc(ref);
  }

  /**
   * List games, filtering and ordering server-side.
   *
   * Firestore has no `OFFSET`, so pagination is emulated by fetching
   * `limit + offset` documents and slicing locally — deep pages therefore cost
   * proportionally more reads. With neither `limit` nor `offset` set, no limit
   * constraint is applied and the whole collection is read.
   *
   * @param options - `userId`/`result` equality filters, `sort` direction
   *   (default descending by `createdAt`), `limit` and `offset`.
   * @returns Matching games in the requested order.
   */
  async listGames(options?: GameQueryOptions): Promise<GameRecord[]> {
    const { query, where, orderBy, limit: fsLimit, getDocs } = this.fs;
    const constraints: any[] = [];

    if (options?.userId) constraints.push(where('userId', '==', options.userId));
    if (options?.result) constraints.push(where('result', '==', options.result));
    constraints.push(orderBy('createdAt', options?.sort === 'asc' ? 'asc' : 'desc'));

    // Firestore has no offset primitive; over-fetch to (limit + offset) and slice client-side.
    const fetchLimit = (options?.limit ?? 0) + (options?.offset ?? 0);
    if (fetchLimit > 0) constraints.push(fsLimit(fetchLimit));

    const snap = await getDocs(query(this.collectionRef(), ...constraints));
    let rows = snap.docs.map((d: any) => this.docToRecord(d.id, d.data()));

    if (options?.offset) rows = rows.slice(options.offset);
    if (options?.limit) rows = rows.slice(0, options.limit);

    return rows;
  }

  /**
   * Count matching documents, preferring the server-side aggregation.
   *
   * Uses `getCountFromServer` where the installed SDK provides it, which bills a
   * single aggregation query instead of a read per document. Older SDKs fall
   * back to fetching every match and taking `snap.size`, which is correct but
   * far more expensive.
   *
   * @param options - Only `userId` and `result` are honoured.
   * @returns Total number of matching documents.
   */
  async countGames(options?: GameQueryOptions): Promise<number> {
    const { query, where, getCountFromServer, getDocs } = this.fs;
    const constraints: any[] = [];

    if (options?.userId) constraints.push(where('userId', '==', options.userId));
    if (options?.result) constraints.push(where('result', '==', options.result));

    const q = query(this.collectionRef(), ...constraints);

    if (getCountFromServer) {
      const snap = await getCountFromServer(q);
      return snap.data().count;
    }

    const snap = await getDocs(q);
    return snap.size;
  }

  /**
   * Subscribe to a document with Firestore's native `onSnapshot` listener.
   *
   * This is the only adapter with true push updates and no polling. The callback
   * fires immediately with the current value on attach, then on every remote
   * change. Deletions are swallowed — a snapshot for a removed document does not
   * invoke the callback.
   *
   * @param id - Game id to observe.
   * @param callback - Receives the document each time it changes.
   * @returns Firestore's own unsubscribe function.
   */
  watch(id: string, callback: (game: GameRecord) => void): Unsubscribe {
    const { doc, onSnapshot } = this.fs;
    return onSnapshot(doc(this.db, 'games', id), (snap: any) => {
      if (snap.exists()) {
        callback(this.docToRecord(id, snap.data()));
      }
    });
  }

  /**
   * Probe by reading at most one document from the `games` collection.
   *
   * Stricter than a bare connectivity check: a security rule that denies reads
   * will report unhealthy, which is the useful answer for a store.
   *
   * @returns `false` instead of throwing if the read fails.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const { query, limit: fsLimit, getDocs } = this.fs;
      await getDocs(query(this.collectionRef(), fsLimit(1)));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read the entire `games` collection, newest first.
   *
   * Costs one document read per game, so this is a backup operation rather than
   * something to call on a request path.
   *
   * @returns All stored games.
   */
  async exportAll(): Promise<GameRecord[]> {
    const { query, orderBy, getDocs } = this.fs;
    const snap = await getDocs(query(this.collectionRef(), orderBy('createdAt', 'desc')));
    return snap.docs.map((d: any) => this.docToRecord(d.id, d.data()));
  }

  /**
   * Write a batch of games one document at a time.
   *
   * Sequential rather than batched, and each save costs a read plus a write
   * because of the `createdAt` preservation in `saveGame()`. Failures are logged
   * and skipped, so a partial import is possible.
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
   * Delete every document in the `games` collection.
   *
   * Firestore caps a write batch at 500 operations, so deletions are chunked and
   * each chunk committed in turn. That makes this non-atomic: a failure midway
   * leaves earlier chunks already deleted.
   *
   * @returns Number of documents deleted.
   */
  async clear(): Promise<number> {
    const { doc, getDocs, writeBatch } = this.fs;
    const snap = await getDocs(this.collectionRef());
    const docs = snap.docs;

    const BATCH_LIMIT = 500; // Firestore's max writes per batch
    let deleted = 0;

    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.db);
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      for (const d of chunk) {
        batch.delete(doc(this.db, 'games', d.id));
      }
      await batch.commit();
      deleted += chunk.length;
    }

    return deleted;
  }

  /**
   * Rebuild a {@link GameRecord} from a document's id and data, normalising the
   * `null`s Firestore stores for absent optional fields back to `undefined`.
   */
  private docToRecord(id: string, data: any): GameRecord {
    return {
      id,
      hpgn: data.hpgn,
      hfen: data.hfen,
      players: data.players ?? undefined,
      metadata: data.metadata ?? undefined,
      result: data.result ?? undefined,
      userId: data.userId ?? undefined,
      synced: data.synced ?? undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  private generateId(): string {
    return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
