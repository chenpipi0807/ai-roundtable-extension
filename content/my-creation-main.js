// ============================================================
// 天音 AI — 作品页下载助手（MAIN world）
// 运行在页面 JS 上下文，可拦截 fetch / XHR
// ============================================================

(function () {
  'use strict';

  if (!location.pathname.includes('my-creation')) return;

  const AUDIO_CDN  = 'music-ugc-ai-song.music.126.net';
  const RE_URL     = new RegExp(`https?://${AUDIO_CDN}/[^\\s"'<>]+\\.mp3`, 'g');
  const RE_SONG_ID = /ai-factory-processed-(\d+)\.mp3/;
  // sessionStorage key — ISOLATED world 可以直接读取（同 origin）
  const SS_KEY     = '__tianyin_dl__';

  const seen = new Set();

  // ─── 追踪最近一次点击了哪一行 ────────────────────────────────────────
  let lastRowId = null;
  document.addEventListener('click', (ev) => {
    const row = ev.target.closest('tr, [class*="production"], [class*="creation"], [class*="item"], li');
    if (!row) return;
    if (!row.dataset.tianyinId) {
      row.dataset.tianyinId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }
    lastRowId = row.dataset.tianyinId;
    // 3 秒内未捕获到 URL 则清空
    setTimeout(() => { lastRowId = null; }, 3000);
  }, true);

  // ─── 广播捕获到的 URL ────────────────────────────────────────────────
  function broadcast(url) {
    const m = url.match(RE_SONG_ID);
    if (!m) return;
    const songId = m[1];
    if (seen.has(songId)) return;
    seen.add(songId);

    // rowId 优先用 songId 本身，保证 ISOLATED world 能精确匹配
    const rowId = lastRowId || songId;

    // 写入 sessionStorage，供晚加载的 ISOLATED world 读取
    try {
      const cache = JSON.parse(sessionStorage.getItem(SS_KEY) || '{}');
      cache[songId] = { url, rowId };
      sessionStorage.setItem(SS_KEY, JSON.stringify(cache));
    } catch (_) {}

    // 通过 CustomEvent 通知 ISOLATED world（实时）
    document.dispatchEvent(new CustomEvent('tianyin-audio-found', {
      detail: { songId, url, rowId },
    }));

    console.log('[天音下载] 捕获音频:', songId);
  }

  // ─── 扫描文本，提取 URL ──────────────────────────────────────────────
  function scan(text) {
    if (!text || !text.includes(AUDIO_CDN)) return;
    (text.match(RE_URL) || []).forEach(broadcast);
  }

  // ─── 拦截 fetch ──────────────────────────────────────────────────────
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    return origFetch.apply(this, args).then((res) => {
      res.clone().text().then(scan).catch(() => {});
      return res;
    });
  };

  // ─── 拦截 XHR ────────────────────────────────────────────────────────
  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) {
    this._u = u;
    return xhrOpen.apply(this, arguments);
  };
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => {
      try { scan(this.responseText); } catch (_) {}
    });
    return xhrSend.apply(this, arguments);
  };

  console.log('[天音下载] MAIN world 拦截器就绪');
})();