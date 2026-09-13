// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/board/index.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

export { createBoard } from './create.js';
export { applyMove } from './move.js';
export { isLegalMove } from './validate.js';
export { undoMove } from './undo.js';
export { getBoardHfen } from './hfen.js';
