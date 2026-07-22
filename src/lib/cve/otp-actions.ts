"use server";
// Thin server-action wrappers around lib/cve/otp — split into its own file
// so client components can import them without pulling the whole service
// bundle into the client graph.

import { verifyOtp } from "./otp";
import type { OtpPurpose } from "./otp";
import { sendOtp } from "./otp";
import { requireUser } from "@/lib/rbac";
import { getActiveOutlet } from "@/lib/outlet";

export async function sendOtpAction(input: {
  purpose: OtpPurpose;
  subjectId: string;
  channelHint?: string;
  channel?: "sms" | "email";
  metaJson?: string;
}) {
  // Only signed-in staff can trigger OTPs — the whole point is that this
  // is manager-verified customer consent.
  await requireUser();
  const outlet = await getActiveOutlet();
  try {
    const r = await sendOtp({
      purpose: input.purpose,
      subjectId: input.subjectId,
      outletId: outlet.id,
      channel: input.channel,
      channelHint: input.channelHint,
      metaJson: input.metaJson,
    });
    return {
      ok: true as const,
      challengeId: r.challengeId,
      channelHint: r.channelHint,
      expiresAt: r.expiresAt.toISOString(),
      devCode: r.devCode,
    };
  } catch (err: any) {
    if (err?.code === "OTP_RATE_LIMIT") {
      return { ok: false as const, reason: "rate_limit" as const, message: err.message };
    }
    return { ok: false as const, reason: "internal" as const, message: err?.message ?? "OTP send failed" };
  }
}

export async function verifyOtpAction(input: { challengeId: string; code: string }) {
  return verifyOtp(input);
}
