import test from "node:test";
import assert from "node:assert/strict";
import { createAgentRouteResponse } from "@/lib/agent-route";
import { streamAgentAnswer } from "@/lib/agent-openai";
import { zh } from "@/lib/i18n/dictionaries/zh";

test("agent route streams model output with sources", async () => {
  const response = await createAgentRouteResponse(
    new Request("http://localhost/api/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locale: "zh",
        messages: [{ role: "user", content: "校园卡怎么补办？" }],
      }),
    }),
    {
      async getDictionary() {
        return zh;
      },
      async retrieveRelevantChunks() {
        return [
          {
            title: "校园卡",
            path: "生活/校园卡",
            heading: "补办",
            content: "校园卡丢失后可以去服务大厅补办。",
            score: 0.92,
          },
        ];
      },
      async findSuggestedSources() {
        return [];
      },
      async streamAnswer({ onDelta }) {
        onDelta("可以去服务大厅补办。");
      },
    },
  );

  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const text = await response.text();

  assert.match(text, /event: sources/);
  assert.match(text, /生活\/校园卡/);
  assert.match(text, /event: delta/);
  assert.match(text, /服务大厅补办/);
});

test("agent route falls back when no wiki chunk matches", async () => {
  const response = await createAgentRouteResponse(
    new Request("http://localhost/api/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locale: "zh",
        messages: [{ role: "user", content: "完全无关的问题" }],
      }),
    }),
    {
      async getDictionary() {
        return zh;
      },
      async retrieveRelevantChunks() {
        return [];
      },
      async findSuggestedSources() {
        return [{ title: "学校总览", path: "学校/学院总览" }];
      },
      async streamAnswer() {
        throw new Error("streamAnswer should not run when there is no match");
      },
    },
  );

  const text = await response.text();

  assert.match(text, /学校\/学院总览/);
  assert.match(text, /没有在当前 Wiki 中找到足够的信息/);
});

test("agent route ignores empty assistant placeholder messages", async () => {
  const response = await createAgentRouteResponse(
    new Request("http://localhost/api/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locale: "zh",
        messages: [
          { role: "user", content: "校园卡怎么补办？" },
          { role: "assistant", content: "" },
        ],
      }),
    }),
    {
      async getDictionary() {
        return zh;
      },
      async retrieveRelevantChunks() {
        return [
          {
            title: "校园卡",
            path: "生活/校园卡",
            heading: "补办",
            content: "校园卡丢失后可以去服务大厅补办。",
            score: 0.92,
          },
        ];
      },
      async findSuggestedSources() {
        return [];
      },
      async streamAnswer({ messages, onDelta }) {
        assert.equal(messages.length, 1);
        assert.equal(messages[0]?.role, "user");
        onDelta("可以去服务大厅补办。");
      },
    },
  );

  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const text = await response.text();

  assert.match(text, /服务大厅补办/);
});

test("streamAgentAnswer formats user and assistant history for the Responses API", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body));

    assert.deepEqual(body.input, [
      {
        role: "user",
        content: [{ type: "input_text", text: "校园卡怎么补办？" }],
      },
      {
        role: "assistant",
        content: [{ type: "output_text", text: "可以去服务大厅补办。" }],
      },
    ]);

    return new Response("data: [DONE]\n\n", {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    });
  }) as typeof fetch;

  try {
    process.env.OPENAI_API_KEY = "test-key";

    await streamAgentAnswer({
      locale: "zh",
      context: [],
      messages: [
        { role: "user", content: "校园卡怎么补办？" },
        { role: "assistant", content: "可以去服务大厅补办。" },
      ],
      onDelta() {},
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
  }
});
