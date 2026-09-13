# @hyperchess/board

2D board UI for [HyperChess](https://github.com/KyrpyDev/hyperchess-core) — the 12×12 chess
variant with Eagle and Hawk pieces. One package, three framework targets:

```js
import Board, { useBoardState } from '@hyperchess/board/react';   // React ≥ 18
import { Board } from '@hyperchess/board/vue';                     // Vue ≥ 3
import '@hyperchess/board/web-component';                          // <hyperchess-board> element
```

React and Vue are **optional peer dependencies** — install only the one you use. The web
component target has no framework dependency at all:

```html
<script type="module">
  import '@hyperchess/board/web-component';
</script>
<hyperchess-board></hyperchess-board>
```

## Quick start (React)

```jsx
import Board, { useBoardState } from '@hyperchess/board/react';

function App() {
  const { board, applyMove } = useBoardState();   // standard 12×12 start
  return <Board board={board} onMove={applyMove} />;
}
```

Theming comes from [`@hyperchess/theme`](https://www.npmjs.com/package/@hyperchess/theme); game
logic from [`@hyperchess/core`](https://www.npmjs.com/package/@hyperchess/core). To add the full
Rust engine (best-move search) use
[`@hyperchess/wasm`](https://www.npmjs.com/package/@hyperchess/wasm).

Part of the [HyperChess Core](https://github.com/KyrpyDev/hyperchess-core) monorepo —
see the repository README for the full stack, contributing guide, and license
(GPL-3.0-or-later).
