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
import { resolveWikiPath } from "@/lib/articles/redirects";
import {
  buildWikiHref,
  getWikiArticlePathFromPathname,
} from "@/lib/wiki/path";
import { WIKI_PATHNAME_HEADER } from "@/lib/wiki/request-headers";

export async function proxy(request: NextRequest) {
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

  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  // Redirect the locale root and the wiki root at the HTTP layer. Redirecting
  // from inside the wiki catch-all page would become a
  // `<meta http-equiv="refresh">` in its partially prerendered shell, which is
  // shared by every article URL and makes them reload in a loop.
  if (
    normalizedPathname === `/${pathnameLocale}` ||
    normalizedPathname === `/${pathnameLocale}/wiki`
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = localizeHref(pathnameLocale, "/wiki/home");

    return NextResponse.redirect(redirectUrl, 308);
  }

  // Old paths are resolved in the HTTP layer so external links and search
  // engines get a real 308 (and archived pages a real 410) instead of a
  // client-side meta refresh. `resolveWikiPath` fails open: a database outage
  // falls through to the page and its 404 handling.
  if (normalizedPathname.startsWith(`/${pathnameLocale}/wiki/`)) {
    const articlePath = getWikiArticlePathFromPathname(normalizedPathname);

    if (articlePath) {
      const resolution = await resolveWikiPath(articlePath);

      if (resolution.type === "redirect") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = buildWikiHref(resolution.path, pathnameLocale);

        return NextResponse.redirect(redirectUrl, 308);
      }

      if (resolution.type === "gone") {
        return new NextResponse("Gone", {
          status: 410,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
    }
  }

  if (!pathname.startsWith(`/${pathnameLocale}/admin`)) {
    const response = nextWithPathnameHeader(request, pathname);
    response.cookies.set(localeCookieName, pathnameLocale, {
      path: "/",
      sameSite: "lax",
    });
    return response;
  }

  const sessionCookie = getSessionCookie(request.headers);

  if (sessionCookie) {
    const response = nextWithPathnameHeader(request, pathname);
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

function nextWithPathnameHeader(request: NextRequest, pathname: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(WIKI_PATHNAME_HEADER, pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    // Everything except API routes, all Next internals (including the dev HMR
    // websocket), static files and metadata routes. A dedicated entry below
    // still lets wiki paths that contain a dot reach the proxy.
    "/((?!api|_next|favicon.ico|.*\\..*).*)",
    "/:locale(zh|en)/wiki/:path*",
  ],
};
