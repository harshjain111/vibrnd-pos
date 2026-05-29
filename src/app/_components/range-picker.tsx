"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
];

export function RangePicker({ current }: { current: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  return (
    <Select
      value={current}
      onValueChange={(v) => {
        const next = new URLSearchParams(sp.toString());
        next.set("range", v);
        router.push(`?${next.toString()}`);
      }}
    >
      <SelectTrigger className="w-44 h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
