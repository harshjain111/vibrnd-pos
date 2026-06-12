"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, clearSession } from "@/lib/session";
import { landingPathFor } from "@/lib/role-landing";

const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function signIn(_state: { error?: string } | null, fd: FormData): Promise<{ error?: string }> {
  let parsed: z.infer<typeof LoginInput>;
  try {
    parsed = LoginInput.parse({
      email: String(fd.get("email") ?? "").trim(),
      password: String(fd.get("password") ?? ""),
    });
  } catch {
    return { error: "Enter a valid email and password." };
  }

  const user = await db.user.findUnique({ where: { email: parsed.email.toLowerCase() } });
  if (!user || !user.active || !user.passwordHash) {
    return { error: "Invalid email or password." };
  }
  const ok = await bcrypt.compare(parsed.password, user.passwordHash);
  if (!ok) {
    return { error: "Invalid email or password." };
  }

  await createSession(user.id);
  // Role-aware landing — HOD goes to requisitions, SM to approval queue,
  // CC to pending-PO queue, Accountant to GRNs, etc. POS roles keep going
  // to /billing; OWNER + MANAGER land on the operations dashboard.
  redirect(landingPathFor(user.role));
}

export async function signOut() {
  await clearSession();
  redirect("/login");
}
