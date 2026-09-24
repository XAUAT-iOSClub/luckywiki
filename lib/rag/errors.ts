export class RagAuthError extends Error {
  constructor(
    public code:
      | "missing_token"
      | "invalid_api_key"
      | "rag_api_disabled",
    message: string,
  ) {
    super(message);
    this.name = "RagAuthError";
  }
}

export class RagRateLimitError extends Error {
  constructor(public resetAt: number) {
    super("rate limit exceeded");
    this.name = "RagRateLimitError";
  }
}

export class RagValidationError extends Error {
  constructor(
    public code: "invalid_json" | "validation_error",
    message: string,
  ) {
    super(message);
    this.name = "RagValidationError";
  }
}

export class RagServiceError extends Error {
  constructor(
    public code: "vector_unavailable" | "search_failed",
    message: string,
  ) {
    super(message);
    this.name = "RagServiceError";
  }
}
