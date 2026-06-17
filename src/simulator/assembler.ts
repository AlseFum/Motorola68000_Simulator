import type { Instruction, OperandInfo } from './cpu'
import type { Size } from './types'

const CONDITIONS: Record<string, number> = {
  T: 0x0, F: 0x1, HI: 0x2, LS: 0x3, CC: 0x4, CS: 0x5, NE: 0x6, EQ: 0x7,
  VC: 0x8, VS: 0x9, PL: 0xA, MI: 0xB, GE: 0xC, LT: 0xD, GT: 0xE, LE: 0xF,
  HS: 0x4, LO: 0x5,
}

const TRIPLES = ['ADD','SUB','AND','OR','EOR','CMP','MULS','MULU','DIVS','DIVU','MOVEA','ADDA','SUBA','CMPA','ADDX','SUBX','ABCD','SBCD','CMPM','CHK']
const DUALS = ['MOVE','TST','CLR','NEG','NOT','LEA','PEA','LINK','UNLK','NEGX','TAS']
const SINGLES = ['NOP','RTS','RTE','HALT','SWAP','TRAP','ILLEGAL','STOP','MOVE_SR','MOVE_CCR']
const QUICKS = ['ADDQ','SUBQ']
const BRANCHES = ['BRA','BSR','JSR','JMP']
const SHIFTS = ['LSL','LSR','ASL','ASR','ROL','ROR','ROXL','ROXR']
const IMMEDIATES = ['ADDI','SUBI','ANDI','ORI','EORI','CMPI','MOVEQ','BTST','BSET','BCLR','BCHG']
const SPECIAL = ['EXG','EXT','DBRA']
const DATA_DIR = ['DC.B','DC.W','DC.L','DS.B','DS.W','DS.L']

const BCC_MNEM = ['BRA','','BHI','BLS','BCC','BCS','BNE','BEQ','BVC','BVS','BPL','BMI','BGE','BLT','BGT','BLE']
const SCC_MNEM = ['ST','SF','SHI','SLS','SCC','SCS','SNE','SEQ','SVC','SVS','SPL','SMI','SGE','SLT','SGT','SLE']
const DBC_MNEM = ['DBT','DBF','DBHI','DBLS','DBCC','DBCS','DBNE','DBEQ','DBVC','DBVS','DBPL','DBMI','DBGE','DBLT','DBGT','DBLE','DBRA']

function isScc(m: string): boolean { return SCC_MNEM.includes(m) }
function isBcc(m: string): boolean { return m.length === 3 && BCC_MNEM.includes(m) && m !== 'BRA' }
function isDbcc(m: string): boolean { return DBC_MNEM.includes(m) }

interface RawLine { text: string; label?: string; mnemonic?: string; operands?: string; sizeSuffix?: string; comment?: string; lineNum: number }

export class Assembler {
  private labels = new Map<string, number>()
  private instructions: Instruction[] = []
  private errors: string[] = []
  private baseAddr = 0x4000

  assemble(source: string, baseAddr = 0x4000): { instructions: Instruction[]; errors: string[]; labels: Map<string, number> } {
    this.baseAddr = baseAddr; this.labels = new Map(); this.instructions = []; this.errors = []
    const lines = this.tokenize(source)
    this.pass1(lines)
    if (this.errors.length > 0) return { instructions: [], errors: this.errors, labels: this.labels }
    this.pass2(lines)
    return { instructions: this.instructions, errors: this.errors, labels: this.labels }
  }

  private tokenize(source: string): RawLine[] {
    const result: RawLine[] = []
    const srcLines = source.split('\n')
    for (let i = 0; i < srcLines.length; i++) {
      let line = srcLines[i]; const semiPos = this.findComment(line)
      let comment = ''
      if (semiPos >= 0) { comment = line.substring(semiPos + 1).trim(); line = line.substring(0, semiPos) }
      line = line.trim(); if (!line && !comment) continue
      const rl: RawLine = { text: srcLines[i], lineNum: i, comment }
      const labelMatch = line.match(/^([a-zA-Z_.]\w*)\s*:(.*)/)
      if (labelMatch) { rl.label = labelMatch[1]; line = labelMatch[2].trim() }
      if (!line && rl.label) { result.push(rl); continue }
      const parts = line.split(/\s+/)
      if (parts.length > 0) {
        let mnem = parts[0].toUpperCase()
        // Handle DC.B/DC.W/DC.L/DS.B/DS.W/DS.L specially - keep the suffix
        const isDir = mnem.match(/^(DC|DS)\.([BLW])$/)
        const sfx = !isDir ? mnem.match(/^(.*)\.([BLW])$/) : null
        if (sfx) { rl.sizeSuffix = '.' + sfx[2]; mnem = sfx[1] }
        rl.mnemonic = mnem
        if (parts.length > 1) rl.operands = parts.slice(1).join(' ')
      }
      result.push(rl)
    }
    return result
  }

  private findComment(line: string): number {
    for (let i = 0; i < line.length; i++) { if (line[i] === ';') return i }
    return -1
  }

  private pass1(lines: RawLine[]): void {
    let addr = this.baseAddr
    for (const line of lines) {
      if (line.label) {
        if (this.labels.has(line.label)) { this.errors.push(`Line ${line.lineNum + 1}: duplicate label '${line.label}'`); continue }
        this.labels.set(line.label, addr)
      }
      if (line.mnemonic) {
        const m = line.mnemonic!.toUpperCase()
        if (m === 'ORG') { const v = this.evalExpr(line.operands || '', line.lineNum); if (!isNaN(v)) addr = v; continue }
        if (m === 'END' || m === 'EQU') continue
        if (DATA_DIR.includes(m)) {
          if (m === 'DS.B' || m === 'DS.W' || m === 'DS.L') addr += parseInt(line.operands || '0') || 0
          // DC.B/W/L handled in pass2 with accurate sizes
          continue
        }
        const sz = this.instrSize(line)
        if (sz < 0) { this.errors.push(`Line ${line.lineNum + 1}: invalid '${m}'`); continue }
        addr += sz
      }
    }
  }

  private instrSize(line: RawLine): number {
    const m = line.mnemonic!.toUpperCase(); const ops = line.operands || ''
    if (DATA_DIR.includes(m) || m === 'ORG' || m === 'END' || m === 'EQU') return 0
    if (IMMEDIATES.includes(m)) {
      if (m === 'MOVEQ') return 2
      if (['BTST','BSET','BCLR','BCHG'].includes(m)) return 2
      return 4  // opcode + immediate word
    }
    if (isScc(m) || m === 'TAS') return 2
    if (isDbcc(m)) return 4
    if (m === 'MOVEM') return 4
    if (TRIPLES.includes(m) || DUALS.includes(m)) return 2
    if (BRANCHES.includes(m) || isBcc(m)) return (m === 'BRA' || m === 'BSR' || isBcc(m)) ? 4 : 2
    if (m === 'STOP') return 4
    if (m === 'CHK') return 2
    if (m === 'LINK') return 4
    if (SINGLES.includes(m)) return 2
    if (SHIFTS.includes(m)) return 2
    if (QUICKS.includes(m)) return 2
    if (SPECIAL.includes(m)) return 2
    return 2  // default
  }

  private pass2(lines: RawLine[]): void {
    let addr = this.baseAddr
    for (const line of lines) {
      if (line.label && !line.mnemonic) continue
      if (!line.mnemonic) continue
      const m = line.mnemonic!.toUpperCase(); const ops = line.operands || ''
      this.currentLineNum = line.lineNum

      if (m === 'ORG') { addr = this.evalExpr(ops, line.lineNum) || addr; continue }
      if (m === 'END' || m === 'EQU') continue

      const s = this.getSize(line)
      const sz = this.instrSize(line)
      const parsed = this.parseOperands(ops, line.lineNum)

      // Single-arg no-operand instructions
      if (m === 'NOP') { this.emit(addr, 'NOP', 1, [0x4E71]); addr += sz; continue }
      if (m === 'RTS') { this.emit(addr, 'RTS', 1, [0x4E75]); addr += sz; continue }
      if (m === 'RTE') { this.emit(addr, 'RTE', 1, [0x4E73]); addr += sz; continue }
      if (m === 'HALT') { this.emit(addr, 'HALT', 1, [0x4E71]); addr += sz; continue }
      if (m === 'ILLEGAL') { this.emit(addr, 'ILLEGAL', 1, [0x4AFC]); addr += sz; continue }
      if (m === 'TRAP') {
        const vec = parseInt((ops || '#0').replace('#', '')) || 0
        this.emit(addr, 'TRAP', 1, [0x4E40 | (vec & 0xF)], { imm: vec & 0xF })
        addr += sz; continue
      }
      if (m === 'STOP') {
        const immVal = this.evalExpr((ops || '#0').replace('#', ''), line.lineNum)
        this.emit(addr, 'STOP', 1, [0x4E72, immVal & 0xFFFF], { imm: immVal & 0xFFFF })
        addr += sz; continue
      }

      // SWAP Dn
      if (m === 'SWAP') { const d = this.parseEA(ops, line.lineNum); if (!d) { this.err(line, 'bad SWAP operand'); continue }; this.emit(addr, 'SWAP', 2, [0x4840 | d.reg], { dst: d }); addr += sz; continue }

      // EXT Dn
      if (m === 'EXT') { const d = this.parseEA(ops, line.lineNum); if (!d) { this.err(line, 'bad EXT operand'); continue }; this.emit(addr, 'EXT', s, [0x4880 | (s === 4 ? 0x40 : 0) | d.reg], { dst: d }); addr += sz; continue }

      // MOVEQ
      if (m === 'MOVEQ') {
        if (!parsed || parsed.length !== 2) { this.err(line, 'MOVEQ needs 2 operands'); continue }
        const iv = this.evalExpr(parsed[0].replace('#', ''), line.lineNum)
        const dst = this.parseEA(parsed[1], line.lineNum)
        if (!dst || dst.t !== 'dn') { this.err(line, 'MOVEQ dst must be Dn'); continue }
        this.emit(addr, 'MOVEQ', 4, [0x7000 | (dst.reg << 9) | (iv & 0xFF)], { dst, imm: iv })
        addr += sz; continue
      }

      // EXG
      if (m === 'EXG') {
        if (!parsed || parsed.length !== 2) { this.err(line, 'EXG needs 2 operands'); continue }
        const r1 = this.parseEA(parsed[0], line.lineNum); const r2 = this.parseEA(parsed[1], line.lineNum)
        if (!r1 || !r2) { this.err(line, 'bad EXG operands'); continue }
        let mode = 0; if (r1.t === 'dn' && r2.t === 'dn') mode = 0x08; else if (r1.t === 'an' && r2.t === 'an') mode = 0x09; else mode = 0x11
        this.emit(addr, 'EXG', 4, [0xC140 | (r1.reg << 9) | (mode << 3) | r2.reg], { dst: r1, imm: r2.reg | (mode << 3) })
        addr += sz; continue
      }

      // Scc
      if (isScc(m)) {
        const ea = this.parseEA(ops, line.lineNum); if (!ea) { this.err(line, 'bad Scc operand'); continue }
        const cc = SCC_MNEM.indexOf(m)
        this.emit(addr, m, 1, [0x50C0 | (cc << 8)], { dst: ea, cond: cc })
        addr += sz; continue
      }

      // TAS
      if (m === 'TAS') { const ea = this.parseEA(ops, line.lineNum); if (!ea) { this.err(line, 'bad TAS operand'); continue }; this.emit(addr, 'TAS', 1, [0x4AC0], { dst: ea }); addr += sz; continue }

      // Immediate arithmetic
      if (IMMEDIATES.includes(m) && m !== 'MOVEQ') {
        if (!parsed || parsed.length !== 2) { this.err(line, m + ' needs 2 operands'); continue }
        const iv = this.evalExpr(parsed[0].replace('#', ''), line.lineNum)
        if (['BTST','BSET','BCLR','BCHG'].includes(m)) {
          const dst = this.parseEA(parsed[1], line.lineNum)
          if (!dst) { this.err(line, 'bad operand'); continue }
          addr = this.emitAdv(addr, m, s, [0x0800 | ((iv & 31) << 9) | ((s === 4 ? 2 : s === 2 ? 1 : 0) << 6)], { dst, imm: iv })
        } else {
          const dst = this.parseEA(parsed[1], line.lineNum)
          if (!dst) { this.err(line, 'bad operand'); continue }
          const words = [0, iv & 0xFFFF]
          addr = this.emitAdv(addr, m, s, words, { dst, imm: iv })
        }
        continue
      }

      // Shifts & rotates
      if (SHIFTS.includes(m)) {
        if (!parsed || parsed.length < 2) { this.err(line, m + ' needs 2 operands'); continue }
        let cnt: number, dst: OperandInfo | null
        if (parsed[0].startsWith('#')) { cnt = parseInt(parsed[0].replace('#', '')) || 1; dst = this.parseEA(parsed[1], line.lineNum) }
        else { cnt = 0; dst = this.parseEA(parsed[1], line.lineNum); /* cnt from Dn */ }
        if (!dst) { this.err(line, 'bad operand'); continue }
        this.emit(addr, m, s, [0xE000], { dst, imm: cnt })
        addr += sz; continue
      }

      // Branches: BRA, BSR, Bcc
      if (m === 'BRA' || m === 'BSR' || isBcc(m)) {
        const target = ops.trim(); const ta = this.resolveLabel(target, line)
        if (ta < 0) continue
        const cond = m === 'BRA' ? 0 : m === 'BSR' ? -1 : CONDITIONS[m.substring(1)]
        const w = m === 'BSR' ? 0x6100 : 0x6000 | ((cond >= 0 ? cond : 0) << 8)
        const disp = ta - (addr + 2)
        this.emit(addr, m, 1, [w, disp & 0xFFFF], { targetAddr: ta, imm: disp, cond: cond >= 0 ? cond : undefined })
        addr += sz; continue
      }

      // DBcc
      if (isDbcc(m)) {
        if (!parsed || parsed.length !== 2) { this.err(line, m + ' needs Dn,label'); continue }
        const dreg = this.parseEA(parsed[0], line.lineNum)
        const ta = this.resolveLabel(parsed[1], line)
        if (!dreg || ta < 0) { this.err(line, 'bad DBcc operands'); continue }
        const cc = DBC_MNEM.indexOf(m)
        this.emit(addr, m, 4, [0x50C8 | (cc << 8) | dreg.reg], { dst: dreg, cond: cc, targetAddr: ta })
        addr += sz; continue
      }

      // JSR / JMP
      if (m === 'JSR' || m === 'JMP') {
        const ea = this.parseEA(ops, line.lineNum); if (!ea) { this.err(line, 'bad ' + m + ' operand'); continue }
        this.emit(addr, m, 1, [m === 'JSR' ? 0x4E80 : 0x4EC0], { src: ea })
        addr += sz; continue
      }

      // CHK
      if (m === 'CHK') {
        if (!parsed || parsed.length !== 2) { this.err(line, 'CHK needs <ea>,Dn'); continue }
        const src = this.parseEA(parsed[0], line.lineNum); const dst = this.parseEA(parsed[1], line.lineNum)
        if (!src || !dst) { this.err(line, 'bad CHK operands'); continue }
        this.emit(addr, 'CHK', 2, [0x4180 | (dst.reg << 9)], { src, dst })
        addr += sz; continue
      }

      // CMPM
      if (m === 'CMPM') {
        if (!parsed || parsed.length !== 2) { this.err(line, 'CMPM needs (An)+,(An)+'); continue }
        const src = this.parseEA(parsed[0], line.lineNum); const dst = this.parseEA(parsed[1], line.lineNum)
        if (!src || !dst || src.t !== 'post' || dst.t !== 'post') { this.err(line, 'CMPM needs (An)+,(An)+'); continue }
        this.emit(addr, 'CMPM', s, [0xB108 | (dst.reg << 9) | src.reg], { src, dst })
        addr += sz; continue
      }

      // QUICK
      if (QUICKS.includes(m)) {
        if (!parsed || parsed.length !== 2) { this.err(line, m + ' needs 2 operands'); continue }
        const val = parseInt(parsed[0].replace('#', '')) || 0
        const dst = this.parseEA(parsed[1], line.lineNum); if (!dst) { this.err(line, 'bad operand'); continue }
        this.emit(addr, m, s, [0x5000 | ((val & 7) << 9)], { dst, imm: val & 7 })
        addr += sz; continue
      }

      // LINK / UNLK
      if (m === 'LINK') {
        if (!parsed || parsed.length !== 2) { this.err(line, 'LINK needs An,#disp'); continue }
        const reg = this.parseEA(parsed[0], line.lineNum); const disp = this.evalExpr(parsed[1].replace('#', ''), line.lineNum)
        if (!reg) { this.err(line, 'bad LINK operands'); continue }
        this.emit(addr, 'LINK', 4, [0x4E50 | reg.reg], { dst: reg, imm: disp })
        addr += sz; continue
      }
      if (m === 'UNLK') { const reg = this.parseEA(ops, line.lineNum); if (!reg) { this.err(line, 'bad UNLK operand'); continue }; this.emit(addr, 'UNLK', 4, [0x4E58 | reg.reg], { dst: reg }); addr += sz; continue }

      // MOVE SR/CCR
      if (m === 'MOVE_SR') { const ea = this.parseEA(ops, line.lineNum); if (!ea) { this.err(line, 'bad operand'); continue }; this.emit(addr, 'MOVE_SR', 2, [0x40C0], { dst: ea }); addr += sz; continue }
      if (m === 'MOVE_CCR') { const ea = this.parseEA(ops, line.lineNum); if (!ea) { this.err(line, 'bad operand'); continue }; this.emit(addr, 'MOVE_CCR', 1, [0x42C0], { dst: ea }); addr += sz; continue }

      // ADDX / SUBX / ABCD / SBCD
      if (['ADDX','SUBX','ABCD','SBCD'].includes(m)) {
        if (!parsed || parsed.length !== 2) { this.err(line, m + ' needs 2 operands'); continue }
        const src = this.parseEA(parsed[0], line.lineNum); const dst = this.parseEA(parsed[1], line.lineNum)
        if (!src || !dst) { this.err(line, 'bad ' + m + ' operands'); continue }
        const rm = (m === 'ABCD' || m === 'SBCD') ? (src.t === 'pre' ? 1 : 0) : 0
        this.emit(addr, m, s, [0xD100 | (dst.reg << 9) | (rm << 3) | src.reg], { src, dst })
        addr += sz; continue
      }

      // Single-operand: PEA, NEGX, CLR, NEG, NOT, TST
      if (m === 'PEA' || m === 'NEGX' || m === 'CLR' || m === 'NEG' || m === 'NOT' || m === 'TST') {
        const ea = this.parseEA(ops, line.lineNum); if (!ea) { this.err(line, 'bad ' + m + ' operand'); continue }
        this.emit(addr, m, s, [0], { dst: ea })
        addr += sz; continue 
      }

      // Handle LEA <ea>,An more carefully: "LEA LABEL(PC),A0"
      // We need to reparse since EA has two parts
      if (m === 'LEA') {
        if (!parsed || parsed.length !== 2) { this.err(line, 'LEA needs <ea>,An'); continue }
        const src = this.parseEA(parsed[0], line.lineNum)
        const dst = this.parseEA(parsed[1], line.lineNum)
        if (!src || !dst || dst.t !== 'an') { this.err(line, 'bad LEA operands'); continue }
        this.emit(addr, 'LEA', 4, [0x41C0 | (dst.reg << 9)], { src, dst })
        addr += sz; continue
      }

      // Two-operand: ADD, SUB, AND, OR, EOR, CMP, MOVEA, ADDA, SUBA, CMPA, ADDX, SUBX (already handled), MULS.L etc.
      if (TRIPLES.includes(m) && !['ADDX','SUBX','ABCD','SBCD','CMPM','CHK'].includes(m)) {
        if (!parsed || parsed.length !== 2) { this.err(line, m + ' needs 2 operands'); continue }
        const src = this.parseEA(parsed[0], line.lineNum); const dst = this.parseEA(parsed[1], line.lineNum)
        if (!src || !dst) { this.err(line, 'bad operands'); continue }
        this.emit(addr, m, s, [0], { src, dst })
        addr += sz; continue
      }

      // MOVE (two operands)
      if (m === 'MOVE') {
        if (!parsed || parsed.length !== 2) { this.err(line, 'MOVE needs 2 operands'); continue }
        const src = this.parseEA(parsed[0], line.lineNum); const dst = this.parseEA(parsed[1], line.lineNum)
        if (!src || !dst) { this.err(line, 'bad MOVE operand'); continue }
        this.emit(addr, 'MOVE', s, [0], { src, dst })
        addr += sz; continue
      }

      if (m !== 'EQU') this.err(line, "unknown mnemonic '" + m + "'")
    }
  }

  private currentLineNum = 0

  private emit(addr: number, mnem: string, sz: Size, words: number[], extra?: Partial<Instruction>): void {
    this.instructions.push({ addr, mnemonic: mnem, size: sz, words, byteSize: words.length * 2, sourceLine: this.currentLineNum, ...extra })
  }

  private emitAdv(addr: number, mnem: string, sz: Size, words: number[], extra?: Partial<Instruction>): number {
    this.emit(addr, mnem, sz, words, extra)
    return addr + words.length * 2
  }

  private advanceByLast(addr: number): number {
    const last = this.instructions[this.instructions.length - 1]
    return addr + (last?.byteSize ?? 2)
  }

  private err(line: RawLine, msg: string): void { this.errors.push('Line ' + (line.lineNum + 1) + ': ' + msg) }
  private getSize(line: RawLine): Size { if (line.sizeSuffix === '.B') return 1; if (line.sizeSuffix === '.L') return 4; return 2 }

  private parseOperands(ops: string, lineNum: number): string[] {
    if (!ops.trim()) return []
    const parts: string[] = []; let cur = '', depth = 0
    for (let i = 0; i < ops.length; i++) {
      const ch = ops[i]
      if (ch === '(') { depth++; cur += ch }
      else if (ch === ')') { depth--; cur += ch }
      else if (ch === ',' && depth === 0) { if (cur.trim()) parts.push(cur.trim()); cur = '' }
      else cur += ch
    }
    if (cur.trim()) parts.push(cur.trim())
    return parts
  }

  private parseEA(op: string, lineNum: number): OperandInfo | null {
    op = op.trim(); if (!op) return null
    const baseOp = op.replace(/\.([BLW])$/i, '')
    const dm = baseOp.match(/^D(\d)$/i); if (dm) return { t: 'dn', reg: parseInt(dm[1]) }
    const am = baseOp.match(/^A(\d)$/i); if (am) return { t: 'an', reg: parseInt(am[1]) }
    if (baseOp.startsWith('#')) return { t: 'imm', reg: 0, disp: this.evalExpr(baseOp.substring(1), lineNum) }
    const pm = baseOp.match(/^\(A(\d)\)\+(?:\+(A\d))?$/i); // TODO: handle reg list
    if (baseOp.match(/^\(A(\d)\)\+$/)) return { t: 'post', reg: parseInt(baseOp[2]) }
    // -(An)
    if (baseOp.match(/^-\(A(\d)\)$/)) return { t: 'pre', reg: parseInt(baseOp.replace(/^-\(/,'').replace(/\)$/,'').replace(/A/i,'')) }
    // Actually let's fix the regex:
    const prem = baseOp.match(/^-\(A(\d)\)$/); if (prem) return { t: 'pre', reg: parseInt(prem[1]) }
    const inm = baseOp.match(/^\(A(\d)\)$/); if (inm) return { t: 'ind', reg: parseInt(inm[1]) }
    const dspm = baseOp.match(/^(\S+)\(A(\d)\)$/); if (dspm) return { t: 'disp', reg: parseInt(dspm[2]), disp: this.evalExpr(dspm[1], lineNum) }
    // d8(An,Dn*scale)
    const idxm = baseOp.match(/^(\S+)\(A(\d)\s*,\s*(\S+)\.([WL])(?:\s*\*\s*(\d+))?\)$/i); if (idxm) {
      const idxr = this.parseEA(idxm[3], lineNum); return { t: 'idx', reg: parseInt(idxm[2]), disp: this.evalExpr(idxm[1], lineNum), idxReg: idxr?.reg || 0, idxSize: idxm[4].toUpperCase() === 'L' ? 4 : 2, idxScale: idxm[5] ? parseInt(idxm[5]) : 1 }
    }
    // Also simpler indexed: d8(An,Dn)
    const idxm2 = baseOp.match(/^(\S+)\(A(\d)\s*,\s*D(\d)(?:\.([WL]))?(?:\s*\*\s*(\d+))?\)$/i); if (idxm2) {
      return { t: 'idx', reg: parseInt(idxm2[2]), disp: this.evalExpr(idxm2[1], lineNum), idxReg: parseInt(idxm2[3]), idxSize: (idxm2[4] || '').toUpperCase() === 'L' ? 4 : 2, idxScale: idxm2[5] ? parseInt(idxm2[5]) : 1 }
    }
    const pcm = baseOp.match(/^(\S+)\(PC\)$/i); if (pcm) return { t: 'pc', reg: 0, disp: this.evalExpr(pcm[1], lineNum) }
    // (xxx).W / (xxx).L
    const abw = baseOp.match(/^\((\S+)\)\.W$/i); if (abw) return { t: 'abs', reg: 0, disp: this.evalExpr(abw[1], lineNum) & 0xFFFF }
    const abl = baseOp.match(/^\((\S+)\)\.L$/i); if (abl) return { t: 'abs', reg: 0, disp: this.evalExpr(abl[1], lineNum) }
    const absm = baseOp.match(/^\((\S+)\)$/i); if (absm) { const v = this.evalExpr(absm[1], lineNum); return { t: 'abs', reg: 0, disp: v } }
    const v = this.evalExpr(baseOp, lineNum); if (!isNaN(v) && v > 0) return { t: 'abs', reg: 0, disp: v }
    return null
  }

  private resolveLabel(expr: string, line: RawLine): number {
    const lbl = this.labels.get(expr); if (lbl !== undefined) return lbl
    const v = this.evalExpr(expr, line.lineNum)
    if (!isNaN(v)) return v
    this.err(line, "undefined label '" + expr + "'"); return -1
  }

  private evalExpr(expr: string, lineNum: number): number {
    expr = expr.trim()
    const lbl = this.labels.get(expr); if (lbl !== undefined) return lbl
    if (expr.startsWith('$')) return parseInt(expr.substring(1), 16) || 0
    if (expr.startsWith('%')) return parseInt(expr.substring(1), 2) || 0
    if (/^-?\d+$/.test(expr)) return parseInt(expr, 10) || 0
    // Simple expressions: label+offset
    const addm = expr.match(/^(\w+)\s*\+\s*(\d+)$/)
    if (addm) { const l = this.labels.get(addm[1]); if (l !== undefined) return l + parseInt(addm[2]) }
    return 0
  }

  private parseDataVals(str: string, lineNum: number): number[] {
    const r: number[] = []
    const parts = str.split(',')
    for (const p of parts) {
      const t = p.trim()
      if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
        for (let i = 1; i < t.length - 1; i++) r.push(t.charCodeAt(i))
        if (t.startsWith('"')) r.push(0)
      } else {
        r.push(this.evalExpr(t, lineNum))
      }
    }
    return r
  }
}
