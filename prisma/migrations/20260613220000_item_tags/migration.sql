-- Per-outlet menu-item tags + assignments.
-- Tags drive both the iconography on POS cards (Spicy / Sweet / Chef
-- Special / Contains Nuts / etc) and the tag filter row above the item
-- grid. The icon column stores a Lucide icon name that the client
-- resolves through a curated registry — we never render arbitrary HTML.

CREATE TABLE "ItemTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Tag',
    "color" TEXT NOT NULL DEFAULT 'slate',
    "rank" INTEGER NOT NULL DEFAULT 0,
    "outletId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemTag_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ItemTag_outletId_fkey"
        FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ItemTag_outletId_name_key" ON "ItemTag"("outletId", "name");

CREATE TABLE "ItemTagAssign" (
    "itemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ItemTagAssign_pkey" PRIMARY KEY ("itemId", "tagId"),
    CONSTRAINT "ItemTagAssign_itemId_fkey"
        FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItemTagAssign_tagId_fkey"
        FOREIGN KEY ("tagId") REFERENCES "ItemTag"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ItemTagAssign_tagId_idx" ON "ItemTagAssign"("tagId");

-- Seed the standard tag library for every existing outlet so the menu
-- editor + POS filter row light up immediately. New outlets get the
-- same set through the seedDefaultTags helper in actions.ts.
DO $$
DECLARE
    o RECORD;
BEGIN
    FOR o IN SELECT "id" FROM "Outlet" LOOP
        INSERT INTO "ItemTag" ("id", "name", "icon", "color", "rank", "outletId") VALUES
            (gen_random_uuid()::text, 'Spicy',         'Flame',     'red',     0,  o."id"),
            (gen_random_uuid()::text, 'Sweet',         'Candy',     'pink',    10, o."id"),
            (gen_random_uuid()::text, 'Chef Special',  'ChefHat',   'amber',   20, o."id"),
            (gen_random_uuid()::text, 'Bestseller',    'Star',      'orange',  30, o."id"),
            (gen_random_uuid()::text, 'New',           'Sparkles',  'violet',  40, o."id"),
            (gen_random_uuid()::text, 'Contains Nuts', 'Nut',       'amber',   50, o."id"),
            (gen_random_uuid()::text, 'Vegan',         'Leaf',      'emerald', 60, o."id"),
            (gen_random_uuid()::text, 'Gluten Free',   'Wheat',     'sky',     70, o."id"),
            (gen_random_uuid()::text, 'Healthy',       'Heart',     'emerald', 80, o."id"),
            (gen_random_uuid()::text, 'Cold',          'Snowflake', 'sky',     90, o."id")
        ON CONFLICT ("outletId", "name") DO NOTHING;
    END LOOP;
END $$;
