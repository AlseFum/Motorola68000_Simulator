import { Memory } from './memory'
import type { CPUSnapshot, SimulatorState, Size } from './types'

function u32(v: number): number { return v >>> 0 }
function s32(v: number): number { return v | 0 }
function sext(v: number, bits: number): number {
  const mask = (1 << bits) - 1; const msb = 1 << (bits - 1)
  const m = v & mask; return (m & msb) ? m - (mask + 1) : m
}
function bcdAdd(a: number, b: number): { val: number; c: boolean; x: boolean } {
  let lo = (a & 0xF) + (b & 0xF); let c = false
  if (lo > 9) { lo += 6; c = true }
  lo &= 0xF; let hi = ((a >> 4) & 0xF) + ((b >> 4) & 0xF) + (c ? 1 : 0)
  c = false; if (hi > 9) { hi += 6; c = true }
  hi &= 0xF; return { val: (hi << 4) | lo, c, x: c }
}
function bcdSub(a: number, b: number): { val: number; c: boolean; x: boolean } {
  let c = false; let lo = (a & 0xF) - (b & 0xF)
  if (lo < 0) { lo -= 6; c = true }
  lo &= 0xF; let hi = ((a >> 4) & 0xF) - ((b >> 4) & 0xF) - (c ? 1 : 0)
  c = false; if (hi < 0) { hi -= 6; c = true }
  hi &= 0xF; return { val: (hi << 4) | lo, c, x: c }
}

export interface OperandInfo { t: 'dn' | 'an' | 'ind' | 'post' | 'pre' | 'disp' | 'abs' | 'imm' | 'pc' | 'idx'; reg: number; disp?: number; idxReg?: number; idxSize?: number; idxScale?: number }
export interface Instruction {
  addr: number; mnemonic: string; size: Size; byteSize: number
  src?: OperandInfo; dst?: OperandInfo; imm?: number; cond?: number; targetAddr?: number; regList?: number; words: number[]
  sourceLine?: number
}

type Exec = (c: M68K, i: Instruction) => void

export class M68K {
  d = new Int32Array(8); a = new Uint32Array(8); pc = 0; sr = 0; cycles = 0
  memory: Memory; state: SimulatorState = 'idle'; program: Instruction[] = []
  instrIndex = 0; breakpoints = new Set<number>(); output = ''
  private _halt = false; private _stopped = false; private em = new Map<string, Exec>()

  constructor() { this.memory = new Memory(); this._init() }
  private _init(): void {
    const x = this.em
    x.set('NOP', () => {})        ; x.set('MOVE', this.iMOVE)
    x.set('MOVEQ', this.iMOVEQ)   ; x.set('MOVEA', this.iMOVEA)
    x.set('ADD', this.iADD)       ; x.set('SUB', this.iADD)
    x.set('AND', this.iLOGIC)     ; x.set('OR', this.iLOGIC) ; x.set('EOR', this.iLOGIC)
    x.set('ADDA', this.iADDA)    ; x.set('SUBA', this.iSUBA); x.set('CMPA', this.iCMPA)
    x.set('ADDI', this.iARITHI)   ; x.set('SUBI', this.iARITHI); x.set('ANDI', this.iARITHI)
    x.set('ORI', this.iARITHI)    ; x.set('EORI', this.iARITHI); x.set('CMPI', this.iCMPI)
    x.set('CMP', this.iCMP)       ; x.set('MULS', this.iMULS); x.set('MULU', this.iMULU)
    x.set('DIVS', this.iDIVS)     ; x.set('DIVU', this.iDIVU)
    x.set('MULS.L', this.iMULSL)  ; x.set('MULU.L', this.iMULUL)
    x.set('DIVS.L', this.iDIVSL)  ; x.set('DIVU.L', this.iDIVUL)
    x.set('TST', this.iTST)       ; x.set('CLR', this.iCLR)
    x.set('NEG', this.iNEG)       ; x.set('NOT', this.iNOT)
    x.set('NEGX', this.iNEGX)     ; x.set('EXT', this.iEXT)
    x.set('ADDX', this.iADDX)     ; x.set('SUBX', this.iSUBX)
    x.set('ABCD', this.iABCD)     ; x.set('SBCD', this.iABCD)
    x.set('LSL', this.iSHIFT)     ; x.set('LSR', this.iSHIFT)
    x.set('ASL', this.iSHIFT)     ; x.set('ASR', this.iSHIFT)
    x.set('ROL', this.iROTATE)    ; x.set('ROR', this.iROTATE)
    x.set('ROXL', this.iROTATE)   ; x.set('ROXR', this.iROTATE)
    x.set('SWAP', this.iSWAP)     ; x.set('EXG', this.iEXG)
    x.set('LEA', this.iLEA)       ; x.set('PEA', this.iPEA)
    x.set('LINK', this.iLINK)     ; x.set('UNLK', this.iUNLK)
    x.set('BRA', this.iBRA)       ; x.set('BSR', this.iBSR)
    x.set('JSR', this.iJSR)       ; x.set('RTS', this.iRTS) ; x.set('RTE', this.iRTE)
    x.set('JMP', this.iJMP)       ; x.set('TRAP', this.iTRAP)
    x.set('ADDQ', this.iQUICK)    ; x.set('SUBQ', this.iQUICK)
    x.set('BTST', this.iBTST)     ; x.set('BSET', this.iBSET)
    x.set('BCLR', this.iBSET)     ; x.set('BCHG', this.iBSET)
    x.set('CMPM', this.iCMPM)     ; x.set('TAS', this.iTAS)
    x.set('CHK', this.iCHK)       ; x.set('DBRA', this.iDBcc)
    x.set('ILLEGAL', this.iILLEGAL); x.set('STOP', this.iSTOP)
    x.set('MOVE_SR', this.iMOVESR); x.set('MOVE_CCR', this.iMOVECCR)
    x.set('HALT', this.iHALT)     ; x.set('DC.B', () => {})
    x.set('DC.W', () => {})       ; x.set('DC.L', () => {})
    const bcc = ['BRA','','BHI','BLS','BCC','BCS','BNE','BEQ','BVC','BVS','BPL','BMI','BGE','BLT','BGT','BLE']
    for (let i = 2; i <= 15; i++) x.set(bcc[i], this.iBRA)
    // Scc: ST(0) through SLE(15), skip 1(F)
    const scc = ['ST','SF','SHI','SLS','SCC','SCS','SNE','SEQ','SVC','SVS','SPL','SMI','SGE','SLT','SGT','SLE']
    for (const s of scc) x.set(s, this.iScc)
    // DBcc
    const dbc = ['DBT','DBF','DBHI','DBLS','DBCC','DBCS','DBNE','DBEQ','DBVC','DBVS','DBPL','DBMI','DBGE','DBLT','DBGT','DBLE']
    for (const d of dbc) x.set(d, this.iDBcc)
  }
  reset(): void {
    this.d.fill(0); this.a.fill(0); this.pc = 0; this.sr = 0
    this.cycles = 0; this.state = 'idle'; this.memory.reset()
    this.program = []; this.instrIndex = 0; this.output = ''
    this.breakpoints.clear(); this._halt = false; this._stopped = false
  }
  loadProgram(prog: Instruction[], baseAddr = 0x4000): void {
    this.program = prog; this.instrIndex = 0; this.pc = baseAddr
    this.a[7] = 0xF000; this.state = 'idle'
  }
  snapshot(): CPUSnapshot {
    return { d: Array.from(this.d), a: Array.from(this.a), pc: this.pc, sr: this.sr, usp: 0, ssp: 0, cycles: this.cycles }
  }
  toggleBreakpoint(addr: number): void { this.breakpoints.has(addr) ? this.breakpoints.delete(addr) : this.breakpoints.add(addr) }
  private get c() { return !!(this.sr & 1) }; private set c(v) { v ? this.sr |= 1 : this.sr &= ~1 }
  private get v() { return !!(this.sr & 2) }; private set v(v) { v ? this.sr |= 2 : this.sr &= ~2 }
  private get z() { return !!(this.sr & 4) }; private set z(v) { v ? this.sr |= 4 : this.sr &= ~4 }
  private get n() { return !!(this.sr & 8) }; private set n(v) { v ? this.sr |= 8 : this.sr &= ~8 }
  private get x() { return !!(this.sr & 16) }; private set x(v) { v ? this.sr |= 16 : this.sr &= ~16 }
  private fNZ(val: number, s: Size): void {
    const m = s === 1 ? 0xFF : s === 2 ? 0xFFFF : 0xFFFFFFFF
    const sb = s === 1 ? 0x80 : s === 2 ? 0x8000 : 0x80000000
    const r = val & m; this.z = r === 0; this.n = !!(r & sb)
  }
  private fNZVC(val: number, s: Size, carry: boolean, overflow: boolean): void {
    this.fNZ(val, s); this.c = carry; this.v = overflow; this.x = carry
  }
  private fNZVXC(val: number, s: Size, carry: boolean, overflow: boolean): void {
    this.fNZ(val, s); this.c = carry; this.v = overflow
  }

  // --- EA ---
  private rOp(op: OperandInfo, size: Size): number {
    switch (op.t) {
      case 'dn': return s32(this.d[op.reg])
      case 'an': return u32(this.a[op.reg])
      case 'ind': return this.mR(this.a[op.reg], size)
      case 'post': { const v = this.mR(this.a[op.reg], size); this.a[op.reg] = u32(this.a[op.reg] + (op.reg === 7 && size === 1 ? 2 : size)); return v }
      case 'pre': { const adj = (op.reg === 7 && size === 1) ? 2 : size; this.a[op.reg] = u32(this.a[op.reg] - adj); return this.mR(this.a[op.reg], size) }
      case 'disp': return this.mR(u32(this.a[op.reg] + sext(op.disp!, 16)), size)
      case 'abs': return this.mR(u32(op.disp!), size)
      case 'imm': return size === 4 ? u32(op.disp!) : (size === 2 ? (op.disp! & 0xFFFF) : (op.disp! & 0xFF))
      case 'pc': return this.mR(u32(this.pc + sext(op.disp!, 16)), size)
      case 'idx': { const idx = op.idxSize! ? s32(this.d[op.idxReg!]) : sext(this.d[op.idxReg!] & 0xFFFF, 16); return this.mR(u32(this.a[op.reg] + (idx << ((op.idxScale || 1) - 1 > 3 ? 0 : (op.idxScale || 1) - 1)) + sext(op.disp!, 8)), size) }
    }
    return 0
  }
  private wOp(op: OperandInfo, size: Size, val: number): void {
    switch (op.t) {
      case 'dn':
        if (size === 1) this.d[op.reg] = (this.d[op.reg] & 0xFFFFFF00) | (val & 0xFF)
        else if (size === 2) this.d[op.reg] = (this.d[op.reg] & 0xFFFF0000) | (val & 0xFFFF)
        else this.d[op.reg] = val | 0; break
      case 'an': this.a[op.reg] = u32(val); break
      case 'ind': this.mW(this.a[op.reg], size, val); break
      case 'post': { this.mW(this.a[op.reg], size, val); this.a[op.reg] = u32(this.a[op.reg] + (op.reg === 7 && size === 1 ? 2 : size)); break }
      case 'pre': { const adj = (op.reg === 7 && size === 1) ? 2 : size; this.a[op.reg] = u32(this.a[op.reg] - adj); this.mW(this.a[op.reg], size, val); break }
      case 'disp': this.mW(u32(this.a[op.reg] + sext(op.disp!, 16)), size, val); break
      case 'abs': this.mW(u32(op.disp!), size, val); break
      case 'idx': { const idx = op.idxSize! ? s32(this.d[op.idxReg!]) : sext(this.d[op.idxReg!] & 0xFFFF, 16); this.mW(u32(this.a[op.reg] + (idx << ((op.idxScale || 1) - 1 > 3 ? 0 : (op.idxScale || 1) - 1)) + sext(op.disp!, 8)), size, val); break }
    }
  }
  private eaAddr(op: OperandInfo): number {
    switch (op.t) {
      case 'ind': return this.a[op.reg]
      case 'post': { const a = this.a[op.reg]; this.a[op.reg] = u32(this.a[op.reg] + 4); return a }
      case 'pre': { this.a[op.reg] = u32(this.a[op.reg] - 4); return this.a[op.reg] }
      case 'disp': return u32(this.a[op.reg] + sext(op.disp!, 16))
      case 'abs': return u32(op.disp!)
      case 'pc': return u32(this.pc + sext(op.disp!, 16))
      case 'idx': { const idx = op.idxSize! ? s32(this.d[op.idxReg!]) : sext(this.d[op.idxReg!] & 0xFFFF, 16); return u32(this.a[op.reg] + (idx << ((op.idxScale || 1) - 1 > 3 ? 0 : (op.idxScale || 1) - 1)) + sext(op.disp!, 8)) }
      default: return 0
    }
  }
  private mR(addr: number, s: Size): number {
    if (s === 1) return this.memory.readByte(addr); if (s === 2) return this.memory.readWord(addr); return this.memory.readLong(addr)
  }
  private mW(addr: number, s: Size, v: number): void {
    if (s === 1) this.memory.writeByte(addr, v); else if (s === 2) this.memory.writeWord(addr, v); else this.memory.writeLong(addr, v)
  }
  private msb(s: Size): number { return s === 1 ? 0x80 : s === 2 ? 0x8000 : 0x80000000 }
  checkCond(cc: number): boolean {
    switch (cc) {
      case 0x0: return true; case 0x1: return false
      case 0x2: return !this.c && !this.z; case 0x3: return this.c || this.z
      case 0x4: return !this.c; case 0x5: return this.c
      case 0x6: return !this.z; case 0x7: return this.z
      case 0x8: return !this.v; case 0x9: return this.v
      case 0xA: return !this.n; case 0xB: return this.n
      case 0xC: return this.n === this.v; case 0xD: return this.n !== this.v
      case 0xE: return !this.z && this.n === this.v; case 0xF: return this.z || this.n !== this.v
      default: return false
    }
  }

  // --- Instructions ---
  private iMOVE = (c: M68K, i: Instruction): void => { const v = c.rOp(i.src!, i.size); c.wOp(i.dst!, i.size, v); c.fNZ(v, i.size); c.v = false; c.c = false }
  private iMOVEQ = (c: M68K, i: Instruction): void => { const v = sext(i.imm!, 8); c.d[i.dst!.reg] = v; c.fNZ(v, 4); c.v = false; c.c = false }
  private iMOVEA = (c: M68K, i: Instruction): void => { const v = c.rOp(i.src!, i.size); i.size === 2 ? c.a[i.dst!.reg] = u32(sext(v, 16)) : c.a[i.dst!.reg] = u32(v) }
  private iADDA = (c: M68K, i: Instruction): void => { const v = c.rOp(i.src!, i.size); const srcVal = i.size === 2 ? sext(v, 16) : s32(v); c.a[i.dst!.reg] = u32(c.a[i.dst!.reg] + srcVal) }
  private iSUBA = (c: M68K, i: Instruction): void => { const v = c.rOp(i.src!, i.size); const srcVal = i.size === 2 ? sext(v, 16) : s32(v); c.a[i.dst!.reg] = u32(c.a[i.dst!.reg] - srcVal) }

  private iADD = (c: M68K, i: Instruction): void => {
    const src = c.rOp(i.src!, i.size); const dst = c.rOp(i.dst!, i.size); const s = i.size
    const m = s === 1 ? 0xFF : s === 2 ? 0xFFFF : 0xFFFFFFFF; const sb = c.msb(s)
    let r: number
    if (i.mnemonic === 'ADD') { r = (dst + src) & m; c.fNZVC(r, s, (dst + src) > m, !((dst ^ src) & sb) && !!((r ^ dst) & sb)) }
    else { r = (dst - src) & m; c.fNZVC(r, s, src > dst, !!((dst ^ src) & sb) && !!((r ^ dst) & sb)) }
    c.wOp(i.dst!, s, r)
  }
  private iLOGIC = (c: M68K, i: Instruction): void => {
    const src = c.rOp(i.src!, i.size); const dst = c.rOp(i.dst!, i.size); const m = i.size === 1 ? 0xFF : i.size === 2 ? 0xFFFF : 0xFFFFFFFF
    let r: number
    if (i.mnemonic === 'AND') r = dst & src; else if (i.mnemonic === 'OR') r = dst | src; else r = dst ^ src
    r &= m; c.wOp(i.dst!, i.size, r); c.fNZ(r, i.size); c.v = false; c.c = false
  }
  private iARITHI = (c: M68K, i: Instruction): void => {
    const src = i.imm!; const dst = c.rOp(i.dst!, i.size); const s = i.size; const m = s === 1 ? 0xFF : s === 2 ? 0xFFFF : 0xFFFFFFFF; const sb = c.msb(s)
    switch (i.mnemonic) {
      case 'ADDI': case 'SUBI': { const r = i.mnemonic === 'ADDI' ? (dst + src) & m : (dst - src) & m; c.fNZVC(r, s, i.mnemonic === 'ADDI' ? (dst + src) > m : src > dst, !!((dst ^ src) & sb) && !!((r ^ dst) & sb)); c.wOp(i.dst!, s, r); break }
      case 'ANDI': case 'ORI': case 'EORI': { const r = i.mnemonic === 'ANDI' ? (dst & src) & m : i.mnemonic === 'ORI' ? (dst | src) & m : (dst ^ src) & m; c.wOp(i.dst!, s, r); c.fNZ(r, s); c.v = false; c.c = false; break }
    }
  }
  private iCMP = (c: M68K, i: Instruction): void => { const src = c.rOp(i.src!, i.size); const dst = c.rOp(i.dst!, i.size); const s = i.size; const m = s === 1 ? 0xFF : s === 2 ? 0xFFFF : 0xFFFFFFFF; const sb = c.msb(s); const r = (dst - src) & m; c.fNZVC(r, s, src > dst, !!((dst ^ src) & sb) && !!((r ^ dst) & sb)) }
  private iCMPA = (c: M68K, i: Instruction): void => { const src = c.rOp(i.src!, 4); const dst = c.a[i.dst!.reg]; const r = (dst - src) >>> 0; c.fNZVC(r, 4, src > dst, !!((dst ^ src) & 0x80000000) && !!((r ^ dst) & 0x80000000)) }
  private iCMPI = (c: M68K, i: Instruction): void => { const src = i.imm!; const dst = c.rOp(i.dst!, i.size); const s = i.size; const m = s === 1 ? 0xFF : s === 2 ? 0xFFFF : 0xFFFFFFFF; const sb = c.msb(s); const r = (dst - src) & m; c.fNZVC(r, s, src > dst, !!((dst ^ src) & sb) && !!((r ^ dst) & sb)) }
  private iMULS = (c: M68K, i: Instruction): void => { const src = sext(c.rOp(i.src!, 2), 16); c.d[i.dst!.reg] = s32(s32(c.d[i.dst!.reg] & 0xFFFF) * src); c.fNZ(c.d[i.dst!.reg], 4); c.v = false; c.c = false }
  private iMULU = (c: M68K, i: Instruction): void => { const src = c.rOp(i.src!, 2) & 0xFFFF; c.d[i.dst!.reg] = u32((c.d[i.dst!.reg] & 0xFFFF) * src); c.fNZ(c.d[i.dst!.reg], 4); c.v = false; c.c = false }
  private iMULSL = (c: M68K, i: Instruction): void => { const src = sext(c.rOp(i.src!, 4), 32); const dst = s32(c.d[i.dst!.reg]); const result = BigInt(dst) * BigInt(src); c.d[i.dst!.reg] = Number(result & 0xFFFFFFFFn) | 0; c.d[(i.dst!.reg + 1) & 7] = Number((result >> 32n) & 0xFFFFFFFFn) | 0; c.fNZ(Number(result & 0xFFFFFFFFn), 4); c.v = false; c.c = false }
  private iMULUL = (c: M68K, i: Instruction): void => { const src = u32(c.rOp(i.src!, 4)); const dst = u32(c.d[i.dst!.reg]); const result = BigInt(dst) * BigInt(src); c.d[i.dst!.reg] = Number(result & 0xFFFFFFFFn) | 0; c.d[(i.dst!.reg + 1) & 7] = Number((result >> 32n) & 0xFFFFFFFFn) | 0; c.fNZ(Number(result & 0xFFFFFFFFn), 4); c.v = false; c.c = false }
  private iDIVS = (c: M68K, i: Instruction): void => { const div = sext(c.rOp(i.src!, 2), 16); if (div === 0) { c.v = true; c.c = true; return }; const dd = c.d[i.dst!.reg] | 0; const q = Math.trunc(dd / div); if (q > 32767 || q < -32768) { c.v = true; c.c = true; return }; c.d[i.dst!.reg] = ((dd % div) << 16) | (q & 0xFFFF); c.fNZ(q, 2); c.v = false; c.c = false }
  private iDIVU = (c: M68K, i: Instruction): void => { const div = c.rOp(i.src!, 2) & 0xFFFF; if (div === 0) { c.v = true; c.c = true; return }; const dd = c.d[i.dst!.reg] >>> 0; const q = Math.floor(dd / div); if (q > 65535) { c.v = true; c.c = true; return }; c.d[i.dst!.reg] = ((dd % div) << 16) | (q & 0xFFFF); c.fNZ(q, 2); c.v = false; c.c = false }
  private iDIVSL = (c: M68K, i: Instruction): void => { const src = sext(c.rOp(i.src!, 2), 16); if (src === 0) { c.v = true; c.c = true; return }; const hi = c.d[i.dst!.reg]; const lo = c.d[(i.dst!.reg + 1) & 7] >>> 0; const dd64 = BigInt(hi | 0) * 0x100000000n + BigInt(lo); const q = dd64 / BigInt(src | 0); if (q > 0x7FFFFFFFn || q < -0x80000000n) { c.v = true; c.c = true; return }; const r = dd64 % BigInt(src | 0); c.d[i.dst!.reg] = Number(q & 0xFFFFFFFFn) | 0; c.d[(i.dst!.reg + 1) & 7] = Number(r & 0xFFFFFFFFn) | 0; c.fNZ(Number(q & 0xFFFFFFFFn), 4); c.v = false; c.c = false }
  private iDIVUL = (c: M68K, i: Instruction): void => { const src = c.rOp(i.src!, 2) & 0xFFFF; if (src === 0) { c.v = true; c.c = true; return }; const hi = u32(c.d[i.dst!.reg]); const lo = u32(c.d[(i.dst!.reg + 1) & 7]); const dd64 = BigInt(hi) * 0x100000000n + BigInt(lo); const q = dd64 / BigInt(src); if (q > 0xFFFFFFFFn) { c.v = true; c.c = true; return }; const r = dd64 % BigInt(src); c.d[i.dst!.reg] = Number(q & 0xFFFFFFFFn) | 0; c.d[(i.dst!.reg + 1) & 7] = Number(r & 0xFFFFFFFFn) | 0; c.fNZ(Number(q & 0xFFFFFFFFn), 4); c.v = false; c.c = false }
  private iTST = (c: M68K, i: Instruction): void => { const v = c.rOp(i.dst!, i.size); c.fNZ(v, i.size); c.v = false; c.c = false }
  private iCLR = (c: M68K, i: Instruction): void => { c.wOp(i.dst!, i.size, 0); c.z = true; c.n = false; c.v = false; c.c = false }
  private iNEG = (c: M68K, i: Instruction): void => { const v = c.rOp(i.dst!, i.size); const m = i.size === 1 ? 0xFF : i.size === 2 ? 0xFFFF : 0xFFFFFFFF; c.wOp(i.dst!, i.size, (-v) & m); c.fNZVC((-v) & m, i.size, v !== 0, false) }
  private iNOT = (c: M68K, i: Instruction): void => { const v = c.rOp(i.dst!, i.size); const m = i.size === 1 ? 0xFF : i.size === 2 ? 0xFFFF : 0xFFFFFFFF; c.wOp(i.dst!, i.size, (~v) & m); c.fNZ((~v) & m, i.size); c.v = false; c.c = false }
  private iNEGX = (c: M68K, i: Instruction): void => { const v = c.rOp(i.dst!, i.size); const m = i.size === 1 ? 0xFF : i.size === 2 ? 0xFFFF : 0xFFFFFFFF; const r = (-v - (c.x ? 1 : 0)) & m; c.wOp(i.dst!, i.size, r); c.fNZVC(r, i.size, v !== 0 || c.x, false) }
  private iEXT = (c: M68K, i: Instruction): void => {
    const reg = i.dst!.reg
    if (i.size === 2) { c.d[reg] = sext(c.d[reg] & 0xFF, 8); c.fNZ(c.d[reg], 2) }
    else { c.d[reg] = sext(c.d[reg] & 0xFFFF, 16); c.fNZ(c.d[reg], 4) }
    c.v = false; c.c = false
  }
  private iADDX = (c: M68K, i: Instruction): void => {
    const src = c.rOp(i.src!, i.size); const dst = c.rOp(i.dst!, i.size)
    const xVal = c.x ? 1 : 0; const s = i.size; const m = s === 1 ? 0xFF : s === 2 ? 0xFFFF : 0xFFFFFFFF
    const r = (dst + src + xVal) & m
    const carry = (dst + src + xVal) > m; const sb = c.msb(s)
    const over = !((dst ^ src) & sb) && !!((r ^ dst) & sb)
    c.wOp(i.dst!, s, r); c.fNZVC(r, s, carry, over)
  }
  private iSUBX = (c: M68K, i: Instruction): void => {
    const src = c.rOp(i.src!, i.size); const dst = c.rOp(i.dst!, i.size)
    const xVal = c.x ? 1 : 0; const s = i.size; const m = s === 1 ? 0xFF : s === 2 ? 0xFFFF : 0xFFFFFFFF
    const r = (dst - src - xVal) & m
    const carry = (src + xVal) > dst; const sb = c.msb(s)
    const over = !!((dst ^ src) & sb) && !!((r ^ dst) & sb)
    c.wOp(i.dst!, s, r); c.fNZVC(r, s, carry, over)
  }
  private iABCD = (c: M68K, i: Instruction): void => {
    const src = c.rOp(i.src!, 1) & 0xFF; const dst = c.rOp(i.dst!, 1) & 0xFF
    let result: { val: number; c: boolean; x: boolean }
    if (i.mnemonic === 'ABCD') result = bcdAdd(dst, src)
    else result = bcdSub(dst, src)
    c.wOp(i.dst!, 1, result.val); c.c = result.c; c.x = result.x
    if (!result.c) c.fNZ(result.val, 1)
    c.v = false
  }
  private iSHIFT = (c: M68K, i: Instruction): void => {
    const s = i.size; const m = s === 1 ? 0xFF : s === 2 ? 0xFFFF : 0xFFFFFFFF; const sb = c.msb(s)
    const cnt = Math.min(i.imm! & 63, s * 8)
    if (cnt === 0) { const v = c.rOp(i.dst!, s); c.fNZ(v, s); c.c = false; c.v = false; return }
    let val = c.rOp(i.dst!, s)
    if (i.mnemonic === 'LSL') { for (let j = 0; j < cnt; j++) { c.c = !!(val & sb); c.x = c.c; val = (val << 1) & m } }
    else if (i.mnemonic === 'LSR') { for (let j = 0; j < cnt; j++) { c.c = !!(val & 1); c.x = c.c; val = (val >>> 1) } }
    else if (i.mnemonic === 'ASL') { for (let j = 0; j < cnt; j++) { c.c = !!(val & sb); c.x = c.c; val = (val << 1) & m } }
    else if (i.mnemonic === 'ASR') { for (let j = 0; j < cnt; j++) { c.c = !!(val & 1); c.x = c.c; val = ((val >> 1) | (val & sb)) & m } }
    c.wOp(i.dst!, s, val); c.fNZ(val, s)
  }
  private iROTATE = (c: M68K, i: Instruction): void => {
    const s = i.size; const m = s === 1 ? 0xFF : s === 2 ? 0xFFFF : 0xFFFFFFFF; const sb = c.msb(s)
    const cnt = Math.min(i.imm! & 63, s * 8)
    if (cnt === 0) { const v = c.rOp(i.dst!, s); c.fNZ(v, s); c.c = false; c.v = false; return }
    let val = c.rOp(i.dst!, s)
    if (i.mnemonic === 'ROL') {
      for (let j = 0; j < cnt; j++) { const msb = !!(val & sb); val = ((val << 1) | (msb ? 1 : 0)) & m; c.c = msb }
    } else if (i.mnemonic === 'ROR') {
      for (let j = 0; j < cnt; j++) { const lsb = !!(val & 1); val = ((val >>> 1) | (lsb ? sb : 0)) & m; c.c = lsb }
    } else if (i.mnemonic === 'ROXL') {
      for (let j = 0; j < cnt; j++) { const msb = !!(val & sb); val = ((val << 1) | (c.x ? 1 : 0)) & m; c.c = msb; c.x = msb }
    } else if (i.mnemonic === 'ROXR') {
      for (let j = 0; j < cnt; j++) { const lsb = !!(val & 1); val = ((val >>> 1) | (c.x ? sb : 0)) & m; c.c = lsb; c.x = lsb }
    }
    c.wOp(i.dst!, s, val); c.fNZ(val, s)
  }
  private iSWAP = (c: M68K, i: Instruction): void => { const v = c.d[i.dst!.reg]; c.d[i.dst!.reg] = u32((v << 16) | ((v >>> 16) & 0xFFFF)); c.fNZ(c.d[i.dst!.reg], 4); c.v = false; c.c = false }
  private iEXG = (c: M68K, i: Instruction): void => {
    const rx = i.dst!.reg; const ry = i.imm! & 7; const mode = (i.imm! >> 3) & 3
    if (mode === 0) { const t = c.d[rx]; c.d[rx] = c.d[ry]; c.d[ry] = t }
    else if (mode === 1) { const t = c.a[rx]; c.a[rx] = c.a[ry]; c.a[ry] = t }
    else { const t = c.d[rx]; c.d[rx] = c.a[ry] | 0; c.a[ry] = u32(t) }
  }
  private iLEA = (c: M68K, i: Instruction): void => { c.a[i.dst!.reg] = c.eaAddr(i.src!) }
  private iPEA = (c: M68K, i: Instruction): void => { const addr = c.eaAddr(i.src!); c.a[7] = u32(c.a[7] - 4); c.memory.writeLong(c.a[7], addr) }
  private iLINK = (c: M68K, i: Instruction): void => { const disp = sext(i.imm!, 16); c.a[7] = u32(c.a[7] - 4); c.memory.writeLong(c.a[7], c.a[i.dst!.reg]); c.a[i.dst!.reg] = c.a[7]; c.a[7] = u32(c.a[7] + disp) }
  private iUNLK = (c: M68K, i: Instruction): void => { c.a[7] = c.a[i.dst!.reg]; c.a[i.dst!.reg] = c.memory.readLong(c.a[7]); c.a[7] = u32(c.a[7] + 4) }
  private iBRA = (c: M68K, i: Instruction): void => { if (i.mnemonic === 'BRA' || c.checkCond(i.cond!)) { c.pc = i.targetAddr! } }
  private iBSR = (c: M68K, i: Instruction): void => { c.a[7] = u32(c.a[7] - 4); c.memory.writeLong(c.a[7], c.pc + i.byteSize); c.pc = i.targetAddr! }
  private iJSR = (c: M68K, i: Instruction): void => { const addr = c.eaAddr(i.src!); c.a[7] = u32(c.a[7] - 4); c.memory.writeLong(c.a[7], c.pc + i.byteSize); c.pc = addr }
  private iRTS = (c: M68K, i: Instruction): void => { c.pc = c.memory.readLong(c.a[7]); c.a[7] = u32(c.a[7] + 4) }
  private iRTE = (c: M68K, i: Instruction): void => { c.sr = c.memory.readWord(c.a[7]); c.a[7] = u32(c.a[7] + 2); c.pc = c.memory.readLong(c.a[7]); c.a[7] = u32(c.a[7] + 4) }
  private iJMP = (c: M68K, i: Instruction): void => { c.pc = c.eaAddr(i.src!) }
  private iQUICK = (c: M68K, i: Instruction): void => { const val = (i.imm! & 7) || 8; const dst = c.rOp(i.dst!, i.size); const s = i.size; const m = s === 1 ? 0xFF : s === 2 ? 0xFFFF : 0xFFFFFFFF; let r: number; if (i.mnemonic === 'ADDQ') { r = (dst + val) & m; c.fNZVC(r, s, (dst + val) > m, false) } else { r = (dst - val) & m; c.fNZVC(r, s, val > dst, false) }; c.wOp(i.dst!, s, r) }
  private iBTST = (c: M68K, i: Instruction): void => { const bit = i.imm! & 31; const val = c.rOp(i.dst!, i.size); c.z = !((val >>> bit) & 1) }
  private iBSET = (c: M68K, i: Instruction): void => {
    const bit = i.imm! & (i.size === 4 ? 31 : i.size === 2 ? 15 : 7); const val = c.rOp(i.dst!, i.size); c.z = !((val >>> bit) & 1)
    let r: number
    if (i.mnemonic === 'BSET') r = val | (1 << bit); else if (i.mnemonic === 'BCLR') r = val & ~(1 << bit); else r = val ^ (1 << bit)
    c.wOp(i.dst!, i.size, r)
  }
  private iCMPM = (c: M68K, i: Instruction): void => {
    const src = c.mR(c.a[i.src!.reg], i.size); const dst = c.mR(c.a[i.dst!.reg], i.size)
    const s = i.size; const m = s === 1 ? 0xFF : s === 2 ? 0xFFFF : 0xFFFFFFFF; const sb = c.msb(s)
    const r = (dst - src) & m; c.fNZVC(r, s, src > dst, !!((dst ^ src) & sb) && !!((r ^ dst) & sb))
    c.a[i.src!.reg] = u32(c.a[i.src!.reg] + s)
    c.a[i.dst!.reg] = u32(c.a[i.dst!.reg] + s)
  }
  private iTAS = (c: M68K, i: Instruction): void => { const val = c.rOp(i.dst!, 1); c.fNZ(val, 1); c.v = false; c.c = false; c.wOp(i.dst!, 1, val | 0x80) }
  private iCHK = (c: M68K, i: Instruction): void => {
    const bound = c.rOp(i.src!, 2); const val = s32(c.d[i.dst!.reg])
    if (val < 0 || val > bound) {
      c.a[7] = u32(c.a[7] - 4); c.memory.writeLong(c.a[7], c.pc)
      c.a[7] = u32(c.a[7] - 2); c.memory.writeWord(c.a[7], c.sr)
      c.pc = c.memory.readLong(0x18)
      c._halt = true; c.output += '\n=== CHK exception ===\n'
    }
  }
  private iScc = (c: M68K, i: Instruction): void => { const cond = i.cond!; const result = c.checkCond(cond) ? 0xFF : 0x00; c.wOp(i.dst!, 1, result) }
  private iDBcc = (c: M68K, i: Instruction): void => {
    const cond = i.cond!
    if (!c.checkCond(cond)) {
      c.d[i.dst!.reg] = s32((c.d[i.dst!.reg] & 0xFFFF) - 1)
      if (s32(c.d[i.dst!.reg]) !== -1) c.pc = i.targetAddr!
      else c.d[i.dst!.reg] = (c.d[i.dst!.reg] & 0xFFFF)
    }
  }
  private iMOVESR = (c: M68K, i: Instruction): void => { c.wOp(i.dst!, 2, c.sr) }
  private iMOVECCR = (c: M68K, i: Instruction): void => { c.wOp(i.dst!, 1, c.sr & 0x1F) }
  private iILLEGAL = (c: M68K, i: Instruction): void => { c._halt = true; c.state = 'error'; c.output += '\n=== Illegal instruction ===\n' }
  private iSTOP = (c: M68K, i: Instruction): void => { c._stopped = true; c._halt = true; c.sr = i.imm! & 0xFFFF; c.output += '\n=== STOP ===\n' }
  private iHALT = (c: M68K, i: Instruction): void => { c._halt = true; c.output += '\n=== Program Halted ===\n' }

  private iTRAP = (c: M68K, i: Instruction): void => {
    const vec = i.imm! & 0xF
    if (vec === 15) {
      const call = c.d[0] & 0xFF
      if (call === 0) { c._halt = true; c.output += '\n=== Program Halted ===\n' }
      else if (call === 1) c.output += String.fromCharCode(c.d[1] & 0xFF)
      else if (call === 2) { let a = c.a[1], ch: number; while ((ch = c.memory.readByte(a)) !== 0 && c.output.length < 5000) { c.output += String.fromCharCode(ch); a = u32(a + 1) } }
      else if (call === 3) c.output += (c.d[1] >>> 0).toString(16).toUpperCase().padStart(8, '0')
      else if (call === 4) c.output += (c.d[1] & 0xFFFF).toString()
      else if (call === 5) c.output += (c.d[1] >>> 0).toString()
      else if (call === 6) c.output += String.fromCharCode(c.d[1] & 0xFF) + String.fromCharCode((c.d[1] >> 8) & 0xFF) + String.fromCharCode((c.d[1] >> 16) & 0xFF) + String.fromCharCode(((c.d[1] >>> 24)) & 0xFF)
      return
    }
    c._halt = true; c.output += '\n=== TRAP #' + vec + ' ===\n'
  }

  // --- Execute ---
  step(): boolean {
    if (this.state === 'finished' || this.state === 'error') return false
    if (this._stopped || this.instrIndex >= this.program.length) { this.state = 'finished'; return false }
    const instr = this.program[this.instrIndex]; this.pc = instr.addr
    try {
      const h = this.em.get(instr.mnemonic); if (!h) throw new Error('Unknown: ' + instr.mnemonic)
      h(this, instr); this.cycles += 4
    } catch (e: any) {
      this.state = 'error'; this.output += '\n=== ERROR at ' + instr.addr.toString(16).toUpperCase().padStart(6, '0') + ': ' + e.message + ' ===\n'; return false
    }
    if (this.pc !== instr.addr) this.syncIndex(); else this.instrIndex++
    if (this._halt) { this.state = this._stopped ? 'finished' : 'finished'; return false }
    if (this.instrIndex >= this.program.length) { this.state = 'finished'; return false }
    if (this.breakpoints.has(this.program[this.instrIndex]?.addr)) { this.state = 'paused'; return false }
    this.state = 'paused'; return true
  }
  run(maxSteps = 2000000): void {
    this.state = 'running'
    for (let s = 0; s < maxSteps; s++) {
      if (this.instrIndex >= this.program.length) { this.state = 'finished'; return }
      if (this.breakpoints.has(this.program[this.instrIndex].addr)) { this.state = 'paused'; return }
      if (!this.step()) return; if (this._halt) return
    }
    this.state = 'finished'
  }
  halt(): void { this._halt = true }
  private syncIndex(): void {
    const t = this.pc >>> 0
    for (let i = 0; i < this.program.length; i++) { if (this.program[i].addr === t) { this.instrIndex = i; return } }
    for (let i = 0; i < this.program.length; i++) { if (this.program[i].addr >= t) { this.instrIndex = i; return } }
    this.instrIndex = this.program.length
  }
}
