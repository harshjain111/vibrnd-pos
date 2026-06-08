import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const [o, c, fa, aa, e, fb, t, gc, m] = await Promise.all([
    db.order.count(),
    db.customer.count(),
    db.fixedAsset.count(),
    db.assetAudit.count(),
    db.expense.count(),
    db.feedback.count(),
    db.task.count(),
    db.giftCard.count(),
    db.membership.count(),
  ]);
  console.log({ orders: o, customers: c, fixedAssets: fa, assetAudits: aa, expenses: e, feedback: fb, tasks: t, giftCards: gc, memberships: m });
  await db.$disconnect();
})();
