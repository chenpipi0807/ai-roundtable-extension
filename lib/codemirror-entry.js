// CodeMirror 6 入口文件 — 导出 content script 需要的所有模块
export {
  EditorView,
  basicSetup
} from 'codemirror';

export {
  EditorState,
  Compartment,
  StateEffect,
  StateField
} from '@codemirror/state';

export {
  Decoration,
  WidgetType,
  ViewPlugin,
  ViewUpdate,
  keymap
} from '@codemirror/view';

export {
  syntaxHighlighting,
  defaultHighlightStyle,
  foldGutter,
  indentOnInput,
  bracketMatching,
  foldKeymap
} from '@codemirror/language';

export {
  history,
  defaultKeymap,
  historyKeymap
} from '@codemirror/commands';

export {
  highlightSelectionMatches,
  searchKeymap
} from '@codemirror/search';

export {
  closeBrackets,
  autocompletion,
  closeBracketsKeymap,
  completionKeymap
} from '@codemirror/autocomplete';

export {
  lintKeymap
} from '@codemirror/lint';

// 主题
export { oneDark } from '@codemirror/theme-one-dark';
