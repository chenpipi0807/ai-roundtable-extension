// ============================================================
// 天音 AI — 作品页下载助手（ISOLATED world）
// Ant Design Table: tr[data-row-key] 含曲 ID，直接注入
// ============================================================

(function () {
  'use strict';

  if (!location.pathname.includes('my-creation')) return;

  // ─── 注入响应式样式 ──────────────────────────────────────────────────
  (function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* 天音下载按钮 — 响应式基础 */
      .ty-dl-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.25em;
        padding: 0.2em 0.55em;
        margin-left: 0.4em;
        background: #007acc;
        color: #fff;
        border: none;
        border-radius: 3px;
        font-size: clamp(10px, 0.75rem, 13px);
        cursor: pointer;
        white-space: nowrap;
        vertical-align: middle;
        font-family: inherit;
        line-height: 1.5;
        transition: background 0.2s, filter 0.2s;
      }
      .ty-dl-btn:hover {
        filter: brightness(1.15);
      }
      .ty-dl-btn.ty-dl-busy:hover,
      .ty-dl-btn.ty-dl-error:hover {
        filter: none;
      }

      /* 状态变体 */
      .ty-dl-btn.ty-dl-busy {
        background: #555;
      }
      .ty-dl-btn.ty-dl-error {
        background: #a00;
      }

      /* 窄屏（≤1280px）：隐藏文字，只显示图标 */
      @media (max-width: 1280px) {
        .ty-dl-btn {
          gap: 0;
          padding: 0.2em 0.35em;
        }
        .ty-dl-btn .ty-dl-text {
          display: none;
        }
      }

      /* 超窄屏（≤960px）：进一步缩小 */
      @media (max-width: 960px) {
        .ty-dl-btn {
          font-size: clamp(9px, 0.6rem, 11px);
          padding: 0.15em 0.3em;
          margin-left: 0.2em;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  })();

  const AUDIO_CDN  = 'music-ugc-ai-song.music.126.net';
  const RE_SONG_ID = /ai-factory-processed-(\d+)\.mp3/;
  const SS_KEY     = '__tianyin_dl__';

  // rowKey(songId) → url
  const urlMap  = new Map();
  // rowKey → resolve (等待 URL)
  const pending = new Map();

  // ─── 处理捕获到的 URL ─────────────────────────────────────────────────
  function handle(songId, url, rowId) {
    url = url.replace('http://', 'https://');
    urlMap.set(songId, url);
    // 解除等待
    for (const key of [rowId, songId]) {
      if (key && pending.has(key)) {
        pending.get(key)(url);
        pending.delete(key);
        break;
      }
    }
    // 恢复同行按钮（如果正在"获取中"）
    const btn = document.querySelector('.ty-dl-btn[data-sid="' + songId + '"]');
    if (btn) { setReady(btn); }
  }

  // ─── 扫描 Ant Design 表格行并注入按钮 ────────────────────────────────
  function injectAllBtns() {
    // Ant Design Table: <tr data-row-key="3441259" class="ant-table-row ...">
    const rows = document.querySelectorAll('tr[data-row-key]');
    for (const tr of rows) {
      const songId = tr.dataset.rowKey; // 直接就是曲 ID
      if (!songId) continue;

      // 找最后一个 td（操作列）
      const tds = tr.querySelectorAll('td');
      if (!tds.length) continue;
      const lastTd = tds[tds.length - 1];
      if (lastTd.querySelector('.ty-dl-btn')) continue; // 已注入

      const btn = makeBtn(songId);
      lastTd.appendChild(btn);
    }
  }

  // ─── 创建下载按钮 ─────────────────────────────────────────────────────
  function makeBtn(songId) {
    const btn = document.createElement('button');
    btn.className = 'ty-dl-btn';
    btn.dataset.sid = songId;
    // 功能性兜底，视觉样式由注入的 <style> 统一管理
    btn.style.display = 'inline-flex';
    btn.style.cursor = 'pointer';
    setReady(btn);

    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      e.preventDefault();

      // 已缓存 → 直接下载
      if (urlMap.has(songId)) {
        doDownload(urlMap.get(songId), songId);
        return;
      }

      // 未缓存 → 点击封面播放按钮，等待 URL（最多 12s）
      setBusy(btn, '获取中…');
      const tr = document.querySelector('tr[data-row-key="' + songId + '"]');
      const url = await captureViaPlay(tr, songId, 12000);

      if (url) {
        doDownload(url, songId);
        setReady(btn);
      } else {
        btn.classList.add('ty-dl-error');
        btn.innerHTML = '<span class="ty-dl-text">❌ 失败</span>';
        setTimeout(function () {
          btn.classList.remove('ty-dl-error');
          setReady(btn);
        }, 3000);
      }
    });

    return btn;
  }

  // ─── 点击播放按钮，等待 URL 捕获 ─────────────────────────────────────
  function captureViaPlay(tr, songId, ms) {
    return new Promise(function (resolve) {
      pending.set(songId, resolve);

      // 打 tianyinId 给 MAIN world 的 lastRowId 机制
      if (tr && !tr.dataset.tianyinId) {
        tr.dataset.tianyinId = Date.now().toString(36);
      }

      if (tr) {
        // Ant Design 封面上的播放按钮：
        // <span role="img" aria-label="anticom-play-circle" ...>
        // 或包含 play 的 class
        const playEl =
          tr.querySelector('[aria-label*="play"],[aria-label*="Play"]') ||
          tr.querySelector('[class*="play"]') ||
          tr.querySelector('[class*="cover"] button,[class*="thumb"] button') ||
          tr.querySelector('td:first-child [role="img"]') ||
          tr.querySelector('td:first-child');

        if (playEl) {
          playEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      }

      setTimeout(function () {
        if (pending.has(songId)) { pending.delete(songId); resolve(null); }
      }, ms);
    });
  }

  // ─── 下载 ─────────────────────────────────────────────────────────────
  function doDownload(url, songId) {
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_AUDIO',
      payload: { url: url, filename: 'AI歌曲-' + songId + '.mp3' },
    });
  }

  // ─── 按钮状态 ─────────────────────────────────────────────────────────
  function setReady(btn) {
    btn.classList.remove('ty-dl-busy', 'ty-dl-error');
    btn.innerHTML =
      '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;font-size:1.1em">' +
      '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>' +
      '<polyline points="7 10 12 15 17 10"/>' +
      '<line x1="12" y1="15" x2="12" y2="3"/>' +
      '</svg><span class="ty-dl-text">下载</span>';
  }

  function setBusy(btn, text) {
    btn.classList.add('ty-dl-busy');
    btn.classList.remove('ty-dl-error');
    btn.innerHTML = '<span class="ty-dl-text">' + text + '</span>';
  }

  // ─── 监听 MAIN world 广播 ────────────────────────────────────────────
  document.addEventListener('tianyin-audio-found', function (e) {
    const d = e.detail || {};
    if (d.songId && d.url) handle(d.songId, d.url, d.rowId || d.songId);
  });

  // ─── 监听 <audio> src 变化（备用） ───────────────────────────────────
  new MutationObserver(function (muts) {
    for (const m of muts) {
      if (m.type !== 'attributes') continue;
      const src = m.target.src || m.target.getAttribute('src') || '';
      if (!src.includes(AUDIO_CDN)) continue;
      const match = src.match(RE_SONG_ID);
      if (match) handle(match[1], src, match[1]);
    }
  }).observe(document.documentElement, {
    subtree: true, attributes: true, attributeFilter: ['src'],
  });

  // ─── sessionStorage 恢复 ─────────────────────────────────────────────
  try {
    const cache = JSON.parse(sessionStorage.getItem(SS_KEY) || '{}');
    for (const sid in cache) {
      if (cache.hasOwnProperty(sid)) handle(sid, cache[sid].url, sid);
    }
  } catch (_) {}

  // ─── DOM 变化时扫描注入（React 分页/更新） ───────────────────────────
  new MutationObserver(function () { injectAllBtns(); })
    .observe(document.body, { childList: true, subtree: true });

  injectAllBtns();
  console.log('[天音下载] 按钮注入器就绪（Ant Design Table 模式）');
})();
