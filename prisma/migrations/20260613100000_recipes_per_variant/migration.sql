-- Recipes per (item, variant) — wipe and rebuild per user direction.
-- Existing single-recipe-per-item rows are dropped; managers configure
-- variant-specific recipes via the new editor popup.
DELETE FROM "RecipeIngredient";
DELETE FROM "Recipe";

-- DropIndex
DROP INDEX "Recipe_itemId_key";

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "itemVariantId" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "RecipeIngredient" ADD COLUMN     "addonId" TEXT;

-- CreateIndex
CREATE INDEX "Recipe_itemVariantId_idx" ON "Recipe"("itemVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_itemId_itemVariantId_key" ON "Recipe"("itemId", "itemVariantId");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_addonId_idx" ON "RecipeIngredient"("recipeId", "addonId");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_itemVariantId_fkey" FOREIGN KEY ("itemVariantId") REFERENCES "ItemVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "Addon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
