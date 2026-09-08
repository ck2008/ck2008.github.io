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
    showIcons: false,        // 網站圖示預設不顯示
    cardStyle: 'classic',
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

  /* ---------- 側邊選單 ----------
     兩種狀態：釘選＝固定佔一欄；未釘選＝收起來，滑過左緣或 ☰ 才浮出。
     預設未釘選。 */
  const btnMenu = $('#btnMenu');
  const btnPin = $('#btnPin');
  const sidebarEl = $('#sidebar');
  const edgeTrigger = $('#edgeTrigger');
  let pinned = false;
  let peekTimer;

  function setPeek(on) {
    app.classList.toggle('is-peek', on && !pinned);
    btnMenu.setAttribute('aria-expanded', String(pinned || on));
  }

  function applyPinned(on) {
    pinned = on;
    app.classList.toggle('is-pinned', on);
    btnPin.classList.toggle('is-on', on);
    btnPin.setAttribute('aria-pressed', String(on));
    btnPin.title = on ? '取消釘選，改成滑過才顯示' : '釘選側欄';
    btnMenu.title = on ? '取消釘選側欄' : '顯示類別（滑過左緣也會出現）';
    if (on) app.classList.remove('is-peek');
    btnMenu.setAttribute('aria-expanded', String(on));
    try { localStorage.setItem('wb-sidebar-pinned', on ? 'yes' : 'no'); } catch {}
  }

  try { pinned = localStorage.getItem('wb-sidebar-pinned') === 'yes'; } catch {}
  applyPinned(pinned);

  btnPin.addEventListener('click', () => applyPinned(!pinned));
  // 觸控裝置沒有 hover，所以 ☰ 也要能直接開關
  btnMenu.addEventListener('click', () => {
    if (pinned) applyPinned(false);
    else setPeek(!app.classList.contains('is-peek'));
  });

  /* ---------- 上方功能列 ----------
     跟側欄同一套：釘選＝固定在最上面；未釘選＝收起來，滑到畫面上緣才滑下來。 */
  const btnTopPin = $('#btnTopPin');
  const topTrigger = $('#topTrigger');
  let topPinned = false;
  let topTimer;

  function setTopPeek(on) {
    app.classList.toggle('is-topbar-peek', on && !topPinned);
  }

  function applyTopPinned(on) {
    topPinned = on;
    app.classList.toggle('is-topbar-pinned', on);
    btnTopPin.classList.toggle('is-on', on);
    btnTopPin.setAttribute('aria-pressed', String(on));
    btnTopPin.title = on ? '取消釘選，改成滑到上緣才顯示' : '釘選功能列';
    if (on) app.classList.remove('is-topbar-peek');
    try { localStorage.setItem('wb-topbar-pinned', on ? 'yes' : 'no'); } catch {}
  }

  try { topPinned = localStorage.getItem('wb-topbar-pinned') === 'yes'; } catch {}
  applyTopPinned(topPinned);
  btnTopPin.addEventListener('click', () => applyTopPinned(!topPinned));

  /* 用單一的游標位置判定，不要對觸發區掛 mouseleave：
     面板一浮出來就蓋住了觸發區，會馬上收到 mouseleave 而自動收回。
     開啟後把感應區擴大到面板本身的大小，游標移進去才不會被判定成離開。 */
  const TOPBAR = 56, EDGE = 14, PANEL = 240;
  document.addEventListener('mousemove', (e) => {
    if (!topPinned) {
      const open = app.classList.contains('is-topbar-peek');
      if (e.clientY < (open ? TOPBAR : EDGE)) {
        clearTimeout(topTimer);
        setTopPeek(true);
      } else if (open) {
        clearTimeout(topTimer);
        topTimer = setTimeout(() => setTopPeek(false), 200);
      }
    }

    if (!pinned) {
      const open = app.classList.contains('is-peek');
      // 功能列收起來時側欄的頂端就在 0，感應區要跟著往上延伸
      const top = topPinned ? TOPBAR : 0;
      const inZone = e.clientY > top && e.clientX < (open ? PANEL : EDGE);
      if (inZone || btnMenu.contains(e.target)) {
        clearTimeout(peekTimer);
        setPeek(true);
      } else if (open) {
        clearTimeout(peekTimer);
        peekTimer = setTimeout(() => setPeek(false), 200);
      }
    }
  });

  // 觸控裝置沒有 hover，點一下觸發區就當作開關
  topTrigger.addEventListener('click', () => {
    if (!topPinned) setTopPeek(!app.classList.contains('is-topbar-peek'));
  });
  edgeTrigger.addEventListener('click', () => {
    if (!pinned) setPeek(!app.classList.contains('is-peek'));
  });

  // 拖曳中不會有 mousemove，要靠 dragenter 才能把書籤拖到收起來的側欄
  for (const el of [btnMenu, sidebarEl, edgeTrigger]) {
    el.addEventListener('dragenter', () => { clearTimeout(peekTimer); setPeek(true); });
  }

  // 拖曳結束後把浮出的側欄收回去，除非滑鼠還停在上面
  document.addEventListener('dragend', () => {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      if (!sidebarEl.matches(':hover')) setPeek(false);
    }, 500);
  });

  // ---------- 網站圖示開關 ----------
  const iconToggle = $('#iconToggle');
  function applyIcons(on) {
    state.showIcons = on;
    iconToggle.classList.toggle('is-on', on);
    iconToggle.setAttribute('aria-pressed', String(on));
    iconToggle.title = on ? '隱藏網站圖示' : '顯示網站圖示';
    try { localStorage.setItem('wb-icons', on ? 'on' : 'off'); } catch {}
  }
  let iconsOn = false;
  try { iconsOn = localStorage.getItem('wb-icons') === 'on'; } catch {}
  applyIcons(iconsOn);
  iconToggle.addEventListener('click', () => {
    applyIcons(!state.showIcons);
    renderBookmarks();
  });

  // ---------- 卡片風格 ----------
  const cardStyleSelect = $('#cardStyle');
  const CARD_STYLES = ['classic', 'blue', 'cyan', 'mint', 'sunset'];
  function applyCardStyle(style) {
    const selected = CARD_STYLES.includes(style) ? style : 'classic';
    state.cardStyle = selected;
    cardStyleSelect.value = selected;
    $('#grid').classList.remove(...CARD_STYLES.map((name) => `card-style-${name}`));
    $('#grid').classList.add(`card-style-${selected}`);
    try { localStorage.setItem('wb-card-style', selected); } catch {}
  }
  let savedCardStyle = 'classic';
  try { savedCardStyle = localStorage.getItem('wb-card-style') || 'classic'; } catch {}
  // 已使用舊版「Google 膠囊」的裝置，升級後繼續套用新版淡藍白字。
  if (savedCardStyle === 'google') savedCardStyle = 'blue';
  applyCardStyle(savedCardStyle);
  cardStyleSelect.addEventListener('change', () => applyCardStyle(cardStyleSelect.value));

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

    // 拖曳目標：把書籤卡片拖到這一列就換類別。「全部書籤」不是實際歸屬，不收。
    if (key !== 'all') {
      btn.addEventListener('dragenter', (e) => {
        if (!isOurDrag(e)) return;
        e.preventDefault();
        btn.classList.add('is-drop');
      });
      btn.addEventListener('dragover', (e) => {
        if (!isOurDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      // dragleave 也會在移到子元素時觸發，所以要確認真的離開整列
      btn.addEventListener('dragleave', (e) => {
        if (!btn.contains(e.relatedTarget)) btn.classList.remove('is-drop');
      });
      btn.addEventListener('drop', async (e) => {
        if (!isOurDrag(e)) return;
        e.preventDefault();
        btn.classList.remove('is-drop');
        await moveBookmark(Number(e.dataTransfer.getData(DRAG_TYPE)), key, name);
      });
    }

    li.append(btn);
    return li;
  }

  // ---------- 拖曳搬移 ----------
  const DRAG_TYPE = 'application/x-workbench-bookmark';

  /* dragover 期間拿不到 getData()，只能靠 types 判斷這是不是自家的拖曳，
     免得把從桌面拖進來的檔案也當成書籤。 */
  const isOurDrag = (e) => e.dataTransfer.types.includes(DRAG_TYPE);

  // 目前畫著插入線的卡片。只會有一張，換位置前先擦掉舊的。
  let dropMark = null;
  function setDropMark(card, after) {
    if (dropMark && dropMark !== card) dropMark.classList.remove('is-drop-before', 'is-drop-after');
    dropMark = card;
    if (!card) return;
    card.classList.toggle('is-drop-before', !after);
    card.classList.toggle('is-drop-after', after);
  }
  function clearDropMark() { setDropMark(null); }

  async function moveBookmark(id, key, targetName) {
    const b = state.bookmarks.find((x) => x.id === id);
    if (!b) return;

    let patch;
    if (key === 'fav') {
      if (b.is_favorite) return;
      patch = { is_favorite: true };
    } else if (key === 'none') {
      if (!b.category_id) return;
      patch = { category_id: null };
    } else {
      if (b.category_id === key) return;
      patch = { category_id: key };
    }
    patch.updated_at = new Date().toISOString();

    const { error } = await sb.from('bookmarks').update(patch).eq('id', id);
    if (error) return fail(error);

    Object.assign(b, patch);
    renderCategories();
    renderBookmarks();
    toast(`「${b.title}」已移到「${targetName}」`);
  }

  /* 拖曳排序。sort_order 是全域欄位，只改動到的那幾筆會讓不同段之間撞號，
     所以整份清單一起重編號 0..n-1，再只寫回真的變了的那幾筆。
     categoryId 傳 undefined 代表這一格不代表任何類別（最愛、熱門），不動歸屬。 */
  async function reorderBookmark(id, refId, after, categoryId) {
    const b = state.bookmarks.find((x) => x.id === id);
    if (!b) return;

    const list = [...state.bookmarks].sort((x, y) => (x.sort_order - y.sort_order) || (x.id - y.id));
    list.splice(list.indexOf(b), 1);
    let at = list.findIndex((x) => x.id === refId);
    if (at < 0) at = list.length; else if (after) at += 1;
    list.splice(at, 0, b);

    const catChanged = categoryId !== undefined && (b.category_id ?? null) !== (categoryId ?? null);
    const plan = [];
    list.forEach((row, i) => { if (row.sort_order !== i) plan.push({ row, sort_order: i }); });
    if (catChanged && !plan.some((p) => p.row === b)) plan.push({ row: b, sort_order: b.sort_order });
    if (!plan.length) return;

    const now = new Date().toISOString();
    const results = await Promise.all(plan.map((p) => {
      const patch = { sort_order: p.sort_order, updated_at: now };
      if (catChanged && p.row === b) patch.category_id = categoryId;
      return sb.from('bookmarks').update(patch).eq('id', p.row.id);
    }));
    const bad = results.find((r) => r.error);
    if (bad) return fail(bad.error);

    for (const p of plan) p.row.sort_order = p.sort_order;
    if (catChanged) b.category_id = categoryId;
    renderCategories();
    renderBookmarks();
    if (catChanged) {
      const target = state.categories.find((c) => c.id === categoryId);
      toast(`「${b.title}」已移到「${target ? target.name : '未分類'}」`);
    }
  }

  // 找出離游標最近的卡片，以及要插在它的左邊還右邊
  function dropTarget(grid, x, y) {
    let best = null;
    let bestD = Infinity;
    for (const c of grid.querySelectorAll('.card:not(.is-dragging)')) {
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // 直向距離加權，游標在哪一列就先咬那一列
      const d = Math.hypot(x - cx, (y - cy) * 1.8);
      if (d < bestD) { bestD = d; best = { card: c, after: x > cx }; }
    }
    return best;
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

  /* 只有「自訂順序」下拖曳才有意義；照標題或加入時間排的時候，
     把卡片放到別的位置畫面也不會照做。 */
  const canReorder = () => state.sortBy === 'sort';
  // 這一格代表哪個類別（拖進來就換歸屬）。最愛是跨類別的集合，不代表任何一個。
  const groupIdOf = (key) => (key === 'none' ? null : (key === 'fav' ? undefined : key));

  function renderBookmarks() {
    const host = $('#grid');
    const empty = $('#empty');
    host.textContent = '';

    const titles = { all: '全部書籤', fav: '最愛', none: '未分類' };
    const cat = state.categories.find((c) => c.id === state.activeCategory);
    $('#viewTitle').textContent = titles[state.activeCategory] || (cat ? cat.name : '書籤');

    const rows = visibleBookmarks();
    empty.hidden = rows.length > 0;
    if (!rows.length) {
      empty.textContent = state.query ? '找不到符合的書籤。' : '這裡還沒有書籤，按「＋ 新增書籤」開始。';
      return;
    }

    // 單一類別的檢視裡每筆歸屬都一樣，不用再分段
    if (state.activeCategory !== 'all' && state.activeCategory !== 'fav') {
      host.append(bookmarkGrid(rows, { reorder: canReorder(), categoryId: groupIdOf(state.activeCategory) }));
      return;
    }

    if (state.activeCategory === 'all') host.append(hotSection());

    // 跨類別的檢視：照類別順序分段，未分類擺最後，每段自成一列
    const groups = [...state.categories, { id: null, name: '未分類', icon: '📭' }];
    for (const g of groups) {
      const part = rows.filter((b) => (b.category_id ?? null) === g.id);
      if (!part.length) continue;
      host.append(bookmarkGroup(g, part));
    }
  }

  const HOT_LIMIT = 12;

  function hotRows() {
    return state.bookmarks
      .filter((b) => (b.click_count || 0) > 0)
      .sort((a, b) => (b.click_count - a.click_count) || (a.id - b.id))
      .slice(0, HOT_LIMIT);
  }

  /* 熱門書籤放在「全部書籤」標題正下方。搜尋中就不顯示 —— 那時候你要找的是
     特定一筆，固定的排行榜只會擋路。還沒有人被點過也不顯示，避免一整排 0。 */
  function hotSection() {
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.id = 'hotSection';
    sec.style.setProperty('--group-color', '#f59e0b');
    if (state.query) return sec;

    const rows = hotRows();
    if (!rows.length) return sec;

    const h = document.createElement('h3');
    h.className = 'group-title';
    const ico = document.createElement('span');
    ico.textContent = '🔥';
    const nm = document.createElement('span');
    nm.textContent = `熱門書籤 前 ${HOT_LIMIT} 名`;
    const cnt = document.createElement('span');
    cnt.className = 'group-count';
    cnt.textContent = rows.length;
    h.append(ico, nm, cnt);

    sec.append(h, bookmarkGrid(rows, { showCount: true, ranked: true }));
    return sec;
  }

  // 點擊後只換掉熱門那一段，不用整頁重畫
  function renderHot() {
    const old = document.getElementById('hotSection');
    if (old) old.replaceWith(hotSection());
  }

  function bookmarkGrid(rows, opts) {
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const b of rows) grid.append(bookmarkCard(b, opts));
    if (opts && opts.reorder) makeSortable(grid, opts.categoryId);
    return grid;
  }

  function makeSortable(grid, categoryId) {
    grid.addEventListener('dragover', (e) => {
      if (!isOurDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const t = dropTarget(grid, e.clientX, e.clientY);
      if (t) setDropMark(t.card, t.after);
    });
    grid.addEventListener('dragleave', (e) => {
      if (!grid.contains(e.relatedTarget)) clearDropMark();
    });
    grid.addEventListener('drop', async (e) => {
      if (!isOurDrag(e)) return;
      e.preventDefault();
      const t = dropTarget(grid, e.clientX, e.clientY);
      clearDropMark();
      if (!t) return;
      await reorderBookmark(Number(e.dataTransfer.getData(DRAG_TYPE)),
        Number(t.card.dataset.id), t.after, categoryId);
    });
  }

  function bookmarkGroup(category, rows) {
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.style.setProperty('--group-color', category.color || 'var(--brand)');

    const h = document.createElement('h3');
    h.className = 'group-title';
    const ico = document.createElement('span');
    ico.textContent = category.icon || '📁';   // 與側欄用同一個預設圖示
    h.append(ico);
    const nm = document.createElement('span');
    nm.textContent = category.name;
    const cnt = document.createElement('span');
    cnt.className = 'group-count';
    cnt.textContent = rows.length;
    h.append(nm, cnt);

    sec.append(h, bookmarkGrid(rows, { reorder: canReorder(), categoryId: category.id }));
    return sec;
  }

  function bookmarkCard(b, opts) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = b.id;
    card.draggable = true;
    card.title = (opts && opts.reorder) ? '可拖曳調整順序，或拖到左側類別上搬移'
      : (opts && opts.ranked) ? '熱門依點擊次數排名，可拖到左側類別上搬移'
      : '可拖到左側類別上搬移（切換成「自訂順序」才能調整位置）';
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData(DRAG_TYPE, String(b.id));
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      clearDropMark();
    });

    // 關掉時連 img 都不建，省下每張卡片對 Google favicon 服務的請求
    let img = null;
    if (state.showIcons) {
      img = document.createElement('img');
      img.className = 'card-icon';
      img.src = faviconOf(b.url);
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;   // 圖片預設可拖，會蓋掉卡片的拖曳
    }

    const body = document.createElement('div');
    body.className = 'card-body';

    const link = document.createElement('a');
    link.className = 'card-title';
    link.href = b.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.draggable = false;  // 連結預設可拖，會變成拖網址而不是拖卡片
    link.addEventListener('click', () => bumpClick(b));
    link.addEventListener('auxclick', (e) => { if (e.button === 1) bumpClick(b); });  // 中鍵開新分頁
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

    if (opts && opts.showCount) {
      const hits = document.createElement('span');
      hits.className = 'card-hits';
      hits.textContent = `${b.click_count} 次`;
      host.append(' · ', hits);
    }

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
    if (img) card.append(img);
    card.append(body, tools);
    return card;
  }

  /* 點擊計數。用 RPC 讓資料庫自己做 +1，避免先讀再寫可能算漏。
     連結是 target=_blank，本頁不會離開，所以請求送得出去。 */
  async function bumpClick(b) {
    b.click_count = (b.click_count || 0) + 1;
    renderHot();
    const { error } = await sb.rpc('bump_bookmark_click', { p_id: b.id });
    if (error) console.error(error);
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
    const n = editingCategory ? countFor(editingCategory.id) : 0;
    return n ? `確定刪除？${n} 筆書籤會變成未分類` : '確定刪除？';
  }, async () => {
    if (!editingCategory) return;
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
    if (!editingBookmark) return;
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

    const disarm = () => {
      armed = false;
      btn.textContent = label;
      btn.classList.remove('is-armed');
    };
    // 對話框是 modal，關掉就重置，不需要另外設定超時
    form.closest('dialog').addEventListener('close', disarm);

    btn.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        btn.textContent = message();
        btn.classList.add('is-armed');
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
