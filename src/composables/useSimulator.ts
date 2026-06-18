import { reactive, ref, onMounted, onUnmounted } from 'vue'
import { M68K, Assembler } from '../simulator'
import type { CPUSnapshot, SimulatorState, Instruction } from '../simulator'

export function useSimulator() {
  const cpu = new M68K()
  const assembler = new Assembler()
  const snapshot = reactive<CPUSnapshot>(cpu.snapshot())
  const state = ref<SimulatorState>('idle')
  const output = ref('')
  const errors = ref<string[]>([])
  const currentLine = ref<number>(-1)
  const instructions = ref<Instruction[]>([])
  let runRaf = 0

  // Keyboard → memory-mapped input + level 1/2 interrupt
  const keyMap: Record<string, number> = {
    ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3,
    w: 0, s: 1, a: 2, d: 3,
    ' ': 4, Enter: 4,      // A button
    Shift: 5,              // B button
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const idx = keyMap[e.key]
    if (idx !== undefined) {
      cpu.memory.setInput(idx, 1)
      cpu.requestInterrupt(idx < 4 ? 1 : 2)
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    const idx = keyMap[e.key]
    if (idx !== undefined) cpu.memory.setInput(idx, 0)
  }
  onMounted(() => {
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
  })
  onUnmounted(() => {
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('keyup', onKeyUp)
  })

  function updateSnapshot(): void {
    Object.assign(snapshot, cpu.snapshot())
    state.value = cpu.state
    output.value = cpu.output
    if (cpu.instrIndex < cpu.program.length && cpu.instrIndex >= 0) {
      const inst = cpu.program[cpu.instrIndex]
      currentLine.value = inst.sourceLine ?? -1
    }
  }

  function assemble(code: string): boolean {
    stop()
    errors.value = []
    const result = assembler.assemble(code)
    if (result.errors.length > 0) {
      errors.value = result.errors
      return false
    }
    cpu.reset()
    cpu.loadProgram(result.instructions)
    cpu.memory.loadProgram(result.instructions.flatMap(i => i.words))
    instructions.value = result.instructions
    currentLine.value = result.instructions[0]?.sourceLine ?? -1
    updateSnapshot()
    return true
  }

  function step(): boolean {
    stop()
    const ok = cpu.step()
    updateSnapshot()
    return ok
  }

  function run(): void {
    if (state.value === 'running') { stop(); return }
    if (state.value === 'finished' || state.value === 'error') return
    cpu.state = 'running'
    state.value = 'running'
    runLoop()
  }

  function runLoop(): void {
    const batchSize = 2000
    for (let i = 0; i < batchSize; i++) {
      cpu.state = 'running'
      if (!cpu.step()) { updateSnapshot(); return }
    }
    // Fire VBlank interrupt each frame (~60Hz)
    cpu.requestInterrupt(3)
    updateSnapshot()
    runRaf = requestAnimationFrame(runLoop)
  }

  function stop(): void {
    if (runRaf) { cancelAnimationFrame(runRaf); runRaf = 0 }
    if (cpu.state === 'running') cpu.state = 'paused'
    updateSnapshot()
  }

  function reset(): void {
    stop()
    cpu.reset()
    errors.value = []
    output.value = ''
    currentLine.value = -1
    updateSnapshot()
  }

  function toggleBreakpoint(addr: number): void {
    cpu.toggleBreakpoint(addr)
  }

  function setRegistry(reg: string, value: number): void {
    const match = reg.match(/^([DA])(\d)$/i)
    if (match) {
      const idx = parseInt(match[2])
      if (match[1].toUpperCase() === 'D') cpu.d[idx] = value | 0
      else cpu.a[idx] = value >>> 0
    }
    updateSnapshot()
  }

  function runToLine(line: number): void {
    stop()
    const targetAddrs: number[] = []
    for (const inst of instructions.value) {
      if (inst.sourceLine !== undefined && inst.sourceLine >= line) {
        targetAddrs.push(inst.addr)
      }
    }
    if (targetAddrs.length === 0) { run(); return }
    const targetAddr = targetAddrs[0]
    cpu.toggleBreakpoint(targetAddr)
    cpu.run()
    cpu.toggleBreakpoint(targetAddr)
    updateSnapshot()
  }

  function irq(level: number): void {
    cpu.requestInterrupt(level)
  }

  return {
    cpu, assembler, snapshot, state, output, errors, currentLine, instructions,
    assemble, step, run, stop, reset, toggleBreakpoint, setRegistry, updateSnapshot, runToLine, irq
  }
}
