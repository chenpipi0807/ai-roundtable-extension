// ============================================================
// 天音 AI 创作助手 — 工具函数
// ============================================================

/**
 * 生成唯一 ID
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 防抖函数
 * @param {Function} fn
 * @param {number} delay ms
 * @returns {Function}
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

/**
 * 节流函数
 * @param {Function} fn
 * @param {number} interval ms
 * @returns {Function}
 */
function throttle(fn, interval = 200) {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}

/**
 * 安全地查询 DOM 元素（等待元素出现）
 * @param {string} selector
 * @param {number} timeout ms
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * 获取输入框的当前值
 * @param {string} type - INPUT_TYPE 枚举值
 * @returns {string}
 */
function getInputValue(type) {
  const selector = TARGET_SELECTORS[type];
  if (!selector) return '';
  const el = document.querySelector(selector);
  return el ? el.value : '';
}

/**
 * 可靠地触发原生输入框的值变更（兼容 React/Ant Design 合成事件）
 * 天音页面使用 React 18 + Ant Design，仅设置 .value 和 dispatchEvent 可能无效。
 * 此函数使用原生 setter + 多重事件触发确保 React 合成事件系统能捕获到变更。
 * @param {HTMLInputElement|HTMLTextAreaElement} element - 目标输入框元素
 * @param {string} value - 要设置的值
 */
function triggerNativeInput(element, value) {
  if (!element) return;

  // 1. 使用原生 value setter（绕过 React 受控组件的 value 拦截）
  const proto = element instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(element, value);
  } else {
    element.value = value;
  }

  // 2. 触发 input 事件（bubbles: true 让 React 合成事件可以捕获）
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

  // 3. 触发 change 事件
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

  // 4. 触发 blur 事件（某些 Ant Design 组件在 blur 时同步状态到 Form）
  element.dispatchEvent(new Event('blur', { bubbles: true }));

  // 5. 额外尝试触发 React 内部事件系统
  // Ant Design 的 rc-textarea 使用 React 的 onInput 合成事件
  // 通过查找 React 内部属性 __reactProps$ 来直接调用 onInput handler
  try {
    const reactKey = Object.keys(element).find(k => k.startsWith('__reactProps$'));
    if (reactKey) {
      const props = element[reactKey];
      if (typeof props?.onInput === 'function') {
        props.onInput({ target: element, currentTarget: element });
      }
    }
  } catch (e) {
    // 静默失败，不影响主要功能
  }
}

/**
 * 设置输入框的值并触发事件
 * @param {string} type - INPUT_TYPE 枚举值
 * @param {string} value
 */
function setInputValue(type, value) {
  const selector = TARGET_SELECTORS[type];
  if (!selector) return;
  const el = document.querySelector(selector);
  if (!el) return;
  triggerNativeInput(el, value);
}

/**
 * 获取当前页面的风格标签
 * @returns {string[]}
 */
function getStyleTags() {
  // 尝试多种选择器匹配天音页面的风格标签
  const selectors = [
    '.tag-item.active', '.style-tag.selected',
    '[class*="style"][class*="active"]', '[class*="tag"][class*="active"]',
    '.ant-tag-checkable-checked',
  ];

  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      return Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
    }
  }

  // 尝试从 DOM 中查找风格选择区域
  const possibleContainers = document.querySelectorAll(
    '[class*="style"], [class*="tag"], [class*="genre"]'
  );
  for (const container of possibleContainers) {
    const activeItems = container.querySelectorAll('.active, .selected, [class*="active"]');
    if (activeItems.length > 0) {
      return Array.from(activeItems).map(el => el.textContent.trim()).filter(Boolean);
    }
  }

  return [];
}

/**
 * 获取页面完整上下文（用于 AI Prompt）
 * @returns {Object}
 */
function getPageContext() {
  const lockedFields = window.__tianyinInjector
    ? window.__tianyinInjector.getLockedFields()
    : [];
  return {
    songIdea: getInputValue(INPUT_TYPE.SONG_IDEA),
    lyrics: getInputValue(INPUT_TYPE.LYRICS),
    songName: getInputValue(INPUT_TYPE.SONG_NAME),
    styles: getStyleTags(),
    lockedFields,
    url: window.location.href,
  };
}

/**
 * 安全解析 JSON
 * @param {string} str
 * @param {*} fallback
 * @returns {*}
 */
function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * 转义 HTML 特殊字符
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 将文本按行分割
 * @param {string} text
 * @returns {string[]}
 */
function splitLines(text) {
  return text.split(/\r?\n/);
}

/**
 * 将行数组合并为文本
 * @param {string[]} lines
 * @returns {string}
 */
function joinLines(lines) {
  return lines.join('\n');
}
