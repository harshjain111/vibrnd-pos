// Dev helper — mint a session cookie for a given user email so we can
// skip the /login page in local previews (Next.js server actions are
// awkward to POST via curl).
//
// Usage: DATABASE_URL=... npx tsx scripts/mint-session.ts <email>
import { PrismaClient } from "@prisma/client";
import { createHmac } from "crypto";

async function main() {
  const email = process.argv[2] ?? "owner@smokzy.com";
  const db = new PrismaClient();
  const u = await db.user.findFirst({ where: { email } });
  if (!u) {
    console.error(`user not found: ${email}`);
    process.exit(1);
  }
  const secret = process.env.AUTH_SECRET || "dev-insecure-secret-change-me-please-x9k1";
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `${u.id}.${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  console.log(`${payload}.${sig}`);
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
