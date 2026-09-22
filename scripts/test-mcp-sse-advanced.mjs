// LuckyWiki MCP SSE 增强测试套件
// 测试：initialized 通知、批量请求、inputSchema、消息ID、并发、多次请求
import "dotenv/config";

const BASE_URL = process.env.MCP_TEST_URL || "http://localhost:3000";
const GLOBAL_KEY = process.env.MCP_SERVER_API_KEY || "luckywiki-mcp-dev-key-2026";

let passed = 0;
let failed = 0;

function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
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

// ---------- SSE 客户端 ----------

class SseClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.events = [];
    this.sessionId = null;
    this.reader = null;
    this.decoder = new TextDecoder();
    this.buffer = "";
    this.currentEvent = "message";
    this.currentData = "";
    this.lastEventId = "";
  }

  async connect() {
    const res = await fetch(`${this.baseUrl}/api/mcp`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (res.status !== 200) {
      throw new Error(`SSE connect failed: ${res.status}`);
    }

    this.reader = res.body.getReader();
    // 读到 endpoint 事件就算连接成功
    await this._readUntil(() => this.sessionId !== null, 10000);
  }

  get endpointUrl() {
    return `/api/mcp?sessionId=${this.sessionId}`;
  }

  async _readUntil(condition, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (condition()) return;
      await this._readChunk();
    }
    throw new Error("Timeout waiting for condition");
  }

  async _readChunk() {
    if (!this.reader) throw new Error("Not connected");
    const { value, done } = await this.reader.read();
    if (done) return false;

    this.buffer += this.decoder.decode(value, { stream: true });
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("id: ")) {
        this.lastEventId = line.slice(4);
      } else if (line.startsWith("event: ")) {
        this.currentEvent = line.slice(7);
      } else if (line.startsWith("data: ")) {
        this.currentData += line.slice(6);
      } else if (line === "") {
        if (this.currentData) {
          let parsed;
          try {
            parsed = JSON.parse(this.currentData);
          } catch {
            parsed = { raw: this.currentData };
          }
          const evt = { event: this.currentEvent, data: parsed, id: this.lastEventId };
          this.events.push(evt);

          if (this.currentEvent === "endpoint" && parsed.url) {
            const match = parsed.url.match(/sessionId=([^&]+)/);
            if (match) this.sessionId = match[1];
          }
        }
        this.currentEvent = "message";
        this.currentData = "";
      }
    }
    return true;
  }

  async sendRequest(body) {
    const res = await fetch(`${this.baseUrl}${this.endpointUrl}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    assert(res.status === 202, `Expected 202, got ${res.status}`);
  }

  async waitForMessage(predicate, timeoutMs = 5000) {
    const start = Date.now();
    const beforeCount = this.messages.length;

    while (Date.now() - start < timeoutMs) {
      const afterCount = this.messages.length;
      if (afterCount > beforeCount) {
        // 检查新消息
        const newMessages = this.messages.slice(beforeCount);
        const found = newMessages.find(predicate);
        if (found) return found;
      }
      await this._readChunk();
    }

    throw new Error("Wait for message timeout");
  }

  get messages() {
    return this.events.filter((e) => e.event === "message");
  }

  get messageCount() {
    return this.messages.length;
  }

  close() {
    if (this.reader) {
      this.reader.cancel().catch(() => {});
      this.reader = null;
    }
  }
}

// ---------- 测试开始 ----------

console.log("🧪 LuckyWiki MCP SSE 增强测试套件");
console.log(`Base URL: ${BASE_URL}\n`);

// ===== 第一部分：inputSchema 规范 =====
console.log("=== inputSchema 格式规范 ===");

await testAsync("tools/list 返回标准 inputSchema", async () => {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GLOBAL_KEY}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const data = await res.json();

  assert(Array.isArray(data.result.tools), "tools 应为数组");
  assert(data.result.tools.length >= 6, `应有 >= 6 个工具，实际 ${data.result.tools.length}`);
  for (const tool of data.result.tools) {
    assert(tool.name, "工具应有 name");
    assert(tool.description, `工具 ${tool.name} 应有 description`);
    assert(tool.inputSchema, `工具 ${tool.name} 应有 inputSchema`);
    assert(tool.inputSchema.type === "object", `inputSchema.type 应为 object`);
    assert(tool.inputSchema.properties, `inputSchema 应有 properties`);
    // required 可以不存在（表示没有必填项），存在的话必须是数组
    if (tool.inputSchema.required !== undefined) {
      assert(Array.isArray(tool.inputSchema.required), `inputSchema.required 应为数组`);
    }
  }
});

await testAsync("get_article inputSchema 含 path 字段", async () => {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GLOBAL_KEY}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const data = await res.json();

  const tool = data.result.tools.find((t) => t.name === "get_article");
  assert(tool, "get_article 工具存在");
  assert(tool.inputSchema.properties.path, "应有 path 属性");
  assert(tool.inputSchema.properties.path.type === "string", "path 应为 string 类型");
  assert(tool.inputSchema.required.includes("path"), "path 应为必填项");
});

await testAsync("search_wiki inputSchema 含 query 必填 + page/pageSize 选填", async () => {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GLOBAL_KEY}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const data = await res.json();

  const tool = data.result.tools.find((t) => t.name === "search_wiki");
  assert(tool, "search_wiki 工具存在");
  assert(tool.inputSchema.properties.query, "应有 query 属性");
  assert(tool.inputSchema.properties.query.type === "string", "query 应为 string 类型");
  assert(tool.inputSchema.properties.page, "应有 page 属性");
  assert(tool.inputSchema.properties.page.type === "number", "page 应为 number 类型");
  assert(tool.inputSchema.properties.pageSize, "应有 pageSize 属性");
  assert(tool.inputSchema.properties.pageSize.type === "number", "pageSize 应为 number 类型");
  assert(tool.inputSchema.required.includes("query"), "query 应为必填");
  assert(!tool.inputSchema.required.includes("page"), "page 应为选填");
  assert(!tool.inputSchema.required.includes("pageSize"), "pageSize 应为选填");
});

// ===== 第二部分：initialized 通知 =====
console.log("\n=== notifications/initialized 通知 ===");

await testAsync("SSE 模式 initialize 后收到 initialized 通知", async () => {
  const client = new SseClient(BASE_URL, GLOBAL_KEY);
  await client.connect();

  await client.sendRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05" },
  });

  // 等待 initialize 响应 + initialized 通知
  const msg = await client.waitForMessage(
    (m) => m.data.method === "notifications/initialized",
    5000,
  );

  assert(msg.data.jsonrpc === "2.0", "应为 JSON-RPC 2.0");
  assert(msg.data.method === "notifications/initialized", "方法名正确");
  assert(msg.data.id === undefined, "通知不应有 id");

  client.close();
});

await testAsync("initialize 响应先于 initialized 通知", async () => {
  const client = new SseClient(BASE_URL, GLOBAL_KEY);
  await client.connect();

  await client.sendRequest({
    jsonrpc: "2.0",
    id: 42,
    method: "initialize",
    params: { protocolVersion: "2024-11-05" },
  });

  // 等待至少 2 条消息（响应 + 通知）
  await client.waitForMessage(() => client.messageCount >= 2, 5000);

  const msgs = client.messages.slice(-2);
  assert(msgs[0].data.id === 42, "第一条应为 initialize 响应");
  assert(msgs[0].data.result !== undefined, "响应应有 result");
  assert(msgs[1].data.method === "notifications/initialized", "第二条应为 initialized 通知");

  client.close();
});

// ===== 第三部分：批量请求 =====
console.log("\n=== 批量请求（JSON-RPC 数组） ===");

await testAsync("直返模式 - 批量 ping", async () => {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GLOBAL_KEY}`,
    },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", id: 2, method: "ping" },
      { jsonrpc: "2.0", id: 3, method: "ping" },
    ]),
  });
  const data = await res.json();

  assert(Array.isArray(data), "批量响应应为数组");
  assert(data.length === 3, `应有 3 个响应，实际 ${data.length}`);
  assert(data[0].id === 1, "第一个响应 id=1");
  assert(data[1].id === 2, "第二个响应 id=2");
  assert(data[2].id === 3, "第三个响应 id=3");
});

await testAsync("直返模式 - 批量混合方法", async () => {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GLOBAL_KEY}`,
    },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]),
  });
  const data = await res.json();

  assert(Array.isArray(data), "批量响应应为数组");
  assert(data.length === 2, `应有 2 个响应，实际 ${data.length}`);
  assert(data[0].id === 1, "第一个是 ping 响应");
  assert(data[1].id === 2, "第二个是 tools/list 响应");
  assert(Array.isArray(data[1].result.tools), "tools/list 响应含 tools 数组");
});

await testAsync("SSE 模式 - 批量请求", async () => {
  const client = new SseClient(BASE_URL, GLOBAL_KEY);
  await client.connect();

  await client.sendRequest([
    { jsonrpc: "2.0", id: 10, method: "ping" },
    { jsonrpc: "2.0", id: 11, method: "ping" },
    { jsonrpc: "2.0", id: 12, method: "ping" },
  ]);

  // 等待 3 条响应消息
  await client.waitForMessage(() => client.messageCount >= 3, 5000);

  const ids = client.messages.slice(-3).map((m) => m.data.id);
  assert(ids.includes(10), "应包含 id=10");
  assert(ids.includes(11), "应包含 id=11");
  assert(ids.includes(12), "应包含 id=12");

  client.close();
});

// ===== 第四部分：SSE 消息 ID =====
console.log("\n=== SSE 消息 ID ===");

await testAsync("SSE 消息带 id 字段", async () => {
  const client = new SseClient(BASE_URL, GLOBAL_KEY);
  await client.connect();

  // endpoint 事件应该有 id
  const endpointEvt = client.events.find((e) => e.event === "endpoint");
  assert(endpointEvt, "应有 endpoint 事件");
  assert(endpointEvt.id && endpointEvt.id.startsWith("msg-"), `endpoint 事件应有 id，实际: ${endpointEvt.id}`);

  client.close();
});

await testAsync("SSE 消息 id 递增", async () => {
  const client = new SseClient(BASE_URL, GLOBAL_KEY);
  await client.connect();

  await client.sendRequest({ jsonrpc: "2.0", id: 1, method: "ping" });
  await client.sendRequest({ jsonrpc: "2.0", id: 2, method: "ping" });
  await client.sendRequest({ jsonrpc: "2.0", id: 3, method: "ping" });

  await client.waitForMessage(() => client.messageCount >= 3, 5000);

  const msgs = client.messages.slice(-3);
  const ids = msgs.map((m) => m.id);

  // 检查 id 格式正确且不重复
  for (const id of ids) {
    assert(id && id.startsWith("msg-"), `id 格式正确: ${id}`);
  }
  assert(new Set(ids).size === 3, "三个 id 不重复");

  client.close();
});

// ===== 第五部分：SSE 并发 & 多次请求 =====
console.log("\n=== SSE 并发 & 多次请求 ===");

await testAsync("同连接多次调用不同工具", async () => {
  const client = new SseClient(BASE_URL, GLOBAL_KEY);
  await client.connect();

  const requests = [
    { jsonrpc: "2.0", id: 101, method: "tools/list" },
    { jsonrpc: "2.0", id: 102, method: "tools/call", params: { name: "list_categories", arguments: {} } },
    { jsonrpc: "2.0", id: 103, method: "tools/call", params: { name: "list_recent_articles", arguments: { limit: 3 } } },
  ];

  for (const req of requests) {
    await client.sendRequest(req);
  }

  await client.waitForMessage(() => client.messageCount >= 3, 8000);

  const msgs = client.messages.slice(-3);
  const ids = msgs.map((m) => m.data.id).sort();
  assert.deepStrictEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  assert(assert.deepStrictEqual(ids, [101, 102, 103]) || ids.join(",") === "101,102,103",
    `三个响应 id 正确: ${ids.join(",")}`);

  client.close();
});

await testAsync("并发 3 个 SSE 连接", async () => {
  const clients = [];
  const results = [];

  for (let i = 0; i < 3; i++) {
    const client = new SseClient(BASE_URL, GLOBAL_KEY);
    clients.push(client);
    results.push(
      client.connect().then(() =>
        client.sendRequest({ jsonrpc: `2.0`, id: i, method: "ping" }).then(() =>
          client.waitForMessage((m) => m.data.id === i, 5000),
        ),
      ),
    );
  }

  const messages = await Promise.all(results);
  assert(messages.length === 3, "3 个连接都收到响应");
  for (let i = 0; i < 3; i++) {
    assert(messages[i].data.id === i, `连接 ${i} 响应正确`);
  }

  for (const client of clients) {
    client.close();
  }
});

await testAsync("SSE 模式下搜索真实数据", async () => {
  const client = new SseClient(BASE_URL, GLOBAL_KEY);
  await client.connect();

  await client.sendRequest({
    jsonrpc: "2.0",
    id: 200,
    method: "tools/call",
    params: { name: "search_wiki", arguments: { query: "草堂" } },
  });

  const msg = await client.waitForMessage((m) => m.data.id === 200, 8000);
  assert(msg.data.result.content, "有 content");
  const content = JSON.parse(msg.data.result.content[0].text);
  assert(content.totalCount > 0, "搜索有结果");
  assert(Array.isArray(content.articles), "有 articles 数组");

  client.close();
});

// ===== 第六部分：initialize 协议细节 =====
console.log("\n=== initialize 协议细节 ===");

await testAsync("initialize 返回正确的协议版本和能力", async () => {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GLOBAL_KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        clientInfo: { name: "test-client", version: "1.0.0" },
        capabilities: {},
      },
    }),
  });
  const data = await res.json();

  assert(data.result.protocolVersion === "2024-11-05", "协议版本正确");
  assert(data.result.serverInfo, "有 serverInfo");
  assert(data.result.serverInfo.name === "luckywiki-mcp", "服务器名正确");
  assert(data.result.capabilities, "有 capabilities");
  assert(data.result.capabilities.tools, "声明 tools 能力");
});

// ===== 总结 =====
console.log("\n" + "=".repeat(60));
console.log(`🎉 SSE 增强测试完成: ${passed} 通过, ${failed} 失败`);

if (failed > 0) process.exit(1);
