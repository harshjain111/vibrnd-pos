// Customer Value Engine — orchestrator.
// evaluateCampaign(campaign, ctx) → EvaluationResult
// evaluateAll(campaigns, ctx)     → EvaluationResult[]  (only eligible ones)
//
// Rules compose left-to-right with groupOp AND | OR. The first rule's
// groupOp is ignored (there's nothing to the left of it). To model
// (A AND B) OR (C AND D), lay them out as:
//   [A: AND] [B: AND] [C: OR] [D: AND]
// which evaluates as A && B  ||  C && D by left-fold with default precedence.
//
// We do NOT support parentheses in the rule list — the admin builder
// enforces the AND-of-ORs / OR-of-ANDs shape via a group picker. Keeps the
// evaluator trivially correct and predictable.

import { evaluateCondition } from "./conditions";
import { resolveBenefit } from "./benefits";
import type { CampaignLike, EvaluationResult, RuleContext } from "./types";

export function evaluateCampaign(campaign: CampaignLike, ctx: RuleContext): EvaluationResult {
  if (!campaign.active) return skip(campaign, "Campaign is inactive");
  const now = ctx.now.getTime();
  if (now < campaign.startsAt.getTime()) return skip(campaign, "Not started yet");
  if (now > campaign.endsAt.getTime()) return skip(campaign, "Ended");
  if (campaign.outletId !== ctx.outletId) return skip(campaign, "Different outlet");

  // No rules ⇒ always eligible (per PRD: an empty rule set means the
  // campaign is unconditional, e.g. a welcome bonus).
  const passed = campaign.rules.length === 0 || evalRuleList(campaign.rules, ctx);
  if (!passed) return skip(campaign, "Rules did not match");

  const benefits = campaign.benefits.map((cb) => resolveBenefit(cb, ctx, campaign.id));
  return { campaign, eligible: true, benefits };
}

export function evaluateAll(campaigns: CampaignLike[], ctx: RuleContext): EvaluationResult[] {
  return campaigns
    .slice()
    .sort((a, b) => b.priority - a.priority || a.startsAt.getTime() - b.startsAt.getTime())
    .map((c) => evaluateCampaign(c, ctx))
    .filter((r) => r.eligible);
}

// ── internals ───────────────────────────────────────────────────────────

function skip(campaign: CampaignLike, reason: string): EvaluationResult {
  return { campaign, eligible: false, reason, benefits: [] };
}

function evalRuleList(
  rules: CampaignLike["rules"],
  ctx: RuleContext,
): boolean {
  const ordered = rules.slice().sort((a, b) => a.order - b.order);
  let acc = evaluateCondition(ordered[0].conditionType, ordered[0].configJson, ctx);
  for (let i = 1; i < ordered.length; i++) {
    const r = ordered[i];
    const val = evaluateCondition(r.conditionType, r.configJson, ctx);
    if (r.groupOp === "OR") acc = acc || val;
    else acc = acc && val;
  }
  return acc;
}
