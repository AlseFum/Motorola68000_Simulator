<template>
  <div class="register-panel">
    <div class="panel-header">Registers</div>
    <div class="reg-grid">
      <div v-for="(v, i) in snapshot.d" :key="'d'+i" class="reg-row">
        <span class="reg-name">D{{ i }}</span>
        <span class="reg-val" :class="{ changed: changedRegs.has('D'+i) }">
          {{ fmt(v) }}
        </span>
      </div>
      <div v-for="(v, i) in snapshot.a" :key="'a'+i" class="reg-row">
        <span class="reg-name">A{{ i }}</span>
        <span class="reg-val" :class="{ changed: changedRegs.has('A'+i) }">
          {{ fmt(v) }}
        </span>
      </div>
      <div class="reg-row">
        <span class="reg-name">PC</span>
        <span class="reg-val">{{ fmt(snapshot.pc, 6) }}</span>
      </div>
      <div class="reg-row">
        <span class="reg-name">SR</span>
        <span class="reg-val">{{ fmt(snapshot.sr, 4) }}</span>
      </div>
    </div>
    <div class="panel-header" style="margin-top:6px">Flags</div>
    <div class="flags-row">
      <span class="flag" :class="{ set: !!(snapshot.sr & 1) }">C</span>
      <span class="flag" :class="{ set: !!(snapshot.sr & 2) }">V</span>
      <span class="flag" :class="{ set: !!(snapshot.sr & 4) }">Z</span>
      <span class="flag" :class="{ set: !!(snapshot.sr & 8) }">N</span>
      <span class="flag" :class="{ set: !!(snapshot.sr & 16) }">X</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CPUSnapshot } from '../simulator'
import { ref, watch } from 'vue'

const props = defineProps<{ snapshot: CPUSnapshot }>()

const changedRegs = ref(new Set<string>())

watch(() => props.snapshot, (cur, prev) => {
  const changed = new Set<string>()
  if (!prev) return
  for (let i = 0; i < 8; i++) {
    if (cur.d[i] !== prev.d[i]) changed.add('D' + i)
    if (cur.a[i] !== prev.a[i]) changed.add('A' + i)
  }
  changedRegs.value = changed
  setTimeout(() => changedRegs.value = new Set(), 600)
}, { deep: true })

function fmt(v: number, pad: number = 8): string {
  return (v >>> 0).toString(16).toUpperCase().padStart(pad, '0')
}
</script>

<style scoped>
.register-panel {
  background: #1e1e1e;
  border-right: 1px solid #3c3c3c;
  padding: 6px 8px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  overflow-y: auto;
  height: 100%;
}
.panel-header {
  color: #569cd6;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 4px;
  padding-bottom: 2px;
  border-bottom: 1px solid #3c3c3c;
}
.reg-grid { display: flex; flex-direction: column; gap: 1px; }
.reg-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 4px;
  border-radius: 2px;
}
.reg-row:hover { background: #2a2a2a; }
.reg-name { color: #9cdcfe; font-weight: 600; width: 24px; }
.reg-val {
  color: #ce9178;
  transition: color 0.15s;
  font-size: 11px;
}
.reg-val.changed {
  color: #4ec9b0;
  animation: flash 0.6s;
}
.flags-row {
  display: flex;
  gap: 8px;
  padding: 4px 4px;
}
.flag {
  width: 24px;
  text-align: center;
  padding: 1px 3px;
  border-radius: 2px;
  background: #333;
  color: #666;
  font-weight: 600;
}
.flag.set {
  background: #0e639c;
  color: #4ec9b0;
}
@keyframes flash {
  0% { background: rgba(78, 201, 176, 0.3); }
  100% { background: transparent; }
}
</style>
