# hyperchess-board-ui

Framework-agnostic HyperChess 2D board component (React, Vue, and a plain web component),
built on `hyperchess-core` + `hyperchess-theme`.

Relocated from `hyperchess_sdk/packages/board` — no source changes, only workspace wiring
(gained its own `tsconfig.json`; the source repo never had one for this package, so its
`"build": "tsc"` script had never actually been exercised standalone before — see the
workspace-level
[`docs/hyperchess-core-extraction-plan.md`](../../../docs/hyperchess-core-extraction-plan.md)
§12 Phase 7 for the full story, including two latent root-`tsconfig.json` bugs this surfaced).
