# hyperchess-store

Game persistence for [HyperChess](https://github.com/KyrpyDev/hyperchess-core) — one
`GameStore` interface, five adapters. Save, load, list, and watch games without coupling your app
to a backend.

```js
import { MemoryGameStore } from 'hyperchess-store/memory';       // zero-config, great for tests
import { SqliteGameStore } from 'hyperchess-store/sqlite';       // better-sqlite3
import { PostgresGameStore } from 'hyperchess-store/postgres';   // pg
import { FirebaseGameStore } from 'hyperchess-store/firebase';   // firebase
import { SupabaseGameStore } from 'hyperchess-store/supabase';   // @supabase/supabase-js
```

Every backend driver is an **optional peer dependency** — install only what you use; the memory
adapter needs nothing.

## Quick start

```js
import { MemoryGameStore } from 'hyperchess-store/memory';

const store = new MemoryGameStore();

const id = await store.saveGame(record);        // record: GameRecord
const game = await store.loadGame(id);
const recent = await store.listGames({ limit: 10 });

const unsubscribe = store.watch(id, (updated) => {
  console.log('game changed', updated);
});
```

All adapters implement the same `GameStore` interface (`saveGame`, `loadGame`, `deleteGame`,
`listGames`, `countGames`, `watch`, `isHealthy`, `exportAll`, `importGames`, `clear`), so
swapping backends is a one-line change. `syncStores` copies games between two stores — e.g.
local SQLite up to Postgres.

Part of the [HyperChess Core](https://github.com/KyrpyDev/hyperchess-core) monorepo —
see the repository README for the full stack, contributing guide, and license
(GPL-3.0-or-later).
