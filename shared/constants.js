// ============================================================
// 天音 AI 创作助手 — 常量定义
// ============================================================

/** 插件名称 */
const EXTENSION_NAME = '天音 AI 创作助手';

/** 目标页面 URL 匹配 */
const TARGET_URL_PATTERN = 'https://music.163.com/st/tianyin/*';

/** 目标输入框选择器（通过 placeholder 或 data-* 属性定位） */
const TARGET_SELECTORS = {
  /** 开始创作（风格描述）textarea */
  songIdea: 'textarea[placeholder*="歌曲的想法"], textarea[placeholder*="写下你对歌曲的想法"]',
  /** 歌词 textarea */
  lyrics: 'textarea[placeholder*="歌词"], textarea[placeholder*="写下你想要的歌词"]',
  /** 歌曲名称 input */
  songName: 'input[placeholder*="歌曲名称"], input[placeholder*="请输入歌曲名称"]',
};

/** 输入框类型枚举 */
const INPUT_TYPE = {
  SONG_IDEA: 'songIdea',
  LYRICS: 'lyrics',
  SONG_NAME: 'songName',
};

/** 输入框显示名称映射（与天音页面显示名称一致） */
const INPUT_LABELS = {
  [INPUT_TYPE.SONG_IDEA]: '开始创作（风格描述）',
  [INPUT_TYPE.LYRICS]: '歌词',
  [INPUT_TYPE.SONG_NAME]: '歌曲名称',
};

/** 内联快捷操作类型 */
const ACTION_TYPE = {
  POLISH: 'polish',
  REWRITE: 'rewrite',
  CONTINUE: 'continue',
  GENERATE: 'generate',
  /** 完整创作：同时生成风格描述 + 歌词 + 歌曲名称 */
  COMPLETE_CREATE: 'complete_create',
};

/** 操作按钮配置 */
const ACTION_BUTTONS = [
  { type: ACTION_TYPE.POLISH, label: '✨ 润色', tooltip: '润色当前内容' },
  { type: ACTION_TYPE.REWRITE, label: '🔄 重写', tooltip: '换一种风格重写' },
  { type: ACTION_TYPE.CONTINUE, label: '💡 续写', tooltip: '续写/扩展内容' },
  { type: ACTION_TYPE.GENERATE, label: '📝 生成', tooltip: '根据描述生成' },
];

/** DeepSeek API 配置 */
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

/** Chrome 存储键名 */
const STORAGE_KEYS = {
  API_KEY: 'deepseek_api_key',
  MODEL: 'deepseek_model',
  CHAT_HISTORY: 'chat_history',
  SETTINGS: 'settings',
};

/** 消息类型（用于 content script ↔ sidebar 通信） */
const MESSAGE_TYPE = {
  // 内容相关
  GET_PAGE_CONTEXT: 'get_page_context',
  PAGE_CONTEXT: 'page_context',
  APPLY_TO_INPUT: 'apply_to_input',
  // AI 相关
  AI_GENERATE: 'ai_generate',
  AI_RESULT: 'ai_result',
  AI_ERROR: 'ai_error',
  // AI 流式输出相关
  AI_GENERATE_STREAM: 'ai_generate_stream',
  AI_STREAM_CHUNK: 'ai_stream_chunk',
  AI_STREAM_DONE: 'ai_stream_done',
  AI_STREAM_ERROR: 'ai_stream_error',
  // 设置相关
  GET_SETTINGS: 'get_settings',
  SET_SETTINGS: 'set_settings',
  SETTINGS_UPDATED: 'settings_updated',
  // 侧边栏状态
  TOGGLE_SIDEBAR: 'toggle_sidebar',
  SIDEBAR_STATE: 'sidebar_state',
  // Diff 相关
  SHOW_DIFF: 'show_diff',
  APPLY_DIFF: 'apply_diff',
  // Diff 高亮（在左侧 CodeMirror 编辑器中显示 inline diff）
  APPLY_DIFF_HIGHLIGHT: 'apply_diff_highlight',
};

/** 默认设置 */
const DEFAULT_SETTINGS = {
  model: DEEPSEEK_CONFIG.DEFAULT_MODEL,
  sidebarExpanded: true,
  theme: 'light',
};

/** 侧边栏宽度 */
const SIDEBAR_WIDTH = 520;

/** 侧边栏 z-index */
const SIDEBAR_Z_INDEX = 999999;
