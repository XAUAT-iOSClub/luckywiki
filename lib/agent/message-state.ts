export function resolveAgentMessageContentOnError(
  currentContent: string,
  fallbackContent: string,
) {
  return currentContent.trim().length > 0 ? currentContent : fallbackContent;
}
