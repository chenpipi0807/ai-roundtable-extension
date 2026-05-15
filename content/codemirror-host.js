// ============================================================
// 天音 AI 创作助手 — CodeMirror 6 编辑器宿主
// 负责将天音页面的原生 textarea 替换为 CodeMirror 6 编辑器
// CodeMirror bundle 由 manifest.json 中的 content_scripts 预加载，
// 此处仅负责按需返回模块引用
// ============================================================

/**
 * CodeMirror 模块引用（由 manifest 预加载的 IIFE 包设置 window.__tianyinCodeMirror）
 */
let cmModule = null;
let cmLoadingPromise = null;

/**
 * 加载 CodeMirror IIFE 包到 content script 上下文
 * @returns {Promise<Object>} CodeMirror 模块对象
 */
async function ensureCodeMirror() {
  if (cmModule) return cmModule;
  if (cmLoadingPromise) return cmLoadingPromise;

  cmLoadingPromise = new Promise((resolve, reject) => {
    // 如果已加载（manifest 预加载的 content script 已设置）
    if (window.__tianyinCodeMirror) {
      cmModule = window.__tianyinCodeMirror;
      console.log('[天音助手] CodeMirror 6 已加载');
      resolve(cmModule);
      return;
    }

    // 回退：轮询等待（极端情况下 content script 加载时序问题）
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      if (window.__tianyinCodeMirror) {
        clearInterval(checkInterval);
        cmModule = window.__tianyinCodeMirror;
        console.log('[天音助手] CodeMirror 6 加载成功（延迟）');
        resolve(cmModule);
      } else if (attempts > 100) {
        clearInterval(checkInterval);
        reject(new Error('CodeMirror 模块未加载：window.__tianyinCodeMirror 未设置'));
      }
    }, 50);
  });

  return cmLoadingPromise;
}

/**
 * 网易云黑红配色主题（CodeMirror 6 扩展）
 */
function neteaseTheme() {
  const { EditorView } = cmModule;
  return EditorView.theme({
    '&': {
      backgroundColor: '#1a1a1a',
      color: '#e0e0e0',
      fontSize: '14px',
      fontFamily: "'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', monospace",
      lineHeight: '1.6',
      height: '100%',
    },
    '.cm-content': {
      caretColor: '#c20c0c',
      padding: '8px 4px',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#c20c0c',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#c20c0c',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: '#c20c0c33 !important',
    },
    '.cm-activeLine': {
      backgroundColor: '#2a2a2a',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#333333',
    },
    '.cm-gutters': {
      backgroundColor: '#222222',
      color: '#666666',
      border: 'none',
      borderRight: '1px solid #333333',
      minWidth: '32px',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 6px 0 4px',
      fontSize: '12px',
      fontFamily: 'monospace',
    },
    '.cm-foldGutter .cm-gutterElement': {
      padding: '0 4px',
    },
    '.cm-matchingBracket': {
      backgroundColor: '#c20c0c44',
      outline: '1px solid #c20c0c',
    },
    '.cm-nonmatchingBracket': {
      backgroundColor: '#ff000044',
    },
    '.cm-tooltip': {
      backgroundColor: '#2a2a2a',
      border: '1px solid #444',
      color: '#e0e0e0',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: '#c20c0c33',
        color: '#fff',
      },
    },
    // Diff 高亮样式
    '& .cm-diff-insert': {
      backgroundColor: '#1a3a1a !important',
    },
    '& .cm-diff-insert .cm-gutterElement': {
      backgroundColor: '#1a3a1a !important',
      color: '#4caf50',
    },
    '& .cm-diff-delete': {
      backgroundColor: '#3a1a1a !important',
    },
    '& .cm-diff-delete .cm-gutterElement': {
      backgroundColor: '#3a1a1a !important',
      color: '#f44336',
    },
    '& .cm-diff-insert-gutter': {
      backgroundColor: '#1a3a1a',
      color: '#4caf50',
    },
    '& .cm-diff-delete-gutter': {
      backgroundColor: '#3a1a1a',
      color: '#f44336',
    },
    // 占位符样式
    '& .cm-placeholder': {
      color: '#666',
      fontStyle: 'italic',
    },
    // 滚动条
    '& .cm-scroller::-webkit-scrollbar': {
      width: '8px',
      height: '8px',
    },
    '& .cm-scroller::-webkit-scrollbar-track': {
      backgroundColor: '#1a1a1a',
    },
    '& .cm-scroller::-webkit-scrollbar-thumb': {
      backgroundColor: '#444',
      borderRadius: '4px',
    },
    '& .cm-scroller::-webkit-scrollbar-thumb:hover': {
      backgroundColor: '#666',
    },
  });
}

/**
 * 为指定输入框创建 CodeMirror 6 编辑器
 * @param {HTMLTextAreaElement|HTMLInputElement} inputElement - 天音页面的原生输入框
 * @param {Object} options
 * @param {string} options.inputType - INPUT_TYPE 枚举值
 * @param {string} options.placeholder - 占位符文本
 * @param {Function} options.onChange - 内容变化回调
 * @param {Function} options.onSelection - 选中文本回调
 * @returns {Promise<Object>} { view, container }
 */
async function createCodeMirrorEditor(inputElement, options = {}) {
  const cm = await ensureCodeMirror();
  const {
    EditorView,
    EditorState,
    basicSetup,
    Compartment,
    Decoration,
    ViewPlugin,
    keymap,
    oneDark,
    history,
    defaultKeymap,
    historyKeymap,
    syntaxHighlighting,
    defaultHighlightStyle,
    foldGutter,
    indentOnInput,
    bracketMatching,
    foldKeymap,
    highlightSelectionMatches,
    searchKeymap,
    closeBrackets,
    autocompletion,
    closeBracketsKeymap,
    completionKeymap,
    lintKeymap,
  } = cm;

  // 隐藏原生输入框
  const originalDisplay = inputElement.style.display;
  inputElement.style.display = 'none';

  // 创建编辑器容器
  const container = document.createElement('div');
  container.className = 'tianyin-cm-editor';
  container.dataset.inputType = options.inputType || '';
  container.style.cssText = `
    border: 1px solid #333;
    border-radius: 4px;
    overflow: hidden;
    min-height: ${inputElement instanceof HTMLTextAreaElement ? '126px' : '40px'};
    height: auto;
  `;

  // 插入到输入框的父容器中
  inputElement.parentNode.insertBefore(container, inputElement.nextSibling);

  // 占位符扩展
  const placeholderExt = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const isEmpty = update.state.doc.toString().length === 0;
      container.querySelector('.cm-content')?.classList.toggle('cm-empty', isEmpty);
    }
  });

  // 内容变化同步到原生输入框
  const syncExt = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const value = update.state.doc.toString();
      if (typeof triggerNativeInput === 'function') {
        triggerNativeInput(inputElement, value);
      }
    }
  });

  // 选中文本监听
  const selectionListeners = [];
  if (options.onSelection) {
    const selExt = EditorView.updateListener.of((update) => {
      if (update.selectionSet) {
        const sel = update.state.selection.main;
        if (!sel.empty) {
          const text = update.state.sliceDoc(sel.from, sel.to);
          options.onSelection({
            text,
            from: sel.from,
            to: sel.to,
            inputType: options.inputType,
          });
        }
      }
    });
    selectionListeners.push(selExt);
  }

  // 构建扩展列表
  const extensions = [
    basicSetup,
    neteaseTheme(),
    placeholderExt,
    syncExt,
    ...selectionListeners,
    // 自定义快捷键
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...searchKeymap,
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...lintKeymap,
    ]),
  ];

  // 创建编辑器状态
  const state = EditorState.create({
    doc: inputElement.value || '',
    extensions,
  });

  // 创建编辑器视图
  const view = new EditorView({
    state,
    parent: container,
    dispatch: (tr) => {
      view.update([tr]);
    },
  });

  // 添加占位符 CSS 类
  if (!inputElement.value) {
    container.querySelector('.cm-content')?.classList.add('cm-empty');
  }

  return { view, container };
}

/**
 * 更新 CodeMirror 编辑器内容
 * @param {Object} editorView - CodeMirror EditorView 实例
 * @param {string} content - 新内容
 */
function setEditorContent(editorView, content) {
  if (!editorView) return;
  const { EditorState } = cmModule;
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: content,
    },
  });
}

/**
 * 获取 CodeMirror 编辑器内容
 * @param {Object} editorView
 * @returns {string}
 */
function getEditorContent(editorView) {
  if (!editorView) return '';
  return editorView.state.doc.toString();
}

/**
 * 获取选中的文本
 * @param {Object} editorView
 * @returns {{ text: string, from: number, to: number }|null}
 */
function getEditorSelection(editorView) {
  if (!editorView) return null;
  const sel = editorView.state.selection.main;
  if (sel.empty) return null;
  return {
    text: editorView.state.sliceDoc(sel.from, sel.to),
    from: sel.from,
    to: sel.to,
  };
}

// 暴露全局 API 供 injector.js 和其他模块使用
window.__tianyinCodeMirrorHost = {
  ensureCodeMirror,
  neteaseTheme,
  createCodeMirrorEditor,
  setEditorContent,
  getEditorContent,
  getEditorSelection,
};