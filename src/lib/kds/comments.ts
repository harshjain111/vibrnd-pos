// KDS v2 — comment rendering + line-grouping key. Zero I/O.
// Spec §6.
//
// Rules honoured verbatim:
//   6.2 §1  Position fixed immediately below the dish name.
//   6.2 §3  Never truncate — the tile grows.
//   6.2 §4  Multiple comments flow separated by "·" (single line, wraps).
//   6.2 §5  REMOVE renders uppercase + bold: "- NO ONION".
//   6.2 §6  Allergy keywords promote to the red allergy strip.
//   6.2 §7  Same rendering on every view — no compact mode.
//   6.2 §9  Language passes through untouched.
//   6.3     Two lines with different comments never merge.

import { createHash } from "crypto";
import type { Comment } from "./types";

/** Default allergy vocabulary (§24) — outlet setting overrides. */
export const DEFAULT_ALLERGY_KEYWORDS = [
  "allergy",
  "allergic",
  "nut",
  "peanut",
  "gluten",
  "lactose",
  "shellfish",
];

/** Render a single comment as it appears under the dish name (§6.1). */
export function renderComment(c: Comment): string {
  const raw = (c.text ?? "").trim();
  switch (c.type) {
    case "MODIFIER":
      // "Less spicy"
      return raw;
    case "ADDON": {
      // "+ Extra cheese" (with qty if > 1)
      const qty = c.qty && c.qty > 1 ? `${c.qty}× ` : "";
      return `+ ${qty}${raw}`;
    }
    case "REMOVE":
      // Uppercase + bold marker; the UI wraps this in <b>. §6.2 §5.
      return `- NO ${raw.toUpperCase()}`;
    case "NOTE":
      // Free text — untouched. §6.2 §9.
      return raw;
    default:
      return raw;
  }
}

/** Join every comment on a single wrapping line (§6.2 §4). */
export function renderCommentLine(comments: Comment[]): string {
  return comments
    .map(renderComment)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" · ");
}

/** True when any comment contains an allergy keyword — the tile
 *  promotes to the red allergy strip (§6.2 §6). Case-insensitive. */
export function hasAllergyKeyword(
  comments: Comment[],
  keywords: string[] = DEFAULT_ALLERGY_KEYWORDS,
): boolean {
  if (!comments.length || !keywords.length) return false;
  const kw = keywords.map((k) => k.toLowerCase());
  return comments.some((c) => {
    const t = (c.text ?? "").toLowerCase();
    return kw.some((k) => t.includes(k));
  });
}

/** Stable hash of the comment set used to group lines (§6.3). Two lines
 *  merge into one row only when this key + menu_item_id + portion all
 *  match. Order-insensitive so { A,B } and { B,A } group together. */
export function commentKey(comments: Comment[]): string {
  if (!comments.length) return "";
  const canonical = comments
    .map((c) => ({
      type: c.type,
      text: (c.text ?? "").trim(),
      qty: c.qty ?? undefined,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type < b.type ? -1 : 1;
      if (a.text !== b.text) return a.text < b.text ? -1 : 1;
      return (a.qty ?? 0) - (b.qty ?? 0);
    });
  return createHash("sha1").update(JSON.stringify(canonical)).digest("hex").slice(0, 16);
}

/** Parse the comments JSON column safely — bad JSON returns []. */
export function parseComments(json: string | null | undefined): Comment[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter(isValidComment);
  } catch {
    return [];
  }
}

function isValidComment(v: unknown): v is Comment {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    (c.type === "MODIFIER" || c.type === "ADDON" || c.type === "REMOVE" || c.type === "NOTE") &&
    typeof c.text === "string"
  );
}
