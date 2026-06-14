"use client";
/**
 * Curated registry of icon names → Lucide components for menu-item tags.
 *
 * Storing icons as a string in the DB and resolving here keeps the
 * server actions free of React imports and lets us swap a Lucide icon
 * without touching saved data. The string is meaningless if it's not in
 * this map — we fall back to a generic Tag so a deleted icon doesn't
 * crash the POS card.
 */
import {
  Tag,
  Flame,
  Candy,
  ChefHat,
  Star,
  Sparkles,
  Nut,
  Leaf,
  Wheat,
  Heart,
  Snowflake,
  Soup,
  Pizza,
  Cookie,
  Beef,
  Fish,
  Egg,
  IceCream,
  Coffee,
  Wine,
  Milk,
  Carrot,
  Drumstick,
  Salad,
  GlassWater,
  Apple,
  Banana,
  Cherry,
  Grape,
  Sandwich,
  type LucideIcon,
} from "lucide-react";

export const TAG_ICONS: Record<string, LucideIcon> = {
  Tag,
  Flame,
  Candy,
  ChefHat,
  Star,
  Sparkles,
  Nut,
  Leaf,
  Wheat,
  Heart,
  Snowflake,
  Soup,
  Pizza,
  Cookie,
  Beef,
  Fish,
  Egg,
  IceCream,
  Coffee,
  Wine,
  Milk,
  Carrot,
  Drumstick,
  Salad,
  GlassWater,
  Apple,
  Banana,
  Cherry,
  Grape,
  Sandwich,
};

/** Names ordered the same way the picker should display them. */
export const TAG_ICON_NAMES = Object.keys(TAG_ICONS);

/** Resolve a stored icon name to a component, falling back to Tag. */
export function resolveTagIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Tag;
  return TAG_ICONS[name] ?? Tag;
}

/** Tailwind hue tokens supported by the tag color picker. Keep these
 *  hard-coded so Tailwind's JIT picks them up at build time — generating
 *  class names from data breaks purge. */
export const TAG_COLORS = [
  { key: "red", swatch: "bg-red-500", chip: "bg-red-100 text-red-800 border-red-300" },
  { key: "orange", swatch: "bg-orange-500", chip: "bg-orange-100 text-orange-800 border-orange-300" },
  { key: "amber", swatch: "bg-amber-500", chip: "bg-amber-100 text-amber-800 border-amber-300" },
  { key: "emerald", swatch: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { key: "sky", swatch: "bg-sky-500", chip: "bg-sky-100 text-sky-800 border-sky-300" },
  { key: "violet", swatch: "bg-violet-500", chip: "bg-violet-100 text-violet-800 border-violet-300" },
  { key: "pink", swatch: "bg-pink-500", chip: "bg-pink-100 text-pink-800 border-pink-300" },
  { key: "slate", swatch: "bg-slate-500", chip: "bg-slate-100 text-slate-800 border-slate-300" },
] as const;

export type TagColor = (typeof TAG_COLORS)[number]["key"];

export function chipClassForColor(color: string): string {
  return TAG_COLORS.find((c) => c.key === color)?.chip ?? TAG_COLORS[7].chip;
}

export function swatchClassForColor(color: string): string {
  return TAG_COLORS.find((c) => c.key === color)?.swatch ?? TAG_COLORS[7].swatch;
}
