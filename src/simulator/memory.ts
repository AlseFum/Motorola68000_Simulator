import type { MemoryRegion } from './types'

const MEMORY_SIZE = 1024 * 1024        // 1MB main memory
const ADDR_MASK = MEMORY_SIZE - 1       // 0xFFFFF

// Memory-mapped display: 256x256 pixels, 1 byte = grayscale
// Mapped at $FF0000 - $FFFFFFF (64KB at top of 1MB space)
// Memory-mapped display: 256x256 pixels, 1 byte = grayscale
// Mapped at $FF0000 - $FFFFFFF (64KB at top of 1MB space)
export const DISPLAY_BASE = 0xFF0000
export const DISPLAY_SIZE = 256 * 256  // 64KB
export const DISPLAY_W = 256
export const DISPLAY_H = 256

// Memory-mapped input: $FE0000 - $FE00FF (256 bytes for input devices)
export const INPUT_BASE = 0xFE0000
export const INPUT_SIZE = 256

// Input register offsets
export const INPUT_UP    = 0  // $FE0000
export const INPUT_DOWN  = 1  // $FE0001
export const INPUT_LEFT  = 2  // $FE0002
export const INPUT_RIGHT = 3  // $FE0003
export const INPUT_A     = 4  // $FE0004
export const INPUT_B     = 5  // $FE0005

export class Memory {
  private mem: Uint8Array
  public regions: MemoryRegion[] = []

  // display buffer (memory-mapped I/O)
  public displayBuf: Uint8Array
  public displayDirty = false

  // input buffer (memory-mapped input)
  public inputBuf: Uint8Array

  constructor() {
    this.mem = new Uint8Array(MEMORY_SIZE)
    this.displayBuf = new Uint8Array(DISPLAY_SIZE)
    this.inputBuf = new Uint8Array(INPUT_SIZE)
  }

  reset(): void {
    this.mem.fill(0)
    this.displayBuf.fill(0x10)
    this.displayDirty = true
    this.inputBuf.fill(0)
    this.regions = []
  }

  loadProgram(code: number[], baseAddr: number = 0x4000): void {
    for (let i = 0; i < code.length; i++) {
      const addr = (baseAddr + i * 2) & ADDR_MASK
      const val = code[i] & 0xFFFF
      this.mem[addr] = (val >> 8) & 0xFF
      this.mem[(addr + 1) & ADDR_MASK] = val & 0xFF
    }
    this.regions.push({ start: baseAddr, data: [...code] })
  }

  private isDisplay(addr: number): boolean {
    const a = addr & 0xFFFFFF
    return a >= DISPLAY_BASE && a < DISPLAY_BASE + DISPLAY_SIZE
  }

  private isInput(addr: number): boolean {
    const a = addr & 0xFFFFFF
    return a >= INPUT_BASE && a < INPUT_BASE + INPUT_SIZE
  }

  private dispIdx(addr: number): number {
    return (addr & 0xFFFFFF) - DISPLAY_BASE
  }

  private inputIdx(addr: number): number {
    return (addr & 0xFFFFFF) - INPUT_BASE
  }

  /** called by InputPanel when a button is pressed/released */
  setInput(offset: number, value: number): void {
    if (offset >= 0 && offset < INPUT_SIZE) {
      this.inputBuf[offset] = value & 0xFF
    }
  }

  /** pulse: set to 1 then back to 0 after a short delay (edge trigger) */
  pulseInput(offset: number): void {
    if (offset >= 0 && offset < INPUT_SIZE) {
      this.inputBuf[offset] = 1
      setTimeout(() => { this.inputBuf[offset] = 0 }, 50)
    }
  }

  private mask(addr: number): number {
    return addr & ADDR_MASK
  }

  readByte(addr: number): number {
    if (this.isInput(addr)) return this.inputBuf[this.inputIdx(addr)]
    if (this.isDisplay(addr)) return this.displayBuf[this.dispIdx(addr)]
    return this.mem[this.mask(addr)]
  }

  readWord(addr: number): number {
    if (this.isInput(addr)) {
      const i = this.inputIdx(addr)
      return ((this.inputBuf[i] << 8) | this.inputBuf[i + 1]) >>> 0
    }
    if (this.isDisplay(addr)) {
      const i = this.dispIdx(addr)
      return ((this.displayBuf[i] << 8) | this.displayBuf[i + 1]) >>> 0
    }
    const a = this.mask(addr)
    return ((this.mem[a] << 8) | this.mem[this.mask(a + 1)]) >>> 0
  }

  readLong(addr: number): number {
    if (this.isInput(addr) || this.isDisplay(addr)) {
      const w1 = this.readWord(addr)
      const w2 = this.readWord(addr + 2)
      return ((w1 << 16) | w2) >>> 0
    }
    const w1 = this.readWord(addr)
    const w2 = this.readWord(addr + 2)
    return ((w1 << 16) | w2) >>> 0
  }

  writeByte(addr: number, value: number): void {
    if (this.isInput(addr)) return  // input is read-only
    if (this.isDisplay(addr)) {
      const idx = this.dispIdx(addr)
      if (this.displayBuf[idx] !== (value & 0xFF)) {
        this.displayBuf[idx] = value & 0xFF
        this.displayDirty = true
      }
      return
    }
    this.mem[this.mask(addr)] = value & 0xFF
  }

  writeWord(addr: number, value: number): void {
    if (this.isInput(addr)) return
    if (this.isDisplay(addr)) {
      const i = this.dispIdx(addr)
      const b1 = (value >> 8) & 0xFF, b2 = value & 0xFF
      if (this.displayBuf[i] !== b1 || this.displayBuf[i + 1] !== b2) {
        this.displayBuf[i] = b1
        this.displayBuf[i + 1] = b2
        this.displayDirty = true
      }
      return
    }
    const a = this.mask(addr)
    this.mem[a] = (value >> 8) & 0xFF
    this.mem[this.mask(a + 1)] = value & 0xFF
  }

  writeLong(addr: number, value: number): void {
    if (this.isDisplay(addr)) {
      this.writeWord(addr, (value >> 16) & 0xFFFF)
      this.writeWord(addr + 2, value & 0xFFFF)
      return
    }
    this.writeWord(addr, (value >> 16) & 0xFFFF)
    this.writeWord(addr + 2, value & 0xFFFF)
  }

  readRange(addr: number, length: number): number[] {
    const result: number[] = []
    for (let i = 0; i < length; i++) result.push(this.readByte(addr + i))
    return result
  }

  getSize(): number { return MEMORY_SIZE }

  getByte(offset: number): number {
    if (this.isInput(offset)) return this.inputBuf[this.inputIdx(offset)]
    if (this.isDisplay(offset)) return this.displayBuf[this.dispIdx(offset)]
    const o = this.mask(offset)
    if (o < 0 || o >= MEMORY_SIZE) return 0
    return this.mem[o]
  }

  consumeDirty(): boolean {
    const was = this.displayDirty
    this.displayDirty = false
    return was
  }
}
