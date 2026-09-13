// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-core
// File: packages/core/src/board/index.ts
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

export { createBoard } from './create';
export { applyMove } from './move';
export { isLegalMove } from './validate';
export { undoMove } from './undo';
export { getBoardHfen } from './hfen';
