import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEmbeddingRequest,
  normalizeOpenAiBaseUrl,
  streamAgentAnswer,
  type WikiAgentRuntime,
} from "@/lib/agent/openai";

test("embedding requests omit dimensions unless the provider supports it", () => {
  assert.deepEqual(
    buildEmbeddingRequest(["hello"], {
      OPENAI_EMBEDDING_MODEL: "bge-m3",
      AGENT_EMBEDDING_DIMENSIONS: "1024",
    }),
    { model: "bge-m3", input: ["hello"] },
  );

  assert.deepEqual(
    buildEmbeddingRequest(["hello"], {
      OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
      AGENT_EMBEDDING_DIMENSIONS: "1024",
      OPENAI_EMBEDDING_DIMENSIONS: "1024",
    }),
    { model: "text-embedding-3-small", input: ["hello"], dimensions: 1024 },
  );
});

test("embedding request dimensions must match the vector column", () => {
  assert.throws(
    () =>
      buildEmbeddingRequest(["hello"], {
        AGENT_EMBEDDING_DIMENSIONS: "1024",
        OPENAI_EMBEDDING_DIMENSIONS: "1536",
      }),
    /must match/,
  );
});

test("normalizeOpenAiBaseUrl accepts gateway roots and preserves /v1", () => {
  assert.equal(
    normalizeOpenAiBaseUrl("https://newapi.example.com"),
    "https://newapi.example.com/v1",
  );
  assert.equal(
    normalizeOpenAiBaseUrl("https://newapi.example.com/v1/"),
    "https://newapi.example.com/v1",
  );
});

test("streamAgentAnswer forwards messages into the agent runtime and streams deltas", async () => {
  const deltas: string[] = [];
  const runtime: WikiAgentRuntime = {
    async createAgent({ locale, context }) {
      assert.equal(locale, "zh");
      assert.equal(context[0]?.path, "生活/校园卡");

      return {
        async stream(state, config) {
          assert.equal(config.streamMode, "messages");
          assert.equal(state.messages.length, 2);
          assert.equal(state.messages[0]?.role, "user");
          assert.equal(state.messages[1]?.role, "assistant");

          async function* iterator() {
            yield [{ content: "可以" }];
            yield [{ content: "去服务大厅补办。" }];
          }

          return iterator();
        },
      };
    },
  };

  await streamAgentAnswer(
    {
      locale: "zh",
      context: [
        {
          title: "校园卡",
          path: "生活/校园卡",
          heading: "补办",
          content: "校园卡丢失后可以去服务大厅补办。",
        },
      ],
      messages: [
        { role: "user", content: "校园卡怎么补办？" },
        { role: "assistant", content: "我先帮你查一下。" },
      ],
      onDelta(delta) {
        deltas.push(delta);
      },
    },
    runtime,
  );

  assert.deepEqual(deltas, ["可以", "去服务大厅补办。"]);
});
