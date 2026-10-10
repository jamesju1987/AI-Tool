import { NextResponse, type NextRequest } from "next/server";

/**
 * - English is served at the root: "/foo" is rewritten internally to "/en/foo".
 * - Chinese lives under "/zh".
 * - "/en/..." is never a public URL (avoids duplicate content) → 308 to the root form.
 * - /admin is limited to ADMIN_IP_ALLOWLIST when set.
 */
const PASSTHROUGH = /^\/(api|go|media|_next|admin|favicon\.ico|robots\.txt|sitemap\.xml|icon|apple-icon)(\/|$)/;

function clientIp(req: NextRequest) {
  // Behind Caddy/Nginx the first X-Forwarded-For hop is the client.
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    const allow = (process.env.ADMIN_IP_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (allow.length && !allow.includes(clientIp(req))) {
      return new NextResponse("Not found", { status: 404 });
    }
    return NextResponse.next();
  }

  if (PASSTHROUGH.test(pathname) || /\.[a-z0-9]{2,5}$/i.test(pathname)) return NextResponse.next();

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    // Our own rewrite comes back through the proxy in production; let it through.
    if (req.headers.get("x-locale-rewritten")) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }

  if (pathname === "/zh" || pathname.startsWith("/zh/")) return NextResponse.next();

  // The header marks the request as rewritten, so the "/en" redirect above skips it.
  const url = new URL(`/en${pathname === "/" ? "" : pathname}${req.nextUrl.search}`, req.url);
  const headers = new Headers(req.headers);
  headers.set("x-locale-rewritten", "1");
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
