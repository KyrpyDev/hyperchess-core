// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-theme
// File: packages/theme/src/types/theme.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

/**
 * A complete theme definition.
 *
 * Colour fields are emitted verbatim as CSS custom property values, so any
 * CSS-valid colour notation works. The overlay fields (`highlight*`,
 * `checkHighlight`) are painted on top of the square colour and are expected to
 * carry alpha — an opaque value there hides the piece beneath.
 */
export interface Theme {
  /** Identifier for the theme; matches {@link BuiltInTheme} for bundled themes. */
  name: string;

  /** Light square color */
  lightSquare: string;

  /** Dark square color */
  darkSquare: string;

  /** Highlight color for last move */
  highlightLastMove: string;

  /** Highlight color for legal moves */
  highlightLegalMoves: string;

  /** Highlight color for selected piece */
  highlightSelected: string;

  /**
   * How pieces are drawn: `unicode` uses the standard chess code points and
   * needs no assets, `svg` expects the renderer to supply vector glyphs, and
   * `font` requires `font` to name an installed or web-loaded typeface.
   */
  pieces: {
    style: 'unicode' | 'svg' | 'font';
    font?: string;
  };

  /** Check highlight color */
  checkHighlight?: string;

  /** Text color for coordinates */
  coordinateText?: string;
}

/**
 * Names of the themes bundled with the package, accepted by `getTheme()`.
 * Custom themes are plain {@link Theme} objects and are not part of this union.
 */
export type BuiltInTheme = 'classic' | 'modern' | 'dark' | 'highcontrast' | 'pastel';

/**
 * Minimal colour set for generating a stylesheet, as opposed to applying a full
 * {@link Theme} at runtime. It collapses the three separate highlight colours
 * into one `highlightColor` and omits piece styling entirely.
 */
export interface ThemeCssConfig {
  lightSquare: string;
  darkSquare: string;
  highlightColor: string;
  selectedColor: string;
}
