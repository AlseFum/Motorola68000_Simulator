<template>
  <div class="editor-wrapper" ref="editorContainer"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as monaco from 'monaco-editor'

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    return new editorWorker()
  },
}

const props = defineProps<{ modelValue: string; highlightLine?: number }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const editorContainer = ref<HTMLElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let currentDecoration: string[] = []

function initEditor() {
  if (!editorContainer.value) return

  monaco.languages.register({ id: 'm68k' })

  monaco.languages.setMonarchTokensProvider('m68k', {
    keywords: [
      'MOVE', 'MOVEA', 'MOVEQ', 'ADD', 'ADDA', 'ADDI', 'ADDQ',
      'SUB', 'SUBA', 'SUBI', 'SUBQ', 'MULS', 'MULU', 'DIVS', 'DIVU',
      'CMP', 'CMPA', 'CMPI', 'TST', 'CLR', 'NEG', 'NOT',
      'AND', 'ANDI', 'OR', 'ORI', 'EOR', 'EORI',
      'LSL', 'LSR', 'ASL', 'ASR', 'SWAP', 'EXG',
      'LEA', 'PEA', 'LINK', 'UNLK',
      'BRA', 'BSR', 'BEQ', 'BNE', 'BGT', 'BGE', 'BLT', 'BLE',
      'BHI', 'BLS', 'BCC', 'BCS', 'BPL', 'BMI', 'BVC', 'BVS',
      'JSR', 'JMP', 'RTS', 'RTE', 'NOP', 'TRAP', 'HALT',
      'DC.B', 'DC.W', 'DC.L', 'DS.B', 'DS.W', 'DS.L', 'EQU',
      'ORG', 'END',
    ],
    registers: [
      'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7',
      'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7',
      'SP', 'PC', 'SR', 'CCR', 'USP', 'SSP',
    ],
    tokenizer: {
      root: [
        [/[a-zA-Z_]\w*:/, 'type.identifier'],
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@registers': 'type',
            '@default': 'identifier',
          },
        }],
        [/\$[0-9a-fA-F]+/, 'number.hex'],
        [/%[01]+/, 'number.binary'],
        [/\d+/, 'number'],
        [/;.*$/, 'comment'],
        [/'.*$/, 'comment'],
        [/#/, 'delimiter'],
        [/\./, 'delimiter'],
        [/[(),+\-]/, 'delimiter'],
        [/'[^']*'/, 'string'],
        [/"[^"]*"/, 'string'],
      ],
    },
  })

  monaco.languages.setLanguageConfiguration('m68k', {
    comments: { lineComment: ';' },
    brackets: [['(', ')']],
  })

  monaco.editor.defineTheme('m68k-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '569cd6', fontStyle: 'bold' },
      { token: 'type', foreground: '9cdcfe' },
      { token: 'type.identifier', foreground: 'dcdcaa' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'number.hex', foreground: 'b5cea8' },
      { token: 'number.binary', foreground: 'b5cea8' },
      { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'delimiter', foreground: '808080' },
      { token: 'identifier', foreground: 'd4d4d4' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.lineHighlightBackground': '#2a2d2e',
      'editor.selectionBackground': '#264f78',
    },
  })

  editor = monaco.editor.create(editorContainer.value, {
    value: props.modelValue,
    language: 'm68k',
    theme: 'm68k-dark',
    fontSize: 13,
    fontFamily: "'Consolas', 'Courier New', monospace",
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 8,
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: false },
    padding: { top: 4 },
  })

  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor!.getValue())
  })
}

onMounted(() => {
  nextTick(() => initEditor())
})

onUnmounted(() => {
  editor?.dispose()
})

watch(() => props.modelValue, (val) => {
  if (editor && val !== editor.getValue()) {
    editor.setValue(val)
  }
})

watch(() => props.highlightLine, (line) => {
  if (!editor) return
  currentDecoration = editor.deltaDecorations(currentDecoration, [])
  if (line !== undefined && line >= 0) {
    currentDecoration = editor.deltaDecorations([], [
      {
        range: new monaco.Range(line + 1, 1, line + 1, 1),
        options: {
          isWholeLine: true,
          className: 'exec-line-highlight',
          linesDecorationsClassName: 'exec-line-arrow',
        },
      },
    ])
    editor.revealLineInCenterIfOutsideViewport(line + 1)
  }
})
</script>

<style scoped>
.editor-wrapper {
  width: 100%;
  height: 100%;
  min-height: 100px;
}
:deep(.exec-line-highlight) {
  background: rgba(78, 201, 176, 0.15) !important;
  border-left: 3px solid #4ec9b0;
}
:deep(.exec-line-arrow) {
  background: #4ec9b0;
  width: 4px !important;
  margin-left: 3px;
}
</style>
