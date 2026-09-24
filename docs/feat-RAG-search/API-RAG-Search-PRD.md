下面给出一份可直接用于当前 LuckyWiki / 建大百科项目的 **PRD + 技术实现方案**。目标是在不破坏现有 Wiki 内容模型的前提下，为 Flutter 应用提供一个 **只读、可鉴权、可限流、适合 RAG 的 Wiki 检索 API**。

---

# 1. PRD：Flutter 端 RAG 检索 Wiki 内容 API

## 1.1 背景

当前项目已经具备：

- PostgreSQL + Prisma 管理的 Wiki 文章数据；
- 已发布文章公开访问能力；
- 搜索能力：ParadeDB BM25 / `pg_trgm` / 应用层兜底；
- AgentChunk 分块与向量嵌入能力；
- MCP 只读接口；
- 管理后台与审计日志基础。

现在有一个 Flutter 应用需要查询百科内容，并将检索结果作为 RAG 上下文提供给 AI 或本地业务使用。

Flutter 端不适合直接接入复杂的 MCP SSE / JSON-RPC 协议，更适合使用普通 REST/JSON API。因此需要新增一个面向移动端的轻量 RAG 检索 API。

---

## 1.2 目标

为 Flutter 应用提供一个稳定、只读、可鉴权的 Wiki RAG 检索接口：

```http
POST /api/v1/rag/search
```

该接口能够根据用户查询语句返回：

- 命中的文章路径；
- 文章标题；
- 分块标题路径；
- 相关性分数；
- 命中片段；
- 可用于 LLM Prompt 的正文内容；
- 可选的聚合上下文字符串。

---

## 1.3 非目标

本期不做：

- 不向 Flutter 暴露写操作；
- 不允许查询草稿文章；
- 不暴露用户、评论、管理后台、Agent 内部配置；
- 不做个性化推荐；
- 不做多租户权限体系；
- 不直接复用 MCP SSE 协议；
- 不在 Flutter 端直接调用向量数据库；
- 不做复杂 OAuth2 / OIDC 登录。

---

## 1.4 使用角色

| 角色 | 说明 |
|---|---|
| Flutter 应用 | 通过 API Key 调用 RAG 检索接口 |
| 百科管理员 | 创建、撤销、限流 RAG API Key |
| 后端服务 | 校验鉴权、限流、检索文章、记录审计日志 |
| 最终用户 | 在 Flutter 应用中输入问题，获得百科内容引用或 AI 回答 |

---

## 1.5 核心用户故事

### 故事 1：Flutter 根据关键词检索百科内容

作为 Flutter 应用，我希望发送一个问题，例如：

```text
校园卡怎么充值？
```

然后得到若干相关百科片段，用于展示或作为 LLM 上下文。

---

### 故事 2：管理员为 Flutter 应用创建独立 API Key

作为管理员，我希望为 Flutter 应用创建一个专用 Key，方便：

- 单独限流；
- 单独撤销；
- 查看调用量；
- 记录审计日志。

---

### 故事 3：Flutter 获取文章详情

作为 Flutter 应用，在用户点击某条检索结果后，我希望通过文章路径获取完整已发布文章内容。

---

## 1.6 产品方案总览

```text
Flutter App
    │
    │ HTTPS POST /api/v1/rag/search
    │ Authorization: Bearer rag_xxx
    ▼
Next.js Route Handler
    │
    ├── 鉴权
    ├── 限流
    ├── 参数校验
    ├── 检索服务
    │     ├── 关键词检索
    │     ├── 向量检索
    │     └── Hybrid / RRF 融合
    ├── 只过滤 PUBLISHED 文章
    ├── 审计日志
    └── 返回 JSON 给 Flutter
```

---

# 2. API 设计

## 2.1 接口版本

建议使用版本化路径：

```text
/api/v1/rag/search
```

后续如果字段变更，可以升级到：

```text
/api/v2/rag/search
```

---

## 2.2 检索接口

### 基本信息

```http
POST /api/v1/rag/search
Content-Type: application/json
Authorization: Bearer <RAG_API_KEY>
```

---

### 请求体

```json
{
  "query": "校园卡怎么充值",
  "top_k": 5,
  "mode": "auto",
  "include_content": true,
  "include_context": false
}
```

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---:|---:|---:|---|
| `query` | string | 是 | - | 用户查询，建议 1～200 字 |
| `top_k` | number | 否 | 6 | 返回结果数量，最大 20 |
| `mode` | string | 否 | `auto` | `auto` / `lexical` / `vector` / `hybrid` |
| `include_content` | boolean | 否 | `true` | 是否返回分块正文 |
| `include_context` | boolean | 否 | `false` | 是否返回拼接后的 RAG context |

---

### 检索模式说明

| 模式 | 说明 |
|---|---|
| `lexical` | 仅关键词检索，适合无向量环境 |
| `vector` | 仅向量检索，要求已有 embedding |
| `hybrid` | 关键词 + 向量混合检索 |
| `auto` | 自动选择：有向量则混合，否则退化为关键词 |

推荐 Flutter 端默认使用：

```json
{
  "mode": "auto"
}
```

---

### 成功响应

```json
{
  "query": "校园卡怎么充值",
  "mode": "hybrid",
  "top_k": 3,
  "took_ms": 128,
  "results": [
    {
      "chunk_id": "clxyz...",
      "article_path": "校园卡/充值",
      "article_title": "校园卡充值指南",
      "heading_path": ["校园卡", "充值方式", "线上充值"],
      "score": 0.872,
      "match_types": ["vector", "lexical"],
      "excerpt": "校园卡可通过校园一卡通公众号、财务处自助机等方式进行充值……",
      "content": "校园卡可通过校园一卡通公众号、财务处自助机等方式进行充值……",
      "article_url": "/zh/wiki/校园卡/充值",
      "updated_at": "2026-09-20T10:00:00.000Z"
    }
  ],
  "context": "【1】校园卡充值指南 > 校园卡 / 充值方式 / 线上充值\n校园卡可通过……"
}
```

---

### 字段说明

| 字段 | 说明 |
|---|---|
| `chunk_id` | AgentChunk 分块 ID |
| `article_path` | Wiki 文章唯一路径 |
| `article_title` | 文章标题 |
| `heading_path` | 分块所在标题层级 |
| `score` | 综合相关性分数 |
| `match_types` | 命中来源：`lexical` / `vector` |
| `excerpt` | 摘要，适合 Flutter 列表展示 |
| `content` | 分块正文，适合传给 LLM |
| `article_url` | 前端文章路径 |
| `updated_at` | 文章更新时间 |
| `context` | 可选，拼接后的 RAG 上下文 |

---

## 2.3 错误响应格式

统一返回：

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "Invalid API key"
  }
}
```

---

### 常见错误码

| HTTP | code | 说明 |
|---:|---|---|
| 400 | `invalid_json` | JSON 解析失败 |
| 400 | `validation_error` | 参数校验失败 |
| 401 | `missing_token` | 未提供 Token |
| 401 | `invalid_api_key` | API Key 无效或已撤销 |
| 403 | `rag_api_disabled` | 服务端关闭 RAG API |
| 429 | `rate_limited` | 超出限流 |
| 500 | `internal_error` | 内部错误，不暴露堆栈 |

---

## 2.4 获取文章详情接口

Flutter 点击结果后，可请求文章详情：

```http
GET /api/v1/rag/articles/{path}
Authorization: Bearer <RAG_API_KEY>
```

例如：

```http
GET /api/v1/rag/articles/校园卡/充值
```

响应：

```json
{
  "path": "校园卡/充值",
  "title": "校园卡充值指南",
  "description": "校园卡充值方式说明",
  "content": "# 校园卡充值指南...",
  "tags": ["校园卡", "一卡通"],
  "updated_at": "2026-09-20T10:00:00.000Z"
}
```

只允许返回：

```text
status = PUBLISHED
```

---

# 3. 检索策略设计

## 3.1 推荐方案：Hybrid Search

RAG 场景建议采用混合检索：

```text
最终结果 = RRF(关键词检索结果, 向量检索结果)
```

即：

- 用关键词保证精确词、专有名词、路径、编号类查询；
- 用向量保证语义相似、自然语言问题；
- 用 RRF 融合，避免直接比较不同分数体系。

---

## 3.2 数据来源

### 关键词检索来源

优先查询：

```text
AgentChunk.content
Article.title
Article.path
```

如果 `AgentChunk` 为空，则退化为文章级检索：

```text
Article.title
Article.description
Article.content
```

---

### 向量检索来源

使用已有：

```text
AgentChunk.embeddingVector
```

当前项目迁移中为：

```sql
vector(1024)
```

因此 RAG 查询向量维度必须与现有 embedding 维度一致。

---

## 3.3 Query Embedding

查询时也需要调用同一个 embedding 模型生成向量。

建议复用现有：

```text
lib/agent/openai.ts
```

中的 OpenAI 兼容 embedding 能力。

如果当前封装不适合直接复用，也可以在 `lib/rag/embedding.ts` 中新增一个轻量封装，但必须保证：

- 模型一致；
- `AGENT_EMBEDDING_DIMENSIONS` 一致；
- 向量维度一致；
- 出错时能优雅降级到关键词检索。

---

## 3.4 RRF 融合

推荐公式：

```text
score = Σ 1 / (k + rank)
```

其中：

```text
k = 60
```

示例：

- 关键词检索第 1 名：`1 / 61`
- 向量检索第 3 名：`1 / 63`
- 两者相加得到最终融合分数

---

## 3.5 兜底策略

必须保证以下情况仍可用：

| 情况 | 行为 |
|---|---|
| 未配置 embedding | 自动退化为关键词检索 |
| 向量服务超时 | 自动退化为关键词检索 |
| `AgentChunk` 为空 | 退化为文章级关键词检索 |
| 查询无结果 | 返回空数组，不报错 |
| 向量维度不一致 | 记录错误，退化为关键词检索 |

---

# 4. 安全设计

## 4.1 鉴权方式

采用：

```http
Authorization: Bearer <API_KEY>
```

也兼容：

```http
X-RAG-Key: <API_KEY>
```

推荐 Key 前缀：

```text
rag_
```

例如：

```text
rag_9f2c1ab8e7d64f1a9c3b2e8d7f6a5b4c
```

---

## 4.2 Key 存储

数据库只存 Key 的 SHA256 Hash，不存明文。

```text
keyHash = sha256(apiKey)
```

创建 Key 时只展示一次。

---

## 4.3 限流

默认：

```text
每小时 200 次 / Key
```

可通过数据库 Key 单独覆盖：

```text
RagApiKey.hourlyLimit
```

也可通过环境变量设置全局默认：

```env
RAG_RATE_LIMIT_PER_HOUR=200
```

---

## 4.4 内容安全

接口必须保证：

- 只查询 `ArticleStatus.PUBLISHED`；
- 不返回草稿；
- 不返回用户信息；
- 不返回评论；
- 不返回管理后台数据；
- 不返回 Agent 配置；
- 不返回数据库错误堆栈；
- 不返回 embedding 原始向量；
- 不返回 API Key 明文。

---

## 4.5 Flutter 端密钥安全

强烈建议：

```text
Flutter App -> 自己的后端代理 -> 百科 RAG API
```

如果必须把 Key 内置到 Flutter 应用中，需要接受以下事实：

- APK / IPA 中的 Key 可能被反编译提取；
- 该 Key 必须低权限；
- 必须严格限流；
- 必须支持随时撤销；
- 不允许访问任何敏感数据。

---

# 5. 数据模型设计

新增两个模型：

```prisma
enum RagApiKeyStatus {
  ACTIVE
  REVOKED
}

model RagApiKey {
  id          String          @id @default(cuid())
  name        String
  keyHash     String          @unique
  keyPrefix   String
  status      RagApiKeyStatus @default(ACTIVE)
  hourlyLimit Int?
  createdAt   DateTime        @default(now())
  lastUsedAt  DateTime?
  revokedAt   DateTime?
  createdById String?

  logs RagCallLog[]

  @@index([status])
  @@index([createdAt])
}

model RagCallLog {
  id          String   @id @default(cuid())
  keyId       String?
  ip          String?
  userAgent   String?
  method      String
  path        String
  query       String
  mode        String
  topK        Int
  latencyMs   Int
  resultCount Int
  statusCode  Int
  errorCode   String?
  createdAt   DateTime @default(now())

  key RagApiKey? @relation(fields: [keyId], references: [id], onDelete: SetNull)

  @@index([keyId, createdAt])
  @@index([createdAt])
}
```

---

## 5.1 与现有模型关系

- `RagApiKey` 不依赖 `User`，但可保留 `createdById` 便于后续接入管理员；
- `RagCallLog` 用于审计；
- 不修改 `Article`、`AgentChunk` 等核心模型；
- 不影响现有 MCP。

---

# 6. 文件结构设计

建议新增：

```text
app/api/v1/rag/search/route.ts
app/api/v1/rag/articles/[...path]/route.ts

lib/rag/auth.ts
lib/rag/rate-limit.ts
lib/rag/schema.ts
lib/rag/service.ts
lib/rag/lexical.ts
lib/rag/vector.ts
lib/rag/fusion.ts
lib/rag/excerpt.ts
lib/rag/logger.ts
lib/rag/errors.ts
lib/rag/embedding.ts

scripts/create-rag-key.ts
scripts/revoke-rag-key.ts

tests/rag/search.test.ts
tests/rag/auth.test.ts
tests/rag/rate-limit.test.ts
```

如果希望减少文件数量，MVP 阶段可以合并为：

```text
app/api/v1/rag/search/route.ts
lib/rag/auth.ts
lib/rag/rate-limit.ts
lib/rag/service.ts
```

---

# 7. 关键实现代码

以下代码为关键骨架，具体字段名需要与当前 `prisma/schema.prisma` 中 `Article`、`AgentChunk` 实际字段保持体现有模型微调。

---

## 7.1 环境变量

在 `.env` 中新增：

```env
# RAG API 总开关
RAG_API_ENABLED=true

# 可选：全局 API Key
RAG_API_KEY=

# 每小时限流默认值
RAG_RATE_LIMIT_PER_HOUR=200

# 默认返回条数
RAG_DEFAULT_TOP_K=6

# 最大返回条数
RAG_MAX_TOP_K=20
```

向量相关继续复用现有 Agent 配置：

```env
OPENAI_API_KEY=
OPENAI_API_BASE_URL=
OPENAI_EMBEDDING_MODEL=
AGENT_EMBEDDING_DIMENSIONS=1024
```

---

## 7.2 Zod Schema

文件：

```text
lib/rag/schema.ts
```

```ts
import { z } from "zod";

const DEFAULT_TOP_K = Number(process.env.RAG_DEFAULT_TOP_K ?? 6);
const MAX_TOP_K = Number(process.env.RAG_MAX_TOP_K ?? 20);

export const ragSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, "query is required")
    .max(200, "query too long"),

  top_k: z
    .number()
    .int()
    .min(1)
    .max(MAX_TOP_K)
    .optional()
    .default(DEFAULT_TOP_K),

  mode: z
    .enum(["auto", "lexical", "vector", "hybrid"])
    .optional()
    .default("auto"),

  include_content: z.boolean().optional().default(true),

  include_context: z.boolean().optional().default(false),
});

export type RagSearchInput = z.infer<typeof ragSearchSchema>;

export interface RagSearchResultItem {
  chunk_id: string | null;
  article_path: string;
  article_title: string;
  heading_path: string[];
  score: number;
  match_types: Array<"lexical" | "vector">;
  excerpt: string;
  content?: string;
  article_url: string;
  updated_at: string | null;
}

export interface RagSearchResponse {
  query: string;
  mode: RagSearchInput["mode"];
  top_k: number;
  took_ms: number;
  results: RagSearchResultItem[];
  context?: string;
}
```

---

## 7.3 错误类

文件：

```text
lib/rag/errors.ts
```

```ts
export class RagAuthError extends Error {
  constructor(
    public code:
      | "missing_token"
      | "invalid_api_key"
      | "rag_api_disabled",
    message: string,
  ) {
    super(message);
    this.name = "RagAuthError";
  }
}

export class RagRateLimitError extends Error {
  constructor(public resetAt: number) {
    super("rate limit exceeded");
    this.name = "RagRateLimitError";
  }
}

export class RagValidationError extends Error {
  constructor(
    public code: "invalid_json" | "validation_error",
    message: string,
  ) {
    super(message);
    this.name = "RagValidationError";
  }
}

export class RagServiceError extends Error {
  constructor(
    public code: "vector_unavailable" | "search_failed",
    message: string,
  ) {
    super(message);
    this.name = "RagServiceError";
  }
}
```

---

## 7.4 IP 获取

文件：

```text
lib/rag/http.ts
```

```ts
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}
```

---

## 7.5 API Key 鉴权

文件：

```text
lib/rag/auth.ts
```

```ts
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/rag/http";
import { RagAuthError } from "@/lib/rag/errors";

export interface RagAuthContext {
  keyId: string | null;
  identity: string;
  hourlyLimit: number;
  keyPrefix: string;
}

export function hashRagKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function authenticateRagRequest(
  request: Request,
): Promise<RagAuthContext> {
  if (process.env.RAG_API_ENABLED === "false") {
    throw new RagAuthError("rag_api_disabled", "RAG API is disabled");
  }

  const authorization = request.headers.get("authorization") ?? "";
  const headerKey = request.headers.get("x-rag-key") ?? "";

  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : headerKey.trim();

  if (!token) {
    throw new RagAuthError("missing_token", "Missing API key");
  }

  const ip = getClientIp(request);
  const defaultLimit = Number(process.env.RAG_RATE_LIMIT_PER_HOUR ?? 200);

  // 支持全局环境变量 Key，便于快速测试
  if (process.env.RAG_API_KEY && token === process.env.RAG_API_KEY) {
    return {
      keyId: null,
      identity: `env:${ip}`,
      hourlyLimit: defaultLimit,
      keyPrefix: token.slice(0, 12),
    };
  }

  const key = await prisma.ragApiKey.findUnique({
    where: {
      keyHash: hashRagKey(token),
      status: "ACTIVE",
    },
  });

  if (!key) {
    throw new RagAuthError("invalid_api_key", "Invalid API key");
  }

  // 异步更新最后使用时间，不阻塞主流程
  prisma.ragApiKey
    .update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return {
    keyId: key.id,
    identity: `key:${key.id}`,
    hourlyLimit: key.hourlyLimit ?? defaultLimit,
    keyPrefix: key.keyPrefix,
  };
}
```

---

## 7.6 内存限流

文件：

```text
lib/rag/rate-limit.ts
```

```ts
import { RagRateLimitError } from "@/lib/rag/errors";

const HOUR = 60 * 60 * 1000;

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

function cleanup(now: number) {
  if (buckets.size < 5000) return;

  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function checkRagRateLimit(
  identity: string,
  hourlyLimit: number,
): void {
  const now = Date.now();
  const windowStart = Math.floor(now / HOUR) * HOUR;
  const key = `${identity}:${windowStart}`;

  const bucket = buckets.get(key);

  if (!bucket) {
    buckets.set(key, {
      count: 1,
      resetAt: windowStart + HOUR,
    });
    cleanup(now);
    return;
  }

  if (bucket.count >= hourlyLimit) {
    throw new RagRateLimitError(bucket.resetAt);
  }

  bucket.count += 1;
}
```

说明：

- 当前限流为进程内存限流；
- 单实例部署足够；
- 多实例部署需要迁移到 Redis；
- 与现有 MCP 内存限流策略保持一致。

---

## 7.7 Query Embedding

文件：

```text
lib/rag/embedding.ts
```

如果现有 `lib/agent/openai.ts` 已提供可复用的 `embedText` / `createEmbedding`，优先复用。下面是一个兼容 OpenAI 接口的实现示例。

```ts
export async function getQueryEmbedding(
  query: string,
): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl =
    process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1";

  const model =
    process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-large";

  const dimensions = Number(process.env.AGENT_EMBEDDING_DIMENSIONS ?? 1024);

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: query,
        dimensions,
      }),
    });

    if (!response.ok) {
      console.error("[rag] embedding request failed", response.status);
      return null;
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    const embedding = data.data?.[0]?.embedding;

    if (!embedding || embedding.length !== dimensions) {
      console.error("[rag] embedding dimension mismatch");
      return null;
    }

    return embedding;
  } catch (error) {
    console.error("[rag] embedding failed", error);
    return null;
  }
}
```

---

## 7.8 向量检索

文件：

```text
lib/rag/vector.ts
```

```ts
import { prisma } from "@/lib/prisma";
import { getQueryEmbedding } from "@/lib/rag/embedding";

export interface RagCandidate {
  chunk_id: string | null;
  article_path: string;
  article_title: string;
  heading_path: string[];
  content: string;
  score: number;
  match_types: Array<"lexical" | "vector">;
  updated_at: Date | null;
}

interface RawVectorRow {
  chunk_id: string;
  heading_path: unknown;
  content: string;
  article_path: string;
  article_title: string;
  article_updated_at: Date | null;
  score: number | null;
}

function parseHeadingPath(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      return [];
    }
  }

  return [];
}

export async function vectorSearchChunks(
  query: string,
  limit: number,
): Promise<RagCandidate[]> {
  const embedding = await getQueryEmbedding(query);

  if (!embedding) {
    return [];
  }

  const vectorText = `[${embedding.join(",")}]`;

  const rows = await prisma.$queryRaw<RawVectorRow[]>`
    SELECT
      ac.id AS chunk_id,
      ac."headingPath" AS heading_path,
      ac.content AS content,
      a.path AS article_path,
      a.title AS article_title,
      a."updatedAt" AS article_updated_at,
      1 - (ac."embeddingVector" <=> ${vectorText}::vector) AS score
    FROM "AgentChunk" ac
    JOIN "Article" a ON a.id = ac."articleId"
    WHERE a.status = 'PUBLISHED'
      AND ac."embeddingVector" IS NOT NULL
      AND ac.content IS NOT NULL
      AND length(trim(ac.content)) > 0
    ORDER BY ac."embeddingVector" <=> ${vectorText}::vector
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    chunk_id: row.chunk_id,
    article_path: row.article_path,
    article_title: row.article_title,
    heading_path: parseHeadingPath(row.heading_path),
    content: row.content,
    score: Number(row.score ?? 0),
    match_types: ["vector"],
    updated_at: row.article_updated_at,
  }));
}
```

注意事项：

- 如果 `AgentChunk.headingPath` 实际字段名不同，需要调整；
- 如果数据库使用 `article_id` 而不是 `articleId`，需要调整；
- `embeddingVector` 维度必须与当前迁移一致，当前为 `vector(1024)`；
- 如果更换 embedding 模型，必须同步重建索引。

---

## 7.9 关键词检索

文件：

```text
lib/rag/lexical.ts
```

```ts
import { prisma } from "@/lib/prisma";
import type { RagCandidate } from "@/lib/rag/vector";

interface RawLexicalRow {
  chunk_id: string | null;
  heading_path: unknown;
  content: string;
  article_path: string;
  article_title: string;
  article_updated_at: Date | null;
  score: number | null;
}

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

function parseHeadingPath(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      return [];
    }
  }

  return [];
}

export async function lexicalSearchChunks(
  query: string,
  limit: number,
): Promise<RagCandidate[]> {
  const pattern = `%${escapeLike(query)}%`;

  try {
    const rows = await prisma.$queryRaw<RawLexicalRow[]>`
      SELECT
        ac.id AS chunk_id,
        ac."headingPath" AS heading_path,
        ac.content AS content,
        a.path AS article_path,
        a.title AS article_title,
        a."updatedAt" AS article_updated_at,
        GREATEST(
          similarity(ac.content, ${query}),
          similarity(a.title, ${query}) * 1.5
        ) AS score
      FROM "AgentChunk" ac
      JOIN "Article" a ON a.id = ac."articleId"
      WHERE a.status = 'PUBLISHED'
        AND ac.content IS NOT NULL
        AND (
          ac.content ILIKE ${pattern}
          OR a.title ILIKE ${pattern}
          OR a.path ILIKE ${pattern}
        )
      ORDER BY score DESC, a."updatedAt" DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      chunk_id: row.chunk_id,
      article_path: row.article_path,
      article_title: row.article_title,
      heading_path: parseHeadingPath(row.heading_path),
      content: row.content,
      score: Number(row.score ?? 0),
      match_types: ["lexical"],
      updated_at: row.article_updated_at,
    }));
  } catch {
    // pg_trgm 不可用时的兜底关键词匹配
    const rows = await prisma.$queryRaw<RawLexicalRow[]>`
      SELECT
        ac.id AS chunk_id,
        ac."headingPath" AS heading_path,
        ac.content AS content,
        a.path AS article_path,
        a.title AS article_title,
        a."updatedAt" AS article_updated_at,
        0.5 AS score
      FROM "AgentChunk" ac
      JOIN "Article" a ON a.id = ac."articleId"
      WHERE a.status = 'PUBLISHED'
        AND ac.content IS NOT NULL
        AND (
          ac.content ILIKE ${pattern}
          OR a.title ILIKE ${pattern}
          OR a.path ILIKE ${pattern}
        )
      ORDER BY a."updatedAt" DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      chunk_id: row.chunk_id,
      article_path: row.article_path,
      article_title: row.article_title,
      heading_path: parseHeadingPath(row.heading_path),
      content: row.content,
      score: Number(row.score ?? 0),
      match_types: ["lexical"],
      updated_at: row.article_updated_at,
    }));
  }
}
```

如果 `AgentChunk` 数据为空，还可以继续退化为 `Article` 表搜索。建议后续在 `lib/rag/lexical.ts` 中增加 `lexicalSearchArticles()`。

---

## 7.10 RRF 融合

文件：

```text
lib/rag/fusion.ts
```

```ts
import type { RagCandidate } from "@/lib/rag/vector";

const RRF_K = 60;

export function fuseRagCandidates(
  candidateLists: RagCandidate[][],
): RagCandidate[] {
  const map = new Map<string, RagCandidate & { rrf: number }>();

  for (const list of candidateLists) {
    list.forEach((candidate, index) => {
      const key =
        candidate.chunk_id ??
        `${candidate.article_path}:${candidate.heading_path.join("/")}`;

      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          ...candidate,
          rrf: 1 / (RRF_K + index + 1),
        });
        return;
      }

      existing.rrf += 1 / (RRF_K + index + 1);

      if (!existing.match_types.includes(candidate.match_types[0])) {
        existing.match_types.push(candidate.match_types[0]);
      }

      if (candidate.score > existing.score) {
        existing.score = candidate.score;
      }

      if (!existing.content && candidate.content) {
        existing.content = candidate.content;
      }
    });
  }

  return Array.from(map.values()).sort((a, b) => b.rrf - a.rrf);
}
```

---

## 7.11 摘要生成

文件：

```text
lib/rag/excerpt.ts
```

```ts
export function buildExcerpt(
  content: string,
  query: string,
  maxLength = 220,
): string {
  const text = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`_\[\]()!|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const lowerText = text.toLowerCase();

  let index = -1;

  for (const term of terms) {
    const found = lowerText.indexOf(term);
    if (found >= 0) {
      index = found;
      break;
    }
  }

  if (index < 0) {
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  const start = Math.max(0, index - 60);
  const excerpt = text.slice(start, start + maxLength);

  return `${start > 0 ? "..." : ""}${excerpt}${
    start + maxLength < text.length ? "..." : ""
  }`;
}
```

---

## 7.12 RAG 主服务

文件：

```text
lib/rag/service.ts
```

```ts
import { buildExcerpt } from "@/lib/rag/excerpt";
import { fuseRagCandidates } from "@/lib/rag/fusion";
import { lexicalSearchChunks } from "@/lib/rag/lexical";
import type {
  RagSearchInput,
  RagSearchResultItem,
} from "@/lib/rag/schema";
import { vectorSearchChunks, type RagCandidate } from "@/lib/rag/vector";

function buildArticleUrl(path: string): string {
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/zh/wiki/${segments || "home"}`;
}

function toApiItem(
  candidate: RagCandidate & { rrf?: number },
  input: RagSearchInput,
): RagSearchResultItem {
  const score = candidate.rrf ?? candidate.score ?? 0;

  return {
    chunk_id: candidate.chunk_id,
    article_path: candidate.article_path,
    article_title: candidate.article_title,
    heading_path: candidate.heading_path,
    score: Number(score.toFixed(6)),
    match_types: candidate.match_types,
    excerpt: buildExcerpt(candidate.content, input.query),
    content: input.include_content ? candidate.content : undefined,
    article_url: buildArticleUrl(candidate.article_path),
    updated_at: candidate.updated_at
      ? candidate.updated_at.toISOString()
      : null,
  };
}

export function buildRagContext(
  items: RagSearchResultItem[],
): string {
  return items
    .map((item, index) => {
      const heading = item.heading_path.length
        ? item.heading_path.join(" / ")
        : item.article_title;

      return [
        `【${index + 1】${item.article_title} > ${heading}`,
        item.content ?? item.excerpt,
        `来源: ${item.article_path}`,
      ].join("\n");
    })
    .join("\n\n");
}

export async function retrieveRagChunks(
  input: RagSearchInput,
): Promise<RagSearchResultItem[]> {
  const candidateLimit = Math.min(50, input.top_k * 3);

  const wantVector =
    input.mode === "vector" || input.mode === "hybrid" || input.mode === "auto";

  let vectorCandidates: RagCandidate[] = [];

  if (wantVector) {
    try {
      vectorCandidates = await vectorSearchChunks(
        input.query,
        candidateLimit,
      );
    } catch (error) {
      console.error("[rag] vector search failed", error);

      if (input.mode === "vector") {
        throw error;
      }
    }
  }

  const lexicalCandidates = await lexicalSearchChunks(
    input.query,
    candidateLimit,
  );

  if (input.mode === "vector" && vectorCandidates.length === 0) {
    return [];
  }

  if (vectorCandidates.length === 0) {
    return lexicalCandidates
      .slice(0, input.top_k)
      .map((candidate) => toApiItem(candidate, input));
  }

  if (input.mode === "lexical") {
    return lexicalCandidates
      .slice(0, input.top_k)
      .map((candidate) => toApiItem(candidate, input));
  }

  const fused = fuseRagCandidates([
    lexicalCandidates,
    vectorCandidates,
  ]);

  return fused
    .slice(0, input.top_k)
    .map((candidate) => toApiItem(candidate, input));
}
```

---

## 7.13 审计日志

文件：

```text
lib/rag/logger.ts
```

```ts
import { prisma } from "@/lib/prisma";

interface RagLogInput {
  keyId: string | null;
  ip: string;
  userAgent: string;
  method: string;
  path: string;
  query: string;
  mode: string;
  topK: number;
  latencyMs: number;
  resultCount: number;
  statusCode: number;
  errorCode: string | null;
}

export async function logRagCall(input: RagLogInput): Promise<void> {
  try {
    await prisma.ragCallLog.create({
      data: {
        keyId: input.keyId,
        ip: input.ip,
        userAgent: input.userAgent.slice(0, 255),
        method: input.method,
        path: input.path,
        query: input.query.slice(0, 200),
        mode: input.mode,
        topK: input.topK,
        latencyMs: input.latencyMs,
        resultCount: input.resultCount,
        statusCode: input.statusCode,
        errorCode: input.errorCode,
      },
    });
  } catch (error) {
    console.error("[rag] failed to write audit log", error);
  }
}
```

---

## 7.14 Route Handler

文件：

```text
app/api/v1/rag/search/route.ts
```

```ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { authenticateRagRequest } from "@/lib/rag/auth";
import {
  RagAuthError,
  RagRateLimitError,
  RagValidationError,
} from "@/lib/rag/errors";
import { getClientIp } from "@/lib/rag/http";
import { logRagCall } from "@/lib/rag/logger";
import { checkRagRateLimit } from "@/lib/rag/rate-limit";
import { ragSearchSchema } from "@/lib/rag/schema";
import { buildRagContext, retrieveRagChunks } from "@/lib/rag/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "";

  let keyId: string | null = null;
  let query = "";
  let mode = "auto";
  let topK = 0;
  let resultCount = 0;
  let statusCode = 200;
  let errorCode: string | null = null;

  try {
    const auth = await authenticateRagRequest(request);
    keyId = auth.keyId;

    checkRagRateLimit(auth.identity, auth.hourlyLimit);

    let rawBody: unknown;

    try {
      rawBody = await request.json();
    } catch {
      throw new RagValidationError("invalid_json", "Invalid JSON body");
    }

    let input;

    try {
      input = ragSearchSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new RagValidationError(
          "validation_error",
          error.issues[0]?.message ?? "Invalid request",
        );
      }
      throw error;
    }

    query = input.query;
    mode = input.mode;
    topK = input.top_k;

    const results = await retrieveRagChunks(input);
    resultCount = results.length;

    const responsePayload: Record<string, unknown> = {
      query: input.query,
      mode: input.mode,
      top_k: results.length,
      took_ms: Date.now() - startedAt,
      results,
    };

    if (input.include_context) {
      responsePayload.context = buildRagContext(results);
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    if (error instanceof RagAuthError) {
      statusCode = 401;
      errorCode = error.code;

      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 401 },
      );
    }

    if (error instanceof RagRateLimitError) {
      statusCode = 429;
      errorCode = "rate_limited";

      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((error.resetAt - Date.now()) / 1000),
      );

      return NextResponse.json(
        {
          error: {
            code: "rate_limited",
            message: "Too many requests",
            retry_after_seconds: retryAfterSeconds,
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
          },
        },
      );
    }

    if (error instanceof RagValidationError) {
      statusCode = 400;
      errorCode = error.code;

      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 400 },
      );
    }

    statusCode = 500;
    errorCode = "internal_error";
    console.error("[rag] search failed", error);

    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Search failed",
        },
      },
      { status: 500 },
    );
  } finally {
    await logRagCall({
      keyId,
      ip,
      userAgent,
      method: "POST",
      path: "/api/v1/rag/search",
      query,
      mode,
      topK,
      latencyMs: Date.now() - startedAt,
      resultCount,
      statusCode,
      errorCode,
    });
  }
}
```

---

## 7.15 文章详情 Route Handler

文件：

```text
app/api/v1/rag/articles/[...path]/route.ts
```

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRagRequest } from "@/lib/rag/auth";
import { checkRagRateLimit } from "@/lib/rag/rate-limit";
import { getClientIp } from "@/lib/rag/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const auth = await authenticateRagRequest(request);
    checkRagRateLimit(auth.identity, auth.hourlyLimit);

    const { path } = await params;
    const articlePath = path.map(decodeURIComponent).join("/");

    const article = await prisma.article.findFirst({
      where: {
        path: articlePath,
        status: "PUBLISHED",
      },
      select: {
        path: true,
        title: true,
        description: true,
        content: true,
        tags: true,
        updatedAt: true,
      },
    });

    if (!article) {
      return NextResponse.json(
        {
          error: {
            code: "not_found",
            message: "Article not found",
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      path: article.path,
      title: article.title,
      description: article.description,
      content: article.content,
      tags: article.tags,
      updated_at: article.updatedAt.toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Failed to load article",
        },
      },
      { status: 500 },
    );
  }
}
```

注意：

- 如果当前 `Article` 模型正文字段不是 `content`，需要改为实际字段；
- `tags` 如果是数组，可直接返回；
- 必须保留 `status: "PUBLISHED"` 条件。

---

# 8. 创建 API Key 脚本

文件：

```text
scripts/create-rag-key.ts
```

```ts
import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import { hashRagKey } from "../lib/rag/auth";

async function main() {
  const name = process.argv[2] ?? "flutter-app";
  const hourlyLimit = process.argv[3]
    ? Number(process.argv[3])
    : null;

  const key = `rag_${randomBytes(24).toString("hex")}`;

  await prisma.ragApiKey.create({
    data: {
      name,
      keyHash: hashRagKey(key),
      keyPrefix: key.slice(0, 12),
      status: "ACTIVE",
      hourlyLimit,
    },
  });

  console.log("RAG API Key created.");
  console.log("Name:", name);
  console.log("Key:", key);
  console.log("This key is shown only once.");
}

main()
  .finally(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

运行：

```bash
pnpm tsx scripts/create-rag-key.ts flutter-app 200
```

---

# 9. Flutter 端接入

## 9.1 请求示例

```dart
import 'dart:convert';

import 'package:http/http.dart' as http;

class RagSearchRequest {
  final String query;
  final int topK;
  final String mode;

  RagSearchRequest({
    required this.query,
    this.topK = 5,
    this.mode = 'auto',
  });

  Map<String, dynamic> toJson() => {
        'query': query,
        'top_k': topK,
        'mode': mode,
        'include_content': true,
        'include_context': false,
      };
}

class RagResultItem {
  final String? chunkId;
  final String articlePath;
  final String articleTitle;
  final List<dynamic> headingPath;
  final double score;
  final List<dynamic> matchTypes;
  final String excerpt;
  final String? content;
  final String articleUrl;
  final String? updatedAt;

  RagResultItem({
    required this.chunkId,
    required this.articlePath,
    required this.articleTitle,
    required this.headingPath,
    required this.score,
    required this.matchTypes,
    required this.excerpt,
    required this.content,
    required this.articleUrl,
    required this.updatedAt,
  });

  factory RagResultItem.fromJson(Map<String, dynamic> json) {
    return RagResultItem(
      chunkId: json['chunk_id'],
      articlePath: json['article_path'] ?? '',
      articleTitle: json['article_title'] ?? '',
      headingPath: json['heading_path'] ?? [],
      score: (json['score'] ?? 0).toDouble(),
      matchTypes: json['match_types'] ?? [],
      excerpt: json['excerpt'] ?? '',
      content: json['content'],
      articleUrl: json['article_url'] ?? '',
      updatedAt: json['updated_at'],
    );
  }
}

class RagSearchResponse {
  final String query;
  final String mode;
  final int topK;
  final int tookMs;
  final List<RagResultItem> results;

  RagSearchResponse({
    required this.query,
    required this.mode,
    required this.topK,
    required this.tookMs,
    required this.results,
  });

  factory RagSearchResponse.fromJson(Map<String, dynamic> json) {
    return RagSearchResponse(
      query: json['query'] ?? '',
      mode: json['mode'] ?? 'auto',
      topK: json['top_k'] ?? 0,
      tookMs: json['took_ms'] ?? 0,
      results: (json['results'] as List<dynamic>? ?? [])
          .map((item) => RagResultItem.fromJson(item))
          .toList(),
    );
  }
}

class BaikeRagClient {
  final Uri baseUrl;
  final String apiKey;
  final http.Client _client;

  BaikeRagClient({
    required this.baseUrl,
    required this.apiKey,
    http.Client? client,
  }) : _client = client ?? http.Client();

  Future<RagSearchResponse> search(
    String query, {
    int topK = 5,
    String mode = 'auto',
  }) async {
    final uri = baseUrl.resolve('/api/v1/rag/search');

    final response = await _client.post(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $apiKey',
      },
      body: jsonEncode(
        RagSearchRequest(
          query: query,
          topK: topK,
          mode: mode,
        ).toJson(),
      ),
    );

    final body = jsonDecode(utf8.decode(response.bodyBytes));

    if (response.statusCode != 200) {
      final code = body['error']?['code'] ?? 'unknown_error';
      final message = body['error']?['message'] ?? 'Request failed';
      throw Exception('$code: $message');
    }

    return RagSearchResponse.fromJson(body);
  }
}
```

---

## 9.2 Flutter 使用示例

```dart
Future<void> demo() async {
  final client = BaikeRagClient(
    baseUrl: Uri.parse('https://baike.xauat.site'),
    apiKey: 'rag_xxx',
  );

  final result = await client.search(
    '校园卡怎么充值',
    topK: 5,
  );

  for (final item in result.results) {
    print(item.articleTitle);
    print(item.excerpt);
  }
}
```

---

# 10. 数据库索引建议

如果向量检索启用，建议为 `AgentChunk.embeddingVector` 建立向量索引。

示例：

```sql
CREATE INDEX IF NOT EXISTS agent_chunk_embedding_hnsw_idx
ON "AgentChunk"
USING hnsw ("embeddingVector" vector_cosine_ops);
```

如果关键词检索使用 `pg_trgm`，建议：

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS agent_chunk_content_trgm_idx
ON "AgentChunk"
USING gin ("content" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS article_title_trgm_idx
ON "Article"
USING gin ("title" gin_trgm_ops);
```

基础索引：

```sql
CREATE INDEX IF NOT EXISTS article_status_idx
ON "Article" ("status");

CREATE INDEX IF NOT EXISTS agent_chunk_article_id_idx
ON "AgentChunk" ("articleId");
```

---

# 11. 与现有系统的关系

## 11.1 与 `/api/search` 的关系

现有 `/api/search` 更偏前端文章搜索，返回文章级结果。

新 RAG API 的区别：

| 维度 | `/api/search` | `/api/v1/rag/search` |
|---|---|---|
| 面向对象 | Web 前端 | Flutter / 外部 RAG |
| 返回粒度 | 文章级 | 分块级优先 |
| 鉴权 | 现有公开搜索策略 | API Key |
| 向量检索 | 不一定启用 | 推荐启用 |
| 上下文拼接 | 不提供 | 可提供 |
| 审计 | 不一定完整 | 强制记录 |

---

## 11.2 与 MCP 的关系

MCP 适合：

- LobeHub；
- 支持 MCP 的 AI 平台；
- 标准工具调用。

Flutter 更适合：

- 普通 REST；
- JSON；
- Bearer Token；
- 简单请求响应。

因此不建议让 Flutter 直接对接 MCP。

---

# 12. 测试方案

## 12.1 单元测试

需要覆盖：

| 测试项 | 期望 |
|---|---|
| `query` 为空 | 400 |
| `query` 超长 | 400 |
| `top_k` 超过最大值 | 400 |
| 缺少 Token | 401 |
| 错误 Token | 401 |
| 已撤销 Key | 401 |
| 超过限流 | 429 |
| 草稿文章 | 不返回 |
| 未发布文章 | 不返回 |
| 无结果 | 返回空数组 |
| 向量不可用 | 自动退化为关键词 |
| `mode=vector` 且无向量 | 返回空或明确不可用 |

---

## 12.2 集成测试

建议使用 Node 内置 test runner + `tsx`，与项目现有测试方式保持一致。

示例：

```ts
import assert from "node:assert";
import test from "node:test";

import { ragSearchSchema } from "../lib/rag/schema";

test("ragSearchSchema accepts valid payload", () => {
  const parsed = ragSearchSchema.parse({
    query: "校园卡",
    top_k: 5,
    mode: "auto",
  });

  assert.equal(parsed.query, "校园卡");
  assert.equal(parsed.top_k, 5);
});

test("ragSearchSchema rejects empty query", () => {
  assert.throws(() => {
    ragSearchSchema.parse({
      query: "",
    });
  });
});
```

---

## 12.3 手工联调

### curl 测试

```bash
curl -X POST https://baike.xauat.site/api/v1/rag/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer rag_xxx" \
  -d '{
    "query": "校园卡怎么充值",
    "top_k": 5,
    "mode": "auto",
    "include_content": true,
    "include_context": true
  }'
```

### Flutter 联调检查

- [ ] 能正常返回结果；
- [ ] 能处理 401；
- [ ] 能处理 429；
- [ ] 能处理空结果；
- [ ] 能点击结果跳转详情；
- [ ] 中文乱码处理正常；
- [ ] 超时时间建议 10s～15s。

---

# 13. 部署方案

## 13.1 部署前置条件

```bash
pnpm install
pnpm prisma generate
pnpm prisma migrate deploy
```

如果要启用向量检索：

```bash
pnpm agent:index
```

---

## 13.2 环境变量

```env
RAG_API_ENABLED=true
RAG_API_KEY=
RAG_RATE_LIMIT_PER_HOUR=200
RAG_DEFAULT_TOP_K=6
RAG_MAX_TOP_K=20
```

---

## 13.3 上线步骤

1. 合并代码；
2. 执行数据库迁移；
3. 生成一个测试 Key；
4. 使用 curl 测试 `/api/v1/rag/search`；
5. Flutter 测试环境联调；
6. 观察 `RagCallLog`；
7. 创建生产 Key；
8. 配置限流；
9. 正式上线。

---

# 14. 监控与运维

## 14.1 日志字段

`RagCallLog` 至少记录：

- `keyId`；
- `ip`；
- `userAgent`；
- `query`；
- `mode`；
- `topK`；
- `latencyMs`；
- `resultCount`；
- `statusCode`；
- `errorCode`；
- `createdAt`。

---

## 14.2 监控指标

建议关注：

| 指标 | 说明 |
|---|---|
| QPS | 每小时调用量 |
| P95 延迟 | 检索接口耗时 |
| 401 数量 | 鉴权失败 |
| 429 数量 | 限流触发 |
| 500 数量 | 内部错误 |
| 空结果率 | 检索质量 |
| 向量命中率 | 向量检索是否有效 |

---

# 15. 验收标准

## 15.1 功能验收

- [ ] Flutter 可通过 Bearer Token 调用接口；
- [ ] 无 Token 返回 401；
- [ ] 错误 Token 返回 401；
- [ ] 参数错误返回 400；
- [ ] 限流后返回 429；
- [ ] 只返回已发布文章；
- [ ] 草稿文章不会返回；
- [ ] 返回包含文章路径、标题、摘要、正文；
- [ ] `include_context=true` 时返回 `context`；
- [ ] 日志表能看到调用记录。

---

## 15.2 性能验收

建议：

| 指标 | 目标 |
|---|---|
| 普通关键词检索 | P95 < 500ms |
| Hybrid 检索 | P95 < 1000ms |
| 单次最大返回 | 20 条 |
| 单 Key 默认限流 | 200 次/小时 |

---

## 15.3 安全验收

- [ ] API Key 明文不落库；
- [ ] 日志不记录完整 Token；
- [ ] 错误响应不返回堆栈；
- [ ] 不返回用户隐私数据；
- [ ] 不返回草稿内容；
- [ ] 不暴露数据库内部错误；
- [ ] 可撤销 Key。

---

# 16. 里程碑

## M1：MVP

目标：Flutter 能稳定调用关键词检索。

内容：

- 新增 `RagApiKey`、`RagCallLog`；
- 新增 `/api/v1/rag/search`；
- 支持 `lexical`；
- 支持 Bearer Token；
- 支持限流；
- 支持审计日志；
- 提供创建 Key 脚本。

预计工作量：

```text
1～2 天
```

---

## M2：Hybrid RAG

目标：启用向量检索，提高语义召回。

内容：

- 接入 query embedding；
- 查询 `AgentChunk.embeddingVector`；
- 支持 `hybrid`；
- RRF 融合；
- 空结果兜底；
- 索引优化。

预计工作量：

```text
2～4 天
```

---

## M3：Flutter 联调与上线

目标：完成真实应用接入。

内容：

- Flutter SDK 封装；
- 错误处理；
- 超时重试；
- 灰度测试；
- 日志观察；
- 生产 Key 发放。

预计工作量：

```text
1～2 天
```

---

# 17. 推荐最终落地版本

如果当前项目希望尽快给 Flutter 使用，推荐采用如下最终方案：

```text
接口：
POST /api/v1/rag/search
GET  /api/v1/rag/articles/{path}

鉴权：
Bearer rag_xxx

检索：
默认 mode = auto
有 embedding 时：lexical + vector + RRF
无 embedding 时：lexical 兜底

数据源：
优先 AgentChunk
兜底 Article

安全：
只查 PUBLISHED
只读
限流
审计日志

Flutter：
通过普通 HTTP JSON API 调用
```

这套方案能够兼顾：

- 移动端接入简单；
- 后端改动可控；
- 复用现有 Wiki 与 AgentChunk；
- 支持后续升级到更强 RAG；
- 不与现有 MCP 冲突。