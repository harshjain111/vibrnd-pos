import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider } from "@/components/shell/sidebar-shell";

export const metadata: Metadata = {
  title: "Vibrnd POS — Restaurant management",
  description: "All-in-one POS, menu, inventory, CRM, and reporting for restaurants.",
};

const NO_CHROME = ["/login"];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const bare = NO_CHROME.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Toaster>
          {bare ? (
            children
          ) : (
            <SidebarProvider>
              <div className="flex min-h-screen">
                <Sidebar />
                <div className="flex-1 min-w-0 flex flex-col">
                  <Topbar />
                  <main className="flex-1 p-4 md:p-6 bg-muted/30 min-h-[calc(100vh-3.5rem)] overflow-x-hidden">
                    {children}
                  </main>
                </div>
              </div>
            </SidebarProvider>
          )}
        </Toaster>
      </body>
    </html>
  );
}
