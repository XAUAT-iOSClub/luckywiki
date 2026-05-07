import test from "node:test";
import assert from "node:assert/strict";
import {
  getPreferredLocale,
  localizeHref,
  stripLocaleFromPathname,
} from "@/lib/i18n/config";
import { getLocalizedRevalidationPaths } from "@/lib/i18n/revalidate";

test("localizeHref prefixes routes and preserves query strings", () => {
  assert.equal(localizeHref("zh", "/wiki"), "/zh/wiki");
  assert.equal(localizeHref("en", "/wiki/setup?tab=intro"), "/en/wiki/setup?tab=intro");
});

test("localizeHref replaces an existing locale prefix", () => {
  assert.equal(localizeHref("zh", "/en/admin/comments?status=PENDING"), "/zh/admin/comments?status=PENDING");
});

test("stripLocaleFromPathname removes the leading locale segment", () => {
  assert.equal(stripLocaleFromPathname("/zh/wiki/path"), "/wiki/path");
  assert.equal(stripLocaleFromPathname("/en"), "/");
});

test("getPreferredLocale falls back to supported locales", () => {
  assert.equal(getPreferredLocale("en-US,en;q=0.9"), "en");
  assert.equal(getPreferredLocale("zh-CN,zh;q=0.8,en;q=0.5"), "zh");
  assert.equal(getPreferredLocale("fr-FR,fr;q=0.8"), "zh");
});

test("localized revalidation paths cover both supported locales", () => {
  assert.deepEqual(getLocalizedRevalidationPaths("/admin/articles"), [
    "/zh/admin/articles",
    "/en/admin/articles",
  ]);
});
