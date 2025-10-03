# TSG Tennis PWA — Vercel Static Deploy

**What you get here**
- Pure static PWA (no server-side build), works online & offline.
- Login-first flow (Supabase) gates access to the app UI.
- Service Worker registered at the site root (`/sw.js`) for full-scope caching.
- No Tailwind; design/styles are untouched in `styles/style.css`.

## 1) Configure Supabase
1. Create a new Supabase project.
2. Run the SQL in `db/setup.sql` (or `db/setup_minimal.sql`) to create the `profiles` table, trigger, and RPC:
   - `public.handle_new_user()` trigger on `auth.users`.
   - `public.get_my_role()` RPC returning `player|coach|admin`.
3. In **Authentication → Providers**, ensure **Email** is enabled.
4. In **Project Settings → API**, copy your **Project URL** and **anon public key**.

## 2) Set env.js
Copy `env.example.js` to `env.js` and fill in:
```js
window.SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR_PUBLIC_ANON_KEY";
```

## 3) Deploy on Vercel (Free)
- New Project → Framework Preset: **Other**.
- **Root Directory**: this folder (where `index.html` lives).
- **Build Command**: _none_ (leave empty).
- **Output Directory**: _none_ (root).
- Deploy.

> Tip: If you keep the repo as-is, Vercel will serve `index.html` and the PWA will installable out-of-the-box.

## 4) Common Pitfalls
- **404/500 on load**: Ensure you deployed the folder containing `index.html` (not the parent folder). Set Root Directory in Vercel if needed.
- **Login page loops**: Check `env.js` is present and valid, and run the SQL so `get_my_role()` exists.
- **Service Worker not updating**: Vercel may cache aggressively; we set `Cache-Control: no-store` for `/sw.js` in `vercel.json`.

---

### Minimal SQL (drop-in)

Use `db/setup_minimal.sql` for a clean, idempotent role setup.
