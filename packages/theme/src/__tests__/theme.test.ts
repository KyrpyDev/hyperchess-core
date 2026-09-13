// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-theme
// File: packages/theme/src/__tests__/theme.test.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

import { describe, it, expect } from 'vitest';
import {
  getTheme,
  applyTheme,
  THEME_CLASSIC,
  THEME_MODERN,
  THEME_DARK,
  THEME_HIGHCONTRAST,
  THEME_PASTEL,
} from '../index';
import type { BuiltInTheme, Theme } from '../types/theme';

const BUILT_IN_THEMES: Record<BuiltInTheme, Theme> = {
  classic: THEME_CLASSIC,
  modern: THEME_MODERN,
  dark: THEME_DARK,
  highcontrast: THEME_HIGHCONTRAST,
  pastel: THEME_PASTEL,
};

/** Minimal HTMLElement stand-in — applyTheme only touches `.style.setProperty`. */
function fakeElement() {
  const properties: Record<string, string> = {};
  return {
    style: {
      setProperty(name: string, value: string) {
        properties[name] = value;
      },
    },
    properties,
  };
}

describe('hyperchess-theme', () => {
  it('getTheme returns the matching built-in theme by name', () => {
    for (const name of Object.keys(BUILT_IN_THEMES) as BuiltInTheme[]) {
      expect(getTheme(name)).toBe(BUILT_IN_THEMES[name]);
      expect(getTheme(name).name).toBe(name);
    }
  });

  it('every built-in theme defines all required color fields', () => {
    for (const theme of Object.values(BUILT_IN_THEMES)) {
      expect(theme.lightSquare).toMatch(/^#|^rgba?\(/);
      expect(theme.darkSquare).toMatch(/^#|^rgba?\(/);
      expect(theme.highlightLastMove).toBeTruthy();
      expect(theme.highlightLegalMoves).toBeTruthy();
      expect(theme.highlightSelected).toBeTruthy();
      expect(theme.pieces.style).toBe('unicode');
    }
  });

  it('every built-in theme has a distinct light/dark square color', () => {
    for (const theme of Object.values(BUILT_IN_THEMES)) {
      expect(theme.lightSquare).not.toBe(theme.darkSquare);
    }
  });

  it('applyTheme sets all core CSS custom properties on the element', () => {
    const el = fakeElement();
    applyTheme(el as unknown as HTMLElement, THEME_DARK);

    expect(el.properties['--hc-light-square']).toBe(THEME_DARK.lightSquare);
    expect(el.properties['--hc-dark-square']).toBe(THEME_DARK.darkSquare);
    expect(el.properties['--hc-highlight-last-move']).toBe(THEME_DARK.highlightLastMove);
    expect(el.properties['--hc-highlight-legal-moves']).toBe(THEME_DARK.highlightLegalMoves);
    expect(el.properties['--hc-highlight-selected']).toBe(THEME_DARK.highlightSelected);
    expect(el.properties['--hc-coordinate-text']).toBe(THEME_DARK.coordinateText);
  });

  it('applyTheme omits --hc-coordinate-text when the theme has no coordinateText', () => {
    const el = fakeElement();
    const minimalTheme: Theme = {
      name: 'minimal',
      lightSquare: '#fff',
      darkSquare: '#000',
      highlightLastMove: 'rgba(0,0,0,0.1)',
      highlightLegalMoves: 'rgba(0,0,0,0.1)',
      highlightSelected: 'rgba(0,0,0,0.1)',
      pieces: { style: 'unicode' },
    };

    applyTheme(el as unknown as HTMLElement, minimalTheme);

    expect(el.properties['--hc-coordinate-text']).toBeUndefined();
    expect(el.properties['--hc-light-square']).toBe('#fff');
  });

  it('applyTheme works with a custom (non-built-in) theme', () => {
    const el = fakeElement();
    const custom: Theme = {
      name: 'my-custom-theme',
      lightSquare: '#abcdef',
      darkSquare: '#123456',
      highlightLastMove: 'rgba(1,2,3,0.5)',
      highlightLegalMoves: 'rgba(4,5,6,0.5)',
      highlightSelected: 'rgba(7,8,9,0.5)',
      pieces: { style: 'svg' },
    };

    applyTheme(el as unknown as HTMLElement, custom);

    expect(el.properties['--hc-light-square']).toBe('#abcdef');
    expect(el.properties['--hc-dark-square']).toBe('#123456');
  });
});
