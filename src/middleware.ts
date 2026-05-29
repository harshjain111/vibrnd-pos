import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "pos_session";

const PUBLIC_PATHS = ["/login"];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  // Allow Next.js internals and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/health")
  ) {
    return true;
  }
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Expose pathname to server components so the root layout can skip chrome on /login
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);

  if (isPublic(pathname)) {
    return NextResponse.next({ request: { headers } });
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  // Cookie-presence gate. HMAC verification happens in server components / actions.
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
