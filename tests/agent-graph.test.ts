import test from "node:test";
import assert from "node:assert/strict";
import { createWikiQaGraph } from "@/lib/agent/graph";

test("wiki QA graph retries retrieval when the first model pass is empty", async () => {
  const retrievedQueries: string[] = [];
  const deltas: string[] = [];
  let calls = 0;

  const graph = createWikiQaGraph({
    async createAgent({ context }) {
      calls += 1;

      return {
        async stream() {
          async function* output() {
            if (context.length > 0) {
              yield [{ content: "根据 Wiki，答案在这里。" }];
            }
          }

          return output();
        },
      };
    },
    async retrieveRelevantChunks(query) {
      retrievedQueries.push(query);
      return [
        {
          title: "校园卡",
          path: "生活/校园卡",
          heading: "补办",
          content: "去服务大厅补办。",
          score: 0.9,
        },
      ];
    },
    onDelta(delta) {
      deltas.push(delta);
    },
  });

  await graph.invoke({
    locale: "zh",
    messages: [{ role: "user", content: "校园卡怎么补办？" }],
    context: [],
  });

  assert.equal(calls, 2);
  assert.deepEqual(retrievedQueries, ["校园卡怎么补办？"]);
  assert.deepEqual(deltas, ["根据 Wiki，答案在这里。"]);
});

test("wiki QA graph returns a localized fallback when no model text is produced", async () => {
  const deltas: string[] = [];
  const graph = createWikiQaGraph({
    createAgent: async () => ({
      async stream() {
        async function* output() {
          yield [{ content: "" }];
        }

        return output();
      },
    }),
    onDelta(delta) {
      deltas.push(delta);
    },
  });

  const result = await graph.invoke({
    locale: "en",
    messages: [{ role: "user", content: "Unknown" }],
    context: [],
  });

  assert.equal(
    result.answer,
    "The wiki does not contain enough information to answer this question.",
  );
  assert.deepEqual(deltas, [result.answer]);
});
