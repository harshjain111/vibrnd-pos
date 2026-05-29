import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // Map known items to a sensible station
  const map: Record<string, string> = {
    "Butter Naan": "TANDOOR",
    "Garlic Naan": "TANDOOR",
    "Tandoori Roti": "TANDOOR",
    "Paneer Tikka": "TANDOOR",
    "Chicken 65": "TANDOOR",
    "Masala Chai": "BAR",
    "Fresh Lime Soda": "BAR",
    "Cold Coffee": "BAR",
    "Gulab Jamun": "DESSERT",
    "Ras Malai": "DESSERT",
  };
  for (const [name, station] of Object.entries(map)) {
    await db.item.updateMany({ where: { name }, data: { station } });
  }
  console.log(`Updated stations on ${Object.keys(map).length} items.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
