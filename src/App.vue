<template>
  <div class="app" :class="{ mobile: isMobile }">
    <ControlBar
      :state="state"
      :canRun="canRun"
      :canStep="canStep"
      :examples="examples"
      :selected="selectedExample"
      :compact="isMobile"
      @assemble="doAssemble"
      @step="doStep"
      @run="doRun"
      @reset="doReset"
      @selectExample="selectExample"
    />

    <!-- ===== Desktop layout ===== -->
    <div v-if="!isMobile" class="main-layout" ref="layoutRef">
      <div class="left-panel" :style="{ width: leftW + 'px' }">
        <RegisterPanel :snapshot="snapshot" />
      </div>
      <div class="resize-handle" @mousedown="startDrag('left', $event)"></div>
      <div class="editor-area">
        <div class="editor-tabs">
          <button class="tab-btn" :class="{ active: editorTab === 'asm' }" @click="editorTab = 'asm'">ASM</button>
          <button class="tab-btn" :class="{ active: editorTab === 'script' }" @click="editorTab = 'script'">Script</button>
        </div>
        <div class="editor-pane" v-show="editorTab === 'asm'">
          <MonacoEditor v-model="code" :highlightLine="currentLine" :compact="false" @runToLine="doRunToLine" />
        </div>
        <div class="editor-pane" v-show="editorTab === 'script'">
          <MonacoEditor v-model="scriptCode" :highlightLine="-1" :compact="false" />
        </div>
        <div v-if="errors.length > 0" class="errors-pane">
          <div class="pane-header pane-header-error">{{ errors[0].startsWith('Line') ? 'Script Errors' : 'Assembly Errors' }}</div>
          <div class="error-list">
            <div v-for="(err, i) in errors" :key="i" class="error-item">{{ err }}</div>
          </div>
        </div>
      </div>
      <div class="resize-handle" @mousedown="startDrag('right', $event)"></div>
      <div class="right-panel" :style="{ width: rightW + 'px' }">
        <div class="right-tabs">
          <button class="tab-btn" :class="{ active: rightTab === 'mem' }" @click="rightTab = 'mem'">Memory</button>
          <button class="tab-btn" :class="{ active: rightTab === 'io' }" @click="rightTab = 'io'">I/O</button>
        </div>
        <div class="right-top" v-show="rightTab === 'mem'">
          <MemoryPanel :memory="memory" :pc="snapshot.pc" />
        </div>
        <div class="right-top io-split" v-show="rightTab === 'io'">
          <div class="io-display"><DisplayPanel :memory="memory" /></div>
          <div class="io-input"><InputPanel :memory="memory" @irq="(l) => irq(l)" /></div>
        </div>
        <div class="right-bottom">
          <OutputPanel :text="output" @clear="doClearOutput" />
        </div>
      </div>
    </div>

    <!-- ===== Mobile layout ===== -->
    <div v-else class="mobile-layout">
      <!-- Tab content -->
      <div class="mobile-content" v-show="mobileTab === 'code'">
        <div class="mobile-editor-tabs">
          <button class="m-tab-btn" :class="{ active: editorTab === 'asm' }" @click="editorTab = 'asm'">ASM</button>
          <button class="m-tab-btn" :class="{ active: editorTab === 'script' }" @click="editorTab = 'script'">Script</button>
        </div>
        <div class="mobile-editor" v-show="editorTab === 'asm'">
          <MonacoEditor v-model="code" :highlightLine="currentLine" :compact="true" @runToLine="doRunToLine" />
        </div>
        <div class="mobile-editor" v-show="editorTab === 'script'">
          <MonacoEditor v-model="scriptCode" :highlightLine="-1" :compact="true" />
        </div>
        <div v-if="errors.length > 0" class="errors-pane">
          <div class="pane-header pane-header-error">{{ errors[0].startsWith('Line') ? 'Script Errors' : 'Assembly Errors' }}</div>
          <div class="error-list">
            <div v-for="(err, i) in errors" :key="i" class="error-item">{{ err }}</div>
          </div>
        </div>
        <div class="mobile-regs"><RegisterPanel :snapshot="snapshot" /></div>
      </div>

      <div class="mobile-content" v-show="mobileTab === 'game'">
        <div class="mobile-game-layout">
          <div class="mobile-display"><DisplayPanel :memory="memory" /></div>
          <div class="mobile-input"><InputPanel :memory="memory" @irq="(l) => irq(l)" /></div>
          <div class="mobile-regs-compact"><RegisterPanel :snapshot="snapshot" /></div>
        </div>
      </div>

      <div class="mobile-content" v-show="mobileTab === 'debug'">
        <div class="mobile-debug-layout">
          <div class="mobile-memory"><MemoryPanel :memory="memory" :pc="snapshot.pc" /></div>
          <div class="mobile-output"><OutputPanel :text="output" @clear="doClearOutput" /></div>
        </div>
      </div>

      <!-- Bottom tab bar -->
      <div class="mobile-tab-bar">
        <button class="mobile-tab" :class="{ active: mobileTab === 'code' }" @click="mobileTab = 'code'">
          <span class="m-tab-icon">&#9997;</span>
          <span class="m-tab-label">Code</span>
        </button>
        <button class="mobile-tab" :class="{ active: mobileTab === 'game' }" @click="mobileTab = 'game'">
          <span class="m-tab-icon">&#9638;</span>
          <span class="m-tab-label">Game</span>
        </button>
        <button class="mobile-tab" :class="{ active: mobileTab === 'debug' }" @click="mobileTab = 'debug'">
          <span class="m-tab-icon">&#9881;</span>
          <span class="m-tab-label">Debug</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import ControlBar, { type Example } from './components/ControlBar.vue'
import RegisterPanel from './components/RegisterPanel.vue'
import MemoryPanel from './components/MemoryPanel.vue'
import DisplayPanel from './components/DisplayPanel.vue'
import InputPanel from './components/InputPanel.vue'
import OutputPanel from './components/OutputPanel.vue'
import MonacoEditor from './components/MonacoEditor.vue'
import { useSimulator } from './composables/useSimulator'
import { ScriptCompiler } from './script/compiler'

const {
  cpu, snapshot, state, output, errors, currentLine,
  assemble, step, run, runToLine, reset, irq
} = useSimulator()

const memory = cpu.memory

// --- Mobile detection ---
const windowWidth = ref(window.innerWidth)
function onResize() { windowWidth.value = window.innerWidth }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))
const isMobile = computed(() => windowWidth.value < 768)
const mobileTab = ref<'code' | 'game' | 'debug'>('code')

// --- Desktop panel sizing ---
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

// --- Examples ---
const examples: Example[] = [
  {
    name: '1. Sum 1 to 10',
    code: `; ===== Sum of 1+2+3+...+10 = 55 =====
; Demonstrates: MOVEQ, ADD, ADDQ, CMPI, BNE, TRAP
; TRAP #15 function table:
;   D0=0 halt, D0=1 print char, D0=2 print string
;   D0=3 print hex, D0=4 print word-decimal, D0=5 print long-decimal
;   D0=6 print dword-ASCII, D0=7 clear display

        ORG     $4000               ; code starts at $4000

START:  MOVEQ   #0,D0               ; D0 = sum (init 0)
        MOVEQ   #1,D1               ; D1 = counter (init 1)

LOOP:   ADD     D1,D0               ; D0 += D1  (sum = sum + counter)
        ADDQ    #1,D1               ; D1++      (counter = counter + 1)
        CMPI    #11,D1              ; is D1 == 11?
        BNE     LOOP                ; if not, repeat loop

        ; loop finished: D0 = 55
        MOVE.L  D0,D1               ; TRAP #15 uses D1 for output value
        MOVEQ   #5,D0               ; function 5 = print D1.L as decimal
        TRAP    #15                 ; output: "55"

        MOVEQ   #0,D0               ; function 0 = halt
        TRAP    #15

        END     START` },
  {
    name: '2. Fibonacci',
    code: `; ===== Fibonacci sequence: 0,1,1,2,3,5,8,13,21,34,55 =====
; Demonstrates: register-to-register ADD, MOVE, nested loops

        ORG     $4000

START:  MOVEQ   #0,D2               ; a = 0   (current term)
        MOVEQ   #1,D3               ; b = 1   (next term)
        MOVEQ   #10,D4              ; count = 10 terms

LOOP:   MOVE.L  D2,D1               ; put current term in D1 for output
        MOVEQ   #5,D0               ; print D1 as decimal
        TRAP    #15

        MOVE.L  #$0A,D1             ; newline character (ASCII 10)
        MOVEQ   #1,D0               ; print D1 as char
        TRAP    #15

        ; advance: new_a = b, new_b = a + b
        MOVE.L  D3,D5               ; temp = b
        ADD.L   D2,D3               ; b = b + a
        MOVE.L  D5,D2               ; a = temp (old b)

        SUBQ    #1,D4               ; count--
        BNE     LOOP                ; repeat if count != 0

        MOVEQ   #0,D0               ; halt
        TRAP    #15
        END     START` },
  {
    name: '3. Factorial 5!',
    code: `; ===== Factorial: 5! = 5*4*3*2*1 = 120 =====
; Demonstrates: MULS, SUBQ, BNE loop

        ORG     $4000

START:  MOVEQ   #5,D0               ; n = 5
        MOVEQ   #1,D1               ; result = 1

FACT:   MULS    D0,D1               ; result = result * n
        SUBQ    #1,D0               ; n = n - 1
        BNE     FACT                ; if n != 0, repeat

        ; D1 = 120
        MOVE.L  D1,D1               ; already in D1
        MOVEQ   #5,D0               ; print D1 as decimal
        TRAP    #15
        MOVEQ   #0,D0               ; halt
        TRAP    #15
        END     START` },
  {
    name: '4. GCD Euclid',
    code: `; ===== GCD(48,18) = 6  (Euclidean algorithm) =====
; Demonstrates: CMP, BEQ, BGT, SUB, BRA
;
; Algorithm: while a != b:
;             if a > b: a = a - b
;             else:     b = b - a

        ORG     $4000

START:  MOVE.L  #48,D0              ; a = 48
        MOVE.L  #18,D1              ; b = 18

GCD:    CMP     D1,D0               ; compare a, b
        BEQ     DONE                ; if a == b, we're done
        BGT     SUBAB               ; if a > b, go to a=a-b
        SUB     D0,D1               ; else b = b - a
        BRA     GCD                 ; repeat
SUBAB:  SUB     D1,D0               ; a = a - b
        BRA     GCD                 ; repeat

DONE:   MOVE.L  D0,D1               ; result = a (or b, they're equal)
        MOVEQ   #5,D0               ; print as decimal
        TRAP    #15                 ; output: "6"
        MOVEQ   #0,D0               ; halt
        TRAP    #15
        END     START` },
  {
    name: '5. Prime Check',
    code: `; ===== Check if 17 is prime =====
; Demonstrates: DIVU, SWAP (get remainder), BCS (branch if carry set)
;
; Prime test: try dividing n by 2,3,4,... up to n-1
; If any division has remainder 0, n is not prime.
; 17 is prime → output: "1"

        ORG     $4000

START:  MOVE.L  #17,D2              ; n = 17 (number to check)
        CMPI    #2,D2               ; n < 2?
        BLT     NOTPRIME            ; yes → not prime
        MOVEQ   #2,D3               ; i = 2 (first divisor to try)

LOOP:   MOVE.L  D2,D1               ; D1 = n
        DIVU    D3,D1               ; D1 = n / i  (remainder in upper 16 bits)
        SWAP    D1                  ; swap halves → D1.L now = remainder
        TST     D1                  ; test remainder
        BEQ     NOTPRIME            ; if remainder == 0, not prime
        ADDQ    #1,D3               ; i++
        CMP     D2,D3               ; i < n ?
        BCS     LOOP                ; yes → continue trying divisors

        ; if we get here, no divisor worked → prime
        MOVEQ   #1,D1               ; D1 = 1 (prime)
        BRA     DONE

NOTPRIME:
        MOVEQ   #0,D1               ; D1 = 0 (not prime)

DONE:   MOVEQ   #5,D0               ; print D1 as decimal
        TRAP    #15                 ; output: "1"
        MOVEQ   #0,D0               ; halt
        TRAP    #15
        END     START` },
  {
    name: '6. Bubble Sort',
    code: `; ===== Bubble sort [5,3,8,1,2] → 1,2,3,5,8 =====
; Demonstrates: JSR/RTS (subroutines), LEA, addressing modes
; Algorithm: n-1 passes, each pass bubbles largest to end

        ORG     $4000

START:  JSR     SORT                ; call sort routine

        LEA     DATA,A0             ; A0 = pointer to sorted data
        MOVEQ   #5,D4               ; D4 = 5 elements to print

PRINT:  MOVE.B  (A0)+,D1            ; load byte, advance pointer
        ANDI    #$FF,D1             ; zero-extend byte to word
        MOVEQ   #4,D0               ; print D1.W as decimal
        TRAP    #15
        SUBQ    #1,D4
        BNE     PRINT               ; repeat 5 times

DONE:   MOVEQ   #0,D0               ; halt
        TRAP    #15

; --- Bubble Sort Subroutine ---
SORT:   MOVEQ   #4,D0               ; outer loop: 4 passes (n-1)

OUTER:  LEA     DATA,A0             ; reset pointer to array start
        MOVE.L  D0,D1               ; D1 = inner loop count
        BRA     INNER_E             ; enter inner loop

INNER:  MOVE.B  (A0),D2             ; load A[i]
        MOVE.B  1(A0),D3            ; load A[i+1]
        CMP     D3,D2               ; compare
        BLE     NOSWAP              ; if A[i] <= A[i+1], skip
        MOVE.B  D3,(A0)             ; swap: A[i] = A[i+1]
        MOVE.B  D2,1(A0)            ; swap: A[i+1] = A[i]

NOSWAP: ADDQ    #1,A0               ; advance pointer
INNER_E:SUBQ    #1,D1
        BNE     INNER               ; inner loop
        SUBQ    #1,D0
        BNE     OUTER               ; outer loop
        RTS

DATA:   DC.B    5,3,8,1,2           ; source array (5 bytes)

        END     START` },
  {
    name: '7. String Copy',
    code: `; ===== String copy + print =====
; Demonstrates: LEA, postincrement (An)+, TRAP #15 func 2
; Copies SRC to DST, then prints the copy

        ORG     $4000

START:  LEA     SRC,A0              ; A0 = source address
        LEA     DST,A1              ; A1 = destination address

COPY:   MOVE.B  (A0)+,(A1)+         ; copy one byte, advance both ptrs
        BNE     COPY                ; if byte != 0, continue
                                    ; (the null terminator IS copied, then loop stops)

        MOVEQ   #2,D0               ; function 2 = print null-terminated
        LEA     DST,A1              ;    string at A1
        TRAP    #15                 ; output: "Hello, Motorola 68K!"

        MOVEQ   #0,D0               ; halt
        TRAP    #15

SRC:    DC.B    'Hello, Motorola 68K!',0    ; source string
DST:    DS.B    64                  ; reserve 64 bytes for destination

        END     START` },
  {
    name: '8. Mul (shift-add)',
    code: `; ===== 13 x 7 = 91 via shift-and-add =====
; Demonstrates: LSR (extract bits), BCC (check carry), LSL
; Algorithm: multiply by shifting multiplier right,
;            adding multiplicand when the shifted-out bit is 1

        ORG     $4000

START:  MOVEQ   #13,D0              ; multiplicand (A)
        MOVEQ   #7,D1               ; multiplier (B)
        MOVEQ   #0,D2               ; result = 0

MULT:   LSR     #1,D1               ; shift B right: bit 0 → carry
        BCC     SKIP                ; if carry=0, bit was 0: skip add
        ADD     D0,D2               ; result += A
SKIP:   LSL     #1,D0               ; A = A * 2
        TST     D1                  ; B == 0?
        BNE     MULT                ; no: continue

        MOVE.L  D2,D1               ; result to D1
        MOVEQ   #5,D0               ; print as decimal
        TRAP    #15                 ; output: "91"
        MOVEQ   #0,D0               ; halt
        TRAP    #15
        END     START` },
  {
    name: '9. Bit Operations',
    code: `; ===== Bit manipulation: BTST, BSET, BCLR, BCHG, ROL, ROR =====
; Demonstrates: all bit-test/modify instructions and rotates

        ORG     $4000

START:  MOVE.L  #$1234ABCD,D0       ; test value
        ; $ABCD = 1010 1011 1100 1101

        BTST    #0,D0               ; test bit 0 → should be 1 (D is 1101)
        BNE     BIT_SET             ; Z=0 means bit is set → skip
        MOVEQ   #0,D0               ; (not reached)

BIT_SET:
        ROL.L   #4,D0               ; rotate left 4 bits
        ; $1234ABCD → $234ABCD1

        ROR.L   #8,D0               ; rotate right 8 bits
        ; $234ABCD1 → $D1234ABC

        BCHG    #0,D0               ; toggle bit 0
        BSET    #4,D0               ; set bit 4 (= 1)
        BCLR    #8,D0               ; clear bit 8 (= 0)

        MOVE.L  D0,D1               ; D1 = modified value
        MOVEQ   #3,D0               ; function 3 = print D1.L as hex
        TRAP    #15                 ; output: modified hex value
        MOVEQ   #0,D0               ; halt
        TRAP    #15
        END     START` },
  {
    name: '10. Recursive Fac',
    code: `; ===== Recursive factorial: 5! = 120 =====
; Demonstrates: JSR/RTS for recursion, stack operations
; Each call pushes its n to the stack, recurses, then pops and multiplies
;
; FAC(0) = FAC(1) = 1
; FAC(n) = n * FAC(n-1)

        ORG     $4000

START:  MOVEQ   #5,D0               ; compute 5!
        JSR     FACT                ; call factorial
        MOVE.L  D0,D1               ; result to D1 for output
        MOVEQ   #5,D0               ; print decimal
        TRAP    #15                 ; output: "120"
        MOVEQ   #0,D0               ; halt
        TRAP    #15

FACT:   CMPI    #1,D0               ; n <= 1?
        BGT     REC                 ; no: go to recursive case
        MOVEQ   #1,D0               ; base case: return 1
        RTS

REC:    MOVE.L  D0,-(A7)            ; push current n onto stack
        SUBQ    #1,D0               ; D0 = n - 1
        JSR     FACT                ; compute FAC(n-1)
        MOVE.L  (A7)+,D1            ; pop original n into D1
        MULS    D1,D0               ; D0 = n * FAC(n-1)
        RTS                         ; return result in D0

        END     START` },
  {
    name: '11. Count 1-Bits',
    code: `; ===== Count set bits (popcount) of $DEADBEEF = 24 =====
; Demonstrates: LSL to shift out bits, BCC to check carry
; Algorithm: shift left 32 times, count how many times
;            the MSB (shifted into carry) was 1

        ORG     $4000

START:  MOVE.L  #$DEADBEEF,D0       ; test value (has 24 ones)
        MOVEQ   #0,D1               ; bit count = 0
        MOVEQ   #32,D2              ; loop 32 times

LOOP:   LSL     #1,D0               ; shift left: MSB → C flag
        BCC     NOCARRY             ; if carry = 0, skip
        ADDQ    #1,D1               ; count this bit
NOCARRY:SUBQ    #1,D2               ; decrement loop counter
        BNE     LOOP

        MOVEQ   #5,D0               ; print count as decimal
        TRAP    #15                 ; output: "24"
        MOVEQ   #0,D0               ; halt
        TRAP    #15
        END     START` },
  {
    name: '12. SETcc Demo',
    code: `; ===== SETcc: set byte according to condition codes =====
; Demonstrates: SGT, SEQ, SNE, SLT
; Each SETcc instruction writes $FF (true) or $00 (false) to a destination
; based on the current flags (N,Z,V,C in Status Register)

        ORG     $4000

START:  MOVEQ   #5,D0               ; first operand
        MOVEQ   #3,D1               ; second operand
        CMP     D1,D0               ; compare 5 with 3
        ; Flags after CMP: N=0, Z=0, V=0, C=0  (5 > 3)

        SGT     D2                  ; D2 = $FF  (Greater Than: true!)
        SEQ     D3                  ; D3 = $00  (EQual: false)
        SNE     D4                  ; D4 = $FF  (Not Equal: true!)
        SLT     D5                  ; D5 = $00  (Less Than: false)

        ; Print D2 as confirmation (should be 255 = $FF)
        ANDI    #$FF,D2             ; mask to byte
        MOVE.L  D2,D1
        MOVEQ   #5,D0               ; print decimal
        TRAP    #15                 ; output: "255"
        MOVEQ   #0,D0               ; halt
        TRAP    #15
        END     START` },
  {
    name: '13. Display (XOR pattern)',
    code: `; ===== XOR pattern on display ($FF0000) =====
; Display is a 256 x 256 pixel framebuffer at $FF0000
; Each byte = 1 pixel grayscale (0=black, 255=white)
; Pixel(x,y) address = $FF0000 + y*256 + x
;
; Pattern: pixel = (x XOR y) + x   (moiré effect)

        ORG     $4000

START:  LEA     $FF0000,A0          ; A0 = display buffer base

        MOVEQ   #0,D4               ; y = 0

ROW:    MOVEQ   #0,D5               ; x = 0

COL:    MOVE.L  D5,D0               ; D0 = x
        EOR     D4,D0               ; D0 = x XOR y
        ADD     D5,D0               ; D0 = (x^y) + x
        MOVE.B  D0,(A0)+            ; write pixel, advance A0 (postincrement)
        ADDQ    #1,D5               ; x++
        CMPI    #256,D5             ; x < 256?
        BNE     COL

        ADDQ    #1,D4               ; y++
        CMPI    #256,D4             ; y < 256?
        BNE     ROW

        MOVEQ   #0,D0               ; halt
        TRAP    #15
        END     START` },
  {
    name: '14. Display (Plasma)',
    code: `; ===== Plasma pattern on display ($FF0000) =====
; Pattern: pixel = (x*x + y*y) >> 6
; Creates concentric arc-like bands

        ORG     $4000

START:  LEA     $FF0000,A0          ; A0 = display buffer

        MOVEQ   #0,D4               ; y = 0

ROW:    MOVEQ   #0,D5               ; x = 0

COL:    MOVE.L  D5,D0               ; D0 = x
        MULS    D5,D0               ; D0 = x^2  (low 16 bits of product)
        LSR     #6,D0               ; scale down: x^2 / 64

        MOVE.L  D4,D1               ; D1 = y
        MULS    D4,D1               ; D1 = y^2
        LSR     #6,D1               ; scale down: y^2 / 64

        ADD     D1,D0               ; D0 = (x^2 + y^2) / 64
        MOVE.B  D0,(A0)+            ; write pixel
        ADDQ    #1,D5               ; x++
        CMPI    #256,D5
        BNE     COL

        ADDQ    #1,D4               ; y++
        CMPI    #256,D4
        BNE     ROW

        MOVEQ   #0,D0               ; halt
        TRAP    #15
        END     START` },
  {
    name: '15. Input Move Dot',
    code: `; ===== Move a white dot with D-Pad (polling) =====
; Memory-mapped I/O:
;   Display: $FF0000 - $FFFFFF  (64KB, 256x256 pixels)
;   Input:   $FE0000-$FE0003    (Up/Down/Left/Right, 1=pressed)
;
; Algorithm: each frame, save old pos, read input, draw new pos, erase old
; Handles clamping to screen edges (0-255)

        ORG     $4000

START:  MOVE.L  #128,D2             ; x = 128 (screen center)
        MOVE.L  #128,D3             ; y = 128
        MOVEQ   #$FF,D4             ; white pixel value
        MOVEQ   #0,D5               ; black pixel (for erasing)

        MOVEQ   #7,D0               ; clear display
        TRAP    #15
        JSR     DRAW                ; draw initial white dot

LOOP:   ; --- Save old position ---
        MOVE.L  D2,D6               ; old_x = current x
        MOVE.L  D3,D7               ; old_y = current y

        ; --- Read D-Pad (polled I/O at $FE0000-$FE0003) ---
        TST.B   $FE0000             ; Up pressed?
        BEQ     CK_DN
        TST     D3                  ; already at top?
        BEQ     CK_DN
        SUBQ    #1,D3               ; y--

CK_DN:  TST.B   $FE0001             ; Down pressed?
        BEQ     CK_LT
        CMPI    #255,D3             ; at bottom?
        BEQ     CK_LT
        ADDQ    #1,D3               ; y++

CK_LT:  TST.B   $FE0002             ; Left pressed?
        BEQ     CK_RT
        TST     D2                  ; at left edge?
        BEQ     CK_RT
        SUBQ    #1,D2               ; x--

CK_RT:  TST.B   $FE0003             ; Right pressed?
        BEQ     NOCHG
        CMPI    #255,D2             ; at right edge?
        BEQ     NOCHG
        ADDQ    #1,D2               ; x++

        ; --- If position unchanged, skip redraw ---
NOCHG:  CMP.L   D6,D2               ; compare new_x vs old_x
        BNE     REDRAW
        CMP.L   D7,D3               ; compare new_y vs old_y
        BNE     REDRAW
        BRA     LOOP                ; no change → loop back

        ; --- Redraw: draw at new pos, erase old pos ---
REDRAW: JSR     DRAW                ; plot white pixel at (x,y)
        MOVE.L  D2,-(A7)            ; push new_x
        MOVE.L  D3,-(A7)            ; push new_y
        MOVE.L  D6,D2               ; swap to old_x
        MOVE.L  D7,D3               ; swap to old_y
        JSR     ERASE               ; plot black pixel at old pos
        MOVE.L  (A7)+,D3            ; pop new_y
        MOVE.L  (A7)+,D2            ; pop new_x
        BRA     LOOP

; --- Plot white pixel at (D2, D3) ---
DRAW:   LEA     $FF0000,A0
        MOVE.L  D3,D0
        LSL     #8,D0               ; D0 = y * 256
        ADD     D2,D0               ; D0 = y*256 + x
        ADDA.L  D0,A0               ; A0 = $FF0000 + offset
        MOVE.B  D4,(A0)             ; write white
        RTS

; --- Plot black pixel at (D2, D3) ---
ERASE:  LEA     $FF0000,A0
        MOVE.L  D3,D0
        LSL     #8,D0
        ADD     D2,D0
        ADDA.L  D0,A0
        MOVE.B  D5,(A0)             ; write black
        RTS

        END     START` },
  {
    name: '16. Interrupt (VBlank ISR)',
    code: `; ===============================================================
; 68K Interrupt System — Complete Tutorial
; ===============================================================
;
; ■ Interrupt Levels & Autovectors
;   Level 1 ($064): D-Pad方向键    (InputPanel 按下触发)
;   Level 2 ($068): 键盘/A,B按钮   (keydown / InputPanel)
;   Level 3 ($06C): VBlank ~60Hz   (composable 每帧自动发射)
;   Level 4 ($070): 用户定义       cpu.requestInterrupt(4)
;   Level 5 ($074): 用户定义       cpu.requestInterrupt(5)
;   Level 6 ($078): 用户定义       cpu.requestInterrupt(6)
;   Level 7 ($07C): NMI 不可屏蔽   (任何中断源都可触发)
;
; ■ Interrupt Flow (CPU hardware)
;   1. CPU checks: pendingIrq > SR interrupt-mask (bits 8-10)
;   2. Saves state:  push PC (4 bytes), push SR (2 bytes)
;   3. mask = current level
;   4. Reads vector from table → jumps to handler
;   5. Handler runs ... ends with RTE
;   6. RTE restores:  pop SR, pop PC → resumes original code
;
; ■ ISR Rules
;   • Only save registers that the ISR CLOBBERS.
;     (If you save D2 and then modify D2 in the ISR,
;      your change will be lost when you pop the old D2 back!)
;   • RTE pops SR and PC only.  Data registers are NOT restored.
;   • Keep ISRs SHORT.  Long ISRs block other interrupts.
;   • For nested interrupts: temporarily lower the mask via SR.
;
; ===============================================================
; This demo: VBlank ISR moves a dot.  Keyboard ISR changes color.
; ===============================================================

        ORG     $4000

START:
        ; --- Install TWO interrupt vectors ---
        ; Level 2 (keyboard) → KBD_ISR
        ; Level 3 (VBlank)   → VB_ISR
        MOVE.L  #KBD_ISR, $068
        MOVE.L  #VB_ISR,  $06C

        ; --- Clear display to black ---
        MOVEQ   #7,D0
        TRAP    #15

        ; --- Initial state for the dot ---
        MOVE.L  #128,D2             ; x = center
        MOVE.L  #128,D3             ; y = center
        MOVEQ   #$FF,D4             ; pixel color (starts white)
        MOVEQ   #0,D6               ; color step counter

        JSR     DRAW                ; show initial dot

; ===== Main loop: just spin =====
; All real work happens in the ISRs below.
; VBlank fires 60/sec → redraws dot.
; Keyboard fires on key press → toggles color.
MAIN:   BRA     MAIN

; ===============================================================
; Level 2 ISR  —  Keyboard / Button Interrupt
; ===============================================================
; Fires when you press any keyboard key or the A/B buttons.
; Cycles the pixel color through 4 shades: white→gray→dark→black→white...
;
KBD_ISR:
        ; No registers to save here — we don't call any subroutines
        ; that clobber things, just simple arithmetic.

        ADDQ    #1,D6               ; increment color step
        ANDI    #3,D6               ; wrap to 0..3

        ; Map step → color value
        MOVEQ   #$FF,D4             ; default: white
        TST     D6
        BEQ     .done               ; step 0 → white ($FF)
        MOVEQ   #$80,D4             ; step 1 → gray
        CMPI    #1,D6
        BEQ     .done
        MOVEQ   #$40,D4             ; step 2 → dark gray
        CMPI    #2,D6
        BEQ     .done
        MOVEQ   #$10,D4             ; step 3 → near-black

.done:  RTE

; ===============================================================
; Level 3 ISR  —  VBlank Interrupt (~60 Hz)
; ===============================================================
; Fires every animation frame while Run is active.
; Reads D-Pad input, moves the dot, redraws it.
;
; Registers used: A0, D0 (by DRAW subroutine — must save!)
; Registers modified: D2, D3 (these are the dot position; must NOT save!)
;
VB_ISR:
        ; Save scratch registers that DRAW will overwrite
        MOVE.L  A0,-(A7)
        MOVE.L  D0,-(A7)

        ; --- Read D-Pad (memory-mapped I/O at $FE0000-$FE0003) ---
        TST.B   $FE0000             ; Up?
        BEQ     .1
        TST     D3
        BEQ     .1
        SUBQ    #1,D3
.1:     TST.B   $FE0001             ; Down?
        BEQ     .2
        CMPI    #255,D3
        BEQ     .2
        ADDQ    #1,D3
.2:     TST.B   $FE0002             ; Left?
        BEQ     .3
        TST     D2
        BEQ     .3
        SUBQ    #1,D2
.3:     TST.B   $FE0003             ; Right?
        BEQ     .draw
        CMPI    #255,D2
        BEQ     .draw
        ADDQ    #1,D2

.draw:  JSR     DRAW                ; redraw at current (x,y) with D4 color

        ; Restore scratch registers
        MOVE.L  (A7)+,D0
        MOVE.L  (A7)+,A0
        RTE

; ===============================================================
; Subroutine: draw pixel at (D2,D3) with color D4
; Clobbers: A0, D0  (caller must save/restore if needed)
; ===============================================================
DRAW:   LEA     $FF0000,A0
        MOVE.L  D3,D0
        LSL     #8,D0               ; y * 256
        ADD     D2,D0               ; + x
        ADDA.L  D0,A0               ; A0 = $FF0000 + y*256 + x
        MOVE.B  D4,(A0)             ; write pixel
        RTS

        END     START` },

  {
    name: 'S4. Shoot-em-up',
    code: `// ★ SHOOT-EM-UP ★ (VBlank ISR)
// ← → move  A fire  B restart

func plot(x, y, c) { poke(0xFF0000 + y*256 + x, c); }

func draw_ship() {
    plot(px-2, 229, 192); plot(px+2, 229, 192);
    plot(px-1, 230, 255); plot(px, 230, 255); plot(px+1, 230, 255);
    plot(px, 229, 255);
}
func erase_ship() {
    plot(px-2, 229, 0); plot(px+2, 229, 0);
    plot(px-1, 230, 0); plot(px, 230, 0); plot(px+1, 230, 0);
    plot(px, 229, 0);
}

// HUD — lives as dots, score bar. Always draws 0 (black) for unused slots
func draw_hud(s, l) {
    if (l >= 1) { plot(4, 4, 255); } else { plot(4, 4, 0); }
    if (l >= 2) { plot(10, 4, 255); } else { plot(10, 4, 0); }
    if (l >= 3) { plot(16, 4, 255); } else { plot(16, 4, 0); }
    var x = 0;
    while (x < 40) { plot(250-x, 4, 0); x = x + 1; }
    x = 0;
    while (x < s && x < 40) { plot(250-x, 4, 128); x = x + 1; }
}

func onISR3() {
    // 1. Erase sprites
    erase_ship();
    if (bu) { plot(bu & 255, bu >> 8, 0); }
    if (en) {
        plot(en & 255, en >> 8, 0); plot((en & 255)+1, en >> 8, 0);
        plot(en & 255, (en >> 8)+1, 0); plot((en & 255)+1, (en >> 8)+1, 0);
    }

    // 2. Input
    if (peek(0xFE0002) && px > 4)  { px = px - 4; }
    if (peek(0xFE0003) && px < 250) { px = px + 4; }
    if (peek(0xFE0004) && bu == 0) { bu = (226 << 8) | px; }
    if (peek(0xFE0005)) { score = 0; lives = 3; bu = 0; en = 0; }

    // 3. Random spawn (simple LCG)
    seed = (seed * 13 + 7) & 255;
    if (en == 0) { en = (8 << 8) | (seed + 8); }

    // 4. Move enemy (+1 px/frame)
    if (en) {
        if ((en >> 8) > 247) { en = 0; lives = lives - 1; }
        else { en = en + 256; }
    }

    // 5. Move bullet (-5 px/frame)
    if (bu) {
        if ((bu >> 8) < 9) { bu = 0; }
        else { bu = bu - (5 << 8); }
    }

    // 6. Collision — 41x41 hitbox
    if (bu && en) {
        if ((bu & 255) >= (en & 255)-20 && (bu & 255) <= (en & 255)+21 &&
            (bu >> 8) >= (en >> 8)-20 && (bu >> 8) <= (en >> 8)+21) {
            score = score + 1;
            plot(en & 255, en >> 8, 0); plot((en & 255)+1, en >> 8, 0);
            plot(en & 255, (en >> 8)+1, 0); plot((en & 255)+1, (en >> 8)+1, 0);
            en = 0; bu = 0;
        }
    }

    // 7. Draw sprites
    draw_ship();
    if (bu) { plot(bu & 255, bu >> 8, 255); }
    if (en) {
        plot(en & 255, en >> 8, 192); plot((en & 255)+1, en >> 8, 192);
        plot(en & 255, (en >> 8)+1, 192); plot((en & 255)+1, (en >> 8)+1, 192);
    }

    // 8. HUD
    draw_hud(score, lives);
    if (lives == 0) { halt(); }
}

var px = 128;
var bu = 0;
var en = 0;
var score = 0;
var lives = 3;
var seed = 123;

clear();
while (1) {}
` },

  { name: 'S1. Script: Moving Dot', code: `// Moving dot — use D-Pad
func draw(x, y, c) {
    poke(0xFF0000 + y*256 + x, c);
}

var x = 128;
var y = 128;
while (1) {
    if (peek(0xFE0002)) { x = x - 2; }
    if (peek(0xFE0003)) { x = x + 2; }
    if (peek(0xFE0000)) { y = y - 2; }
    if (peek(0xFE0001)) { y = y + 2; }
    draw(x, y, 255);
}` },

  { name: 'S2. Script: Enemies', code: `// Enemy game
func pixel(x, y, c) {
    poke(0xFF0000 + y*256 + x, c);
}

var px = 128;
var ex = 80;
var ey = 0;
while (1) {
    if (peek(0xFE0002)) { px = px - 4; }
    if (peek(0xFE0003)) { px = px + 4; }
    ey = ey + 2;
    if (ey > 240) { ey = 0; }
    pixel(px, 230, 255);
    pixel(ex, ey, 180);
}` },

  { name: 'S3. Script: Interrupt', code: `// ISR-driven game via func onISR3
func plot(x, y, c) {
    poke(0xFF0000 + y*256 + x, c);
}
func onISR3() {
    if (peek(0xFE0002)) { x = x - 4; }
    if (peek(0xFE0003)) { x = x + 4; }
    if (peek(0xFE0000)) { y = y - 4; }
    if (peek(0xFE0001)) { y = y + 4; }
    plot(x, y, 255);
}
var x = 128;
var y = 128;
while (1) {}` },

]

const selectedExample = ref('')
const rightTab = ref<'mem' | 'io'>('mem')
const editorTab = ref<'asm' | 'script'>('asm')
const code = ref(examples[0].code)
const scriptCode = ref(`// Script language — see examples below
// I/O addresses: $FE0000-$FE0005 = input
//                $FF0000-$FFFFFF = display (256x256)
//
// Built-in: peek(addr) poke(addr,val) halt()
// Special: func onISR1…onISR7() = auto-install interrupt vector
`)

function selectExample(name: string): void {
  selectedExample.value = name
  doReset()
  const ex = examples.find(e => e.name === name)
  if (ex) {
    if (ex.name.startsWith('S')) {
      scriptCode.value = ex.code
      editorTab.value = 'script'
    } else {
      code.value = ex.code
    }
  }
}

function doAssemble(): void {
  if (editorTab.value === 'script') {
    const compiler = new ScriptCompiler()
    const result = compiler.compile(scriptCode.value)
    if (result.errors.length > 0) {
      errors.value = result.errors
      return
    }
    code.value = result.asm
    editorTab.value = 'asm'
    errors.value = []
    assemble(result.asm)
  } else {
    assemble(code.value)
  }
}
function doStep(): void { step() }
function doRun(): void { run() }
function doRunToLine(line: number): void { runToLine(line) }

function doReset(): void {
  reset()
  errors.value = []
}

function doClearOutput(): void { output.value = '' }

const canRun = computed(() => state.value === 'idle' || state.value === 'paused' || state.value === 'running')
const canStep = computed(() => state.value === 'idle' || state.value === 'paused')
</script>

<style scoped>
/* ===== Shared ===== */
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
.editor-tabs {
  display: flex;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}
.editor-tabs .tab-btn {
  padding: 3px 14px;
  font-size: 11px;
  font-family: inherit;
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 2px solid transparent;
}
.editor-tabs .tab-btn.active {
  color: #d4d4d4;
  border-bottom-color: #0e639c;
}
.editor-tabs .tab-btn:hover { color: #ccc; }
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
.right-tabs {
  display: flex;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}
.tab-btn {
  padding: 3px 14px;
  font-size: 11px;
  font-family: inherit;
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 2px solid transparent;
}
.tab-btn.active {
  color: #d4d4d4;
  border-bottom-color: #0e639c;
}
.tab-btn:hover { color: #ccc; }
.right-top { flex: 1; overflow: hidden; }
.io-split { display: flex; flex-direction: column; gap: 0; }
.io-display { flex: 1; overflow: hidden; min-height: 0; }
.io-input { flex-shrink: 0; }
.right-bottom { height: 200px; overflow: hidden; }

/* ===== Mobile ===== */
.mobile-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mobile-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Mobile editor tabs */
.mobile-editor-tabs {
  display: flex;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
  padding: 0 4px;
}
.m-tab-btn {
  padding: 6px 16px;
  font-size: 12px;
  font-family: inherit;
  background: transparent;
  border: none;
  color: #999;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 2px solid transparent;
}
.m-tab-btn.active {
  color: #d4d4d4;
  border-bottom-color: #0e639c;
}

.mobile-editor { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.mobile-editor > :deep(.editor-wrapper) { flex: 1; }

.mobile-regs {
  flex-shrink: 0;
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid #3c3c3c;
}

/* Game tab */
.mobile-game-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mobile-display { flex: 1; min-height: 0; overflow: hidden; }
.mobile-input { flex-shrink: 0; }
.mobile-regs-compact {
  flex-shrink: 0;
  max-height: 130px;
  overflow-y: auto;
  border-top: 1px solid #3c3c3c;
}

/* Debug tab */
.mobile-debug-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mobile-memory { flex: 1; min-height: 0; overflow: hidden; }
.mobile-output { height: 120px; flex-shrink: 0; overflow: hidden; border-top: 1px solid #3c3c3c; }

/* Bottom tab bar */
.mobile-tab-bar {
  display: flex;
  background: #252526;
  border-top: 1px solid #3c3c3c;
  flex-shrink: 0;
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.mobile-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 4px 8px;
  border: none;
  background: transparent;
  color: #888;
  cursor: pointer;
  font-family: inherit;
  font-size: 10px;
  position: relative;
  -webkit-tap-highlight-color: transparent;
}
.mobile-tab.active {
  color: #4ec9b0;
}
.mobile-tab.active::after {
  content: '';
  position: absolute;
  top: 0; left: 20%; right: 20%;
  height: 2px;
  background: #4ec9b0;
  border-radius: 0 0 2px 2px;
}
.m-tab-icon { font-size: 18px; line-height: 1; }
.m-tab-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
</style>
