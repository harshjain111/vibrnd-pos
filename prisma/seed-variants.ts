import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const items = await db.item.findMany();
  const byName = new Map(items.map((i) => [i.name, i]));

  // Variants — biryani gets Half/Full, naan gets Plain/Butter, paneer tikka gets Half/Full
  const variantData = [
    { name: "Veg Biryani", variants: [{ name: "Half", price: 180 }, { name: "Full", price: 260 }] },
    { name: "Chicken Biryani", variants: [{ name: "Half", price: 220 }, { name: "Full", price: 320 }] },
    { name: "Butter Naan", variants: [{ name: "Plain", price: 50 }, { name: "Butter", price: 60 }] },
    { name: "Paneer Tikka", variants: [{ name: "Half", price: 180 }, { name: "Full", price: 280 }] },
  ];

  // Addons — biryani/curry items get options
  const addonData = [
    {
      name: "Butter Chicken",
      addons: [
        { name: "Extra gravy", priceDelta: 40 },
        { name: "Less spicy", priceDelta: 0 },
        { name: "Boneless", priceDelta: 30 },
      ],
    },
    {
      name: "Veg Biryani",
      addons: [
        { name: "Extra raita", priceDelta: 20 },
        { name: "Less spicy", priceDelta: 0 },
        { name: "No onion", priceDelta: 0 },
      ],
    },
    {
      name: "Chicken Biryani",
      addons: [
        { name: "Extra raita", priceDelta: 20 },
        { name: "Less spicy", priceDelta: 0 },
        { name: "Boneless", priceDelta: 30 },
      ],
    },
    {
      name: "Paneer Butter Masala",
      addons: [
        { name: "Extra gravy", priceDelta: 30 },
        { name: "Less butter", priceDelta: 0 },
      ],
    },
  ];

  for (const v of variantData) {
    const item = byName.get(v.name);
    if (!item) continue;
    await db.itemVariant.deleteMany({ where: { itemId: item.id } });
    for (let i = 0; i < v.variants.length; i++) {
      await db.itemVariant.create({
        data: { itemId: item.id, name: v.variants[i].name, price: v.variants[i].price, rank: i },
      });
    }
  }

  for (const a of addonData) {
    const item = byName.get(a.name);
    if (!item) continue;
    await db.addon.deleteMany({ where: { itemId: item.id } });
    for (let i = 0; i < a.addons.length; i++) {
      await db.addon.create({
        data: { itemId: item.id, name: a.addons[i].name, priceDelta: a.addons[i].priceDelta, rank: i },
      });
    }
  }

  console.log(`Seeded variants for ${variantData.length} items, addons for ${addonData.length} items.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
