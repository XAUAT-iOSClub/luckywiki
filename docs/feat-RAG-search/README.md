# RAG Search API

为 Flutter 等外部应用提供的 Wiki 检索 API，支持混合检索（关键词 + 向量）和 RAG 上下文生成。

## 功能特性

- **混合检索**: 关键词检索（pg_trgm）+ 向量检索（pgvector）+ RRF 融合
- **自动降级**: 向量服务不可用时自动退化为关键词检索
- **API Key 鉴权**: SHA256 哈希存储，支持单独限流和撤销
- **限流保护**: 每小时请求次数限制（默认 200 次）
- **审计日志**: 完整记录所有请求和响应
- **只读安全**: 只返回已发布文章，不暴露草稿和敏感数据

## 环境变量

在 `.env` 中添加：

```env
# RAG API 总开关
RAG_API_ENABLED=true

# 可选：全局测试 API Key
RAG_API_KEY=

# 每小时限流默认值
RAG_RATE_LIMIT_PER_HOUR=200

# 默认返回条数
RAG_DEFAULT_TOP_K=6

# 最大返回条数
RAG_MAX_TOP_K=20

# 复用现有 Agent 配置
OPENAI_API_KEY=your_key
OPENAI_API_BASE_URL=https://api.openai.com/v1
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
AGENT_EMBEDDING_DIMENSIONS=1024
```

## 数据库迁移

```bash
pnpm prisma migrate deploy
pnpm prisma generate
```

## 创建 API Key

```bash
# 创建 Key，默认 200 次/小时
pnpm tsx scripts/create-rag-key.ts flutter-app

# 创建 Key，自定义限流
pnpm tsx scripts/create-rag-key.ts flutter-app 500
```

输出示例：
```
RAG API Key created.
Name: flutter-app
Key: rag_9f2c1ab8e7d64f1a9c3b2e8d7f6a5b4c1a2b3c4d5e6f7a8b
This key is shown only once.
```

## 撤销 API Key

```bash
pnpm tsx scripts/revoke-rag-key.ts rag_9f2c1ab8e7d64f1a9c3b2e8d7f6a5b4c1a2b3c4d5e6f7a8b
```

## API 端点

### 1. 检索接口

**POST** `/api/v1/rag/search`

#### 请求头

```
Content-Type: application/json
Authorization: Bearer <RAG_API_KEY>
```

#### 请求体

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
|---|---|---|---|---|
| `query` | string | 是 | - | 查询语句，1-200 字符 |
| `top_k` | number | 否 | 6 | 返回结果数量，最大 20 |
| `mode` | string | 否 | `auto` | `auto` / `lexical` / `vector` / `hybrid` |
| `include_content` | boolean | 否 | `true` | 是否返回分块正文 |
| `include_context` | boolean | 否 | `false` | 是否返回拼接后的 RAG context |

#### 检索模式

- `auto`: 有向量时混合检索，否则退化为关键词（推荐）
- `lexical`: 仅关键词检索
- `vector`: 仅向量检索
- `hybrid`: 强制混合检索

#### 成功响应 (200)

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
      "heading_path": ["充值方式"],
      "score": 0.872,
      "match_types": ["vector", "lexical"],
      "excerpt": "校园卡可通过校园一卡通公众号、财务处自助机等方式进行充值……",
      "content": "校园卡可通过校园一卡通公众号、财务处自助机等方式进行充值……",
      "article_url": "/zh/wiki/校园卡/充值",
      "updated_at": "2026-09-20T10:00:00.000Z"
    }
  ],
  "context": "【1】校园卡充值指南 > 充值方式\n校园卡可通过……"
}
```

#### 错误响应

| HTTP | code | 说明 |
|---|---|---|
| 400 | `invalid_json` | JSON 解析失败 |
| 400 | `validation_error` | 参数校验失败 |
| 401 | `missing_token` | 未提供 Token |
| 401 | `invalid_api_key` | API Key 无效或已撤销 |
| 403 | `rag_api_disabled` | 服务端关闭 RAG API |
| 429 | `rate_limited` | 超出限流 |
| 500 | `internal_error` | 内部错误 |

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Too many requests",
    "retry_after_seconds": 3421
  }
}
```

### 2. 文章详情接口

**GET** `/api/v1/rag/articles/{path}`

#### 示例

```
GET /api/v1/rag/articles/校园卡/充值
Authorization: Bearer <RAG_API_KEY>
```

#### 成功响应 (200)

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

## curl 测试示例

```bash
# 检索
curl -X POST http://localhost:3000/api/v1/rag/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer rag_xxx" \
  -d '{
    "query": "校园卡怎么充值",
    "top_k": 5,
    "mode": "auto",
    "include_content": true,
    "include_context": false
  }'

# 获取文章详情
curl http://localhost:3000/api/v1/rag/articles/校园卡/充值 \
  -H "Authorization: Bearer rag_xxx"
```

## 运行测试

```bash
# 单元测试
pnpm test tests/rag-schema.test.ts
pnpm test tests/rag-fusion.test.ts
pnpm test tests/rag-excerpt.test.ts

# 集成测试（需要启动开发服务器）
pnpm dev
# 另一个终端
pnpm test tests/rag-api.test.ts
```

## 文件结构

```
lib/rag/
├── auth.ts          # API Key 鉴权
├── rate-limit.ts    # 内存限流
├── schema.ts        # Zod 验证
├── service.ts       # 主服务编排
├── lexical.ts       # 关键词检索
├── vector.ts        # 向量检索
├── fusion.ts        # RRF 融合
├── embedding.ts     # Query embedding
├── excerpt.ts       # 摘要生成
├── logger.ts        # 审计日志
├── errors.ts        # 自定义错误
└── http.ts          # HTTP 工具

app/api/v1/rag/
├── search/route.ts              # 检索接口
└── articles/[...path]/route.ts  # 文章详情接口

scripts/
├── create-rag-key.ts   # 创建 API Key
└── revoke-rag-key.ts   # 撤销 API Key

tests/
├── rag-schema.test.ts   # Schema 验证测试
├── rag-fusion.test.ts   # RRF 融合测试
├── rag-excerpt.test.ts  # 摘要生成测试
└── rag-api.test.ts      # API 集成测试
```

## Flutter 接入示例

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

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
      body: jsonEncode({
        'query': query,
        'top_k': topK,
        'mode': mode,
        'include_content': true,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('Search failed: ${response.statusCode}');
    }

    return RagSearchResponse.fromJson(
      jsonDecode(utf8.decode(response.bodyBytes)),
    );
  }
}

// 使用示例
final client = BaikeRagClient(
  baseUrl: Uri.parse('https://baike.xauat.site'),
  apiKey: 'rag_xxx',
);

final result = await client.search('校园卡怎么充值', topK: 5);
for (final item in result.results) {
  print('${item.articleTitle}: ${item.excerpt}');
}
```

## 安全建议

1. **不要在 Flutter APK 中直接内置 API Key**
   - 推荐架构: `Flutter App -> 你的后端代理 -> 百科 RAG API`
   - 如果必须内置，务必严格限流并支持随时撤销

2. **API Key 只有创建时展示一次**
   - 数据库只存储 SHA256 哈希
   - 丢失后需要撤销旧 Key 并创建新 Key

3. **只返回已发布内容**
   - 自动过滤草稿文章
   - 不暴露用户信息、评论、管理数据

4. **审计日志**
   - 所有请求记录到 `rag_call_logs` 表
   - 可追溯 IP、User-Agent、查询内容、响应状态

## 性能指标

| 指标 | 目标 |
|---|---|
| 关键词检索 P95 | < 500ms |
| 混合检索 P95 | < 1000ms |
| 单次最大返回 | 20 条 |
| 默认限流 | 200 次/小时 |

## 数据库索引

向量检索索引（可选，提升性能）：

```sql
CREATE INDEX IF NOT EXISTS agent_chunk_embedding_hnsw_idx
ON agent_chunks
USING hnsw (embedding_vector vector_cosine_ops);
```

关键词检索索引（推荐）：

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS agent_chunk_content_trgm_idx
ON agent_chunks
USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS article_title_trgm_idx
ON articles
USING gin (title gin_trgm_ops);
```

## 故障排查

### 向量检索不可用

- 检查 `OPENAI_API_KEY` 是否配置
- 检查 embedding 模型是否与 `AGENT_EMBEDDING_DIMENSIONS` 匹配
- 检查 `embedding_vector` 列是否存在并有数据
- 系统会自动降级为关键词检索

### 限流问题

- 检查 `RAG_RATE_LIMIT_PER_HOUR` 配置
- 单 Key 可通过数据库 `hourly_limit` 字段覆盖
- 多实例部署需要迁移到 Redis 限流

### 性能问题

- 添加数据库索引（见上方）
- 检查 `AgentChunk` 是否已生成
- 检查 ParadeDB/pg_trgm 扩展是否启用
- 降低 `top_k` 值

## 后续扩展

- [ ] Redis 分布式限流
- [ ] 结果缓存
- [ ] 多语言支持
- [ ] 管理后台 UI
- [ ] 更多检索模式（BM25、重排序）
- [ ] 统计分析面板
