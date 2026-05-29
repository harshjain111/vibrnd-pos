"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { saveNotification } from "./actions";

type FormState = {
  id?: string;
  name?: string;
  slug?: string;
  recipients?: string;
  status?: "ACTIVE" | "INACTIVE";
  frequency?: "DAILY" | "WEEKLY" | "MONTHLY";
  time?: string;
  dayOfWeek?: string;
  dayOfMonth?: number;
  format?: "EXCEL" | "PDF" | "BOTH";
  subject?: string;
  dateRange?: "YESTERDAY" | "LAST_7" | "THIS_MONTH" | "LAST_MONTH" | "ROLLING_N";
  rollingDays?: number;
};

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function NotificationForm({
  reports,
  initial,
}: {
  reports: { slug: string; name: string }[];
  initial?: FormState;
}) {
  const { toast } = useToast();
  const [frequency, setFrequency] = React.useState<"DAILY" | "WEEKLY" | "MONTHLY">(initial?.frequency ?? "DAILY");
  const [dateRange, setDateRange] = React.useState<FormState["dateRange"]>(initial?.dateRange ?? "YESTERDAY");
  const [dow, setDow] = React.useState<Set<string>>(
    new Set((initial?.dayOfWeek ?? "").split(",").map((s) => s.trim()).filter(Boolean))
  );

  return (
    <form
      action={async (fd) => {
        try {
          fd.set("dayOfWeek", [...dow].join(","));
          await saveNotification(fd);
          toast({ variant: "success", title: initial?.id ? "Updated" : "Scheduled" });
        } catch (e) {
          toast({ variant: "destructive", title: "Couldn't save", description: String(e) });
        }
      }}
      className="space-y-3"
    >
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Schedule name</Label>
          <Input name="name" required defaultValue={initial?.name ?? ""} placeholder="Daily Sales Summary" />
        </div>
        <div>
          <Label>Report</Label>
          <select name="slug" required defaultValue={initial?.slug ?? ""} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">— Pick a report —</option>
            {reports.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <Label>Recipients <span className="text-xs text-muted-foreground font-normal">— comma-separated</span></Label>
        <Input name="recipients" required defaultValue={initial?.recipients ?? ""} placeholder="owner@smokzy.com, manager@smokzy.com" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label>Frequency</Label>
          <select name="frequency" defaultValue={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>
        <div>
          <Label>Time</Label>
          <Input name="time" type="time" defaultValue={initial?.time ?? "08:00"} />
        </div>
        <div>
          <Label>Format</Label>
          <select name="format" defaultValue={initial?.format ?? "EXCEL"} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="EXCEL">Excel</option>
            <option value="PDF">PDF</option>
            <option value="BOTH">Both</option>
          </select>
        </div>
        <div>
          <Label>Status</Label>
          <select name="status" defaultValue={initial?.status ?? "ACTIVE"} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {frequency === "WEEKLY" && (
        <div>
          <Label>Days of week</Label>
          <div className="flex flex-wrap gap-1">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDow((s) => {
                  const next = new Set(s);
                  if (next.has(d)) next.delete(d); else next.add(d);
                  return next;
                })}
                className={`text-xs px-2 py-1.5 rounded border ${dow.has(d) ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {frequency === "MONTHLY" && (
        <div>
          <Label>Day of month (1–28)</Label>
          <Input name="dayOfMonth" type="number" min="1" max="28" defaultValue={initial?.dayOfMonth ?? 1} className="w-24" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Subject (optional)</Label>
          <Input name="subject" defaultValue={initial?.subject ?? ""} placeholder="auto: [Report Name] — [Date]" />
        </div>
        <div>
          <Label>Date range</Label>
          <select name="dateRange" defaultValue={dateRange} onChange={(e) => setDateRange(e.target.value as any)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="YESTERDAY">Yesterday</option>
            <option value="LAST_7">Last 7 days</option>
            <option value="THIS_MONTH">This month</option>
            <option value="LAST_MONTH">Last month</option>
            <option value="ROLLING_N">Rolling N days</option>
          </select>
        </div>
        {dateRange === "ROLLING_N" && (
          <div>
            <Label>Rolling N (days)</Label>
            <Input name="rollingDays" type="number" min="1" defaultValue={initial?.rollingDays ?? 30} className="w-24" />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{initial?.id ? "Save changes" : "Schedule"}</Button>
      </div>
    </form>
  );
}
