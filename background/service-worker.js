// ============================================================
// 天音 AI 创作助手 — Service Worker
// 负责消息路由、API Key 代理转发、存储管理
// 注意：此文件在独立 Service Worker 上下文中运行，
// 无法访问 content script 的全局变量，因此所有常量在此内联
// ============================================================

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
};

const STORAGE_KEYS = {
  API_KEY: 'deepseek_api_key',
  MODEL: 'deepseek_model',
  CHAT_HISTORY: 'chat_history',
  SETTINGS: 'settings',
};

const DEEPSEEK_CONFIG = {
  BASE_URL: 'https://api.deepseek.com',
  CHAT_ENDPOINT: '/chat/completions',
  DEFAULT_MODEL: 'deepseek-v4-flash',
  MODELS: [
    { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash (1M 上下文, ¥1/百万输入)' },
    { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro (1M 上下文, ¥12/百万输入)' },
  ],
  MAX_TOKENS: 4096,
  TEMPERATURE: 1,
};

const DEFAULT_SETTINGS = {
  model: DEEPSEEK_CONFIG.DEFAULT_MODEL,
  sidebarExpanded: true,
  theme: 'light',
};

// ========== 消息处理 ==========

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message, sender).then(sendResponse).catch((error) => {
      console.error('[天音助手] Service Worker 错误:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // 保持消息通道开放
  }
});

const messageHandlers = {
  /** 获取设置 */
  [MESSAGE_TYPE.GET_SETTINGS]: async (message) => {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.API_KEY,
      STORAGE_KEYS.MODEL,
      STORAGE_KEYS.SETTINGS,
    ]);
    return {
      success: true,
      data: {
        apiKey: result[STORAGE_KEYS.API_KEY] || '',
        model: result[STORAGE_KEYS.MODEL] || DEEPSEEK_CONFIG.DEFAULT_MODEL,
        settings: result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS,
      },
    };
  },

  /** 保存设置 */
  [MESSAGE_TYPE.SET_SETTINGS]: async (message) => {
    const { key, value } = message.payload;
    const storageKeyMap = {
      apiKey: STORAGE_KEYS.API_KEY,
      model: STORAGE_KEYS.MODEL,
      settings: STORAGE_KEYS.SETTINGS,
    };
    const storageKey = storageKeyMap[key];
    if (storageKey) {
      await chrome.storage.local.set({ [storageKey]: value });
    }
    return { success: true };
  },

  /** AI 生成请求（通过 Service Worker 代理，避免 CORS） */
  [MESSAGE_TYPE.AI_GENERATE]: async (message) => {
    const { systemPrompt, userPrompt, model, temperature, maxTokens } = message.payload;

    // 获取 API Key
    const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
    const apiKey = result[STORAGE_KEYS.API_KEY];
    if (!apiKey) {
      return { success: false, error: '请先配置 DeepSeek API Key' };
    }

    const url = `${DEEPSEEK_CONFIG.BASE_URL}${DEEPSEEK_CONFIG.CHAT_ENDPOINT}`;
    const body = {
      model: model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: temperature ?? DEEPSEEK_CONFIG.TEMPERATURE,
      max_tokens: maxTokens ?? DEEPSEEK_CONFIG.MAX_TOKENS,
      stream: false,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || response.statusText;
        return {
          success: false,
          error: `API 请求失败 (${response.status}): ${errorMsg}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: {
          content: data.choices[0].message.content,
          model: data.model,
          usage: data.usage,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `网络请求失败: ${error.message}`,
      };
    }
  },

  /** 验证 API Key */
  [MESSAGE_TYPE.AI_GENERATE + '_validate']: async (message) => {
    const { apiKey } = message.payload;
    try {
      const response = await fetch(`${DEEPSEEK_CONFIG.BASE_URL}${DEEPSEEK_CONFIG.CHAT_ENDPOINT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_CONFIG.DEFAULT_MODEL,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 1,
          stream: false,
        }),
      });
      return { success: response.ok };
    } catch {
      return { success: false };
    }
  },
};

// ========== 流式 AI 生成（通过长连接 Port） ==========
chrome.runtime.onConnect.addListener((port) => {
  // 只处理 AI 流式生成连接
  if (port.name !== 'ai-stream') return;

  console.log('[天音助手] 流式连接已建立');

  port.onMessage.addListener(async (message) => {
    if (message.type !== 'start_stream') return;

    const { systemPrompt, userPrompt, model, temperature, maxTokens } = message.payload;

    // 获取 API Key
    const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
    const apiKey = result[STORAGE_KEYS.API_KEY];
    if (!apiKey) {
      port.postMessage({
        type: MESSAGE_TYPE.AI_STREAM_ERROR,
        payload: { error: '请先配置 DeepSeek API Key' },
      });
      return;
    }

    const url = `${DEEPSEEK_CONFIG.BASE_URL}${DEEPSEEK_CONFIG.CHAT_ENDPOINT}`;
    const body = {
      model: model || DEEPSEEK_CONFIG.DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: temperature ?? DEEPSEEK_CONFIG.TEMPERATURE,
      max_tokens: maxTokens ?? DEEPSEEK_CONFIG.MAX_TOKENS,
      stream: true,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || response.statusText;
        port.postMessage({
          type: MESSAGE_TYPE.AI_STREAM_ERROR,
          payload: { error: `API 请求失败 (${response.status}): ${errorMsg}` },
        });
        return;
      }

      // 读取 SSE 流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // 注释行
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                port.postMessage({
                  type: MESSAGE_TYPE.AI_STREAM_CHUNK,
                  payload: { chunk: content },
                });
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 处理 buffer 中剩余的数据
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                port.postMessage({
                  type: MESSAGE_TYPE.AI_STREAM_CHUNK,
                  payload: { chunk: content },
                });
              }
            } catch (e) {}
          }
        }
      }

      // 发送完成信号
      port.postMessage({
        type: MESSAGE_TYPE.AI_STREAM_DONE,
        payload: { success: true },
      });
    } catch (error) {
      port.postMessage({
        type: MESSAGE_TYPE.AI_STREAM_ERROR,
        payload: { error: `网络请求失败: ${error.message}` },
      });
    }
  });

  // 连接断开时清理
  port.onDisconnect.addListener(() => {
    console.log('[天音助手] 流式连接已断开');
  });
});

// 插件安装/更新时的初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // 首次安装，初始化默认设置
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
      [STORAGE_KEYS.MODEL]: DEEPSEEK_CONFIG.DEFAULT_MODEL,
    });
    console.log('[天音助手] 已安装，初始化默认设置完成');
  }
});
