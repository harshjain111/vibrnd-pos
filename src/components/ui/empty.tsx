import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

export function Empty({ title = "Nothing here yet", desc, icon: Icon = Inbox, className }: {
  title?: string; desc?: string; icon?: React.ComponentType<{ className?: string }>; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="rounded-full bg-muted p-3 mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium">{title}</p>
      {desc && <p className="text-sm text-muted-foreground mt-1 max-w-md">{desc}</p>}
    </div>
  );
}
