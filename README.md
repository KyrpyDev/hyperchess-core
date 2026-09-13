# HyperChess Core

[![CI](https://github.com/KyrpyDev/hyperchess-core/actions/workflows/ci.yml/badge.svg)](https://github.com/KyrpyDev/hyperchess-core/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

**The open-source engine for HyperChess** — a chess variant played on a **12×12 board** with two
new jumping pieces, the **Eagle** and the **Hawk**. This repository contains the complete engine
stack: bitboard move generation, a tournament-strength anytime search, an MCTS searcher, a
CLI/UCI/REST driver, and a TypeScript + WebAssembly SDK so the engine runs anywhere JavaScript
does — browsers, Node.js, serverless, and native.

> New to the variant? The full rules live in
> [`docs/hyperchess-laws.md`](docs/hyperchess-laws.md). The short version: bigger board,
> 20 pieces per side, and two raptors whose jump-checks **cannot be blocked** — only met.

## The game in one table

| Rule | Classical chess | HyperChess |
|---|---|---|
| Board | 8×8 | **12×12** (files `a–l`, ranks `1–12`) |
| Pieces per side | 16 | **20** — adds 2 Eagles and 2 Hawks |
| Eagle | — | Jumps & captures up to **4 squares orthogonally**, over pieces |
| Hawk | — | Jumps & captures up to **4 squares diagonally**, over pieces |
| Setup | ranks 1–2 / 7–8 | ranks **2–3** / **10–11** (ranks 1 and 12 start empty) |
| Pawn double-step | from rank 2 / 7 | from rank **3 / 10** (en passant included) |
| Promotion | rank 8 / 1 | rank **12 / 1**, and may promote to Eagle or Hawk |
| Castling | king e1/e8 | king starts **g2/g11**; K-side `g→i` (rook `j→h`), Q-side `g→e` (rook `c→f`) |
| Blocking checks | interposition allowed | **Eagle/Hawk checks cannot be interposed** |
| 50-move rule | 50 moves | scaled to **112 moves** (224 half-moves) |
| Insufficient material | KvK, KNvK, KBvK | also lone **Eagle** or lone **Hawk** |

## Quick start (npm, 30 seconds)

```bash
npm install @hyperchess/core
```

```js
import { createGame, generateLegalMoves, addMove } from '@hyperchess/core';

const game = createGame();                            // standard 12×12 start
console.log(generateLegalMoves(game.board).length);   // every legal opening move
addMove(game, 'g3g5');                                // pawn double-step from rank 3
```

Want the full Rust engine (search included) in the browser? Add the WASM package and run it in a
Web Worker:

```js
import init, { WasmBoard } from '@hyperchess/wasm/web';

await init();
const board = new WasmBoard();
board.apply_move('g3g5');
const best = board.best_move_timed(64, 1000, 0);      // strongest move within 1000 ms
```

## Quick start (Rust)

```bash
cargo add hyperchess-rules hyperchess-search
```

```rust
use hyperchess_rules::board::Board;
use hyperchess_search::{SearchLimits, TimedSearcher};
use std::sync::atomic::AtomicBool;

let board = Board::start_pos();
let mut searcher = TimedSearcher::pro();          // full pruning profile
let stop = AtomicBool::new(false);
let mv = searcher.search(&board, &SearchLimits::movetime(64, 1000), &stop);
println!("best: {}", mv.stringify());
```

Or run the engine binary directly:

```bash
cargo run -p hyperchess-driver -- uci        # speak UCI to any compatible GUI
cargo run -p hyperchess-driver -- api        # stateless REST API with OpenAPI docs
```

## The search

The heart of this engine is a single canonical **anytime search** (`TimedSearcher`) that every
entry point — CLI, UCI, REST, WASM — shares, so the engine plays identically everywhere. It is
interruptible by wall clock, node count, or an atomic stop flag, and always returns the best move
from the deepest *completed* iteration:

- Iterative deepening with **aspiration windows**
- **Principal Variation Search** (null-window probes, exact re-searches)
- Transposition table with root-safe probing and ply-normalized mate scores
- **Countermove refutation table** + killer moves + butterfly history with gravity
- The HyperChess-specific **raptor bonus**: Eagle/Hawk moves entering the enemy king's strike
  zone are tried early — their jump checks can't be blocked, so they refute more lines than
  history statistics alone would predict
- Null-move pruning (zugzwang-guarded), check extensions, late-move reductions
- SEE-pruned quiescence with evasion search (no stand-pat while in check)
- An **Aggressive profile** adding reverse futility, frontier futility, and delta pruning

There is also a full **MCTS (UCT) searcher** with static-eval rollouts and virtual-loss support
for batched (GPU) leaf evaluation.

### Zero dependencies

The engine proper — `hyperchess-eval`, `hyperchess-rules`, `hyperchess-search` — has **zero
external crates** in its default build. Randomness comes from the engine's own seeded
XorShift64* PRNG (which also makes MCTS runs exactly reproducible), lazy statics use
`std::sync::LazyLock`. What you audit is what runs: the engine's supply-chain surface is this
repository. (The optional `wasm` feature adds only `js-sys`, for the browser wall-clock; the
driver and binding crates naturally carry their own CLI/server/wasm-bindgen dependencies.)

Every technique, every safety invariant, and the reasoning behind them is documented in
[`docs/search-architecture.md`](docs/search-architecture.md).

## Repository layout

| Path | What it is |
|---|---|
| `crates/hyperchess-rules` | Board representation, bitboards, move generation, legality, HFEN/HSAN |
| `crates/hyperchess-eval` | `no_std` evaluation math — single source shared by CPU and GPU |
| `crates/hyperchess-search` | All search algorithms (alpha-beta family, `TimedSearcher`, MCTS) |
| `crates/hyperchess-driver` | The `hyperchess` binary: CLI games, UCI server, REST/OpenAPI service |
| `crates/hyperchess-wasm` | wasm-bindgen bindings (`WasmBoard`) + WebGPU/WebGL 3D renderer |
| `crates/hyperchess-search-cuda` | Optional CUDA acceleration (never published; needs local rust-cuda) |
| `packages/core` | `@hyperchess/core` — framework-agnostic TypeScript game logic |
| `packages/wasm` | `@hyperchess/wasm` — the Rust engine compiled to WebAssembly |
| `packages/board` | `@hyperchess/board` — 2D board UI for React, Vue, and Web Components |
| `packages/store` | `@hyperchess/store` — game persistence (Postgres/SQLite/Firebase/Supabase/memory) |
| `packages/theme` | `@hyperchess/theme` — board themes and styling |

Each crate and package carries its own README with details.

## Documentation

| Doc | What's in it |
| --- | --- |
| [`docs/hyperchess-laws.md`](docs/hyperchess-laws.md) | The normative rules reference |
| [`docs/search-architecture.md`](docs/search-architecture.md) | Every search technique, why it exists, and the safety invariants |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Crate/package dependency graphs, data flow, build variants |
| [`docs/FORMATS.md`](docs/FORMATS.md) | HFEN, HFEN-I, HSAN, and HPGN-I, in one place |
| [`docs/IDENTITY-PIECES.md`](docs/IDENTITY-PIECES.md) | Why pieces keep a stable identity through promotion |
| [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md) | The "I just want to try it" onboarding path |
| [`docs/CLI.md`](docs/CLI.md) | Full CLI flag/engine-name reference |
| [`docs/UCI.md`](docs/UCI.md) | UCI protocol subset and GUI-integration notes |
| [`docs/PROJECT-STORY.md`](docs/PROJECT-STORY.md) | Origin and vision |
| [`docs/ATTRIBUTION-AND-TRUST.md`](docs/ATTRIBUTION-AND-TRUST.md) | Provenance policy and AI-assisted-development disclosure |
| [`docs/FILE-HEADER-CONVENTION.md`](docs/FILE-HEADER-CONVENTION.md) | The per-file SPDX header/versioning scheme used across this repo |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What's shipped, what's next, what's explicitly out of scope |
| [`docs/FAQ.md`](docs/FAQ.md) | Common questions, answered once |
| [`GOVERNANCE.md`](GOVERNANCE.md) / [`MAINTAINERS.md`](MAINTAINERS.md) | How decisions are made, and by whom |

## Building from source

Prerequisites: Rust (stable, pinned by `rust-toolchain.toml`), Node.js ≥ 18, `pnpm`, and
`wasm-pack` for the WASM SDK.

```bash
cargo build --workspace          # all Rust crates
cargo test  --workspace          # full Rust test suite
pnpm install && pnpm run build   # TypeScript packages
pnpm run test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

## Security

The engine is designed to be safe to expose to untrusted input: HFEN/HSAN parsers are
bounds-checked, the REST driver is stateless (no session to poison), and the search never trusts a
transposition-table move at the root — a hash collision can never inject an illegal move into
play. Found something anyway? Please report it privately — see [SECURITY.md](SECURITY.md).

## License

[GPL-3.0-or-later](LICENSE) — the same convention as Stockfish and Fairy-Stockfish. Commercial
use is fine; forks and redistributions must stay open. Dual-licensing is available on request.

**Embedding note (GPL boundary):** the recommended integration pattern for proprietary apps is to
run the engine out-of-process — the WASM engine inside a dedicated Web Worker spoken to via
`postMessage`, or the REST driver over HTTP. Your application then *communicates* with the engine
rather than linking against it.

## Contributing

Contributions are warmly welcome — engine strength, docs, ports, UI, test positions, all of it.
Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the
[good first issues](https://github.com/KyrpyDev/hyperchess-core/labels/good%20first%20issue).
Please note the [Code of Conduct](CODE_OF_CONDUCT.md).

## Acknowledgments

This engine stands on the shoulders of the computer-chess community — Stockfish and the Chess
Programming Wiki for the alpha-beta technique canon, the UCT/MCTS research line (Coulom;
Kocsis & Szepesvári), and the Rust and WebAssembly ecosystems. The full thank-you list is in
[ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md).

Development used orchestrated AI models (Claude, Codex, Gemini) as human-directed drafting and
implementation aids — disclosed plainly, with the full provenance policy and correction process,
in [`docs/ATTRIBUTION-AND-TRUST.md`](docs/ATTRIBUTION-AND-TRUST.md).

## Citing

If you use HyperChess Core in research, see [`CITATION.cff`](CITATION.cff).
