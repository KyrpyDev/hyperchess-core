# Getting started

This is the "I want to try it" path. If you're here to submit a change, see
[`CONTRIBUTING.md`](../CONTRIBUTING.md) instead — it covers the same build commands plus PR
guidelines.

## Requirements

- **Rust, stable channel**, with the `wasm32-unknown-unknown` target — both pinned in
  [`rust-toolchain.toml`](../rust-toolchain.toml); `rustup` installs and switches to it
  automatically the first time you build here.
- **Node.js ≥ 18 and [pnpm](https://pnpm.io/)** (`corepack enable`) — only needed for the
  TypeScript/WASM SDK under `packages/`.
- **`wasm-pack`** — only needed to build `@hyperchess/wasm` from source yourself.
- **CUDA — optional and not required for anything else.** `hyperchess-search-cuda` depends on
  an unpublished local `rust-cuda` checkout and is excluded from the default workspace build.

## Clone and compile

```bash
git clone https://github.com/KyrpyDev/hyperchess-core.git
cd hyperchess-core
cargo build --workspace
```

Run a smoke check:

```bash
cargo run -p hyperchess-driver -- show
cargo run -p hyperchess-driver -- perft 3
cargo test --workspace
```

`perft` counts legal move-tree nodes from the standard starting position — a correctness check,
not an engine-strength benchmark. See [CLI reference](CLI.md#perft-as-a-correctness-tool).

## If something doesn't build

- **Missing system linker (Linux)** — install your distribution's C toolchain (e.g.
  `build-essential` on Debian/Ubuntu, `base-devel` on Arch). A standard Rust requirement,
  unrelated to HyperChess specifically.
- **`wasm32-unknown-unknown` target missing** — `rustup target add wasm32-unknown-unknown`;
  `rust-toolchain.toml` should add it automatically, but older `rustup` versions sometimes need
  a manual nudge.
- **A `cust`/`cuda_builder` path error** — you're building with `--features cuda` without the
  local `rust-cuda` checkout it needs. Build without that feature unless you specifically want
  GPU acceleration.
- Anything else: open a [Discussion](../../discussions) with your OS, Rust/Node versions, and
  the exact error — that's exactly the kind of report that makes this document better.

## Try each interface

| Need | Start with |
| --- | --- |
| Play engine-vs-engine games / generate sample data | [CLI](CLI.md) |
| Connect a desktop chess GUI or a testing harness | [UCI](UCI.md) |
| Build a stateless local service integration | `hyperchess api`, then `/docs` — see [CLI](CLI.md#local-rest-api) |
| Store or exchange a position or a game | [Formats](FORMATS.md) |
| Understand legality before writing a bot | [Laws](hyperchess-laws.md) |
| Understand how the pieces fit together internally | [Architecture](ARCHITECTURE.md), [Search architecture](search-architecture.md) |
| Use the engine from JavaScript/TypeScript | `npm install @hyperchess/core` — see the [root README's quick start](../README.md#quick-start-npm-30-seconds) |

## Next steps

Once you can build and run a smoke check: [`docs/hyperchess-laws.md`](hyperchess-laws.md) if
you're not already familiar with how HyperChess plays, and
[`CONTRIBUTING.md`](../CONTRIBUTING.md) before your first pull request.
