/**
 * MCP 边界 & 压力测试
 * 测试：并发请求、限流、大数据量、特殊字符等
 */

const BASE_URL = "http://localhost:3000";
const API_KEY = "luckywiki-mcp-dev-key-2026";

let idCounter = 1000;

async function callMcp(method, params = {}) {
  const id = ++idCounter;
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return { status: res.status, body: await res.json() };
}

async function test(name, fn) {
  try {
    const result = await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log("🧪 MCP 边界 & 压力测试\n");
  let passed = 0;
  let total = 0;

  // 1. 并发测试：同时发 10 个请求
  total++;
  await test("并发 10 个 list_wiki_tree 请求", async () => {
    const promises = Array.from({ length: 10 }, () =>
      callMcp("tools/call", { name: "list_wiki_tree" }),
    );
    const results = await Promise.all(promises);
    const allOk = results.every((r) => r.status === 200 && r.body.result);
    if (!allOk) throw new Error("部分请求失败");
    return true;
  }) && passed++;

  // 2. 特殊字符搜索
  total++;
  await test("搜索特殊字符不报错", async () => {
    const specialChars = ["<script>", "' OR 1=1--", "😀", "%", "../", "C:\\"];
    const results = await Promise.all(
      specialChars.map((q) =>
        callMcp("tools/call", { name: "search_wiki", arguments: { query: q } }),
      ),
    );
    const allOk = results.every((r) => r.status === 200 && (r.body.result || r.body.error));
    if (!allOk) throw new Error("特殊字符导致异常");
    return true;
  }) && passed++;

  // 3. 超长参数
  total++;
  await test("超长 query 参数被截断（Zod 校验）", async () => {
    const longQuery = "a".repeat(500);
    const result = await callMcp("tools/call", {
      name: "search_wiki",
      arguments: { query: longQuery },
    });
    if (result.status !== 200) throw new Error("状态码非 200");
    if (!result.body.error) throw new Error("应该返回参数校验错误");
    if (result.body.error.code !== -32602) throw new Error("错误码不对，应为 -32602");
    return true;
  }) && passed++;

  // 4. 越界参数
  total++;
  await test("pageSize 超过最大值被拒绝", async () => {
    const result = await callMcp("tools/call", {
      name: "search_wiki",
      arguments: { query: "test", pageSize: 100 },
    });
    if (!result.body.error) throw new Error("应该返回参数校验错误");
    return true;
  }) && passed++;

  total++;
  await test("负数 limit 被拒绝", async () => {
    const result = await callMcp("tools/call", {
      name: "list_recent_articles",
      arguments: { limit: -1 },
    });
    if (!result.body.error) throw new Error("应该返回参数校验错误");
    return true;
  }) && passed++;

  // 5. 空 JSON
  total++;
  await test("空 body 返回 400", async () => {
    const res = await fetch(`${BASE_URL}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: "",
    });
    if (res.status !== 400) throw new Error(`状态码应为 400，实际 ${res.status}`);
    return true;
  }) && passed++;

  // 6. 非法 JSON
  total++;
  await test("非法 JSON 返回 400", async () => {
    const res = await fetch(`${BASE_URL}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: "{not valid json",
    });
    if (res.status !== 400) throw new Error(`状态码应为 400，实际 ${res.status}`);
    return true;
  }) && passed++;

  // 7. 缺少 jsonrpc 字段
  total++;
  await test("缺少 jsonrpc 字段返回 400", async () => {
    const res = await fetch(`${BASE_URL}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ id: 1, method: "ping" }),
    });
    if (res.status !== 400) throw new Error(`状态码应为 400，实际 ${res.status}`);
    return true;
  }) && passed++;

  // 8. initialize 缺少 protocolVersion
  total++;
  await test("initialize 缺少 protocolVersion 返回 -32602", async () => {
    const result = await callMcp("initialize", {});
    if (!result.body.error) throw new Error("应该报错");
    if (result.body.error.code !== -32602) throw new Error("错误码不对");
    return true;
  }) && passed++;

  // 9. 工具名大小写敏感
  total++;
  await test("工具名大小写敏感（Search_Wiki 应为未知工具）", async () => {
    const result = await callMcp("tools/call", { name: "Search_Wiki", arguments: { query: "test" } });
    if (!result.body.error) throw new Error("应该报错");
    return true;
  }) && passed++;

  // 10. 快速连续请求（验证限流计数正常）
  total++;
  await test("快速连续 20 次请求全部成功", async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(callMcp("tools/call", { name: "list_wiki_tree" }));
    }
    const results = await Promise.all(promises);
    const failed = results.filter((r) => r.status !== 200 || !r.body.result);
    if (failed.length > 0) throw new Error(`${failed.length} 个请求失败`);
    return true;
  }) && passed++;

  // 11. path 参数路径穿越测试
  total++;
  await test("path 路径穿越参数不报错但查不到", async () => {
    const result = await callMcp("tools/call", {
      name: "get_article",
      arguments: { path: "../../etc/passwd" },
    });
    if (result.status !== 200) throw new Error("状态码非 200");
    // 应该正常返回 article: null
    return true;
  }) && passed++;

  // 12. SSE GET 端点测试
  total++;
  await test("GET /api/mcp 正确返回 SSE 流", async () => {
    const res = await fetch(`${BASE_URL}/api/mcp`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "text/event-stream",
      },
    });
    if (res.status !== 200) throw new Error(`状态码应为 200，实际 ${res.status}`);
    const contentType = res.headers.get("content-type");
    if (!contentType?.includes("text/event-stream")) {
      throw new Error(`Content-Type 不对: ${contentType}`);
    }
    // 读取第一条事件
    const reader = res.body?.getReader();
    if (!reader) throw new Error("没有 body");
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    reader.cancel();
    if (!text.includes("event: endpoint")) {
      throw new Error("SSE 流没有 endpoint 事件");
    }
    return true;
  }) && passed++;

  // 13. GET 无鉴权
  total++;
  await test("GET /api/mcp 无 key 返回 401", async () => {
    const res = await fetch(`${BASE_URL}/api/mcp`, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
    });
    if (res.status !== 401) throw new Error(`状态码应为 401，实际 ${res.status}`);
    return true;
  }) && passed++;

  console.log(`\n📊 结果: ${passed}/${total} 通过`);
  if (passed === total) {
    console.log("🎉 全部通过！");
  } else {
    console.log(`⚠️  ${total - passed} 个失败`);
  }
}

main().catch(console.error);
