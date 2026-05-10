// ============================================================
// 天音 AI 创作助手 — DOM 注入与元素监听
// 负责将天音页面的原生 textarea/input 替换为 CodeMirror 6 编辑器
// ============================================================

(function () {
  'use strict';

  /** 是否已初始化 */
  let initialized = false;

  /** 当前页面上下文缓存 */
  let pageContext = null;

  /** 编辑器实例映射：inputType → { view, container } */
  const editorInstances = {};

  /** 高亮清理函数映射：inputType → cleanup function */
  const highlightCleanups = {};

  /**
   * 初始化注入器
   */
  async function init() {
    if (initialized) return;
    initialized = true;

    console.log('[天音助手] 注入器已启动');

    // 等待页面加载完成
    await waitForElement('body', 15000);

    // 预加载 CodeMirror（在等待输入框的同时开始加载，节省时间）
    const cmPromise = window.__tianyinCodeMirrorHost
      ? window.__tianyinCodeMirrorHost.ensureCodeMirror().catch((err) => {
          console.warn('[天音助手] CodeMirror 预加载失败，将在创建编辑器时重试:', err);
        })
      : Promise.resolve();

    // 初始化 DeepSeek 客户端
    await deepseekClient.initialize();

    // 等待目标输入框出现（带重试）
    await waitForAllInputsWithRetry();

    // 等待 CodeMirror 加载完成
    await cmPromise;

    // 为所有目标输入框创建 CodeMirror 编辑器
    await createAllCodeMirrorEditors();

    // 侧边栏宿主由 sidebar-host.js 自动创建

    // 监听 DOM 变化，处理动态加载的元素
    observeDomChanges();

    // 定期刷新页面上下文
    setInterval(() => {
      pageContext = getPageContext();
    }, 2000);
  }

  /**
   * 等待所有目标输入框出现（带重试）
   * 天音页面使用 React 动态渲染，输入框可能在 DOMContentLoaded 之后才出现
   */
  async function waitForAllInputsWithRetry(maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const missingTypes = [];
      for (const [type, selector] of Object.entries(TARGET_SELECTORS)) {
        const el = document.querySelector(selector);
        if (!el) {
          missingTypes.push(type);
        }
      }
      if (missingTypes.length === 0) {
        console.log('[天音助手] 所有目标输入框已找到');
        return;
      }
      console.log(`[天音助手] 等待输入框 (第 ${attempt}/${maxRetries} 次): ${missingTypes.join(', ')}`);
      // 等待一段时间再重试
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    // 最后一次尝试：使用 waitForElement 的原始逻辑
    console.warn('[天音助手] 部分输入框可能仍未找到，使用原始等待逻辑...');
    await waitForAllInputs();
  }

  /**
   * 等待所有目标输入框出现
   */
  async function waitForAllInputs() {
    const promises = Object.values(TARGET_SELECTORS).map(
      (selector) => waitForElement(selector, 15000)
    );
    await Promise.all(promises);
  }

  /**
   * 为所有目标输入框创建 CodeMirror 编辑器
   */
  async function createAllCodeMirrorEditors() {
    for (const [type, selector] of Object.entries(TARGET_SELECTORS)) {
      const inputElement = document.querySelector(selector);
      if (!inputElement) {
        console.warn(`[天音助手] 未找到输入框: ${type} (${selector})`);
        continue;
      }
      if (inputElement.dataset.tianyinCmCreated) continue;

      try {
        const result = await createCodeMirrorEditor(inputElement, {
          inputType: type,
          placeholder: inputElement.placeholder || '',
          onChange: (value) => {
            // 内容变化时更新页面上下文
            pageContext = getPageContext();
          },
          onSelection: (selection) => {
            // 选中文本变化时通知通信桥
            if (window.__tianyinSelectionBridge) {
              window.__tianyinSelectionBridge.notifySelectionChanged(selection);
              window.__tianyinSelectionBridge.showSelectionInSidebar(selection);
            }
          },
        });

        editorInstances[type] = result;
        inputElement.dataset.tianyinCmCreated = 'true';
        console.log(`[天音助手] CodeMirror 编辑器已创建: ${type}`);
      } catch (error) {
        console.error(`[天音助手] 创建 CodeMirror 编辑器失败: ${type}`, error);
      }
    }
  }

  /**
   * 标记页面上已有的目标输入框（兼容旧逻辑）
   */
  function markExistingInputs() {
    for (const [type, selector] of Object.entries(TARGET_SELECTORS)) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        if (el.dataset.tianyinInjected) return;
        el.dataset.tianyinInjected = 'true';
      });
    }
  }

  /**
   * 监听 DOM 变化，为新出现的输入框创建 CodeMirror 编辑器
   */
  function observeDomChanges() {
    const observer = new MutationObserver(debounce(async () => {
      markExistingInputs();
      await createAllCodeMirrorEditors();
    }, 500));

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * 获取指定输入框的 CodeMirror 编辑器视图
   * @param {string} inputType
   * @returns {Object|null}
   */
  function getEditorView(inputType) {
    const instance = editorInstances[inputType];
    return instance ? instance.view : null;
  }

  /**
   * 在指定输入框的 CodeMirror 编辑器中应用 diff 高亮
   * @param {string} inputType
   * @param {Object} diffResult
   */
  async function applyDiffHighlightToEditor(inputType, diffResult) {
    const view = getEditorView(inputType);
    if (!view) return;

    // 清除旧高亮
    if (highlightCleanups[inputType]) {
      highlightCleanups[inputType]();
      delete highlightCleanups[inputType];
    }

    // 加载 CodeMirror 模块
    const cm = await ensureCodeMirror();

    // 应用新高亮
    if (window.__tianyinDiffOverlay) {
      const cleanup = window.__tianyinDiffOverlay.applyDiffHighlight(view, diffResult, cm);
      highlightCleanups[inputType] = cleanup;
    }
  }

  /**
   * 清除指定输入框的 diff 高亮
   * @param {string} inputType
   */
  async function clearDiffHighlightFromEditor(inputType) {
    if (highlightCleanups[inputType]) {
      highlightCleanups[inputType]();
      delete highlightCleanups[inputType];
    }
  }

  /**
   * 更新 CodeMirror 编辑器内容
   * @param {string} inputType
   * @param {string} content
   */
  function setEditorContent(inputType, content) {
    const view = getEditorView(inputType);
    if (view && window.__tianyinCodeMirrorHost) {
      window.__tianyinCodeMirrorHost.setEditorContent(view, content);
    }
  }

  /**
   * 获取 CodeMirror 编辑器内容
   * @param {string} inputType
   * @returns {string}
   */
  function getEditorContent(inputType) {
    const view = getEditorView(inputType);
    if (view && window.__tianyinCodeMirrorHost) {
      return window.__tianyinCodeMirrorHost.getEditorContent(view);
    }
    return getInputValue(inputType);
  }

  // 暴露全局 API 供 sidebar-host 和其他模块使用
  window.__tianyinInjector = {
    getEditorView,
    setEditorContent,
    getEditorContent,
    applyDiffHighlightToEditor,
    clearDiffHighlightFromEditor,
    getEditorInstances: () => editorInstances,
  };

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
