// Login uses its own layout — no sidebar, no topbar.
// (Render its children directly inside the html/body provided by the root layout.)
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
