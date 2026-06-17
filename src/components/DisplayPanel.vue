<template>
  <div class="display-panel">
    <div class="panel-header">Display $FF0000 (256×256)</div>
    <div class="display-canvas-wrap">
      <canvas ref="canvasRef" :width="DISPLAY_W" :height="DISPLAY_H" class="display-canvas"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Memory } from '../simulator'
import { DISPLAY_W, DISPLAY_H } from '../simulator/memory'

const props = defineProps<{ memory: Memory }>()

const canvasRef = ref<HTMLCanvasElement>()
let ctx: CanvasRenderingContext2D | null = null
let rafId = 0

function render() {
  if (!canvasRef.value || !props.memory) { rafId = requestAnimationFrame(render); return }
  if (!ctx) ctx = canvasRef.value.getContext('2d')!

  const dirty = props.memory.consumeDirty()
  if (!dirty) { rafId = requestAnimationFrame(render); return }

  const buf = props.memory.displayBuf
  const img = ctx.createImageData(DISPLAY_W, DISPLAY_H)
  const data = img.data
  for (let i = 0; i < DISPLAY_W * DISPLAY_H; i++) {
    const v = buf[i]
    data[i * 4 + 0] = v  // R
    data[i * 4 + 1] = v  // G
    data[i * 4 + 2] = v  // B
    data[i * 4 + 3] = 255  // A
  }
  ctx.putImageData(img, 0, 0)
  rafId = requestAnimationFrame(render)
}

onMounted(() => { rafId = requestAnimationFrame(render) })
onUnmounted(() => { cancelAnimationFrame(rafId) })
</script>

<style scoped>
.display-panel {
  background: #1e1e1e;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-width: 0;
}
.panel-header {
  color: #569cd6;
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 3px;
  padding-bottom: 2px;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}
.display-canvas-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.display-canvas {
  max-width: 100%;
  max-height: 100%;
  image-rendering: pixelated;
  border: 1px solid #3c3c3c;
  background: #111;
}
</style>
