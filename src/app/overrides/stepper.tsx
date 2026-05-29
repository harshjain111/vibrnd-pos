/**
 * 4-stage approval chain stepper (audit TASK 23 / §5.4).
 *
 * Visualises L1 Purchaser → L2 Manager → L3 Auditor → L4 Founder progression for
 * an override request. Each stage shows tone based on whether it's
 *   • completed (green check)
 *   • current  (primary outline)
 *   • upcoming (muted)
 *   • rejected (red)
 *
 * Plain server-rendered HTML — no client JS needed.
 */
import { Check, Clock, X } from "lucide-react";

type Stage = "L1" | "L2" | "L3" | "L4";

const STAGES: { id: Stage; label: string; role: string }[] = [
  { id: "L1", label: "Requested", role: "Purchaser" },
  { id: "L2", label: "Manager review", role: "Manager" },
  { id: "L3", label: "Auditor review", role: "Auditor" },
  { id: "L4", label: "Founder", role: "Founder" },
];

export function ApprovalStepper({
  status,
  currentStage = "L2",
}: {
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  currentStage?: Stage;
}) {
  // Determine each stage's state from the request status.
  const stageState = (s: Stage): "done" | "current" | "upcoming" | "rejected" => {
    if (status === "REJECTED" && currentStage === s) return "rejected";
    const order = ["L1", "L2", "L3", "L4"];
    const i = order.indexOf(s);
    const cur = order.indexOf(currentStage);
    if (status === "APPROVED") return "done";
    if (i < cur) return "done";
    if (i === cur) return "current";
    return "upcoming";
  };

  return (
    <ol className="flex items-center gap-0 text-[10px] uppercase tracking-wider">
      {STAGES.map((s, idx) => {
        const state = stageState(s.id);
        const last = idx === STAGES.length - 1;
        return (
          <li key={s.id} className="flex items-center flex-1">
            <span
              className={`flex items-center gap-1.5 ${
                state === "done"
                  ? "text-emerald-700"
                  : state === "current"
                    ? "text-primary font-semibold"
                    : state === "rejected"
                      ? "text-rose-700 font-semibold"
                      : "text-muted-foreground"
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full grid place-items-center shrink-0 ${
                  state === "done"
                    ? "bg-emerald-600 text-white"
                    : state === "current"
                      ? "border-2 border-primary text-primary"
                      : state === "rejected"
                        ? "bg-rose-600 text-white"
                        : "border border-muted-foreground/50"
                }`}
              >
                {state === "done" ? (
                  <Check className="h-2.5 w-2.5" />
                ) : state === "rejected" ? (
                  <X className="h-2.5 w-2.5" />
                ) : state === "current" ? (
                  <Clock className="h-2.5 w-2.5" />
                ) : (
                  <span className="text-[8px] font-bold">{s.id.slice(1)}</span>
                )}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.id}</span>
            </span>
            {!last && (
              <span
                className={`flex-1 h-0.5 mx-1 rounded-full ${
                  state === "done" ? "bg-emerald-600" : "bg-muted"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
