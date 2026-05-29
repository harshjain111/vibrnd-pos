"use client";
import * as React from "react";
import Link from "next/link";
import { Sparkles, Send, X, BarChart3, MessageCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askAi, type AiReply } from "@/app/ai/actions";

type Msg = { id: string; role: "user" | "ai"; text: string; link?: AiReply["link"] };

const SUGGESTIONS = [
  {
    label: "Analytics",
    icon: BarChart3,
    prompts: ["Today's sales", "Top selling items", "This month sales", "Top customers"],
  },
  {
    label: "Operations",
    icon: MessageCircle,
    prompts: ["Low stock", "Live orders", "Online orders pending", "Cancellations last 7 days"],
  },
  {
    label: "Help",
    icon: HelpCircle,
    prompts: ["How do I add an item?", "How do I invite a user?", "Store status"],
  },
];

export function AskAiButton() {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [pending, startTransition] = React.useTransition();
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const userMsg: Msg = { id: Math.random().toString(36).slice(2), role: "user", text: q };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    startTransition(async () => {
      const reply = await askAi(q);
      setMessages((m) => [
        ...m,
        { id: Math.random().toString(36).slice(2), role: "ai", text: reply.text, link: reply.link },
      ]);
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)} aria-label="Ask AI">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="hidden sm:inline">Ask AI</span>
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-md bg-background border-l shadow-xl flex flex-col">
            <div className="h-14 border-b flex items-center px-4 gap-2 shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-semibold">Ask AI</span>
              <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Pattern-matched assistant connected to your data. Try one of these:
                  </div>
                  {SUGGESTIONS.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <div key={cat.label}>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 inline-flex items-center gap-1.5">
                          <Icon className="h-3 w-3" />
                          {cat.label}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {cat.prompts.map((p) => (
                            <button
                              key={p}
                              onClick={() => ask(p)}
                              className="text-xs rounded-full border px-3 py-1 hover:bg-accent transition-colors"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    {m.link && (
                      <Link
                        href={m.link.href}
                        onClick={() => setOpen(false)}
                        className="mt-1.5 inline-block text-xs underline underline-offset-2 opacity-90 hover:opacity-100"
                      >
                        {m.link.label} →
                      </Link>
                    )}
                  </div>
                </div>
              ))}

              {pending && (
                <div className="flex justify-start">
                  <div className="rounded-lg px-3 py-2 text-sm bg-muted text-muted-foreground inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:240ms]" />
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="border-t p-3 flex items-center gap-2 shrink-0"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your business…"
                className="flex-1 h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
              <Button type="submit" size="icon" disabled={pending || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </aside>
        </>
      )}
    </>
  );
}
