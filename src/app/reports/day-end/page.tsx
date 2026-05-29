import { redirect } from "next/navigation";

// Reports → Day End Summary points to the existing /day-end list,
// which already shows per-day rows and per-date Z-report detail.
export default function ReportsDayEnd() {
  redirect("/day-end");
}
