<template>
  <div class="memory-panel">
    <div class="panel-header">Memory</div>
    <div class="mem-controls">
      <input type="text" class="addr-input"
        :value="'$' + (baseAddr >>> 0).toString(16).toUpperCase().padStart(8, '0')"
        @keydown.enter="onAddrChange" title="Go to address (hex)" />
      <button class="btn-page" @click="prevPage" title="Previous page">&larr;</button>
      <button class="btn-page" @click="nextPage" title="Next page">&rarr;</button>
    </div>
    <div class="mem-scroll" ref="scrollRef" @wheel.passive="onWheel">
      <div v-for="ri in numRows" :key="baseAddr + ri * 16" class="mem-row">
        <span class="mem-addr">{{ fmtAddr(baseAddr + ri * 16) }}</span>
        <span class="mem-hex">
          <span v-for="bi in 16" :key="bi" class="mem-byte" :class="{ hl: isPC(baseAddr + ri * 16 + bi - 1) }">
            {{ fmtHex(readMem(baseAddr + ri * 16 + bi - 1)) }}
          </span>
        </span>
        <span class="mem-ascii">
          <span v-for="bi in 16" :key="bi">{{ toAscii(readMem(baseAddr + ri * 16 + bi - 1)) }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Memory } from '../simulator'

const props = defineProps<{ memory: Memory; pc: number }>()

const PAGE_SIZE = 16 * 40
const baseAddr = ref(0)
const numRows = 40
const scrollRef = ref<HTMLElement>()

watch(() => props.pc, pc => { baseAddr.value = Math.max(0, (pc - 160)) & 0xFFFFFFF0 })

function readMem(a: number) { return props.memory?.getByte(a) ?? 0 }
function fmtHex(b: number) { return (b & 0xFF).toString(16).toUpperCase().padStart(2, '0') }
function fmtAddr(a: number) { return (a >>> 0).toString(16).toUpperCase().padStart(6, '0') }
function toAscii(b: number) { return b >= 32 && b <= 126 ? String.fromCharCode(b) : '.' }
function isPC(a: number) { return a === (props.pc >>> 0) || a === ((props.pc + 1) >>> 0) }
function onAddrChange(e: Event) {
  const v = (e.target as HTMLInputElement).value.replace(/^\$/, '')
  const p = parseInt(v, 16); if (!isNaN(p) && p >= 0) baseAddr.value = p & 0xFFFFFFF0
}
function prevPage() { baseAddr.value = Math.max(0, baseAddr.value - PAGE_SIZE) & 0xFFFFFFF0 }
function nextPage() { baseAddr.value = (baseAddr.value + PAGE_SIZE) & 0xFFFFFFF0 }
let wA = 0
function onWheel(e: WheelEvent) {
  wA += e.deltaY > 0 ? 16 : -16
  if (Math.abs(wA) >= 16) {
    baseAddr.value = Math.max(0, (baseAddr.value + Math.sign(wA) * 16 * Math.floor(Math.abs(wA) / 16)))
    baseAddr.value = (baseAddr.value >>> 0) & 0xFFFFFFF0
    wA = 0
  }
}
</script>

<style scoped>
.memory-panel { background:#1e1e1e; padding:4px 6px; font-family:'Consolas','Courier New',monospace; font-size:10px; overflow:hidden; display:flex; flex-direction:column; height:100%; min-width:0 }
.panel-header { color:#569cd6; font-weight:600; font-size:10px; text-transform:uppercase; letter-spacing:.5px; margin-bottom:2px; padding-bottom:1px; border-bottom:1px solid #3c3c3c; flex-shrink:0 }
.mem-controls { display:flex; gap:3px; margin-bottom:2px; align-items:center; flex-shrink:0 }
.addr-input { width:76px; padding:1px 3px; font-size:10px; font-family:inherit; background:#3c3c3c; border:1px solid #555; color:#d4d4d4; border-radius:2px; outline:none }
.addr-input:focus { border-color:#0e639c }
.btn-page { padding:0 4px; font-size:10px; line-height:15px; background:#3c3c3c; border:1px solid #555; color:#ccc; border-radius:2px; cursor:pointer }
.btn-page:hover { background:#505050 }
.mem-scroll { flex:1; overflow:auto; min-height:0 }
.mem-row { display:flex; gap:6px; padding:0; align-items:center; height:15px; line-height:15px; white-space:nowrap }
.mem-addr { color:#808080; width:44px; min-width:44px; font-size:10px; flex-shrink:0 }
.mem-hex { display:flex; gap:0; width:190px; min-width:190px; flex-shrink:0 }
.mem-byte { color:#ce9178; width:12px; text-align:center; font-size:10px }
.mem-byte:nth-child(8) { margin-right:2px }
.mem-byte.hl { background:#0e639c; color:#fff; border-radius:1px }
.mem-ascii { color:#6a9955; font-size:10px; flex-shrink:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
</style>
