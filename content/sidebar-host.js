// ============================================================
// 天音 AI 创作助手 — 侧边栏宿主
// 固定在页面右侧，始终可见；可收起为窄条
// ============================================================

(function () {
  'use strict';

  /** 侧边栏是否已创建 */
  let sidebarCreated = false;

  /** 侧边栏 DOM 元素 */
  let sidebarEl = null;

  /** 侧边栏 iframe */
  let sidebarIframe = null;

  /** 侧边栏是否展开 */
  let isExpanded = true;

  /**
   * 创建侧边栏宿主
   */
  function createSidebar() {
    if (sidebarCreated) return;
    sidebarCreated = true;

    // 创建侧边栏容器
    sidebarEl = document.createElement('div');
    sidebarEl.className = 'tianyin-sidebar-host';
    sidebarEl.id = 'tianyin-sidebar-host';

    // 使用 Shadow DOM 隔离样式
    const shadow = sidebarEl.attachShadow({ mode: 'closed' });

    // 注入样式
    const style = document.createElement('style');
    style.textContent = getSidebarHostStyles();
    shadow.appendChild(style);

    // 创建侧边栏面板容器（默认展开）
    const panel = document.createElement('div');
    panel.className = 'tianyin-sidebar-panel expanded';
    panel.id = 'tianyin-sidebar-panel';

    // 创建展开条（侧边栏收起时显示的窄条）
    const collapseBar = document.createElement('div');
    collapseBar.className = 'tianyin-collapse-bar';
    collapseBar.id = 'tianyin-collapse-bar';
    collapseBar.title = '展开天音 AI 助手';
    collapseBar.addEventListener('click', toggleSidebar);
    // 展开条内容
    const barContent = document.createElement('span');
    barContent.textContent = '🎵 天音助手';
    collapseBar.appendChild(barContent);
    shadow.appendChild(collapseBar);

    // 左侧拖拽调宽手柄
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'tianyin-sidebar-resize-handle';
    panel.appendChild(resizeHandle);

    // 创建 iframe 加载侧边栏 UI
    sidebarIframe = document.createElement('iframe');
    sidebarIframe.className = 'tianyin-sidebar-iframe';
    sidebarIframe.src = chrome.runtime.getURL('sidebar/index.html');
    sidebarIframe.allow = 'clipboard-read; clipboard-write';
    panel.appendChild(sidebarIframe);

    // 拖拽逻辑：向左拖拽扩大侧边栏
    let currentSidebarWidth = SIDEBAR_WIDTH;
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = panel.offsetWidth;
      resizeHandle.classList.add('dragging');
      // 拖拽期间禁止 iframe 接管鼠标事件
      sidebarIframe.style.pointerEvents = 'none';
      // 拖拽时禁用 transition，避免卡顿
      panel.style.transition = 'none';

      const onMove = (ev) => {
        const delta = startX - ev.clientX;
        currentSidebarWidth = Math.min(900, Math.max(320, startWidth + delta));
        panel.style.width = currentSidebarWidth + 'px';
        document.body.style.paddingRight = (currentSidebarWidth + 8) + 'px';
      };
      const onUp = () => {
        resizeHandle.classList.remove('dragging');
        sidebarIframe.style.pointerEvents = '';
        panel.style.transition = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    shadow.appendChild(panel);
    document.body.appendChild(sidebarEl);

    // 通知 iframe 侧边栏已展开
    setTimeout(() => {
      postMessageToIframe({ type: MESSAGE_TYPE.SIDEBAR_STATE, payload: { expanded: true } });
    }, 500);

    // 监听来自 iframe 的消息
    window.addEventListener('message', handleIframeMessage);

    // 监听自定义事件（来自 injector 的生成请求）
    document.addEventListener('tianyin-start-generation', handleGenerationRequest);

    // 监听选中文本变化事件（来自 selection-bridge）
    document.addEventListener('tianyin-selection-changed', (event) => {
      postMessageToIframe({
        type: 'selection_updated',
        payload: event.detail,
      });
    });

    // 监听侧边栏消息转发事件
    document.addEventListener('tianyin-sidebar-message', (event) => {
      postMessageToIframe(event.detail);
    });

    console.log('[天音助手] 侧边栏宿主已创建，默认展开');
  }

  /**
   * 切换侧边栏展开/收起
   */
  function toggleSidebar() {
    isExpanded = !isExpanded;
    updateSidebarState();
  }

  /**
   * 展开侧边栏
   */
  function openSidebar() {
    if (!isExpanded) {
      isExpanded = true;
      updateSidebarState();
    }
  }

  /**
   * 收起侧边栏
   */
  function closeSidebar() {
    if (isExpanded) {
      isExpanded = false;
      updateSidebarState();
    }
  }

  /**
   * 更新侧边栏状态
   */
  function updateSidebarState() {
    if (!sidebarEl) return;

    const shadow = sidebarEl.shadowRoot;
    const panel = shadow.getElementById('tianyin-sidebar-panel');
    const collapseBar = shadow.getElementById('tianyin-collapse-bar');

    if (isExpanded) {
      panel.classList.add('expanded');
      collapseBar.classList.remove('visible');
      postMessageToIframe({ type: MESSAGE_TYPE.SIDEBAR_STATE, payload: { expanded: true } });
    } else {
      panel.classList.remove('expanded');
      collapseBar.classList.add('visible');
    }
  }

  /**
   * 处理来自 iframe 的消息
   * @param {MessageEvent} event
   */
  async function handleIframeMessage(event) {
    // 只处理来自我们 iframe 的消息
    if (event.source !== sidebarIframe?.contentWindow) return;

    const message = event.data;
    if (!message || !message.type) return;

    switch (message.type) {
      case MESSAGE_TYPE.GET_PAGE_CONTEXT:
        // 返回页面上下文
        postMessageToIframe({
          type: MESSAGE_TYPE.PAGE_CONTEXT,
          payload: getPageContext(),
        });
        break;

      case MESSAGE_TYPE.AI_GENERATE:
        // 通过 Service Worker 代理 AI 请求
        try {
          const response = await chrome.runtime.sendMessage({
            type: MESSAGE_TYPE.AI_GENERATE,
            payload: message.payload,
          });

          if (response.success) {
            postMessageToIframe({
              type: MESSAGE_TYPE.AI_RESULT,
              payload: { content: response.data.content },
            });
          } else {
            postMessageToIframe({
              type: MESSAGE_TYPE.AI_ERROR,
              payload: { error: response.error },
            });
          }
        } catch (error) {
          postMessageToIframe({
            type: MESSAGE_TYPE.AI_ERROR,
            payload: { error: error.message },
          });
        }
        break;

      case MESSAGE_TYPE.AI_GENERATE_STREAM:
        // 流式 AI 生成：通过 Port 连接 Service Worker，逐块转发
        try {
          const port = chrome.runtime.connect({ name: 'ai-stream' });

          // 转发每个 chunk 到 iframe
          port.onMessage.addListener((portMessage) => {
            postMessageToIframe({
              type: portMessage.type,
              payload: portMessage.payload,
            });
          });

          port.onDisconnect.addListener(() => {
            // 连接断开，无需额外操作
          });

          // 发送启动信号
          port.postMessage({
            type: 'start_stream',
            payload: message.payload,
          });
        } catch (error) {
          postMessageToIframe({
            type: MESSAGE_TYPE.AI_STREAM_ERROR,
            payload: { error: error.message },
          });
        }
        break;

      case MESSAGE_TYPE.APPLY_TO_INPUT: {
        const { inputType, content } = message.payload;
        // 字段已锁定则跳过
        if (window.__tianyinInjector && window.__tianyinInjector.isFieldLocked(inputType)) {
          postMessageToIframe({
            type: MESSAGE_TYPE.APPLY_TO_INPUT + '_done',
            payload: { success: false, inputType, reason: 'locked' },
          });
          break;
        }
        setInputValue(inputType, content);
        if (window.__tianyinInjector) {
          window.__tianyinInjector.setEditorContent(inputType, content);
        }
        postMessageToIframe({
          type: MESSAGE_TYPE.APPLY_TO_INPUT + '_done',
          payload: { success: true, inputType },
        });
        break;
      }

      case MESSAGE_TYPE.APPLY_DIFF_HIGHLIGHT: {
        const { inputType: hlInputType, diffResult } = message.payload;
        // 锁定字段不显示 diff
        if (window.__tianyinInjector && window.__tianyinInjector.isFieldLocked(hlInputType)) {
          postMessageToIframe({
            type: MESSAGE_TYPE.APPLY_DIFF_HIGHLIGHT + '_done',
            payload: { success: false, inputType: hlInputType, reason: 'locked' },
          });
          break;
        }
        if (window.__tianyinInjector) {
          window.__tianyinInjector.applyDiffHighlightToEditor(hlInputType, diffResult);
        }
        postMessageToIframe({
          type: MESSAGE_TYPE.APPLY_DIFF_HIGHLIGHT + '_done',
          payload: { success: true, inputType: hlInputType },
        });
        break;
      }

      case MESSAGE_TYPE.GET_SETTINGS:
        // 获取设置
        try {
          const response = await chrome.runtime.sendMessage({
            type: MESSAGE_TYPE.GET_SETTINGS,
          });
          postMessageToIframe({
            type: MESSAGE_TYPE.GET_SETTINGS + '_result',
            payload: response.data,
          });
        } catch (error) {
          postMessageToIframe({
            type: MESSAGE_TYPE.GET_SETTINGS + '_result',
            payload: { apiKey: '', model: '', settings: {} },
          });
        }
        break;

      case MESSAGE_TYPE.SET_SETTINGS:
        // 保存设置
        await chrome.runtime.sendMessage({
          type: MESSAGE_TYPE.SET_SETTINGS,
          payload: message.payload,
        });
        break;

      case MESSAGE_TYPE.TOGGLE_SIDEBAR:
        toggleSidebar();
        break;

      case MESSAGE_TYPE.NAVIGATE:
        // 在新窗口打开指定页面
        const { url } = message.payload;
        if (url) {
          window.open(url, '_blank');
        }
        break;
    }
  }

  /**
   * 处理来自 injector 的 AI 生成请求
   * @param {CustomEvent} event
   */
  async function handleGenerationRequest(event) {
    const detail = event.detail;

    // 展开侧边栏
    openSidebar();

    // 等待 iframe 加载完成
    await waitForIframeReady();

    // 发送生成请求到 iframe
    postMessageToIframe({
      type: MESSAGE_TYPE.SHOW_DIFF,
      payload: {
        inputType: detail.inputType,
        actionType: detail.actionType,
        systemPrompt: detail.systemPrompt,
        userPrompt: detail.userPrompt,
        originalContent: detail.originalContent,
        pageContext: detail.pageContext,
        selectionText: detail.selectionText,
      },
    });
  }

  /**
   * 等待 iframe 加载完成
   * @returns {Promise<void>}
   */
  function waitForIframeReady() {
    return new Promise((resolve) => {
      if (!sidebarIframe) return resolve();

      const check = () => {
        try {
          if (sidebarIframe.contentWindow && sidebarIframe.contentWindow.document.readyState === 'complete') {
            resolve();
          } else {
            sidebarIframe.addEventListener('load', () => resolve(), { once: true });
          }
        } catch {
          // 跨域安全限制，假设已加载
          resolve();
        }
      };

      // 最多等待 5 秒
      setTimeout(check, 300);
      setTimeout(() => resolve(), 5000);
    });
  }

  /**
   * 向 iframe 发送消息
   * @param {Object} message
   */
  function postMessageToIframe(message) {
    if (sidebarIframe && sidebarIframe.contentWindow) {
      sidebarIframe.contentWindow.postMessage(message, '*');
    }
  }

  /**
   * 侧边栏宿主样式
   * @returns {string}
   */
  function getSidebarHostStyles() {
    return `
      :host {
        all: initial;
      }
      /* 展开条（侧边栏收起时显示在右侧的窄条） */
      .tianyin-collapse-bar {
        position: fixed;
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        width: 32px;
        padding: 16px 4px;
        background: #c20c0c;
        color: white;
        font-size: 12px;
        border: none;
        border-radius: 8px 0 0 8px;
        cursor: pointer;
        z-index: ${SIDEBAR_Z_INDEX};
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
        writing-mode: vertical-rl;
        text-align: center;
        letter-spacing: 2px;
        display: none;
        align-items: center;
        justify-content: center;
        user-select: none;
      }
      .tianyin-collapse-bar:hover {
        background: #a00a0a;
        width: 36px;
      }
      .tianyin-collapse-bar.visible {
        display: flex;
      }
      /* 侧边栏面板 */
      .tianyin-sidebar-panel {
        position: fixed;
        top: 0;
        right: -${SIDEBAR_WIDTH}px;
        width: ${SIDEBAR_WIDTH}px;
        height: 100vh;
        z-index: ${SIDEBAR_Z_INDEX};
        transition: right 0.3s ease;
        box-shadow: -4px 0 16px rgba(0, 0, 0, 0.3);
      }
      .tianyin-sidebar-panel.expanded {
        right: 0;
      }
      /* 左侧拖拽调宽手柄 */
      .tianyin-sidebar-resize-handle {
        position: absolute;
        top: 0;
        left: 0;
        width: 6px;
        height: 100%;
        cursor: ew-resize;
        z-index: 10;
        background: transparent;
        transition: background 0.15s;
      }
      .tianyin-sidebar-resize-handle:hover,
      .tianyin-sidebar-resize-handle.dragging {
        background: rgba(0, 122, 204, 0.45);
      }
      .tianyin-sidebar-iframe {
        width: 100%;
        height: 100%;
        border: none;
        background: #1a1a1a;
      }
    `;
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => createSidebar());
  } else {
    createSidebar();
  }
})();