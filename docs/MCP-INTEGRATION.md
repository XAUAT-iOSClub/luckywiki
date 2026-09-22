# 建大百科 MCP 对接文档

> 面向社团 AI 平台（LobeHub）的 MCP 接入配置说明

## 1. 概述

建大百科提供 MCP (Model Context Protocol) 接口，允许外部 AI 平台（如社团 AI `gpt.xauat.site`）通过标准 MCP 协议查询百科知识库内容。

- **传输协议**：MCP over SSE (JSON-RPC 2.0)
- **协议版本**：2024-11-05
- **鉴权方式**：Bearer Token（API Key）
- **限流**：每 Key 每小时 200 次调用

## 2. LobeHub 配置步骤

### 2.1 获取 API Key

1. 登录建大百科管理后台：`https://baike.xauat.site/zh/admin/mcp-keys`
2. 点击「创建新 Key」
3. 填写 Key 名称（如「社团AI调用」）
4. 创建后复制完整 Key（格式：`lwk_xxxxxxxxxxxxxxxx`），**仅显示一次**

### 2.2 在 LobeHub 中添加 MCP 服务

1. 登录社团 AI 平台 `https://gpt.xauat.site/`
2. 进入 MCP 服务管理页面
3. 选择「SSE 模式」添加新服务
4. 填写配置：

| 配置项 | 值 |
|--------|-----|
| SSE 端点地址 | `https://baike.xauat.site/api/mcp` |
| 鉴权方式 | Bearer Token |
| Token | 管理后台创建的 API Key |

5. 保存后测试连接

### 2.3 验证连接

连接成功后，LobeHub 会自动调用 `initialize` 和 `tools/list`，可在工具列表中看到以下 6 个工具：

| 工具名 | 功能 | 必填参数 |
|--------|------|----------|
| `search_wiki` | 全文搜索文章 | `query` |
| `get_article` | 获取文章详情 | `path` |
| `list_wiki_tree` | 获取文章目录树 | 无 |
| `list_recent_articles` | 最近更新文章 | 无 |
| `get_related_articles` | 相关文章推荐 | `path` |
| `list_categories` | 分类统计 | 无 |

## 3. MCP 协议交互流程

### 3.1 SSE 模式（推荐）

```
LobeHub                          百科后端
  │                                │
  │── GET /api/mcp ───────────────>│  (带 Authorization: Bearer <key>)
  │<── SSE stream + endpoint event─│  (返回 POST 地址含 sessionId)
  │                                │
  │── POST /api/mcp?sessionId=xxx ─>│  (initialize 请求)
  │<── SSE: initialize 响应 ────────│
  │<── SSE: initialized 通知 ───────│
  │                                │
  │── POST /api/mcp?sessionId=xxx ─>│  (tools/call 请求)
  │<── SSE: tools/call 响应 ────────│
  │                                │
  │── (心跳保活，30秒一次) ────────│
```

### 3.2 直返模式（兼容）

也支持直接 POST 不建 SSE 连接，响应直接在 HTTP body 返回：

```bash
curl -X POST https://baike.xauat.site/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer lwk_xxxxxxxx" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 4. 工具详情

### search_wiki

全文搜索百科文章（仅已发布）。

```json
{
  "method": "tools/call",
  "params": {
    "name": "search_wiki",
    "arguments": {
      "query": "校园卡",
      "page": 1,
      "pageSize": 10
    }
  }
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 搜索关键词 |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 10，最大 50 |

### get_article

获取指定文章的完整内容。

```json
{
  "method": "tools/call",
  "params": {
    "name": "get_article",
    "arguments": {
      "path": "home"
    }
  }
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | string | 是 | 文章路径（如 `home`、`学校/简介`） |

### list_wiki_tree

获取所有已发布文章的目录树结构。

```json
{
  "method": "tools/call",
  "params": {
    "name": "list_wiki_tree",
    "arguments": {}
  }
}
```

### list_recent_articles

获取最近更新的文章列表。

```json
{
  "method": "tools/call",
  "params": {
    "name": "list_recent_articles",
    "arguments": {
      "limit": 10
    }
  }
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量，默认 10，最大 50 |

### get_related_articles

获取与指定文章相关的文章列表（基于标签和分类匹配）。

```json
{
  "method": "tools/call",
  "params": {
    "name": "get_related_articles",
    "arguments": {
      "path": "学校/简介",
      "limit": 5
    }
  }
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | string | 是 | 文章路径 |
| limit | number | 否 | 返回数量，默认 5，最大 20 |

### list_categories

获取文章分类统计。

```json
{
  "method": "tools/call",
  "params": {
    "name": "list_categories",
    "arguments": {}
  }
}
```

## 5. 安全约束

- 所有工具只返回 **已发布（PUBLISHED）** 的文章
- 不暴露 Agent/AI 相关能力
- 不暴露任何写操作（创建/删除/修改文章、用户管理）
- 不复用前端缓存，每次请求直接查数据库
- 错误响应不暴露内部堆栈信息
- 所有调用记录审计日志

## 6. 错误处理

| HTTP 状态码 | MCP 错误码 | 说明 |
|-------------|-----------|------|
| 401 | -32001 | 未提供或无效的 API Key |
| 429 | -32002 | 超出限流（含 resetAt 时间） |
| 400 | -32700 | JSON 解析错误 |
| 200 | -32601 | 未知方法 |
| 200 | -32602 | 参数校验失败 |
| 200 | -32603 | 内部错误 |

## 7. 部署运维

### 环境变量

```env
# 全局 MCP API Key（可选，与用户级 Key 并行）
MCP_SERVER_API_KEY=
# 限流：每小时最大调用次数
MCP_RATE_LIMIT=200
```

### 数据库迁移

部署前执行迁移以创建 MCP 相关表：

```bash
npx prisma migrate deploy
```

### 监控

- 调用日志存储在 `mcp_call_logs` 表
- 管理后台 `/admin/mcp-keys` 可查看每个 Key 的调用次数和最后使用时间
- 每个 Key 可单独配置限流，也可在创建后撤销

## 8. 本地开发测试

```bash
# 启动开发服务器
node node_modules/next/dist/bin/next dev

# 运行基础测试（18 项）
node scripts/test-mcp-full.mjs

# 运行 SSE 增强测试（14 项）
node scripts/test-mcp-sse-advanced.mjs
```
