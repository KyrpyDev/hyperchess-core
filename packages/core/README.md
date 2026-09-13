# hyperchess-core

Pure HyperChess game logic with zero dependencies. Works on all platforms.

## Installation

```bash
npm install hyperchess-core
```

## Quick Start

```typescript
import { createBoard, getBoardHfen } from 'hyperchess-core';

// Create a board from starting position
const board = createBoard();

// Export to HFEN-I notation
const hfen = getBoardHfen(board);
console.log(hfen); // 12/abcdefghijkl/...

// Or create from custom HFEN
const customBoard = createBoard(hfen);
```

## API

### Board Operations
- `createBoard(hfen?: string): Board` - Create board from HFEN or default
- `applyMove(board: Board, move: Move): Board` - Apply move (returns new board)
- `isLegalMove(board: Board, move: Move): boolean` - Check move validity
- `undoMove(board: Board): Board` - Undo last move
- `getBoardHfen(board: Board): string` - Export to HFEN-I notation

### Move Generation
- `generateLegalMoves(board: Board): Move[]` - All legal moves
- `isInCheck(board: Board): boolean` - Is current player in check?
- `isCheckmate(board: Board): boolean` - Is checkmate?

### Game State
- `createGame(hfen?: string): Game` - Start new game
- `addMove(game: Game, move: string): Game | null` - Add move to game
- `removeLastMove(game: Game): Game` - Undo move
- `getGameStatus(game: Game): GameStatus` - Current status

## Architecture

```
src/
├── types/           # Type definitions (no logic)
│   ├── board.ts    # Board state
│   ├── move.ts     # Move types
│   ├── piece.ts    # Piece types
│   └── game.ts     # Game state
├── board/           # Board operations
│   ├── create.ts   # HFEN parsing
│   ├── move.ts     # Move application
│   ├── validate.ts # Legality checking
│   ├── undo.ts     # Undo logic
│   └── hfen.ts     # HFEN export
├── moves/           # Move generation
│   └── index.ts    # generateLegalMoves, checks
├── game/            # Game state machine
│   └── index.ts    # createGame, addMove, status
└── index.ts        # Public API exports
```

## Tree-Shaking

All exports are separate files, allowing bundlers to eliminate unused code:

```typescript
// Only import what you need
import { createBoard } from 'hyperchess-core/board';
import { generateLegalMoves } from 'hyperchess-core/moves';

// Unused piece types are not bundled
```

## License

MIT
