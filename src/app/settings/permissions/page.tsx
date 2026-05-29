import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/rbac";
import { getActiveOutlet } from "@/lib/outlet";
import { PAGES, loadOutletPermissions, canAccess } from "@/lib/permissions";
import { Shield } from "lucide-react";
import { PermissionsForm } from "./client";

export const dynamic = "force-dynamic";

const ROLES = ["OWNER", "MANAGER", "BILLER", "CAPTAIN"] as const;

export default async function PermissionsPage() {
  await requireUser("OWNER");
  const outlet = await getActiveOutlet();
  const overrides = await loadOutletPermissions(outlet.id);

  // Build the current matrix state (one boolean per role × page).
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const page of PAGES) {
    matrix[page.id] = {};
    for (const role of ROLES) {
      matrix[page.id][role] = canAccess(role, page.id, overrides);
    }
  }

  // Group pages by category for a readable table.
  const grouped = new Map<string, typeof PAGES>();
  for (const p of PAGES) {
    const arr = grouped.get(p.category) ?? [];
    arr.push(p);
    grouped.set(p.category, arr);
  }

  return (
    <div>
      <PageHeader
        title="Permissions"
        description="Choose which roles can see which pages. Owner can change these any time."
      />

      <Card className="mb-3">
        <CardHeader>
          <CardTitle className="text-base inline-flex items-center gap-2">
            <Shield className="h-4 w-4" />
            How this works
          </CardTitle>
          <CardDescription>
            Each row is one page. Tick a role's box to allow it; untick to hide it from their sidebar &amp; block access.
            Owner-only pages (Users, Outlets, Permissions, Head Office) are locked — only the Owner can see them.
            Changes apply immediately and are scoped to <strong>{outlet.name}</strong>.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="p-4">
          <PermissionsForm
            pages={PAGES.map((p) => ({
              id: p.id,
              label: p.label,
              category: p.category,
              ownerOnly: !!p.ownerOnly,
              defaults: Object.fromEntries(ROLES.map((r) => [r, p.defaultRoles.includes(r)])) as Record<string, boolean>,
            }))}
            initialChecked={matrix}
            roles={[...ROLES]}
            categories={[...grouped.keys()]}
          />
        </CardContent>
      </Card>

      <div className="mt-3 text-xs text-muted-foreground">
        <Badge variant="outline" className="text-[10px] mr-1">Tip</Badge>
        Hide everything you don't need a role to see — fewer distractions, fewer mistakes, less screen real estate wasted.
      </div>
    </div>
  );
}
