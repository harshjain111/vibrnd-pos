"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

/** Tiny client-side wrapper so the "Record invoice" link doesn't trigger a
 *  hard navigation in the middle of the GRN detail card.  Just a styled
 *  link to /inventory/invoices/new — the heavy lifting is on the server. */
export function CreateInvoiceLink({ grnId }: { grnId: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="w-full">
      <Link href={`/inventory/invoices/new?grn=${grnId}`}>
        <FileText className="h-3.5 w-3.5" />
        Record stock purchase
      </Link>
    </Button>
  );
}
