/**
 * Markdown 快捷键 — Monaco Editor addAction 封装
 *
 * 支持的快捷键：
 *  Ctrl+B       加粗         **text**
 *  Ctrl+I       斜体         *text*
 *  Ctrl+Shift+S 删除线       ~~text~~
 *  Ctrl+`       行内代码     `text`
 *  Ctrl+K       插入链接     [text](url)
 *  Ctrl+Shift+. 引用块切换   > text
 *  Ctrl+Shift+U 无序列表     - text
 *  Ctrl+Shift+O 有序列表     1. text
 */

import type { editor as IEditor, IDisposable } from 'monaco-editor'

type Monaco = typeof import('monaco-editor')

/** 对选中文本执行包裹操作（无选区时插入标记并选中占位文本） */
function wrapSelection(
  editor: IEditor.IStandaloneCodeEditor,
  wrapper: string
): void {
  const selection = editor.getSelection()!
  const model = editor.getModel()!
  const selectedText = model.getValueInRange(selection)

  if (selectedText) {
    // 已选中文本 → 包裹
    editor.executeEdits('shortcut', [
      {
        range: selection,
        text: wrapper + selectedText + wrapper,
      },
    ])
    // 选中包裹后的全部文本
    const start = selection.getStartPosition()
    const end = selection.getEndPosition()
    editor.setSelection({
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column + wrapper.length * 2,
    } as any)
  } else {
    // 无选区 → 插入占位文本
    const placeholder = '文本'
    editor.executeEdits('shortcut', [
      {
        range: selection,
        text: wrapper + placeholder + wrapper,
      },
    ])
    // 选中占位文本
    const pos = selection.getStartPosition()
    editor.setSelection({
      startLineNumber: pos.lineNumber,
      startColumn: pos.column + wrapper.length,
      endLineNumber: pos.lineNumber,
      endColumn: pos.column + wrapper.length + placeholder.length,
    } as any)
  }
  editor.focus()
}

/** 插入链接：有选区用选区作文本，光标停在 URL 位置 */
function insertLink(editor: IEditor.IStandaloneCodeEditor): void {
  const selection = editor.getSelection()!
  const model = editor.getModel()!

  if (selection.isEmpty()) {
    // 无选区 → 插入 [链接文本](url) 并选中"链接文本"
    const template = '[链接文本](url)'
    editor.executeEdits('shortcut', [{ range: selection, text: template }])
    const pos = selection.getStartPosition()
    editor.setSelection({
      startLineNumber: pos.lineNumber,
      startColumn: pos.column + 1,
      endLineNumber: pos.lineNumber,
      endColumn: pos.column + 5, // "链接文本" 4 个字符
    } as any)
  } else {
    const selectedText = model.getValueInRange(selection)
    editor.executeEdits('shortcut', [
      {
        range: selection,
        text: `[${selectedText}](url)`,
      },
    ])
    const pos = selection.getStartPosition()
    // 光标停在 url 位置
    editor.setPosition({
      lineNumber: pos.lineNumber,
      column: pos.column + selectedText.length + 3, // [text]( ← 光标
    } as any)
  }
  editor.focus()
}

/** 切换行首引用前缀 > */
function toggleBlockquote(editor: IEditor.IStandaloneCodeEditor): void {
  const selection = editor.getSelection()!
  const model = editor.getModel()!
  const line = model.getLineContent(selection.startLineNumber)

  if (/^>\s/.test(line)) {
    // 已有引用 → 移除
    const newLine = line.replace(/^>\s/, '')
    editor.executeEdits('shortcut', [
      {
        range: {
          startLineNumber: selection.startLineNumber,
          startColumn: 1,
          endLineNumber: selection.startLineNumber,
          endColumn: line.length + 1,
        } as any,
        text: newLine,
      },
    ])
  } else {
    // 无引用 → 添加
    editor.executeEdits('shortcut', [
      {
        range: {
          startLineNumber: selection.startLineNumber,
          startColumn: 1,
          endLineNumber: selection.startLineNumber,
          endColumn: 1,
        } as any,
        text: '> ',
      },
    ])
  }
  editor.focus()
}

/** 切换行首无序列表前缀 -  */
function toggleUnordered(editor: IEditor.IStandaloneCodeEditor): void {
  const selection = editor.getSelection()!
  const model = editor.getModel()!
  const line = model.getLineContent(selection.startLineNumber)

  if (/^[-*+]\s/.test(line)) {
    const newLine = line.replace(/^[-*+]\s/, '')
    editor.executeEdits('shortcut', [
      {
        range: {
          startLineNumber: selection.startLineNumber,
          startColumn: 1,
          endLineNumber: selection.startLineNumber,
          endColumn: line.length + 1,
        } as any,
        text: newLine,
      },
    ])
  } else {
    editor.executeEdits('shortcut', [
      {
        range: {
          startLineNumber: selection.startLineNumber,
          startColumn: 1,
          endLineNumber: selection.startLineNumber,
          endColumn: 1,
        } as any,
        text: '- ',
      },
    ])
  }
  editor.focus()
}

/** 切换行首有序列表前缀 1.  */
function toggleOrdered(editor: IEditor.IStandaloneCodeEditor): void {
  const selection = editor.getSelection()!
  const model = editor.getModel()!
  const line = model.getLineContent(selection.startLineNumber)

  const m = line.match(/^(\d+)\.\s/)
  if (m) {
    const newLine = line.replace(/^\d+\.\s/, '')
    editor.executeEdits('shortcut', [
      {
        range: {
          startLineNumber: selection.startLineNumber,
          startColumn: 1,
          endLineNumber: selection.startLineNumber,
          endColumn: line.length + 1,
        } as any,
        text: newLine,
      },
    ])
  } else {
    editor.executeEdits('shortcut', [
      {
        range: {
          startLineNumber: selection.startLineNumber,
          startColumn: 1,
          endLineNumber: selection.startLineNumber,
          endColumn: 1,
        } as any,
        text: '1. ',
      },
    ])
  }
  editor.focus()
}

export function useMarkdownShortcuts() {
  let disposables: IDisposable[] = []

  function register(
    editor: IEditor.IStandaloneCodeEditor,
    monaco: Monaco
  ): void {
    const { KeyMod, KeyCode } = monaco

    const actions = [
      {
        id: 'md-bold',
        label: '加粗 (Ctrl+B)',
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyB],
        run: () => wrapSelection(editor, '**'),
      },
      {
        id: 'md-italic',
        label: '斜体 (Ctrl+I)',
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyI],
        run: () => wrapSelection(editor, '*'),
      },
      {
        id: 'md-strikethrough',
        label: '删除线 (Ctrl+Shift+S)',
        keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS],
        run: () => wrapSelection(editor, '~~'),
      },
      {
        id: 'md-code',
        label: '行内代码 (Ctrl+`)',
        keybindings: [KeyMod.CtrlCmd | KeyCode.Backquote],
        run: () => wrapSelection(editor, '`'),
      },
      {
        id: 'md-link',
        label: '插入链接 (Ctrl+K)',
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyK],
        run: () => insertLink(editor),
      },
      {
        id: 'md-blockquote',
        label: '引用切换 (Ctrl+Shift+.)',
        keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Period],
        run: () => toggleBlockquote(editor),
      },
      {
        id: 'md-unordered',
        label: '无序列表 (Ctrl+Shift+U)',
        keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyU],
        run: () => toggleUnordered(editor),
      },
      {
        id: 'md-ordered',
        label: '有序列表 (Ctrl+Shift+O)',
        keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO],
        run: () => toggleOrdered(editor),
      },
    ]

    disposables = actions.map((a) => editor.addAction(a))
  }

  function dispose(): void {
    disposables.forEach((d) => d.dispose())
    disposables = []
  }

  return { register, dispose }
}
