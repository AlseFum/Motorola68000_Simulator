/**
 * Script → 68K Assembly Compiler (C-like language)
 *
 * Syntax:
 *   // comment  (line comments with //)
 *   var name = expr;               – declare variable
 *   name = expr;                   – assign
 *   if (cond) stmt [else stmt]     – conditional
 *   while (cond) stmt              – while loop
 *   do stmt while (cond);          – do-while loop
 *   func onISR1…onISR7() { ... }    – interrupt handler (auto-installed)
 *   func name(p1,p2) { ... }      – function definition (up to 4 params)
 *   return expr;                   – return from function
 *   { stmt; stmt; ... }            – block
 *
 * Built-in functions:
 *   peek(addr)   – read byte from memory
 *   poke(addr, val) – write byte to memory
 *   halt()       – stop program
 *
 * Expressions (C precedence):
 *   ||  &&  == != < > <= >=  + -  * / % & | ^ << >>
 *   unary: - !   parens: ( )
 */

// ========== Lexer ==========

type TokenKind =
  | 'ident' | 'number'
  | 'var' | 'if' | 'else' | 'while' | 'do' | 'func' | 'return'
  | '=' | '==' | '!=' | '<' | '>' | '<=' | '>='
  | '+' | '-' | '*' | '/' | '%'
  | '&' | '|' | '^' | '<<' | '>>'
  | '!' | '&&' | '||'
  | '(' | ')' | '{' | '}' | ';' | ','
  | 'eof'

interface Token { kind: TokenKind; text: string; val?: number; line: number }

const KW: Record<string, TokenKind> = { var: 'var', if: 'if', else: 'else', while: 'while', do: 'do', func: 'func', return: 'return' }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0; let line = 1

  function err(msg: string): never { throw new Error(`Line ${line}: ${msg}`) }

  while (i < src.length) {
    const ch = src[i]

    // whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue }
    if (ch === '\n') { line++; i++; continue }

    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }

    if (ch === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
      let v = ''; i += 2
      while (i < src.length && /[0-9a-fA-F]/.test(src[i])) v += src[i++]
      if (!v) err("bad hex literal")
      tokens.push({ kind: 'number', text: v, val: parseInt(v, 16), line })
      continue
    }
    if (/\d/.test(ch)) {
      let v = ''; while (i < src.length && /\d/.test(src[i])) v += src[i++]
      tokens.push({ kind: 'number', text: v, val: parseInt(v, 10), line })
      continue
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let v = ''; while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) v += src[i++]
      tokens.push({ kind: KW[v] || 'ident', text: v, line })
      continue
    }

    const two = ch + (src[i + 1] || '')
    const twos: [string, TokenKind][] = [['==', '=='], ['!=', '!='], ['<=', '<='], ['>=', '>='], ['<<', '<<'], ['>>', '>>'], ['&&', '&&'], ['||', '||']]
    let found = false
    for (const [str, k] of twos) { if (two === str) { tokens.push({ kind: k, text: str, line }); i += 2; found = true; break } }
    if (found) continue

    const singles: Record<string, TokenKind> = { '=' : '=' , '<' : '<' , '>' : '>' , '+' : '+' , '-' : '-' , '*' : '*' , '/' : '/' , '%' : '%' , '&':'&','|':'|','^':'^','!':'!','(':'(' , ')':')' , '{':'{' , '}':'}' , ';':';' , ',':',' }
    if (singles[ch]) { tokens.push({ kind: singles[ch], text: ch, line }); i++; continue }

    err("unexpected '" + ch + "'")
  }
  tokens.push({ kind: 'eof', text: '', line })
  return tokens
}

// ========== AST ==========

type Stmt =
  | { kind: 'var'; name: string; init: Expr }
  | { kind: 'assign'; name: string; expr: Expr }
  | { kind: 'if'; cond: Expr; then: Stmt; els?: Stmt }
  | { kind: 'while'; cond: Expr; body: Stmt }
  | { kind: 'do'; body: Stmt; cond: Expr }
  | { kind: 'block'; stmts: Stmt[] }
  | { kind: 'expr'; expr: Expr }
  | { kind: 'halt' }
  | { kind: 'return'; expr?: Expr }
  | { kind: 'func'; name: string; params: string[]; body: Stmt }

type Expr =
  | { kind: 'number'; val: number }
  | { kind: 'ident'; name: string }
  | { kind: 'unary'; op: '-' | '!'; expr: Expr }
  | { kind: 'binary'; op: string; left: Expr; right: Expr }
  | { kind: 'call'; name: string; args: Expr[] }

// ========== Parser ==========

class Parser {
  private tokens: Token[]; private pos = 0
  constructor(src: string) { this.tokens = tokenize(src) }

  private err(msg: string): never { const t = this.tokens[this.pos]; throw new Error(`Line ${t.line}: ${msg} (near '${t.text}')`) }
  private peek(): TokenKind { return this.tokens[this.pos].kind }
  private skip(kind: TokenKind): void { if (this.peek() === kind) this.pos++; else this.err(`expected '${kind}'`) }

  parse(): Stmt[] {
    const stmts: Stmt[] = []
    while (this.peek() !== 'eof') stmts.push(this.stmt())
    return stmts
  }

  private stmt(): Stmt {
    switch (this.peek()) {
      case 'var': return this.varDecl()
      case 'func': return this.funcDecl()
      case 'if': return this.ifStmt()
      case 'while': return this.whileStmt()
      case 'do': return this.doStmt()
      case 'return': return this.retStmt()
      case '{': return this.block()
      default: {
        const e = this.expr()
        if (e.kind === 'call' && e.name === 'halt') { this.skip(';'); return { kind: 'halt' } }
        if (this.peek() === '=' && e.kind === 'ident') { this.pos++; const rhs = this.expr(); this.skip(';'); return { kind: 'assign', name: e.name, expr: rhs } }
        this.skip(';')
        return { kind: 'expr', expr: e }
      }
    }
  }

  private varDecl(): Stmt { this.skip('var'); const name = this.tokens[this.pos].text; this.skip('ident'); this.skip('='); const init = this.expr(); this.skip(';'); return { kind: 'var', name, init } }
  private retStmt(): Stmt { this.skip('return'); let expr: Expr | undefined; if (this.peek() !== ';') expr = this.expr(); this.skip(';'); return { kind: 'return', expr } }

  private funcDecl(): Stmt {
    this.skip('func'); const name = this.tokens[this.pos].text; this.skip('ident')
    this.skip('('); const params: string[] = []
    if (this.peek() !== ')') { params.push(this.tokens[this.pos].text); this.skip('ident'); while (this.peek() === ',') { this.skip(','); params.push(this.tokens[this.pos].text); this.skip('ident') } }
    this.skip(')')
    if (params.length > 4) throw new Error(`Function '${name}' has too many parameters (max 4)`)
    return { kind: 'func', name, params, body: this.block() }
  }

  private ifStmt(): Stmt { this.skip('if'); this.skip('('); const cond = this.expr(); this.skip(')'); const then = this.stmt(); let els: Stmt | undefined; if (this.peek() === 'else') { this.skip('else'); els = this.stmt() }; return { kind: 'if', cond, then, els } }
  private whileStmt(): Stmt { this.skip('while'); this.skip('('); const cond = this.expr(); this.skip(')'); return { kind: 'while', cond, body: this.stmt() } }
  private doStmt(): Stmt { this.skip('do'); const body = this.stmt(); this.skip('while'); this.skip('('); const cond = this.expr(); this.skip(')'); this.skip(';'); return { kind: 'do', body, cond } }
  private block(): Stmt { this.skip('{'); const stmts: Stmt[] = []; while (this.peek() !== '}' && this.peek() !== 'eof') stmts.push(this.stmt()); this.skip('}'); return { kind: 'block', stmts } }

  // --- expressions ---
  private expr(): Expr { return this.logicalOr() }
  private logicalOr(): Expr { let left = this.logicalAnd(); while (this.peek() === '||') { const op = this.tokens[this.pos++].text; left = { kind: 'binary', left, op, right: this.logicalAnd() } }; return left }
  private logicalAnd(): Expr { let left = this.equality(); while (this.peek() === '&&') { const op = this.tokens[this.pos++].text; left = { kind: 'binary', left, op, right: this.equality() } }; return left }
  private equality(): Expr { let left = this.relational(); while (this.peek() === '==' || this.peek() === '!=') { const op = this.tokens[this.pos++].text; left = { kind: 'binary', left, op, right: this.relational() } }; return left }
  private relational(): Expr { let left = this.additive(); while (this.peek() === '<' || this.peek() === '>' || this.peek() === '<=' || this.peek() === '>=') { const op = this.tokens[this.pos++].text; left = { kind: 'binary', left, op, right: this.additive() } }; return left }
  private additive(): Expr { let left = this.multiplicative(); while (this.peek() === '+' || this.peek() === '-') { const op = this.tokens[this.pos++].text; left = { kind: 'binary', left, op, right: this.multiplicative() } }; return left }
  private multiplicative(): Expr { let left = this.unary(); while (this.peek() === '*' || this.peek() === '/' || this.peek() === '%' || this.peek() === '&' || this.peek() === '|' || this.peek() === '^' || this.peek() === '<<' || this.peek() === '>>') { const op = this.tokens[this.pos++].text; left = { kind: 'binary', left, op, right: this.unary() } }; return left }
  private unary(): Expr { if (this.peek() === '-' || this.peek() === '!') { const op = this.tokens[this.pos++].text as '-' | '!'; return { kind: 'unary', op, expr: this.unary() } }; return this.primary() }
  private primary(): Expr {
    if (this.peek() === 'number') {
      const t = this.tokens[this.pos++]; return { kind: 'number', val: t.val! }
    }
    if (this.peek() === 'ident') { const name = this.tokens[this.pos++].text; if (this.peek() === '(') { this.skip('('); const args: Expr[] = []; if (this.peek() !== ')') { args.push(this.expr()); while (this.peek() === ',') { this.skip(','); args.push(this.expr()) } }; this.skip(')'); return { kind: 'call', name, args } }; return { kind: 'ident', name } }
    if (this.peek() === '(') { this.skip('('); const e = this.expr(); this.skip(')'); return e }
    return this.err('expected expression')
  }
}

// ========== Code Generator ==========

class FuncInfo { constructor(public name: string, public params: string[], public body: Stmt) {} }

class CodeGen {
  asm: string[] = []
  vars = new Map<string, number>()       // name → register (D2-D7)
  funcs = new Map<string, FuncInfo>()    // registered functions
  nextReg = 2
  labelIdx = 0
  private funcExitLabel = ''             // set during emitFunc, used by genReturn

  lbl(): string { return '.L' + this.labelIdx++ }

  allocVar(name: string): number {
    if (this.nextReg <= 7) { const r = this.nextReg++; this.vars.set(name, r); return r }
    throw new Error('too many variables (max 6)')
  }

  gen(stmts: Stmt[]): void {
    for (const s of stmts) {
      if (s.kind === 'func') {
        this.funcs.set(s.name, new FuncInfo(s.name, s.params, s.body))
      } else {
        this.genStmt(this.foldStmt(s))
      }
    }
    // emit function bodies after main code
    for (const fi of this.funcs.values()) this.emitFunc(fi)
  }

  // --- statements ---

  private genStmt(s: Stmt): void {
    switch (s.kind) {
      case 'var': this.genVar(s); break
      case 'assign': this.genAssign(s); break
      case 'if': this.genIf(s); break
      case 'while': this.genWhile(s); break
      case 'do': this.genDo(s); break
      case 'return': this.genReturn(s); break
      case 'block': for (const ss of s.stmts) this.genStmt(ss); break
      case 'expr': this.genExpr(s.expr); break
      case 'halt': this.asm.push('        MOVEQ   #0,D0'); this.asm.push('        TRAP    #15'); break
    }
  }

  private genVar(s: { kind: 'var'; name: string; init: Expr }): void {
    if (this.vars.has(s.name)) throw new Error(`duplicate var '${s.name}'`)
    const reg = this.allocVar(s.name)
    this.genReg(reg, s.init)
    this.asm.push(`        ; var ${s.name} = D${reg}`)
  }

  private genAssign(s: { kind: 'assign'; name: string; expr: Expr }): void {
    const reg = this.vars.get(s.name)
    if (reg === undefined) throw new Error(`unknown var '${s.name}'`)
    this.genReg(reg, s.expr)
  }

  private genIf(s: { kind: 'if'; cond: Expr; then: Stmt; els?: Stmt }): void {
    const lFalse = this.lbl(); const lEnd = this.lbl()
    this.genCondBranch(s.cond, lFalse, false)
    this.genStmt(s.then)
    if (s.els) { this.asm.push(`        BRA     ${lEnd}`); this.asm.push(lFalse + ':'); this.genStmt(s.els); this.asm.push(lEnd + ':') }
    else this.asm.push(lFalse + ':')
  }

  private genWhile(s: { kind: 'while'; cond: Expr; body: Stmt }): void {
    const lStart = this.lbl(); const lEnd = this.lbl()
    this.asm.push(lStart + ':')
    this.genCondBranch(s.cond, lEnd, false)
    this.genStmt(s.body)
    this.asm.push(`        BRA     ${lStart}`)
    this.asm.push(lEnd + ':')
  }

  private genDo(s: { kind: 'do'; body: Stmt; cond: Expr }): void {
    const lStart = this.lbl(); const lEnd = this.lbl()
    this.asm.push(lStart + ':')
    this.genStmt(s.body)
    this.genCondBranch(s.cond, lStart, true)
    this.asm.push(lEnd + ':')
  }

  private genReturn(s: { kind: 'return'; expr?: Expr }): void {
    if (s.expr) this.genReg(0, s.expr)
    if (this.funcExitLabel) this.asm.push(`        BRA     ${this.funcExitLabel}`)
    else this.asm.push('        RTS')
  }

  private emitFunc(fi: FuncInfo): void {
    // ISR naming convention: func onISR1…onISR7
    const isrMatch = fi.name.match(/^onISR([1-7])$/)
    if (isrMatch) {
      this.asm.push('')
      this.asm.push(`FUNC_${fi.name}:`)
      const outerNextReg = this.nextReg
      // ISRs own D2-D7 (game state) — only save scratch D0/D1/A0
      this.nextReg = 7  // ISR locals start at D7 (beyond globals)
      this.asm.push('        MOVE.L  D0,-(A7)')
      this.asm.push('        MOVE.L  D1,-(A7)')
      this.asm.push('        MOVE.L  A0,-(A7)')
      this.genStmt(this.foldStmt(fi.body))
      this.asm.push('        MOVE.L  (A7)+,A0')
      this.asm.push('        MOVE.L  (A7)+,D1')
      this.asm.push('        MOVE.L  (A7)+,D0')
      this.asm.push('        RTE')
      this.nextReg = outerNextReg
      return
    }

    // Regular function
    this.asm.push('')
    this.asm.push(`FUNC_${fi.name}:`)
    const exitlab = this.lbl(); this.funcExitLabel = exitlab
    const outerNextReg = this.nextReg
    // Save D4-D7 globals and remove them from vars (they cannot be accessed inside the function)
    const savedGlobals = new Map<number, string>()
    for (let r = 4; r <= 7; r++) {
      for (const [n, v] of this.vars) {
        if (v === r) { savedGlobals.set(r, n); break }
      }
    }
    for (const [r] of savedGlobals) { this.asm.push(`        MOVE.L  D${r},-(A7)`) }
    for (const [r, n] of savedGlobals) { this.vars.delete(n) }
    // Reset nextReg to D4 for function-local vars and params
    this.nextReg = 4 + fi.params.length
    // Move params from D0-D3 to D4-D7
    for (let i = 0; i < fi.params.length; i++) {
      this.asm.push(`        MOVE.L  D${i},D${4 + i}`)
    }
    // Set up local var map
    const outerVars = new Map(this.vars)
    for (let i = 0; i < fi.params.length; i++) {
      this.vars.set(fi.params[i], 4 + i)
    }
    // Generate body
    this.genStmt(this.foldStmt(fi.body))
    // Exit label
    this.asm.push(exitlab + ':')
    // Restore globals and vars
    this.vars = outerVars
    for (const [r, n] of savedGlobals) { this.vars.set(n, r) }
    this.nextReg = outerNextReg
    for (const [r] of [...savedGlobals].reverse()) { this.asm.push(`        MOVE.L  (A7)+,D${r}`) }
    this.asm.push('        RTS')
    this.funcExitLabel = ''
  }

  private varsHasReg(reg: number): boolean {
    for (const r of this.vars.values()) if (r === reg) return true
    return false
  }

  // --- expressions → D0/D1 ---

  private genExpr(e: Expr): void { const r = this.doExpr(e); if (r >= 0 && r !== 0) this.asm.push(`        MOVE.L  D${r},D0`) }

  private doExpr(e: Expr, dest?: number): number {
    switch (e.kind) {
      case 'number': return this.genImm(e.val, dest)
      case 'ident': {
        const reg = this.vars.get(e.name)
        if (reg === undefined) throw new Error(`unknown var '${e.name}'`)
        if (dest !== undefined && dest !== reg) { this.asm.push(`        MOVE.L  D${reg},D${dest}`); return dest }
        if (dest === undefined) { this.asm.push(`        MOVE.L  D${reg},D0`); return 0 }
        return reg
      }
      case 'unary': {
        const d = dest ?? 0; const r = this.doExpr(e.expr, d)
        if (e.op === '-') this.asm.push(`        NEG.L   D${r}`)
        else { this.asm.push(`        TST.L   D${r}`); this.asm.push('        SEQ     D' + r); this.asm.push('        ANDI.L  #1,D' + r) }
        return r
      }
      case 'binary': {
        // Shift by constant (assembler doesn't support register shifts)
        if ((e.op === '<<' || e.op === '>>') && e.right.kind === 'number') {
          this.doExpr(e.left, 0)
          this.asm.push(`        ${e.op === '<<' ? 'LSL' : 'ASR'}.L   #${e.right.val},D0`)
          if (dest !== undefined && dest !== 0) this.asm.push(`        MOVE.L  D0,D${dest}`)
          return dest ?? 0
        }
        // Shortcut: ident ± small number
        if (e.left.kind === 'ident' && e.right.kind === 'number' && (e.op === '+' || e.op === '-')) {
          const reg = this.vars.get(e.left.name)
          if (reg !== undefined && e.right.val >= 1 && e.right.val <= 8) {
            if (e.op === '+') this.asm.push(`        ADDQ    #${e.right.val},D${reg}`); else this.asm.push(`        SUBQ    #${e.right.val},D${reg}`)
            if (dest !== undefined && reg !== dest) this.asm.push(`        MOVE.L  D${reg},D${dest}`)
            return dest ?? reg
          }
          if (reg !== undefined) {
            const v = e.op === '+' ? e.right.val : -e.right.val
            this.asm.push(`        ${v >= 0 ? 'ADDI' : 'SUBI'}    #${Math.abs(v)},D${reg}`)
            if (dest !== undefined && reg !== dest) this.asm.push(`        MOVE.L  D${reg},D${dest}`)
            return dest ?? reg
          }
        }
        // General
        this.doExpr(e.left, 0)
        this.asm.push('        MOVE.L  D0,-(A7)')
        this.doExpr(e.right, 1)
        this.asm.push('        MOVE.L  (A7)+,D0')
        this.genBinOp(e.op)
        if (dest !== undefined && dest !== 0) this.asm.push(`        MOVE.L  D0,D${dest}`)
        return dest ?? 0
      }
      case 'call': return this.genCall(e, dest)
    }
    return 0
  }

  private genImm(val: number, dest?: number): number {
    const d = dest ?? 0
    if (val >= -128 && val <= 127) this.asm.push(`        MOVEQ   #${val},D${d}`); else this.asm.push(`        MOVE.L  #${val},D${d}`)
    return d
  }

  private genBinOp(op: string): void {
    if (op === '+') { this.asm.push('        ADD.L   D1,D0'); return }
    if (op === '-') { this.asm.push('        SUB.L   D1,D0'); return }
    if (op === '*') { this.asm.push('        MULS    D1,D0'); return }
    if (op === '/') { this.asm.push('        DIVS    D1,D0'); return }
    if (op === '%') { this.asm.push('        DIVS    D1,D0'); this.asm.push('        SWAP    D0'); return }
    if (op === '&') { this.asm.push('        AND.L   D1,D0'); return }
    if (op === '|') { this.asm.push('        OR.L    D1,D0'); return }
    if (op === '^') { this.asm.push('        EOR.L   D1,D0'); return }
    if (op === '<<') { this.asm.push('        LSL.L   D1,D0'); return }
    if (op === '>>') { this.asm.push('        ASR.L   D1,D0'); return }
    const cmpCC: Record<string, string> = { '==': 'SEQ', '!=': 'SNE', '<': 'SLT', '>': 'SGT', '<=': 'SLE', '>=': 'SGE' }
    const cc = cmpCC[op]
    if (cc) { this.asm.push('        CMP.L   D1,D0'); this.asm.push(`        ${cc}     D0`); this.asm.push('        ANDI.L  #1,D0'); return }
    if (op === '&&' || op === '||') {
      const lSkip = this.lbl(), lEnd = this.lbl()
      if (op === '&&') {
        this.asm.push('        TST.L   D0'); this.asm.push(`        BEQ     ${lSkip}`)
        this.asm.push('        TST.L   D1'); this.asm.push(`        BEQ     ${lSkip}`)
        this.asm.push('        MOVEQ   #1,D0'); this.asm.push(`        BRA     ${lEnd}`); this.asm.push(lSkip + ':')
        this.asm.push('        MOVEQ   #0,D0'); this.asm.push(lEnd + ':')
      } else {
        this.asm.push('        TST.L   D0'); this.asm.push(`        BNE     ${lSkip}`)
        this.asm.push('        TST.L   D1'); this.asm.push(`        BNE     ${lSkip}`)
        this.asm.push('        MOVEQ   #0,D0'); this.asm.push(`        BRA     ${lEnd}`); this.asm.push(lSkip + ':')
        this.asm.push('        MOVEQ   #1,D0'); this.asm.push(lEnd + ':')
      }
      return
    }
    throw new Error(`unknown binary op '${op}'`)
  }

  private genCondBranch(cond: Expr, label: string, jumpIfTrue: boolean): void {
    if (cond.kind === 'binary' && ['==', '!=', '<', '>', '<=', '>='].includes(cond.op)) {
      this.doExpr(cond.left, 0)
      if (cond.right.kind === 'number') {
        this.asm.push(`        CMPI    #${cond.right.val},D0`)
      } else {
        this.asm.push('        MOVE.L  D0,-(A7)')
        this.doExpr(cond.right, 1)
        this.asm.push('        MOVE.L  (A7)+,D0')
        this.asm.push('        CMP.L   D1,D0')
      }
      if (jumpIfTrue) this.asm.push(`        ${cond.op === '==' ? 'BEQ' : cond.op === '!=' ? 'BNE' : cond.op === '<' ? 'BLT' : cond.op === '>' ? 'BGT' : cond.op === '<=' ? 'BLE' : 'BGE'}     ${label}`)
      else this.asm.push(`        ${cond.op === '==' ? 'BNE' : cond.op === '!=' ? 'BEQ' : cond.op === '<' ? 'BGE' : cond.op === '>' ? 'BLE' : cond.op === '<=' ? 'BGT' : 'BLT'}     ${label}`)
    } else {
      this.genExpr(cond)
      if (jumpIfTrue) { this.asm.push('        TST.L   D0'); this.asm.push(`        BNE     ${label}`) }
      else { this.asm.push('        TST.L   D0'); this.asm.push(`        BEQ     ${label}`) }
    }
  }

  // --- built-in calls ---
  private genCall(e: { kind: 'call'; name: string; args: Expr[] }, dest?: number): number {
    // Check user function
    const fn = this.funcs.get(e.name)
    if (fn) {
      if (e.args.length !== fn.params.length) throw new Error(`'${e.name}' expects ${fn.params.length} args, got ${e.args.length}`)
      // Save ALL D2-D7 (callee-saved in 68K ABI)
      for (let r = 2; r <= 7; r++) { this.asm.push(`        MOVE.L  D${r},-(A7)`) }
      // Evaluate args → stack (each into D0, then push; avoids clobber)
      for (let i = 0; i < e.args.length; i++) {
        this.doExpr(e.args[i], 0)
        this.asm.push('        MOVE.L  D0,-(A7)')
      }
      // Pop args → Dn in reverse order
      for (let i = e.args.length - 1; i >= 0; i--) {
        this.asm.push(`        MOVE.L  (A7)+,D${i}`)
      }
      this.asm.push(`        JSR     FUNC_${fn.name}`)
      // Restore D2-D7
      for (let r = 7; r >= 2; r--) { this.asm.push(`        MOVE.L  (A7)+,D${r}`) }
      if (dest !== undefined && dest !== 0) this.asm.push(`        MOVE.L  D0,D${dest}`)
      return dest ?? 0
    }
    // Built-ins
    if (e.name === 'render_enemy') {
      if (e.args.length !== 2) throw new Error('render_enemy(x, y)')
      for (let r = 2; r <= 6; r++) { this.asm.push(`        MOVE.L  D${r},-(A7)`) }
      // Evaluate first arg → push, second arg → push (avoids clobbering globals)
      this.doExpr(e.args[0], 0); this.asm.push('        MOVE.L  D0,-(A7)')
      this.doExpr(e.args[1], 0); this.asm.push('        MOVE.L  D0,-(A7)')
      this.asm.push('        MOVE.L  (A7)+,D6')
      this.asm.push('        MOVE.L  (A7)+,D5')
      this.asm.push('        MOVEQ   #3,D0'); this.asm.push('        TRAP    #1')
      for (let r = 6; r >= 2; r--) { this.asm.push(`        MOVE.L  (A7)+,D${r}`) }
      return -1
    }
    if (e.name === 'shoot') {
      if (e.args.length !== 2) throw new Error('shoot(ex, ey)')
      for (let r = 2; r <= 6; r++) { this.asm.push(`        MOVE.L  D${r},-(A7)`) }
      this.doExpr(e.args[0], 0); this.asm.push('        MOVE.L  D0,-(A7)')
      this.doExpr(e.args[1], 0); this.asm.push('        MOVE.L  D0,-(A7)')
      this.asm.push('        MOVE.L  (A7)+,D6')
      this.asm.push('        MOVE.L  (A7)+,D5')
      this.asm.push('        MOVEQ   #4,D0'); this.asm.push('        TRAP    #1')
      for (let r = 6; r >= 2; r--) { this.asm.push(`        MOVE.L  (A7)+,D${r}`) }
      return 0
    }
    if (e.name === 'shoot') {
      if (e.args.length !== 2) throw new Error('shoot(ex, ey)')
      for (let r = 2; r <= 6; r++) { this.asm.push(`        MOVE.L  D${r},-(A7)`) }
      this.doExpr(e.args[0], 0); this.asm.push('        MOVE.L  D0,D5')
      this.doExpr(e.args[1], 0); this.asm.push('        MOVE.L  D0,D6')
      this.asm.push('        MOVEQ   #4,D0'); this.asm.push('        TRAP    #1')
      for (let r = 6; r >= 2; r--) { this.asm.push(`        MOVE.L  (A7)+,D${r}`) }
      return 0  // hit result in D0
    }
    if (e.name === 'shoot') {
      for (let r = 2; r <= 4; r++) { this.asm.push(`        MOVE.L  D${r},-(A7)`) }
      // read enemy position from globals (D5=en_x packed) — pass to D5,D6
      // Actually: Script passes enemy x,y as args to shoot(en1_x, en1_y)
      if (e.args.length !== 2) throw new Error('shoot(ex, ey)')
      this.doExpr(e.args[0], 0); this.asm.push('        MOVE.L  D0,D5')
      this.doExpr(e.args[1], 0); this.asm.push('        MOVE.L  D0,D6')
      this.asm.push('        MOVEQ   #4,D0'); this.asm.push('        TRAP    #1')
      for (let r = 4; r >= 2; r--) { this.asm.push(`        MOVE.L  (A7)+,D${r}`) }
      return 0  // hit result in D0
    }
    if (e.name === 'is_wall') {
      if (e.args.length !== 2) throw new Error('is_wall(x, y)')
      this.doExpr(e.args[0], 0); this.asm.push('        MOVE.L  D0,-(A7)')
      this.doExpr(e.args[1], 0); this.asm.push('        MOVE.L  D0,D6')
      this.asm.push('        MOVE.L  (A7)+,D5')
      this.asm.push('        MOVEQ   #5,D0')
      this.asm.push('        TRAP    #1')
      if (dest !== undefined && dest !== 0) this.asm.push(`        MOVE.L  D0,D${dest}`)
      return dest ?? 0
    }
    if (e.name === 'walk') {
      if (e.args.length !== 1) throw new Error('walk(dir) — dir=1 forward, -1 backward')
      for (let r = 4; r <= 7; r++) { this.asm.push(`        MOVE.L  D${r},-(A7)`) }
      this.doExpr(e.args[0], 0); this.asm.push('        MOVE.L  D0,D1')
      this.asm.push('        MOVEQ   #2,D0')
      this.asm.push('        TRAP    #1')
      for (let r = 7; r >= 4; r--) { this.asm.push(`        MOVE.L  (A7)+,D${r}`) }
      return -1
    }
    if (e.name === 'raycast') {
      if (e.args.length !== 3) throw new Error('raycast(px, py, angle) — 8.8 fixed, angle 0-255')
      for (let r = 2; r <= 7; r++) { this.asm.push(`        MOVE.L  D${r},-(A7)`) }
      for (let i = 0; i < 3; i++) { this.doExpr(e.args[i], 0); this.asm.push(`        MOVE.L  D0,D${i + 1}`) }
      this.asm.push('        MOVEQ   #0,D0')
      this.asm.push('        TRAP    #1')
      for (let r = 7; r >= 2; r--) { this.asm.push(`        MOVE.L  (A7)+,D${r}`) }
      return -1
    }
    if (e.name === 'divide') {
      if (e.args.length !== 2) throw new Error('divide(a, b)')
      this.doExpr(e.args[0], 0); this.asm.push('        MOVE.L  D0,D1')
      this.doExpr(e.args[1], 0); this.asm.push('        MOVE.L  D0,D2')
      this.asm.push('        MOVEQ   #1,D0')
      this.asm.push('        TRAP    #1')
      return 0  // quotient in D0
    }
    if (e.name === 'clear') {
      this.asm.push('        MOVEQ   #7,D0')
      this.asm.push('        TRAP    #15')
      return -1
    }
    if (e.name === 'peek') {
      if (e.args.length !== 1) throw new Error('peek(addr) takes 1 arg')
      this.doExpr(e.args[0], 0)
      this.asm.push('        MOVE.L  A0,-(A7)')
      this.asm.push('        MOVE.L  D0,A0')
      this.asm.push('        CLR.L   D0')
      this.asm.push('        MOVE.B  (A0),D0')
      this.asm.push('        MOVE.L  (A7)+,A0')
      if (dest !== undefined && dest !== 0) this.asm.push(`        MOVE.L  D0,D${dest}`)
      return dest ?? 0
    }
    if (e.name === 'poke') {
      if (e.args.length !== 2) throw new Error('poke(addr, val) takes 2 args')
      this.doExpr(e.args[0], 0)
      this.asm.push('        MOVE.L  D0,-(A7)')
      this.doExpr(e.args[1], 1)
      this.asm.push('        MOVE.L  (A7)+,A0')
      this.asm.push('        MOVE.B  D1,(A0)')
      return -1
    }
    throw new Error(`unknown function '${e.name}'`)
  }

  private genReg(reg: number, e: Expr): void { this.doExpr(e, reg) }

  // --- constant folding ---
  private fold(e: Expr): Expr {
    if (e.kind === 'number' || e.kind === 'ident') return e
    if (e.kind === 'call') return { ...e, args: e.args.map(a => this.fold(a)) }
    if (e.kind === 'unary') { const inner = this.fold(e.expr); if (inner.kind === 'number') { if (e.op === '-') return { kind: 'number', val: -inner.val }; if (e.op === '!') return { kind: 'number', val: inner.val ? 0 : 1 } }; return { kind: 'unary', op: e.op, expr: inner } }
    if (e.kind === 'binary') {
      const left = this.fold(e.left), right = this.fold(e.right)
      if (left.kind === 'number' && right.kind === 'number') {
        const l = left.val, r = right.val; let v = 0
        switch (e.op) {
          case '+': v = l + r; break; case '-': v = l - r; break; case '*': v = l * r; break
          case '/': v = r !== 0 ? Math.trunc(l / r) : 0; break; case '%': v = r !== 0 ? l % r : 0; break
          case '&': v = l & r; break; case '|': v = l | r; break; case '^': v = l ^ r; break
          case '<<': v = l << r; break; case '>>': v = l >> r; break
          case '==': v = l === r ? 1 : 0; break; case '!=': v = l !== r ? 1 : 0; break
          case '<': v = l < r ? 1 : 0; break; case '>': v = l > r ? 1 : 0; break
          case '<=': v = l <= r ? 1 : 0; break; case '>=': v = l >= r ? 1 : 0; break
        }
        return { kind: 'number', val: v }
      }
      return { kind: 'binary', left, op: e.op, right }
    }
    return e
  }

  private foldStmt(s: Stmt): Stmt {
    switch (s.kind) {
      case 'var': return { ...s, init: this.fold(s.init) }
      case 'assign': return { ...s, expr: this.fold(s.expr) }
      case 'expr': return { ...s, expr: this.fold(s.expr) }
      case 'return': return { ...s, expr: s.expr ? this.fold(s.expr) : undefined }
      case 'if': return { ...s, cond: this.fold(s.cond), then: this.foldStmt(s.then), els: s.els ? this.foldStmt(s.els) : undefined }
      case 'while': return { ...s, cond: this.fold(s.cond), body: this.foldStmt(s.body) }
      case 'do': return { ...s, cond: this.fold(s.cond), body: this.foldStmt(s.body) }
      case 'block': return { ...s, stmts: s.stmts.map(ss => this.foldStmt(ss)) }
      case 'func': return { ...s, body: this.foldStmt(s.body) }
      default: return s
    }
  }
}

// ========== Compiler entry ==========

export class ScriptCompiler {
  compile(src: string): { asm: string; errors: string[] } {
    const errors: string[] = []
    let stmts: Stmt[] = []
    try { stmts = new Parser(src).parse() } catch (e: any) { errors.push(e.message); return { asm: '', errors } }
    const cg = new CodeGen()
    try { cg.gen(stmts) } catch (e: any) { errors.push(e.message); return { asm: '', errors } }
    const asmLines: string[] = []
    asmLines.push('        ORG     $4000')
    asmLines.push('START:')
    // Auto-install ISR vectors for func onISR1…onISR7
    for (const [name] of cg.funcs) {
      const m = name.match(/^onISR([1-7])$/)
      if (m) {
        const level = parseInt(m[1])
        const vec = 0x60 + level * 4
        asmLines.push(`        MOVE.L  #FUNC_${name},$${vec.toString(16).toUpperCase()}`)
      }
    }
    for (const line of cg.asm) asmLines.push(line)
    asmLines.push('')
    asmLines.push('        END     START')
    return { asm: asmLines.join('\n'), errors: [] }
  }
}
