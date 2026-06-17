<template>
  <div class="control-bar">
    <div class="btn-group">
      <button class="btn btn-assemble" @click="$emit('assemble')">
        <span class="btn-icon">&#9881;</span> Assemble
      </button>
      <button class="btn btn-run" @click="$emit('run')" :disabled="!canRun && state !== 'running'">
        <span class="btn-icon">{{ state === 'running' ? '&#9632;' : '&#9654;' }}</span> {{ state === 'running' ? 'Stop' : 'Run' }}
      </button>
      <button class="btn btn-step" @click="$emit('step')" :disabled="!canStep">
        <span class="btn-icon">&#9654;|</span> Step
      </button>
      <button class="btn btn-reset" @click="$emit('reset')">
        <span class="btn-icon">&#8634;</span> Reset
      </button>
    </div>
    <div class="examples">
      <span class="examples-label">Examples:</span>
      <select class="examples-select" @change="onSelect" :value="selected">
        <option value="" disabled>-- Select an example --</option>
        <option v-for="ex in examples" :key="ex.name" :value="ex.name">{{ ex.name }}</option>
      </select>
    </div>
    <div class="status">
      <span class="status-dot" :class="statusClass"></span>
      {{ state }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface Example {
  name: string
  code: string
}

const props = defineProps<{ state: string; canRun: boolean; canStep: boolean; examples: Example[]; selected: string }>()
const emit = defineEmits<{ run: []; step: []; reset: []; assemble: []; selectExample: [string] }>()

const statusClass = computed(() => ({
  idle: 'dot-idle', running: 'dot-running', paused: 'dot-paused', finished: 'dot-finished', error: 'dot-error',
}[props.state] || 'dot-idle'))

function onSelect(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  if (v) emit('selectExample', v)
}
</script>

<style scoped>
.control-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  min-height: 40px;
  gap: 12px;
}
.btn-group { display: flex; gap: 4px; }
.btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid #555;
  border-radius: 4px;
  background: #3c3c3c;
  color: #ccc;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: background 0.15s;
  white-space: nowrap;
}
.btn:hover:not(:disabled) { background: #505050; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-icon { font-size: 10px; }
.btn-run { background: #0e639c; border-color: #0e639c; }
.btn-run:hover:not(:disabled) { background: #1177bb; }
.btn-assemble { background: #5a5a5a; }
.examples {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  justify-content: center;
}
.examples-label {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.examples-select {
  padding: 4px 8px;
  font-size: 12px;
  font-family: inherit;
  background: #3c3c3c;
  color: #d4d4d4;
  border: 1px solid #555;
  border-radius: 4px;
  cursor: pointer;
  max-width: 280px;
}
.examples-select:focus { outline: 1px solid #0e639c; }
.status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #999;
  text-transform: uppercase;
  white-space: nowrap;
}
.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot-idle { background: #666; }
.dot-running { background: #4ec9b0; animation: pulse 0.8s infinite; }
.dot-paused { background: #dcdcaa; }
.dot-finished { background: #569cd6; }
.dot-error { background: #f44747; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
</style>
