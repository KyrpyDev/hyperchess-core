# hyperchess-store

Game storage abstraction with pluggable adapters (Postgres, SQLite, Firebase, Supabase,
in-memory) — all backend deps are optional peers, none required to use the package.

Relocated from `hyperchess_sdk/packages/store` — no source changes, only workspace wiring (gained
its own `tsconfig.json` — see
[`docs/hyperchess-core-extraction-plan.md`](../../../docs/hyperchess-core-extraction-plan.md)
§12 Phase 7).
