import { db } from "./db";

type CreateInput = {
  outletId: string;
  kind: "ONLINE_ORDER" | "LOW_STOCK" | "STALE_BILL" | "INFO";
  title: string;
  body?: string;
  link?: string;
};

export async function createNotification(input: CreateInput) {
  try {
    await db.notification.create({ data: input });
  } catch (err) {
    console.error("[notify] failed:", err);
  }
}
