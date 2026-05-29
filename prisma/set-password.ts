/**
 * One-off script: set the demo users' password to `password123` so the login
 * page's demo credentials actually work. The seed script forgot to hash a
 * password when upserting users.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("password123", 10);
  const users = await db.user.findMany({ select: { email: true } });
  for (const u of users) {
    await db.user.update({
      where: { email: u.email },
      data: { passwordHash: hash },
    });
    console.log(`✓ password set for ${u.email}`);
  }
  console.log(`\nDone. ${users.length} user(s) updated. Try logging in with password123.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
