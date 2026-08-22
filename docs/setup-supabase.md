# Fresh Supabase + Vercel setup

Ten-minute click-path to hook this app up to a new Supabase database
via Vercel's Storage integration, then have the first deploy run
migrations + seed itself so you can log in immediately.

## 1 — Connect Supabase from Vercel (2 min)

1. Open your Vercel project → **Storage** tab
2. **Create Database** → **Supabase** → **Continue**
3. Pick a region (closest to your outlet — for India, `ap-south-1`)
4. Name the database (e.g. `vibrnd-pos-prod`)
5. **Connect** to your project.

Vercel writes six env vars into your project:
`POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`,
`POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`.

## 2 — Add Prisma-shaped aliases (1 min)

Prisma reads `DATABASE_URL` and `DIRECT_URL`. Add these in Vercel:

**Settings → Environment Variables → Add:**

| Name | Value | Environment |
|---|---|---|
| `DATABASE_URL` | copy from `POSTGRES_PRISMA_URL` | Production, Preview, Development |
| `DIRECT_URL` | copy from `POSTGRES_URL_NON_POOLING` | Production, Preview, Development |
| `AUTH_SECRET` | 32+ random chars (`openssl rand -base64 32`) | Production, Preview, Development |

Save.

## 3 — Trigger a deploy (10 s)

Any push to `main` works. If nothing to push:

```bash
git commit --allow-empty -m "chore: deploy to fresh Supabase"
git push origin main
```

## 4 — Watch the build (~2 min)

Vercel's build script now runs:
```
prisma migrate deploy         # applies every migration to the fresh DB
scripts/bootstrap-if-empty.ts # seeds ONLY if User table is empty
next build                    # builds the app
```

The bootstrap script is idempotent — it checks `User.count()` first, so
it never double-seeds a live production DB.

## 5 — Log in (30 s)

Once deployed, open your Vercel URL and log in:

- **Email:** `owner@smokzy.com`
- **Password:** `password123`

You'll land on:
- **Dashboard** — Smokzy demo outlet, ready for real data
- **/kds** — Main / Tandoor / Bar / Dessert boards with 4 demo KOTs
- **/admin/cve** — Wallet & Offers v2 (Cash + Promo split)
- **/wallets** — the virtual wallet list

## Change the owner password immediately

The seed sets `password123` for the demo. In prod, log in as owner then:
- **Settings → Users → Edit yourself → Reset password**

Or, at the terminal (with local `.env.local` pointing at the same DB):
```bash
DATABASE_URL="..." npx tsx prisma/set-password.ts owner@smokzy.com <new-password>
```

## Local dev against the new Supabase

Copy `DATABASE_URL` + `DIRECT_URL` from Vercel to `.env.local` on your
machine. If your ISP blocks port 6543 (Supabase's pooler port —
happens in some networks), fall back to `.local-postgres/` — see the
`L1–L4` tasks in this session's history for the portable-Postgres path.

## What went into the codebase for this

| File | Purpose |
|---|---|
| `scripts/bootstrap-if-empty.ts` | The auto-seed on first deploy |
| `package.json` `vercel-build` | Wires bootstrap between migrate and build |
| `.env.example` | Required-vars reference |
| this file | Setup click-path |
