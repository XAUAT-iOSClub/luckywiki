import test from "node:test";
import assert from "node:assert/strict";
import { resolveWikiPathDecision } from "@/lib/articles/redirect-decision";

test("a published article at the requested path renders normally", () => {
  assert.deepEqual(
    resolveWikiPathDecision("guide/a", {
      article: { path: "guide/a", status: "PUBLISHED" },
      redirect: null,
    }),
    { type: "none" },
  );
});

test("an archived article at the requested path returns gone", () => {
  assert.deepEqual(
    resolveWikiPathDecision("guide/a", {
      article: { path: "guide/a", status: "ARCHIVED" },
      redirect: null,
    }),
    { type: "gone" },
  );
});

test("a draft occupying the requested path never leaks through a redirect", () => {
  assert.deepEqual(
    resolveWikiPathDecision("guide/a", {
      article: { path: "guide/a", status: "DRAFT" },
      redirect: { path: "other", status: "PUBLISHED" },
    }),
    { type: "none" },
  );
});

test("redirect rows resolve to the current path only when published", () => {
  assert.deepEqual(
    resolveWikiPathDecision("guide/a", {
      article: null,
      redirect: { path: "guide/b", status: "PUBLISHED" },
    }),
    { type: "redirect", path: "guide/b" },
  );

  assert.deepEqual(
    resolveWikiPathDecision("guide/a", {
      article: null,
      redirect: { path: "guide/b", status: "DRAFT" },
    }),
    { type: "none" },
  );

  assert.deepEqual(
    resolveWikiPathDecision("guide/a", {
      article: null,
      redirect: { path: "guide/b", status: "ARCHIVED" },
    }),
    { type: "gone" },
  );
});

test("a redirect pointing at the requested path is not a redirect", () => {
  assert.deepEqual(
    resolveWikiPathDecision("guide/a", {
      article: null,
      redirect: { path: "guide/a", status: "PUBLISHED" },
    }),
    { type: "none" },
  );
});

test("unknown paths have no resolution", () => {
  assert.deepEqual(
    resolveWikiPathDecision("guide/a", { article: null, redirect: null }),
    { type: "none" },
  );
});
