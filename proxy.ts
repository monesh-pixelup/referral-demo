import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/auth/token";

/**
 * First gate, before anything renders: no valid session → sign-in page;
 * wrong role for the area → that user's own area. This must happen here,
 * not only in a layout, because Next renders pages in parallel with layouts
 * and a page's data would otherwise stream before a layout redirect.
 * Pages (getStaffDataset / requirePartner) and every Server Action check again.
 */
export function proxy(request: NextRequest) {
  const user = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const path = request.nextUrl.pathname;
  if (!user) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  const staff = user.role === "admin" || user.role === "team";
  if (path.startsWith("/admin") && !staff) return NextResponse.redirect(new URL("/portal", request.url));
  if (path.startsWith("/portal") && staff) return NextResponse.redirect(new URL("/admin", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*"],
};
