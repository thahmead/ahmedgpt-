(() => {
  'use strict';

  // ---------- Constants ----------
  const STORAGE_KEY = 'chat.conversations.v1';
  const MODELS = {
    'deepseek-chat': 'Chat',
    'deepseek-reasoner': 'Reasoning',
  };
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_TEXT_CHARS = 200_000; // per file, keeps prompts within context limits
  const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|yaml|yml|toml|ini|cfg|conf|log|html?|css|scss|less|js|mjs|cjs|jsx|ts|tsx|py|rb|go|rs|java|kt|kts|swift|c|h|cc|cpp|hpp|cs|php|sh|bash|zsh|sql|r|lua|pl|dart|vue|svelte|env|gitignore|dockerfile|tex|srt|vtt)$/i;

  const $ = (id) => document.getElementById(id);
  const els = {
    app: $('app'),
    history: $('history'),
    messages: $('messages'),
    thread: $('thread'),
    input: $('input'),
    composer: $('composer'),
    sendBtn: $('sendBtn'),
    attachBtn: $('attachBtn'),
    fileInput: $('fileInput'),
    attachments: $('attachments'),
    modelBtn: $('modelBtn'),
    modelMenu: $('modelMenu'),
    modelLabel: $('modelLabel'),
    appName: $('appName'),
    reasonToggle: $('reasonToggle'),
    search: $('searchChats'),
    dropOverlay: $('dropOverlay'),
    toast: $('toast'),
    themeToggle: $('themeToggle'),
    themeLabel: $('themeLabel'),
  };

  const ICONS = {
    copy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
    edit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    retry: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>',
    up: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3Zm0 0 4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7"/></svg>',
    down: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3Zm0 0-4 7a2 2 0 0 1-3-2l1-5H5a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 6.4 3H17"/></svg>',
    dots: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>',
    pencil: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    x: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    file: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
    chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
  };

  // ---------- State ----------
  let conversations = loadConversations();
  let currentId = null;
  let model = localStorage.getItem('model') || 'deepseek-chat';
  let pending = []; // attachments waiting to be sent
  let streaming = null; // { controller, chatId }

  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  }

  function loadConversations() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch {
      // Storage full: drop stored image previews, keep the text
      try {
        const slim = conversations.map((c) => ({
          ...c,
          messages: c.messages.map((m) => ({
            ...m,
            attachments: (m.attachments || []).map((a) => ({ ...a, dataUrl: undefined })),
          })),
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      } catch {}
    }
  }

  const current = () => conversations.find((c) => c.id === currentId) || null;

  // ---------- Utilities ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    if (btn) {
      const prev = btn.innerHTML;
      btn.innerHTML = btn.classList.contains('code-copy') ? ICONS.check.replace(/18/g, '14') + 'Copied' : ICONS.check;
      setTimeout(() => (btn.innerHTML = prev), 1500);
    }
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  // ---------- Markdown ----------
  marked.setOptions({ gfm: true, breaks: false });

  function renderMath(tex, display) {
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false });
    } catch {
      return escapeHtml(tex);
    }
  }

  function renderMarkdown(src) {
    // Pull math out before markdown parsing (markdown would eat the backslashes), skipping code
    const math = [];
    const parts = src.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g);
    const protectedSrc = parts
      .map((part, i) => {
        if (i % 2 === 1) return part;
        return part.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g, (m, a, b, c) => {
          const display = a !== undefined || b !== undefined;
          math.push(renderMath((a ?? b ?? c).trim(), display));
          return `@@MATH${math.length - 1}@@`;
        });
      })
      .join('');

    let html = DOMPurify.sanitize(marked.parse(protectedSrc), { ADD_ATTR: ['target'] });
    html = html.replace(/@@MATH(\d+)@@/g, (_, i) => math[+i] ?? '');
    return html;
  }

  function enhanceContent(el) {
    el.querySelectorAll('pre > code').forEach((code) => {
      const pre = code.parentElement;
      if (pre.parentElement.classList.contains('code-block')) return;
      const lang = (code.className.match(/language-([\w+#-]+)/) || [])[1] || '';
      try {
        if (lang && hljs.getLanguage(lang)) code.innerHTML = hljs.highlight(code.textContent, { language: lang }).value;
        else hljs.highlightElement(code);
      } catch {}
      code.classList.add('hljs');
      const wrap = document.createElement('div');
      wrap.className = 'code-block';
      const head = document.createElement('div');
      head.className = 'code-head';
      head.innerHTML = `<span>${escapeHtml(lang || 'code')}</span><button class="code-copy" type="button">${ICONS.copy.replace(/18/g, '14')}Copy</button>`;
      head.querySelector('button').addEventListener('click', (e) => copyText(code.textContent, e.currentTarget));
      pre.replaceWith(wrap);
      wrap.append(head, pre);
    });
    el.querySelectorAll('a[href]').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  }

  // ---------- Theme ----------
  function applyTheme(t) {
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    els.themeLabel.textContent = 'Theme: ' + t[0].toUpperCase() + t.slice(1);
    try { localStorage.setItem('theme', t); } catch {}
  }
  let theme = localStorage.getItem('theme') || 'system';
  applyTheme(theme);
  els.themeToggle.addEventListener('click', () => {
    theme = { system: 'light', light: 'dark', dark: 'system' }[theme];
    applyTheme(theme);
  });

  // ---------- Model ----------
  function setModel(m) {
    model = MODELS[m] ? m : 'deepseek-chat';
    try { localStorage.setItem('model', model); } catch {}
    els.modelLabel.textContent = model === 'deepseek-reasoner' ? 'Reasoning' : '';
    els.reasonToggle.classList.toggle('active', model === 'deepseek-reasoner');
    els.modelMenu.querySelectorAll('.menu-item').forEach((b) => b.classList.toggle('selected', b.dataset.model === model));
  }
  setModel(model);

  els.modelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    els.modelMenu.hidden = !els.modelMenu.hidden;
  });
  els.modelMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-model]');
    if (!b) return;
    setModel(b.dataset.model);
    els.modelMenu.hidden = true;
  });
  els.reasonToggle.addEventListener('click', () => setModel(model === 'deepseek-reasoner' ? 'deepseek-chat' : 'deepseek-reasoner'));

  // ---------- Sidebar ----------
  const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

  function openSidebar() {
    if (isMobile()) els.app.classList.add('sidebar-open');
    else {
      els.app.classList.remove('sidebar-closed');
      try { localStorage.setItem('sidebar', 'open'); } catch {}
    }
  }
  function closeSidebar() {
    if (isMobile()) els.app.classList.remove('sidebar-open');
    else {
      els.app.classList.add('sidebar-closed');
      try { localStorage.setItem('sidebar', 'closed'); } catch {}
    }
  }
  if (localStorage.getItem('sidebar') === 'closed') els.app.classList.add('sidebar-closed');
  $('openSidebar').addEventListener('click', openSidebar);
  $('closeSidebar').addEventListener('click', closeSidebar);
  $('scrim').addEventListener('click', closeSidebar);
  ['newChat', 'newChatTop', 'newChatBar'].forEach((id) => $(id).addEventListener('click', newChat));
  els.search.addEventListener('input', renderSidebar);

  function groupLabel(ts) {
    const d = new Date(ts);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 86400000;
    if (ts >= startOfToday) return 'Today';
    if (ts >= startOfToday - day) return 'Yesterday';
    if (ts >= startOfToday - 7 * day) return 'Previous 7 Days';
    if (ts >= startOfToday - 30 * day) return 'Previous 30 Days';
    return d.toLocaleString(undefined, { month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }

  function renderSidebar() {
    const q = els.search.value.trim().toLowerCase();
    const list = conversations
      .filter((c) => c.messages.length)
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    els.history.innerHTML = '';
    if (!list.length) {
      if (q) els.history.innerHTML = '<div class="history-empty">No chats found</div>';
      return;
    }
    let lastGroup = null;
    let groupEl;
    for (const c of list) {
      const g = groupLabel(c.updatedAt);
      if (g !== lastGroup) {
        groupEl = document.createElement('div');
        groupEl.className = 'history-group';
        groupEl.innerHTML = `<div class="history-label">${escapeHtml(g)}</div>`;
        els.history.appendChild(groupEl);
        lastGroup = g;
      }
      const item = document.createElement('div');
      item.className = 'chat-item' + (c.id === currentId ? ' active' : '');
      item.innerHTML = `<button class="chat-title" type="button"></button><button class="chat-more" type="button" aria-label="Options">${ICONS.dots}</button>`;
      item.querySelector('.chat-title').textContent = c.title;
      item.querySelector('.chat-title').addEventListener('click', () => {
        openChat(c.id);
        if (isMobile()) closeSidebar();
      });
      item.querySelector('.chat-more').addEventListener('click', (e) => {
        e.stopPropagation();
        showChatMenu(e.currentTarget, c, item);
      });
      groupEl.appendChild(item);
    }
  }

  let openMenu = null;
  function closeMenus() {
    els.modelMenu.hidden = true;
    if (openMenu) {
      openMenu.anchor.setAttribute('aria-expanded', 'false');
      openMenu.el.remove();
      openMenu = null;
    }
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu')) closeMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenus();
  });

  function showChatMenu(anchor, chat, item) {
    const wasOpen = openMenu && openMenu.anchor === anchor;
    closeMenus();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.innerHTML = `
      <button class="menu-item small" data-act="rename">${ICONS.pencil}<span>Rename</span></button>
      <button class="menu-item small danger" data-act="delete">${ICONS.trash}<span>Delete</span></button>`;
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = Math.min(r.bottom + 4, window.innerHeight - 110) + 'px';
    menu.style.left = Math.min(r.left, window.innerWidth - 190) + 'px';
    anchor.setAttribute('aria-expanded', 'true');
    openMenu = { el: menu, anchor };

    menu.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      closeMenus();
      if (act === 'rename') startRename(chat, item);
      if (act === 'delete') deleteChat(chat.id);
    });
  }

  function startRename(chat, item) {
    const titleBtn = item.querySelector('.chat-title');
    const input = document.createElement('input');
    input.className = 'rename';
    input.value = chat.title;
    titleBtn.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      if (commit && input.value.trim()) {
        chat.title = input.value.trim();
        save();
      }
      renderSidebar();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  function deleteChat(id) {
    if (!confirm('Delete this chat?')) return;
    if (streaming && streaming.chatId === id) stopStreaming();
    conversations = conversations.filter((c) => c.id !== id);
    save();
    if (id === currentId) newChat();
    else renderSidebar();
  }

  // ---------- Chat navigation ----------
  function newChat() {
    if (streaming) stopStreaming();
    currentId = null;
    pending = [];
    renderAttachments();
    renderMessages();
    renderSidebar();
    els.input.value = '';
    autoresize();
    updateSend();
    history.replaceState(null, '', '/');
    if (!isMobile()) els.input.focus();
    if (isMobile()) closeSidebar();
  }

  function openChat(id) {
    if (streaming && streaming.chatId !== id) stopStreaming();
    currentId = id;
    const c = current();
    if (c?.model) setModel(c.model);
    renderMessages();
    renderSidebar();
    history.replaceState(null, '', '/c/' + id);
    scrollToBottom(true);
  }

  // ---------- Messages ----------
  function renderMessages() {
    const c = current();
    els.messages.innerHTML = '';
    els.app.classList.toggle('empty', !c || !c.messages.length);
    if (!c) return;
    c.messages.forEach((m, i) => els.messages.appendChild(buildMessage(m, i, c)));
  }

  function attachmentNode(a, removable, onRemove) {
    let node;
    if (a.kind === 'image') {
      node = document.createElement('div');
      node.className = 'img-chip';
      node.innerHTML = a.dataUrl ? `<img alt="">` : `<div class="file-chip">${ICONS.file}</div>`;
      if (a.dataUrl) {
        node.querySelector('img').src = a.dataUrl;
        node.querySelector('img').alt = a.name;
      }
    } else {
      node = document.createElement('div');
      node.className = 'file-chip';
      const cls = a.ext === 'pdf' ? 'pdf' : /^(csv|tsv|xlsx?)$/.test(a.ext) ? 'sheet' : TEXT_EXT.test('.' + a.ext) && !/^(txt|md)$/.test(a.ext) ? 'code' : '';
      node.innerHTML = `<div class="file-icon ${cls}">${ICONS.file}</div><div class="file-meta"><div class="file-name"></div><div class="file-type"></div></div>`;
      node.querySelector('.file-name').textContent = a.name;
      node.querySelector('.file-type').textContent = a.loading ? 'Reading…' : (a.ext || 'file').toUpperCase();
    }
    node.title = a.name;
    if (a.loading) node.classList.add('chip-loading');
    if (removable) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip-remove';
      x.setAttribute('aria-label', 'Remove ' + a.name);
      x.innerHTML = ICONS.x;
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        onRemove();
      });
      node.appendChild(x);
    }
    return node;
  }

  function buildMessage(m, index, chat) {
    const el = document.createElement('div');
    el.className = 'msg ' + m.role;
    el.dataset.id = m.id;

    if (m.role === 'user') {
      if (m.attachments?.length) {
        const wrap = document.createElement('div');
        wrap.className = 'msg-attachments';
        m.attachments.forEach((a) => wrap.appendChild(attachmentNode(a)));
        el.appendChild(wrap);
      }
      if (m.content) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = m.content;
        el.appendChild(bubble);
      }
      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      actions.innerHTML = `<button class="icon-btn" data-act="copy" title="Copy">${ICONS.copy}</button><button class="icon-btn" data-act="edit" title="Edit message">${ICONS.edit}</button>`;
      actions.querySelector('[data-act=copy]').addEventListener('click', (e) => copyText(m.content, e.currentTarget));
      actions.querySelector('[data-act=edit]').addEventListener('click', () => startEdit(el, m, chat));
      el.appendChild(actions);
      return el;
    }

    // assistant
    if (m.reasoning) el.appendChild(buildThinking(m));
    const content = document.createElement('div');
    content.className = 'content';
    el.appendChild(content);
    fillAssistantContent(content, m);

    if (m.error) el.appendChild(buildError(m, chat));

    const isLast = index === chat.messages.length - 1;
    if (!m.streaming && m.content) {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      actions.innerHTML =
        `<button class="icon-btn" data-act="copy" title="Copy">${ICONS.copy}</button>` +
        `<button class="icon-btn" data-act="up" title="Good response">${ICONS.up}</button>` +
        `<button class="icon-btn" data-act="down" title="Bad response">${ICONS.down}</button>` +
        (isLast ? `<button class="icon-btn" data-act="retry" title="Regenerate">${ICONS.retry}</button>` : '');
      actions.querySelector('[data-act=copy]').addEventListener('click', (e) => copyText(m.content, e.currentTarget));
      actions.querySelector('[data-act=up]').addEventListener('click', () => toast('Thanks for your feedback!'));
      actions.querySelector('[data-act=down]').addEventListener('click', () => toast('Thanks for your feedback!'));
      actions.querySelector('[data-act=retry]')?.addEventListener('click', () => regenerate(chat));
      el.appendChild(actions);
    }
    return el;
  }

  function buildThinking(m) {
    const d = document.createElement('details');
    d.className = 'thinking';
    if (m.streaming && !m.content) d.open = true;
    const secs = m.thinkingMs ? Math.max(1, Math.round(m.thinkingMs / 1000)) : null;
    const label = m.streaming && !m.content ? '<span class="shimmer">Thinking</span>' : `Thought for ${secs ?? 'a few'} second${secs === 1 ? '' : 's'}`;
    d.innerHTML = `<summary>${label}${ICONS.chevron}</summary><div class="reasoning"></div>`;
    d.querySelector('.reasoning').textContent = m.reasoning;
    return d;
  }

  function fillAssistantContent(content, m) {
    if (m.content) {
      content.innerHTML = renderMarkdown(m.content);
      enhanceContent(content);
    } else {
      content.innerHTML = '';
    }
    if (m.streaming && m.slow && !m.content && !m.reasoning) {
      const note = document.createElement('p');
      note.className = 'shimmer';
      note.textContent = 'Thinking…';
      content.appendChild(note);
    } else if (m.streaming && !m.reasoning) {
      const dot = document.createElement('span');
      dot.className = 'cursor-dot';
      (content.lastElementChild && /^(P|LI)$/.test(content.lastElementChild.tagName) ? content.lastElementChild : content).appendChild(dot);
    }
  }

  function buildError(m, chat) {
    const box = document.createElement('div');
    box.className = 'error-box';
    box.innerHTML = `<span></span><button class="btn btn-secondary" type="button">Retry</button>`;
    box.querySelector('span').textContent = m.error;
    box.querySelector('button').addEventListener('click', () => regenerate(chat));
    return box;
  }

  function updateStreamingMessage(chat, m) {
    if (chat.id !== currentId) return;
    const old = els.messages.querySelector(`[data-id="${m.id}"]`);
    const nearBottom = isNearBottom();
    const fresh = buildMessage(m, chat.messages.indexOf(m), chat);
    // Keep the reasoning panel open/closed as the user left it
    const oldDetails = old?.querySelector('details.thinking');
    const newDetails = fresh.querySelector('details.thinking');
    if (oldDetails && newDetails && oldDetails.dataset.touched) {
      newDetails.open = oldDetails.open;
      newDetails.dataset.touched = '1';
    }
    newDetails?.addEventListener('toggle', () => (newDetails.dataset.touched = '1'));
    if (newDetails && oldDetails) newDetails.querySelector('.reasoning').scrollTop = oldDetails.querySelector('.reasoning').scrollTop;
    if (old) old.replaceWith(fresh);
    else els.messages.appendChild(fresh);
    if (nearBottom) scrollToBottom();
  }

  function isNearBottom() {
    const t = els.thread;
    return t.scrollHeight - t.scrollTop - t.clientHeight < 120;
  }
  function scrollToBottom(instant) {
    els.thread.scrollTo({ top: els.thread.scrollHeight, behavior: instant ? 'auto' : 'auto' });
  }

  function startEdit(el, m, chat) {
    if (el.classList.contains('editing')) return;
    el.classList.add('editing');
    const box = document.createElement('div');
    box.className = 'edit-box';
    box.innerHTML = `<textarea></textarea><div class="edit-actions"><button class="btn btn-secondary" type="button" data-act="cancel">Cancel</button><button class="btn btn-primary" type="button" data-act="send">Send</button></div>`;
    const ta = box.querySelector('textarea');
    ta.value = m.content;
    el.querySelector('.msg-actions').before(box);
    const fit = () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 320) + 'px';
    };
    ta.addEventListener('input', fit);
    fit();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    box.querySelector('[data-act=cancel]').addEventListener('click', () => renderMessages());
    const submit = () => {
      const text = ta.value.trim();
      if (!text && !m.attachments?.length) return;
      if (streaming) stopStreaming();
      const idx = chat.messages.indexOf(m);
      m.content = text;
      chat.messages = chat.messages.slice(0, idx + 1);
      chat.updatedAt = Date.now();
      save();
      renderMessages();
      runCompletion(chat);
    };
    box.querySelector('[data-act=send]').addEventListener('click', submit);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
      }
      if (e.key === 'Escape') renderMessages();
    });
  }

  // ---------- Sending ----------
  function buildApiMessages(chat) {
    const out = [];
    for (const m of chat.messages) {
      if (m.streaming) continue;
      if (m.role === 'user') {
        let text = m.content || '';
        const files = m.attachments || [];
        if (files.length) {
          const blocks = files.map((a) => {
            if (a.kind === 'image') return `[Attached image: ${a.name}. Note: this model cannot see images, only its file name.]`;
            if (a.text != null) return `<file name="${a.name}">\n${a.text}\n</file>`;
            return `[Attached file: ${a.name} (${a.error || 'content could not be read'})]`;
          });
          text = blocks.join('\n\n') + (text ? '\n\n' + text : '');
        }
        out.push({ role: 'user', content: text });
      } else if (m.role === 'assistant' && m.content) {
        out.push({ role: 'assistant', content: m.content });
      }
    }
    // API requires alternating turns; merge consecutive same-role messages
    return out.reduce((acc, m) => {
      const last = acc[acc.length - 1];
      if (last && last.role === m.role) last.content += '\n\n' + m.content;
      else acc.push({ ...m });
      return acc;
    }, []);
  }

  async function send() {
    if (streaming) return stopStreaming();
    const text = els.input.value.trim();
    if (pending.some((a) => a.loading)) return toast('Still reading your files…');
    if (!text && !pending.length) return;

    let chat = current();
    if (!chat) {
      chat = { id: uid(), title: makeTitle(text, pending), model, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
      conversations.push(chat);
      currentId = chat.id;
      history.replaceState(null, '', '/c/' + chat.id);
    }
    chat.model = model;
    chat.messages.push({ id: uid(), role: 'user', content: text, attachments: pending.map(({ loading, ...a }) => a) });
    chat.updatedAt = Date.now();
    pending = [];
    els.input.value = '';
    autoresize();
    renderAttachments();
    save();
    renderMessages();
    renderSidebar();
    scrollToBottom(true);
    runCompletion(chat);
  }

  function makeTitle(text, files) {
    const src = text || files[0]?.name || 'New chat';
    const t = src.replace(/\s+/g, ' ').trim();
    return t.length > 40 ? t.slice(0, 40).trimEnd() + '…' : t;
  }

  function regenerate(chat) {
    if (streaming) stopStreaming();
    while (chat.messages.length && chat.messages[chat.messages.length - 1].role === 'assistant') chat.messages.pop();
    if (!chat.messages.length) return;
    save();
    renderMessages();
    runCompletion(chat);
  }

  async function runCompletion(chat) {
    const apiMessages = buildApiMessages(chat);
    const m = { id: uid(), role: 'assistant', content: '', reasoning: '', streaming: true, model: chat.model };
    chat.messages.push(m);
    const controller = new AbortController();
    streaming = { controller, chatId: chat.id };
    updateSend();
    updateStreamingMessage(chat, m);
    scrollToBottom(true);

    const started = Date.now();
    let reasoningStart = 0;
    const slowTimer = setTimeout(() => {
      m.slow = true;
      if (m.streaming && !m.content && !m.reasoning) updateStreamingMessage(chat, m);
    }, 6000);
    let frame = null;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updateStreamingMessage(chat, m);
      });
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: chat.model, messages: apiMessages }),
        signal: controller.signal,
      });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          msg = (await res.json()).error || msg;
        } catch {}
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      outer: while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') break outer;
          let json;
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }
          if (json.error) throw new Error(json.error.message || 'Stream error');
          const delta = json.choices?.[0]?.delta || {};
          if (delta.reasoning_content) {
            if (!reasoningStart) reasoningStart = Date.now();
            m.reasoning += delta.reasoning_content;
          }
          if (delta.content) {
            if (!m.content && m.reasoning) m.thinkingMs = Date.now() - (reasoningStart || started);
            m.content += delta.content;
          }
          schedule();
        }
      }
      if (!m.content && !m.reasoning) throw new Error('The model returned an empty response.');
    } catch (err) {
      if (err.name !== 'AbortError') m.error = err.message || 'Something went wrong.';
    } finally {
      clearTimeout(slowTimer);
      delete m.slow;
      if (frame) cancelAnimationFrame(frame);
      if (m.reasoning && !m.thinkingMs) m.thinkingMs = Date.now() - (reasoningStart || started);
      m.streaming = false;
      const idx = chat.messages.indexOf(m);
      if (idx !== -1 && !m.content && !m.reasoning && !m.error) {
        chat.messages.splice(idx, 1); // stopped before anything arrived
      }
      if (streaming && streaming.controller === controller) streaming = null;
      chat.updatedAt = Date.now();
      save();
      if (chat.id === currentId) renderMessages();
      renderSidebar();
      updateSend();
    }
  }

  function stopStreaming() {
    if (streaming) streaming.controller.abort();
    streaming = null;
    updateSend();
  }

  // ---------- Composer ----------
  function autoresize() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 208) + 'px';
  }
  function updateSend() {
    const hasContent = els.input.value.trim() || pending.length;
    els.sendBtn.classList.toggle('stop', !!streaming);
    els.sendBtn.disabled = !streaming && !hasContent;
    els.sendBtn.setAttribute('aria-label', streaming ? 'Stop generating' : 'Send');
  }

  els.input.addEventListener('input', () => {
    autoresize();
    updateSend();
  });
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isMobile()) {
      e.preventDefault();
      if (!streaming) send();
    }
  });
  els.composer.addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });
  els.composer.addEventListener('click', (e) => {
    if (e.target === els.composer || e.target.classList.contains('composer-row')) els.input.focus();
  });

  // ---------- Attachments ----------
  els.attachBtn.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => {
    addFiles([...els.fileInput.files]);
    els.fileInput.value = '';
  });
  els.input.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    dragDepth++;
    els.dropOverlay.classList.add('show');
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) els.dropOverlay.classList.remove('show');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    els.dropOverlay.classList.remove('show');
    if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]);
  });

  function renderAttachments() {
    els.attachments.innerHTML = '';
    pending.forEach((a) =>
      els.attachments.appendChild(
        attachmentNode(a, true, () => {
          pending = pending.filter((p) => p !== a);
          renderAttachments();
          updateSend();
        })
      )
    );
  }

  function addFiles(files) {
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        toast(`${file.name} is larger than 20 MB`);
        continue;
      }
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const a = { id: uid(), name: file.name, size: file.size, type: file.type, ext, kind: file.type.startsWith('image/') ? 'image' : 'file', loading: true };
      pending.push(a);
      readAttachment(file, a)
        .catch((err) => (a.error = err.message))
        .finally(() => {
          a.loading = false;
          if (a.error && a.kind !== 'image') toast(`Couldn't read ${a.name}: ${a.error}`);
          renderAttachments();
          updateSend();
        });
    }
    renderAttachments();
    updateSend();
    els.input.focus();
  }

  async function readAttachment(file, a) {
    if (a.kind === 'image') {
      a.dataUrl = await shrinkImage(file);
      return;
    }
    if (a.ext === 'pdf' || file.type === 'application/pdf') {
      a.text = truncate(await readPdf(file));
      return;
    }
    if (a.ext === 'docx') {
      a.text = truncate(await readDocx(file));
      return;
    }
    if (file.type.startsWith('text/') || TEXT_EXT.test(file.name) || /json|xml|javascript|yaml/.test(file.type)) {
      a.text = truncate(await file.text());
      return;
    }
    // Unknown type: try as text, reject if it looks binary
    const t = await file.text();
    if (/\u0000/.test(t.slice(0, 4000))) throw new Error('unsupported file type');
    a.text = truncate(t);
  }

  function truncate(t) {
    return t.length > MAX_TEXT_CHARS ? t.slice(0, MAX_TEXT_CHARS) + '\n…[truncated]' : t;
  }

  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 800;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('could not load image'));
      };
      img.src = url;
    });
  }

  async function readPdf(file) {
    if (!window.pdfjsLib) throw new Error('PDF reader failed to load');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      pages.push(tc.items.map((it) => it.str + (it.hasEOL ? '\n' : '')).join(''));
    }
    const text = pages.map((p, i) => `--- Page ${i + 1} ---\n${p}`).join('\n\n');
    if (!text.replace(/--- Page \d+ ---/g, '').trim()) throw new Error('no selectable text (scanned PDF?)');
    return text;
  }

  // .docx is a zip; pull word/document.xml out with the browser's own decompressor
  async function readDocx(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(buf.buffer);
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a valid .docx');
    let off = view.getUint32(eocd + 16, true);
    const count = view.getUint16(eocd + 10, true);
    for (let n = 0; n < count; n++) {
      const method = view.getUint16(off + 10, true);
      const compSize = view.getUint32(off + 20, true);
      const nameLen = view.getUint16(off + 28, true);
      const extraLen = view.getUint16(off + 30, true);
      const commentLen = view.getUint16(off + 32, true);
      const localOff = view.getUint32(off + 42, true);
      const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nameLen));
      if (name === 'word/document.xml') {
        const lNameLen = view.getUint16(localOff + 26, true);
        const lExtraLen = view.getUint16(localOff + 28, true);
        const start = localOff + 30 + lNameLen + lExtraLen;
        const data = buf.subarray(start, start + compSize);
        let xml;
        if (method === 0) xml = new TextDecoder().decode(data);
        else {
          const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          xml = await new Response(ds).text();
        }
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        return [...doc.getElementsByTagName('w:p')]
          .map((p) => [...p.getElementsByTagName('w:t')].map((t) => t.textContent).join(''))
          .join('\n');
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error('no document text found');
  }

  // ---------- Init ----------
  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      els.appName.textContent = cfg.appName;
      document.title = cfg.appName;
      if (!cfg.hasKey) toast('Server has no API key yet. Add DEEPSEEK_API_KEY to .env');
    })
    .catch(() => {});

  const match = location.pathname.match(/^\/c\/([\w-]+)/);
  if (match && conversations.some((c) => c.id === match[1])) openChat(match[1]);
  else {
    renderMessages();
    renderSidebar();
  }
  updateSend();
  autoresize();
  window.addEventListener('load', autoresize);
  window.addEventListener('resize', autoresize);
  if (!isMobile()) els.input.focus();
})();
