type AuthEnv = NodeJS.ProcessEnv;

export const oidcProviderId = "oidc";

export type AuthProviderFlags = {
  githubEnabled: boolean;
  oidcEnabled: boolean;
  oidcProviderName: string;
};

function hasValues(values: Array<string | undefined>) {
  return values.every((value) => typeof value === "string" && value.length > 0);
}

export function getAuthProviderFlags(env: AuthEnv = process.env): AuthProviderFlags {
  return {
    githubEnabled: hasValues([env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET]),
    oidcEnabled: hasValues([
      env.OIDC_DISCOVERY_URL,
      env.OIDC_CLIENT_ID,
      env.OIDC_CLIENT_SECRET,
    ]),
    oidcProviderName: env.OIDC_PROVIDER_NAME?.trim() || "SSO",
  };
}

export function getGitHubProviderConfig(env: AuthEnv = process.env) {
  if (!getAuthProviderFlags(env).githubEnabled) {
    return null;
  }

  return {
    clientId: env.GITHUB_CLIENT_ID!,
    clientSecret: env.GITHUB_CLIENT_SECRET!,
  };
}

export function getOidcProviderConfig(env: AuthEnv = process.env) {
  const flags = getAuthProviderFlags(env);

  if (!flags.oidcEnabled) {
    return null;
  }

  return {
    providerId: oidcProviderId,
    discoveryUrl: env.OIDC_DISCOVERY_URL!,
    clientId: env.OIDC_CLIENT_ID!,
    clientSecret: env.OIDC_CLIENT_SECRET!,
    scopes: ["openid", "profile", "email"],
    mapProfileToUser(profile: Record<string, unknown>) {
      const email =
        typeof profile.email === "string" ? profile.email.toLowerCase() : undefined;
      const name =
        typeof profile.name === "string"
          ? profile.name
          : typeof profile.preferred_username === "string"
            ? profile.preferred_username
            : email;
      const image =
        typeof profile.picture === "string"
          ? profile.picture
          : typeof profile.avatar_url === "string"
            ? profile.avatar_url
            : undefined;
      const id =
        typeof profile.sub === "string"
          ? profile.sub
          : typeof profile.id === "string"
            ? profile.id
            : typeof profile.id === "number"
              ? String(profile.id)
              : undefined;
      const emailVerified =
        profile.email_verified === true ||
        profile.emailVerified === true ||
        profile.verified_email === true;

      return {
        id,
        email,
        emailVerified,
        image,
        name,
      };
    },
  };
}
