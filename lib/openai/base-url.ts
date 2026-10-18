export const defaultApiBaseUrl = "https://api.openai.com/v1";

/**
 * OpenAI-compatible gateways are commonly configured with either their root
 * URL or the complete `/v1` API URL. Keep both forms working for the SDK and
 * direct HTTP requests.
 */
export function normalizeOpenAiBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return defaultApiBaseUrl;
  }

  const url = new URL(trimmed);

  if (url.pathname === "") {
    url.pathname = "/v1";
  } else if (url.pathname === "/") {
    url.pathname = "/v1";
  }

  return url.toString().replace(/\/$/, "");
}

export function buildOpenAiUrl(
  pathname: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const baseUrl = normalizeOpenAiBaseUrl(
    env.OPENAI_API_BASE_URL ?? defaultApiBaseUrl,
  );
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return new URL(normalizedPath, normalizedBase).toString();
}

export function getOpenAiHeaders(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export function isOpenAiConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.OPENAI_API_KEY);
}
