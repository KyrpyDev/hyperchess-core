# Contributing to HyperChess Core

Thank you for considering a contribution — this project exists so a community can build on it.
Engine strength, documentation, test positions, UI components, ports, benchmarks: all welcome.

## Ways to contribute

- **Good first issues** — look for the
  [`good first issue`](https://github.com/KyrpyDev/hyperchess-core/labels/good%20first%20issue)
  label.
- **Engine strength** — search heuristics, evaluation terms, and tuning (see the
  [search architecture guide](docs/search-architecture.md) and its tuning table).
- **Test positions** — interesting HyperChess tactics, zugzwangs, and fortress draws make great
  regression tests; raptor (Eagle/Hawk) tactics are especially valuable.
- **Docs & examples** — anything that makes the engine easier to adopt.
- **SDK & UI** — the TypeScript packages (`packages/*`) and framework integrations.

## Development setup

Prerequisites:

- **Rust** — stable, pinned by `rust-toolchain.toml` (rustup picks it up automatically)
- **Node.js ≥ 18** and **pnpm** (`corepack enable`)
- **wasm-pack** — only needed for the WASM SDK (`packages/wasm`)

```bash
git clone https://github.com/KyrpyDev/hyperchess-core.git
cd hyperchess-core

# Rust engine
cargo build --workspace
cargo test  --workspace

# TypeScript SDK
pnpm install
pnpm run build
pnpm run test
```

Note: `crates/hyperchess-search-cuda` is excluded from the workspace — it needs a local
rust-cuda checkout and is never part of the default build, test, or publish set. You don't need
CUDA for anything else.

## Before you open a PR

Run the same checks CI runs:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
pnpm run build && pnpm run test
```

## Pull request guidelines

- **One topic per PR.** Small, reviewable changes merge fastest.
- **Tests come with the change.** A new heuristic needs a test that pins its behavior; a bug fix
  needs a regression test that fails without it.
- **Search changes must preserve the safety invariants** listed at the end of
  [docs/search-architecture.md](docs/search-architecture.md) — CI enforces most of them, and
  reviewers will check the rest.
- **Strength claims need numbers.** For search/eval changes, include fixed-node self-play results
  (`SearchLimits::nodes` makes them reproducible) or a benchmark from
  `examples/golden_measure.rs`.
- **Explain the why.** Every non-obvious constant or guard in this codebase carries a comment
  explaining its reason — keep that standard.

## Commit messages

Plain, imperative subject lines ("Add countermove heuristic", "Fix EP victim in SEE"). Reference
issues with `#123` where relevant.

## Reporting bugs and proposing features

Use the [issue templates](https://github.com/KyrpyDev/hyperchess-core/issues/new/choose).
For bugs, an HFEN position and a move sequence that reproduces the problem is worth a thousand
words. For security-sensitive reports, **do not open a public issue** — see
[SECURITY.md](SECURITY.md).

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License of contributions

By contributing you agree that your contributions are licensed under the project's
[GPL-3.0-or-later](LICENSE) license.
