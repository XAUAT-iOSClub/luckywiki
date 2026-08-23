import test from "node:test";
import assert from "node:assert/strict";
import { createAgentRouteResponse } from "@/lib/agent/route";
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
      async streamAnswer({ messages, onDelta }) {
        assert.equal(messages.length, 1);
        assert.equal(messages[0]?.role, "user");
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
  assert.match(text, /event: done/);
});

test("agent route still streams when wiki retrieval misses", async () => {
  let streamAnswerCalled = false;

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
      async streamAnswer({ context, onDelta }) {
        streamAnswerCalled = true;
        assert.equal(context.length, 0);
        onDelta("请先查看学校总览。");
      },
    },
  );

  const text = await response.text();

  assert.equal(streamAnswerCalled, true);
  assert.match(text, /学校\/学院总览/);
  assert.match(text, /请先查看学校总览/);
});

test("agent route continues when semantic retrieval is unavailable", async () => {
  let streamAnswerCalled = false;

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
        throw new Error("embedding model is unavailable");
      },
      async findSuggestedSources() {
        return [];
      },
      async streamAnswer({ onDelta }) {
        streamAnswerCalled = true;
        onDelta("请查看校园卡文章。");
      },
    },
  );

  const text = await response.text();

  assert.equal(streamAnswerCalled, true);
  assert.match(text, /请查看校园卡文章/);
  assert.match(text, /event: done/);
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
