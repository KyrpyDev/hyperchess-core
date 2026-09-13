// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-theme
// File: packages/theme/src/index.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import type { Theme, BuiltInTheme } from './types/theme.js';

/**
 * Visual themes for the HyperChess board.
 *
 * A theme is applied by writing `--hc-*` CSS custom properties onto a host
 * element, so the renderer never imports colours directly and a theme can be
 * swapped at runtime without re-rendering. The five bundled themes are exported
 * individually and also reachable by name through {@link getTheme}.
 *
 * @packageDocumentation
 */

/** Traditional buff-and-olive board, the package default. */
export const THEME_CLASSIC: Theme = {
  name: 'classic',
  lightSquare: '#f0d9b5',
  darkSquare: '#baca44',
  highlightLastMove: 'rgba(184, 202, 68, 0.5)',
  highlightLegalMoves: 'rgba(184, 202, 68, 0.3)',
  highlightSelected: 'rgba(184, 202, 68, 0.7)',
  pieces: {
    style: 'unicode',
  },
  coordinateText: '#999',
};

/** Low-chroma white/grey board with blue highlights, for light UIs. */
export const THEME_MODERN: Theme = {
  name: 'modern',
  lightSquare: '#ffffff',
  darkSquare: '#e0e0e0',
  highlightLastMove: 'rgba(100, 150, 200, 0.4)',
  highlightLegalMoves: 'rgba(100, 150, 200, 0.2)',
  highlightSelected: 'rgba(100, 150, 200, 0.6)',
  pieces: {
    style: 'unicode',
  },
  coordinateText: '#666',
};

/** Near-black board with amber highlights, for dark UIs. */
export const THEME_DARK: Theme = {
  name: 'dark',
  lightSquare: '#2c2c2c',
  darkSquare: '#1a1a1a',
  highlightLastMove: 'rgba(255, 200, 0, 0.4)',
  highlightLegalMoves: 'rgba(255, 200, 0, 0.2)',
  highlightSelected: 'rgba(255, 200, 0, 0.6)',
  pieces: {
    style: 'unicode',
  },
  coordinateText: '#999',
};

/**
 * Pure black-on-white squares with fully saturated red/green/blue highlights,
 * for low-vision users. The three highlight states use distinct hues rather than
 * distinct opacities so they stay tellable apart without fine tonal
 * discrimination.
 */
export const THEME_HIGHCONTRAST: Theme = {
  name: 'highcontrast',
  lightSquare: '#ffffff',
  darkSquare: '#000000',
  highlightLastMove: 'rgba(255, 0, 0, 0.5)',
  highlightLegalMoves: 'rgba(0, 255, 0, 0.3)',
  highlightSelected: 'rgba(0, 0, 255, 0.6)',
  pieces: {
    style: 'unicode',
  },
  coordinateText: '#000000',
};

/** Soft pink board with muted red highlights. */
export const THEME_PASTEL: Theme = {
  name: 'pastel',
  lightSquare: '#fce4ec',
  darkSquare: '#f8bbd0',
  highlightLastMove: 'rgba(244, 67, 54, 0.3)',
  highlightLegalMoves: 'rgba(244, 67, 54, 0.2)',
  highlightSelected: 'rgba(244, 67, 54, 0.5)',
  pieces: {
    style: 'unicode',
  },
  coordinateText: '#c2185b',
};

/** Name-to-theme lookup backing {@link getTheme}; kept private so the exported
 * constants remain the only way to reference a theme by identity. */
const THEMES: Record<BuiltInTheme, Theme> = {
  classic: THEME_CLASSIC,
  modern: THEME_MODERN,
  dark: THEME_DARK,
  highcontrast: THEME_HIGHCONTRAST,
  pastel: THEME_PASTEL,
};

/**
 * Resolve a bundled theme by name.
 *
 * Returns the shared module-level object, not a copy — mutating the result
 * changes the theme for every caller.
 *
 * @param name - One of the {@link BuiltInTheme} names.
 * @returns The matching theme definition.
 */
export function getTheme(name: BuiltInTheme): Theme {
  return THEMES[name];
}

/**
 * Write a theme's colours onto an element as `--hc-*` CSS custom properties.
 *
 * Because the properties are set as inline styles they cascade to the element's
 * whole subtree, so applying a theme to a container themes every board inside
 * it. Switching themes only overwrites the properties the new theme defines:
 * `--hc-coordinate-text` is left in place when the incoming theme omits
 * `coordinateText`, so a stale value from a previous theme can persist.
 *
 * @param element - Host element to style; typically the board's container.
 * @param theme - Theme whose colours are written.
 */
export function applyTheme(element: HTMLElement, theme: Theme): void {
  element.style.setProperty('--hc-light-square', theme.lightSquare);
  element.style.setProperty('--hc-dark-square', theme.darkSquare);
  element.style.setProperty('--hc-highlight-last-move', theme.highlightLastMove);
  element.style.setProperty('--hc-highlight-legal-moves', theme.highlightLegalMoves);
  element.style.setProperty('--hc-highlight-selected', theme.highlightSelected);
  if (theme.coordinateText) {
    element.style.setProperty('--hc-coordinate-text', theme.coordinateText);
  }
}

export type { Theme, BuiltInTheme };
