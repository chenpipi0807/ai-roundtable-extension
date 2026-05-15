// ============================================================
// 天音 AI 创作助手 — CodeMirror 内联 Diff 高亮
// 在 CodeMirror 编辑器中以行级高亮显示 diff 变更
// ============================================================

(function () {
  'use strict';

  // 模块级单例：确保多次调用共享同一个 StateEffect/StateField 实例
  let _diffExt = null;

  function getDiffExtension(cm) {
    if (!_diffExt) {
      const { StateEffect, StateField, Decoration, EditorView } = cm;
      const addHighlight = StateEffect.define();
      const highlightField = StateField.define({
        create() { return Decoration.none; },
        update(decos, tr) {
          for (const e of tr.effects) if (e.is(addHighlight)) return e.value;
          return decos.map(tr.changes);
        },
        provide: (f) => EditorView.decorations.from(f),
      });
      _diffExt = { addHighlight, highlightField };
    }
    return _diffExt;
  }

  /**
   * 在 CodeMirror 编辑器中应用 diff 高亮（INSERT 行绿色背景）
   * @param {Object} editorView - CodeMirror EditorView 实例
   * @param {Object} diffResult - DiffResult 对象（来自 diff.js）
   * @param {Object} cm - CodeMirror 模块对象（已加载）
   * @returns {Function} cleanup 函数，用于移除高亮
   */
  function applyDiffHighlight(editorView, diffResult, cm) {
    if (!editorView || !diffResult || !cm) return () => {};

    const { Decoration } = cm;
    const { addHighlight } = getDiffExtension(cm);

    // 构建装饰集
    const decorations = [];
    // 在新内容上计算行位置（只标记 INSERT，DELETE 行已从编辑器消失）
    let newLine = 0;

    for (const chunk of diffResult.chunks) {
      if (chunk.op === 'equal') {
        newLine += chunk.oldText.length;
        continue;
      }

      if (chunk.op === 'delete') {
        // DELETE 行已从编辑器中移除，无法在新内容中标记
        continue;
      }

      if (chunk.op === 'insert') {
        // INSERT 行：绿色背景（新增内容）
        for (let i = 0; i < chunk.newText.length; i++) {
          const lineNo = newLine + i;
          if (lineNo < editorView.state.doc.lines) {
            const line = editorView.state.doc.line(lineNo + 1);
            decorations.push(
              Decoration.line({
                class: 'cm-diff-insert',
              }).range(line.from)
            );
          }
        }
        newLine += chunk.newText.length;
      }
    }

    // 应用装饰
    editorView.dispatch({
      effects: addHighlight.of(Decoration.set(decorations)),
    });

    // 返回清理函数
    return function clearHighlight() {
      editorView.dispatch({
        effects: addHighlight.of(Decoration.none),
      });
    };
  }

  /**
   * 清除 CodeMirror 编辑器中的所有 diff 高亮
   * @param {Object} editorView
   * @param {Object} cm
   */
  function clearDiffHighlight(editorView, cm) {
    if (!editorView || !cm) return;
    const { Decoration } = cm;
    const { addHighlight } = getDiffExtension(cm);
    editorView.dispatch({
      effects: addHighlight.of(Decoration.none),
    });
  }

  // 暴露全局 API
  window.__tianyinDiffOverlay = {
    applyDiffHighlight,
    clearDiffHighlight,
    getHighlightExtension: getDiffExtension,
  };

  console.log('[天音助手] Diff 高亮模块已就绪');
})();