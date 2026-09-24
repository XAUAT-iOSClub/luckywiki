# 建大百科 MCP 接口开发 — 完整说明

> 负责人：陈智祥 ｜ 截止：10月10日 ｜ 当前日期：9月21日

---

## 一、我做了什么

### 1. 本地环境搭建

把 GitHub 上的 LuckyWiki 代码拉到本地，完整跑起来了。

| 项 | 说明 |
|----|------|
| PostgreSQL 17 | 安装在 D:\PostgreSQL，端口 5432 |
| 数据库 | 创建了 `luckywiki` 数据库，7 张表 |
| 依赖安装 | pnpm install，1270 个包 |
| 种子数据 | Root 管理员账号 + Home 文章 |
| 线上数据导入 | 从 baike.xauat.site 抓取了 280 篇真实文章导入本地 |
| 开发服务器 | localhost:3000 正常运行 |

### 2. MCP 接口开发（核心任务）

在百科后端里新增了 MCP 模块，外部 AI（如社团 AI）可以通过标准 MCP 协议查询百科内容。

**新增的代码文件（16 个）：**

| 文件 | 干什么用的 |
|------|-----------|
| `app/api/mcp/route.ts` | MCP 接口入口，处理 SSE 连接和请求 |
| `lib/mcp/server.ts` | MCP 核心逻辑，JSON-RPC 2.0 协议处理 |
| `lib/mcp/tools.ts` | 6 个工具的具体实现 |
| `lib/mcp/auth.ts` | 鉴权，验证 API Key |
| `lib/mcp/api-keys.ts` | API Key 的生成、校验、管理 |
| `lib/mcp/rate-limit.ts` | 限流，每小时 200 次 |
| `lib/mcp/errors.ts` | 错误处理，不暴露内部堆栈 |
| `app/api/admin/mcp-keys/route.ts` | 管理后台 API（创建 Key） |
| `app/api/admin/mcp-keys/[id]/route.ts` | 管理后台 API（撤销 Key） |
| `app/[lang]/admin/mcp-keys/page.tsx` | 管理后台 Key 管理页面 |
| `scripts/test-mcp*.mjs`（4个） | 测试脚本 |
| `scripts/scrape-articles.mjs` | 从线上抓文章的脚本 |
| `scripts/import-scraped.ts` | 导入文章的脚本 |

### 3. 修复了原有代码的 Bug

| 文件 | 问题 | 修复方式 |
|------|------|---------|
| `hooks/use-mobile.ts` | Wiki 页面水合错误（服务端/客户端不一致） | 初始值固定为 false，mount 后再检测 |
| `components/theme-switcher.tsx` | 主题切换水合错误 | 加 mounted 守卫 |
| `components/locale-switcher.tsx` | 语言切换水合警告 | 加 suppressHydrationWarning |
| `app/[lang]/wiki/[[...slug]]/page.tsx` | 访问 /zh/wiki 显示"文章不存在" | 自动跳转到 /zh/wiki/home |

### 4. 配置文件

| 文件 | 说明 |
|------|------|
| `prisma/migrations/20260914000000_add_mcp_tables/migration.sql` | 数据库迁移文件，建 mcp_api_keys 和 mcp_call_logs 两张表 |
| `.env.example` | 环境变量模板，包含 MCP 相关变量 |
| `.gitignore` | 排除 .pnpm-store/ 和 articles-scraped/ |

---

## 二、改了原有代码的哪些地方

一共只动了 8 个原有文件，全是小改动：

| 文件 | 改了多少 | 改了什么 |
|------|---------|---------|
| `prisma/schema.prisma` | +46 行 | 追加 McpApiKey 和 McpCallLog 两个模型（没动原有模型） |
| `components/app-sidebar.tsx` | +11 行 | 侧边栏加了个"MCP Keys"菜单入口 |
| `app/[lang]/wiki/[[...slug]]/page.tsx` | 改 3 行 | /zh/wiki 自动跳转 home（之前显示 404） |
| `hooks/use-mobile.ts` | 重写 13 行 | 修复水合错误 |
| `components/theme-switcher.tsx` | +4 行 | 修复水合错误 |
| `components/locale-switcher.tsx` | +1 行 | 修复水合警告 |
| `package.json` | +1 行 | 加 packageManager 字段 |
| `pnpm-workspace.yaml` | +9 行 | pnpm 安装时自动生成 |

**原有业务逻辑没有被破坏**，所有改动都是新增功能或修 Bug。

---

## 三、MCP 接口提供了什么能力

### 6 个只读工具

| 工具 | 功能 | 举例 |
|------|------|------|
| `search_wiki` | 全文搜索 | 搜"校园卡"→返回相关文章列表 |
| `get_article` | 获取文章详情 | 传 path="home"→返回完整 Markdown 内容 |
| `list_wiki_tree` | 获取目录树 | 返回所有已发布文章的层级结构 |
| `list_recent_articles` | 最近更新 | 返回最近改过的文章 |
| `get_related_articles` | 相关文章 | 传一篇文章→返回和它相关的文章 |
| `get_categories` | 分类统计 | 返回每个分类有多少篇文章 |

### 安全约束

- ✅ 只返回**已发布**的文章，草稿看不到
- ✅ **不暴露** Agent（已欠费停用）
- ✅ **不暴露**任何写操作（不能创建/删除/修改文章）
- ✅ **不复用**前端缓存，每次直接查数据库
- ✅ 错误信息**不暴露**内部堆栈
- ✅ 所有调用都记**审计日志**

### 技术规格

| 项 | 值 |
|----|-----|
| 传输协议 | MCP over SSE (JSON-RPC 2.0) |
| 协议版本 | 2024-11-05 |
| 鉴权 | Bearer Token（API Key） |
| 限流 | 每 Key 每小时 200 次 |
| 接口地址 | `/api/mcp` |
| 测试 | 32 项全部通过（18 基础 + 14 SSE 增强） |

---

## 四、怎么用

### 给社团 AI 用

1. 管理员登录 `https://baike.xauat.site/zh/admin/mcp-keys`
2. 创建一个 API Key，复制保存
3. 在社团 AI（LobeHub）里添加 MCP 服务：
   - SSE 地址：`https://baike.xauat.site/api/mcp`
   - 鉴权：Bearer Token
   - Token：刚才创建的 Key
4. 连接成功后就能用了

### 管理 API Key

- 管理后台 `/admin/mcp-keys` 可以创建、查看、撤销 Key
- 每个 Key 可以单独配置限流
- 可以看到每个 Key 的调用次数和最后使用时间

---

## 五、还差什么

### 必须做的（阻塞上线）

| # | 事项 | 说明 |
|---|------|------|
| 1 | **跟李哥确认社团 AI 的正确地址** | 之前问 gpt.xauat.site 他说不是，还需确认 |
| 2 | **部署到测试环境** | 李哥说可以给部署一个，数据跟生产一样 |
| 3 | **实际联调** | 部署后跟 LobeHub 实际对接跑通 |

### 可以后续做的（不阻塞）

| # | 事项 | 说明 |
|---|------|------|
| 4 | 限流改 Redis | 目前是内存限流，单实例够用，多实例需要 Redis |
| 5 | SSE 会话改 Redis Pub/Sub | 同上，多实例部署时需要 |
| 6 | MCP 工具增加更多能力 | 如果李哥觉得 6 个不够，可以加 |

### 不需要做的

- Agent 相关 — 李哥明确说不碰
- OIDC 鉴权 — 已确认用 Bearer Token
- 新建独立微服务 — 已确认嵌入后端

---

## 六、时间线回顾

| 时间 | 完成的事 |
|------|---------|
| 9.13 | 代码拉取、PostgreSQL 安装、数据库创建、依赖安装、服务器跑通 |
| 9.14 | MCP 模块开发（6 工具 + 鉴权 + 限流 + 审计日志 + 管理后台）、线上 280 篇文章导入、SSE 增强、Bug 修复 |
| 9.14 | 32 项测试全部通过、迁移文件生成、对接文档编写 |
| 9.21 | 限流改为每小时 200 次、生成完整说明文档 |
| 待定 | 跟李哥确认社团 AI 地址 → 部署测试环境 → 联调 → 正式上线 |

---

## 七、关键文件索引

| 文件 | 用途 |
|------|------|
| [MCP 对接文档](computer://d:\桌面\建大百科\luckywiki\docs\MCP-INTEGRATION.md) | 给社团 AI 配置用的详细说明 |
| [.env.example](computer://d:\桌面\建大百科\luckywiki\.env.example) | 环境变量模板 |
| [迁移文件](computer://d:\桌面\建大百科\luckywiki\prisma\migrations\20260914000000_add_mcp_tables\migration.sql) | 部署时执行 prisma migrate deploy |
