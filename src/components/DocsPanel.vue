<template>
  <div class="docs-panel">
    <div class="panel-header">Documentation</div>
    <div class="docs-scroll">
      <h2>Script Language</h2>

      <h3>Variables &amp; Expressions</h3>
      <pre>var x = 128;
x = x + 4;
var z = (a + b) * c &amp; 255;</pre>
      <p>Up to 6 global variables (D2–D7). 32-bit signed integers.<br/>
         Operators: <code>+ - * / % &amp; | ^ &lt;&lt; &gt;&gt; == != &lt; &gt; &lt;= &gt;= &amp;&amp; || !</code><br/>
         Precedence follows C rules.</p>

      <h3>Control Flow</h3>
      <pre>if (x &gt; 240) { x = 0; } else { x = x + 1; }
while (1) { ... }
do { ... } while (x &lt; 100);</pre>

      <h3>Functions</h3>
      <pre>func plot(x, y, c) {
    poke(0xFF0000 + y*256 + x, c);
    return x + y;
}</pre>
      <p>Up to 4 parameters (D0–D3), return in D0.<br/>
         Regular functions save/restore D4–D7 globals automatically.</p>

      <h3>Interrupts</h3>
      <pre>func onISR1() { ... }  // D-Pad     (vector $64)
func onISR2() { ... }  // Keyboard/A/B ($68)
func onISR3() { ... }  // VBlank 60Hz ($6C)
func onISR4() { ... }  // User      ($70)
func onISR5() { ... }  // User      ($74)
func onISR6() { ... }  // User      ($78)
func onISR7() { ... }  // NMI       ($7C)</pre>
      <p>ISRs own D2–D7 (game state). Only D0,D1,A0 are saved/restored.<br/>
        Vector installed automatically at startup.</p>

      <hr/>

      <h2>Built-in Functions</h2>

      <table>
        <tr><th>Function</th><th>Description</th></tr>
        <tr><td><code>peek(addr)</code></td><td>Read byte from memory address</td></tr>
        <tr><td><code>poke(addr, val)</code></td><td>Write byte to memory address</td></tr>
        <tr><td><code>halt()</code></td><td>Stop program</td></tr>
        <tr><td><code>clear()</code></td><td>Clear display buffer (TRAP #15 / D0=7)</td></tr>
        <tr><td><code>walk(dir)</code></td><td>Move player (±1) in facing direction (TRAP #1)</td></tr>
        <tr><td><code>raycast(px, py, pa)</code></td><td>Render 3D view (TRAP #1 / D0=0)</td></tr>
        <tr><td><code>render_enemy(x, y)</code></td><td>Draw sprite at world pos (TRAP #1 / D0=3)</td></tr>
        <tr><td><code>shoot(ex, ey)</code></td><td>Hitscan vs enemy (TRAP #1 / D0=4)</td></tr>
        <tr><td><code>is_wall(x, y)</code></td><td>Return 1 if wall at game pos (TRAP #1 / D0=5)</td></tr>
        <tr><td><code>divide(a, b)</code></td><td>a / b → quotient in D0 (TRAP #1 / D0=1)</td></tr>
      </table>

      <hr/>

      <h2>Memory-Mapped I/O</h2>

      <table>
        <tr><th>Address</th><th>R/W</th><th>Signal</th></tr>
        <tr><td><code>$FE0000</code></td><td>R</td><td>Up (D-Pad / W / ↑)</td></tr>
        <tr><td><code>$FE0001</code></td><td>R</td><td>Down (D-Pad / S / ↓)</td></tr>
        <tr><td><code>$FE0002</code></td><td>R</td><td>Left (D-Pad / A / ←)</td></tr>
        <tr><td><code>$FE0003</code></td><td>R</td><td>Right (D-Pad / D / →)</td></tr>
        <tr><td><code>$FE0004</code></td><td>R</td><td>A / Fire (Space / Enter)</td></tr>
        <tr><td><code>$FE0005</code></td><td>R</td><td>B (Shift)</td></tr>
        <tr><td><code>$FF0000</code></td><td>R/W</td><td>Display buffer (256×256×1B grayscale)</td></tr>
      </table>

      <hr/>

      <h2>TRAP #15 Functions (D0 = …)</h2>

      <table>
        <tr><th>D0</th><th>Action</th><th>Parameters</th></tr>
        <tr><td>0</td><td>Halt</td><td>—</td></tr>
        <tr><td>1</td><td>Print char</td><td>D1.W = ASCII</td></tr>
        <tr><td>2</td><td>Print string</td><td>A1 = null-terminated addr</td></tr>
        <tr><td>3</td><td>Print hex</td><td>D1.L</td></tr>
        <tr><td>4</td><td>Print decimal (16-bit)</td><td>D1.W</td></tr>
        <tr><td>5</td><td>Print decimal (32-bit)</td><td>D1.L</td></tr>
        <tr><td>6</td><td>Print 4 ASCII chars</td><td>D1.L</td></tr>
        <tr><td>7</td><td>Clear display</td><td>—</td></tr>
      </table>

      <hr/>

      <h2>TRAP #1 — 3D Coprocessor (D0 = …)</h2>

      <table>
        <tr><th>D0</th><th>Function</th><th>Input</th><th>Output</th></tr>
        <tr><td>0</td><td>Raycast + Render</td><td>D1=px, D2=py, D3=angle</td><td>Display filled</td></tr>
        <tr><td>1</td><td>Fast divide</td><td>D1 ÷ D2</td><td>D1=quot, D2=rem</td></tr>
        <tr><td>2</td><td>Walk</td><td>D1=dir(±1)</td><td>D2,D3 updated</td></tr>
        <tr><td>3</td><td>Render sprite</td><td>D5=x, D6=y</td><td>Display pixels</td></tr>
        <tr><td>4</td><td>Shoot ray</td><td>D5=x, D6=y</td><td>D1=1 if hit</td></tr>
        <tr><td>5</td><td>Wall check</td><td>D5=x, D6=y</td><td>D0=1 if wall</td></tr>
      </table>

    </div>
  </div>
</template>

<style scoped>
.docs-panel { background:#1e1e1e; padding:8px 12px; font-family: "Segoe UI", sans-serif; overflow:hidden; display:flex; flex-direction:column; height:100%; color:#d4d4d4 }
.panel-header { color:#569cd6; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.8px; margin-bottom:6px; padding-bottom:2px; border-bottom:1px solid #3c3c3c; flex-shrink:0 }
.docs-scroll { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding-right:4px }
h2 { color:#4ec9b0; font-size:14px; margin:12px 0 6px; border-bottom:1px solid #333; padding-bottom:3px }
h3 { color:#569cd6; font-size:12px; margin:10px 0 4px }
pre { background:#252526; padding:6px 10px; border-radius:4px; font-family:Consolas,monospace; font-size:11px; overflow-x:auto; margin:4px 0; color:#ce9178 }
code { color:#ce9178; font-family:Consolas,monospace; font-size:11px; background:rgba(255,255,255,.06); padding:1px 4px; border-radius:2px }
p { font-size:11px; margin:4px 0; line-height:1.5; color:#999 }
table { width:100%; border-collapse:collapse; margin:6px 0; font-size:11px }
th { text-align:left; padding:3px 6px; background:#2a2a2a; color:#888; font-weight:600; border-bottom:1px solid #3c3c3c }
td { padding:2px 6px; border-bottom:1px solid #2a2a2a } 
td code { background:none; padding:0 }
hr { border:none; border-top:1px solid #3c3c3c; margin:12px 0 }
</style>
