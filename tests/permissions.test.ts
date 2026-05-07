import test from "node:test";
import assert from "node:assert/strict";
import { Role } from "@/generated/prisma/enums";
import { canComment, canManageWiki, isRootUser } from "@/lib/permissions";

test("root users can manage the wiki", () => {
  const root = { role: Role.ROOT, emailVerified: true };
  assert.equal(isRootUser(root), true);
  assert.equal(canManageWiki(root), true);
});

test("only verified users can comment", () => {
  assert.equal(canComment({ role: Role.USER, emailVerified: true }), true);
  assert.equal(canComment({ role: Role.USER, emailVerified: false }), false);
  assert.equal(canComment(null), false);
});
