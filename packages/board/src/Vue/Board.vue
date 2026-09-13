<template>
  <div class="hyperchess-board-ui" :class="`hyperchess-board-ui-${theme}`">
    <div
      class="board-grid"
      :style="{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '0',
        aspectRatio: '1',
        width: size === 'responsive' ? '100%' : size + 'px',
      }"
    >
      <!-- TODO: Render 144 squares with pieces -->
      <div style="grid-column: 1 / -1; padding: 20px; text-align: center">
        Board rendering coming in Phase 3.0.4
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Board as BoardType, Move, HfenString, createBoard, generateLegalMoves } from 'hyperchess-core';
import type { BoardProps, SelectionState } from '../types/props';
import { useBoardState } from './useBoardState';

const props = withDefaults(defineProps<Partial<BoardProps>>(), {
  theme: 'modern',
  enableDragDrop: true,
  showCoordinates: true,
  flipBoard: false,
  highlightLastMove: true,
  highlightLegalMoves: true,
  mode: 'play',
  disabled: false,
  pieceStyle: 'unicode',
  animationSpeed: 300,
  size: 'responsive',
});

const emit = defineEmits<{
  move: [move: Move];
  'square-click': [square: number];
}>();

const { board, selection, makeMove, selectSquare } = useBoardState(props.hfen);

const handleSquareClick = (square: number) => {
  if (props.disabled || props.mode === 'view') return;
  selectSquare(square);
  emit('square-click', square);
};

const handleMove = (move: Move) => {
  const success = makeMove(move);
  if (success) {
    emit('move', move);
  }
};
</script>

<style scoped>
.hyperchess-board-ui {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
    sans-serif;
  user-select: none;
}

.board-grid {
  background: #f0d9b5;
  border: 1px solid #999;
}
</style>
