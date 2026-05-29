# Deploying Vibrnd POS to Vercel

Step-by-step, end-to-end. Time estimate: **20–30 minutes** the first time.

---

## 0. Prerequisites

- A GitHub account with the `pos` repo pushed up
- A free [Supabase](https://supabase.com) account
- A free [Vercel](https://vercel.com) account

---

## 1. Create a Supabase Postgres project

1. Go to <https://supabase.com/dashboard> → **New project**
2. Pick a name (`vibrnd-pos-prod`), region (closest to your users), and a strong DB password — **save the password somewhere, you'll need it twice**
3. Wait ~2 minutes for the project to provision

When ready, open **Project Settings → Database**, scroll to **Connection String** and copy:

- **URI** (port 5432, "Session" mode) — this becomes `DIRECT_URL`
- Then switch the dropdown to **Transaction** (port 6543) — this becomes `DATABASE_URL` (append `?pgbouncer=true&connection_limit=1`)

Both strings start with `postgresql://postgres.xxx:[YOUR-PASSWORD]@…` — replace `[YOUR-PASSWORD]` with the password you saved.

---

## 2. Push the schema + seed data from your laptop

The app's schema is already configured for Postgres ([`prisma/schema.prisma`](prisma/schema.prisma)). You just need to point it at Supabase and run two commands.

In your local `.env` (next to the app, **not** committed), put:

```env
DATABASE_URL="postgresql://postgres.xxx:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.xxx:PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres"
AUTH_SECRET="$(generate a 64-char hex string — see .env.example)"
```

Then run, from the project root:

```bash
# 1) Create all tables in Supabase
npx prisma db push

# 2) Seed sample data (outlets, items, demo orders, users)
npm run db:seed
```

If both succeed you can open Supabase → **Table Editor** and see the populated tables.

---

## 3. Push the repo to GitHub

```bash
git add -A
git commit -m "feat: postgres + vercel ready"
git push
```

(If the repo isn't on GitHub yet: create an empty repo on github.com, then `git remote add origin git@github.com:USER/REPO.git && git push -u origin main`.)

---

## 4. Import the project on Vercel

1. <https://vercel.com/new> → pick your GitHub repo → **Import**
2. **Framework**: Next.js (auto-detected)
3. **Build & Output Settings**: leave defaults — `postinstall: prisma generate` in `package.json` handles client generation
4. **Environment Variables**: paste in exactly the same three values from your local `.env`:

   | Name             | Value                                                    |
   | ---------------- | -------------------------------------------------------- |
   | `DATABASE_URL`   | the **port 6543** Supabase URL (with `?pgbouncer=true`)  |
   | `DIRECT_URL`     | the **port 5432** Supabase URL                           |
   | `AUTH_SECRET`    | the 64-char hex string                                   |

5. **Deploy**

First build runs ~2–3 min. When the green check appears, click **Visit** — you should see the login screen at `your-app.vercel.app/login`.

Default seed credentials (from `prisma/seed.ts`):

- **owner@vibrnd.com** / **owner123** — OWNER role
- **manager@vibrnd.com** / **manager123** — MANAGER role
- **biller@vibrnd.com** / **biller123** — BILLER role

(Change these immediately in `/settings/users`.)

---

## 5. Hook up a custom domain (optional)

Vercel → Project → **Settings → Domains** → add `pos.yourdomain.com` and update the CNAME at your DNS provider. SSL is automatic.

---

## 6. Subsequent deploys

Just push to `main`:

```bash
git push
```

Vercel auto-builds and rolls out. If you change `prisma/schema.prisma`, you also need to run `npx prisma db push` locally (or set up Prisma migrations) before pushing — Vercel doesn't run migrations against production for you.

---

## Troubleshooting

**"Can't reach database server"** during runtime
→ Your `DATABASE_URL` is missing `?pgbouncer=true&connection_limit=1`. The Supabase Transaction pooler needs that flag for Prisma to work safely under serverless.

**"prepared statement already exists"** errors
→ Same fix: add `?pgbouncer=true&connection_limit=1` to `DATABASE_URL`.

**Migrations fail with "P1001 can't reach"**
→ `DIRECT_URL` is wrong. It must be the **port 5432** ("Session" mode) URL, not the pooler.

**Build succeeds but page shows "no data"**
→ The seed didn't run. Re-run `npm run db:seed` locally (it points at Supabase via your `.env`).

**Module not found for `@prisma/client`**
→ Vercel didn't run `postinstall`. Add `"prisma generate"` to your build command as a workaround.
