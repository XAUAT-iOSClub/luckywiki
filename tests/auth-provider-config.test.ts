import test from "node:test";
import assert from "node:assert/strict";
import {
  getAuthProviderFlags,
  getGitHubProviderConfig,
  getOidcProviderConfig,
  oidcProviderId,
} from "@/lib/auth/provider-config";

test("auth provider flags only enable providers with complete env", () => {
  const flags = getAuthProviderFlags({
    GITHUB_CLIENT_ID: "github-id",
    GITHUB_CLIENT_SECRET: "github-secret",
    OIDC_DISCOVERY_URL: "https://issuer.example/.well-known/openid-configuration",
    OIDC_CLIENT_ID: "oidc-id",
    OIDC_CLIENT_SECRET: "oidc-secret",
    OIDC_PROVIDER_NAME: "Campus SSO",
  });

  assert.equal(flags.githubEnabled, true);
  assert.equal(flags.oidcEnabled, true);
  assert.equal(flags.oidcProviderName, "Campus SSO");
});

test("auth provider flags keep providers hidden when env is incomplete", () => {
  const flags = getAuthProviderFlags({
    GITHUB_CLIENT_ID: "github-id",
    OIDC_DISCOVERY_URL: "https://issuer.example/.well-known/openid-configuration",
  });

  assert.equal(flags.githubEnabled, false);
  assert.equal(flags.oidcEnabled, false);
  assert.equal(flags.oidcProviderName, "SSO");
});

test("github config is only returned when both credentials are present", () => {
  assert.deepEqual(
    getGitHubProviderConfig({
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "github-secret",
    }),
    {
      clientId: "github-id",
      clientSecret: "github-secret",
    },
  );

  assert.equal(
    getGitHubProviderConfig({
      GITHUB_CLIENT_ID: "github-id",
    }),
    null,
  );
});

test("oidc config is only returned when discovery and credentials are present", () => {
  const config = getOidcProviderConfig({
    OIDC_DISCOVERY_URL: "https://issuer.example/.well-known/openid-configuration",
    OIDC_CLIENT_ID: "oidc-id",
    OIDC_CLIENT_SECRET: "oidc-secret",
  });

  assert.ok(config);
  assert.equal(config.providerId, oidcProviderId);
  assert.equal(config.discoveryUrl, "https://issuer.example/.well-known/openid-configuration");
  assert.deepEqual(config.scopes, ["openid", "profile", "email"]);
});

test("oidc profile mapping normalizes standard oidc fields", () => {
  const config = getOidcProviderConfig({
    OIDC_DISCOVERY_URL: "https://issuer.example/.well-known/openid-configuration",
    OIDC_CLIENT_ID: "oidc-id",
    OIDC_CLIENT_SECRET: "oidc-secret",
  });

  assert.ok(config);
  assert.deepEqual(
    config.mapProfileToUser({
      sub: "user-123",
      email: "User@Example.com",
      email_verified: true,
      name: "Lucky Fish",
      picture: "https://cdn.example.com/avatar.png",
    }),
    {
      id: "user-123",
      email: "user@example.com",
      emailVerified: true,
      image: "https://cdn.example.com/avatar.png",
      name: "Lucky Fish",
    },
  );
});
