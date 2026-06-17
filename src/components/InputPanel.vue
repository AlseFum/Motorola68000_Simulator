<template>
  <div class="input-panel">
    <div class="panel-header">Input $FE0000</div>
    <div class="input-body">
      <div class="dpad">
        <button class="btn-up"   @mousedown="pDown(0)" @mouseup="pUp(0)" @mouseleave="pUp(0)" @touchstart.prevent="pDown(0)" @touchend="pUp(0)">▲</button>
        <button class="btn-left" @mousedown="pDown(2)" @mouseup="pUp(2)" @mouseleave="pUp(2)" @touchstart.prevent="pDown(2)" @touchend="pUp(2)">◀</button>
        <button class="btn-center"></button>
        <button class="btn-right" @mousedown="pDown(3)" @mouseup="pUp(3)" @mouseleave="pUp(3)" @touchstart.prevent="pDown(3)" @touchend="pUp(3)">▶</button>
        <button class="btn-down" @mousedown="pDown(1)" @mouseup="pUp(1)" @mouseleave="pUp(1)" @touchstart.prevent="pDown(1)" @touchend="pUp(1)">▼</button>
      </div>

      <div class="action-btns">
        <button class="btn-a" @mousedown="pDown(4)" @mouseup="pUp(4)" @mouseleave="pUp(4)" @touchstart.prevent="pDown(4)" @touchend="pUp(4)">A</button>
        <button class="btn-b" @mousedown="pDown(5)" @mouseup="pUp(5)" @mouseleave="pUp(5)" @touchstart.prevent="pDown(5)" @touchend="pUp(5)">B</button>
      </div>

      <!-- input state display -->
      <div class="input-state">
        <div v-for="n in 6" :key="n" class="state-row">
          <span class="state-label">{{ names[n - 1] }}</span>
          <span class="state-val" :class="{ on: inputVals[n - 1] }">{{ inputVals[n - 1] ? '1' : '0' }}</span>
          <span class="state-addr">$FE000{{ n - 1 }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Memory } from '../simulator'

const props = defineProps<{ memory: Memory }>()
const emit = defineEmits<{ irq: [level: number] }>()

const names = ['Up', 'Down', 'Left', 'Right', 'A', 'B']
const inputVals = ref([0, 0, 0, 0, 0, 0])

function pDown(idx: number) {
  inputVals.value[idx] = 1
  props.memory?.setInput(idx, 1)
  // direction keys → level 1,  A/B → level 2
  if (idx < 4) emit('irq', 1)
  else emit('irq', 2)
}

function pUp(idx: number) {
  inputVals.value[idx] = 0
  props.memory?.setInput(idx, 0)
}
</script>

<style scoped>
.input-panel {
  background: #1e1e1e;
  padding: 8px;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  user-select: none;
  min-width: 0;
}
.panel-header {
  color: #569cd6;
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 6px;
  padding-bottom: 2px;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}
.input-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  flex: 1;
  justify-content: center;
}

/* D-Pad */
.dpad {
  display: grid;
  grid-template-areas:
    ".    up    ."
    "left center right"
    ".    down  .";
  grid-template-columns: 36px 36px 36px;
  grid-template-rows: 36px 36px 36px;
  gap: 3px;
}
.btn-up    { grid-area: up;     border-radius: 6px 6px 2px 2px; }
.btn-down  { grid-area: down;   border-radius: 2px 2px 6px 6px; }
.btn-left  { grid-area: left;   border-radius: 6px 2px 2px 6px; }
.btn-right { grid-area: right;  border-radius: 2px 6px 6px 2px; }
.btn-center { grid-area: center; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; pointer-events: none; }
.dpad button {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3c3c3c;
  border: 1px solid #555;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.1s;
  font-family: inherit;
  padding: 0;
}
.dpad button:active {
  background: #0e639c;
  color: #fff;
  border-color: #1177bb;
}

/* Action buttons */
.action-btns {
  display: flex;
  gap: 8px;
}
.btn-a, .btn-b {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #4a154b;
  border: 2px solid #7b2f7e;
  color: #e0a0e0;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.1s;
}
.btn-a:active, .btn-b:active {
  background: #7b2f7e;
  border-color: #c060c0;
}
.btn-b {
  background: #154a2b;
  border-color: #2f7e3b;
  color: #a0e0a0;
}
.btn-b:active {
  background: #2f7e3b;
  border-color: #60c070;
}

/* state display */
.input-state {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  max-width: 180px;
  font-family: 'Consolas', monospace;
  font-size: 10px;
}
.state-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 4px;
}
.state-label {
  color: #888;
  width: 36px;
}
.state-val {
  color: #666;
  font-weight: bold;
  width: 10px;
}
.state-val.on {
  color: #4ec9b0;
}
.state-addr {
  color: #555;
  margin-left: auto;
}
</style>
