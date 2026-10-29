import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { WIKI_PATHNAME_HEADER } from "@/lib/wiki/request-headers";

test("proxy redirects bare wiki routes to the default locale prefix", () => {
  const response = proxy(new NextRequest("http://localhost:3000/wiki"));

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost:3000/zh/wiki");
});

test("proxy respects accept-language when choosing a locale", () => {
  const request = new NextRequest("http://localhost:3000/wiki", {
    headers: {
      "accept-language": "en-US,en;q=0.9",
    },
  });
  const response = proxy(request);

  assert.equal(response.headers.get("location"), "http://localhost:3000/en/wiki");
});

test("proxy redirects localized roots to the wiki home article", () => {
  const wikiRoot = proxy(new NextRequest("http://localhost:3000/en/wiki"));
  assert.equal(wikiRoot.status, 308);
  assert.equal(
    wikiRoot.headers.get("location"),
    "http://localhost:3000/en/wiki/home",
  );

  const localeRoot = proxy(new NextRequest("http://localhost:3000/zh"));
  assert.equal(localeRoot.status, 308);
  assert.equal(
    localeRoot.headers.get("location"),
    "http://localhost:3000/zh/wiki/home",
  );
});

test("proxy leaves other localized routes alone", () => {
  const response = proxy(new NextRequest("http://localhost:3000/en/wiki/guide"));

  assert.equal(response.headers.get("location"), null);
});

test("proxy forwards the current pathname to server components", () => {
  const response = proxy(
    new NextRequest("http://localhost:3000/en/wiki/guide/install"),
  );

  assert.equal(
    response.headers.get(`x-middleware-request-${WIKI_PATHNAME_HEADER}`),
    "/en/wiki/guide/install",
  );
});

test("proxy redirects unauthenticated admin requests to localized sign-in", () => {
  const response = proxy(new NextRequest("http://localhost:3000/zh/admin"));

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/zh/auth/sign-in?next=%2Fzh%2Fadmin",
  );
});
