import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import {
  defaultLocale,
  getPathnameLocale,
  getPreferredLocale,
  localeCookieName,
  localizeHref,
} from "@/lib/i18n/config";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const pathnameLocale = getPathnameLocale(pathname);

  if (!pathnameLocale) {
    const cookieLocale = request.cookies.get(localeCookieName)?.value;
    const preferredLocale =
      cookieLocale && (cookieLocale === "zh" || cookieLocale === "en")
        ? cookieLocale
        : getPreferredLocale(request.headers.get("accept-language"));
    const redirectUrl = request.nextUrl.clone();

    redirectUrl.pathname = localizeHref(preferredLocale ?? defaultLocale, pathname);

    return NextResponse.redirect(redirectUrl);
  }

  if (!pathname.startsWith(`/${pathnameLocale}/admin`)) {
    const response = NextResponse.next();
    response.cookies.set(localeCookieName, pathnameLocale, {
      path: "/",
      sameSite: "lax",
    });
    return response;
  }

  const sessionCookie = getSessionCookie(request.headers);

  if (sessionCookie) {
    const response = NextResponse.next();
    response.cookies.set(localeCookieName, pathnameLocale, {
      path: "/",
      sameSite: "lax",
    });
    return response;
  }

  const signInUrl = new URL(localizeHref(pathnameLocale, "/auth/sign-in"), request.url);
  signInUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
