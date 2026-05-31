import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { getActiveOutlet } from "@/lib/outlet";
import { requireUser } from "@/lib/rbac";
import { ArrowLeft, AlertTriangle, Check } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("MANAGER");
  const { id } = await params;
  const outlet = await getActiveOutlet();
  const audit = await db.assetAudit.findFirst({
    where: { id, outletId: outlet.id },
    include: { lines: { include: { asset: true } } },
  });
  if (!audit) return notFound();

  const variances = audit.lines.filter((l) => l.variance !== 0);
  const matches = audit.lines.filter((l) => l.variance === 0);

  return (
    <div>
      <PageHeader
        title={`Audit · ${audit.auditedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`}
        description={`${audit.lines.length} item(s) checked · ${variances.length} variance${variances.length === 1 ? "" : "s"}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/inventory/assets">
              <ArrowLeft className="h-4 w-4" />
              Back to register
            </Link>
          </Button>
        }
      />

      {variances.length > 0 && (
        <Card className="border-rose-300 bg-rose-50/50 mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base inline-flex items-center gap-2 text-rose-900">
              <AlertTriangle className="h-4 w-4" />
              Variance flagged · {variances.length} item{variances.length === 1 ? "" : "s"}
            </CardTitle>
            <CardDescription className="text-rose-700">
              Negative = items missing (possible theft). Positive = extras found.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Found</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variances.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.asset.name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{l.expectedQty}</TableCell>
                    <TableCell className="text-right">{l.foundQty}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive" className="text-[10px]">
                        {l.variance > 0 ? `+${l.variance}` : l.variance}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base inline-flex items-center gap-2 text-emerald-800">
            <Check className="h-4 w-4" />
            Matched · {matches.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Condition</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matches.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.asset.name}</TableCell>
                  <TableCell className="text-right">{l.foundQty}</TableCell>
                  <TableCell>
                    <Badge variant="success" className="text-[10px]">{l.conditionAfter ?? l.asset.condition}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {audit.notes && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Audit notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{audit.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}
