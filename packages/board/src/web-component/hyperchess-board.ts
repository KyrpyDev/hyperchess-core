// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-board-ui
// File: packages/board/src/web-component/hyperchess-board-ui.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

/**
 * Framework-agnostic custom element wrapping a HyperChess board.
 *
 * Usage: `<hyperchess-board-ui hfen="..." theme="modern"></hyperchess-board-ui>`
 *
 * Importing this module has a side effect: the element is registered as
 * `hyperchess-board-ui` at the bottom of the file, guarded so a duplicate import
 * cannot throw. Markup and styles live in an open shadow root, so page CSS does
 * not leak in and the element can be styled only through its `:host` and any
 * custom properties it inherits.
 *
 * Board rendering itself is still a placeholder; only the attribute plumbing and
 * shadow-root scaffolding are implemented.
 */
export class HyperchessBoard extends HTMLElement {
  private hfen: string = '12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1';
  private theme: string = 'modern';
  // Note: HTMLElement already declares a public `shadowRoot` property, which
  // attachShadow() also assigns as a side effect — redeclaring it here as a
  // private field of our own conflicted with the inherited one (incompatible
  // visibility), so we keep our own reference under a different name instead.
  private root: ShadowRoot;

  /**
   * Attach the shadow root. Per the custom-element spec no attributes may be
   * read here, so the defaults above stand until `connectedCallback` runs.
   */
  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  /**
   * Adopt the `hfen` and `theme` attributes, if present, and paint for the first
   * time. Absent or empty attributes leave the defaults in place.
   */
  connectedCallback() {
    this.hfen = this.getAttribute('hfen') || this.hfen;
    this.theme = this.getAttribute('theme') || this.theme;

    this.render();
  }

  /** Attributes that trigger `attributeChangedCallback`; anything not listed
   * here is inert after the element is connected. */
  static get observedAttributes() {
    return ['hfen', 'theme'];
  }

  /**
   * Re-render when a watched attribute changes, skipping no-op writes so that
   * re-setting an attribute to its current value does not cost a repaint.
   *
   * @param name - Attribute that changed; one of `observedAttributes`.
   * @param oldValue - Previous value, `null` if the attribute was absent.
   * @param newValue - Incoming value.
   */
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;

    if (name === 'hfen') {
      this.hfen = newValue;
      this.render();
    } else if (name === 'theme') {
      this.theme = newValue;
      this.render();
    }
  }

  /**
   * Rebuild the shadow root's contents from scratch.
   *
   * Replacing `innerHTML` wholesale discards any existing nodes, so nothing may
   * hold a reference to a rendered square across a render.
   */
  private render() {
    this.root.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .board {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 0;
          aspect-ratio: 1;
          background: #f0d9b5;
          border: 1px solid #999;
        }
      </style>

      <div class="board">
        <!-- Board rendering coming in Phase 3.0.4 -->
        <div style="grid-column: 1 / -1; padding: 20px; text-align: center;">
          Board rendering coming soon
        </div>
      </div>
    `;
  }
}

// Register the custom element
if (!customElements.get('hyperchess-board-ui')) {
  customElements.define('hyperchess-board-ui', HyperchessBoard);
}
