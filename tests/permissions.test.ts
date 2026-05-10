import test from "node:test";
import assert from "node:assert/strict";
import { Role } from "@/generated/prisma/enums";
import {
  canAccessAdminShell,
  canChangeUserRole,
  canComment,
  canManageUsers,
  canModerateComments,
  canWriteArticles,
  isAuthorUser,
  isRootUser,
} from "@/lib/auth/permissions";

test("root users retain all privileged capabilities", () => {
  const root = { role: Role.ROOT, emailVerified: true };

  assert.equal(isRootUser(root), true);
  assert.equal(isAuthorUser(root), false);
  assert.equal(canAccessAdminShell(root), true);
  assert.equal(canWriteArticles(root), true);
  assert.equal(canModerateComments(root), true);
  assert.equal(canManageUsers(root), true);
});

test("authors can write articles but cannot manage users or moderate comments", () => {
  const author = { role: Role.AUTHOR, emailVerified: true };

  assert.equal(isRootUser(author), false);
  assert.equal(isAuthorUser(author), true);
  assert.equal(canAccessAdminShell(author), true);
  assert.equal(canWriteArticles(author), true);
  assert.equal(canModerateComments(author), false);
  assert.equal(canManageUsers(author), false);
});

test("regular users cannot access the admin shell", () => {
  const user = { role: Role.USER, emailVerified: true };

  assert.equal(canAccessAdminShell(user), false);
  assert.equal(canWriteArticles(user), false);
  assert.equal(canModerateComments(user), false);
  assert.equal(canManageUsers(user), false);
});

test("only verified users can comment", () => {
  assert.equal(canComment({ role: Role.USER, emailVerified: true }), true);
  assert.equal(canComment({ role: Role.AUTHOR, emailVerified: true }), true);
  assert.equal(canComment({ role: Role.USER, emailVerified: false }), false);
  assert.equal(canComment(null), false);
});

test("role changes allow promotions and block demoting the final root user", () => {
  assert.equal(canChangeUserRole(Role.USER, Role.AUTHOR, 1), true);
  assert.equal(canChangeUserRole(Role.AUTHOR, Role.ROOT, 1), true);
  assert.equal(canChangeUserRole(Role.ROOT, Role.AUTHOR, 2), true);
  assert.equal(canChangeUserRole(Role.ROOT, Role.USER, 1), false);
  assert.equal(canChangeUserRole(Role.ROOT, Role.ROOT, 3), false);
});
