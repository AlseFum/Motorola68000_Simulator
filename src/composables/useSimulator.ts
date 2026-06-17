import { reactive, ref } from 'vue'
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
    const ok = cpu.step()
    updateSnapshot()
    return ok
  }

  function run(): void {
    cpu.run()
    updateSnapshot()
  }

  function reset(): void {
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

  return {
    cpu, assembler, snapshot, state, output, errors, currentLine, instructions,
    assemble, step, run, reset, toggleBreakpoint, setRegistry, updateSnapshot
  }
}
