# 個人工作台 (ck2008.github.io)

以 GitHub Pages 託管的個人工作台。第一頁為**書籤**，資料存放於 Supabase 專案 `ckdb`。

## 檔案

| 檔案 | 用途 |
| --- | --- |
| `index.html` | 頁面結構（登入畫面、書籤主畫面、兩個維護對話框） |
| `assets/app.js` | 認證、Supabase 讀寫、類別與書籤的 CRUD |
| `assets/style.css` | 版面與淺色/深色主題 |
| `config.js` | Supabase URL 與 anon key |

## 使用

- 上方功能列和左側類別欄**預設都是收起來的**，畫面只留內容。
  滑到畫面上緣，功能列會滑下來；滑到左緣或左上角的 ☰，類別欄會浮出來，移開後自動收回。
  兩邊各有一個 📌 可以釘住，釘住後就固定佔版面、內容讓位。釘選狀態記在 localStorage。
  觸控裝置沒有 hover，改成點一下上緣／左緣的觸發區來開關。
- 左側是類別，含「全部書籤」「最愛」，以及有未歸類書籤時才出現的「未分類」。
  拖曳書籤時把游標帶到左緣，類別欄一樣會浮出來讓你放。
- **拖曳搬移**：把書籤卡片拖到左側任一類別即可改歸屬；拖到「最愛」是加入最愛，
  拖到「未分類」是清掉類別。「全部書籤」不是實際歸屬，不接受放置。
  用的是 HTML5 drag and drop，觸控裝置沒有這個行為，請改用卡片上的 ✎ 編輯。
- 「全部書籤」和「最愛」會照類別順序分段顯示，每個類別自成一段並換行；
  點進單一類別則是單純的一格清單。段內順序仍照右上角的排序選單。
- 搜尋列右邊的「🖼 圖示」可切換卡片上的網站圖示，**預設關閉**，狀態記在 localStorage。
  關閉時連 `<img>` 都不會建立，所以不會對 Google 的 favicon 服務發出任何請求。
- 卡片右上角 ✎ 可編輯或刪除；類別列 hover 後的 ✎ 可編輯或刪除類別。
- 刪除是兩段式：第一次點「刪除」會變成「確定刪除？」，再點一次才真的刪。

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

`index.html` 引用資產時帶了版本參數（`assets/app.js?v=11`）。GitHub Pages 對靜態檔的
`Cache-Control` 是 `max-age=600`，改了 JS/CSS 若不換版本號，瀏覽器會有最多 10 分鐘
拿到舊檔。**每次改動 `assets/` 或 `config.js` 時請一併把 `?v=` 加一。**
