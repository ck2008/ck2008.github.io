/* 個人工作台 — 書籤頁
 * 資料來源：Supabase (ckdb) public.categories / public.bookmarks
 * 存取控制：GitHub OAuth 登入，RLS 只開放給擁有者 uid
 */
(() => {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const $ = (sel) => document.querySelector(sel);

  const gate = $('#gate');
  const app = $('#app');
  const gateError = $('#gateError');

  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.startsWith('PASTE_')) {
    gate.hidden = false;
    gateError.hidden = false;
    gateError.textContent = '尚未設定 config.js 的 SUPABASE_ANON_KEY。';
    $('#btnLogin').disabled = true;
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ---------- 狀態 ----------
  const state = {
    categories: [],
    bookmarks: [],
    activeCategory: 'all',   // 'all' | 'fav' | 'none' | <id>
    query: '',
    sortBy: 'sort',
  };

  // ---------- 小工具 ----------
  const toastEl = $('#toast');
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }
  function faviconOf(url) {
    try {
      return 'https://www.google.com/s2/favicons?sz=64&domain=' + new URL(url).hostname;
    } catch { return ''; }
  }

  // ---------- 主題 ----------
  const themeToggle = $('#themeToggle');
  function applyTheme(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    themeToggle.checked = dark;
    try { localStorage.setItem('wb-theme', dark ? 'dark' : 'light'); } catch {}
  }
  let savedTheme = null;
  try { savedTheme = localStorage.getItem('wb-theme'); } catch {}
  applyTheme(savedTheme ? savedTheme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches);
  themeToggle.addEventListener('change', () => applyTheme(themeToggle.checked));

  // ---------- 認證 ----------
  $('#btnLogin').addEventListener('click', async () => {
    gateError.hidden = true;
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) { gateError.hidden = false; gateError.textContent = error.message; }
  });

  $('#btnLogout').addEventListener('click', async () => {
    await sb.auth.signOut();
    location.reload();
  });

  sb.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session); else showGate();
  });

  function showGate() {
    app.hidden = true;
    gate.hidden = false;
  }

  async function showApp(session) {
    gate.hidden = true;
    app.hidden = false;
    const u = session.user.user_metadata || {};
    $('#userName').textContent = u.user_name || u.name || session.user.email || '';
    if (u.avatar_url) $('#userAvatar').src = u.avatar_url;
    await loadAll();
  }

  (async () => {
    const { data } = await sb.auth.getSession();
    if (data.session) showApp(data.session); else showGate();
  })();

  // ---------- 讀取資料 ----------
  async function loadAll() {
    const [cats, bms] = await Promise.all([
      sb.from('categories').select('*').order('sort_order').order('id'),
      sb.from('bookmarks').select('*').order('sort_order').order('id'),
    ]);
    if (cats.error) return fail(cats.error);
    if (bms.error) return fail(bms.error);
    state.categories = cats.data;
    state.bookmarks = bms.data;
    renderCategories();
    renderBookmarks();
  }

  function fail(error) {
    console.error(error);
    toast('讀取失敗：' + error.message);
  }

  // ---------- 側邊類別 ----------
  function countFor(key) {
    if (key === 'all') return state.bookmarks.length;
    if (key === 'fav') return state.bookmarks.filter((b) => b.is_favorite).length;
    if (key === 'none') return state.bookmarks.filter((b) => !b.category_id).length;
    return state.bookmarks.filter((b) => b.category_id === key).length;
  }

  function renderCategories() {
    const list = $('#categoryList');
    list.textContent = '';

    const fixed = [
      { key: 'all', name: '全部書籤', icon: '🗂️', color: 'var(--muted)' },
      { key: 'fav', name: '最愛', icon: '⭐', color: '#f59e0b' },
    ];
    for (const f of fixed) list.append(categoryRow(f.key, f.icon, f.name, f.color, null));

    for (const c of state.categories) {
      list.append(categoryRow(c.id, c.icon || '📁', c.name, c.color || 'var(--muted)', c));
    }

    if (countFor('none') > 0) {
      list.append(categoryRow('none', '📭', '未分類', 'var(--muted)', null));
    }
  }

  function categoryRow(key, icon, name, color, category) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'cat-item' + (state.activeCategory === key ? ' is-active' : '');
    btn.type = 'button';

    const dot = document.createElement('span');
    dot.className = 'cat-dot';
    dot.style.background = color;

    const ico = document.createElement('span');
    ico.textContent = icon;

    const nm = document.createElement('span');
    nm.className = 'cat-name';
    nm.textContent = name;

    const cnt = document.createElement('span');
    cnt.className = 'cat-count';
    cnt.textContent = countFor(key);

    btn.append(dot, ico, nm, cnt);

    if (category) {
      const edit = document.createElement('span');
      edit.className = 'cat-edit';
      edit.textContent = '✎';
      edit.title = '編輯類別';
      edit.addEventListener('click', (e) => { e.stopPropagation(); openCategoryDialog(category); });
      btn.append(edit);
    }

    btn.addEventListener('click', () => {
      state.activeCategory = key;
      renderCategories();
      renderBookmarks();
    });

    li.append(btn);
    return li;
  }

  // ---------- 書籤清單 ----------
  $('#search').addEventListener('input', (e) => {
    state.query = e.target.value.trim().toLowerCase();
    renderBookmarks();
  });
  $('#sortBy').addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    renderBookmarks();
  });

  function visibleBookmarks() {
    const k = state.activeCategory;
    let rows = state.bookmarks.filter((b) => {
      if (k === 'all') return true;
      if (k === 'fav') return b.is_favorite;
      if (k === 'none') return !b.category_id;
      return b.category_id === k;
    });

    if (state.query) {
      const q = state.query;
      rows = rows.filter((b) =>
        [b.title, b.url, b.description, (b.tags || []).join(' ')]
          .filter(Boolean).join(' ').toLowerCase().includes(q));
    }

    const cmp = {
      title: (a, b) => a.title.localeCompare(b.title, 'zh-Hant'),
      newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      sort: (a, b) => (a.sort_order - b.sort_order) || (a.id - b.id),
    }[state.sortBy];
    return rows.sort(cmp);
  }

  function renderBookmarks() {
    const grid = $('#grid');
    const empty = $('#empty');
    grid.textContent = '';

    const titles = { all: '全部書籤', fav: '最愛', none: '未分類' };
    const cat = state.categories.find((c) => c.id === state.activeCategory);
    $('#viewTitle').textContent = titles[state.activeCategory] || (cat ? cat.name : '書籤');

    const rows = visibleBookmarks();
    empty.hidden = rows.length > 0;
    if (!rows.length) {
      empty.textContent = state.query ? '找不到符合的書籤。' : '這裡還沒有書籤，按「＋ 新增書籤」開始。';
      return;
    }
    for (const b of rows) grid.append(bookmarkCard(b));
  }

  function bookmarkCard(b) {
    const card = document.createElement('div');
    card.className = 'card';

    const img = document.createElement('img');
    img.className = 'card-icon';
    img.src = faviconOf(b.url);
    img.alt = '';
    img.loading = 'lazy';

    const body = document.createElement('div');
    body.className = 'card-body';

    const link = document.createElement('a');
    link.className = 'card-title';
    link.href = b.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const t = document.createElement('span');
    t.textContent = b.title;
    link.append(t);
    if (b.is_favorite) {
      const star = document.createElement('span');
      star.className = 'fav';
      star.textContent = '★';
      link.append(star);
    }

    const host = document.createElement('div');
    host.className = 'card-host';
    host.textContent = hostOf(b.url);

    body.append(link, host);

    if (b.description) {
      const d = document.createElement('div');
      d.className = 'card-desc';
      d.textContent = b.description;
      body.append(d);
    }

    if (b.tags && b.tags.length) {
      const tw = document.createElement('div');
      tw.className = 'card-tags';
      for (const tag of b.tags) {
        const s = document.createElement('span');
        s.className = 'tag';
        s.textContent = '#' + tag;
        tw.append(s);
      }
      body.append(tw);
    }

    const tools = document.createElement('div');
    tools.className = 'card-tools';

    const favBtn = document.createElement('button');
    favBtn.className = 'icon-btn' + (b.is_favorite ? ' fav' : '');
    favBtn.type = 'button';
    favBtn.title = b.is_favorite ? '取消最愛' : '加入最愛';
    favBtn.textContent = b.is_favorite ? '★' : '☆';
    favBtn.addEventListener('click', () => toggleFavorite(b));

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.type = 'button';
    editBtn.title = '編輯';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', () => openBookmarkDialog(b));

    tools.append(favBtn, editBtn);
    card.append(img, body, tools);
    return card;
  }

  async function toggleFavorite(b) {
    const next = !b.is_favorite;
    const { error } = await sb.from('bookmarks')
      .update({ is_favorite: next, updated_at: new Date().toISOString() })
      .eq('id', b.id);
    if (error) return fail(error);
    b.is_favorite = next;
    renderCategories();
    renderBookmarks();
  }

  // ---------- 類別維護 ----------
  const categoryDialog = $('#categoryDialog');
  const categoryForm = $('#categoryForm');
  let editingCategory = null;

  $('#btnAddCategory').addEventListener('click', () => openCategoryDialog(null));

  function openCategoryDialog(category) {
    editingCategory = category;
    const f = categoryForm;
    $('#categoryDialogTitle').textContent = category ? '編輯類別' : '新增類別';
    f.name.value = category ? category.name : '';
    f.icon.value = category ? (category.icon || '') : '';
    f.color.value = category ? (category.color || '#6366f1') : '#6366f1';
    f.sort_order.value = category ? category.sort_order
      : (state.categories.length ? Math.max(...state.categories.map((c) => c.sort_order)) + 1 : 0);
    f.querySelector('[data-delete]').hidden = !category;
    hideError(f);
    categoryDialog.showModal();
  }

  categoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = categoryForm;
    const payload = {
      name: f.name.value.trim(),
      icon: f.icon.value.trim() || null,
      color: f.color.value,
      sort_order: Number(f.sort_order.value) || 0,
    };
    const q = editingCategory
      ? sb.from('categories').update(payload).eq('id', editingCategory.id)
      : sb.from('categories').insert(payload);
    const { error } = await q;
    if (error) return showError(f, error.message);
    categoryDialog.close();
    toast(editingCategory ? '類別已更新' : '類別已新增');
    await loadAll();
  });

  armDelete(categoryForm, () => {
    const n = countFor(editingCategory.id);
    return n ? `確定刪除？${n} 筆書籤會變成未分類` : '確定刪除？';
  }, async () => {
    const { error } = await sb.from('categories').delete().eq('id', editingCategory.id);
    if (error) return showError(categoryForm, error.message);
    if (state.activeCategory === editingCategory.id) state.activeCategory = 'all';
    categoryDialog.close();
    toast('類別已刪除');
    await loadAll();
  });

  // ---------- 書籤維護 ----------
  const bookmarkDialog = $('#bookmarkDialog');
  const bookmarkForm = $('#bookmarkForm');
  let editingBookmark = null;

  $('#btnAddBookmark').addEventListener('click', () => openBookmarkDialog(null));

  function openBookmarkDialog(bookmark) {
    editingBookmark = bookmark;
    const f = bookmarkForm;
    $('#bookmarkDialogTitle').textContent = bookmark ? '編輯書籤' : '新增書籤';

    // 類別下拉
    const sel = f.category_id;
    sel.textContent = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '（未分類）';
    sel.append(none);
    for (const c of state.categories) {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = (c.icon ? c.icon + ' ' : '') + c.name;
      sel.append(o);
    }

    const defaultCat = typeof state.activeCategory === 'number' ? state.activeCategory : '';
    f.url.value = bookmark ? bookmark.url : '';
    f.title.value = bookmark ? bookmark.title : '';
    f.description.value = bookmark ? (bookmark.description || '') : '';
    sel.value = bookmark ? (bookmark.category_id ?? '') : defaultCat;
    f.sort_order.value = bookmark ? bookmark.sort_order
      : (state.bookmarks.length ? Math.max(...state.bookmarks.map((b) => b.sort_order)) + 1 : 0);
    f.tags.value = bookmark ? (bookmark.tags || []).join(', ') : '';
    f.is_favorite.checked = bookmark ? bookmark.is_favorite : false;
    f.querySelector('[data-delete]').hidden = !bookmark;
    hideError(f);
    bookmarkDialog.showModal();
  }

  bookmarkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = bookmarkForm;
    const payload = {
      url: f.url.value.trim(),
      title: f.title.value.trim(),
      description: f.description.value.trim() || null,
      category_id: f.category_id.value ? Number(f.category_id.value) : null,
      sort_order: Number(f.sort_order.value) || 0,
      tags: f.tags.value.split(',').map((s) => s.trim()).filter(Boolean),
      is_favorite: f.is_favorite.checked,
      updated_at: new Date().toISOString(),
    };
    const q = editingBookmark
      ? sb.from('bookmarks').update(payload).eq('id', editingBookmark.id)
      : sb.from('bookmarks').insert(payload);
    const { error } = await q;
    if (error) return showError(f, error.message);
    bookmarkDialog.close();
    toast(editingBookmark ? '書籤已更新' : '書籤已新增');
    await loadAll();
  });

  armDelete(bookmarkForm, () => '確定刪除？', async () => {
    const { error } = await sb.from('bookmarks').delete().eq('id', editingBookmark.id);
    if (error) return showError(bookmarkForm, error.message);
    bookmarkDialog.close();
    toast('書籤已刪除');
    await loadAll();
  });

  // 網址填好後，若標題還空著就用網域先帶入
  bookmarkForm.url.addEventListener('blur', () => {
    const f = bookmarkForm;
    if (!f.title.value.trim() && f.url.value.trim()) f.title.value = hostOf(f.url.value.trim());
  });

  // ---------- 對話框共用 ----------

  /* 刪除採頁內二次確認：第一次點擊把按鈕換成確認字樣，
     第二次才真的刪除。避免用 confirm() 跳原生對話框。 */
  function armDelete(form, message, run) {
    const btn = form.querySelector('[data-delete]');
    const label = btn.textContent;
    let armed = false;
    let timer;

    const disarm = () => {
      armed = false;
      clearTimeout(timer);
      btn.textContent = label;
      btn.classList.remove('is-armed');
    };
    form.addEventListener('reset', disarm);
    form.closest('dialog').addEventListener('close', disarm);

    btn.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        btn.textContent = message();
        btn.classList.add('is-armed');
        timer = setTimeout(disarm, 5000);   // 沒有第二次點擊就自動還原
        return;
      }
      disarm();
      await run();
    });
  }

  for (const form of [categoryForm, bookmarkForm]) {
    form.querySelector('[data-cancel]').addEventListener('click', () => form.closest('dialog').close());
  }
  function showError(form, msg) {
    const el = form.querySelector('[data-error]');
    el.hidden = false;
    el.textContent = msg;
  }
  function hideError(form) {
    form.querySelector('[data-error]').hidden = true;
  }
})();
