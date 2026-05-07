import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request.headers);

  if (sessionCookie) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/auth/sign-in", request.url);
  signInUrl.searchParams.set("next", request.nextUrl.pathname);

  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
