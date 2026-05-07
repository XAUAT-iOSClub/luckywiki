import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

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

test("proxy leaves already localized routes alone", () => {
  const response = proxy(new NextRequest("http://localhost:3000/en/wiki"));

  assert.equal(response.headers.get("location"), null);
});

test("proxy redirects unauthenticated admin requests to localized sign-in", () => {
  const response = proxy(new NextRequest("http://localhost:3000/zh/admin"));

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/zh/auth/sign-in?next=%2Fzh%2Fadmin",
  );
});
