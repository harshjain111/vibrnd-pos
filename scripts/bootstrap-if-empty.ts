// Auto-seed a freshly-migrated DB. Runs in Vercel's build pipeline
// (see package.json vercel-build) between `prisma migrate deploy` and
// `next build`. Idempotent — if the User table already has rows,
// nothing happens; if it's empty, we seed the demo outlet + owner
// login + a handful of CVE benefits + KDS demo KOTs so the app is
// usable the moment the deploy goes live.
//
// Safe to run on every deploy — the "is empty?" check keeps it from
// double-seeding a live production DB.

import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

const db = new PrismaClient();

async function main() {
  const userCount = await db.user.count();
  if (userCount > 0) {
    console.log(`[bootstrap] DB already has ${userCount} user(s) — skipping seed.`);
    await db.$disconnect();
    return;
  }

  console.log("[bootstrap] Empty DB detected — seeding demo outlet + owner login + KDS demo…");

  // Run each seed script in-process by spawning tsx. Keeping them as
  // separate scripts means the same seeds also work with `npm run
  // db:seed` locally without duplication.
  runTsx("prisma/seed.ts");
  runTsx("prisma/seed-auth.ts");

  // KDS demo data is optional but useful for a hosted-preview: the
  // reviewer sees a live board the moment they log in. Guarded so a
  // real production deploy that already ran seed manually doesn't get
  // demo tickets appended.
  const kotCount = await db.kitchenTicket.count();
  if (kotCount === 0) {
    try {
      runTsx("scripts/kds-seed-demo.ts");
    } catch (e) {
      console.warn("[bootstrap] KDS demo seed failed (non-fatal):", (e as Error).message);
    }
  }

  await db.$disconnect();
  console.log("[bootstrap] Done. Owner login: owner@smokzy.com / password123");
}

function runTsx(script: string) {
  console.log(`[bootstrap] running ${script} …`);
  execSync(`npx tsx ${script}`, { stdio: "inherit" });
}

main().catch((e) => {
  console.error("[bootstrap] failed:", e);
  process.exit(1);
});
