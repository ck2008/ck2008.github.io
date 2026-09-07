# 個人工作台 (ck2008.github.io)

以 GitHub Pages 託管的個人工作台。第一頁為**書籤**，資料存放於 Supabase 專案 `ckdb`。

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 頁面結構（登入畫面、書籤主畫面、兩個維護對話框） |
| `assets/app.js` | 認證、Supabase 讀寫、類別與書籤的 CRUD |
| `assets/style.css` | 版面與淺色/深色主題 |
| `config.js` | Supabase URL 與 anon key |

## Supabase (`ckdb`)

專案 ref：`skubqoeizqgbixaaxfeq`

### 資料表

```sql
create table public.categories (
  id         bigint generated always as identity primary key,
  name       text not null,
  icon       text,                       -- emoji
  color      text default '#6366f1',
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

create table public.bookmarks (
  id          bigint generated always as identity primary key,
  category_id bigint references public.categories(id) on delete set null,
  title       text not null,
  url         text not null,
  description text,
  tags        text[] default '{}',
  is_favorite boolean not null default false,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

### 存取控制

兩張表都已啟用 RLS，且只有擁有者本人（GitHub 登入的 `ck2008@gmail.com`）可以讀寫：

```sql
create function public.is_owner() returns boolean language sql stable as $$
  select auth.uid() = '324e4d01-8558-448e-9f4a-b0c4a5972089'::uuid
$$;

create policy cat_owner_all on public.categories
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy bm_owner_all on public.bookmarks
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
```

anon key 雖然公開在前端，但沒有通過上述 policy 的請求一律讀不到任何資料。

### Auth

- Provider：GitHub（已於 Supabase 後台設定）
- Redirect URLs 需包含 `https://ck2008.github.io/`

## 本機開發

因為用到 OAuth 轉址，請用 HTTP 伺服器開啟（不要直接 `file://`）：

```bash
python -m http.server 5173
```

並在 Supabase → Authentication → URL Configuration 加入 `http://localhost:5173/`。

## 部署

推上 `main` 後 GitHub Pages 會自動建置（約 1 分鐘）。

`index.html` 引用資產時帶了版本參數（`assets/app.js?v=3`）。GitHub Pages 對靜態檔的
`Cache-Control` 是 `max-age=600`，改了 JS/CSS 若不換版本號，瀏覽器會有最多 10 分鐘
拿到舊檔。**每次改動 `assets/` 或 `config.js` 時請一併把 `?v=` 加一。**
