import type { MemoryRegion } from './types'

const MEMORY_SIZE = 1024 * 1024        // 1MB
const ADDR_MASK = MEMORY_SIZE - 1       // 0xFFFFF

export class Memory {
  private mem: Uint8Array
  public regions: MemoryRegion[] = []

  constructor() {
    this.mem = new Uint8Array(MEMORY_SIZE)
  }

  reset(): void {
    this.mem.fill(0)
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

  private mask(addr: number): number {
    return addr & ADDR_MASK
  }

  readByte(addr: number): number {
    return this.mem[this.mask(addr)]
  }

  readWord(addr: number): number {
    const a = this.mask(addr)
    return ((this.mem[a] << 8) | this.mem[this.mask(a + 1)]) >>> 0
  }

  readLong(addr: number): number {
    const w1 = this.readWord(addr)
    const w2 = this.readWord(addr + 2)
    return ((w1 << 16) | w2) >>> 0
  }

  writeByte(addr: number, value: number): void {
    this.mem[this.mask(addr)] = value & 0xFF
  }

  writeWord(addr: number, value: number): void {
    const a = this.mask(addr)
    this.mem[a] = (value >> 8) & 0xFF
    this.mem[this.mask(a + 1)] = value & 0xFF
  }

  writeLong(addr: number, value: number): void {
    this.writeWord(addr, (value >> 16) & 0xFFFF)
    this.writeWord(addr + 2, value & 0xFFFF)
  }

  readRange(addr: number, length: number): number[] {
    const result: number[] = []
    for (let i = 0; i < length; i++) {
      result.push(this.readByte(addr + i))
    }
    return result
  }

  getSize(): number { return MEMORY_SIZE }

  /** display-safe byte fetch – used by MemoryPanel */
  getByte(offset: number): number {
    const o = this.mask(offset)
    if (o < 0 || o >= MEMORY_SIZE) return 0
    return this.mem[o]
  }
}
