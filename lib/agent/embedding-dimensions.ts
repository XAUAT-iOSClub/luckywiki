const defaultEmbeddingDimensions = 1024;

export function getEmbeddingDimensions(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const parsed = Number(env.AGENT_EMBEDDING_DIMENSIONS);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : defaultEmbeddingDimensions;
}

export function getEmbeddingRequestDimensions(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const value = env.OPENAI_EMBEDDING_DIMENSIONS?.trim();

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("OPENAI_EMBEDDING_DIMENSIONS must be a positive integer.");
  }

  return parsed;
}
