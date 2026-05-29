import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { REPORTS } from "../../registry";
import { NotificationForm } from "../form";

export const dynamic = "force-dynamic";

export default async function NewNotificationPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const sp = await searchParams;
  return (
    <div>
      <PageHeader title="Schedule a report" description="Email any report automatically — daily, weekly, or monthly." />
      <Card>
        <CardContent className="p-4">
          <NotificationForm
            reports={REPORTS.filter((r) => r.implemented).map((r) => ({ slug: r.slug, name: r.name }))}
            initial={sp.slug ? { slug: sp.slug } : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
