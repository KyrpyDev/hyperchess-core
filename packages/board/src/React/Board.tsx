import React, { useState, useCallback } from 'react';
import { Board as BoardType, Move, generateLegalMoves } from 'hyperchess-core';
import { BoardProps, SelectionState } from '../types/props';
import { useBoardState } from './useBoardState';

/**
 * React board component
 * Renders interactive 2D HyperChess board
 */
export const Board: React.FC<BoardProps> = ({
  hfen,
  theme = 'modern',
  onMove,
  onSquareClick,
  enableDragDrop = true,
  showCoordinates = true,
  flipBoard = false,
  highlightLastMove = true,
  highlightLegalMoves = true,
  mode = 'play',
  disabled = false,
  className,
  pieceStyle = 'unicode',
  animationSpeed = 300,
  size = 'responsive',
}) => {
  const { board, selection, makeMove, selectSquare } = useBoardState(hfen);
  const [isDragging, setIsDragging] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const handleSquareClick = useCallback(
    (square: number) => {
      if (disabled || mode === 'view') return;

      selectSquare(square);
      onSquareClick?.(square);
    },
    [disabled, mode, selectSquare, onSquareClick]
  );

  const handleDragStart = useCallback((square: number) => {
    if (disabled || !enableDragDrop) return;
    setIsDragging(true);
    setDragFrom(square);
  }, [disabled, enableDragDrop]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (to: number) => {
      if (!dragFrom || !board) return;

      const move: Move = { from: dragFrom, to };
      const success = makeMove(move);

      if (success) {
        onMove?.(move);
      }

      setDragFrom(null);
      handleDragEnd();
    },
    [dragFrom, board, makeMove, onMove, handleDragEnd]
  );

  if (!board) {
    return <div className={`hyperchess-board-ui ${className || ''}`}>Loading...</div>;
  }

  return (
    <div
      className={`hyperchess-board-ui hyperchess-board-ui-${theme} ${className || ''}`}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '0',
        aspectRatio: '1',
        width: size === 'responsive' ? '100%' : `${size}px`,
      }}
    >
      {/* TODO: Render 144 squares with pieces */}
      <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center' }}>
        Board rendering coming in Phase 3.0.4
      </div>
    </div>
  );
};

export default Board;
