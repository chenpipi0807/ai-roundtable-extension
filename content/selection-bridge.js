// ============================================================
// 天音 AI 创作助手 — 选中文本 ↔ 侧边栏通信桥
// 监听 CodeMirror 编辑器的选中文本变化，通过 postMessage 发送到侧边栏
// ============================================================

(function () {
  'use strict';

  /** 当前选中的文本信息 */
  let currentSelection = null;

  /** 编辑器视图映射：inputType → EditorView */
  const editorViews = {};

  /**
   * 注册一个 CodeMirror 编辑器视图到通信桥
   * @param {string} inputType - INPUT_TYPE 枚举值
   * @param {Object} editorView - CodeMirror EditorView 实例
   */
  function registerEditor(inputType, editorView) {
    editorViews[inputType] = editorView;
  }

  /**
   * 取消注册编辑器
   * @param {string} inputType
   */
  function unregisterEditor(inputType) {
    delete editorViews[inputType];
  }

  /**
   * 通知侧边栏选中文本变化
   * @param {Object|null} selection - { text, from, to, inputType } 或 null（取消选中）
   */
  function notifySelectionChanged(selection) {
    currentSelection = selection;
    // 通过自定义事件广播给 sidebar-host（它再转发给 iframe）
    const event = new CustomEvent('tianyin-selection-changed', {
      detail: selection,
    });
    document.dispatchEvent(event);
  }

  /**
   * 获取当前选中的文本
   * @returns {Object|null}
   */
  function getCurrentSelection() {
    return currentSelection;
  }

  /**
   * 获取指定输入框的选中文本
   * @param {string} inputType
   * @returns {Object|null}
   */
  function getSelectionForInput(inputType) {
    const view = editorViews[inputType];
    if (!view) return null;
    const sel = view.state.selection.main;
    if (sel.empty) return null;
    return {
      text: view.state.sliceDoc(sel.from, sel.to),
      from: sel.from,
      to: sel.to,
      inputType,
    };
  }

  /**
   * 在侧边栏中显示选中文本信息
   * @param {Object} selection
   */
  function showSelectionInSidebar(selection) {
    // 通过 sidebar-host 转发消息到 iframe
    const event = new CustomEvent('tianyin-sidebar-message', {
      detail: {
        type: 'selection_updated',
        payload: selection,
      },
    });
    document.dispatchEvent(event);
  }

  /**
   * 清除选中文本
   */
  function clearSelection() {
    notifySelectionChanged(null);
    showSelectionInSidebar(null);
  }

  // 暴露全局 API
  window.__tianyinSelectionBridge = {
    registerEditor,
    unregisterEditor,
    notifySelectionChanged,
    getCurrentSelection,
    getSelectionForInput,
    showSelectionInSidebar,
    clearSelection,
  };

  console.log('[天音助手] 选中文本通信桥已就绪');
})();
