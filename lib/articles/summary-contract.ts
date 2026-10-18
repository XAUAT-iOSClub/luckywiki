export const MAX_SUMMARY_INPUT_MARKDOWN_CHARS = 24_000;
export const MAX_SUMMARY_SOURCE_CHARS = 12_000;
export const MAX_SUMMARY_DESCRIPTION_CHARS = 280;

export type ArticleSummaryActionInput = {
  title: string;
  markdown: string;
};

export type ArticleSummaryErrorCode =
  | "invalid_input"
  | "not_configured"
  | "rate_limited"
  | "unavailable"
  | "empty_content"
  | "generation_failed";

export type ArticleSummaryActionResult =
  | { summary: string }
  | { error: string; code: ArticleSummaryErrorCode };

export type ArticleSummaryAction = (
  input: ArticleSummaryActionInput,
) => Promise<ArticleSummaryActionResult>;
