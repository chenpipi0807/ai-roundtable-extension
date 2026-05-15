// ============================================================
// 天音 AI 创作助手 — 侧边栏主逻辑
// 注意：此文件在 iframe 中运行，无法访问父页面的全局变量
// 因此所有依赖的常量和函数在此内联定义
// ============================================================

(function () {
  'use strict';

  // ========== 内联常量（与 shared/constants.js 同步） ==========
  const MESSAGE_TYPE = {
    GET_PAGE_CONTEXT: 'get_page_context',
    PAGE_CONTEXT: 'page_context',
    APPLY_TO_INPUT: 'apply_to_input',
    AI_GENERATE: 'ai_generate',
    AI_RESULT: 'ai_result',
    AI_ERROR: 'ai_error',
    AI_GENERATE_STREAM: 'ai_generate_stream',
    AI_STREAM_CHUNK: 'ai_stream_chunk',
    AI_STREAM_DONE: 'ai_stream_done',
    AI_STREAM_ERROR: 'ai_stream_error',
    GET_SETTINGS: 'get_settings',
    SET_SETTINGS: 'set_settings',
    SETTINGS_UPDATED: 'settings_updated',
    TOGGLE_SIDEBAR: 'toggle_sidebar',
    SIDEBAR_STATE: 'sidebar_state',
    SHOW_DIFF: 'show_diff',
    APPLY_DIFF: 'apply_diff',
    APPLY_DIFF_HIGHLIGHT: 'apply_diff_highlight',
    NAVIGATE: 'navigate',
  };

  const INPUT_TYPE = {
    SONG_IDEA: 'songIdea',
    LYRICS: 'lyrics',
    SONG_NAME: 'songName',
  };

  const INPUT_LABELS = {
    [INPUT_TYPE.SONG_IDEA]: '开始创作（风格描述）',
    [INPUT_TYPE.LYRICS]: '歌词',
    [INPUT_TYPE.SONG_NAME]: '歌曲名称',
  };

  const ACTION_TYPE = {
    POLISH: 'polish',
    REWRITE: 'rewrite',
    CONTINUE: 'continue',
    GENERATE: 'generate',
    /** 完整创作：同时生成风格描述 + 歌词 + 歌曲名称 */
    COMPLETE_CREATE: 'complete_create',
  };

  const DiffOp = {
    EQUAL: 'equal',
    DELETE: 'delete',
    INSERT: 'insert',
  };

  // ========== 内联工具函数（与 shared/utils.js 同步） ==========
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function splitLines(text) {
    return text.split(/\r?\n/);
  }

  // ========== 内联 Diff 引擎（与 core/diff.js 同步） ==========
  class DiffChunk {
    constructor(op, oldLines, newLines, oldText, newText) {
      this.op = op;
      this.oldLines = oldLines;
      this.newLines = newLines;
      this.oldText = oldText;
      this.newText = newText;
      this.id = generateId();
      this.accepted = false;
      this.rejected = false;
    }
    get isChanged() {
      return this.op !== DiffOp.EQUAL;
    }
    get label() {
      switch (this.op) {
        case DiffOp.DELETE: return '删除';
        case DiffOp.INSERT: return '新增';
        default: return '';
      }
    }
  }

  class DiffResult {
    constructor(chunks, oldLines, newLines) {
      this.chunks = chunks;
      this.oldLines = oldLines;
      this.newLines = newLines;
    }
    get hasChanges() {
      return this.chunks.some(c => c.isChanged);
    }
    get changeCount() {
      return this.chunks.filter(c => c.isChanged).length;
    }
    getAcceptedText() {
      const result = [];
      for (const chunk of this.chunks) {
        if (chunk.op === DiffOp.EQUAL) {
          result.push(...chunk.oldText);
        } else if (chunk.op === DiffOp.INSERT) {
          if (chunk.accepted) {
            result.push(...chunk.newText);
          } else {
            result.push(...chunk.oldText);
          }
        } else if (chunk.op === DiffOp.DELETE) {
          if (!chunk.accepted) {
            result.push(...chunk.oldText);
          }
        }
      }
      return result.join('\n');
    }
  }

  function computeLcsTable(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    return dp;
  }

  function backtrack(a, b, dp, i, j, ops) {
    if (i === 0 && j === 0) return;
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      backtrack(a, b, dp, i - 1, j - 1, ops);
      ops.push({ op: DiffOp.EQUAL, oldLine: i - 1, newLine: j - 1, text: a[i - 1] });
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      backtrack(a, b, dp, i, j - 1, ops);
      ops.push({ op: DiffOp.INSERT, oldLine: null, newLine: j - 1, text: b[j - 1] });
    } else if (i > 0) {
      backtrack(a, b, dp, i - 1, j, ops);
      ops.push({ op: DiffOp.DELETE, oldLine: i - 1, newLine: null, text: a[i - 1] });
    }
  }

  function mergeOpsToChunks(ops, a, b) {
    if (ops.length === 0) {
      return [new DiffChunk(DiffOp.EQUAL, [], [], [], [])];
    }
    const chunks = [];
    let currentOp = ops[0].op;
    let oldLines = [];
    let newLines = [];
    let oldText = [];
    let newText = [];
    function flush() {
      if (oldLines.length > 0 || newLines.length > 0) {
        chunks.push(new DiffChunk(currentOp, oldLines, newLines, oldText, newText));
      }
      oldLines = [];
      newLines = [];
      oldText = [];
      newText = [];
    }
    for (const op of ops) {
      if (op.op !== currentOp) {
        flush();
        currentOp = op.op;
      }
      if (op.oldLine !== null) {
        oldLines.push(op.oldLine);
        oldText.push(a[op.oldLine]);
      }
      if (op.newLine !== null) {
        newLines.push(op.newLine);
        newText.push(b[op.newLine]);
      }
    }
    flush();
    return chunks;
  }

  function computeDiff(oldText, newText) {
    const a = splitLines(oldText);
    const b = splitLines(newText);
    const dp = computeLcsTable(a, b);
    const ops = [];
    backtrack(a, b, dp, a.length, b.length, ops);
    const chunks = mergeOpsToChunks(ops, a, b);
    return new DiffResult(chunks, a, b);
  }

  // ========== 内联 Prompt 模板（与 core/prompt-templates.js 同步） ==========
  function buildSystemPrompt(context) {
    const styles = context.styles && context.styles.length > 0
      ? context.styles.join('、')
      : '未指定';
    return `你是一位资深音乐创作助手，专注于协助用户创作中文歌词、歌曲概念和歌曲名称。
请根据用户的创作意图，生成高质量、有韵律感、情感真挚的内容。

当前歌曲风格: ${styles}

输出要求:
- 直接给出修改后的完整文本，不要添加额外解释
- 保持与原文相同的行数结构（如果是对已有内容的修改）
- 如果是全新创作，请按歌词的自然段落分行`;
  }

  function buildUserPrompt(actionType, context, userInput) {
    const { songIdea, lyrics, songName, styles } = context;
    const styleStr = styles && styles.length > 0 ? styles.join('、') : '未指定';
    const extra = userInput ? `\n用户额外要求: ${userInput}` : '';

    const templates = {
      [ACTION_TYPE.POLISH]: `请润色以下歌词，提升文学性和韵律感，保持原有主题和情感。\n\n风格: ${styleStr}\n当前歌词:\n${lyrics || '(无内容)'}\n${extra}\n\n请直接输出润色后的完整歌词。`,
      [ACTION_TYPE.REWRITE]: `请用不同的表达方式重写以下歌词，保持主题不变。\n\n风格: ${styleStr}\n当前歌词:\n${lyrics || '(无内容)'}\n${extra}\n\n请直接输出重写后的完整歌词。`,
      [ACTION_TYPE.CONTINUE]: `请根据已有内容续写歌词，保持风格一致。\n\n风格: ${styleStr}\n歌曲想法: ${songIdea || '(无)'}\n已有歌词:\n${lyrics || '(无内容)'}\n${extra}\n\n请直接输出续写后的完整歌词（包含已有内容 + 续写部分）。`,
      [ACTION_TYPE.GENERATE]: `请根据以下描述创作歌词。\n\n风格: ${styleStr}\n歌曲想法: ${songIdea || '(无)'}\n${extra}\n\n请直接输出创作的完整歌词。`,
    };
    return templates[actionType] || templates[ACTION_TYPE.GENERATE];
  }

  function buildPrompt(inputType, actionType, context, userInput) {
    const system = buildSystemPrompt(context);
    let user = '';

    // 完整创作模式
    if (actionType === ACTION_TYPE.COMPLETE_CREATE) {
      const styleStr = context.styles && context.styles.length > 0 ? context.styles.join('、') : '未指定';
      const extra = userInput ? `\n用户额外要求: ${userInput}` : '';
      user = `请根据以下描述，完成一首完整的歌曲创作。\n\n风格: ${styleStr}\n创作想法: ${context.songIdea || '(由用户直接描述)'}\n${extra}\n\n请严格按照以下格式输出，每部分用明确的标记分隔：\n\n===风格描述===\n[对歌曲风格的详细描述，50-200字，包括情感基调、节奏特点、乐器搭配等]\n\n===歌词===\n[完整的歌词正文，按段落分行，每段之间空一行]\n\n===歌曲名称===\n[建议的歌曲名称，1个即可]\n\n注意：\n1. 风格描述要具体、有画面感，能指导后续的音乐制作\n2. 歌词要有韵律感和情感深度\n3. 歌曲名称要简洁有力，与歌词主题契合\n4. 三个部分缺一不可`;
      return { system, user };
    }

    if (inputType === INPUT_TYPE.SONG_NAME) {
      const styleStr = context.styles && context.styles.length > 0 ? context.styles.join('、') : '未指定';
      const extra = userInput ? `\n用户额外要求: ${userInput}` : '';
      user = `请为这首歌起 3-5 个有创意的歌曲名称。\n\n风格: ${styleStr}\n歌曲想法: ${context.songIdea || '(无)'}\n歌词:\n${context.lyrics || '(无)'}\n${extra}\n\n请直接输出歌曲名称列表，每行一个。`;
    } else if (inputType === INPUT_TYPE.SONG_IDEA) {
      const styleStr = context.styles && context.styles.length > 0 ? context.styles.join('、') : '未指定';
      const extra = userInput ? `\n用户额外要求: ${userInput}` : '';
      user = `请优化以下歌曲创作想法，使其更具体、更有画面感、更具音乐性。\n\n风格: ${styleStr}\n当前想法: ${context.songIdea || '(无)'}\n${extra}\n\n请直接输出优化后的歌曲想法。`;
    } else {
      user = buildUserPrompt(actionType, context, userInput);
    }
    return { system, user };
  }

  // ========== 状态管理 ==========
  const state = {
    diffResult: null,
    currentInputType: null,
    originalContent: '',
    newContent: '',
    isLoading: false,
    configExpanded: true,
    chatHistory: [],
    pageContext: null,
    /** 当前选中的文本信息（来自 selection-bridge） */
    currentSelection: null,
  };

  // ========== DOM 引用 ==========
  const $ = (id) => document.getElementById(id);
  const dom = {
    chatMessages: $('chat-messages'),
    chatInput: $('chat-input'),
    btnSend: $('btn-send'),
    diffPanel: $('diff-panel'),
    chatPanel: $('chat-panel'),
    diffView: $('diff-view'),
    diffTitle: $('diff-title-text'),
    diffBadge: $('diff-badge'),
    btnAcceptAll: $('btn-accept-all'),
    btnRejectAll: $('btn-reject-all'),
    btnApplyDiff: $('btn-apply-diff'),
    btnBackToChat: $('btn-back-to-chat'),
    btnClose: $('btn-close'),
    configHeader: $('config-header'),
    configBody: $('config-body'),
    configToggle: $('config-toggle'),
    apiConfig: $('api-config'),
    apiKeyInput: $('api-key'),
    modelSelect: $('model-select'),
    btnSaveSettings: $('btn-save-settings'),
    btnTestKey: $('btn-test-key'),
    btnToggleKey: $('btn-toggle-key-visibility'),
    settingsStatus: $('settings-status'),
    loadingOverlay: $('loading-overlay'),
    selectionInfo: $('selection-info'),
    selectionText: $('selection-text'),
    selectionClear: $('selection-clear'),
    // 目标字段复选框
    chkAll: $('chk-all'),
    chkIdea: $('chk-idea'),
    chkLyrics: $('chk-lyrics'),
    chkName: $('chk-name'),
    btnNavCreate: $('btn-nav-create'),
    btnNavResults: $('btn-nav-results'),
    btnNewChat: $('btn-new-chat'),
    btnTemplate: $('btn-template'),
    templatePanel: $('template-panel'),
    templateTabs: $('template-tabs'),
    templateList: $('template-list'),
  };

  // ========== 初始化 ==========
  async function init() {
    await loadSettings();
    bindEvents();
    initCheckboxes();
    syncCheckboxesWithContext({}); // 默认勾选全部
    window.addEventListener('message', handleParentMessage);

    // 检查是否已配置 API Key
    const apiKey = dom.apiKeyInput.value.trim();
    if (!apiKey) {
      // 未配置时保持展开并显示提示
      state.configExpanded = true;
      dom.configBody.style.display = 'block';
      dom.configToggle.textContent = '▼';
      dom.apiConfig.classList.add('config-unconfigured');
      showSettingsStatus('请先配置 DeepSeek API Key', 'info');
    } else {
      // 已配置则默认折叠
      state.configExpanded = false;
      dom.configBody.style.display = 'none';
      dom.configToggle.textContent = '▶';
    }

    console.log('[天音助手] 侧边栏已初始化');
  }

  // ========== 设置管理 ==========
  async function loadSettings() {
    const result = await sendToParent({ type: MESSAGE_TYPE.GET_SETTINGS });
    if (result && result.apiKey) {
      dom.apiKeyInput.value = result.apiKey;
    }
    if (result && result.model) {
      dom.modelSelect.value = result.model;
    }
  }

  async function saveSettings() {
    const apiKey = dom.apiKeyInput.value.trim();
    const model = dom.modelSelect.value;
    if (!apiKey) {
      showSettingsStatus('请输入 API Key', 'error');
      return;
    }
    await sendToParent({ type: MESSAGE_TYPE.SET_SETTINGS, payload: { key: 'apiKey', value: apiKey } });
    await sendToParent({ type: MESSAGE_TYPE.SET_SETTINGS, payload: { key: 'model', value: model } });
    showSettingsStatus('设置已保存 ✅', 'success');
  }

  async function testApiKey() {
    const apiKey = dom.apiKeyInput.value.trim();
    if (!apiKey) {
      showSettingsStatus('请输入 API Key', 'error');
      return;
    }
    showSettingsStatus('测试中...', '');
    dom.btnTestKey.disabled = true;
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 1,
          stream: false,
        }),
      });
      if (response.ok) {
        showSettingsStatus('连接成功 ✅ API Key 有效', 'success');
      } else {
        const data = await response.json().catch(() => ({}));
        showSettingsStatus(`连接失败: ${data.error?.message || response.statusText}`, 'error');
      }
    } catch (error) {
      showSettingsStatus(`网络错误: ${error.message}`, 'error');
    } finally {
      dom.btnTestKey.disabled = false;
    }
  }

  function showSettingsStatus(msg, type) {
    dom.settingsStatus.textContent = msg;
    dom.settingsStatus.className = 'form-status' + (type ? ` ${type}` : '');
    dom.settingsStatus.style.display = 'block';
  }

  // ========== 消息通信 ==========
  function sendToParent(message) {
    return new Promise((resolve) => {
      const responseTypeMap = {
        [MESSAGE_TYPE.GET_SETTINGS]: MESSAGE_TYPE.GET_SETTINGS + '_result',
        [MESSAGE_TYPE.AI_GENERATE]: MESSAGE_TYPE.AI_RESULT,
        [MESSAGE_TYPE.APPLY_TO_INPUT]: MESSAGE_TYPE.APPLY_TO_INPUT + '_done',
        [MESSAGE_TYPE.APPLY_DIFF_HIGHLIGHT]: MESSAGE_TYPE.APPLY_DIFF_HIGHLIGHT + '_done',
        [MESSAGE_TYPE.GET_PAGE_CONTEXT]: MESSAGE_TYPE.PAGE_CONTEXT,
      };
      const expectedResponseType = responseTypeMap[message.type];

      const handler = (event) => {
        if (expectedResponseType && event.data.type === expectedResponseType) {
          window.removeEventListener('message', handler);
          resolve(event.data.payload);
        }
      };

      window.addEventListener('message', handler);
      window.parent.postMessage(message, '*');

      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 30000);
    });
  }

  function handleParentMessage(event) {
    const message = event.data;
    if (!message || !message.type) return;
    switch (message.type) {
      case MESSAGE_TYPE.SHOW_DIFF:
        handleShowDiff(message.payload);
        break;
      case MESSAGE_TYPE.AI_RESULT:
        break;
      case MESSAGE_TYPE.AI_ERROR:
        hideLoading();
        addAIMessage(`❌ ${message.payload.error}`);
        break;
      case 'selection_updated':
        handleSelectionUpdated(message.payload);
        break;
    }
  }

  /**
   * 处理选中文本更新
   * @param {Object|null} selection - { text, from, to, inputType } 或 null
   */
  function handleSelectionUpdated(selection) {
    state.currentSelection = selection;
    if (!dom.selectionInfo) return;

    if (selection && selection.text) {
      const label = INPUT_LABELS[selection.inputType] || selection.inputType || '编辑器';
      const preview = selection.text.length > 60
        ? selection.text.slice(0, 60) + '...'
        : selection.text;
      dom.selectionInfo.style.display = 'flex';
      dom.selectionText.textContent = `「${label}」选中: ${preview}`;
      dom.selectionText.title = selection.text;
    } else {
      dom.selectionInfo.style.display = 'none';
      dom.selectionText.textContent = '';
    }
  }

  // ========== AI 生成 ==========
  async function generateAI(systemPrompt, userPrompt) {
    showLoading();
    try {
      const result = await sendToParent({
        type: MESSAGE_TYPE.AI_GENERATE,
        payload: { systemPrompt, userPrompt },
      });
      hideLoading();
      if (result && result.content) {
        return result.content;
      } else {
        throw new Error(result?.error || 'AI 返回为空');
      }
    } catch (error) {
      hideLoading();
      addAIMessage(`❌ ${error.message}`);
      return null;
    }
  }

  /**
   * 流式 AI 生成 — 通过 postMessage 逐块接收内容
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {Function} onChunk - 每收到一个 chunk 时的回调 (chunkText, fullContent) => void
   * @param {Function} onDone - 完成时的回调 (fullContent) => void，fullContent=null 表示出错
   * @returns {Promise<string|null>} 完整内容或 null
   */
  function generateAIStream(systemPrompt, userPrompt, onChunk, onDone, chatHistory = []) {
    return new Promise((resolve) => {
      showLoading();
      let fullContent = '';
      let resolved = false;

      const handler = (event) => {
        const msg = event.data;
        if (!msg || !msg.type) return;

        if (msg.type === MESSAGE_TYPE.AI_STREAM_CHUNK) {
          if (msg.payload && msg.payload.chunk) {
            fullContent += msg.payload.chunk;
            if (onChunk) onChunk(msg.payload.chunk, fullContent);
          }
        } else if (msg.type === MESSAGE_TYPE.AI_STREAM_DONE) {
          window.removeEventListener('message', handler);
          hideLoading();
          if (!resolved) {
            resolved = true;
            if (onDone) onDone(fullContent);
            resolve(fullContent);
          }
        } else if (msg.type === MESSAGE_TYPE.AI_STREAM_ERROR) {
          window.removeEventListener('message', handler);
          hideLoading();
          const errorMsg = msg.payload?.error || '流式请求失败';
          addAIMessage(`❌ ${errorMsg}`);
          if (!resolved) {
            resolved = true;
            if (onDone) onDone(null);
            resolve(null);
          }
        }
      };

      window.addEventListener('message', handler);

      // 构建多轮 messages 数组（system + history + 本轮 user）
      const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory,
        { role: 'user', content: userPrompt },
      ];

      window.parent.postMessage(
        {
          type: MESSAGE_TYPE.AI_GENERATE_STREAM,
          payload: { systemPrompt, userPrompt, messages },
        },
        '*'
      );

      // 30 秒超时
      setTimeout(() => {
        if (!resolved) {
          window.removeEventListener('message', handler);
          hideLoading();
          resolved = true;
          addAIMessage('❌ 流式请求超时');
          if (onDone) onDone(null);
          resolve(null);
        }
      }, 60000);
    });
  }

  // ========== Diff 审核 ==========
  async function handleShowDiff(payload) {
    const { inputType, systemPrompt, userPrompt, originalContent, pageContext } = payload;
    state.currentInputType = inputType;
    state.originalContent = originalContent;
    state.pageContext = pageContext;

    showLoading();
    const aiContent = await generateAI(systemPrompt, userPrompt);
    if (!aiContent) return;

    state.newContent = aiContent;
    state.diffResult = computeDiff(originalContent, aiContent);
    renderDiffView(state.diffResult);
    showDiffPanel();
    hideLoading();
  }

  function renderDiffView(diffResult) {
    const container = dom.diffView;
    container.innerHTML = '';

    if (!diffResult.hasChanges) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">AI 建议与原文相同，无变更</div>';
      dom.btnApplyDiff.style.display = 'none';
      return;
    }

    dom.btnApplyDiff.style.display = 'inline-block';
    dom.diffBadge.textContent = `${diffResult.changeCount} 处变更`;

    const table = document.createElement('div');
    table.className = 'diff-table';

    for (const chunk of diffResult.chunks) {
      if (chunk.isChanged) {
        const actionsBar = document.createElement('div');
        actionsBar.className = 'diff-chunk-actions';
        actionsBar.dataset.chunkId = chunk.id;

        const label = document.createElement('span');
        label.className = 'chunk-label';
        label.textContent = chunk.label;
        actionsBar.appendChild(label);

        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'chunk-btn accept';
        acceptBtn.textContent = '⭕ 接受';
        acceptBtn.addEventListener('click', () => toggleChunkAccept(chunk.id));
        actionsBar.appendChild(acceptBtn);

        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'chunk-btn reject';
        rejectBtn.textContent = '❌ 拒绝';
        rejectBtn.addEventListener('click', () => toggleChunkReject(chunk.id));
        actionsBar.appendChild(rejectBtn);

        table.appendChild(actionsBar);
      }

      const maxLines = Math.max(chunk.oldText.length, chunk.newText.length, 1);
      for (let i = 0; i < maxLines; i++) {
        const row = document.createElement('div');
        row.className = 'diff-row';
        row.dataset.chunkId = chunk.id;

        const leftCell = document.createElement('div');
        leftCell.className = `diff-cell old ${chunk.op === DiffOp.DELETE ? 'delete' : chunk.op === DiffOp.EQUAL ? 'equal' : ''}`;
        leftCell.textContent = i < chunk.oldText.length ? chunk.oldText[i] : '';
        row.appendChild(leftCell);

        const rightCell = document.createElement('div');
        rightCell.className = `diff-cell ${chunk.op === DiffOp.INSERT ? 'insert' : chunk.op === DiffOp.EQUAL ? 'equal' : ''}`;
        rightCell.textContent = i < chunk.newText.length ? chunk.newText[i] : '';
        row.appendChild(rightCell);

        table.appendChild(row);
      }
    }

    container.appendChild(table);
  }

  function toggleChunkAccept(chunkId) {
    const chunk = state.diffResult.chunks.find(c => c.id === chunkId);
    if (!chunk || chunk.rejected) return;
    chunk.accepted = !chunk.accepted;
    updateChunkUI(chunkId);
    updateApplyButton();
  }

  function toggleChunkReject(chunkId) {
    const chunk = state.diffResult.chunks.find(c => c.id === chunkId);
    if (!chunk || chunk.accepted) return;
    chunk.rejected = !chunk.rejected;
    updateChunkUI(chunkId);
    updateApplyButton();
  }

  function updateChunkUI(chunkId) {
    const chunk = state.diffResult.chunks.find(c => c.id === chunkId);
    if (!chunk) return;

    const actionsBar = dom.diffView.querySelector(`.diff-chunk-actions[data-chunk-id="${chunkId}"]`);
    if (actionsBar) {
      const acceptBtn = actionsBar.querySelector('.accept');
      const rejectBtn = actionsBar.querySelector('.reject');
      if (chunk.accepted) {
        acceptBtn.className = 'chunk-btn accepted';
        acceptBtn.textContent = '✅ 已接受';
        rejectBtn.style.display = 'inline-block';
        rejectBtn.className = 'chunk-btn reject';
        rejectBtn.textContent = '❌ 拒绝';
      } else if (chunk.rejected) {
        rejectBtn.className = 'chunk-btn rejected';
        rejectBtn.textContent = '❌ 已拒绝';
        acceptBtn.style.display = 'inline-block';
        acceptBtn.className = 'chunk-btn accept';
        acceptBtn.textContent = '⭕ 接受';
      } else {
        acceptBtn.className = 'chunk-btn accept';
        acceptBtn.textContent = '⭕ 接受';
        rejectBtn.className = 'chunk-btn reject';
        rejectBtn.textContent = '❌ 拒绝';
        acceptBtn.style.display = 'inline-block';
        rejectBtn.style.display = 'inline-block';
      }
    }

    const rows = dom.diffView.querySelectorAll(`.diff-row[data-chunk-id="${chunkId}"]`);
    rows.forEach(row => {
      const leftCell = row.querySelector('.diff-cell.old');
      const rightCell = row.querySelector('.diff-cell:not(.old)');
      if (chunk.accepted) {
        if (chunk.op === DiffOp.DELETE) {
          leftCell.style.display = 'none';
          rightCell.style.display = 'none';
        } else if (chunk.op === DiffOp.INSERT) {
          leftCell.style.display = 'none';
          rightCell.className = 'diff-cell insert';
        }
      } else if (chunk.rejected) {
        if (chunk.op === DiffOp.INSERT) {
          leftCell.style.display = 'none';
          rightCell.style.display = 'none';
        } else if (chunk.op === DiffOp.DELETE) {
          rightCell.style.display = 'none';
          leftCell.className = 'diff-cell old equal';
          leftCell.style.textDecoration = 'none';
        }
      } else {
        leftCell.style.display = '';
        rightCell.style.display = '';
        if (chunk.op === DiffOp.DELETE) {
          leftCell.className = 'diff-cell old delete';
        } else if (chunk.op === DiffOp.INSERT) {
          rightCell.className = 'diff-cell insert';
        }
      }
    });
  }

  function updateApplyButton() {
    const acceptedCount = state.diffResult.chunks.filter(c => c.accepted).length;
    const rejectedCount = state.diffResult.chunks.filter(c => c.rejected).length;
    const totalChanged = state.diffResult.chunks.filter(c => c.isChanged).length;
    if (acceptedCount + rejectedCount >= totalChanged) {
      dom.btnApplyDiff.textContent = `📥 应用到${INPUT_LABELS[state.currentInputType] || '页面'}`;
      dom.btnApplyDiff.disabled = false;
    } else {
      dom.btnApplyDiff.textContent = `📥 应用 (${acceptedCount}/${totalChanged} 已处理)`;
      dom.btnApplyDiff.disabled = acceptedCount === 0;
    }
  }

  async function applyDiff() {
    if (!state.diffResult || !state.currentInputType) return;

    const acceptedText = state.diffResult.getAcceptedText();
    await sendToParent({
      type: MESSAGE_TYPE.APPLY_TO_INPUT,
      payload: { inputType: state.currentInputType, content: acceptedText },
    });
    // 在编辑器中显示内联 diff 高亮
    const original = state.originalContent || '';
    const appliedDiff = computeDiff(original, acceptedText);
    await sendToParent({
      type: MESSAGE_TYPE.APPLY_DIFF_HIGHLIGHT,
      payload: { inputType: state.currentInputType, diffResult: appliedDiff },
    });
    addAIMessage(`✅ 已成功应用到「${INPUT_LABELS[state.currentInputType]}」`);
    showChatPanel();
  }

  function acceptAllDiff() {
    if (!state.diffResult) return;
    for (const chunk of state.diffResult.chunks) {
      if (chunk.isChanged) {
        chunk.accepted = true;
        chunk.rejected = false;
        updateChunkUI(chunk.id);
      }
    }
    updateApplyButton();
    // 全部接受后自动应用到页面
    applyDiff();
  }

  function rejectAllDiff() {
    if (!state.diffResult) return;
    for (const chunk of state.diffResult.chunks) {
      if (chunk.isChanged) {
        chunk.rejected = true;
        chunk.accepted = false;
        updateChunkUI(chunk.id);
      }
    }
    updateApplyButton();
    // 全部拒绝后自动返回聊天
    addAIMessage('已拒绝所有变更');
    showChatPanel();
  }

  // ========== 目标字段复选框 ==========
  function initCheckboxes() {
    // 全部 ↔ 单项互斥
    dom.chkAll.addEventListener('change', () => {
      if (dom.chkAll.checked) {
        dom.chkIdea.checked = false;
        dom.chkLyrics.checked = false;
        dom.chkName.checked = false;
      }
    });
    [dom.chkIdea, dom.chkLyrics, dom.chkName].forEach((chk) => {
      chk.addEventListener('change', () => {
        if (chk.checked) dom.chkAll.checked = false;
      });
    });
  }

  /**
   * 读取复选框状态，返回目标字段集合
   */
  function getCheckedFields() {
    if (dom.chkAll.checked) {
      return { all: true, fields: [INPUT_TYPE.SONG_IDEA, INPUT_TYPE.LYRICS, INPUT_TYPE.SONG_NAME] };
    }
    const fields = [];
    if (dom.chkIdea.checked) fields.push(INPUT_TYPE.SONG_IDEA);
    if (dom.chkLyrics.checked) fields.push(INPUT_TYPE.LYRICS);
    if (dom.chkName.checked) fields.push(INPUT_TYPE.SONG_NAME);
    return { all: false, fields };
  }

  /**
   * 根据页面上下文智能设置复选框默认状态
   * 规则：所有字段都为空 → 勾选「全部」；否则勾选有内容的字段
   */
  function syncCheckboxesWithContext(context) {
    const safeCtx = context || {};
    const empty = !safeCtx.songIdea && !safeCtx.lyrics && !safeCtx.songName;
    dom.chkAll.checked = empty;
    dom.chkIdea.checked = !empty && !!safeCtx.songIdea;
    dom.chkLyrics.checked = !empty && !!safeCtx.lyrics;
    dom.chkName.checked = !empty && !!safeCtx.songName;
  }

  // ========== 聊天功能 ==========
  async function sendChatMessage() {
    const text = dom.chatInput.value.trim();
    if (!text || state.isLoading) return;
    dom.chatInput.value = '';
    addUserMessage(text);

    // 记录用户消息到 chatHistory（多轮）
    state.chatHistory.push({ role: 'user', content: text });

    const context = await sendToParent({ type: MESSAGE_TYPE.GET_PAGE_CONTEXT });
    state.pageContext = context;

    const safeContext = context || { styles: [], songIdea: '', lyrics: '', songName: '' };
    // 根据复选框确定目标字段，替代动态意图检测
    const checked = getCheckedFields();
    const targetFields = checked.all || checked.fields.length === 0
      ? [INPUT_TYPE.SONG_IDEA, INPUT_TYPE.LYRICS, INPUT_TYPE.SONG_NAME]
      : checked.fields;
    const systemPrompt = buildSystemPrompt({ ...safeContext, targetFields });
    let intent = { inputType: targetFields[0], actionType: ACTION_TYPE.GENERATE }; // 默认

    // ===== 多字段/全部模式：生成选中的多个字段 =====
    if (targetFields.length >= 2) {
      const { system, user } = buildPrompt('complete', ACTION_TYPE.COMPLETE_CREATE, { ...safeContext, targetFields }, text);
      
      const partKeys = targetFields;
      const partLabels = {
        [INPUT_TYPE.SONG_IDEA]: '开始创作（风格描述）',
        [INPUT_TYPE.LYRICS]: '歌词',
        [INPUT_TYPE.SONG_NAME]: '歌曲名称',
      };

      // 创建一个临时的 AI 消息元素，用于显示流式内容
      let streamMsgEl = null;
      let streamText = '';

      // 传入当前轮次之前的历史（最后一条是本轮 user，已通过 userPrompt 传入，不重复）
      const historyForStream = state.chatHistory.slice(0, -1);

      const aiContent = await generateAIStream(system, user,
        // onChunk: 在侧边栏中逐步显示流式内容
        (chunk, fullContent) => {
          streamText = fullContent;
          if (!streamMsgEl) {
            streamMsgEl = document.createElement('div');
            streamMsgEl.className = 'ai-message streaming';
            dom.chatMessages.appendChild(streamMsgEl);
            dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
          }
          // 转义 HTML 并显示
          streamMsgEl.innerHTML = escapeHtml(streamText).replace(/\n/g, '<br>');
          dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
        },
        // onDone: 流式完成，解析完整内容并一次性写入左侧编辑器
        (fullContent) => {
          // 移除流式显示的消息
          if (streamMsgEl && streamMsgEl.parentNode) {
            streamMsgEl.parentNode.removeChild(streamMsgEl);
          }

          if (!fullContent) return;
          
          // 解析 AI 返回的三部分内容
          const parts = parseCompleteCreateContent(fullContent);
          if (!parts) {
            addAIMessage('❌ AI 返回格式异常，未能解析出完整的三个部分，请重试');
            return;
          }

          // 一次性写入所有部分
          const writeTasks = [];
          const summaryParts = [];
          for (const key of partKeys) {
            const content = (parts[key] || '').trim();
            if (!content) continue;
            summaryParts.push(`「${partLabels[key]}」`);

            const original = (safeContext[key] || '').trim();
            const diffResult = computeDiff(original, content);

            writeTasks.push(
              sendToParent({
                type: MESSAGE_TYPE.APPLY_TO_INPUT,
                payload: { inputType: key, content },
              })
            );
            writeTasks.push(
              sendToParent({
                type: MESSAGE_TYPE.APPLY_DIFF_HIGHLIGHT,
                payload: { inputType: key, diffResult },
              })
            );
          }

          if (writeTasks.length > 0) {
            Promise.all(writeTasks);
          }

          const summary = `✅ 已生成并应用到 ${summaryParts.join('、')}`;
          addAIMessage(summary + '，请在左侧编辑器中查看和修改。绿色=新增行，红色=删除行。');
          // 记录 AI 回复到 chatHistory
          state.chatHistory.push({ role: 'assistant', content: fullContent || summary });
        }
      , historyForStream);

      if (!aiContent) return;
      return;
    }

    // ===== 普通模式：生成单个部分（流式 + 多轮） =====
    const fieldType = targetFields[0];
    const { system: sysPrompt, user: userMsg } = fieldType
      ? buildPrompt(fieldType, ACTION_TYPE.GENERATE, { ...safeContext, targetFields }, text)
      : { system: systemPrompt, user: text };

    const historyForNormal = state.chatHistory.slice(0, -1);
    let streamEl = null;
    let streamFull = '';

    const normalContent = await generateAIStream(
      sysPrompt, userMsg,
      (chunk, full) => {
        streamFull = full;
        if (!streamEl) {
          streamEl = document.createElement('div');
          streamEl.className = 'ai-message streaming';
          dom.chatMessages.appendChild(streamEl);
        }
        streamEl.innerHTML = escapeHtml(streamFull).replace(/\n/g, '<br>');
        dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
      },
      async (full) => {
        if (streamEl && streamEl.parentNode) streamEl.parentNode.removeChild(streamEl);
        if (!full) return;

        // 记录 AI 回复
        state.chatHistory.push({ role: 'assistant', content: full });
        addAIMessage(full);

        if (fieldType && safeContext) {
          const originalContent = safeContext[fieldType] || '';
          const label = INPUT_LABELS[fieldType] || fieldType;
          await sendToParent({ type: MESSAGE_TYPE.APPLY_TO_INPUT, payload: { inputType: fieldType, content: full } });
          const diffResult = computeDiff(originalContent, full);
          await sendToParent({ type: MESSAGE_TYPE.APPLY_DIFF_HIGHLIGHT, payload: { inputType: fieldType, diffResult } });
          addAIMessage(`✅ 已应用到「${label}」，请在左侧编辑器中查看。`);
        }
      },
      historyForNormal
    );

    if (!normalContent) return;
  }

  /**
   * 解析 AI 返回的完整创作内容，提取三个部分
   * 支持多种格式：
   *   1. ===风格描述=== / ===歌词=== / ===歌曲名称===（严格标记格式）
   *   2. **风格：** / **标题：** / **歌曲名称：**（markdown 格式）
   *   3. 智能分段：按常见分隔符或段落结构推断
   * @param {string} content - AI 返回的原始文本
   * @returns {Object|null} { songIdea, lyrics, songName }
   */
  function parseCompleteCreateContent(content) {
    if (!content) return null;
    const trimmed = content.trim();

    // ===== 格式 0: JSON 格式（最优先） =====
    let jsonStr = trimmed;
    const jsonBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonBlock) jsonStr = jsonBlock[1].trim();
    
    try {
      const parsed = JSON.parse(jsonStr);
      const result = {};
      if (parsed.songIdea || parsed['风格描述'] || parsed.idea) {
        result[INPUT_TYPE.SONG_IDEA] = (parsed.songIdea || parsed['风格描述'] || parsed.idea || '').replace(/\\n/g, '\n');
      }
      if (parsed.lyrics || parsed['歌词']) {
        result[INPUT_TYPE.LYRICS] = (parsed.lyrics || parsed['歌词'] || '').replace(/\\n/g, '\n');
      }
      if (parsed.songName || parsed['歌曲名称'] || parsed.title || parsed.name) {
        result[INPUT_TYPE.SONG_NAME] = parsed.songName || parsed['歌曲名称'] || parsed.title || parsed.name || '';
      }
      if (Object.keys(result).length >= 1) {
        return result;
      }
    } catch (_) { /* 回退到原有格式 */ }

    // ===== 格式 1: ===标记=== 格式（最优先） =====
    // 使用更健壮的正则：用 [\s\S] 匹配任意字符，用正向先行断言匹配下一个标记或结尾
    // 注意：=== 在正则中只是三个等号字符，不是语法
    const sectionRegex = /===\s*(风格描述|歌词|歌曲名称)\s*===\s*([\s\S]*?)(?=\n\s*===\s*(?:风格描述|歌词|歌曲名称)\s*===|$)/gi;
    const sections = {};
    let sectionMatch;
    while ((sectionMatch = sectionRegex.exec(trimmed)) !== null) {
      const sectionName = sectionMatch[1].trim();
      const sectionContent = sectionMatch[2].trim();
      if (sectionName === '风格描述') {
        sections[INPUT_TYPE.SONG_IDEA] = sectionContent;
      } else if (sectionName === '歌词') {
        sections[INPUT_TYPE.LYRICS] = sectionContent;
      } else if (sectionName === '歌曲名称') {
        sections[INPUT_TYPE.SONG_NAME] = sectionContent;
      }
    }

    // 如果 === 格式解析出至少两个部分，使用它
    const sectionKeys = Object.keys(sections);
    if (sectionKeys.length >= 2) {
      return sections;
    }
    // 如果 === 格式解析出至少一个部分，保留作为 fallback
    const fallbackResult = { ...sections };

    // ===== 格式 2: Markdown 格式（**风格：**、**标题：**、**歌词：**、**歌曲名称：**） =====
    const mdRegex = /\*\*(风格|标题|歌词|歌曲名称)\s*[：:]\s*\*\*\s*([\s\S]*?)(?=\n\s*\*\*(?:风格|标题|歌词|歌曲名称)\s*[：:]|$)/gi;
    const mdSections = {};
    let mdMatch;
    while ((mdMatch = mdRegex.exec(trimmed)) !== null) {
      const mdName = mdMatch[1].trim();
      const mdContent = mdMatch[2].trim();
      if (mdName === '风格') {
        mdSections[INPUT_TYPE.SONG_IDEA] = mdContent;
      } else if (mdName === '歌词') {
        mdSections[INPUT_TYPE.LYRICS] = mdContent;
      } else if (mdName === '标题' || mdName === '歌曲名称') {
        mdSections[INPUT_TYPE.SONG_NAME] = mdContent;
      }
    }

    const mdKeys = Object.keys(mdSections);
    if (mdKeys.length >= 2) {
      // 补充缺失的部分（从 === 格式 fallback）
      if (!mdSections[INPUT_TYPE.SONG_IDEA] && fallbackResult[INPUT_TYPE.SONG_IDEA]) {
        mdSections[INPUT_TYPE.SONG_IDEA] = fallbackResult[INPUT_TYPE.SONG_IDEA];
      }
      if (!mdSections[INPUT_TYPE.LYRICS] && fallbackResult[INPUT_TYPE.LYRICS]) {
        mdSections[INPUT_TYPE.LYRICS] = fallbackResult[INPUT_TYPE.LYRICS];
      }
      if (!mdSections[INPUT_TYPE.SONG_NAME] && fallbackResult[INPUT_TYPE.SONG_NAME]) {
        mdSections[INPUT_TYPE.SONG_NAME] = fallbackResult[INPUT_TYPE.SONG_NAME];
      }
      return mdSections;
    }

    // ===== 格式 3: 纯文本分段（无标记） =====
    // 尝试按段落结构推断：第一段是风格描述，中间是歌词，最后一行是歌曲名称
    const paragraphs = trimmed.split(/\n\s*\n/).map(p => p.trim()).filter(p => p);
    if (paragraphs.length >= 2) {
      // 尝试识别：如果最后一段很短（<=30字），可能是歌曲名称
      const lastPara = paragraphs[paragraphs.length - 1];
      const secondLastPara = paragraphs[paragraphs.length - 2];
      
      // 最后一段很短 → 歌曲名称，倒数第二段 → 歌词，前面所有 → 风格描述
      if (lastPara.length <= 30 && paragraphs.length >= 3) {
        return {
          [INPUT_TYPE.SONG_IDEA]: paragraphs.slice(0, -2).join('\n\n'),
          [INPUT_TYPE.LYRICS]: secondLastPara,
          [INPUT_TYPE.SONG_NAME]: lastPara,
        };
      }
      
      // 只有两段：第一段是风格描述+歌词混合，第二段是歌曲名称
      if (lastPara.length <= 30) {
        return {
          [INPUT_TYPE.SONG_IDEA]: '',
          [INPUT_TYPE.LYRICS]: paragraphs.slice(0, -1).join('\n\n'),
          [INPUT_TYPE.SONG_NAME]: lastPara,
        };
      }
    }

    // ===== 格式 4: 按行数智能分段 =====
    const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length >= 4) {
      const lastLine = lines[lines.length - 1];
      // 如果最后一行很短（<=20字），可能是歌曲名称
      if (lastLine.length <= 20) {
        return {
          [INPUT_TYPE.SONG_IDEA]: lines.slice(0, Math.max(1, Math.floor(lines.length / 4))).join('\n'),
          [INPUT_TYPE.LYRICS]: lines.slice(Math.max(1, Math.floor(lines.length / 4)), -1).join('\n'),
          [INPUT_TYPE.SONG_NAME]: lastLine,
        };
      }
    }

    // 如果前面有部分解析结果（来自 === 格式的部分匹配），返回它
    if (fallbackResult[INPUT_TYPE.SONG_IDEA] || fallbackResult[INPUT_TYPE.LYRICS] || fallbackResult[INPUT_TYPE.SONG_NAME]) {
      return fallbackResult;
    }

    // 完全无法解析 — 把全部内容当作歌词
    return {
      [INPUT_TYPE.SONG_IDEA]: '',
      [INPUT_TYPE.LYRICS]: trimmed,
      [INPUT_TYPE.SONG_NAME]: '',
    };
  }

  /**
   * 检测用户意图 — 结合用户输入文本和页面上下文（三个输入框的现有内容）
   *
   * 核心逻辑：
   * 1. 先通过关键词匹配用户文本意图
   * 2. 再检查 context 中三个输入框（风格描述、歌词、歌曲名称）是否为空
   * 3. 如果多个字段为空，自动升级为完整创作模式
   * 4. 如果单个字段为空，定位到该字段
   * 5. 如果所有字段都有内容，使用已有内容作为上下文
   *
   * @param {string} text - 用户输入的文本
   * @param {Object} context - 页面上下文 { songIdea, lyrics, songName, styles }
   * @returns {Object} { inputType, actionType }
   */
  function detectIntent(text, context) {
    const lower = text.toLowerCase();

    // ===== 检查三个输入框的填充状态 =====
    const emptyFields = [];
    if (!context || !context.songIdea || !context.songIdea.trim()) {
      emptyFields.push(INPUT_TYPE.SONG_IDEA);
    }
    if (!context || !context.lyrics || !context.lyrics.trim()) {
      emptyFields.push(INPUT_TYPE.LYRICS);
    }
    if (!context || !context.songName || !context.songName.trim()) {
      emptyFields.push(INPUT_TYPE.SONG_NAME);
    }
    const emptyCount = emptyFields.length;

    // ===== 完整创作：同时生成风格描述 + 歌词 + 歌曲名称 =====
    // 匹配"写一首...歌"、"创作一首...歌曲"等完整创作意图
    const completeCreatePatterns = [
      /写一首.+歌/,
      /创作一首.+歌/,
      /写一[首篇].+[歌曲]/,
      /创作一[首篇].+[歌曲]/,
      /帮我写[首篇].+[歌曲]/,
      /帮我创作.+[歌曲]/,
      /来一[首篇].+[歌曲]/,
      /写个.+[歌曲]/,
      /创作个.+[歌曲]/,
    ];
    for (const pattern of completeCreatePatterns) {
      if (pattern.test(lower)) {
        return { inputType: 'complete', actionType: ACTION_TYPE.COMPLETE_CREATE };
      }
    }

    // ===== 歌曲名称相关 =====
    if (lower.includes('歌名') || lower.includes('歌曲名') || lower.includes('名称') ||
        lower.includes('标题') || lower.includes('起名') || lower.includes('命名')) {
      return { inputType: INPUT_TYPE.SONG_NAME, actionType: ACTION_TYPE.GENERATE };
    }

    // ===== 开始创作（风格描述）相关 =====
    if (lower.includes('风格') || lower.includes('开始创作') || lower.includes('描述') ||
        lower.includes('主题') || lower.includes('概念') || lower.includes('想法') ||
        lower.includes('创意') || lower.includes('方向')) {
      return { inputType: INPUT_TYPE.SONG_IDEA, actionType: ACTION_TYPE.GENERATE };
    }

    // ===== 歌词相关 =====
    // 润色/优化
    if (lower.includes('润色') || lower.includes('优化') || lower.includes('改进') ||
        lower.includes('修饰') || lower.includes('打磨')) {
      return { inputType: INPUT_TYPE.LYRICS, actionType: ACTION_TYPE.POLISH };
    }
    // 重写/改写
    if (lower.includes('重写') || lower.includes('改写') || lower.includes('换风格') ||
        lower.includes('重新')) {
      return { inputType: INPUT_TYPE.LYRICS, actionType: ACTION_TYPE.REWRITE };
    }
    // 续写/扩展
    if (lower.includes('续写') || lower.includes('继续') || lower.includes('扩展') ||
        lower.includes('补充') || lower.includes('加一段')) {
      return { inputType: INPUT_TYPE.LYRICS, actionType: ACTION_TYPE.CONTINUE };
    }
    // 生成/创作（歌词）
    if (lower.includes('生成') || lower.includes('创作') || lower.includes('写一段') ||
        lower.includes('写一首') || lower.includes('写歌') || lower.includes('歌词') ||
        lower.includes('关于') || lower.includes('一首')) {
      // 如果歌词为空，定位到歌词；否则检查其他空字段
      if (emptyFields.includes(INPUT_TYPE.LYRICS)) {
        return { inputType: INPUT_TYPE.LYRICS, actionType: ACTION_TYPE.GENERATE };
      }
      // 歌词已有内容，但用户表达了创作意图 → 检查是否还有其他空字段
      if (emptyCount > 0) {
        // 有多个空字段 → 升级为完整创作
        if (emptyCount >= 2) {
          return { inputType: 'complete', actionType: ACTION_TYPE.COMPLETE_CREATE };
        }
        // 只有一个空字段 → 定位到该字段
        return { inputType: emptyFields[0], actionType: ACTION_TYPE.GENERATE };
      }
      // 所有字段都有内容 → 正常生成歌词（覆盖已有）
      return { inputType: INPUT_TYPE.LYRICS, actionType: ACTION_TYPE.GENERATE };
    }

    // ===== 无法通过关键词匹配 → 根据空字段状态智能推断 =====
    if (emptyCount >= 2) {
      // 多个字段为空 → 用户可能想完整创作
      return { inputType: 'complete', actionType: ACTION_TYPE.COMPLETE_CREATE };
    }
    if (emptyCount === 1) {
      // 只有一个字段为空 → 定位到该字段
      return { inputType: emptyFields[0], actionType: ACTION_TYPE.GENERATE };
    }

    // 所有字段都有内容，但无法识别意图 → 默认歌词生成
    return { inputType: INPUT_TYPE.LYRICS, actionType: ACTION_TYPE.GENERATE };
  }

  // ========== UI 控制 ==========
  function showDiffPanel() {
    dom.chatPanel.style.display = 'none';
    dom.diffPanel.style.display = 'flex';

    // 在 diff 标题中显示当前操作的目标输入框名称
    if (state.currentInputType && INPUT_LABELS[state.currentInputType]) {
      dom.diffTitle.textContent = `AI 建议 - ${INPUT_LABELS[state.currentInputType]}`;
    } else {
      dom.diffTitle.textContent = 'AI 建议';
    }
  }

  // ========== 快捷模板 ==========

  const PROMPT_TEMPLATES = {
    poetry: [
      {
        id: 'poetry-rap',
        name: '国风 × 说唱',
        desc: '保留意象，融入说唱节奏与押韵',
        text: `你是一位精通中国传统诗词与现代说唱的跨界创作人。请根据我提供的古诗词，创作一首国风说唱风格的歌词。

创作规则：
- 保留原诗词的核心意象与情感基调，忽略虚词语气词
- 句式讲究对仗，节奏朗朗上口，押韵自然
- 融入现代说唱的流动感，但维持古典美感
- 允许扩展原诗词意境，不偏离主题
- 结构：主歌（叙事铺垫）→ 副歌（情感爆发）→ 主歌 → 副歌 → outro

请直接输出以下格式：

=== 风格描述 ===
[对本首歌的风格定位说明，30字以内]

=== 歌词 ===
[完整歌词，标注【主歌】【副歌】【Outro】等结构]

=== 歌曲名称 ===
[建议歌名]

用户提供的古诗词如下：
{{请在此粘贴古诗词内容}}`,
      },
      {
        id: 'poetry-xiqu',
        name: '古韵 × 戏腔',
        desc: '戏曲叙事结构，起承转合，典雅对偶',
        text: `你是一位融合传统戏曲与现代国风流行的音乐创作专家。请根据我提供的古诗词，创作一首古风戏腔风格的歌词。

创作规则：
- 以诗词中最具画面感的意象作为歌词核心意象
- 采用戏曲叙事结构：起（铺陈）→ 承（深入）→ 转（峰回路转）→ 合（升华）
- 语言典雅，大量使用四字格和对偶句
- 保留原诗词最美的原句，可直接引用或化用
- 设计专门的"戏腔段"，模拟戏曲唱腔语感，情感更戏剧化

请直接输出以下格式：

=== 风格描述 ===
[风格定位，30字以内]

=== 歌词 ===
[完整歌词，标注【主歌A】【主歌B】【副歌】【戏腔段】等]

=== 歌曲名称 ===
[建议歌名]

用户提供的古诗词如下：
{{请在此粘贴古诗词内容}}`,
      },
      {
        id: 'poetry-story',
        name: '诗词 × 故事融合',
        desc: '先构建与诗词契合的故事，再交织入歌词',
        text: `你是一位擅长以古诗词为灵感进行叙事创作的词曲人。请根据我提供的古诗词，先构建一个与之意境契合的故事，再将故事与诗词交织融合成歌词。

创作规则：
- 从诗词中提炼人物处境、时代背景和情感核心
- 构建一个具体的叙事场景（有人物、有事件、有情感转折）
- 歌词将故事叙述与诗词意象交替呈现，相互映衬
- 原诗词最美的句子直接引用或保留在副歌的高光位置
- 结构完整：铺垫 → 矛盾 → 高潮 → 余韵

请按以下格式输出：

=== 故事设定 ===
[60字以内：人物、时代、情感走向]

=== 风格描述 ===
[风格定位，30字以内]

=== 歌词 ===
[完整歌词]

=== 歌曲名称 ===
[建议歌名]

用户提供的古诗词如下：
{{请在此粘贴古诗词内容}}`,
      },
    ],

    prose: [
      {
        id: 'prose-lovesong',
        name: '散文 × 情歌',
        desc: '保留散文温度，转化为细腻流行情歌',
        text: `你是一位将文学散文转化为流行音乐的创作人。请根据我提供的散文片段，创作一首情感细腻的流行情歌歌词。

创作规则：
- 提炼散文中最动人的情感核心与关键意象
- 将散文的长句转化为简洁有力的歌词语言
- 保持原散文的情绪温度，不过度煽情
- 散文中最美的句子可直接化用进副歌
- 节奏感强，易于谱曲，有明显的主歌/副歌情感落差

请直接输出以下格式：

=== 风格描述 ===
[风格定位，30字以内]

=== 歌词 ===
[完整歌词，标注【主歌】【副歌】]

=== 歌曲名称 ===
[建议歌名]

用户提供的散文片段如下：
{{请在此粘贴散文内容}}`,
      },
      {
        id: 'prose-ambient',
        name: '散文 × 氛围感',
        desc: '意象堆叠，沉浸式，偏民谣/indie风格',
        text: `你是一位专注于氛围感音乐创作的词人，风格接近民谣、indie folk 或后摇的文学性。请根据我提供的散文片段，创作一首意境深远、画面感极强的氛围歌词。

创作规则：
- 重点提炼散文中的环境描写、感官意象（光线、气味、声音、触感）
- 歌词可以更诗化、抽象，不必每句都叙事
- 允许大量意象堆叠，用具体细节营造沉浸感
- 情感不外露，藏在意象之中，让听众自行感受
- 语言有克制的美感，不华丽不空洞

请直接输出以下格式：

=== 风格描述 ===
[风格定位，30字以内]

=== 歌词 ===
[完整歌词]

=== 歌曲名称 ===
[建议歌名]

用户提供的散文片段如下：
{{请在此粘贴散文内容}}`,
      },
    ],

    novel: [
      {
        id: 'novel-theme',
        name: '小说 × 主题曲',
        desc: '提炼核心主题，独立成立的主题曲',
        text: `你是一位专业的影视/小说配乐创作人。请根据我提供的小说内容，创作一首契合该小说气质的主题曲歌词。

创作规则：
- 提炼小说的核心主题、情感基调和人物关系
- 歌词须能独立成立，脱离小说背景也能打动人
- 保留小说中最有张力的意象或金句，化用进副歌
- 风格须与小说类型匹配（古风/现代/奇幻/悬疑等）
- 结构上有电影感：引子 → 主歌（铺垫） → 副歌（爆发） → 桥段（转折） → 尾声

请直接输出以下格式：

=== 风格描述 ===
[小说类型与歌曲风格定位，40字以内]

=== 歌词 ===
[完整歌词]

=== 歌曲名称 ===
[建议歌名]

用户提供的小说内容如下：
{{请在此粘贴小说段落（建议500字以内的关键场景）}}`,
      },
      {
        id: 'novel-character',
        name: '小说 × 角色视角',
        desc: '选最有张力的角色，以第一人称写心声',
        text: `你是一位擅长角色内心创作的音乐人。请根据我提供的小说内容，选取其中最具戏剧张力的角色，以该角色的第一人称视角创作一首情感真实的歌词。

创作规则：
- 先判断最适合演唱的角色（说明理由）
- 以该角色的内心独白或情感宣泄为歌词主线
- 保留角色在小说中标志性的语气和情感特征
- 情感有层次：压抑 → 挣扎 → 爆发 → 释然（或崩溃）
- 允许结合小说情节进行戏剧性的二次创作，但不改变角色核心性格

请按以下格式输出：

=== 演唱角色 ===
[角色名 + 选择理由（一句话）]

=== 风格描述 ===
[风格定位，30字以内]

=== 歌词 ===
[完整歌词，第一人称]

=== 歌曲名称 ===
[建议歌名]

用户提供的小说内容如下：
{{请在此粘贴小说段落（建议500字以内的关键场景）}}`,
      },
    ],
  };

  let currentTemplateCat = 'poetry';
  let templatePanelOpen = false;

  function renderTemplateList(cat) {
    if (!dom.templateList) return;
    const list = PROMPT_TEMPLATES[cat] || [];
    dom.templateList.innerHTML = list.map((t) => `
      <button class="tmpl-btn" data-id="${t.id}">
        <div class="tmpl-btn-name">${t.name}</div>
        <div class="tmpl-btn-desc">${t.desc}</div>
      </button>
    `).join('');

    dom.templateList.querySelectorAll('.tmpl-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const allTemplates = Object.values(PROMPT_TEMPLATES).flat();
        const tmpl = allTemplates.find((t) => t.id === id);
        if (!tmpl || !dom.chatInput) return;
        dom.chatInput.value = tmpl.text;
        // 选中占位符，让用户直接替换
        const phStart = tmpl.text.indexOf('{{');
        const phEnd   = tmpl.text.indexOf('}}') + 2;
        if (phStart !== -1) {
          dom.chatInput.focus();
          dom.chatInput.setSelectionRange(phStart, phEnd);
        } else {
          dom.chatInput.focus();
        }
        // 关闭模板面板
        toggleTemplatePanel(false);
      });
    });
  }

  function toggleTemplatePanel(forceState) {
    templatePanelOpen = forceState !== undefined ? forceState : !templatePanelOpen;
    if (dom.templatePanel) {
      dom.templatePanel.style.display = templatePanelOpen ? 'flex' : 'none';
    }
    if (dom.btnTemplate) {
      dom.btnTemplate.style.borderColor = templatePanelOpen ? 'var(--accent)' : '';
      dom.btnTemplate.style.color = templatePanelOpen ? 'var(--accent)' : '';
    }
    if (templatePanelOpen) renderTemplateList(currentTemplateCat);
  }

  function newConversation() {
    state.chatHistory = [];
    // 清除聊天 UI，只保留欢迎消息
    dom.chatMessages.innerHTML = `
      <div class="message ai">
        <div class="message-avatar">AI</div>
        <div class="message-content">
          <p>新对话已开始。历史记录已清除。</p>
          <p>直接描述你的创作需求即可。</p>
        </div>
      </div>`;
    showChatPanel();
  }

  function showChatPanel() {
    dom.diffPanel.style.display = 'none';
    dom.chatPanel.style.display = 'flex';
    state.diffResult = null;
  }

  function showLoading() {
    state.isLoading = true;
    dom.loadingOverlay.style.display = 'flex';
    dom.btnSend.disabled = true;
  }

  function hideLoading() {
    state.isLoading = false;
    dom.loadingOverlay.style.display = 'none';
    dom.btnSend.disabled = false;
  }

  function toggleConfig() {
    state.configExpanded = !state.configExpanded;
    dom.configBody.style.display = state.configExpanded ? 'block' : 'none';
    dom.configToggle.textContent = state.configExpanded ? '▼' : '▶';
    if (state.configExpanded) {
      dom.apiConfig.classList.remove('config-unconfigured');
    }
  }

  // ========== 消息渲染 ==========
  function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user';
    div.innerHTML = `
      <div class="message-avatar">👤</div>
      <div class="message-content"><p>${escapeHtml(text)}</p></div>
    `;
    dom.chatMessages.appendChild(div);
    scrollToBottom();
  }

  function addAIMessage(text) {
    const div = document.createElement('div');
    div.className = 'message ai';
    const formatted = text
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    div.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content"><p>${formatted}</p></div>
    `;
    dom.chatMessages.appendChild(div);
    scrollToBottom();
  }

  function scrollToBottom() {
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }

  // ========== 事件绑定 ==========
  function bindEvents() {
    dom.btnSend.addEventListener('click', sendChatMessage);
    dom.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    dom.btnAcceptAll.addEventListener('click', acceptAllDiff);
    dom.btnRejectAll.addEventListener('click', rejectAllDiff);
    dom.btnApplyDiff.addEventListener('click', applyDiff);
    dom.btnBackToChat.addEventListener('click', showChatPanel);
    // API 配置区折叠/展开
    dom.configHeader.addEventListener('click', toggleConfig);
    dom.btnSaveSettings.addEventListener('click', saveSettings);
    dom.btnTestKey.addEventListener('click', testApiKey);
    dom.btnToggleKey.addEventListener('click', () => {
      dom.apiKeyInput.type = dom.apiKeyInput.type === 'password' ? 'text' : 'password';
    });
    dom.btnClose.addEventListener('click', () => {
      window.parent.postMessage({ type: MESSAGE_TYPE.TOGGLE_SIDEBAR }, '*');
    });
    dom.btnNewChat.addEventListener('click', newConversation);

    // 输入框顶部拖拽手柄 — 向上拖拽增加高度
    const chatResizeHandle = document.getElementById('chat-resize-handle');
    if (chatResizeHandle && dom.chatInput) {
      chatResizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = dom.chatInput.offsetHeight;
        chatResizeHandle.classList.add('dragging');

        const onMove = (ev) => {
          const delta = startY - ev.clientY;
          const newH = Math.min(window.innerHeight * 0.6, Math.max(60, startHeight + delta));
          dom.chatInput.style.height = newH + 'px';
        };
        const onUp = () => {
          chatResizeHandle.classList.remove('dragging');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    // 模板面板
    dom.btnTemplate.addEventListener('click', () => toggleTemplatePanel());
    dom.templateTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.tmpl-tab');
      if (!tab) return;
      currentTemplateCat = tab.dataset.cat;
      dom.templateTabs.querySelectorAll('.tmpl-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderTemplateList(currentTemplateCat);
    });
    // 清除选中文本
    if (dom.selectionClear) {
      dom.selectionClear.addEventListener('click', () => {
        state.currentSelection = null;
        if (dom.selectionInfo) dom.selectionInfo.style.display = 'none';
      });
    }
    // 导航按钮：跳转创作页面
    dom.btnNavCreate.addEventListener('click', () => {
      window.parent.postMessage({
        type: MESSAGE_TYPE.NAVIGATE,
        payload: { url: 'https://music.163.com/st/tianyin/song-generate-advance' },
      }, '*');
    });
    // 导航按钮：跳转创作结果页面
    dom.btnNavResults.addEventListener('click', () => {
      window.parent.postMessage({
        type: MESSAGE_TYPE.NAVIGATE,
        payload: { url: 'https://music.163.com/st/tianyin/my-creation' },
      }, '*');
    });
  }

  // ========== 启动 ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();