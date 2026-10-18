import test from "node:test";
import assert from "node:assert/strict";
import {
  createChatCompletion,
  extractChatCompletionText,
} from "@/lib/openai/chat";
import {
  EmptyArticleContentError,
  buildArticleSummaryPrompt,
  generateArticleSummary,
  normalizeGeneratedSummary,
  prepareArticleSummarySource,
} from "@/lib/articles/summary";
import { resolveArticleDescription } from "@/lib/text";

test("prepareArticleSummarySource strips markdown, HTML, scripts, and styles", () => {
  const source = prepareArticleSummarySource(
    [
      "# Title",
      "",
      "**Body** [link](https://example.com)",
      "",
      "![alt](image.png)",
      "",
      "```ts",
      "const hidden = true;",
      "```",
      "",
      "<script>alert(1)</script>",
      "<style>.hidden { display: none; }</style>",
      "<p>HTML text</p>",
    ].join("\n"),
  );

  assert.match(source.text, /Title/);
  assert.match(source.text, /Body/);
  assert.match(source.text, /link/);
  assert.match(source.text, /HTML text/);
  assert.doesNotMatch(source.text, /https:\/\/example\.com/);
  assert.doesNotMatch(source.text, /image\.png/);
  assert.doesNotMatch(source.text, /const hidden/);
  assert.doesNotMatch(source.text, /alert\(1\)/);
  assert.doesNotMatch(source.text, /display: none/);
  assert.equal(source.truncated, false);
});

test("prepareArticleSummarySource truncates long content", () => {
  const source = prepareArticleSummarySource("a".repeat(12_001));

  assert.equal(source.text.length, 12_000);
  assert.equal(source.truncated, true);
});

test("prepareArticleSummarySource handles empty input", () => {
  const source = prepareArticleSummarySource("   \n\n  ");

  assert.equal(source.text, "");
  assert.equal(source.truncated, false);
});

test("buildArticleSummaryPrompt includes the source and safety rules", () => {
  const prompt = buildArticleSummaryPrompt({
    title: "Campus card",
    markdown: "",
    locale: "zh",
    sourceText: "Card replacement information.",
    truncated: false,
  });

  assert.match(prompt.systemPrompt, /untrusted source material/i);
  assert.match(prompt.systemPrompt, /280 characters/i);
  assert.match(prompt.userPrompt, /Admin UI language: zh/);
  assert.match(prompt.userPrompt, /Article title: Campus card/);
  assert.match(prompt.userPrompt, /<article>\nCard replacement information\.\n<\/article>/);
  assert.doesNotMatch(prompt.userPrompt, /longer than 12000 characters/);
});

test("buildArticleSummaryPrompt includes a truncation note when needed", () => {
  const prompt = buildArticleSummaryPrompt({
    title: "",
    markdown: "",
    locale: "en",
    sourceText: "Beginning of a long article.",
    truncated: true,
  });

  assert.match(prompt.userPrompt, /Article title: \(untitled\)/);
  assert.match(prompt.userPrompt, /longer than 12000 characters/);
});

test("normalizeGeneratedSummary removes labels, quotes, and markdown", () => {
  assert.equal(normalizeGeneratedSummary('Summary: "Hello world"'), "Hello world");
  assert.equal(normalizeGeneratedSummary("摘要：你好。"), "你好。");
  assert.equal(normalizeGeneratedSummary("**Hello** [link](https://example.com)"), "Hello link");
  assert.equal(normalizeGeneratedSummary("```text\n摘要内容。\n```"), "摘要内容。");
  assert.equal(normalizeGeneratedSummary("   "), "");
});

test("normalizeGeneratedSummary enforces the 280-character limit", () => {
  const normalized = normalizeGeneratedSummary("a".repeat(300));

  assert.equal(normalized.length, 280);
  assert.ok(normalized.endsWith("…"));
});

test("normalizeGeneratedSummary prefers a sentence boundary when truncating", () => {
  const normalized = normalizeGeneratedSummary(
    `${"a".repeat(200)}。${"b".repeat(100)}`,
  );

  assert.ok(normalized.endsWith("。"));
  assert.ok(normalized.length <= 280);
});

test("generateArticleSummary uses the injected generator and normalizes output", async () => {
  let capturedUserPrompt = "";

  const summary = await generateArticleSummary(
    {
      title: "Campus card",
      markdown: "# Replacement\n\nGo to the service hall to replace your card.",
      locale: "zh",
    },
    {
      generate: async (prompt) => {
        capturedUserPrompt = prompt.userPrompt;
        return " Summary: 去服务大厅补办校园卡。 ";
      },
    },
  );

  assert.equal(summary, "去服务大厅补办校园卡。");
  assert.match(capturedUserPrompt, /Go to the service hall/);
});

test("generateArticleSummary rejects empty article content", async () => {
  await assert.rejects(
    () =>
      generateArticleSummary({
        title: "Empty",
        markdown: "   ",
        locale: "en",
      }),
    EmptyArticleContentError,
  );
});

test("generateArticleSummary rejects an empty generator result", async () => {
  await assert.rejects(
    () =>
      generateArticleSummary(
        {
          title: "Title",
          markdown: "Some content.",
          locale: "en",
        },
        {
          generate: async () => "   ",
        },
      ),
    /empty summary/,
  );
});

test("createChatCompletion posts to the configured gateway and parses content", async () => {
  const requests: Array<{ init?: RequestInit; url: string }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ init, url: String(input) });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "Summary text." } }],
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  }) as typeof fetch;

  const text = await createChatCompletion({
    systemPrompt: "System prompt",
    userPrompt: "User prompt",
    env: {
      NODE_ENV: "test",
      OPENAI_API_KEY: "test-key",
      OPENAI_API_BASE_URL: "https://gateway.example.com",
      OPENAI_RESPONSES_MODEL: "test-model",
    },
    fetchImpl,
  });

  assert.equal(text, "Summary text.");
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.url,
    "https://gateway.example.com/v1/chat/completions",
  );
  assert.deepEqual(requests[0]?.init?.headers, {
    "Content-Type": "application/json",
    Authorization: "Bearer test-key",
  });

  const body = JSON.parse(String(requests[0]?.init?.body)) as {
    max_tokens: number;
    messages: Array<{ content: string; role: string }>;
    model: string;
    temperature: number;
  };

  assert.equal(body.model, "test-model");
  assert.deepEqual(body.messages, [
    { role: "system", content: "System prompt" },
    { role: "user", content: "User prompt" },
  ]);
  assert.equal(body.temperature, 0.2);
  assert.equal(body.max_tokens, 600);
});

test("extractChatCompletionText handles content parts and legacy choices", () => {
  assert.equal(
    extractChatCompletionText({
      choices: [
        {
          message: {
            content: [
              { type: "text", text: "A" },
              { type: "text", text: "B" },
            ],
          },
        },
      ],
    }),
    "AB",
  );
  assert.equal(
    extractChatCompletionText({ choices: [{ text: "Legacy text" }] }),
    "Legacy text",
  );
  assert.equal(extractChatCompletionText({}), "");
});

test("createChatCompletion rejects provider failures", async () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    OPENAI_API_KEY: "test-key",
    OPENAI_API_BASE_URL: "https://gateway.example.com",
  };
  const failingFetch = (async () =>
    new Response("provider error", { status: 500 })) as typeof fetch;
  const emptyFetch = (async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: "" } }] }),
      { status: 200 },
    )) as typeof fetch;

  await assert.rejects(
    () =>
      createChatCompletion({
        systemPrompt: "system",
        userPrompt: "user",
        env,
        fetchImpl: failingFetch,
      }),
    /chat completion request failed/,
  );

  await assert.rejects(
    () =>
      createChatCompletion({
        systemPrompt: "system",
        userPrompt: "user",
        env,
        fetchImpl: emptyFetch,
      }),
    /empty summary/,
  );

  await assert.rejects(
    () =>
      createChatCompletion({
        systemPrompt: "system",
        userPrompt: "user",
        env: {
          NODE_ENV: "test",
          OPENAI_API_BASE_URL: "https://gateway.example.com",
        },
        fetchImpl: failingFetch,
      }),
    /OPENAI_API_KEY/,
  );
});

test("resolveArticleDescription prefers the manual summary and truncates for metadata", () => {
  assert.equal(
    resolveArticleDescription("  Hand-written summary  ", "# Body"),
    "Hand-written summary",
  );
  assert.equal(
    resolveArticleDescription(null, "# Body text"),
    "Body text",
  );

  const resolved = resolveArticleDescription("a".repeat(300), "");
  assert.equal(resolved.length, 160);
  assert.ok(resolved.endsWith("…"));
  assert.equal(resolveArticleDescription(null, ""), "");
});
