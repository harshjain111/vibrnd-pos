import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

(async () => {
  const line = await db.kitchenTicketLine.findFirst({
    where: { status: "NEW", name: { contains: "Chicken Tikka" } },
    orderBy: { updatedAt: "asc" },
  });
  if (!line) {
    console.log("nothing to update");
    process.exit(0);
  }
  const twoMinAgo = new Date(Date.now() - 120_000);
  await db.kitchenTicketLine.update({
    where: { id: line.id },
    data: { status: "PREPARING", startedAt: twoMinAgo },
  });
  console.log(`Advanced "${line.name}" to PREPARING (2 min ago)`);
  await db.$disconnect();
})();
