# hyperchess-theme

Board themes and styling for [HyperChess](https://github.com/KyrpyDev/hyperchess-core) —
color palettes and piece styling for the 12×12 board, consumed by
[`hyperchess-board-ui`](https://www.npmjs.com/package/hyperchess-board-ui) and usable standalone.

```js
import { THEME_CLASSIC, getTheme, applyTheme } from 'hyperchess-theme';

// Five built-in themes: classic, modern, dark, highcontrast, pastel
const theme = getTheme('dark');

// Apply as CSS custom properties on any element
applyTheme(document.querySelector('#board'), theme);
```

A `Theme` is a plain object (`lightSquare`, `darkSquare`, move/selection highlights, piece style,
coordinate color) — spread a built-in theme to customize it:

```js
const myTheme = { ...THEME_CLASSIC, darkSquare: '#4a7c59' };
```

No runtime dependencies.

Part of the [HyperChess Core](https://github.com/KyrpyDev/hyperchess-core) monorepo —
see the repository README for the full stack, contributing guide, and license
(GPL-3.0-or-later).
