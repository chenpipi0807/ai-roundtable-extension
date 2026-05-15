// ============================================================
// 天音 AI 创作助手 — 左侧版本历史面板
// 使用 sessionStorage，刷新即清空
// ============================================================

(function () {
  'use strict';

  const STORAGE_KEY = 'tianyin_versions';
  const SIDEBAR_W = 160;

  let shadowRoot = null;

  // ─── sessionStorage helpers ───────────────────────────────

  function getVersions() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function saveVersions(versions) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
  }

  function takeSnapshot(label) {
    const versions = getVersions();
    const snap = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      time: Date.now(),
      label: label || `版本 ${versions.length + 1}`,
      songIdea: getInputValue(INPUT_TYPE.SONG_IDEA),
      lyrics:   getInputValue(INPUT_TYPE.LYRICS),
      songName: getInputValue(INPUT_TYPE.SONG_NAME),
    };
    versions.unshift(snap);
    if (versions.length > 30) versions.splice(30);
    saveVersions(versions);
    return snap;
  }

  function restoreSnapshot(snap) {
    setInputValue(INPUT_TYPE.SONG_IDEA, snap.songIdea || '');
    setInputValue(INPUT_TYPE.LYRICS,   snap.lyrics   || '');
    setInputValue(INPUT_TYPE.SONG_NAME, snap.songName || '');
    if (window.__tianyinInjector) {
      window.__tianyinInjector.setEditorContent(INPUT_TYPE.SONG_IDEA, snap.songIdea || '');
      window.__tianyinInjector.setEditorContent(INPUT_TYPE.LYRICS,   snap.lyrics   || '');
      window.__tianyinInjector.setEditorContent(INPUT_TYPE.SONG_NAME, snap.songName || '');
    }
  }

  // ─── UI helpers ───────────────────────────────────────────

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmt(ts) {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function renderList(activeId) {
    if (!shadowRoot) return;
    const list = shadowRoot.getElementById('ver-list');
    if (!list) return;
    const versions = getVersions();

    if (!versions.length) {
      list.innerHTML = '<div class="empty">暂无版本<br>点击 + 保存</div>';
      return;
    }

    list.innerHTML = versions.map((v, i) => {
      const isCurrent = i === 0;
      const isActive  = v.id === activeId;
      const name = (v.songName || '').trim().slice(0, 12) || '—';
      return `<div class="ver-item ${isCurrent ? 'current' : ''} ${isActive ? 'active' : ''}"
                   data-id="${v.id}" title="${v.label}">
        <div class="ver-label">${v.label}</div>
        <div class="ver-meta">${fmt(v.time)} · ${name}</div>
      </div>`;
    }).join('');

    list.querySelectorAll('.ver-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const snap = getVersions().find((v) => v.id === id);
        if (!snap) return;
        restoreSnapshot(snap);
        renderList(id);
      });
    });
  }

  // ─── Build panel ─────────────────────────────────────────

  function createPanel() {
    const host = document.createElement('div');
    host.id = 'tianyin-version-host';
    // 直接用 inline style 确保 position:fixed 不被页面样式覆盖
    // （:host 规则优先级低于 inline style，不能依赖 :host 来设定定位）
    host.style.cssText = `position:fixed;top:0;left:0;width:${SIDEBAR_W}px;height:100vh;z-index:999997;`;

    shadowRoot = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        top: 0; left: 0;
        width: ${SIDEBAR_W}px;
        height: 100vh;
        z-index: 999997;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
      }
      .panel {
        width: 100%; height: 100%;
        background: #252526;
        border-right: 1px solid #3c3c3c;
        display: flex; flex-direction: column;
        color: #cccccc; overflow: hidden;
      }
      /* header */
      .header {
        display: flex; align-items: center;
        height: 35px; padding: 0 8px 0 10px;
        border-bottom: 1px solid #3c3c3c;
        flex-shrink: 0;
      }
      .title {
        flex: 1;
        font-size: 11px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.5px;
        color: #9d9d9d;
      }
      .add-btn {
        width: auto; height: 22px;
        border: 1px solid #555; border-radius: 2px;
        background: transparent; color: #9d9d9d;
        cursor: pointer; font-size: 15px; line-height: 1;
        display: inline-flex; align-items: center; gap: 2px;
        padding: 0 6px; font-size: 11px; white-space: nowrap;
      }
      .add-btn:hover { border-color: #007acc; color: #4daafc; background: rgba(0,122,204,.1); }
      /* list */
      #ver-list { flex: 1; overflow-y: auto; }
      .ver-item {
        padding: 7px 10px;
        border-bottom: 1px solid #2d2d2d;
        cursor: pointer;
        transition: background .1s;
      }
      .ver-item:hover { background: #2a2d2e; }
      .ver-item.current { border-left: 2px solid #007acc; padding-left: 8px; }
      .ver-item.active  { background: #04395e; }
      .ver-label { font-size: 12px; color: #cccccc; font-weight: 500; }
      .ver-meta  { font-size: 11px; color: #6d6d6d; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .empty { padding: 20px 10px; color: #6d6d6d; font-size: 11px; line-height: 1.6; text-align: center; }
      ::-webkit-scrollbar { width: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #424242; border-radius: 2px; }
    `;
    shadowRoot.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="header">
        <span class="title">版本历史</span>
        <button class="add-btn" id="ver-add" title="保存当前所有字段为一个版本">💾 保存</button>
      </div>
      <div id="ver-list"></div>
    `;
    shadowRoot.appendChild(panel);
    document.body.appendChild(host);

    shadowRoot.getElementById('ver-add').addEventListener('click', () => {
      takeSnapshot();
      renderList();
    });

    renderList();
  }

  // ─── Listen for auto-save events (triggered by sidebar-host) ──

  document.addEventListener('tianyin-version-autosave', (e) => {
    const label = (e.detail && e.detail.label) ? e.detail.label : 'AI 修改';
    takeSnapshot(label);
    renderList();
  });

  // ─── Expose global API ────────────────────────────────────

  window.__tianyinVersions = {
    save: (label) => { takeSnapshot(label); renderList(); },
  };

  // ─── Init ─────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPanel);
  } else {
    createPanel();
  }
})();