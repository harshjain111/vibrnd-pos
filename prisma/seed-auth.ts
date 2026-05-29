import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("password123", 10);
  const user = await db.user.update({
    where: { email: "owner@smokzy.com" },
    data: { passwordHash: hash },
  });
  console.log(`Set password for ${user.email}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
