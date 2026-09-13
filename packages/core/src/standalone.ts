// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/standalone.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

/**
 * Bundler-free browser entry point — for a bare `<script type="module">`
 * import with no build step at all (no webpack/vite/esbuild/etc.).
 *
 * `hyperchess-core`'s main entry point (`index.ts`) works with zero explicit
 * init in Node and in any real bundler (see docs/sdk-plan/WASM-MIGRATION-PLAN.md,
 * Phase 5) — but it statically imports `hyperchess-wasm`, which resolves to
 * the `bundler` wasm-pack target outside Node. That target does a raw
 * `import ... from "./hyperchess_wasm_bg.wasm"`, which only a bundler can handle —
 * loading it directly in a browser fails outright ("Failed to fetch
 * dynamically imported module"), before any application code even runs.
 * So this module deliberately does NOT import `../board/create`,
 * `../moves/index`, etc. (all of which transitively import `wasm/engine.ts`
 * → `hyperchess-wasm`) — it's a self-contained parallel implementation of
 * just the core primitives, backed by the `web` wasm-pack target instead,
 * which needs one explicit async init call and is otherwise inert at import
 * time (safe to statically import from anywhere, including a raw browser).
 *
 * Usage:
 *   import { initHyperchessCoreStandalone, createBoard } from 'hyperchess-core/standalone';
 *   await initHyperchessCoreStandalone();
 *   const board = createBoard();
 *
 * Node and bundler-based apps should use the main `hyperchess-core` entry
 * point instead — nothing here is needed there.
 *
 * Scope: only the WASM-backed primitives (board creation/moves/legality),
 * not the HSAN notation or `Game` convenience layer (`io/`, `game/`) — those
 * import from `../moves/index` too and would need the same forking to be
 * no-bundler-safe. Add them here the same way if that's ever needed.
 */
import { Board } from './types/board';
import { Move } from './types/move';
import { getBoardHfen } from './board/hfen';
import { undoMove } from './board/undo';
import { snapshotFromWasmBoard, moveToUci, uciToMove, WasmBoardLike } from './wasm/snapshot';

export { getBoardHfen, undoMove };

interface WasmBoardCtor {
  new (): WasmBoardLike & {
    apply_move(uci: string): boolean;
    legal_moves(): string;
    in_check(): boolean;
    termination(): string;
  };
  from_hfen(hfen: string): InstanceType<WasmBoardCtor> | undefined;
}
type WasmBoardInstance = InstanceType<WasmBoardCtor>;

let wasmBoardCtor: WasmBoardCtor | null = null;

/**
 * Load and initialize the `web` wasm-pack target. Must be called once, and
 * awaited, before any other function in this module is used.
 *
 * `wasmInput` is forwarded to the wasm-pack `web`-target's own default init
 * export, which normally resolves `hyperchess_wasm_bg.wasm` relative to its own
 * module URL and `fetch()`s it — the right default for a real browser. Pass
 * this explicitly (e.g. raw bytes read via `fs.readFileSync`) in contexts
 * where that fetch doesn't work, such as plain Node (its built-in `fetch`
 * doesn't support `file://` URLs) — useful for testing this module without
 * a real browser.
 */
export async function initHyperchessCoreStandalone(
  wasmInput?: import('hyperchess-wasm/web').InitInput
): Promise<void> {
  const mod = await import('hyperchess-wasm/web');
  await mod.default(wasmInput);
  wasmBoardCtor = mod.WasmBoard as unknown as WasmBoardCtor;
}

function requireWasmBoardCtor(): WasmBoardCtor {
  if (!wasmBoardCtor) {
    throw new Error(
      'HyperChess WASM engine not initialized — call and await ' +
        'initHyperchessCoreStandalone() once before using any other function ' +
        'from hyperchess-core/standalone.'
    );
  }
  return wasmBoardCtor;
}

function loadWasmBoard(hfen?: string): WasmBoardInstance {
  const Ctor = requireWasmBoardCtor();
  if (!hfen) {
    return new Ctor();
  }
  const board = Ctor.from_hfen(hfen);
  if (!board) {
    throw new Error(`Invalid HFEN: ${hfen}`);
  }
  return board;
}

/** Create a board from HFEN-I notation, or the default starting position. */
export function createBoard(hfen?: string): Board {
  return snapshotFromWasmBoard(loadWasmBoard(hfen));
}

/** Apply a move to the board, returning a new board state. Does NOT validate legality. */
export function applyMove(board: Board, move: Move): Board {
  const piece = board.pieces[move.from];
  if (!piece) {
    throw new Error(`No piece at source square ${move.from}`);
  }

  const wasmBoard = loadWasmBoard(getBoardHfen(board));
  const applied = wasmBoard.apply_move(moveToUci(move));
  if (!applied) {
    throw new Error(`Illegal move: ${move.from} -> ${move.to}`);
  }

  const history = [
    ...board.history,
    {
      pieces: [...board.pieces],
      toMove: board.toMove,
      enPassantSquare: board.enPassantSquare,
      castlingRights: { ...board.castlingRights },
      halfmoveClock: board.halfmoveClock,
      fullmoveNumber: board.fullmoveNumber,
    },
  ];

  return snapshotFromWasmBoard(wasmBoard, history);
}

/** Generate all legal moves for the current position. */
export function generateLegalMoves(board: Board): Move[] {
  const wasmBoard = loadWasmBoard(getBoardHfen(board));
  const uci = wasmBoard.legal_moves();
  if (uci === '') return [];
  return uci.split(' ').map((m) => uciToMove(m, board));
}

/** Check if a move is legal (in the set of all legal moves for the position). */
export function isLegalMove(board: Board, move: Move): boolean {
  return generateLegalMoves(board).some((m) => m.from === move.from && m.to === move.to);
}

/** Check if the current player's king is in check. */
export function isInCheck(board: Board): boolean {
  return loadWasmBoard(getBoardHfen(board)).in_check();
}

/** Check if the current position is checkmate. */
export function isCheckmate(board: Board): boolean {
  return loadWasmBoard(getBoardHfen(board)).termination() === 'checkmate';
}

/** Check if the current position is stalemate. */
export function isStalemate(board: Board): boolean {
  return loadWasmBoard(getBoardHfen(board)).termination() === 'stalemate';
}
