import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const r = await db.expense.updateMany({
    where: { status: "PENDING_MANAGER" },
    data: { status: "APPROVED" },
  });
  console.log(`Backfilled ${r.count} expenses to APPROVED.`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
