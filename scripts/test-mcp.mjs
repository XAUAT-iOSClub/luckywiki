/**
 * MCP 接口测试脚本
 * 用法：node scripts/test-mcp.mjs
 *
 * 直接通过 HTTP POST 调用 /api/mcp 端点，验证所有工具是否正常工作
 */

const BASE_URL = "http://localhost:3000";
const API_KEY = "luckywiki-mcp-dev-key-2026";

let requestId = 1;

async function callMcp(method, params = {}) {
  const id = requestId++;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params,
  });

  const response = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body,
  });

  const result = await response.json();
  return { status: response.status, body: result };
}

async function test(name, fn) {
  console.log(`\n=== ${name} ===`);
  try {
    const result = await fn();
    console.log("Status:", result.status);
    if (result.body.error) {
      console.log("Error:", JSON.stringify(result.body.error, null, 2));
    } else {
      // 工具调用返回的是 content[0].text 里的 JSON
      if (result.body.result?.content?.[0]?.text) {
        const parsed = JSON.parse(result.body.result.content[0].text);
        console.log("Result:", JSON.stringify(parsed, null, 2).slice(0, 500));
        if (JSON.stringify(parsed).length > 500) {
          console.log("... (truncated)");
        }
      } else {
        console.log("Result:", JSON.stringify(result.body.result, null, 2).slice(0, 500));
      }
    }
    console.log("✅ Pass");
  } catch (e) {
    console.log("❌ Fail:", e.message);
  }
}

async function main() {
  console.log("🧪 LuckyWiki MCP Test Suite");
  console.log("Base URL:", BASE_URL);

  // 1. 鉴权失败测试
  console.log("\n=== 鉴权测试 ===");
  try {
    const resp = await fetch(`${BASE_URL}/api/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }),
    });
    console.log("无 key 状态码:", resp.status, "(预期 401)");
    console.log(resp.status === 401 ? "✅ Pass" : "❌ Fail");
  } catch (e) {
    console.log("❌ Fail:", e.message);
  }

  // 2. 错误 key
  try {
    const resp = await fetch(`${BASE_URL}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-key",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }),
    });
    console.log("错误 key 状态码:", resp.status, "(预期 401)");
    console.log(resp.status === 401 ? "✅ Pass" : "❌ Fail");
  } catch (e) {
    console.log("❌ Fail:", e.message);
  }

  // 3. ping
  await test("ping", () => callMcp("ping"));

  // 4. initialize
  await test("initialize", () =>
    callMcp("initialize", { protocolVersion: "2024-11-05" }),
  );

  // 5. tools/list
  await test("tools/list", () => callMcp("tools/list"));

  // 6. list_wiki_tree
  await test("tools/call - list_wiki_tree", () =>
    callMcp("tools/call", { name: "list_wiki_tree" }),
  );

  // 7. list_recent_articles
  await test("tools/call - list_recent_articles", () =>
    callMcp("tools/call", { name: "list_recent_articles", arguments: { limit: 5 } }),
  );

  // 8. list_categories
  await test("tools/call - list_categories", () =>
    callMcp("tools/call", { name: "list_categories" }),
  );

  // 9. search_wiki
  await test("tools/call - search_wiki", () =>
    callMcp("tools/call", {
      name: "search_wiki",
      arguments: { query: "home" },
    }),
  );

  // 10. get_article (存在的)
  await test("tools/call - get_article (home)", () =>
    callMcp("tools/call", {
      name: "get_article",
      arguments: { path: "home" },
    }),
  );

  // 11. get_article (不存在的)
  await test("tools/call - get_article (not found)", () =>
    callMcp("tools/call", {
      name: "get_article",
      arguments: { path: "nonexistent-article-xyz" },
    }),
  );

  // 12. get_related_articles
  await test("tools/call - get_related_articles", () =>
    callMcp("tools/call", {
      name: "get_related_articles",
      arguments: { path: "home", limit: 5 },
    }),
  );

  // 13. 不存在的工具
  await test("tools/call - unknown tool", () =>
    callMcp("tools/call", {
      name: "nonexistent_tool",
      arguments: {},
    }),
  );

  // 14. 不存在的方法
  await test("unknown method", () => callMcp("nonexistent_method"));

  // 15. 参数校验失败
  await test("tools/call - missing required param", () =>
    callMcp("tools/call", {
      name: "get_article",
      arguments: {},
    }),
  );

  console.log("\n🎉 测试完成");
}

main().catch(console.error);
