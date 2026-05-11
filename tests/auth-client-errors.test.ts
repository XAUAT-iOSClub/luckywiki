import test from "node:test";
import assert from "node:assert/strict";
import { getAuthErrorMessage } from "@/lib/auth/client-errors";
import { en } from "@/lib/i18n/dictionaries/en";

test("maps oauth email errors to user-friendly copy", () => {
  assert.equal(
    getAuthErrorMessage(en, "email_is_missing"),
    en.auth.socialEmailMissing,
  );
  assert.equal(
    getAuthErrorMessage(en, "oauth_account_not_linked"),
    en.auth.socialEmailUnverified,
  );
});

test("maps account linking conflicts to dedicated copy", () => {
  assert.equal(
    getAuthErrorMessage(en, "email_doesn't_match"),
    en.auth.socialEmailMismatch,
  );
  assert.equal(
    getAuthErrorMessage(en, "account_already_linked_to_different_user"),
    en.auth.socialAccountLinkedElsewhere,
  );
});

test("falls back to a generic social sign-in error for unknown codes", () => {
  assert.equal(getAuthErrorMessage(en, "issuer_mismatch"), en.auth.socialSignInError);
  assert.equal(getAuthErrorMessage(en, "anything_else"), en.auth.socialSignInError);
  assert.equal(getAuthErrorMessage(en, undefined), null);
});
