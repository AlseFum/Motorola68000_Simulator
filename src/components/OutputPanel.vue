<template>
  <div class="output-panel">
    <div class="panel-header">
      Output
      <button class="clear-btn" @click="$emit('clear')">Clear</button>
    </div>
    <pre class="output-content" ref="outputRef">{{ text }}</pre>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{ text: string }>()
defineEmits<{ clear: [] }>()

const outputRef = ref<HTMLElement>()

watch(() => props.text, async () => {
  await nextTick()
  if (outputRef.value) {
    outputRef.value.scrollTop = outputRef.value.scrollHeight
  }
})
</script>

<style scoped>
.output-panel {
  background: #1e1e1e;
  padding: 6px 8px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #569cd6;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 4px;
  padding-bottom: 2px;
  border-bottom: 1px solid #3c3c3c;
}
.clear-btn {
  background: #3c3c3c;
  border: 1px solid #555;
  color: #ccc;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 2px;
  cursor: pointer;
}
.clear-btn:hover { background: #505050; }
.output-content {
  flex: 1;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  color: #d4d4d4;
  line-height: 1.4;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 767px) {
  .output-panel { font-size: 11px; padding: 4px 6px; }
  .panel-header { font-size: 10px; margin-bottom: 2px; }
  .clear-btn { font-size: 10px; padding: 3px 8px; min-height: 28px; }
}
</style>
