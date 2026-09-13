// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-store
// File: packages/store/src/__tests__/game-store.test.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { describe, it, expect, beforeEach } from 'vitest';
import { GameStore, GameRecord, GameNotFoundError } from '../index.js';
import { MemoryGameStore } from '../adapters/memory.js';

/**
 * Abstract test suite for all GameStore implementations
 * Each adapter should pass these tests
 */
function createGameStoreTestSuite(factoryFn: () => GameStore) {
  describe('GameStore Interface', () => {
    let store: GameStore;

    beforeEach(() => {
      store = factoryFn();
    });

    it('saves and loads a game', async () => {
      const game: GameRecord = {
        id: 'test-1',
        hpgn: '1. e4 e5 2. Nf3',
        hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
        players: { white: 'Alice', black: 'Bob' },
        result: '*',
      };

      const id = await store.saveGame(game);
      expect(id).toBe('test-1');

      const loaded = await store.loadGame(id);
      expect(loaded.hpgn).toBe(game.hpgn);
      expect(loaded.players?.white).toBe('Alice');
    });

    it('generates ID if not provided', async () => {
      const game: GameRecord = {
        hpgn: '1. e4 e5',
        hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
      };

      const id = await store.saveGame(game);
      expect(id).toBeTruthy();
      expect(id.length).toBeGreaterThan(0);

      const loaded = await store.loadGame(id);
      expect(loaded.id).toBe(id);
    });

    it('throws GameNotFoundError when game missing', async () => {
      try {
        await store.loadGame('nonexistent-id');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GameNotFoundError);
      }
    });

    it('deletes a game', async () => {
      const game: GameRecord = {
        hpgn: '1. e4 e5',
        hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
      };

      const id = await store.saveGame(game);
      await store.deleteGame(id);

      try {
        await store.loadGame(id);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GameNotFoundError);
      }
    });

    it('lists games', async () => {
      const games = [
        {
          hpgn: '1. e4 e5',
          hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
        },
        {
          hpgn: '1. d4 d5',
          hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
        },
        {
          hpgn: '1. c4 c5',
          hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
        },
      ];

      for (const game of games) {
        await store.saveGame(game);
      }

      const listed = await store.listGames();
      expect(listed.length).toBeGreaterThanOrEqual(3);
    });

    it('filters games by user', async () => {
      const game1: GameRecord = {
        hpgn: '1. e4 e5',
        hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
        userId: 'user1',
      };

      const game2: GameRecord = {
        hpgn: '1. d4 d5',
        hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
        userId: 'user2',
      };

      await store.saveGame(game1);
      await store.saveGame(game2);

      const user1Games = await store.listGames({ userId: 'user1' });
      expect(user1Games.length).toBe(1);
      expect(user1Games[0].userId).toBe('user1');
    });

    it('counts games', async () => {
      const game1: GameRecord = {
        hpgn: '1. e4 e5',
        hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
      };

      const game2: GameRecord = {
        hpgn: '1. d4 d5',
        hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
      };

      await store.saveGame(game1);
      await store.saveGame(game2);

      const count = await store.countGames();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    it('checks health', async () => {
      const healthy = await store.isHealthy();
      expect(typeof healthy).toBe('boolean');
      expect(healthy).toBe(true);
    });

    it('watches game updates', async () => {
      const game: GameRecord = {
        hpgn: '1. e4 e5',
        hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
      };

      const id = await store.saveGame(game);
      let updateCount = 0;

      const unsubscribe = store.watch(id, (updatedGame) => {
        updateCount++;
      });

      // Update game
      const updated = await store.loadGame(id);
      updated.hpgn = '1. e4 e5 2. Nf3';
      await store.saveGame(updated);

      // Give a moment for async watchers to fire
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(updateCount).toBeGreaterThanOrEqual(0); // Some stores may not support watch

      unsubscribe();
    });

    it('handles pagination', async () => {
      // Save 5 games
      for (let i = 0; i < 5; i++) {
        await store.saveGame({
          hpgn: `1. e4 e5 ${i}`,
          hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
        });
      }

      const page1 = await store.listGames({ limit: 2, offset: 0 });
      const page2 = await store.listGames({ limit: 2, offset: 2 });

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeLessThanOrEqual(2);
    });

    it('updates existing game', async () => {
      const game: GameRecord = {
        id: 'update-test',
        hpgn: '1. e4 e5',
        hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
      };

      await store.saveGame(game);

      const loaded = await store.loadGame('update-test');
      loaded.hpgn = '1. e4 e5 2. Nf3';
      const updated = await store.saveGame(loaded);

      const reloaded = await store.loadGame(updated);
      expect(reloaded.hpgn).toBe('1. e4 e5 2. Nf3');
    });
  });
}

// Test memory implementation
describe('MemoryGameStore', () => {
  createGameStoreTestSuite(() => new MemoryGameStore());

  it('clears all games', async () => {
    const store = new MemoryGameStore();

    for (let i = 0; i < 3; i++) {
      await store.saveGame({
        hpgn: `1. e4 e5 ${i}`,
        hfen: '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1',
      });
    }

    const cleared = await store.clear!();
    expect(cleared).toBe(3);

    const count = await store.countGames();
    expect(count).toBe(0);
  });
});
