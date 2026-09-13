// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/__tests__/standalone.test.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  initHyperchessCoreStandalone,
  createBoard,
  applyMove,
  generateLegalMoves,
  isLegalMove,
  isInCheck,
  isCheckmate,
  isStalemate,
  undoMove,
  getBoardHfen,
} from '../standalone';

describe('hyperchess-core/standalone (bundler-free browser entry point)', () => {
  it('throws a clear error if used before initHyperchessCoreStandalone()', () => {
    // NOTE: this only holds if nothing earlier in the suite has already
    // initialized the module-level WasmBoard reference — this test must run
    // before the `beforeAll` init below, which vitest guarantees since
    // `it` blocks in this describe run in declaration order and `beforeAll`
    // only runs once, before the FIRST test — so this must be the first
    // `it` in the file.
    expect(() => createBoard()).toThrow(/not initialized/i);
  });

  describe('after initialization', () => {
    beforeAll(async () => {
      // The web target's default init fetches its own .wasm relative to its
      // module URL — Node's built-in fetch doesn't support file:// URLs, so
      // tests pass the bytes explicitly (a real browser wouldn't need this).
      // NOTE vs. the source repo: one fewer "../" than before — wasm/ moved
      // from a sibling of packages/ to packages/wasm/ (a child of it) during
      // the Phase 7 extraction (docs/hyperchess-core-extraction-plan.md
      // §12), and the crate/output filename changed
      // (hyperchess_bg.wasm -> hyperchess_wasm_bg.wasm) when the wasm
      // bindings moved into their own crates/hyperchess-wasm (Phase 6).
      const wasmPath = fileURLToPath(
        new URL('../../../wasm/dist/web/hyperchess_wasm_bg.wasm', import.meta.url)
      );
      const bytes = readFileSync(wasmPath);
      await initHyperchessCoreStandalone(bytes);
    });

    it('creates the default starting position', () => {
      const board = createBoard();
      expect(board.toMove).toBe('white');
      expect(board.pieces[18]).toMatchObject({ type: 'K', color: 'white' });
      expect(getBoardHfen(board).split(' ')[2]).toBe('KQkq'); // all four rights available by default
    });

    it('generates legal moves matching the known starting-position count', () => {
      const board = createBoard();
      const moves = generateLegalMoves(board);
      expect(moves.length).toBe(62); // see docs/sdk-plan/WASM-MIGRATION-PLAN.md Phase 3 ground truth
    });

    it('applies a move and updates the snapshot', () => {
      const board = createBoard();
      const move = { from: 26, to: 38 }; // e3-e4
      const newBoard = applyMove(board, move);

      expect(newBoard.toMove).toBe('black');
      expect(newBoard.pieces[38]).toMatchObject({ type: 'P', color: 'white' });
      expect(newBoard.pieces[26]).toBeUndefined();
    });

    it('isLegalMove/isInCheck/isCheckmate/isStalemate behave correctly on the starting position', () => {
      const board = createBoard();
      expect(isLegalMove(board, { from: 26, to: 38 })).toBe(true);
      expect(isLegalMove(board, { from: 26, to: 100 })).toBe(false);
      expect(isInCheck(board)).toBe(false);
      expect(isCheckmate(board)).toBe(false);
      expect(isStalemate(board)).toBe(false);
    });

    it('undoMove reverses applyMove', () => {
      const board = createBoard();
      const newBoard = applyMove(board, { from: 26, to: 38 });
      const undone = undoMove(newBoard);

      expect(undone.toMove).toBe('white');
      expect(undone.pieces[26]).toMatchObject({ type: 'P', color: 'white' });
      expect(undone.pieces[38]).toBeUndefined();
    });
  });
});
