const defaultEmbeddingDimensions = 1024;

export function getEmbeddingDimensions(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.AGENT_EMBEDDING_DIMENSIONS);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : defaultEmbeddingDimensions;
}
