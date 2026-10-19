"use server";

import { z } from "zod";
import { isOpenAiConfigured } from "@/lib/openai/base-url";
import {
  EmptyArticleContentError,
  generateArticleSummary,
} from "@/lib/articles/summary";
import {
  MAX_SUMMARY_INPUT_MARKDOWN_CHARS,
  type ArticleSummaryActionInput,
  type ArticleSummaryActionResult,
} from "@/lib/articles/summary-contract";
import { requireAuthorSession } from "@/lib/auth/session";
import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import {
  checkDistributedRateLimit,
  RateLimitConfigurationError,
} from "@/lib/rate-limit";

const summaryInputSchema = z.object({
  title: z.string().trim().max(300),
  markdown: z.string().max(MAX_SUMMARY_INPUT_MARKDOWN_CHARS),
});

let warnedAboutRateLimitConfiguration = false;

export async function generateArticleSummaryAction(
  locale: Locale,
  input: ArticleSummaryActionInput,
): Promise<ArticleSummaryActionResult> {
  const [session, dictionary] = await Promise.all([
    requireAuthorSession(locale),
    getDictionary(locale),
  ]);
  const parsed = summaryInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      error: dictionary.feedback.invalidArticleInput,
      code: "invalid_input",
    };
  }

  if (!isOpenAiConfigured()) {
    return {
      error: dictionary.feedback.summaryNotConfigured,
      code: "not_configured",
    };
  }

  try {
    const rateLimit = await checkDistributedRateLimit(
      "article-summary",
      session.user.id,
      10,
      60 * 60_000,
    );

    if (!rateLimit.allowed) {
      return {
        error: dictionary.feedback.summaryRateLimited,
        code: "rate_limited",
      };
    }
  } catch (error) {
    if (error instanceof RateLimitConfigurationError) {
      if (process.env.NODE_ENV === "production") {
        return {
          error: dictionary.feedback.summaryUnavailable,
          code: "unavailable",
        };
      }

      if (!warnedAboutRateLimitConfiguration) {
        console.warn(
          "[summary] Distributed rate limiting is not configured; allowing AI summaries in development.",
        );
        warnedAboutRateLimitConfiguration = true;
      }
    } else {
      console.error("[summary] rate limit check failed", error);
      return {
        error: dictionary.feedback.summaryUnavailable,
        code: "unavailable",
      };
    }
  }

  try {
    const summary = await generateArticleSummary({
      title: parsed.data.title,
      markdown: parsed.data.markdown,
      locale,
    });

    return { summary };
  } catch (error) {
    if (error instanceof EmptyArticleContentError) {
      return {
        error: dictionary.feedback.summaryEmptyContent,
        code: "empty_content",
      };
    }

    console.error("[summary] generation failed", error);
    return {
      error: dictionary.feedback.summaryGenerationFailed,
      code: "generation_failed",
    };
  }
}
