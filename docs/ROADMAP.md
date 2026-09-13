# Roadmap

The public, high-level roadmap for HyperChess Core. It states intent and sequencing, not
commitments with dates — a small open-source project shouldn't over-promise. For what has
already shipped, see [`CHANGELOG.md`](../CHANGELOG.md). For live, granular progress, follow
GitHub Issues, Discussions, and Projects.

## Guiding principle

Ship the reference stack, a playable spectacle, and an easy contribution path **before**
seeking outreach or attention. Every durable open-source game-AI project we look up to
(Stockfish, Lc0, Fairy-Stockfish, OpenSpiel, Maia) earned legitimacy by combining an open
license, a citable artifact, a live demo, and a low-friction way to contribute — in that order.

## Shipped

- A zero-dependency engine core (`hyperchess-eval`/`rules`/`search` build with no external
  crates by default), a full modern search stack with two HyperChess-specific additions
  (countermove refutation table, raptor bonus), and a real WASM build target — see
  [`CHANGELOG.md`](../CHANGELOG.md).
- The open-source community kit: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant
  2.1), `SECURITY.md`, `ACKNOWLEDGMENTS.md`, `CITATION.cff`, issue/PR templates, Dependabot.
- CI/CD: a 3-OS Rust matrix, a `wasm32` build check, security scanning, and dry-run-gated
  npm/crates.io release workflows.
- A stranger-friendly one-command build for both the Rust workspace and the TypeScript SDK.
- npm/crates.io publish readiness (unified `GPL-3.0-or-later` licensing, full package/crate
  metadata) — actual registry publishes are still gated on secrets; see
  [Open items](../CHANGELOG.md) in the changelog history.

## Near-term

- **A hosted, one-click playable web demo** built on `hyperchess-wasm` + `hyperchess-board-ui` —
  play a game in the browser in under a minute, no signup, no install.
- **A reproducible, richly-documented dataset** — engine-vs-engine self-play games with a
  proper dataset card (generation method, engine profiles/depths, known biases). Dataset cards
  are consistently the single biggest driver of adoption for openly published datasets.
- **Turning on the release workflows for real** — add the registry tokens, run the
  private-registry DX gate, and make the first tagged crates.io/npm publish.

## Mid-term

- **Contributor onboarding at scale** — a steady stream of well-scoped `good first issue`s
  across engine, docs, SDK/UI, and non-code lanes (see
  [`CONTRIBUTING.md#ways-to-contribute`](../CONTRIBUTING.md#ways-to-contribute)), and a
  documented [role ladder](../GOVERNANCE.md#role-ladder) people actually move through.
- **Events and rituals** — a predictable recurring community call, bot tournaments with
  published, reproducible results (fixed-node self-play, per
  [`docs/search-architecture.md`](search-architecture.md#tuning-guide)), and the start of a
  HyperChess "Academy": puzzle ladders, annotated games, and study groups.
- **Academic and cross-project engagement** — a citable preprint and a proper dataset/model DOI,
  and open conversations with adjacent open projects about interoperability — by contributing
  first, then asking.
- Extraction-plan items still open: a board-3D package, container/OpenShift manifests, a
  playground app, and a zero-config boilerplate app — see
  [`docs/hyperchess-core-extraction-plan.md`](hyperchess-core-extraction-plan.md).

## Long-term

- **A flagship AI-vs-AI event**, sponsorship- or hardware-donation-backed rather than
  cash-prize-driven, in the spirit of TCEC.
- **A governance transition** from the current BDFL model toward a documented multi-maintainer
  or Steering model, once the contributor base genuinely warrants it — see
  [`GOVERNANCE.md#evolution`](../GOVERNANCE.md#evolution).

## Explicitly out of scope for now

- **Any collection of player biometric or process telemetry** (mouse dynamics, heart rate,
  EEG). If ever pursued, it will be opt-in, adults-only, ethics-reviewed, and separately
  documented before a single byte is collected.
- **A public security bug bounty.** See [`SECURITY.md`](../SECURITY.md) for the current private
  reporting process; a bounty may be revisited once contributor and review capacity have grown.
- **A CLA in place of the DCO-free contribution model.** Contributions are accepted under the
  project's own license without a separate rights-transfer agreement — see
  [`CONTRIBUTING.md#license-of-contributions`](../CONTRIBUTING.md#license-of-contributions).

## How this roadmap changes

Rules, format, and licensing items go through the
[design-note process](../GOVERNANCE.md#rfc--design-note-process) before they land. Everything
else is prioritized informally based on inbound signal weighed against effort and impact.
Suggest something by opening a Discussion.
