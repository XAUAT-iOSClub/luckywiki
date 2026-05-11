import type { Dictionary } from "@/lib/i18n/get-dictionary";

export function getAuthErrorMessage(
  dictionary: Dictionary,
  code: string | null | undefined,
) {
  switch (code) {
    case "email_is_missing":
    case "email_not_found":
    case "user_email_not_found":
      return dictionary.auth.socialEmailMissing;
    case "account_not_linked":
    case "oauth_account_not_linked":
    case "oauth_email_not_verified":
    case "unable_to_link_account":
      return dictionary.auth.socialEmailUnverified;
    case "account_already_linked_to_different_user":
      return dictionary.auth.socialAccountLinkedElsewhere;
    case "email_doesn't_match":
      return dictionary.auth.socialEmailMismatch;
    case "provider_not_found":
      return dictionary.auth.socialProviderUnavailable;
    case "oauth_code_verification_failed":
    case "user_info_is_missing":
    case "name_is_missing":
    case "issuer_mismatch":
    case "issuer_missing":
    case "callback_url_not_found":
    case "oauth_provider_not_found":
      return dictionary.auth.socialSignInError;
    default:
      return code ? dictionary.auth.socialSignInError : null;
  }
}
