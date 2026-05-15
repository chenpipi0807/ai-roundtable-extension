// ============================================================
// 天音 AI 创作助手 — DeepSeek API 客户端
// ============================================================

class DeepSeekClient {
  constructor() {
    this.apiKey = '';
    this.model = DEEPSEEK_CONFIG.DEFAULT_MODEL;
    this.baseUrl = DEEPSEEK_CONFIG.BASE_URL;
    this._initialized = false;
  }

  /**
   * 从存储中初始化配置
   * @returns {Promise<boolean>} 是否成功初始化（是否有 API Key）
   */
  async initialize() {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.API_KEY,
        STORAGE_KEYS.MODEL,
      ]);
      this.apiKey = result[STORAGE_KEYS.API_KEY] || '';
      this.model = result[STORAGE_KEYS.MODEL] || DEEPSEEK_CONFIG.DEFAULT_MODEL;
      this._initialized = !!this.apiKey;
      return this._initialized;
    } catch (e) {
      console.error('[天音助手] DeepSeekClient 初始化失败:', e);
      return false;
    }
  }

  /**
   * 检查是否已配置 API Key
   * @returns {boolean}
   */
  isReady() {
    return this._initialized && !!this.apiKey;
  }

  /**
   * 发送聊天请求
   * @param {Array<{role: string, content: string}>} messages - 消息数组
   * @param {Object} options - 可选参数
   * @returns {Promise<string>} AI 回复内容
   */
  async chat(messages, options = {}) {
    if (!this.isReady()) {
      throw new Error('请先配置 DeepSeek API Key');
    }

    const url = `${this.baseUrl}${DEEPSEEK_CONFIG.CHAT_ENDPOINT}`;
    const body = {
      model: options.model || this.model,
      messages: messages,
      temperature: options.temperature ?? DEEPSEEK_CONFIG.TEMPERATURE,
      max_tokens: options.maxTokens ?? DEEPSEEK_CONFIG.MAX_TOKENS,
      stream: false,
    };
    if (options.responseFormat) {
      body.response_format = { type: options.responseFormat };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || response.statusText;
        throw new Error(`API 请求失败 (${response.status}): ${errorMsg}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('网络请求失败，请检查网络连接');
      }
      throw error;
    }
  }

  /**
   * 发送带系统 Prompt 的聊天请求
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {Object} options
   * @returns {Promise<string>}
   */
  async chatWithPrompt(systemPrompt, userPrompt, options = {}) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    return this.chat(messages, options);
  }

  /**
   * 多轮对话（带历史）
   * @param {Array<{role: string, content: string}>} history - 历史消息
   * @param {string} userMessage - 用户新消息
   * @param {Object} options
   * @returns {Promise<{reply: string, history: Array}>}
   */
  async chatWithHistory(history, userMessage, options = {}) {
    const messages = [...history, { role: 'user', content: userMessage }];
    const reply = await this.chat(messages, options);
    return {
      reply,
      history: [
        ...messages,
        { role: 'assistant', content: reply },
      ],
    };
  }

  /**
   * 验证 API Key 是否有效
   * @param {string} apiKey
   * @returns {Promise<boolean>}
   */
  async validateApiKey(apiKey) {
    try {
      const response = await fetch(`${this.baseUrl}${DEEPSEEK_CONFIG.CHAT_ENDPOINT}`, {
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
      return response.ok;
    } catch {
      return false;
    }
  }
}

// 全局单例
const deepseekClient = new DeepSeekClient();
