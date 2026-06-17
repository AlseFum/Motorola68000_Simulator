export type RegName = `D${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}` | `A${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`
export type AddrMode = 'Dn' | 'An' | '(An)' | '-(An)' | '(An)+' | 'd16(An)' | '(xxx).W' | '(xxx).L' | '#imm' | '#data' | 'd16(PC)' | 'label'

export interface Operand {
  mode: AddrMode
  reg?: number
  value?: number
  size: Size
}

export type Size = 1 | 2 | 4  // byte, word, long

export interface DecodedInstr {
  opcode: number
  mnemonic: string
  size: Size
  src?: Operand
  dst?: Operand
  condition?: number  // for Bcc
}

export interface Symbol {
  name: string
  address: number
  isLabel: boolean
  isEqu: boolean
  equValue?: number
}

export interface AssemblyLine {
  address: number
  line: string
  label?: string
  mnemonic?: string
  operands?: string[]
  comment?: string
}

export interface AssemblerResult {
  success: boolean
  code: number[]
  symbols: Map<string, Symbol>
  errors: string[]
  sourceLines: AssemblyLine[]
  lineToAddress: Map<number, number>  // source line -> machine code address
}

export interface CPUSnapshot {
  d: number[]   // D0-D7
  a: number[]   // A0-A7
  pc: number
  sr: number
  usp: number
  ssp: number
  cycles: number
}

export interface MemoryRegion {
  start: number
  data: number[]
}

export type SimulatorState = 'idle' | 'running' | 'paused' | 'finished' | 'error'
