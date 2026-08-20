import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// One-page cheat-sheet from spec §17.
export default async function KdsGuidePage() {
  await requireUser("BILLER");
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="KDS — chef cheat-sheet"
        description="The whole job in two taps. Print this, tape it next to the screen."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/kds">
              <ArrowLeft className="h-4 w-4" />
              Back to board
            </Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">The normal path</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ol className="list-decimal ml-5 space-y-1">
            <li>Red ticket appears in <b>NEW</b> — chime sounds, timer starts.</li>
            <li>Tap the item → turns amber, moves to <b>PREPARING</b>. Ticket splits.</li>
            <li>Cook the dish.</li>
            <li>Tap the item again → turns green, moves to <b>READY</b>.</li>
            <li>When every item of the ticket is green, split tiles merge back into one and the captain's phone buzzes.</li>
            <li>Captain serves it and taps <b>SERVED</b> on their phone → tile turns blue.</li>
            <li>Cashier settles the bill → tile stamps <b>BILL SETTLED</b>, fades over 20 s, moves to History.</li>
          </ol>
          <div className="rounded-md border bg-muted/40 p-3 text-xs mt-3">
            <b>The whole job in two taps</b> — first tap starts cooking, second tap says it's done.
            Captain does one more tap on their phone. Cashier finishes the story with the bill.
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">If something goes wrong</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-xs">
          <div><b>Tapped the wrong item?</b> The black bar at the bottom says "UNDO 5s" — hit it.</div>
          <div><b>Marked ready too early?</b> Swipe the tile right, or tap the item → RECALL. Goes back to PREPARING.</div>
          <div><b>Ticket cancelled?</b> A red banner drops across the screen with an alarm. STOP cooking. Tap ACKNOWLEDGE. Answer "wasted?" with one tap.</div>
          <div><b>Guest sent the dish back?</b> RECALL brings it back as PREPARING with a purple ↺ badge.</div>
          <div><b>Cleared by mistake?</b> RECALL → Bring back last ticket (30-minute window).</div>
          <div><b>Item not cooking yet — send later?</b> Long-press → HOLD → pick duration. Timer pauses.</div>
          <div><b>Fire a held item now?</b> Tap FIRE on the held row.</div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Reading the tile</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1 text-xs">
          <div><b>Red allergy strip on top</b> — tap it to acknowledge before the item can be marked ready.</div>
          <div><b>KOT-000042</b> — the ticket number. Same on every part of a split.</div>
          <div><b>SPLIT 2/3</b> — this tile has 2 items; the KOT has 3 in total for this kitchen.</div>
          <div><b>Big timer top-right</b> — turns amber past 60 % of target, red once late, negative once past target ("late by X").</div>
          <div><b>Amber line under the dish</b> — the comment the captain typed. "Less spicy · - NO ONION · child portion". Never truncated.</div>
          <div><b>Amber KOT-note block</b> — a whole-ticket note ("Parcel — pack gravy separately").</div>
          <div><b>Link bar</b> — appears on split tiles: "2 items still in NEW · 1 preparing". Tells you where the rest of this ticket is.</div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Two screens per kitchen</CardTitle>
          <CardDescription>Spec §3.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-xs space-y-2">
          <div><b>Display screen</b> (<code>/kds?mode=display</code>) — big screen on the wall. Read-only. Every cook sees the whole board from anywhere.</div>
          <div><b>Control screen</b> (<code>/kds</code>) — the chef's touchscreen at the station. Every status change starts with a tap here. Must work with a wet or gloved finger.</div>
          <div className="text-muted-foreground mt-2">If a kitchen only has one screen, it's the Control screen. The Display is the one you can drop.</div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Full spec: KDS_Specification_v2.pdf (26 sections). Kitchens admin:{" "}
        <Link href="/admin/kitchens" className="text-primary underline">/admin/kitchens</Link>.
      </div>
    </div>
  );
}
