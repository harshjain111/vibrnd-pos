/**
 * Server actions that call `redirect()` throw a special error with a
 * `digest` starting with "NEXT_REDIRECT". The framework expects that
 * error to propagate so it can perform the redirect — but a `try/catch`
 * on the client around an awaited server action will catch it as if it
 * were a real failure, and the catch handler shows a misleading
 * "NEXT_REDIRECT" toast.
 *
 * Use this guard at the top of every `catch` that wraps a redirecting
 * server action: re-throw the redirect signal so Next can complete the
 * navigation, then handle real errors below.
 *
 *   } catch (e) {
 *     if (isRedirectError(e)) throw e;
 *     toast({ variant: "destructive", description: String(e) });
 *   }
 */
export function isRedirectError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const digest = (e as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
