// ============================================================
// 天音 AI 创作助手 — CodeMirror 内联 Diff 高亮
// 在 CodeMirror 编辑器中以行级高亮显示 diff 变更
// ============================================================

(function () {
  'use strict';

  /**
   * 在 CodeMirror 编辑器中应用 diff 高亮
   * 使用 Decoration 扩展为 INSERT/DELETE 行添加背景色标记
   * @param {Object} editorView - CodeMirror EditorView 实例
   * @param {Object} diffResult - DiffResult 对象（来自 diff.js）
   * @param {Object} cm - CodeMirror 模块对象（已加载）
   * @returns {Function} cleanup 函数，用于移除高亮
   */
  function applyDiffHighlight(editorView, diffResult, cm) {
    if (!editorView || !diffResult || !cm) return () => {};

    const { StateEffect, StateField, Decoration } = cm;

    // 定义效果：添加/清除高亮装饰
    const addHighlight = StateEffect.define();

    // 状态字段：存储当前高亮装饰
    const highlightField = StateField.define({
      create() {
        return Decoration.none;
      },
      update(decos, tr) {
        for (const effect of tr.effects) {
          if (effect.is(addHighlight)) {
            return effect.value;
          }
        }
        return decos.map(tr.changes);
      },
      provide: (field) => EditorView.decorations.from(field),
    });

    // 构建装饰集
    const decorations = [];
    let lineOffset = 0;

    for (const chunk of diffResult.chunks) {
      if (chunk.op === 'equal') {
        lineOffset += chunk.oldText.length;
        continue;
      }

      if (chunk.op === 'delete') {
        // DELETE 行：红色背景
        for (let i = 0; i < chunk.oldText.length; i++) {
          const lineNo = lineOffset + i;
          if (lineNo < editorView.state.doc.lines) {
            const line = editorView.state.doc.line(lineNo + 1);
            decorations.push(
              Decoration.line({
                class: 'cm-diff-delete',
              }).range(line.from)
            );
          }
        }
        lineOffset += chunk.oldText.length;
      }

      if (chunk.op === 'insert') {
        // INSERT 行：绿色背景
        for (let i = 0; i < chunk.newText.length; i++) {
          const lineNo = lineOffset + i;
          if (lineNo < editorView.state.doc.lines) {
            const line = editorView.state.doc.line(lineNo + 1);
            decorations.push(
              Decoration.line({
                class: 'cm-diff-insert',
              }).range(line.from)
            );
          }
        }
        lineOffset += chunk.newText.length;
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
    const { StateEffect, Decoration } = cm;
    const addHighlight = StateEffect.define();
    editorView.dispatch({
      effects: addHighlight.of(Decoration.none),
    });
  }

  // 暴露全局 API
  window.__tianyinDiffOverlay = {
    applyDiffHighlight,
    clearDiffHighlight,
  };

  console.log('[天音助手] Diff 高亮模块已就绪');
})();
