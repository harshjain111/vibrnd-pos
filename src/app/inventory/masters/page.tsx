import { redirect } from "next/navigation";

// Audit B1: /inventory/masters used to 404. Redirect to the Raw Materials
// list which is the canonical "masters" landing page.
export default function InventoryMastersIndex() {
  redirect("/inventory");
}
