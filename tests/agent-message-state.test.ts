import test from "node:test";
import assert from "node:assert/strict";
import { resolveAgentMessageContentOnError } from "@/lib/agent/message-state";

test("resolveAgentMessageContentOnError keeps existing streamed content", () => {
  assert.equal(
    resolveAgentMessageContentOnError("已经生成好的回答", "发生错误"),
    "已经生成好的回答",
  );
});

test("resolveAgentMessageContentOnError falls back when content is empty", () => {
  assert.equal(resolveAgentMessageContentOnError("", "发生错误"), "发生错误");
  assert.equal(resolveAgentMessageContentOnError("   ", "发生错误"), "发生错误");
});
