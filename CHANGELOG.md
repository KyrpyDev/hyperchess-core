# Changelog

All notable changes to this repository are documented here. The project adheres to
[Semantic Versioning](https://semver.org/) per crate/package; entries are grouped by date until
the first tagged release.

## Unreleased

### Added

- **`movetime_ms` on `POST /move/best`** (`hyperchess-driver`'s API driver): an optional
  wall-clock search budget, dispatched through the same `TimedSearcher`/`mcts_bounded`/
  `SearchLimits::movetime` primitives the anytime search paths already use, for algorithms
  `random`, `alphabeta`/`ab`, `iterative`/`id`, `mcts`, `strategic`/`strategic_like`, and
  `aggressive`/`pro`/`commercial`/`stockfish_like`. Other algorithm names (and requests that omit
  it) keep the existing depth-only `make_searcher` behavior unchanged. Added so
  `hyperchess-msrv-engine` consumers with a time-bounded persona (e.g. `hyperchess-live-stream`'s
  per-skill-level search cap) can get the same guarantee remotely that they had when the search
  was embedded in-process.

- **Zero-dependency engine**: `hyperchess-eval`, `hyperchess-rules`, and `hyperchess-search`
  now build with no external crates by default. `rand` moved to dev-dependencies (rules) or was
  replaced by the engine's own XorShift64* PRNG (RandomBot, MCTS expansion shuffle — now
  deterministic/reproducible, seeded from the Zobrist key); `lazy_static` replaced by
  `std::sync::LazyLock`; unused `bitflags` and the optional `getrandom` dropped. The optional
  `wasm` feature adds only `js-sys`.

- **Countermove heuristic** in the canonical `TimedSearcher`: a 144×144 refutation table ordered
  between the killers and the history quiets.
- **Raptor bonus** — HyperChess-specific move ordering: quiet Eagle/Hawk moves entering the enemy
  king's strike zone (Chebyshev ≤ 4) are tried early, because raptor checks cannot be blocked.
- Full documentation set: search architecture deep-dive (`docs/search-architecture.md`), the
  HyperChess laws (`docs/hyperchess-laws.md`), and a rewritten top-level README.
- Open-source community kit: CONTRIBUTING, CODE_OF_CONDUCT (Contributor Covenant 2.1), SECURITY,
  ACKNOWLEDGMENTS, CITATION.cff, issue/PR templates.
- Publishing readiness: repository/homepage/bugs/keywords metadata for all npm packages and Rust
  crates; unified `GPL-3.0-or-later` licensing across the SDK; `publishConfig.access=public`.
- CI/CD: GitHub Actions for cross-platform tests, security audits, and dry-run-gated npm and
  crates.io release workflows; Dependabot configuration.

### Fixed

- `hyperchess-wasm` failed to compile for `wasm32` — the profile-rename commit left a
  `ProSearcher` import and a duplicated `"strategic"` match arm in `board.rs`. The WASM SDK
  builds again, and a new CI job (`cargo check --target wasm32-unknown-unknown`) prevents a
  repeat.
- `hyperchess-driver` had a duplicated `"strategic"` comparison (clippy `eq_op` is
  deny-by-default, so `cargo clippy --workspace` failed) and a duplicated match literal.
- `crates/hyperchess-search-cuda` now carries an empty `[workspace]` table so `cargo fmt --all`
  and `cargo metadata` resolve correctly from git worktrees and vendored checkouts.

### Existing engine (extraction phases 0–7, previously unreleased)

- Six Rust crates: rules (12×12 bitboards, movegen, HFEN/HSAN), no_std eval, search
  (anytime alpha-beta + MCTS), driver (CLI/UCI/REST), WASM bindings, optional CUDA.
- Five npm packages: `hyperchess-{core,wasm,board,store,theme}`.
