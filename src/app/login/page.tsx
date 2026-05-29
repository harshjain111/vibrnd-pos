import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { LoginForm } from "./form";
import { ChefHat } from "lucide-react";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center mb-3">
            <ChefHat className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold">Sign in to Vibrnd POS</h1>
          <p className="text-sm text-muted-foreground mt-1">Use your outlet credentials</p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <LoginForm />

          <div className="text-xs text-muted-foreground mt-6 pt-4 border-t">
            <div className="font-medium mb-1 text-foreground">Demo credentials</div>
            <div>
              Email <span className="font-mono">owner@smokzy.com</span>
            </div>
            <div>
              Password <span className="font-mono">password123</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
