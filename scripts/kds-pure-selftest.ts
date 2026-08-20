// KDS v2 — pure logic self-test. Locks in the spec's rules.
// Run: `npx tsx scripts/kds-pure-selftest.ts`

import { buildBoard } from "@/lib/kds/board";
import {
  commentKey,
  hasAllergyKeyword,
  parseComments,
  renderComment,
  renderCommentLine,
} from "@/lib/kds/comments";
import { canTransition, nextTapStatus } from "@/lib/kds/state-machine";
import {
  bandFor,
  elapsedSeconds,
  formatCookingTimer,
  formatTicketTimer,
  ticketTargetSeconds,
} from "@/lib/kds/timer";
import type { KotSnapshot, KotItemSnapshot } from "@/lib/kds/types";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? " → " + JSON.stringify(detail) : ""}`);
  }
}

// ─── comments ────────────────────────────────────────────────────────
console.log("\n[comments — spec §6]");
check(
  "MODIFIER renders as plain amber line",
  renderComment({ type: "MODIFIER", text: "Less spicy" }) === "Less spicy",
);
check(
  "ADDON prefixed with plus",
  renderComment({ type: "ADDON", text: "Extra raita" }) === "+ Extra raita",
);
check(
  "ADDON qty>1 shows count",
  renderComment({ type: "ADDON", text: "Extra cheese", qty: 2 }) === "+ 2× Extra cheese",
);
check(
  "REMOVE uppercases + prefixes '- NO '",
  renderComment({ type: "REMOVE", text: "onion" }) === "- NO ONION",
);
check(
  "NOTE passes through untouched (Hinglish)",
  renderComment({ type: "NOTE", text: "bahut kam mirchi" }) === "bahut kam mirchi",
);

const mixed = renderCommentLine([
  { type: "MODIFIER", text: "Less spicy" },
  { type: "ADDON", text: "Extra raita" },
  { type: "REMOVE", text: "Onion" },
]);
check(
  "Multi-comment line joins with ' · '",
  mixed === "Less spicy · + Extra raita · - NO ONION",
  mixed,
);

check(
  "allergy keyword promotes",
  hasAllergyKeyword([{ type: "NOTE", text: "peanut allergy - none please" }]),
);
check(
  "no promotion on unrelated text",
  !hasAllergyKeyword([{ type: "MODIFIER", text: "extra spicy" }]),
);

check(
  "commentKey stable across order",
  commentKey([
    { type: "MODIFIER", text: "A" },
    { type: "MODIFIER", text: "B" },
  ]) ===
    commentKey([
      { type: "MODIFIER", text: "B" },
      { type: "MODIFIER", text: "A" },
    ]),
);
check(
  "commentKey differs when a comment changes",
  commentKey([{ type: "MODIFIER", text: "A" }]) !==
    commentKey([{ type: "MODIFIER", text: "B" }]),
);
check(
  "parseComments tolerates junk",
  parseComments("garbage").length === 0 && parseComments(null).length === 0,
);

// ─── timer bands ─────────────────────────────────────────────────────
console.log("\n[timer bands — spec §7]");
check("under 60% of target → ON_TIME", bandFor(60, 300) === "ON_TIME");
check("60–100% → GETTING_CLOSE", bandFor(200, 300) === "GETTING_CLOSE");
check("=100% flips to LATE", bandFor(300, 300) === "LATE");
check("far past target → VERY_LATE", bandFor(600, 300) === "VERY_LATE");

const NOW = new Date("2026-08-20T10:00:00Z");
const punched = new Date(NOW.getTime() - 4 * 60 * 1000).toISOString(); // 4 min ago
check(
  "elapsedSeconds excludes heldMs",
  elapsedSeconds(punched, 60_000, NOW) === 180, // 4min - 60s hold = 3min
);
check(
  "ticket timer formats MM:SS on-time",
  formatTicketTimer(180, 300) === "03:00",
);
check(
  "ticket timer flips to signed once late",
  formatTicketTimer(320, 300) === "-00:20",
);
check(
  "cap at 60:00 for stale tickets",
  formatTicketTimer(4000, 300).startsWith("-59:") || formatTicketTimer(4000, 300) === "-60:00",
);
check(
  "cooking timer counts from startedAt",
  formatCookingTimer(new Date(NOW.getTime() - 30_000).toISOString(), NOW) === "00:30",
);
check(
  "ticketTargetSeconds picks the LONGEST prep",
  ticketTargetSeconds([{ prepMinutes: 5 }, { prepMinutes: 12 }, { prepMinutes: 3 }]) === 720,
);

// ─── state machine ──────────────────────────────────────────────────
console.log("\n[state machine — spec §20]");
check(
  "NEW → PREPARING by chef is legal",
  canTransition({ from: "NEW", to: "PREPARING", actorRole: "CHEF" }).ok,
);
check(
  "PREPARING → READY by chef is legal",
  canTransition({ from: "PREPARING", to: "READY", actorRole: "CHEF" }).ok,
);
check(
  "READY → SERVED by chef is REJECTED (captain only)",
  !canTransition({ from: "READY", to: "SERVED", actorRole: "CHEF" }).ok,
);
check(
  "READY → SERVED by captain is legal",
  canTransition({ from: "READY", to: "SERVED", actorRole: "CAPTAIN" }).ok,
);
check(
  "NEW → SERVED skip is REJECTED",
  !canTransition({ from: "NEW", to: "SERVED", actorRole: "CAPTAIN" }).ok,
);
check(
  "CANCELLED → anything is REJECTED",
  !canTransition({ from: "CANCELLED", to: "READY", actorRole: "CHEF" }).ok,
);
check(
  "READY → PREPARING by recall (force=true) is legal",
  canTransition({ from: "READY", to: "PREPARING", actorRole: "CHEF", force: true }).ok,
);
check(
  "Order settled blocks non-force writes",
  !canTransition({ from: "NEW", to: "PREPARING", actorRole: "CHEF", orderSettled: true }).ok,
);
check(
  "Order settled + force (recall) allows write",
  canTransition({
    from: "NEW",
    to: "PREPARING",
    actorRole: "CHEF",
    orderSettled: true,
    force: true,
  }).ok,
);
check("nextTapStatus NEW → PREPARING", nextTapStatus("NEW") === "PREPARING");
check("nextTapStatus PREPARING → READY", nextTapStatus("PREPARING") === "READY");
check("nextTapStatus READY → SERVED", nextTapStatus("READY") === "SERVED");
check("nextTapStatus HELD → null (needs fire)", nextTapStatus("HELD") === null);

// ─── board splitting ────────────────────────────────────────────────
console.log("\n[splitting — spec §9]");
const KID = "kitchen_tandoor";

function item(id: string, status: KotItemSnapshot["status"], overrides: Partial<KotItemSnapshot> = {}): KotItemSnapshot {
  return {
    id,
    name: id,
    qty: 1,
    qtyReady: 0,
    portion: null,
    isVeg: true,
    comments: [],
    commentKey: "",
    kitchenId: KID,
    prepMinutes: 10,
    status,
    holdUntil: null,
    heldMs: 0,
    startedAt: null,
    readyAt: null,
    servedAt: null,
    cancelledAt: null,
    cancelReason: null,
    allergyAckAt: null,
    isRecalled: false,
    version: 1,
    ...overrides,
  };
}

function kot(id: string, items: KotItemSnapshot[], overrides: Partial<KotSnapshot> = {}): KotSnapshot {
  return {
    id,
    kotNo: id.toUpperCase(),
    orderId: "o_1",
    serviceMode: "DINE_IN",
    tableLabel: "Table 12",
    tokenNo: null,
    guestCount: null,
    captainId: "cap_1",
    captainName: "Priya",
    isRush: false,
    kotNote: null,
    allergyNote: null,
    punchedAt: new Date().toISOString(),
    clearedAt: null,
    clearedReason: null,
    items,
    ...overrides,
  };
}

// Case A: 3 items, one moves to PREPARING → two tiles across two columns.
const boardA = buildBoard(
  [
    kot("k1", [
      item("i1", "PREPARING"),
      item("i2", "NEW"),
      item("i3", "NEW"),
    ]),
  ],
  KID,
);
check(
  "A. one item preparing → 2 tiles (NEW + PREPARING)",
  boardA.NEW.length === 1 && boardA.PREPARING.length === 1 && boardA.READY.length === 0,
);
check("A. SPLIT badge appears", boardA.NEW[0].isSplit && boardA.PREPARING[0].isSplit);
check(
  "A. SPLIT n/m counts correct",
  boardA.NEW[0].splitLabel === "SPLIT 2/3" && boardA.PREPARING[0].splitLabel === "SPLIT 1/3",
);
check(
  "A. same KOT no and timerFrom on both parts",
  boardA.NEW[0].kotNo === boardA.PREPARING[0].kotNo &&
    boardA.NEW[0].timerFrom === boardA.PREPARING[0].timerFrom,
);

// Case B: 3-way split.
const boardB = buildBoard(
  [
    kot("k1", [
      item("i1", "NEW"),
      item("i2", "PREPARING"),
      item("i3", "READY"),
    ]),
  ],
  KID,
);
check(
  "B. 3-way split appears in all three columns",
  boardB.NEW.length === 1 && boardB.PREPARING.length === 1 && boardB.READY.length === 1,
);
check(
  "B. captain not called (waitingForOthers)",
  boardB.READY[0].waitingForOthers && !boardB.READY[0].isFinalReady,
);

// Case C: all three READY — merges back into one, captain called.
const boardC = buildBoard(
  [kot("k1", [item("i1", "READY"), item("i2", "READY"), item("i3", "READY")])],
  KID,
);
check(
  "C. merged back to a single Ready tile",
  boardC.READY.length === 1 && !boardC.READY[0].isSplit,
);
check("C. final ready → captain fired", boardC.READY[0].isFinalReady);

// Case D: held item rides inside NEW, doesn't create a split badge.
const boardD = buildBoard(
  [kot("k1", [item("i1", "NEW"), item("i2", "HELD"), item("i3", "NEW")])],
  KID,
);
check(
  "D. HELD folds into NEW (no split badge)",
  boardD.NEW.length === 1 && !boardD.NEW[0].isSplit,
);

// Case E: CANCELLED items don't render on live columns.
const boardE = buildBoard(
  [kot("k1", [item("i1", "NEW"), item("i2", "CANCELLED"), item("i3", "NEW")])],
  KID,
);
check(
  "E. cancelled items excluded from live columns",
  boardE.NEW.length === 1 && boardE.NEW[0].items.length === 2,
);

// Case F: items routed to a different kitchen are ignored.
const boardF = buildBoard(
  [
    kot("k1", [
      item("i1", "NEW", { kitchenId: "kitchen_bar" }),
      item("i2", "NEW", { kitchenId: KID }),
    ]),
  ],
  KID,
);
check(
  "F. wrong-kitchen items filtered out",
  boardF.NEW.length === 1 && boardF.NEW[0].items.length === 1,
);

// Case G: link text describes the other parts.
check(
  "G. link text explains where the rest is",
  (boardA.NEW[0].linkText?.includes("preparing") ?? false) &&
    (boardA.PREPARING[0].linkText?.includes("NEW") ?? false),
  { newLink: boardA.NEW[0].linkText, preparingLink: boardA.PREPARING[0].linkText },
);

console.log(
  `\n${failed === 0 ? "OK" : "FAIL"} ${passed}/${passed + failed}${failed ? "\n  failures:\n    - " + fails.join("\n    - ") : ""}`,
);
process.exit(failed === 0 ? 0 : 1);
