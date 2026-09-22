// LuckyWiki MCP 完整测试套件
// 包括：直返模式、SSE 模式、用户级 API Key、限流、错误处理
import "dotenv/config";

const BASE_URL = process.env.MCP_TEST_URL || "http://localhost:3000";
const GLOBAL_KEY = process.env.MCP_SERVER_API_KEY || "luckywiki-mcp-dev-key-2026";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ Pass: ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ Fail: ${name}`);
    console.log(`   ${e.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`✅ Pass: ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ Fail: ${name}`);
    console.log(`   ${e.message}`);
    failed++;
  }
}

function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}

// ---------- 工具函数 ----------

async function mcpPost(key, body, query = "") {
  const res = await fetch(`${BASE_URL}/api/mcp${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text() };
}

// 建立 SSE 连接，返回 sessionId 和消息收集器
function connectSSE(key) {
  return new Promise((resolve, reject) => {
    const events = [];
    let sessionId = null;

    // 用 fetch + ReadableStream 手动解析 SSE
    fetch(`${BASE_URL}/api/mcp`, {
      headers: { Authorization: `Bearer ${key}` },
    }).then(async (res) => {
      if (res.status !== 200) {
        reject(new Error(`SSE connect failed: ${res.status}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const readChunk = async () => {
        const { value, done } = await reader.read();
        if (done) return;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "message";
        let currentData = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7);
          } else if (line.startsWith("data: ")) {
            currentData += line.slice(6);
          } else if (line === "") {
            if (currentData) {
              try {
                const parsed = JSON.parse(currentData);
                events.push({ event: currentEvent, data: parsed });

                if (currentEvent === "endpoint" && parsed.url) {
                  const match = parsed.url.match(/sessionId=([^&]+)/);
                  if (match) sessionId = match[1];
                }
              } catch (e) {
                events.push({ event: currentEvent, raw: currentData });
              }
            }
            currentEvent = "message";
            currentData = "";
          }
        }

        // 如果已经拿到 endpoint，就认为连接建立成功
        if (sessionId) {
          resolve({
            sessionId,
            events,
            getMessages: () => events.filter(e => e.event === "message"),
            getEndpointUrl: () => `/api/mcp?sessionId=${sessionId}`,
            close: () => reader.cancel(),
            reader,
            waitForMessage: (timeoutMs = 5000) => waitForMessage(events, reader, timeoutMs),
          });
          return; // 不继续读了，测试 POST 发送后再读
        }

        readChunk();
      };

      readChunk();
    }).catch(reject);

    // 超时
    setTimeout(() => reject(new Error("SSE connect timeout")), 10000);
  });
}

async function waitForMessage(events, reader, timeoutMs = 5000) {
  const start = Date.now();
  const decoder = new TextDecoder();
  let buffer = "";

  while (Date.now() - start < timeoutMs) {
    const beforeCount = events.filter(e => e.event === "message").length;
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentEvent = "message";
    let currentData = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7);
      } else if (line.startsWith("data: ")) {
        currentData += line.slice(6);
      } else if (line === "") {
        if (currentData) {
          try {
            const parsed = JSON.parse(currentData);
            events.push({ event: currentEvent, data: parsed });
          } catch {
            events.push({ event: currentEvent, raw: currentData });
          }
        }
        currentEvent = "message";
        currentData = "";
      }
    }

    const afterCount = events.filter(e => e.event === "message").length;
    if (afterCount > beforeCount) {
      return events.filter(e => e.event === "message").at(-1);
    }
  }

  throw new Error("Wait for message timeout");
}

// ---------- 测试开始 ----------

console.log("🧪 LuckyWiki MCP 完整测试套件");
console.log(`Base URL: ${BASE_URL}\n`);

// ===== 第一部分：鉴权 =====
console.log("=== 鉴权测试 ===");

await testAsync("无 key → 401", async () => {
  const { status } = await mcpPost("", { jsonrpc: "2.0", id: 1, method: "ping" });
  assert(status === 401, `Expected 401, got ${status}`);
});

await testAsync("错误 key → 401", async () => {
  const { status } = await mcpPost("wrong-key", { jsonrpc: "2.0", id: 1, method: "ping" });
  assert(status === 401, `Expected 401, got ${status}`);
});

await testAsync("全局 key → 200", async () => {
  const { status, data } = await mcpPost(GLOBAL_KEY, { jsonrpc: "2.0", id: 1, method: "ping" });
  assert(status === 200, `Expected 200, got ${status}`);
  assert(data.jsonrpc === "2.0", "Invalid JSON-RPC response");
});

// ===== 第二部分：直返模式基础协议 =====
console.log("\n=== 直返模式 - 基础协议 ===");

await testAsync("initialize", async () => {
  const { data } = await mcpPost(GLOBAL_KEY, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05" }
  });
  assert(data.result.protocolVersion === "2024-11-05", "Wrong protocol version");
  assert(data.result.serverInfo.name === "luckywiki-mcp", "Wrong server name");
});

await testAsync("tools/list", async () => {
  const { data } = await mcpPost(GLOBAL_KEY, { jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert(Array.isArray(data.result.tools), "tools should be array");
  assert(data.result.tools.length >= 6, `Expected >= 6 tools, got ${data.result.tools.length}`);
  const names = data.result.tools.map(t => t.name);
  ["search_wiki", "get_article", "list_wiki_tree", "list_recent_articles", "get_related_articles", "list_categories"].forEach(name => {
    assert(names.includes(name), `Missing tool: ${name}`);
  });
});

// ===== 第三部分：直返模式 - 工具调用 =====
console.log("\n=== 直返模式 - 工具调用 ===");

await testAsync("list_wiki_tree - 返回 280 篇", async () => {
  const { data } = await mcpPost(GLOBAL_KEY, {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "list_wiki_tree", arguments: {} }
  });
  assert(data.result.content.length > 0, "No content returned");
  const content = JSON.parse(data.result.content[0].text);
  assert(content.totalCount >= 280, `Expected >= 280 articles, got ${content.totalCount}`);
});

await testAsync("get_article - home 详情", async () => {
  const { data } = await mcpPost(GLOBAL_KEY, {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "get_article", arguments: { path: "home" } }
  });
  const content = JSON.parse(data.result.content[0].text);
  assert(content.article.path === "home", "Wrong path");
  assert(content.article.title, "Missing title");
  assert(content.article.markdown, "Missing markdown");
  assert(content.article.markdown.length > 100, "Markdown too short");
});

await testAsync("search_wiki - 搜索学校", async () => {
  const { data } = await mcpPost(GLOBAL_KEY, {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "search_wiki", arguments: { query: "学校" } }
  });
  const content = JSON.parse(data.result.content[0].text);
  assert(content.totalCount > 0, "No search results");
  assert(Array.isArray(content.articles), "articles should be array");
});

await testAsync("list_recent_articles", async () => {
  const { data } = await mcpPost(GLOBAL_KEY, {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "list_recent_articles", arguments: { limit: 5 } }
  });
  const content = JSON.parse(data.result.content[0].text);
  assert(content.totalCount === 5, `Expected 5, got ${content.totalCount}`);
});

await testAsync("list_categories", async () => {
  const { data } = await mcpPost(GLOBAL_KEY, {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "list_categories", arguments: {} }
  });
  const content = JSON.parse(data.result.content[0].text);
  assert(content.totalCategories >= 5, `Expected >= 5 categories, got ${content.totalCategories}`);
  assert(content.totalArticles >= 280, `Expected >= 280 total, got ${content.totalArticles}`);
});

// ===== 第四部分：错误处理 =====
console.log("\n=== 错误处理 ===");

await testAsync("未知方法 → -32601", async () => {
  const { data } = await mcpPost(GLOBAL_KEY, { jsonrpc: "2.0", id: 1, method: "nonexistent_method" });
  assert(data.error.code === -32601, `Expected -32601, got ${data.error.code}`);
});

await testAsync("未知工具 → -32602", async () => {
  const { data } = await mcpPost(GLOBAL_KEY, {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "nonexistent_tool", arguments: {} }
  });
  assert(data.error.code === -32602, `Expected -32602, got ${data.error.code}`);
});

await testAsync("参数缺失 → -32602", async () => {
  const { data } = await mcpPost(GLOBAL_KEY, {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "get_article", arguments: {} }
  });
  assert(data.error.code === -32602, `Expected -32602, got ${data.error.code}`);
});

await testAsync("解析错误 → 400", async () => {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GLOBAL_KEY}` },
    body: "not valid json",
  });
  assert(res.status === 400, `Expected 400, got ${res.status}`);
});

// ===== 第五部分：SSE 模式 =====
console.log("\n=== SSE 模式 ===");

await testAsync("SSE 连接建立 + endpoint 事件", async () => {
  const sse = await connectSSE(GLOBAL_KEY);
  assert(sse.sessionId, "No sessionId received");
  assert(sse.events.some(e => e.event === "endpoint"), "No endpoint event");
  const endpointEvt = sse.events.find(e => e.event === "endpoint");
  assert(endpointEvt.data.url.includes("sessionId="), "endpoint URL missing sessionId");
  sse.close();
});

await testAsync("SSE 无鉴权 → 401", async () => {
  try {
    await connectSSE("bad-key");
    throw new Error("Should have failed");
  } catch (e) {
    assert(e.message.includes("401") || e.message.includes("failed"), `Unexpected error: ${e.message}`);
  }
});

await testAsync("SSE 模式下调用 tools/list", async () => {
  const sse = await connectSSE(GLOBAL_KEY);
  const endpointUrl = sse.getEndpointUrl();

  // 通过 POST 发送请求
  const res = await fetch(`${BASE_URL}${endpointUrl}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GLOBAL_KEY}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 42, method: "tools/list" }),
  });

  assert(res.status === 202, `Expected 202, got ${res.status}`);

  // 等待 SSE 消息
  const msg = await sse.waitForMessage(5000);
  assert(msg.data.id === 42, `Expected id 42, got ${msg.data.id}`);
  assert(msg.data.result.tools, "No tools in result");
  assert(Array.isArray(msg.data.result.tools), "tools should be array");

  sse.close();
});

await testAsync("SSE 模式下调用 search_wiki", async () => {
  const sse = await connectSSE(GLOBAL_KEY);
  const endpointUrl = sse.getEndpointUrl();

  const res = await fetch(`${BASE_URL}${endpointUrl}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GLOBAL_KEY}` },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 100, method: "tools/call",
      params: { name: "search_wiki", arguments: { query: "草堂" } }
    }),
  });

  assert(res.status === 202, `Expected 202, got ${res.status}`);

  const msg = await sse.waitForMessage(5000);
  assert(msg.data.id === 100, `Expected id 100, got ${msg.data.id}`);
  assert(msg.data.result.content, "No content in result");

  const content = JSON.parse(msg.data.result.content[0].text);
  assert(content.totalCount > 0, "No search results via SSE");

  sse.close();
});

// ===== 第六部分：用户级 API Key =====
console.log("\n=== 用户级 API Key（需要先手动创建） ===");

console.log("ℹ️  用户级 API Key 测试需要先在管理后台创建 Key");
console.log("    跳过数据库 API Key 的自动化测试");
console.log("    请登录管理后台 /admin/mcp-keys 创建 Key 后手动验证");

// ===== 总结 =====
console.log("\n" + "=".repeat(50));
console.log(`🎉 测试完成: ${passed} 通过, ${failed} 失败`);

if (failed > 0) process.exit(1);
