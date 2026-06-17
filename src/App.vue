<template>
  <div class="app">
    <ControlBar
      :state="state"
      :canRun="canRun"
      :canStep="canStep"
      :examples="examples"
      :selected="selectedExample"
      @assemble="doAssemble"
      @step="doStep"
      @run="doRun"
      @reset="doReset"
      @selectExample="selectExample"
    />

    <div class="main-layout" ref="layoutRef">
      <div class="left-panel" :style="{ width: leftW + 'px' }">
        <RegisterPanel :snapshot="snapshot" />
      </div>
      <div class="resize-handle" @mousedown="startDrag('left', $event)"></div>

      <div class="editor-area">
        <div class="editor-pane">
          <div class="pane-header">Editor</div>
          <MonacoEditor v-model="code" :highlightLine="currentLine" />
        </div>
        <div v-if="errors.length > 0" class="errors-pane">
          <div class="pane-header pane-header-error">Assembly Errors</div>
          <div class="error-list">
            <div v-for="(err, i) in errors" :key="i" class="error-item">{{ err }}</div>
          </div>
        </div>
      </div>

      <div class="resize-handle" @mousedown="startDrag('right', $event)"></div>

      <div class="right-panel" :style="{ width: rightW + 'px' }">
        <div class="right-top">
          <MemoryPanel :memory="memory" :pc="snapshot.pc" />
        </div>
        <div class="right-bottom">
          <OutputPanel :text="output" @clear="doClearOutput" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import ControlBar, { type Example } from './components/ControlBar.vue'
import RegisterPanel from './components/RegisterPanel.vue'
import MemoryPanel from './components/MemoryPanel.vue'
import OutputPanel from './components/OutputPanel.vue'
import MonacoEditor from './components/MonacoEditor.vue'
import { useSimulator } from './composables/useSimulator'

const {
  cpu, snapshot, state, output, errors, currentLine,
  assemble, step, run, reset
} = useSimulator()

const memory = cpu.memory

const layoutRef = ref<HTMLElement>()
const leftW = ref(180)
const rightW = ref(380)
const MIN_SIDE = 120
const MAX_RIGHT = 600

let dragging: 'left' | 'right' | null = null

function startDrag(side: 'left' | 'right', e: MouseEvent) {
  dragging = side
  e.preventDefault()
}

function onMouseMove(e: MouseEvent) {
  if (!dragging || !layoutRef.value) return
  const rect = layoutRef.value.getBoundingClientRect()
  if (dragging === 'left') {
    const v = Math.max(MIN_SIDE, Math.min(e.clientX - rect.left, rect.width - rightW.value - 60))
    leftW.value = v
  } else {
    const v = Math.max(MIN_SIDE, Math.min(rect.right - e.clientX, MAX_RIGHT))
    rightW.value = v
  }
}

function onMouseUp() { dragging = null }

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
})
onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})

const examples: Example[] = [
  { name: '1. Sum 1 to 10', code: `; Sum of numbers 1+2+3+...+10 = 55\n        ORG     $4000\n\nSTART:  MOVEQ   #0,D0           ; D0 = sum\n        MOVEQ   #1,D1           ; D1 = counter\n\nLOOP:   ADD     D1,D0           ; sum += counter\n        ADDQ    #1,D1           ; counter++\n        CMPI    #11,D1          ; compare with 11\n        BNE     LOOP            ; loop if not equal\n\n        MOVE.L  D0,D1           ; D1 = result\n        MOVEQ   #5,D0           ; print decimal\n        TRAP    #15\n\n        MOVEQ   #0,D0           ; halt\n        TRAP    #15\n\n        END     START` },
  { name: '2. Fibonacci', code: `; Fibonacci: 0,1,1,2,3,5,8,13,21,34,55\n        ORG     $4000\n\nSTART:  MOVEQ   #0,D2           ; a = 0\n        MOVEQ   #1,D3           ; b = 1\n        MOVEQ   #10,D4          ; count = 10\n\nLOOP:   MOVE.L  D2,D1           ; D1 = a\n        MOVEQ   #5,D0           ; print decimal\n        TRAP    #15\n        ; newline\n        MOVE.L  #$0A,D1\n        MOVEQ   #1,D0\n        TRAP    #15\n        ; Next\n        MOVE.L  D3,D5\n        ADD.L   D2,D3\n        MOVE.L  D5,D2\n        SUBQ    #1,D4\n        BNE     LOOP\n        MOVEQ   #0,D0\n        TRAP    #15\n        END     START` },
  { name: '3. Factorial 5!', code: `; Factorial: 5! = 120\n        ORG     $4000\n\nSTART:  MOVEQ   #5,D0\n        MOVEQ   #1,D1\n\nFACT:   MULS    D0,D1\n        SUBQ    #1,D0\n        BNE     FACT\n\n        MOVE.L  D1,D1\n        MOVEQ   #5,D0\n        TRAP    #15\n        MOVEQ   #0,D0\n        TRAP    #15\n        END     START` },
  { name: '4. GCD Euclid', code: `; GCD(48,18) = 6\n        ORG     $4000\n\nSTART:  MOVE.L  #48,D0\n        MOVE.L  #18,D1\n\nGCD:    CMP     D1,D0\n        BEQ     DONE\n        BGT     SUBAB\n        SUB     D0,D1\n        BRA     GCD\nSUBAB:  SUB     D1,D0\n        BRA     GCD\n\nDONE:   MOVE.L  D0,D1\n        MOVEQ   #5,D0\n        TRAP    #15\n        MOVEQ   #0,D0\n        TRAP    #15\n        END     START` },
  { name: '5. Prime Check', code: `; Check if 17 is prime\n        ORG     $4000\n\nSTART:  MOVE.L  #17,D2\n        CMPI    #2,D2\n        BLT     NOTPRIME\n        MOVEQ   #2,D3\n\nLOOP:   MOVE.L  D2,D1\n        DIVU    D3,D1\n        SWAP    D1\n        TST     D1\n        BEQ     NOTPRIME\n        ADDQ    #1,D3\n        CMP     D2,D3\n        BCS     LOOP\n        MOVEQ   #1,D1\n        BRA     DONE\nNOTPRIME:MOVEQ #0,D1\nDONE:   MOVEQ   #5,D0\n        TRAP    #15\n        MOVEQ   #0,D0\n        TRAP    #15\n        END     START` },
  { name: '6. Bubble Sort', code: `; Bubble sort [5,3,8,1,2] -> 1,2,3,5,8\n        ORG     $4000\n\nSTART:  JSR     SORT\n        LEA     DATA,A0\n        MOVEQ   #5,D4\nPRINT:  MOVE.B  (A0)+,D1\n        ANDI    #$FF,D1\n        MOVEQ   #4,D0\n        TRAP    #15\n        SUBQ    #1,D4\n        BEQ     DONE\n        BRA     PRINT\nDONE:   MOVEQ   #0,D0\n        TRAP    #15\n\nSORT:   MOVEQ   #4,D0\nOUTER:  LEA     DATA,A0\n        MOVE.L  D0,D1\n        BRA     INNER_E\nINNER:  MOVE.B  (A0),D2\n        MOVE.B  1(A0),D3\n        CMP     D3,D2\n        BLE     NOSWAP\n        MOVE.B  D3,(A0)\n        MOVE.B  D2,1(A0)\nNOSWAP: ADDQ    #1,A0\nINNER_E:SUBQ    #1,D1\n        BNE     INNER\n        SUBQ    #1,D0\n        BNE     OUTER\n        RTS\n\nDATA:   DC.B    5,3,8,1,2\n\n        END     START` },
  { name: '7. String Copy', code: `; Copy string SRC -> DST then print\n        ORG     $4000\n\nSTART:  LEA     SRC,A0\n        LEA     DST,A1\n\nCOPY:   MOVE.B  (A0)+,(A1)+\n        BNE     COPY\n\n        MOVEQ   #2,D0\n        LEA     DST,A1\n        TRAP    #15\n\n        MOVEQ   #0,D0\n        TRAP    #15\n\nSRC:    DC.B    'Hello, Motorola 68K!',0\nDST:    DS.B    64\n\n        END     START` },
  { name: '8. Mul (shift-add)', code: `; Multiply 13 x 7 = 91 (shift+add)\n        ORG     $4000\n\nSTART:  MOVEQ   #13,D0\n        MOVEQ   #7,D1\n        MOVEQ   #0,D2\n\nMULT:   LSR     #1,D1\n        BCC     SKIP\n        ADD     D0,D2\nSKIP:   LSL     #1,D0\n        TST     D1\n        BNE     MULT\n\n        MOVE.L  D2,D1\n        MOVEQ   #5,D0\n        TRAP    #15\n        MOVEQ   #0,D0\n        TRAP    #15\n        END     START` },
  { name: '9. Bit Operations', code: `; Demonstrate BTST,BSET,BCLR,BCHG,ROL,ROR\n        ORG     $4000\n\nSTART:  MOVE.L  #$1234ABCD,D0\n        BTST    #0,D0           ; bit 0 of $ABCD = 1\n        BNE     BIT_SET\n        MOVEQ   #0,D0\nBIT_SET:ROL.L   #4,D0           ; $234ABCD1\n        ROR.L   #8,D0           ; $D1234ABC\n        BCHG    #0,D0           ; toggle bit 0\n        BSET    #4,D0           ; set bit 4\n        BCLR    #8,D0           ; clear bit 8\n        MOVE.L  D0,D1\n        MOVEQ   #3,D0           ; print hex\n        TRAP    #15\n        MOVEQ   #0,D0\n        TRAP    #15\n        END     START` },
  { name: '10. Recursive Fac', code: `; Recursive factorial 5! = 120\n        ORG     $4000\n\nSTART:  MOVEQ   #5,D0\n        JSR     FACT\n        MOVE.L  D0,D1\n        MOVEQ   #5,D0\n        TRAP    #15\n        MOVEQ   #0,D0\n        TRAP    #15\n\nFACT:   CMPI    #1,D0\n        BGT     REC\n        MOVEQ   #1,D0\n        RTS\nREC:    MOVE.L  D0,-(A7)\n        SUBQ    #1,D0\n        JSR     FACT\n        MOVE.L  (A7)+,D1\n        MULS    D1,D0\n        RTS\n        END     START` },
  { name: '11. Count 1-Bits', code: `; Count 1-bits in $DEADBEEF (should be 24)\n        ORG     $4000\n\nSTART:  MOVE.L  #$DEADBEEF,D0\n        MOVEQ   #0,D1\n        MOVEQ   #32,D2\n\nLOOP:   LSL     #1,D0\n        BCC     NOCARRY\n        ADDQ    #1,D1\nNOCARRY:SUBQ    #1,D2\n        BNE     LOOP\n\n        MOVEQ   #5,D0\n        TRAP    #15\n        MOVEQ   #0,D0\n        TRAP    #15\n        END     START` },
  { name: '12. SETcc Demo', code: `; SETcc – set byte on condition\n        ORG     $4000\n\nSTART:  MOVEQ   #5,D0\n        MOVEQ   #3,D1\n        CMP     D1,D0           ; 5 > 3\n        SGT     D2              ; D2 = $FF (true)\n        SEQ     D3              ; D3 = $00 (false)\n        SNE     D4              ; D4 = $FF (true)\n        ANDI    #$FF,D2\n        MOVE.L  D2,D1\n        MOVEQ   #5,D0\n        TRAP    #15\n        MOVEQ   #0,D0\n        TRAP    #15\n        END     START` },
]

const selectedExample = ref('')
const code = ref(examples[0].code)

function selectExample(name: string): void {
  selectedExample.value = name
  doReset()
  const ex = examples.find(e => e.name === name)
  if (ex) code.value = ex.code
}

function doAssemble(): void { assemble(code.value) }
function doStep(): void { step() }
function doRun(): void { run() }

function doReset(): void {
  reset()
  errors.value = []
}

function doClearOutput(): void { output.value = '' }

const canRun = computed(() => state.value === 'idle' || state.value === 'paused')
const canStep = computed(() => state.value === 'idle' || state.value === 'paused')
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #1e1e1e;
  color: #d4d4d4;
  user-select: none;
}
.main-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.left-panel {
  min-width: 120px;
  border-right: 1px solid #3c3c3c;
  overflow: hidden;
  flex-shrink: 0;
}
.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  flex-shrink: 0;
}
.resize-handle:hover,
.resize-handle:active {
  background: #0e639c;
}
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 200px;
  border-right: 1px solid #3c3c3c;
}
.editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pane-header {
  padding: 4px 10px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #569cd6;
  font-weight: 600;
}
.pane-header-error { color: #f44747; }
.editor-pane > :deep(.editor-wrapper) { flex: 1; }
.errors-pane { background: #1e1e1e; }
.error-list { padding: 6px 10px; max-height: 120px; overflow-y: auto; font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; }
.error-item { padding: 2px 0; color: #f44747; white-space: pre-wrap; }

.right-panel {
  min-width: 120px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}
.right-top { flex: 1; overflow: hidden; }
.right-bottom { height: 200px; overflow: hidden; }
</style>
