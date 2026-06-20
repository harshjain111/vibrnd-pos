import * as React from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";

type Variant = NonNullable<BadgeProps["variant"]>;
type Entry = { variant: Variant; label: string };

export type StatusKind =
  | "po"
  | "requisition"
  | "invoice"
  | "grn"
  | "transfer"
  | "return"
  | "stock";

/**
 * Domain status → Badge variant + friendly label, in one place. Replaces the
 * per-page inline `StatusBadge` functions and ad-hoc status→variant maps.
 * Unknown statuses fall back to a tidied label with the `secondary` variant, so
 * new states the owner adds never render as a crash or a raw enum.
 */
const MAPS: Record<StatusKind, Record<string, Entry>> = {
  po: {
    DRAFT: { variant: "secondary", label: "Draft" },
    PENDING_CC_APPROVAL: { variant: "warning", label: "Pending approval" },
    APPROVED: { variant: "success", label: "Approved" },
    REJECTED: { variant: "destructive", label: "Rejected" },
    SENT: { variant: "info", label: "Sent" },
    PARTIALLY_RECEIVED: { variant: "warning", label: "Partially received" },
    CLOSED: { variant: "success", label: "Closed" },
    CANCELLED: { variant: "outline", label: "Cancelled" },
  },
  requisition: {
    NEW: { variant: "warning", label: "Pending review" },
    APPROVED: { variant: "success", label: "Approved" },
    PARTIAL: { variant: "secondary", label: "Partially approved" },
    DECLINED: { variant: "destructive", label: "Declined" },
    FULFILLED: { variant: "success", label: "Fulfilled" },
    CANCELLED: { variant: "outline", label: "Cancelled" },
  },
  invoice: {
    UNPAID: { variant: "secondary", label: "Unpaid" },
    PARTIAL: { variant: "warning", label: "Partially paid" },
    PAID: { variant: "success", label: "Paid" },
  },
  grn: {
    OPEN: { variant: "warning", label: "Open" },
    CLOSED: { variant: "success", label: "Closed" },
  },
  transfer: {
    SENT: { variant: "warning", label: "In transit" },
    RECEIVED: { variant: "success", label: "Received" },
    CANCELLED: { variant: "outline", label: "Cancelled" },
  },
  return: {
    DRAFT: { variant: "secondary", label: "Draft" },
    CONFIRMED: { variant: "success", label: "Confirmed" },
    CANCELLED: { variant: "outline", label: "Cancelled" },
  },
  stock: {
    OK: { variant: "success", label: "In stock" },
    LOW: { variant: "warning", label: "Low" },
    CRITICAL: { variant: "destructive", label: "Critical" },
    OUT: { variant: "destructive", label: "Out of stock" },
  },
};

function tidy(s: string) {
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusBadge({
  status,
  kind,
  className,
}: {
  status: string;
  kind: StatusKind;
  className?: string;
}) {
  const entry = MAPS[kind]?.[status?.toUpperCase?.() ?? status] ?? {
    variant: "secondary" as Variant,
    label: tidy(status ?? ""),
  };
  return (
    <Badge variant={entry.variant} className={className}>
      {entry.label}
    </Badge>
  );
}
