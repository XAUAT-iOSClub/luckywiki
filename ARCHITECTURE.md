# LuckyWiki 项目架构与实现详解

> 基于仓库当前代码（提交 `9221f47`）整理。  
> 目标：解释每个功能“是什么、入口在哪、代码怎么跑、数据落在哪、失败时怎么退化”。  
> 说明：仓库中没有提交 `node_modules/` 与 `generated/prisma/`，因此本文以源码、Prisma schema、迁移、测试和配置为准；Prisma Client 由 `postinstall` 生成。

---

## 目录

1. [项目定位与功能总览](#1-项目定位与功能总览)
2. [技术栈](#2-技术栈)
3. [目录结构地图](#3-目录结构地图)
4. [整体架构与请求流](#4-整体架构与请求流)
5. [路由、国际化与页面骨架](#5-路由国际化与页面骨架)
6. [认证、会话与权限](#6-认证会话与权限)
7. [数据模型与数据库](#7-数据模型与数据库)
8. [公开 Wiki：文章、路径树、分类与标签](#8-公开-wiki文章路径树分类与标签)
9. [管理后台](#9-管理后台)
10. [评论系统](#10-评论系统)
11. [Markdown / HTML 渲染管线](#11-markdown--html-渲染管线)
12. [搜索系统](#12-搜索系统)
13. [AI Agent（RAG 问答）](#13-ai-agentrag-问答)
14. [MCP 服务](#14-mcp-服务)
15. [图片托管与内容导入](#15-图片托管与内容导入)
16. [缓存、失效与后台队列](#16-缓存失效与后台队列)
17. [SEO、站点配置与静态资源](#17-seo站点配置与静态资源)
18. [安全设计](#18-安全设计)
19. [环境变量、运行与部署](#19-环境变量运行与部署)
20. [扩展指南：新增功能该改哪里](#20-扩展指南新增功能该改哪里)
21. [已知限制与注意事项](#21-已知限制与注意事项)
22. [关键文件索引](#22-关键文件索引)

---

## 1. 项目定位与功能总览

LuckyWiki 是一个 **以 Markdown 为核心、按路径组织内容、支持中英双语、带角色权限与评论审核的知识库 / Wiki 系统**。它同时提供：

- 面向读者的 Wiki 浏览、目录树、分类/标签页、全文搜索；
- 面向作者的 Monaco 编辑器（Markdown 或 HTML）、图片上传、路径选择器；
- 文章摘要：默认人工填写，配置 OpenAI 后可在编辑器内按需 AI 生成；
- 面向管理员的文章管理、评论审核、用户角色、操作日志、分类统计；
- 基于已发布文章构建的 **RAG 问答 Agent**（向量检索 + BM25 混合检索 + LangGraph 工具调用）；
- 面向外部 AI 平台的 **MCP（Model Context Protocol）只读接口**；
- Better Auth 邮箱密码 / GitHub / 通用 OIDC 登录；
- Vercel Blob 或任意 S3 兼容图床；
- 从 Markdown 目录批量导入、图片转 WebP 上传、Wiki.js 语法迁移等脚本。

### 功能与实现入口对照

| 功能 | 用户入口 | 主要实现 |
|---|---|---|
| 文章浏览 | `/[lang]/wiki/...` | `app/[lang]/wiki/[[...slug]]/page.tsx`、`lib/articles/index.ts` |
| 文章目录树 | 左侧 Wiki 侧栏 | `components/wiki-sidebar.tsx`、`lib/wiki/tree.ts` |
| 分类 / 标签 | `/wiki/category`、`/wiki/tag` | `app/[lang]/wiki/category/*`、`tag/*`、`lib/wiki/taxonomy.ts` |
| 全文搜索 | `Ctrl/Cmd + K` 对话框 | `components/wiki-search-dialog.tsx`、`app/actions/search.ts`、`lib/search.ts` |
| 登录 / 注册 / 验证邮箱 | `/[lang]/auth/*` | `lib/auth/*`、`components/auth-form.tsx`、`app/api/auth/[...all]/route.ts` |
| 个人设置 / 第三方绑定 | `/[lang]/settings` | `app/[lang]/settings/page.tsx`、`app/actions/settings.ts` |
| 文章编辑器 | `/[lang]/admin/articles/*` | `components/article-editor.tsx`、`app/actions/admin.ts` |
| 文章摘要 / AI 生成 | 编辑器“文章设置”抽屉、文章页标题下方 | `Article.description`、`lib/articles/summary.ts`、`app/actions/summary.ts`、`lib/openai/chat.ts` |
| 评论与审核 | 文章底部、`/admin/comments` | `components/wiki-comments.tsx`、`app/actions/comments.ts`、`app/actions/admin.ts` |
| AI 问答 | `/[lang]/agent` | `components/wiki-agent.tsx`、`app/api/agent/route.ts`、`lib/agent/*` |
| 文章向量索引 | 后台队列 / CLI | `lib/embedding-queue.ts`、`app/api/queue/article-embedding-sync/route.ts`、`scripts/reindex-agent.ts` |
| MCP 接口 | `POST/GET /api/mcp` | `app/api/mcp/route.ts`、`lib/mcp/*` |
| 图片上传 | 编辑器工具栏 / 粘贴 | `app/api/uploads/images/route.ts`、`lib/image-hosting.ts` |
| 批量导入 | CLI 脚本 | `lib/articles/import.ts`、`lib/articles/image-import.ts` |
| 操作审计 | `/admin/logs` | `prisma/schema.prisma` 的 `Log`、`app/actions/admin.ts` |
| SEO | 全站 | `lib/metadata/index.ts`、`lib/structured-data/index.tsx`、`app/sitemap.ts`、`app/robots.ts`、`app/og/route.tsx` |

---

## 2. 技术栈

| 层 | 技术 / 版本 | 用途 |
|---|---|---|
| 框架 | **Next.js 16.2.5**（App Router） | RSC、Server Actions、Route Handlers、`proxy.ts`、`cacheComponents` |
| UI | React 19.2.4、Tailwind CSS 4、shadcn（style: `radix-nova`）、Radix UI、Lucide | 组件与样式 |
| 语言 | TypeScript 5（`strict: true`） | 全栈类型约束 |
| ORM | Prisma 7.8 + `@prisma/adapter-pg` | PostgreSQL 访问；客户端输出到 `generated/prisma` |
| 数据库 | PostgreSQL / **ParadeDB** | 业务数据 + BM25（`pg_search`）+ `pgvector` |
| 认证 | Better Auth 1.6.9 | 邮箱密码、GitHub、通用 OIDC、会话、账号绑定 |
| Agent | LangChain 1.4、LangGraph 1.3、`@langchain/openai` | ReAct 工具调用 + 显式 QA 图 |
| 摘要 AI | OpenAI Chat Completions（复用 `OPENAI_*`） | 编辑器内按需生成文章摘要 |
| Markdown | `react-markdown`、`remark-*`、`rehype-*`、`@luckyfishes/markdown-core` | 自定义语法与组件渲染 |
| 编辑器 | Monaco Editor | Markdown / HTML 编辑与预览 |
| 图 / 图表 | Mermaid、PlantUML、AntV Infographic、KaTeX | 文档内可视化 |
| 对象存储 | Vercel Blob、AWS SDK S3 | 图片托管 |
| 限流 | Upstash Redis + `@upstash/ratelimit` | 搜索 / MCP 分布式滑动窗口 |
| 队列 | `@vercel/queue` | 文章嵌入异步同步 |
| 邮件 | Resend HTTP API（可选） | 验证邮件；未配置时打印到日志 |
| 测试 | Node `node:test` + `tsx` | 22 个测试文件（含 `article-summary.test.ts`） |
| 包管理 | pnpm 11.20.0 | `pnpm-workspace.yaml` 控制依赖构建脚本 |

---

## 3. 目录结构地图

```text
luckywiki/
├─ app/
│  ├─ [lang]/                       # 所有本地化页面（zh | en）
│  │  ├─ layout.tsx                 # 根布局：主题、i18n、搜索、JSON-LD
│  │  ├─ page.tsx                   # /[lang] → /[lang]/wiki/home
│  │  ├─ wiki/                      # 公开 Wiki（含 catch-all 文章路由）
│  │  ├─ agent/                     # AI 问答页
│  │  ├─ auth/                      # 登录、注册、验证邮箱
│  │  ├─ settings/                  # 个人资料与账号绑定
│  │  └─ admin/                     # 管理后台（文章、评论、用户、日志、分类、MCP Key）
│  ├─ actions/                      # Server Actions（写操作/搜索/摘要）
│  ├─ api/                          # Route Handlers
│  │  ├─ auth/[...all]/             # Better Auth 统一入口
│  │  ├─ agent/                     # Agent SSE
│  │  ├─ mcp/                       # MCP over SSE / JSON
│  │  ├─ search/                    # 公开搜索 API
│  │  ├─ pages/                     # 公开文章 API（供抓取/外部集成）
│  │  ├─ uploads/images/            # 图片上传
│  │  ├─ admin/mcp-keys/            # MCP Key 管理 API
│  │  └─ queue/article-embedding-sync/ # Vercel Queue 消费者
│  ├─ og/route.tsx                  # 动态 Open Graph 图片
│  ├─ sitemap.ts / robots.ts
│  └─ globals.css                   # Tailwind + 设计变量 + Markdown 样式
├─ components/
│  ├─ article-editor.tsx            # 核心编辑器（含摘要 AI 生成）
│  ├─ markdown-renderer.tsx         # Markdown 渲染管线
│  ├─ markdown-custom-components*   # Badge/Tip/Tabs/Card/Timeline/Chat/Icon/Mermaid…
│  ├─ wiki-*.tsx                    # 侧栏、搜索、评论、TOC、Shell、Agent
│  ├─ auth-form.tsx、settings-*.tsx
│  └─ ui/                           # shadcn 生成的基础组件
├─ lib/
│  ├─ agent/                        # 分块、嵌入、检索、工具、LangGraph、Agent 运行时、SSE
│  ├─ articles/                     # 导入、图片导入、Wiki.js 迁移、摘要生成
│  ├─ auth/                         # Better Auth 配置、会话、权限、Provider 配置
│  ├─ i18n/                         # locale 配置、字典、Provider、格式化
│  ├─ mcp/                          # MCP 协议、工具、鉴权、Key、限流、错误
│  ├─ openai/                       # OpenAI URL/Header 共享配置、Chat Completions 客户端
│  ├─ wiki/                         # 路径规范化、树、分类参数
│  ├─ admin.ts、comments.ts、search.ts、image-hosting.ts、prisma.ts…
│  ├─ cache-tags.ts、embedding-queue.ts、rate-limit.ts
│  └─ metadata/、structured-data/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/                   # 11 个迁移
│  └─ seed.ts
├─ scripts/                         # 导入 / 迁移 / 重索引 / 抓取
├─ tests/                           # node:test 测试（含 article-summary.test.ts）
├─ proxy.ts                         # Next 16 请求代理（locale + admin 预检查）
├─ next.config.ts、prisma.config.ts、vercel.json
└─ docs/                            # MCP 对接说明
```

---

## 4. 整体架构与请求流

### 4.1 分层

```text
┌──────────────────────────────────────────────────────────────────┐
│ Browser                                                          │
│  RSC 页面 / 客户端组件 / Server Action 调用 / fetch               │
└───────────────┬──────────────────────────────┬───────────────────┘
                │                              │
┌───────────────▼──────────────┐  ┌────────────▼──────────────────┐
│ proxy.ts                     │  │ Route Handlers                │
│ - 补 locale 前缀             │  │ /api/auth /api/agent /api/mcp │
│ - 写 NEXT_LOCALE cookie      │  │ /api/search /api/pages        │
│ - /admin 仅检查 session cookie│  │ /api/uploads /api/queue /og   │
└───────────────┬──────────────┘  └────────────┬──────────────────┘
                │                              │
┌───────────────▼──────────────────────────────▼───────────────────┐
│ Server Components（页面 / 布局） + Server Actions（"use server"） │
│ - 页面查询公开数据，用 "use cache" + cacheTag 做持久缓存           │
│ - Action 做鉴权、Zod 校验、写库、写日志、失效缓存、投递队列        │
└───────────────┬──────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────┐
│ lib/* 领域层                                                      │
│ articles / wiki / auth / agent / mcp / search / image-hosting …   │
└───────────────┬──────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────┐
│ Prisma Client（PrismaPg adapter）                                 │
│  → PostgreSQL / ParadeDB（pg_search + vector + pg_trgm）          │
└──────────────────────────────────────────────────────────────────┘
        │                    │                   │
   OpenAI / 网关        Upstash Redis        Vercel Blob / S3
   （聊天/摘要 + 嵌入）  （分布式限流）        （图片）
                         Vercel Queue（嵌入同步）/ Resend（邮件）
```

### 4.2 渲染与交互模式

- **页面默认是 Server Component**：直接在服务端查 Prisma，输出 HTML；不通过内部 REST 再取一次数据。
- **交互组件标记 `"use client"`**：编辑器、Agent、搜索对话框、侧栏、主题/语言切换、设置表单等。
- **写操作优先用 Server Actions**（`app/actions/*`）：表单 `action={...}` 或 `useActionState`，避免手写 API。
- **需要流式/外部协议时用 Route Handler**：Agent SSE、MCP SSE、图片上传、队列回调、Better Auth。
- **服务端组件可把 Server Component 作为 `ReactNode` 传给客户端组件**：例如 `WikiShell` 把 `WikiSidebarAdminSlot` / `WikiSidebarAccountSlot` 传入客户端 `WikiSidebar`，只在有权限时渲染。

### 4.3 五个典型请求

**文章页**

```text
GET /zh/wiki/生活/校园卡
→ proxy：已有 locale，写 NEXT_LOCALE=zh
→ app/[lang]/wiki/[[...slug]]/page.tsx
→ canonicalizeSlugSegments() 校验路径
→ getPublishedArticleByPath()（"use cache" + tag `article:path`）
→ MarkdownRenderer（或 WikiHtmlRenderer）
→ WikiComments（独立 Suspense，查已审核评论）
→ WikiToc（客户端读取 DOM 标题）
→ ArticleJsonLd / BreadcrumbListJsonLd
```

**发布文章**

```text
表单提交 → createArticleAction / updateArticleAction
→ requireAuthorSession（角色校验）
→ Zod 校验 + canonicalizePath
→ prisma.article.create/update（publishedAt 规则）
→ enqueueArticleEmbeddingSync({articleId, updatedAt})
→ prisma.log.create（审计）
→ updateTag(...) + revalidatePath(...)
→ 返回成功路径/提示，客户端跳转或刷新
```

**AI 摘要生成**

```text
编辑器点击「AI 生成摘要」
→ generateArticleSummaryAction（Server Action，不是独立路由）
→ requireAuthorSession + Zod + isOpenAiConfigured
→ Upstash 限流：每用户 10 次/小时（开发环境无 Upstash 时放行）
→ lib/articles/summary.ts：清洗正文（去 script/style/HTML/Markdown）
→ 截断到 12k 字 → 构建 prompt
→ lib/openai/chat.ts：POST /chat/completions（复用 OPENAI_*）
→ 规范化输出（去标签/引号/代码围栏，<= 280 字）
→ 返回 { summary }；只回填编辑器 state，不写数据库
→ 用户点击「保存更改」后由 create/updateArticleAction 持久化
```

**Agent 问答**

```text
POST /api/agent（JSON：locale + 最近消息）
→ 校验 payload、取最后一条 user 消息
→ retrieveRelevantAgentChunks（嵌入 + ANN/BM25 融合）
→ 立即发送 SSE `sources`
→ LangGraph：prepare → answer（ReAct 工具流）→（空答案则 recover 一次）→ finish
→ SSE `delta` / `tool` / `done` / `error`
```

**MCP 调用**

```text
GET /api/mcp（Bearer Key）→ SSE 流 + endpoint 事件（sessionId）
POST /api/mcp?sessionId=...（JSON-RPC initialize / tools/list / tools/call）
→ Bearer 校验（数据库 Key > 环境变量全局 Key）
→ Upstash 滑动窗口限流
→ JSON-RPC 分发 → 只读工具查已发布文章
→ 有 sessionId：响应写回 SSE，POST 返回 202；无 sessionId：直接 JSON 返回
```

---

## 5. 路由、国际化与页面骨架

### 5.1 路由表

| 路由 | 说明 |
|---|---|
| `/[lang]` | 重定向到 `/[lang]/wiki/home` |
| `/[lang]/wiki` | 没有 slug 时重定向到 `/[lang]/wiki/home` |
| `/[lang]/wiki/[[...slug]]` | 文章页（catch-all，路径可多级） |
| `/[lang]/wiki/category` | 分类索引（一级路径统计） |
| `/[lang]/wiki/category/[category]` | 某分类下的已发布文章 |
| `/[lang]/wiki/tag` | 标签索引 |
| `/[lang]/wiki/tag/[tag]` | 某标签下的已发布文章 |
| `/[lang]/agent` | AI 问答 |
| `/[lang]/settings` | 个人资料 / 账号绑定（未登录会跳转登录） |
| `/[lang]/auth/sign-in` | 登录 |
| `/[lang]/auth/sign-up` | 注册 |
| `/[lang]/auth/verify-email` | 邮箱验证状态页 |
| `/[lang]/admin` | 管理总览（仅 ROOT） |
| `/[lang]/admin/articles` | 文章库（ROOT/AUTHOR） |
| `/[lang]/admin/articles/new` | 新建文章 |
| `/[lang]/admin/articles/[id]` | 编辑文章 |
| `/[lang]/admin/comments` | 评论审核（仅 ROOT） |
| `/[lang]/admin/users` | 用户与角色（仅 ROOT） |
| `/[lang]/admin/logs` | 操作日志（仅 ROOT） |
| `/[lang]/admin/taxonomy` | 分类结构（仅 ROOT） |
| `/[lang]/admin/mcp-keys` | MCP Key 管理（管理后台内） |
| `/api/auth/[...all]` | Better Auth 全部端点 |
| `/api/agent` | Agent SSE |
| `/api/mcp` | MCP SSE + JSON-RPC |
| `/api/search` | 公开搜索（GET） |
| `/api/pages` | 已发布文章树 |
| `/api/pages/[...path]` | 单篇已发布文章 + 评论 |
| `/api/uploads/images` | 图片上传（作者/管理员） |
| `/api/admin/mcp-keys` | 列出/创建自己的 Key |
| `/api/admin/mcp-keys/[id]` | 撤销自己的 Key |
| `/api/queue/article-embedding-sync` | Vercel Queue 回调 |
| `/og` | 动态 OG 图片 |
| `/sitemap.xml`、`/robots.txt` | SEO |

> 文章摘要的 AI 生成不是独立路由，而是 `app/actions/summary.ts` 中的 Server Action，仅在文章编辑器中调用。

### 5.2 `proxy.ts`：locale 与 admin 预检查

`proxy.ts` 是 Next 16 的请求代理入口（传统 `middleware.ts` 的新命名），matcher 排除 `api`、`_next/static`、`_next/image`、`favicon.ico` 以及任何含 `.` 的路径。

逻辑：

1. 路径第一段不是 `zh` / `en`：
   - 读取 `NEXT_LOCALE` cookie；
   - 否则解析 `Accept-Language`（`zh-*` → zh，`en-*` → en，默认 zh）；
   - 307 重定向到带 locale 的同一路径。
2. 已本地化且不是 `/{lang}/admin`：继续请求，并刷新 `NEXT_LOCALE` cookie。
3. 已本地化且是 `/{lang}/admin`：
   - 用 `getSessionCookie()` 只检查“是否存在会话 cookie”；
   - 有 → 继续并刷新 locale cookie；
   - 无 → 重定向到 `/{lang}/auth/sign-in?next=原始路径`。

> 注意：proxy 只做“是否带 cookie”的轻量判断，**不验证会话有效性**；真正的鉴权在布局/页面/Action/Route 里用 `auth.api.getSession()` 完成。

### 5.3 locale 工具

`lib/i18n/config.ts`：

- `locales = ["zh", "en"]`，默认 `zh`，cookie 名 `NEXT_LOCALE`；
- `getPathnameLocale()`：取第一段；
- `stripLocaleFromPathname()`：去掉 locale 前缀；
- `localizeHref(locale, href)`：去掉已有 locale、保留 query/hash，再前缀目标 locale；
- `getPreferredLocale()`：解析 `Accept-Language`；
- `getIntlLocale()`：`zh → zh-CN`，`en → en-US`。

`lib/wiki/path.ts` 的 `buildWikiHref()` 会对路径逐段 `encodeURIComponent`，因此中文、空格、`+`、`&` 都能正确生成 URL。

### 5.4 字典与客户端 i18n

- 字典是 TypeScript 对象：`lib/i18n/dictionaries/zh.ts`、`en.ts`（各约 443 行）。
- `getDictionary(locale)` 通过动态 `import()` 加载，避免把两份字典都打进首屏；标记了 `server-only`。
- 根布局 `app/[lang]/layout.tsx` 取字典后传给客户端 `I18nProvider`；客户端用 `useT()` 取字典、`useLocale()` 取 locale。
- `formatDate/formatDateTime/formatNumber/formatTemplate` 统一用 `Intl` 与 `{name}` 占位符。
- 语言切换器 `LocaleSwitcher` 保持当前路径和 query，用 `window.location.href` 跳转到另一 locale（确保整页重新加载字典）。

### 5.5 根布局与全局 Provider

`app/[lang]/layout.tsx`：

```text
<html lang={zh-CN|en-US}>
  <body>
    <Suspense><TopRouteProgress /></Suspense>
    <ThemeProvider attribute="class" defaultTheme="system">
      <I18nProvider>
        <SearchProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <WikiSearchDialog />
        </SearchProvider>
      </I18nProvider>
      <WebSiteJsonLd />
    </ThemeProvider>
    <Analytics />
  </body>
</html>
```

- `generateStaticParams()` 预生成 `zh` / `en`。
- `generateMetadata()` 从环境变量读取站点名、描述、favicon，设置 `metadataBase` 和标题模板。
- 字体变量直接写在根节点 `style` 中，不依赖网络字体。
- `TopRouteProgress` 拦截站内链接点击与 `popstate`，显示顶部进度条。

### 5.6 Next 配置

`next.config.ts`：

- `cacheComponents: true`：启用 `"use cache"` / `cacheLife` / `cacheTag` 等缓存原语；
- `experimental.turbopackFileSystemCacheForBuild: true`：构建期文件系统缓存；
- `transpilePackages: ["@luckyfishes/markdown-core"]`；
- 图片格式 `avif` / `webp`；
- 全站安全响应头：`X-Content-Type-Options`、`X-Frame-Options: DENY`、`X-XSS-Protection`、`Referrer-Policy`、`Permissions-Policy`；
- 永久重定向：`/:lang/:path+/` → `/:lang/:path+`（去尾斜杠）。

---

## 6. 认证、会话与权限

### 6.1 Better Auth 配置（`lib/auth/index.ts`）

| 配置 | 行为 |
|---|---|
| `database` | Prisma adapter，PostgreSQL |
| `baseURL` | `BETTER_AUTH_URL` → `NEXT_PUBLIC_APP_URL` → `http://localhost:3000` |
| `secret` | `BETTER_AUTH_SECRET`，未设置时有开发兜底（生产必须覆盖） |
| `trustedOrigins` | 当前 baseURL + `http://localhost:3000` |
| `user.additionalFields.role` | 字符串，默认 `USER`，`input: false`（不允许客户端直接设置） |
| `socialProviders.github` | 仅当 `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` 都存在 |
| `genericOAuth` | 仅当 `OIDC_DISCOVERY_URL` + `OIDC_CLIENT_ID` + `OIDC_CLIENT_SECRET` 都存在 |
| `account.accountLinking` | 开启；`allowDifferentEmails: false`（邮箱不同不自动合并） |
| `emailAndPassword` | 开启；`autoSignIn: false`；**必须验证邮箱**；密码最少 8 位 |
| `emailVerification` | 注册/登录时发送；验证后自动登录；24 小时有效；验证成功写 `emailVerifiedAt` |
| `plugins` | `nextCookies()`、可选 `genericOAuth()` |

`customSyntheticUser` 用于把 `role` 兜底成字符串，避免 Better Auth 内部合成用户时缺字段。

### 6.2 Provider 开关与 OIDC Profile 映射

`lib/auth/provider-config.ts`：

- `getAuthProviderFlags()`：只有一组环境变量“完整”时对应按钮才出现；
- `getOidcProviderConfig()`：
  - `providerId = "oidc"`；
  - scopes：`openid profile email`；
  - `mapProfileToUser` 兼容 `sub/id`、`name/preferred_username/email`、`picture/avatar_url`；
  - 邮箱统一小写；
  - `email_verified` / `emailVerified` / `verified_email` 任一为 true 即视为已验证。

### 6.3 登录 / 注册 / 验证流程

`components/auth-form.tsx`：

- **注册**：`authClient.signUp.email({ name, email, password, callbackURL: /auth/verify-email })`；成功后清空密码并提示“去邮箱验证”。
- **登录**：`authClient.signIn.email({ email, password })`；成功后 `router.push(nextPath)` + `refresh()`。
- **GitHub**：`authClient.signIn.social({ provider: "github", callbackURL, errorCallbackURL })`。
- **OIDC**：`authClient.signIn.oauth2({ providerId: "oidc", ... })`。
- 客户端 `lib/auth/client.ts` 通过 `genericOAuthClient()` 插件支持通用 OIDC 的登录/绑定。
- `next` 参数只接受以 `/` 开头的站内路径，否则回退到 `/{lang}/wiki`。
- 登录页若已有会话，直接重定向 `nextPath`。
- OAuth 错误码由 `lib/auth/client-errors.ts` 映射为友好文案（邮箱缺失、未验证、账号已绑定他人、邮箱不一致等）。

验证邮件 `lib/email.ts`：

- 配置了 `RESEND_API_KEY` + `EMAIL_FROM` → 调 Resend API 发送本地化 HTML；
- 未配置 → 仅 `console.info` 输出验证链接（本地开发友好）；
- 从验证 URL 的路径第一段判断邮件语言。

`app/[lang]/auth/verify-email/page.tsx` 显示“已验证 / 请查收邮箱 / 需要先验证才能评论”等状态。

### 6.4 会话辅助（`lib/auth/session.ts`）

| 函数 | 行为 |
|---|---|
| `getCurrentSession()` | `cache()` 包裹的 `auth.api.getSession({ headers })`，同一次请求复用 |
| `requireSession(locale, nextPath)` | 未登录 → 重定向登录页并带 `next` |
| `requireAuthorSession(locale)` | 需要 ROOT 或 AUTHOR；否则重定向 `/wiki` |
| `requireRootSession(locale, redirectTo?)` | 需要 ROOT |
| `requireVerifiedSession(locale, nextPath)` | 需要已登录 + 邮箱已验证；否则去验证页 |

### 6.5 角色与权限矩阵（`lib/auth/permissions.ts`）

| 能力 | ROOT | AUTHOR | USER | 未登录 |
|---|:---:|:---:|:---:|:---:|
| 浏览公开 Wiki / 搜索 / Agent | ✅ | ✅ | ✅ | ✅ |
| 进入管理后台外壳 | ✅ | ✅ | ❌ | ❌ |
| 创建/编辑/发布文章 | ✅ | ✅ | ❌ | ❌ |
| 访问 `/admin/articles*` | ✅ | ✅ | ❌ | ❌ |
| 管理后台总览 `/admin` | ✅ | ❌（跳文章列表） | ❌ | ❌ |
| 评论审核 | ✅ | ❌ | ❌ | ❌ |
| 用户/角色管理 | ✅ | ❌ | ❌ | ❌ |
| 操作日志 / 分类结构 | ✅ | ❌ | ❌ | ❌ |
| 发表评论 | ✅（需验证） | ✅（需验证） | ✅（需验证） | ❌ |
| MCP Key 管理页 | ✅ | ✅ | ❌（布局拦截） | ❌ |

角色规则：

- 仅三种：`ROOT`、`AUTHOR`、`USER`；
- 角色变更仅 ROOT 可操作；
- 不能把角色改成与当前相同；
- **不能把最后一个 ROOT 降级**（UI 与服务端都会阻止，`canChangeUserRole` 接收当前 ROOT 数量）。

### 6.6 鉴权的四层执行

1. **proxy**：admin 路径的 cookie 存在性预检查（体验层）。
2. **布局**：`app/[lang]/admin/layout.tsx` 统一 `requireAuthorSession(locale)`。
3. **页面/动作**：ROOT 专属页面再调用 `requireRootSession`；Action 内部再次调用权限函数。
4. **API**：上传接口检查 `canWriteArticles`；MCP Key 接口检查 session；MCP 接口检查 Bearer Key。

> 安全上的关键点是第 2–4 层，而不是 proxy。

### 6.7 个人设置与账号绑定

`app/[lang]/settings/page.tsx`：

- 未登录 → 登录页；
- 读取 `auth.api.listUserAccounts()`，把已配置的 GitHub / OIDC 与已绑定账号对应起来；
- `SettingsProfileForm` 调 `updateProfileAction`：Zod 校验姓名非空、头像必须是 `http(s)` URL，然后 `auth.api.updateUser()`；
- `SettingsAccountConnections`：
  - 绑定：`POST /api/auth/link-social`（GitHub）或 `POST /api/auth/oauth2/link`（OIDC），拿到 `url` 后整页跳转；
  - 解绑：Server Action `unlinkAccountAction` → `auth.api.unlinkAccount()`；
  - 只剩最后一个登录方式时禁止解绑（Better Auth 报错被捕获并本地化）。

---

## 7. 数据模型与数据库

### 7.1 Prisma 运行方式

- `prisma/schema.prisma` 使用 `provider = "prisma-client"`，输出到 `generated/prisma/`（被 `.gitignore` 忽略，`postinstall` 执行 `prisma generate`）。
- `datasource db` 没有内联 `url`，连接串来自 `prisma.config.ts`（CLI）与 `lib/prisma.ts`（运行时）。
- 连接串优先级：
  1. `PARADEDB_DATABASE_URL`
  2. `DIRECT_URL`
  3. `PRISMA_DATABASE_URL`
  4. `POSTGRES_URL`
  5. `DATABASE_URL`
- 当 `PARADEDB_SSL_MODE=disable` 时，会从 URL 删除 `sslmode` / `ssl` 参数（自建 ParadeDB 常见）。
- 运行时用 `PrismaPg` adapter 创建 `PrismaClient`；开发环境挂到 `globalThis` 防止热更新重复建连。
- **断线重连扩展**：对所有模型的读操作（`findFirst/findMany/findUnique/count/aggregate/groupBy` 等）捕获“连接已关闭”类错误，执行一次 `$disconnect()` + `$connect()` 后重试；写操作不重试，避免重复写入。
- 没有连接串时返回一个“调用即抛错”的 Proxy，让构建期（如 sitemap）可以优雅降级。

### 7.2 模型总览

| 模型 | 表名 | 关键字段 | 关系 / 索引 |
|---|---|---|---|
| `User` | `users` | `id(cuid)`、`name`、`email(unique)`、`emailVerified`、`emailVerifiedAt`、`image`、`role` | 1-N sessions/accounts/articles/comments/logs/mcpApiKeys |
| `Session` | `sessions` | `token(unique)`、`expiresAt`、`ipAddress`、`userAgent` | `userId` 级联删除；`userId` 索引 |
| `Account` | `accounts` | `providerId + accountId(unique)`、token、password | `userId` 级联删除 |
| `Verification` | `verifications` | `identifier`、`value`、`expiresAt` | `identifier` 索引 |
| `Article` | `articles` | `path(unique)`、`title`、`description`、`tags[]`、`editor`、`markdown`、`status`、`publishedAt` | `authorId`（Restrict）；`status` / `authorId` 索引 |
| `AgentChunk` | `agent_chunks` | `articleId`、`chunkIndex`、`heading`、`content`、`embedding vector(1024)` | `(articleId, chunkIndex)` 唯一；`articleId` 索引；级联删除 |
| `Comment` | `comments` | `articleId`、`authorId`、`body`、`status`、`approvedById`、`approvedAt` | `articleId` 级联；作者级联；审核人 SetNull；`(articleId,status)` 索引 |
| `Log` | `logs` | `action`、`targetType`、`targetId`、`detail(JSON 字符串)`、`userId` | `userId` Restrict；action/user/createdAt 索引 |
| `McpApiKey` | `mcp_api_keys` | `name`、`keyHash(unique)`、`prefix`、`rateLimit`、`lastUsedAt`、`totalCalls`、`revokedAt` | `userId` 级联；`keyHash` 索引 |
| `McpCallLog` | `mcp_call_logs` | `apiKeyId`、`userId`、`method`、`toolName`、`status`、`errorCode`、`durationMs`、`ipAddress` | `apiKeyId` 级联；多列索引 |

> `Article.description` 现在同时承担“文章摘要”角色：默认人工填写；配置 `OPENAI_API_KEY` 后可在编辑器中按需 AI 生成，结果仍保存回同一字段。**没有新增表或字段。**

枚举：

- `Role`: `ROOT | AUTHOR | USER`
- `ArticleStatus`: `DRAFT | PUBLISHED`
- `CommentStatus`: `PENDING | APPROVED | REJECTED`
- `LogAction`: `CREATE_ARTICLE | UPDATE_ARTICLE | DELETE_ARTICLE | APPROVE_COMMENT | REJECT_COMMENT | SET_ARTICLE_STATUS | SET_USER_ROLE`

> `DELETE_ARTICLE` 目前只存在于枚举和日志展示中，**没有删除文章的实现**。

### 7.3 迁移历史

| 迁移 | 内容 |
|---|---|
| `20260507090000_luckywiki_v1` | 初始表：users/sessions/accounts/verifications/articles/comments；Role 仅 ROOT/USER |
| `20260508093000_article_frontmatter_metadata` | Article 增加 `description`、`tags[]`、`editor` |
| `20260509113000_agent_chunks` | 创建 `agent_chunks`（当时 embedding 为 TEXT） |
| `20260509153000_add_author_role` | Role 增加 `AUTHOR` |
| `20260512180000_add_pg_trgm_search` | 启用 `pg_trgm`，为 title/markdown 建 GIN 三元组索引 |
| `20260516000000_add_operation_logs` | 创建 `logs` 与 `LogAction` |
| `20260829090000_paradedb_hybrid_search` | 启用 `pg_search` + `vector`；增加 `embedding_vector vector(1024)`；HNSW 余弦索引；articles/agent_chunks 的 BM25 索引 |
| `20260914000000_add_mcp_tables` | `mcp_api_keys`、`mcp_call_logs` |
| `20260922000000_add_site_settings` | 曾创建 `site_settings`（已废弃） |
| `20260924120000_drop_site_settings` | 删除 `site_settings`，配置回到环境变量 |
| `20261007100000_consolidate_agent_chunk_embedding` | 删除 JSON embedding 列，把 `embedding_vector` 重命名为 `embedding` 并设为 NOT NULL；重建 HNSW |

### 7.4 数据库扩展与索引

- `pg_trgm`：`idx_articles_title_trgm`、`idx_articles_markdown_trgm`（GIN）。
- `pg_search`（ParadeDB BM25）：
  - `idx_articles_bm25`：`articles(id, title, description, markdown)`；
  - `idx_agent_chunks_bm25`：`agent_chunks(id, heading, content)`。
- `pgvector`：
  - `agent_chunks.embedding vector(1024)`；
  - `idx_agent_chunks_embedding_hnsw`：`hnsw (embedding vector_cosine_ops)`。
- 应用会在运行时探测扩展/列是否存在（`pg_extension`、`information_schema.columns`），不存在时自动降级到下一层检索。

---

## 8. 公开 Wiki：文章、路径树、分类与标签

### 8.1 文章路径规则（`lib/wiki/path.ts`）

`canonicalizePath()`：

1. Unicode NFC 规范化；
2. `\` → `/`；
3. 合并连续 `/`，去掉首尾 `/`；
4. 每段：
   - 不能为空，不能有首尾空格；
   - 不能是 `.` 或 `..`；
   - 不能包含 `/ \ ? #` 或控制字符；
   - **仅 ASCII 大写字母转小写**，中文保持原样；
5. 段之间用 `/` 连接。

示例：

```text
/指南/Next-16/入门/      → 指南/next-16/入门
学校/专业简介/土木工程（中外合作办学） → 不变
指南/../入门             → 抛错
指南/入门?test           → 抛错
```

`canonicalizeSlugSegments()` 会先对 catch-all 参数 `decodeURIComponent`，再走同一套规则；异常被页面捕获后返回 `notFound()`。

`index.md` 的导入映射：

```text
index.md               → ""（根文章）
Guides/index.md        → "guides"
Guides/Next-16/Setup.md → "guides/next-16/setup"
```

### 8.2 目录树（`lib/wiki/tree.ts`）

`buildWikiTree(articles)`：

- 根节点 `{ path: "", label: "Wiki" }`；
- 对每篇文章按 `/` 拆分，逐级创建/复用节点；
- 有文章对应的节点记录 `articleTitle`，并用文章标题替换 `label`；
- 子节点按 `segment.localeCompare(..., "zh-Hans-CN")` 排序。

`isNodeExpanded(nodePath, currentPath)`：当前路径等于节点或以 `节点/` 开头时展开。

### 8.3 公开查询与缓存（`lib/articles/index.ts`）

| 函数 | 过滤 | 缓存 |
|---|---|---|
| `listPublishedArticleTreeData()` | PUBLISHED，只取 path/title/时间 | `"use cache"` + `cacheLife("max")` + `ARTICLES_CACHE_TAG` |
| `getPublishedArticleByPath(path)` | PUBLISHED + 精确 path，带作者名 | `"use cache"` + `article:{path}` tag |
| `listPublishedArticlesByTag(tag)` | PUBLISHED + `tags has tag` | 全局文章 tag |
| `listPublishedArticlesBySection(section)` | PUBLISHED 且 path 等于 section 或以 `section/` 开头 | 全局文章 tag |
| `listPublishedTaxonomy()` | 所有 PUBLISHED 的 path/tags，在 JS 聚合 | 全局文章 tag |
| `listPublishedArticleComments(articleId, page)` | APPROVED，按时间升序，分页 | `article-comments:{id}` tag |

管理端查询（`listAdminArticles`、`getArticleById`、`listAdminTaxonomy` 等）不做 `"use cache"`，只对部分函数使用 React `cache()` 做单次请求内复用。

### 8.4 文章页渲染

`app/[lang]/wiki/[[...slug]]/page.tsx`：

1. 校验 locale；
2. `safeCanonicalize(slug)`；空路径 → 重定向 `/wiki/home`；非法 → `notFound()`；
3. 并行取文章与字典；
4. 未找到 → `notFound()`；
5. 头部展示标题；标题下方展示 `description`（摘要，若存在）；随后是发布日期、标签 Badge、一级分类 Badge；
6. 两栏布局：
   - 正文：`editor === "html"` 用 `WikiHtmlRenderer`（`dangerouslySetInnerHTML`）；否则 `MarkdownRenderer`；
   - 右侧：`WikiToc`（仅 Markdown，HTML 传空字符串）；
7. 正文下方 `WikiComments`（Suspense，独立分页）；
8. 注入 `ArticleJsonLd` 与 `BreadcrumbListJsonLd`。

`generateMetadata()` 未找到文章时返回“文章不存在”标题；找到时用 `buildArticleMetadata()` 生成 canonical、hreflang、OpenGraph、Twitter、关键词。描述优先取 `Article.description`（160 字截断），没有时回退到 Markdown 正文截取。

#### 文章页头部操作（AUTHOR / ROOT）

- `WikiShell` 顶栏右侧在 `section="articles"` 时挂载 `WikiArticleHeaderActions`（Suspense 动态洞，避免拖慢 PPR 静态壳）。
- 服务端首次渲染通过 `proxy.ts` 注入的 `x-luckywiki-pathname` 请求头识别当前文章，并用 `getPublishedArticleByPath()` 取 `id/path/title`。
- 由于共享 layout 在客户端导航时不会重新渲染，`WikiArticleActionsController` 会监听 `usePathname()`；路径变化时调用 Server Action `getArticleHeaderInfoAction()` 重新解析目标文章，并在解析完成前隐藏旧按钮，避免误操作上一篇。
- 按钮：编辑（`/admin/articles/[id]`）、历史（`.../history`）、移动、删除。
- `moveArticleAction()` 会连带移动子页面（`planArticlePathMove()`，`lib/articles/move.ts`），校验目标冲突并刷新新旧路径的缓存；`deleteArticleAction()` 删除文章（评论、修订、Agent chunks 级联）并写入操作日志。
- 非作者/管理员、非文章路由、分类/标签路由均不渲染操作按钮。

### 8.5 分类与标签页

**分类（section）= 路径第一段。**

- 索引页 `listPublishedTaxonomy()` 汇总每个一级路径的文章数，按数量降序、名称升序；
- 分类详情页 `listPublishedArticlesBySection(category)` 同时匹配 `path === category` 与 `path startsWith category/`；
- 分类参数 `decodeCategoryParam()` 会 NFC、trim、拒绝控制字符、拒绝 `/`、最后转小写。

**标签：**

- 索引页汇总所有 `tags` 计数；
- 详情页 `listPublishedArticlesByTag(tag)` 精确匹配；
- 标签参数 `decodeTaxonomyParam()` 保留大小写。

两类详情页在结果为空时直接 `notFound()`。

### 8.6 公开文章 API

- `GET /api/pages`：返回 `buildWikiTree()` 的树（仅 PUBLISHED）。
- `GET /api/pages/[...path]?commentsPage=&commentsPageSize=`：
  - `path.join("/")` 作为文章路径（**不做 canonicalize**）；
  - 只返回 PUBLISHED；
  - 附带已审核评论及分页信息；
  - 供抓取脚本和外部只读集成使用。

### 8.7 目录（TOC）

`components/wiki-toc.tsx` 是客户端组件：

- Markdown 渲染完成后 300ms，从 `document.querySelector("article")` 读取所有 `h1–h6` 的 `id` 和文本；
- `IntersectionObserver`（`rootMargin: "-90px 0% -70% 0%"`）跟踪当前可见标题；
- 点击平滑滚动并 `history.pushState` 更新 hash；
- 一级标题加粗、二级/三级缩进。

---

## 9. 管理后台

### 9.1 布局与导航

- `app/[lang]/admin/layout.tsx`：
  - `requireAuthorSession(lang)`；
  - `SidebarProvider` + `AppSidebar`（根据角色生成菜单）+ `AdminHeader` + `SiteFooter`。
- `AppSidebar`：
  - ROOT：总览、文章、评论、日志、分类、贡献者、MCP Keys、查看 Wiki；
  - AUTHOR：文章、MCP Keys、查看 Wiki；
  - 菜单激活判断同时考虑 pathname 与 query（例如 `?status=DRAFT`）。
- `AdminHeader`：从 URL 段生成面包屑，常见段有中文/英文本地化标签。

### 9.2 管理总览 `/admin`（仅 ROOT）

`getAdminDashboardData()`（`lib/admin.ts`）并行查询：

- 全部文章（带作者、评论数）；
- 评论按状态 `groupBy`；
- 最新 5 条 PENDING 评论；
- 用户总数 / ROOT 数 / AUTHOR 数 / 已验证数。

在 JS 中聚合：

- 文章总数、已发布/草稿；
- 评论 PENDING/APPROVED/REJECTED；
- 栏目（一级路径）与标签统计；
- 最近文章 6 条、待审评论 5 条、栏目 6 个、标签 8 个。

页面展示统计卡、快捷入口、最近更新表、待审评论、内容结构。

### 9.3 文章库 `/admin/articles`

- 查询参数：`q`、`status`、`tag`、`section`、`page`；
- 每页 10 条；
- `listAdminArticles()`：
  - `q` 同时模糊匹配 title/path/description，以及标签精确匹配；
  - `tag` 用 `tags has`；
  - `section` 匹配自身或前缀；
  - 返回文章、总数、总页数；
- 统计卡来自 `listAdminTaxonomy()`（全量文章聚合）；
- 表格操作：
  - 编辑；
  - 已发布文章可打开线上页面；
  - 发布/转草稿按钮绑定 `setArticleStatusAction`；
- 分页组件最多显示 7 个位置，超出用省略号。

### 9.4 文章编辑器（`components/article-editor.tsx`）

这是项目最复杂的客户端组件。

**元数据表单**

- 使用 `useActionState(action, initialState)`；
- 标题、路径、状态、标签、编辑器类型、描述、Markdown 都通过隐藏 `<input>` 随表单提交；
- 成功后若返回以 `/` 开头的路径 → `router.push()` + `router.refresh()`；若是普通提示（如“已保存”）则留在页面。

**编辑器状态**

- `mode`: `edit | preview | split`（桌面默认 split，移动端可切换）；
- Monaco 语言根据 `editorName` 在 `markdown` / `html` 间切换；
- 主题跟随 `next-themes` 的 `resolvedTheme`；
- Monaco 选项：自动换行、无 minimap、行号、自动布局、字号 14、滚动条 8px。

**滚动同步**

- 编辑器 → 预览：根据 Monaco 可见行号，找预览中 `data-line` 最近的元素，按行号比例插值计算滚动位置；
- 预览 → 编辑器：根据预览中可见的 `data-line` 元素，反推目标行号；
- 用 `isSyncingRef` + 双 `requestAnimationFrame` 防止双向同步互相触发。

**工具栏**

- Markdown 模式：标题、粗体/斜体、引用、分隔线、列表、代码块、表格、链接；
- HTML 模式：H1/H2/H3/P/Text/Flex/Grid/Card/Button 片段；
- 插入逻辑基于 Monaco selection，自动补前后换行并把光标移到插入内容末尾；
- 图片按钮与粘贴：
  - 选择文件或粘贴剪贴板图片；
  - `POST /api/uploads/images`（multipart）；
  - Markdown 模式插入 `![alt](url)`；HTML 模式插入 `<img src alt />`；
  - 错误码映射为本地化文案（类型不支持、过大、未配置、无权限等）。

**文章设置抽屉**

- 标题、状态（DRAFT/PUBLISHED）、路径、标签（逗号分隔）、编辑器（markdown/html）、摘要（即 `description`，280 字，默认人工填写）；
- 路径选择器 `PathPicker`：
  - 打开时调用 `listArticlePathsAction(locale)`（要求作者权限，返回**所有**文章路径，含草稿）；
  - 构建树、支持搜索过滤；
  - 选择父级后保留当前 slug：`父路径/当前slug`。

**预览**

- Markdown：标题 + 摘要 + 标签 + `MarkdownRenderer`；
- HTML：`<iframe srcDoc>`，注入 Tailwind CDN 与 Inter 字体，`sandbox="allow-scripts"`；
- 编辑器底部显示提示与字符数。

**摘要与 AI 生成**

- `Article.description` 是摘要的唯一存储字段，默认完全人工填写。
- 配置了 `OPENAI_API_KEY` 时，设置抽屉的摘要区域显示“AI 生成摘要 / 重新生成”按钮；未配置时按钮不渲染，手动摘要不受影响。
- 点击按钮 → `generateArticleSummaryAction(locale, { title, markdown })`：
  - `requireAuthorSession` 鉴权；
  - Zod 校验（title <= 300，markdown <= 24,000 字符）；
  - `isOpenAiConfigured()` 检查；
  - Upstash 限流：每用户 10 次/小时；开发环境无 Upstash 时 fail-open，生产 fail-closed；
  - `lib/articles/summary.ts`：移除 `<script>/<style>`，用 `extractMarkdownPlainText()` 清洗 Markdown/HTML，截断到 12,000 字，构建 prompt；
  - `lib/openai/chat.ts`：调用 `/chat/completions`（`OPENAI_RESPONSES_MODEL`、temperature 0.2、max_tokens 600、30s 超时）；
  - 规范化输出：去前缀/引号/代码围栏/残留 Markdown，超长按句末截断，最终 <= 280 字；
  - 返回 `{ summary }` 或本地化 `{ error, code }`；**不写数据库、不 revalidate、不写 operation log**。
- UI 行为：
  - 生成中显示 loading；
  - 已有摘要时先显示内联覆盖确认；
  - 生成成功后回填 `description` 状态并显示“AI 生成 · 建议校对”徽标；
  - 手动修改摘要会清除徽标；
  - 错误只显示本地化文案，原摘要保留。
- 摘要仍通过原有“保存更改”提交；`createArticleAction` / `updateArticleAction` 负责持久化。
- 来源标记不持久化：刷新页面后徽标消失；方案 A 没有 `summarySource` / `generatedAt` 字段。

### 9.5 创建/更新文章的 Server Action

`app/actions/admin.ts`

**校验（Zod）**

- `title`：trim 后非空；
- `description`（摘要）：trim，最多 280；
- `tags`：数组，每项非空，最多 12；
- `editor`：最多 40；
- `status`：`DRAFT | PUBLISHED`；
- `path`：先走 `canonicalizePath()`，可能抛错；
- 空字符串描述/编辑器 → `null`；
- 标签输入按换行、英文逗号、中文逗号分割，trim、去重。

> AI 摘要生成走独立的 `app/actions/summary.ts`，不写数据库；摘要在用户点击“保存更改”后由下面的 create/update action 持久化。

**创建**

- `authorId = session.user.id`；
- `publishedAt`：PUBLISHED 时为当前时间，DRAFT 为 `null`；
- 投递嵌入同步队列（`articleId + updatedAt`）；
- 写 `CREATE_ARTICLE` 日志（标题、路径、状态）；
- 失效缓存 + revalidate；
- 返回 `/{locale}/admin/articles/{id}` 供客户端跳转。

**更新**

- 先查存在；
- `publishedAt`：
  - PUBLISHED：保留原 `publishedAt`，没有则当前时间；
  - DRAFT：置 `null`；
- 投递队列、写 `UPDATE_ARTICLE` 日志（路径变化时记录 `oldPath`）；
- 新旧路径都要失效缓存与 revalidate。

**状态切换**

- `setArticleStatusAction`：发布时保留/设置 `publishedAt`，转草稿时清空；
- 投递队列、写 `SET_ARTICLE_STATUS` 日志；
- 失效缓存。

**缓存失效**

- `invalidateArticleCache(path, id)`：
  - `updateTag(ARTICLES_CACHE_TAG)`；
  - `updateTag(article:{path})`；
  - `updateTag(article-comments:{id})`；
- `revalidateWikiPaths(path)`：
  - `revalidateLocalizedPath("/wiki")`（zh/en 两个）；
  - 对每个 locale `revalidatePath(buildWikiHref(path, locale))`；
- 管理端相关路径（文章、总览、分类、用户）也做双语 revalidate。

### 9.6 用户与角色 `/admin/users`（仅 ROOT）

- `listAdminUsers()` 查询用户及文章/评论/审核数，按文章数、评论数、创建时间排序；
- 每个用户可执行“设为普通用户 / 作者 / 管理员”（取决于当前角色）；
- 最后一个 ROOT 的降级按钮禁用，服务端 `canChangeUserRole` 再次拦截；
- 写 `SET_USER_ROLE` 日志。

### 9.7 评论审核 `/admin/comments`（仅 ROOT）

- 可按 `status=PENDING|APPROVED|REJECTED` 过滤；
- 展示作者姓名/邮箱/时间、正文、文章链接、状态、审核人；
- “通过” → `approveCommentAction`：状态 APPROVED、记录审核人/时间、失效该文章评论缓存、写日志、revalidate；
- “拒绝” → `rejectCommentAction`：状态 REJECTED，其余同上。

### 9.8 操作日志 `/admin/logs`（仅 ROOT）

- 可按 `action` 与 `userId` 过滤，每页 20 条；
- `LogRow` 把 `detail` 的 JSON 转成可读片段（标题、路径、状态、角色变化等）；
- 动作颜色：创建/通过为默认，更新类为 secondary，拒绝为 destructive。

### 9.9 分类结构 `/admin/taxonomy`（仅 ROOT）

- `listAdminTaxonomy()` 从全部文章（含草稿）聚合；
- 栏目：总数、已发布、草稿、评论数、最近更新时间、3 个示例标题；
- 标签：同上；
- 提供跳转到带筛选的文章列表；
- **不直接编辑分类/标签**，它们由文章路径和 `tags` 派生。

### 9.10 MCP Keys `/admin/mcp-keys`

见 [第 14 节](#14-mcp-服务)。

---

## 10. 评论系统

### 10.1 提交

`app/actions/comments.ts` 的 `createCommentAction(locale, articleId, currentPath, prevState, formData)`：

1. `requireVerifiedSession(locale, currentPath)`：必须登录且邮箱已验证，否则跳验证页；
2. Zod：正文 trim 后 1–5000 字；
3. `prisma.comment.create`，状态默认 `PENDING`；
4. `revalidatePath(currentPath)`；
5. 返回“评论已提交审核”。

### 10.2 公开展示

`components/wiki-comments.tsx`（Server Component + Suspense）：

- `listPublishedArticleComments(articleId, page)` 只查 `APPROVED`；
- 每页 20，页码越界会被夹到有效范围；
- 评论按创建时间升序；
- 分页链接：`?commentsPage=N`；
- 评论者只显示姓名首字母头像、姓名、日期、正文（保留换行）。

评论输入区：

- `canComment(session.user)`（登录 + 邮箱验证）→ 显示 `CommentForm`；
- 未登录 → 显示登录按钮，`next` 指回当前文章；
- 已登录未验证 → 提示先去验证邮箱。

### 10.3 审核与缓存

- 审核只允许 ROOT；
- 通过/拒绝都会 `updateTag(articleCommentsCacheTag(article.id))`，让该文章评论缓存立即失效；
- 同时 revalidate 管理端页面与文章路径。

---

## 11. Markdown / HTML 渲染管线

### 11.1 `MarkdownRenderer` 的插件顺序

`components/markdown-renderer.tsx` 使用 `react-markdown`，并设置 `skipHtml`（原始 HTML 不直接渲染）。

**remark 阶段（Markdown → AST）**

| 顺序 | 插件 | 作用 |
|---|---|---|
| 1 | `remarkSafeCustomSyntax` | 调用 `@luckyfishes/markdown-core` 的自定义语法插件，解析 `::Component` / YAML props；异常被捕获，页面不崩 |
| 2 | `remarkAlert` | 把 `> [!NOTE/TIP/WARNING/IMPORTANT/CAUTION]` 转成 `mdx-alert` |
| 3 | `remarkFixTabsLabels` | 手动解析 `::tabs` 块里的 `tabs: [...]`，补回 TabsTrigger 的显示文字 |
| 4 | `remarkGfm` | 表格、任务列表、删除线等；`singleTilde: false` |
| 5 | `remarkMath` | `$...$` / `$$...$$` |
| 6 | `remarkSuperSub` | 上标 / 下标 |

**rehype 阶段（AST → HTML）**

| 顺序 | 插件 | 作用 |
|---|---|---|
| 1 | `rehypeExtractMermaid` | 把 ```mermaid 代码块替换为 `mdx-mermaid` 节点，属性 `chart` |
| 2 | `rehypeExtractPlantUML` | ```plantuml → `mdx-plantuml`（`code`） |
| 3 | `rehypeExtractInfographic` | ```infographic → `mdx-infographic`（`syntax`） |
| 4 | `createCodeFenceComponentPlugin` | markdown-core 的代码块组件标记 |
| 5 | `rehypeFootnotesHeading` | 脚注标题处理 |
| 6 | `rehypeMdxJsxElements` | 把 MDX JSX 节点转成安全的自定义标签（`mdx-badge`、`mdx-tabs`、`mdx-component-block` 等） |
| 7 | `rehypeSlug` | 为标题生成 `id` |
| 8 | `rehypeAutolinkHeadings` | 标题后追加锚点链接（`class="anchor"`） |
| 9 | `rehypeRuby` | 文本中的 `[汉字]{ruby}` → `<ruby><rt>` |
| 10 | `rehypeSanitize` | 按扩展 schema 清洗 |
| 11 | `rehypeNormalizeAnchors` | 修复重复的 `user-content-user-content-` 前缀；修正标题内锚点 href |
| 12 | `rehypeHighlight` | 代码高亮（hljs） |
| 13 | `rehypeKatex` | 数学公式渲染 |
| 14 | `rehypeAddSourceLine` | 给每个元素加 `data-line`，用于编辑器滚动同步 |

**安全 schema**

`components/markdown-renderer.tsx` 在 `defaultSchema` 上扩展：

- 允许自定义标签：`mdx-badge`、`mdx-tip`、`mdx-tabs*`、`mdx-component-*`、`mdx-mermaid`、`mdx-plantuml`、`mdx-infographic`、`mdx-alert`；
- 允许 `details/summary/input/ruby/rt/rp`；
- 允许标题 `id`、代码/容器 `className`、任务列表 `input` 属性等；
- 由于 `skipHtml` + sanitize，文章中的 `<script>` 不会执行。

### 11.2 自定义语法与组件

| 语法 / 标签 | 渲染组件 | 说明 |
|---|---|---|
| `::Badge` / `mdx-badge` | `MarkdownBadge` | 药丸标签，`shape: outline` 可选 |
| `::Tip` / `mdx-tip` | `MarkdownTip` | 支持 `copy` 点击复制 |
| `::tabs` / `Tabs*` | shadcn Tabs | 每个 `---` 分隔一个面板 |
| `::Icon` | `Icon`（Iconify） | 例如 `ph:rocket-launch-duotone` |
| `::Card` | `CustomCard` | shadcn Card |
| `::timeline` | `Timeline` | 日期/标题/徽标/描述 |
| `::Chat` | `Chat` | `data: [{userName,messages,isMe}]` 对话气泡 |
| ```mermaid | `MarkdownMermaid` | 客户端 `mermaid.render()`，主题跟随深浅色 |
| ```plantuml | `MarkdownPlantUML` | 用 `plantuml-encoder` 生成 `plantuml.com/plantuml/svg/...` 图片 |
| ```infographic | `InfographicDiagram` | `@antv/infographic` 客户端渲染 |
| `> [!TYPE]` | `MarkdownAlert` | Note/Tip/Warning/Important/Caution 五种样式 |

未知的 `::Component` 会降级成带 `data-mdx-name` / `data-mdx-props` 的占位块，并尽量展示 props/内容，不会报错。

### 11.3 图片画廊

`MarkdownImageGalleryProvider`：

- 从原始 Markdown 用正则提取所有图片（src/alt/title/index）；
- 每个 `img` 通过 `src` 出现次数匹配到对应索引；
- 点击图片打开全屏 Dialog：
  - 左右切换（按钮 + 方向键）；
  - 缩放 50%–300%，步进 25%；
  - 显示页码、标题/alt；
  - 关闭时重置缩放。

### 11.4 代码块

`CodeBlock` 替换默认 `pre`：

- 顶部显示语言名与复制按钮；
- 内容高度超过约 320px 时折叠，底部渐隐 + “Show more/less”；
- 复制使用 `pre.innerText`。

### 11.5 Mermaid 规范化

`normalizeMermaidChart()` 专门处理 sequenceDiagram 中跨多行的 `Note`：

- 把 Note 后续不属于 Mermaid 语句的行用 `<br/>` 连接；
- 避免 Mermaid 11 解析失败。

### 11.6 HTML 文章

- 阅读页：`WikiHtmlRenderer` 直接 `dangerouslySetInnerHTML`，没有 sanitize（作者/管理员可信输入为前提）。
- 编辑器预览：`HtmlPreview` 用 `<iframe sandbox="allow-scripts" srcDoc>`，注入 Tailwind CDN 和 Inter 字体。
- **注意**：发布页没有加载 Tailwind CDN；如果 HTML 文章依赖 Tailwind 类，生产页面可能没有对应样式（构建时只扫描源码，不扫描数据库内容）。见“已知限制”。

---

## 12. 搜索系统

### 12.1 入口

- 前端：`Ctrl/Cmd + K` 打开 `WikiSearchDialog`（由 `SearchProvider` 全局监听）。
- 对话框：
  - 输入 300ms 防抖；
  - 调 Server Action `searchArticlesAction(query)`；
  - 默认每页 5 条，只展示结果，不展示分页；
  - 选择后 `router.push(buildWikiHref(path, locale))`。
- 公开 API：`GET /api/search?q=&page=&pageSize=`，返回 `{ data: SearchResults }`。
- 限流：搜索 Action 与 API 都按客户端 IP 做 **30 次/分钟** 的分布式滑动窗口。
  - 未配置 Upstash 时抛 `RateLimitConfigurationError`；API 返回 503，Action 抛错。

### 12.2 查询约束

- 查询 trim；
- 最大长度 128；
- 页码 ≥ 1；
- 每页 1–20（API 与函数内部都会夹紧）；
- 空查询返回空结果；
- 只搜索 PUBLISHED。

### 12.3 三级检索策略（`lib/search.ts`）

```text
isPgSearchAvailable?
  ├─ 是 → searchWithParadeDb()（BM25）
  │        失败 → 降级
  └─ 否 → isPgTrgmAvailable?
            ├─ 是 → searchWithPgTrgm()（ILIKE + similarity）
            └─ 否 → searchWithFallback()（Prisma contains + 应用层打分）
```

**ParadeDB BM25**

```sql
WHERE a.status = 'PUBLISHED'
  AND (a.title @@@ query OR a.description @@@ query OR a.markdown @@@ query)
ORDER BY paradedb.score(a.id) DESC, a.updated_at DESC
```

**pg_trgm**

```sql
WHERE a.status = 'PUBLISHED'
  AND (title ILIKE %q% OR description ILIKE %q% OR markdown ILIKE %q% OR q = ANY(tags))
ORDER BY GREATEST(similarity(title,q), similarity(description,q), similarity(markdown,q)) DESC
```

**应用层兜底**

- Prisma `contains`（大小写不敏感）匹配 title/description/markdown/tags；
- 取当页数据后在 JS 打分：
  - title 命中 +100，并按标题长度给最多 10 分奖励；
  - 标签精确命中 +90；
  - 描述命中 +70；
  - 正文命中 +50（当前实现上限恒为 50，出现次数不影响分数）；
- 按分数降序。

### 12.4 摘要与命中字段

`generateExcerpt(markdown, query)`：

- 先 `extractMarkdownPlainText()` 去掉 Markdown 语法；
- 找到查询位置，取前后约 150 字符窗口；
- 向两侧扩展到空白/中英文标点边界；
- 非开头加 `...`，非结尾加 `...`；
- 找不到时返回前 150 字符。

`getMatchField()` 依次判断 title → description → markdown → 否则 tags。

### 12.5 备注

- 可用性探测（`pg_search` / `pg_trgm`）用 React `cache()` 在单次请求内只查一次。
- 搜索结果不经过 Next 持久缓存。
- `Article.description` 现在是文章摘要字段（人工或可选 AI 生成）：它参与 BM25 / pg_trgm / 兜底打分和 `matchField`；搜索结果的 `excerpt` 仍从 Markdown 正文生成。

---

## 13. AI Agent（RAG 问答）

### 13.1 组成

```text
前端 components/wiki-agent.tsx
   │ POST /api/agent（JSON）
   ▼
app/api/agent/route.ts → lib/agent/route.ts
   │ 1. Zod 校验后立即建立 SSE（status: retrieving）
   │ 2. retrieveRelevantAgentChunks（BM25 先行，嵌入可回退）
   │ 3. SSE 发 sources + status: answering
   ▼
lib/agent/openai.ts → LangGraph 图（lib/agent/graph.ts）
   │ answerNode：强上下文 → 直接流式回答（无工具）；否则 ReAct 工具 Agent
   ▼
工具（lib/agent/tools.ts）
   ├─ 语义/词法混合检索（lib/agent/search.ts）
   ├─ 精确路径查文章
   ├─ 路径/标题/标签搜索
   ├─ 最近更新
   ├─ 相关文章
   └─ 分类统计
```

### 13.2 配置

| 变量 | 默认 | 说明 |
|---|---|---|
| `OPENAI_API_KEY` | 空 | 未设置时 Agent/嵌入/摘要不可用 |
| `OPENAI_RESPONSES_MODEL` | `gpt-4.1-mini` | 聊天模型 |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | 嵌入模型 |
| `OPENAI_API_BASE_URL` | `https://api.openai.com/v1` | 兼容网关；根 URL 会自动补 `/v1` |
| `AGENT_EMBEDDING_DIMENSIONS` | `1024` | 数据库向量维度，必须与列一致 |
| `OPENAI_EMBEDDING_DIMENSIONS` | 空 | 仅当 provider 支持 `dimensions` 字段时设置；必须等于 `AGENT_EMBEDDING_DIMENSIONS` |
| `OPENAI_EMBEDDING_TIMEOUT_MS` | 60000 | 单次嵌入请求超时 |
| `AGENT_RETRIEVAL_TIMEOUT_MS` | 3500 | 聊天检索的嵌入预算；超时后回退 BM25 |
| `AGENT_MODEL_TIMEOUT_MS` | 45000 | 单次 Agent 模型流的总超时 |
| `AGENT_REINDEX_CONCURRENCY` | 4（上限 8） | `agent:index` 并行数 |

`ChatOpenAI` 配置：

- `temperature: 0.2`；
- `streamUsage: false`；
- `useResponsesApi: false`（规避 `@langchain/openai 1.4.5` 的流式尾部解析问题）；
- `baseURL` 来自规范化后的网关地址。

> 同一组 `OPENAI_API_KEY` / `OPENAI_RESPONSES_MODEL` / `OPENAI_API_BASE_URL` 也用于文章摘要（`lib/openai/chat.ts`）。摘要走普通 `/chat/completions`，不使用 Agent 图或工具；摘要不参与分块/嵌入。

### 13.3 分块（`lib/agent/chunks.ts`）

1. 按 ATX 标题（`#`–`######`）切分章节；
2. 每个章节先转纯文本；
3. 段落（连续空行分隔）合并，直到接近 900 字符；
4. 超长文本：
   - 先按中英文句末标点切句；
   - 仍超长则按固定长度硬切；
5. 每个 chunk 记录 `heading`、`content`、`chunkIndex`；
6. 如果完全切不出内容，用整篇纯文本兜底。

**嵌入输入**包含上下文，不只是正文：

```text
{title}
{path}
{heading}
{content}
```

### 13.4 嵌入同步

**触发点**

- 创建文章、更新文章、发布/转草稿（`app/actions/admin.ts`）；
- 导入脚本 `scripts/import-articles.ts`（导入后全量重索引）；
- 手动 `npm run agent:index`。

**队列**

```ts
send("article-embedding-sync", { articleId, updatedAt }, {
  idempotencyKey: `${articleId}:${updatedAt}`,
  retentionSeconds: 86400,
})
```

`vercel.json` 注册队列触发器（`queue/v2beta`，topic `article-embedding-sync`，`retryAfterSeconds: 30`）。

**消费者** `app/api/queue/article-embedding-sync/route.ts`：

- `maxDuration = 300`；
- Zod 校验消息；
- 查询文章当前 `updatedAt`，与消息不一致则丢弃（防止旧任务覆盖新内容）；
- 调 `syncArticleEmbeddingsForArticleId()`；
- 失败重试：`min(300, 2^deliveryCount * 5)` 秒；第 5 次后 acknowledge（丢弃）。

**同步逻辑** `lib/agent/index-core.ts`：

- 非 PUBLISHED → 删除该文章所有 chunk；
- 无 chunk → 删除；
- 未配置 `OPENAI_API_KEY` → 跳过（返回 `skipped: true`）；
- 调 `embedTexts()`；
- 校验返回向量数量与 chunk 数一致；
- 校验每个向量维度等于 `AGENT_EMBEDDING_DIMENSIONS`；
- 在事务中先 `deleteMany` 再逐条 `INSERT ... embedding::vector`。

**事务重试**：

- `maxWait` / `timeout` 可通过 `PRISMA_TRANSACTION_MAX_WAIT_MS` / `PRISMA_TRANSACTION_TIMEOUT_MS` 调整（默认 15s / 60s）；
- 最多 3 次；
- 仅对“无法开始事务 / 超时 / 连接关闭”重试；
- 连接关闭时先 disconnect/connect。

**全量重索引**：

- `reindexAllPublishedArticleEmbeddings()` 用 worker 池并发处理已发布文章；
- 默认并发 4，环境变量上限 8；
- 每 10 篇或结束时输出进度。

### 13.5 混合检索（`lib/agent/search.ts`）

```text
retrieveRelevantAgentChunks(query)
  ├─ 并行启动 BM25 与查询嵌入
  ├─ BM25 top score ≥ 20 → 直接采用 BM25，取消嵌入请求（低延迟快路径）
  ├─ 否则等待嵌入（≤ AGENT_RETRIEVAL_TIMEOUT_MS）
  ├─ ANN top 24
  │    ├─ top ≥ 0.7 → 只使用 ANN
  │    └─ 否则融合 BM25（仅注入 bm25Score ≥ 15 的 lexical-only 命中）
  │         融合分数 = semantic * 0.75 + (1/lexicalRank) * 0.25
  │         BM25-only 命中：0.6 - rank * 0.02（下限 0.45）
  ├─ ANN 不可用 → 有 BM25 则用 BM25，否则全量 cosine 兜底
  └─ limitRetrievedChunks
       ├─ 默认丢弃 score < 0.35（若没有任何语义相关结果则允许低分）
       ├─ 每篇文章最多 2 个 chunk
       └─ 最多 6 个 chunk
```

细节：

- 自然语言问题先经 `buildLexicalQuery()` 提取关键词：去掉疑问词，把相邻单字合并成词（`校园` + `卡` → `校园卡`），再拼成 BM25 查询；
- BM25 SQL 使用 `content @@@ query OR heading @@@ query` + `paradedb.score`，正文与文章信息在同一个查询里返回；
- ANN SQL 使用 `1 - (embedding <=> query::vector)` 作为余弦相似度，并设置 2s 超时；
- 查询嵌入缓存 5 分钟（最多 128 条），检索结果缓存 60 秒（最多 64 条）；
- 同一实例内共享缓存，避免重复问题和连续追问重复走嵌入/检索。

**建议来源兜底**：

`findSuggestedAgentSources(query)` 用 `title/path contains` 查 3 篇已发布文章，在语义检索为空或不可用时作为来源。

### 13.6 Agent 请求与 SSE 协议

`app/api/agent/route.ts` → `lib/agent/route.ts`：

**请求体**

```json
{
  "locale": "zh",
  "messages": [
    { "role": "user", "content": "校园卡怎么补办？" }
  ]
}
```

- 最多 12 条；
- 每条 1–4000 字符；
- 会过滤空内容消息；
- 最后一条必须是 `user`。

**处理**

1. 取字典用于错误文案；
2. 先建立 `ReadableStream` 并立即发送 `status: retrieving`，避免检索期间响应头被代理挂住；
3. 尝试检索（失败只记录日志）；
4. 有 chunk → 用 chunk 去重后的文章作为 `sources`；
5. 没有 chunk → 用 `findSuggestedSources()`；
6. 发送 `sources` 与 `status: answering`，再开始流式回答：

| 事件 | 数据 | 含义 |
|---|---|---|
| `status` | `{ stage: "retrieving" \| "answering" }` | 当前阶段，驱动前端等待文案 |
| `sources` | `{ sources: [{path,title}] }` | 先告诉前端来源 |
| `delta` | `{ text }` | 模型增量文本 |
| `tool` | `{ name,label,summary }` | 工具调用（前端目前隐藏展示） |
| `done` | `{}` | 完成 |
| `error` | `{ message }` | 本地化错误 |

响应头：`Content-Type: text/event-stream; charset=utf-8`、`Cache-Control: no-store`、`Connection: keep-alive`。

> `/api/agent` **没有鉴权和限流**，任何能访问站点的人都可以调用（见“已知限制”）。

### 13.7 LangGraph 控制流

`lib/agent/graph.ts` 定义状态：

```text
locale, messages, context, query, answer, toolCalls, attempt, signal
```

流程：

```text
START
  → prepareNode（取最后一条 user 消息作为 query）
  → answerNode
       ├─ attempt === 0
       │    且 top score ≥ 0.45
       │    且不是“最近更新 / 列出 / 分类 / 目录 / 哪几篇”等列表意图
       │    → createDirectAnswer：不绑定工具，直接流式回答
       └─ 否则 → createAgent：ReAct 工具流
       ├─ 收集 tool_call 事件 → onToolCall
       └─ 收集文本 delta → onDelta，累加 answer
  → routeAfterAnswer
       ├─ answer 为空且 attempt === 0 → recoverNode
       │     → retrieveRelevantChunks(最近 3 条 user 消息拼接)
       │     → attempt+1 → 回到 answerNode（重试时走工具 Agent）
       └─ 否则 → finishNode
  → finishNode
       ├─ 有 answer：保留
       └─ 无 answer：输出本地化兜底文案（并作为 delta 发送）
  → END
```

设计意图：

- 大多数内容问题已经由路由层检索到足够上下文，直接一次模型调用即可回答，避免 ReAct 多次工具往返；
- 列表/导航类问题需要枚举文章，仍交给工具 Agent；
- LangGraph 继续负责“检索失败重试一次 + 空答案兜底”的确定性控制流。

**直接运行路径**：`streamAgentAnswer()` 在没有 `createGraph` 的自定义 runtime 下，会直接 `agent.stream()` 并解析文本/工具事件（测试用）。

### 13.8 工具列表

| 工具 | 参数 | 返回 |
|---|---|---|
| `search_wiki_knowledge` | `query` | 语义 chunk + 来源；失败时退回建议来源，`mode=semantic/suggestions` |
| `get_wiki_article_details` | `path` | 文章元数据 + 前 4 个 chunk |
| `search_wiki_paths` | `query`, `limit(1-10)` | 按 path/title/description/tag 模糊匹配 |
| `list_recent_wiki_articles` | `limit(1-10)` | 最近更新已发布文章 |
| `get_related_wiki_articles` | `path`, `limit(1-10)` | 标签/一级栏目相关 + 标题搜索 + 语义建议，去重 |
| `list_wiki_categories` | `limit(1-20)` | 一级路径分类、文章数、3 个示例 |

所有工具只读，只查 PUBLISHED。

> 工具返回的 `description` 可能是人工摘要或 AI 生成的摘要；摘要不参与 chunk/embedding，`agent_chunks` 仍从 Markdown 正文构建。

### 13.9 系统提示

中文/英文两套，分工具 Agent 与直接回答两条：

- 只能依据已发布 Wiki 和只读工具；
- 不得编造或用站外常识补全；
- 工具 Agent：已附带的上下文足够时直接回答，避免重复搜索；上下文不足再用工具；仍不足就明确说明；
- 直接回答：只根据已检索上下文回答，不调用工具；不足时明确说明；
- 回答简洁、自然；
- 尽量提文章标题或路径；
- **不要输出思考过程、检索过程或工具调用说明**；
- 附带本轮检索到的 chunk 文本（标题、路径、heading、内容）。

### 13.10 前端行为

`components/wiki-agent.tsx`：

- 未开始时的空状态：标题、说明、3 个推荐问题；
- 消息存在时：可滚动列表、气泡样式、Markdown 渲染回答、来源链接；
- 输入框：Enter 发送，Shift+Enter 换行；加载中显示停止按钮（AbortController）；
- SSE 解析：按 `\n\n` 分帧，读取 `event:` 与 `data:`；支持 `status/sources/delta/message/tool/error/done`；
- `status` 事件驱动等待文案（检索 Wiki / 生成回答）；
- 流式期间按 60ms 批量合并 delta，并以纯文本显示；结束后一次性渲染完整 Markdown，避免每个 token 都重跑 KaTeX/highlight 等 15 个 rehype 插件；
- 消息行使用 `memo`，历史消息不会随当前回答的 token 重渲染；
- 会话按 locale 存在 `sessionStorage`（`luckywiki-agent:{locale}`），写入做 400ms 防抖，避免每个 token 同步序列化整段会话；
- 自动滚动到底部使用 rAF + 直接设置 `scrollTop`，用户上滚超过 120px 时暂停自动滚动；
- 错误时保留已生成内容，仅在内容为空时显示错误；
- 重置会清空消息与存储，并中止进行中的请求。

---

## 14. MCP 服务

### 14.1 目标与协议

MCP（Model Context Protocol）用于让外部 AI 平台（如 LobeHub）查询 Wiki：

- 传输：**MCP over SSE**（JSON-RPC 2.0）+ 兼容“直接 POST 返回 JSON”；
- 协议版本：`2024-11-05`；
- 服务信息：`luckywiki-mcp` 1.0.0；
- 能力：仅 `tools.listChanged = false`；
- 端点：`/api/mcp`。

### 14.2 鉴权

`lib/mcp/auth.ts`：

1. 从 `Authorization: Bearer <token>` 取 token；
2. **优先**查数据库用户级 Key：
   - 必须以 `lkw_` 开头；
   - 计算 SHA-256，查 `mcp_api_keys.keyHash`；
   - 已撤销（`revokedAt`）拒绝；
   - 再做一次恒定时间比较；
   - 返回 `keyId/userId/userRole/rateLimit`。
3. 否则尝试环境变量全局 Key `MCP_SERVER_API_KEY`：
   - 对两边都 SHA-256 后 `timingSafeEqual`；
   - 返回 `type: "global-key"`，限流取 `MCP_RATE_LIMIT`。

Key 格式：

```text
lkw_<64 位十六进制随机数>    // 32 字节随机
prefix = 前 10 个字符
数据库只存 SHA-256，不存明文
```

### 14.3 限流

`lib/mcp/rate-limit.ts` 复用 `lib/rate-limit.ts`：

- Upstash Redis 滑动窗口；
- 身份 key：用户级 Key 用 `key:{keyId}`，全局 Key 用 `global`；
- 默认窗口 1 小时；
- 每 Key 的 `rateLimit` 可单独配置，`null` 表示不限制；
- 未配置 Upstash 时抛 `RateLimitConfigurationError`，路由返回 503。

### 14.4 协议实现

`lib/mcp/server.ts`：

支持方法：

| 方法 | 行为 |
|---|---|
| `initialize` | 校验 `protocolVersion`，返回协议版本、capabilities、serverInfo；随后异步发 `notifications/initialized` |
| `tools/list` | 返回 6 个工具的 name/description/inputSchema |
| `tools/call` | 校验工具名，调用 `callTool()`，返回 `content: [{type:"text", text: JSON}]`，并附 `_raw` |
| `ping` | 返回 `{}` |
| 其他 | JSON-RPC `-32601 Method not found` |

错误处理：

- Zod 校验错误 → `-32602 Invalid params` + issues；
- 自定义 `McpError` → 对应 code；
- 普通 Error → `-32603 Internal error`（只带 message，不暴露堆栈）；
- 通知（无 id）出错不回复；
- 批量请求按顺序逐个处理。

JSON-RPC 入口校验：必须 `jsonrpc === "2.0"`、`method` 为字符串、`id` 为 string/number/null/undefined。

### 14.5 SSE 模式（`app/api/mcp/route.ts`）

**GET**：

1. 校验 Bearer；
2. 限流；
3. 创建 `sessionId = crypto.randomUUID()`；
4. 建立 SSE：
   - 立即发送 `endpoint` 事件：`{ url: "/api/mcp?sessionId=..." }`；
   - 如果请求带 `Last-Event-ID`，发送 `notifications/reconnected`（但**不重放丢失消息**）；
   - 每 30 秒发 `: ping` 心跳；
   - 断开时清理 `sseSessions`。
5. 会话保存在**进程内 Map**（单实例有效）。

**POST**：

1. 校验 Bearer + 限流；
2. 解析 JSON-RPC（支持数组批量）；
3. 若 query 带 `sessionId` 且会话存在：
   - 响应通过 SSE `message` 事件发送；
   - POST 返回 `202 Accepted`；
4. 否则：
   - 响应直接放在 POST body；
   - 批量请求返回数组，单请求返回对象；
5. 用户级 Key 会：
   - `incrementKeyUsage()`（异步，`lastUsedAt` + `totalCalls`）；
   - `logMcpCall()` 记录方法、工具、状态、耗时、IP。

### 14.6 只读工具

| 工具 | 参数 | 说明 |
|---|---|---|
| `search_wiki` | `query`(1-200), `page`, `pageSize(1-20)` | 复用 `searchArticles()`，只返回 PUBLISHED |
| `get_article` | `path` | 完整 Markdown、作者、标签、评论数 |
| `list_wiki_tree` | 无 | 所有已发布文章 path/title/updatedAt |
| `list_recent_articles` | `limit(1-20)` | 最近更新 |
| `get_related_articles` | `path`, `limit(1-10)` | 标签/一级栏目匹配，去重 |
| `list_categories` | 无 | 一级路径分组统计 + 3 个示例 |

> `docs/MCP-INTEGRATION.md` 中把工具写成 `get_categories`，与代码 `list_categories` 不一致；文档还写了 pageSize 最大 50，代码是最大 20；限流错误码文档写 `-32002`，代码是 `-32000`。以代码为准。

> `search_wiki` / `get_article` 返回的 `description` 可能是人工或 AI 生成的摘要；MCP 不区分来源。

### 14.7 审计与管理

- `mcp_call_logs` 记录每次用户级 Key 调用；
- 管理页 `/admin/mcp-keys`：
  - 列出当前用户的 Key（不显示明文）；
  - 创建时可设名称和每小时限额（默认 200，可勾选不限制）；
  - 创建后**只显示一次完整 Key**；
  - 撤销为软删除（写 `revokedAt`）；
  - 展示总调用次数、最近使用时间、创建时间。
- API：
  - `GET /api/admin/mcp-keys`：当前用户 Key 列表；
  - `POST /api/admin/mcp-keys`：创建；
  - `DELETE /api/admin/mcp-keys/[id]`：撤销（只能撤销自己的）。

### 14.8 安全约束

- 只返回 PUBLISHED；
- 不暴露 Agent；
- 不暴露写操作；
- 错误不暴露堆栈；
- 调用审计；
- Key 只存 hash；
- 恒定时间比较；
- 每 Key 限流。

---

## 15. 图片托管与内容导入

### 15.1 图片上传

**接口**：`POST /api/uploads/images`（multipart）

1. `getCurrentSession()`；
2. `canWriteArticles()`（ROOT/AUTHOR），否则 401；
3. 取 `file` 字段，必须为 `File`；
4. `uploadImageFile()`：
   - 校验 MIME：APNG/AVIF/GIF/JPEG/PNG/SVG/WebP；
   - 校验大小：默认 5 MB（`IMAGE_UPLOAD_MAX_BYTES`）；
   - 选择 provider：
     - 有 `BLOB_READ_WRITE_TOKEN` → Vercel Blob；
     - 否则要求 `IMAGE_HOSTING_BUCKET/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY`；
   - 生成对象 key：

```text
{pathPrefix}/{YYYY}/{MM}/{sanitized-basename}-{uuid}.{ext}
```

   - Vercel Blob：`put(key, body, { access:"public", addRandomSuffix:false, cacheControlMaxAge:31536000, contentType })`；
   - S3：`PutObject`，`Cache-Control: public, max-age=31536000, immutable`；
   - 生成公开 URL：
     - 优先 `IMAGE_HOSTING_PUBLIC_URL_BASE`；
     - 否则 AWS 标准域名；
     - 或 `endpoint/bucket/key`。
5. 返回 `{ key, url, markdown }`；
6. 客户端把 Markdown/HTML 插入 Monaco 光标处。

**错误码**：`UNAUTHORIZED`、`MISSING_FILE`、`INVALID_FILE_TYPE`、`FILE_TOO_LARGE`、`UPLOAD_NOT_CONFIGURED`、`UPLOAD_FAILED`。

### 15.2 Markdown 文章导入

`lib/articles/import.ts` + `scripts/import-articles.ts`

**扫描**

- 递归收集 `.md`；
- 跳过以 `.` 开头的文件/目录；
- 按名称排序；
- 路径映射：`index.md` → 父目录；其他按相对路径去掉 `.md`；最后 `canonicalizePath()`。

**Frontmatter**（gray-matter）

支持字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | string | 覆盖正文 H1 |
| `description` | string | 摘要/描述（与编辑器 `Article.description` 同一字段） |
| `published` | boolean | 覆盖 CLI 的默认状态 |
| `date` | string/Date | 覆盖发布时间 |
| `tags` | string 或 string[] | 标签 |
| `editor` | string | `markdown` / `html` 等 |
| `dateCreated` | - | 仅允许出现，不参与导入 |

- 未知字段只警告，不失败；
- 类型错误（如 `published: yes`、非法日期）直接失败；
- 正文第一个 `# H1` 会被提取为标题并从正文移除；
- **导入会用 frontmatter 的 `description` 覆盖已有摘要**；如果希望保留编辑器里 AI 生成的摘要，请在 frontmatter 中保留对应内容或导入后重新生成。
- 没有 H1 时按路径最后一段生成人类可读标题（`next-16` → `Next 16`；根路径 → `Home`）。

**写入策略**

- 按 `path` 查现有文章；
- 不存在 → create；
- 存在且所有字段（title/description/editor/tags/markdown/status/publishedAt）一致 → skip；
- 否则 update；
- `--dry-run` 只打印不写入；
- 导入完成后 `scripts/import-articles.ts` 会执行全量嵌入重索引（`import-scraped.ts` 不会）。

CLI：

```bash
pnpm articles:import -- articles --author-email=root@example.com --status=published
pnpm articles:import -- articles --dry-run
```

**后台导入 / 导出**

- `POST /api/admin/articles/import`（multipart，`mode=preview|apply`）：
  - 仅接受 `.md`；单文件 ≤ 1 MB、单次 ≤ 50 个、总计 ≤ 4 MB；
  - 可选 `prefix` 路径前缀与默认状态（frontmatter 的 `published` 优先）；
  - `preview` 只解析并返回 create / update / unchanged / error 计划，不写库；
  - `apply` 重新解析文件、重新读取数据库状态后逐篇写入，避免使用过期预览；
  - 写库行为与 CLI 一致：按 `path` upsert、生成 revision 快照、同步媒体引用、写操作日志、入队嵌入同步；
  - 完成后立即失效 `articles` / `article:*` 缓存并 revalidate 对应 Wiki 路径。
- `GET /api/admin/articles/[id]/export`：按导入格式导出 `.md`（frontmatter + `# 标题` + 正文），文件名取路径末段（根路径为 `index.md`）。
- 后台入口：文章列表的「导入 Markdown」按钮，以及编辑器顶部的「导出 Markdown」按钮。

### 15.3 图片导入（先于文章导入）

`lib/articles/image-import.ts` + `scripts/import-article-images.ts`

1. 递归扫描 `.md`；
2. 用 unified/remark 解析，找出所有 `image` 节点；
3. 只处理本地图片（非 `http:`/`https:`/协议相对/`#`）；
4. 解析真实路径：
   - 以 `/` 开头 → 相对 `articles` 根目录；
   - 否则相对当前 Markdown 文件；
5. 用 `sharp` 转 WebP：`quality: 82`、`effort: 4`（保留动画）；
6. 检查压缩后是否超限；
7. 上传（复用 `uploadImageFile`），同一绝对路径在一个目录扫描中只上传一次（共享缓存）；
8. 按节点 position 偏移量替换原 Markdown，保留 alt/title；
9. `--dry-run` 只校验文件存在与可压缩，不上传、不写文件；
10. 单文件失败不影响其他文件，最终汇总 failed 并以非 0 退出。

推荐顺序：

```bash
pnpm articles:import-images -- articles
pnpm articles:import -- articles
```

### 15.4 Wiki.js 语法迁移

`lib/articles/markdown-migrate.ts` + `scripts/migrate-articles-markdown.ts`

支持 `.md` 与 `.html`（HTML 会生成同名 `.md` 并删除原 HTML）。

转换内容：

- HTML 注释 frontmatter `<!-- ... -->` → `--- ... ---`；
- Wiki.js Tabset（`##### Tabset {.tabset}` + 子标题）→ `::tabs` + `tabs: [...]`；
- `{.is-info/success/warning/danger}` 引用块 → GitHub Alert；
- HTML blockquote/figure/table/image/list/center/heading/paragraph → Markdown；
- 复杂表格（rowspan/不规则列）→ 警告 + 项目符号列表兜底；
- 行内脚注 `^[text]` → `[^legacy-note-N]` + 定义；
- 图片尺寸 `![alt](src =320x180)` → `![alt](src "width=320 height=180")`；
- 删除 `{.links-list}` / `{.text-big}`；
- 修复 `/xxx.png` 资产路径（按后缀索引，唯一匹配才修）；
- 压缩多余空行；
- 若仍有残留 HTML 标签，记录警告。

### 15.5 其他脚本

| 脚本 | 用途 |
|---|---|
| `scripts/transform-internal-links.ts` | 把 `](/foo)` 改成 `](/wiki/foo)`，跳过已经是 `/wiki/` 的链接；支持 `--dry-run` |
| `scripts/scrape-articles.mjs` | 从 `https://baike.xauat.site` 的 sitemap + `/api/pages` 抓取文章，写 frontmatter，支持断点续抓（已存在则跳过） |
| `scripts/import-scraped.ts` | 把抓取目录导入数据库，不触发重索引 |
| `scripts/reindex-agent.ts` | 全量重建已发布文章 chunk |
| `prisma/seed.ts` | 创建 ROOT 用户与默认 `home` 文章 |

---

## 16. 缓存、失效与后台队列

### 16.1 三种缓存

| 类型 | 使用位置 | 生命周期 |
|---|---|---|
| Next 持久缓存 `"use cache"` + `cacheLife("max")` + `cacheTag` | 公开文章/树/标签/分类/评论查询 | 直到 tag 被 `updateTag` 失效 |
| React `cache()` | `getSiteSettings`、`getCurrentSession`、管理查询、扩展可用性探测 | 单次请求 |
| HTTP/浏览器 | 图片（1 年 immutable）、OG/静态资源由平台决定 | 由响应头控制 |

### 16.2 缓存 tag

`lib/cache-tags.ts`：

```text
articles                      // 所有公开文章列表/树/分类/标签
article:{path}                // 单篇文章
article-comments:{articleId}  // 单篇评论
```

### 16.3 失效矩阵

| 操作 | 失效内容 |
|---|---|
| 创建/更新文章 | `articles`、新旧 `article:{path}`、`article-comments:{id}`；revalidate `/wiki` 与文章 URL |
| 发布/转草稿 | 同上 |
| 审核评论 | `article-comments:{id}`；revalidate 管理页与文章 URL |
| AI 摘要生成（仅生成） | 不失效缓存（不写数据库）；用户保存文章时按“创建/更新文章”处理 |
| 更新个人资料 | revalidate `/settings`、`/wiki`、`/agent`（双语） |
| 导入文章 | 不主动失效；脚本流程通常需要重新部署或手动 revalidate（导入后重索引只影响向量） |

> 公开查询缓存是 `max`，因此**任何绕过 Server Action 的直接数据库修改都不会自动失效缓存**（例如手工 SQL、外部脚本）。批量导入后如果线上已有缓存，需要触发一次重新验证或重新部署。

### 16.4 队列

- Topic：`article-embedding-sync`
- 幂等键：`articleId:updatedAt`
- 保留：24 小时
- 消费失败重试：指数退避，最多 5 次
- 消息过期判断：文章当前 `updatedAt` 与消息不一致则丢弃
- 本地运行需要 Vercel 环境（`vc link` + `vc env pull`）

> 由于 Action 中 `await enqueueArticleEmbeddingSync(...)` 位于写库之后、且没有单独 try/catch，**队列不可用时创建/更新文章会返回“失败”提示，但数据库其实已经写入**。这是运维上需要注意的行为。

---

## 17. SEO、站点配置与静态资源

### 17.1 站点配置

`lib/site.ts` 从环境变量读取（React `cache` 包裹）：

| 变量 | 默认 |
|---|---|
| `SITE_NAME` | LuckyWiki |
| `SITE_DESCRIPTION` | 无 |
| `SITE_LOGO_URL` | 无 |
| `SITE_FAVICON_URL` | `/favicon.ico` |
| `SITE_FOOTER_COPYRIGHT` | 无 |
| `SITE_FOOTER_ICP` | 无 |
| `BETTER_AUTH_URL` | `http://localhost:3000`（作为站点 URL） |

### 17.2 Metadata

- 根布局：`metadataBase`、标题模板 `%s | 站点名`、描述、robots、favicon。
- 文章：`buildArticleMetadata()`：
  - 描述优先取 `Article.description`（摘要，经 `resolveArticleDescription()` 压缩空白并截断到 160 字）；没有摘要时回退到 Markdown 纯文本前 160 字；
  - canonical 与 `hreflang`（zh-CN / en-US）；
  - OpenGraph `type=article`、发布时间、修改时间、作者、标签关键词；
  - Twitter `summary_large_image`；
  - OG 图 `/og?title=...&lang=...`。
- 普通页面：`buildPageMetadata()`。
- OG 图：`app/og/route.tsx` 用 `next/og` 的 `ImageResponse`，1200×630，深色渐变 + 标题 + 标签 + 语言徽标。

### 17.3 JSON-LD

`lib/structured-data/index.tsx`：

- `WebSiteJsonLd`：站点名、描述、URL、SearchAction；
- `ArticleJsonLd`：headline、description、url、datePublished/dateModified、author、publisher、keywords；`description` 同样优先使用 `Article.description`，没有时回退正文截取；
- `BreadcrumbListJsonLd`：首页 + 路径逐段。

### 17.4 sitemap / robots

- `app/sitemap.ts`：
  - 每个 locale 的 `/wiki/home`、`/agent`、`/wiki/tag`、`/wiki/category`；
  - 所有已发布文章、分类、标签；
  - 每项带 `alternates.languages`；
  - 构建时数据库不可用（Prisma `P1001/P1002`）只输出静态路由，不阻断构建。
- `app/robots.ts`：
  - 允许 `/`；
  - 禁止 `/api/`、`/admin/`、`/auth/`、`/settings/`；
  - 指向 `/sitemap.xml`。

### 17.5 安全响应头

见 `next.config.ts`：nosniff、DENY iframe、XSS protection、referrer policy、权限策略。**没有配置 CSP**。

---

## 18. 安全设计

### 18.1 已实现

- **鉴权分层**：布局 + 页面 + Action + API，不依赖 proxy。
- **角色最小权限**：评论审核/用户管理/日志/分类仅 ROOT。
- **输入校验**：
  - 文章路径严格 canonicalize；
  - 文章/评论/资料/设置全部 Zod；
  - 分页/每页大小夹紧。
- **Markdown 安全**：`skipHtml` + `rehype-sanitize` 扩展白名单。
- **SQL 注入**：所有原始 SQL 使用 Prisma 参数化模板（`$queryRaw` 模板字符串/`Prisma.sql`）。
- **MCP Key**：只存 SHA-256、恒定时间比较、可撤销、按 Key 限流。
- **限流**：搜索 30 次/分钟/IP；MCP 每 Key 每小时可配置；AI 摘要每用户 10 次/小时。
- **AI 摘要**：仅文章编辑器显式触发；作者鉴权；输入截断到 12k 字、输出最多 600 tokens；输出规范化到 280 字；provider 错误只写服务端日志；prompt 明确把文章正文视为不可信数据；正文会发送到配置的 AI 服务。
- **图片上传**：MIME 白名单、大小限制、作者权限、对象 key 清洗。
- **审计**：文章/评论/角色操作写 `logs`；MCP 调用写 `mcp_call_logs`。
- **安全头**：见 17.5。

### 18.2 需要特别注意的风险

1. **HTML 文章原样渲染**：`WikiHtmlRenderer` 使用 `dangerouslySetInnerHTML`，没有 sanitize。只应在作者完全可信时使用。
2. **`/api/agent` 无鉴权/限流**：可被匿名刷 OpenAI 费用。
3. **MCP Key 管理 API 只校验 session**：任何已登录用户都可以通过 API 为自己创建/撤销 Key（页面本身在 admin 布局内，普通 USER 进不去，但 API 可直连）。
4. **proxy 只检查 cookie 存在**：伪造一个同名 cookie 可以通过 proxy，但后续布局会拒绝。
5. **没有 CSP**：XSS 防护主要依赖 Markdown sanitize 和作者可信。
6. **登录 secret 有开发兜底**：生产必须设置强随机 `BETTER_AUTH_SECRET`。
7. **MCP SSE 会话在内存**：多实例/Serverless 实例切换会导致会话丢失。
8. **MCP 调用错误状态可能记成 success**：`handleMcpRequest` 内部捕获错误并通过 SSE/JSON 返回，外层 catch 很少触发。
9. **全局 MCP Key 不记录审计日志**（没有 userId）。
10. **搜索兜底打分**中正文出现次数不生效（`Math.min(50, 50+occurrences*5)` 恒为 50）。
11. **HTML 文章生产样式**可能缺失（Tailwind 不扫描数据库内容，发布页也没加载 CDN）。
12. **日志写入不与业务写操作同事务**：极端情况下可能出现“文章已改、日志失败”。
13. **文章删除未实现**：枚举存在但无入口。
14. **AI 摘要会把草稿内容发送到外部 provider**：只在用户点击按钮时发生，UI 有隐私提示；不要对敏感草稿使用第三方网关。
15. **AI 摘要没有来源/过期标记**：方案 A 复用 `description`，不存 `summarySource` / `generatedAt`；徽标只在当前编辑会话显示，正文修改后无法自动检测摘要过期。
16. **导入会覆盖 AI 摘要**：现有 importer 用 frontmatter `description` 覆盖该字段；重新导入前需保留 frontmatter 或重新生成。
17. **AI 摘要的 provider 兼容性**：使用 `/chat/completions`、`max_tokens`、`temperature`；只支持 Responses API 的网关或拒绝这些参数的 reasoning 模型会失败。长文章只把前 12k 字纯文本送入 prompt，可能遗漏后文。

---

## 19. 环境变量、运行与部署

### 19.1 环境变量分组

**核心**

```bash
DATABASE_URL=postgresql://...
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=至少 32 字符的随机串
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**种子账号**

```bash
ROOT_EMAIL=root@luckywiki.local
ROOT_PASSWORD=ChangeMe123!
ROOT_NAME=LuckyWiki Root
```

**站点元数据**

```bash
SITE_NAME=LuckyWiki
SITE_DESCRIPTION=...
SITE_LOGO_URL=
SITE_FAVICON_URL=
SITE_FOOTER_COPYRIGHT=
SITE_FOOTER_ICP=
```

**Agent / 嵌入 / 摘要**

```bash
OPENAI_API_KEY=
OPENAI_RESPONSES_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_BASE_URL=https://api.openai.com/v1
AGENT_EMBEDDING_DIMENSIONS=1024
OPENAI_EMBEDDING_DIMENSIONS=
OPENAI_EMBEDDING_TIMEOUT_MS=60000
AGENT_REINDEX_CONCURRENCY=4
```

> `OPENAI_API_KEY`、`OPENAI_RESPONSES_MODEL`、`OPENAI_API_BASE_URL` 同时用于文章摘要；摘要不需要嵌入相关变量，也没有新增环境变量。

**数据库直连 / ParadeDB**

```bash
PRISMA_DATABASE_URL=
PARADEDB_DATABASE_URL=
PARADEDB_SSL_MODE=
PRISMA_TRANSACTION_MAX_WAIT_MS=15000
PRISMA_TRANSACTION_TIMEOUT_MS=60000
```

**第三方登录**

```bash
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
OIDC_DISCOVERY_URL=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_PROVIDER_NAME=SSO
```

**邮件**

```bash
RESEND_API_KEY=
EMAIL_FROM=
```

**图床**

```bash
BLOB_READ_WRITE_TOKEN=
IMAGE_HOSTING_BUCKET=
IMAGE_HOSTING_REGION=auto
IMAGE_HOSTING_ACCESS_KEY_ID=
IMAGE_HOSTING_SECRET_ACCESS_KEY=
IMAGE_HOSTING_PUBLIC_URL_BASE=
IMAGE_HOSTING_ENDPOINT=
IMAGE_HOSTING_PATH_PREFIX=wiki-assets
IMAGE_UPLOAD_MAX_BYTES=5242880
```

**MCP**

```bash
MCP_SERVER_API_KEY=
MCP_RATE_LIMIT=200
```

**限流**

```bash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### 19.2 本地启动

```bash
pnpm install                 # postinstall 自动 prisma generate
cp .env.example .env
pnpm prisma migrate deploy   # 或 prisma migrate dev
pnpm db:seed                 # 创建 ROOT + home
pnpm dev
```

首次使用 Agent：

```bash
pnpm agent:index
```

### 19.3 脚本

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器 |
| `pnpm build` / `pnpm start` | 生产构建/启动 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `next typegen && tsc --noEmit` |
| `pnpm test` | `tsx --test tests/**/*.test.ts(x)` |
| `pnpm db:seed` | 种子数据 |
| `pnpm agent:index` | 全量重建向量 |
| `pnpm articles:migrate` | Wiki.js/HTML → Markdown |
| `pnpm articles:import-images` | 本地图片 → WebP → 图床 |
| `pnpm articles:import` | 导入文章并重索引 |
| `pnpm articles:transform-links` | 站内链接补 `/wiki` 前缀 |

### 19.4 Vercel 部署

- `vercel.json` 为 `app/api/queue/article-embedding-sync/route.ts` 注册 `queue/v2beta` 触发器；
- 队列运行时使用 Vercel OIDC 与部署区域；
- 生产数据库建议 ParadeDB（`pg_search` + `pgvector`），否则自动退回 `pg_trgm` / 应用层；
- 部署后执行：

```bash
pnpm prisma migrate deploy
pnpm agent:index
```

- 搜索/MCP 限流需要 Upstash；生产未配置会 fail closed（503）。
- 文章摘要复用 OpenAI 配置；不需要迁移或新增环境变量；生产未配置 Upstash 时限流不可用，摘要会返回本地化错误（fail closed）。
- 自建 ParadeDB 若为明文 TCP，设置 `PARADEDB_SSL_MODE=disable`。

### 19.5 CI

`.github/workflows/ci.yml`：

- Node 24 + pnpm 11.20.0；
- `pnpm install --frozen-lockfile`；
- `pnpm typecheck`；
- `pnpm test`。

---

## 20. 扩展指南：新增功能该改哪里

### 20.1 新增一个公开页面

1. 在 `app/[lang]/...` 下创建 `page.tsx`；
2. 用 `hasLocale(lang)` 校验，否则 `notFound()`；
3. 用 `getDictionary(lang)` 取文案；
4. 链接统一用 `localizeHref(locale, path)` / `buildWikiHref(path, locale)`；
5. 若需要静态缓存，在数据函数上加 `"use cache"` + `cacheTag`，并在写操作中失效。

### 20.2 给 Article 增加字段

1. `prisma/schema.prisma` 增加字段；
2. `pnpm prisma migrate dev --name add_xxx`；
3. `listAdminArticles` / `getPublishedArticleByPath` 等 select 增加字段；
4. `parseArticleForm` 增加 Zod 校验；
5. `ArticleEditor` 增加隐藏 input/表单控件；
6. 导入/导出脚本按需支持 frontmatter；
7. 更新类型与测试。

### 20.3 新增 Agent 工具

1. 在 `lib/agent/tools.ts` 写纯函数（依赖注入 `WikiAgentToolDeps`，便于测试）；
2. 在 `createWikiAgentTools()` 注册 `tool()`，提供 Zod schema；
3. 在 `lib/agent/graph.ts` 与 `lib/agent/openai.ts` 的 `TOOL_LABELS` 增加标签/摘要（两处目前重复）；
4. 增加 `tests/agent-tools.test.ts` 用例。

### 20.4 新增 MCP 工具

1. `lib/mcp/tools.ts` 的 `mcpTools` 增加 name/description/inputSchema；
2. 增加 Zod schema；
3. `callTool()` switch 增加分支；
4. 实现只读查询（必须过滤 PUBLISHED）；
5. 更新 `docs/MCP-INTEGRATION.md`。

### 20.5 新增语言

1. `lib/i18n/config.ts` 的 `locales` 增加；
2. 增加 `lib/i18n/dictionaries/xx.ts`；
3. `get-dictionary.ts` 注册动态 import；
4. `getIntlLocale` 增加映射；
5. `getPreferredLocale` 增加 Accept-Language 判断；
6. 检查所有 `locale === "zh"` 的硬编码文案（Agent 系统提示、兜底文案等）。

### 20.6 新增权限能力

1. `lib/auth/permissions.ts` 增加函数并写测试；
2. 在布局/页面/Action/API 调用；
3. UI 同步隐藏入口（但不能只靠 UI）。

### 20.7 新增缓存失效点

1. `lib/cache-tags.ts` 定义 tag；
2. 查询函数加 `"use cache"` + `cacheTag`；
3. 写操作中 `updateTag(...)`；
4. 需要页面级刷新时配合 `revalidatePath` / `revalidateLocalizedPath`。

### 20.8 修改/扩展 AI 摘要

1. 清洗、prompt、输出规范化：`lib/articles/summary.ts`；
2. OpenAI 调用与响应解析：`lib/openai/chat.ts`；共享 URL/Header 在 `lib/openai/base-url.ts`；
3. 鉴权、Zod、限流、错误映射：`app/actions/summary.ts`；
4. 编辑器按钮、确认、徽标、错误：`components/article-editor.tsx` 的“摘要与 AI 生成”区域；
5. 文案：`lib/i18n/dictionaries/zh.ts` / `en.ts` 的 `admin.articleEditor` 与 `feedback`；
6. 测试：`tests/article-summary.test.ts`；
7. 如果要把摘要加入列表/搜索/SEO，已有 `Article.description` 会自动生效；不要把摘要加入 `agent_chunks`，除非明确接受过期风险。

---

## 21. 已知限制与注意事项

按影响从高到低：

1. **`/api/agent` 无鉴权、无限流**：公开可调用，可能产生费用/滥用风险。建议加登录、IP/用户限流或 Turnstile。
2. **HTML 文章未 sanitize**：`dangerouslySetInnerHTML`；只适合可信作者。若开放投稿，应引入 sanitize 或限制 HTML 模式。
3. **HTML 文章生产样式不完整**：Tailwind 只扫描源码，数据库中的类名不会生成；预览用 CDN 所以“预览正常、线上异常”。建议为 HTML 文章加载独立样式或允许 CDN（并评估安全）。
4. **MCP Key API 权限边界**：API 只检查 session，普通 USER 可绕过页面直接创建自己的 Key；建议在 API 也加 `requireAuthorSession`/ROOT 判断。
5. **MCP SSE 单实例**：会话与消息计数在进程内 Map；多实例/Serverless 冷启动会丢会话；`Last-Event-ID` 只发“已重连”通知，不重放消息。
6. **MCP 审计状态可能不准**：协议错误在 `handleMcpRequest` 内部被吞掉，外层通常记录 success；限流日志的 method 固定为 `unknown`。
7. **MCP 文档与代码不一致**：`get_categories` vs `list_categories`；pageSize 50 vs 20；429 错误码 `-32002` vs 实际 `-32000`。
8. **队列失败会影响文章操作返回**：数据库已写入但队列投递失败时，Action 返回错误；用户可能重复提交。建议把投递失败降级为日志/后台补偿。
9. **日志与业务写非同事务**：极端情况下日志可能缺失。
10. **公开缓存不会自动感知外部写入**：手工 SQL/外部导入后需要手动失效或重新部署。
11. **`/api/pages/[...path]` 不做路径规范化**：大小写/编码与数据库存储不一致时可能 404；且没有显式缓存头。
12. **搜索兜底评分的正文词频无效**：`Math.min(50, 50 + occurrences*5)` 恒为 50。
13. **没有文章删除功能**：`DELETE_ARTICLE` 只用于日志展示。
14. **`getRateLimitConfig()` 未被使用**：MCP 限流实际由 Key 的 `rateLimit` / 环境变量在鉴权层决定。
15. **`lib/mcp/api-keys.ts` 的 `revokeApiKey` 用软删除**：重复撤销返回 404；已撤销 Key 不再出现在列表。
16. **`trustedOrigins` 固定包含 localhost**：生产环境也不会移除，通常无害，但可按需收紧。
17. **`next-env.d.ts` 与 `generated/prisma` 不入库**：全新 clone 必须先 `pnpm install` / `prisma generate` 才能通过类型检查。
18. **测试依赖环境变量**：`tests/prisma.test.ts` 在缺少 `DATABASE_URL` 时会临时补一个本地测试 URL；其余测试大多为纯函数/SSR，不依赖真实数据库。
19. **国际化硬编码**：Agent 工具标签、部分兜底文案、MCP 页面文案有中文硬编码。
20. **没有错误边界页面**：只有 `not-found.tsx` 与 `loading.tsx`，运行时异常会走 Next 默认错误页。

---

## 22. 关键文件索引

### 应用层

| 文件 | 职责 |
|---|---|
| `app/[lang]/layout.tsx` | 根布局、Provider、metadata、JSON-LD |
| `app/[lang]/wiki/[[...slug]]/page.tsx` | 文章阅读页 |
| `app/[lang]/wiki/category/*`、`tag/*` | 分类/标签页 |
| `app/[lang]/agent/page.tsx` | Agent 页面 |
| `app/[lang]/settings/page.tsx` | 个人设置 |
| `app/[lang]/admin/layout.tsx` | 管理后台外壳与作者校验 |
| `app/[lang]/admin/page.tsx` | 管理总览 |
| `app/[lang]/admin/articles/*` | 文章列表/新建/编辑 |
| `app/[lang]/admin/comments/page.tsx` | 评论审核 |
| `app/[lang]/admin/users/page.tsx` | 用户角色 |
| `app/[lang]/admin/logs/page.tsx` | 操作日志 |
| `app/[lang]/admin/taxonomy/page.tsx` | 分类结构 |
| `app/[lang]/admin/mcp-keys/page.tsx` | MCP Key 管理 |
| `app/actions/admin.ts` | 文章/评论/角色写操作 |
| `app/actions/summary.ts` | AI 摘要生成（鉴权/限流/本地化错误，不写库） |
| `app/actions/comments.ts` | 发表评论 |
| `app/actions/settings.ts` | 资料/账号绑定 |
| `app/actions/search.ts` | 搜索 Action + 限流 |
| `app/api/agent/route.ts` | Agent 入口 |
| `app/api/mcp/route.ts` | MCP SSE/JSON-RPC 入口 |
| `app/api/queue/article-embedding-sync/route.ts` | 嵌入队列消费者 |
| `app/api/uploads/images/route.ts` | 图片上传 |
| `proxy.ts` | locale + admin cookie 预检查 |

### 领域层

| 文件 | 职责 |
|---|---|
| `lib/articles/index.ts` | 公开/管理文章查询与缓存 |
| `lib/articles/import.ts` | Markdown 导入 |
| `lib/articles/image-import.ts` | 图片转 WebP + 上传 + 改写 |
| `lib/articles/markdown-migrate.ts` | Wiki.js → 新 Markdown |
| `lib/articles/summary-contract.ts` | 摘要 Action 的客户端安全常量与类型 |
| `lib/articles/summary.ts` | 摘要清洗、prompt、规范化、可注入生成器 |
| `lib/openai/base-url.ts` | OpenAI 网关 URL/Header/配置判断 |
| `lib/openai/chat.ts` | 非流式 Chat Completions 调用与响应解析 |
| `lib/wiki/path.ts` | 路径规范化与 URL 构建 |
| `lib/wiki/tree.ts` | 目录树 |
| `lib/wiki/taxonomy.ts` | 分类/标签参数解码 |
| `lib/auth/index.ts` | Better Auth 配置 |
| `lib/auth/session.ts` | 会话与守卫 |
| `lib/auth/permissions.ts` | 角色能力 |
| `lib/auth/provider-config.ts` | GitHub/OIDC 开关与映射 |
| `lib/agent/chunks.ts` | 分块与余弦相似度 |
| `lib/agent/index-core.ts` | 嵌入同步核心 |
| `lib/agent/index.ts` | Prisma 仓库、事务、全量重索引 |
| `lib/agent/search.ts` | 混合检索 |
| `lib/agent/tools.ts` | Agent 只读工具 |
| `lib/agent/graph.ts` | LangGraph QA 流程 |
| `lib/agent/openai.ts` | Agent 模型、嵌入、SSE 输出；复用/重导出 `lib/openai` 的共享配置 |
| `lib/agent/route.ts` | Agent 请求校验与 SSE |
| `lib/mcp/server.ts` | JSON-RPC / MCP 协议 |
| `lib/mcp/tools.ts` | 6 个 MCP 工具 |
| `lib/mcp/auth.ts` | Bearer Key 校验 |
| `lib/mcp/api-keys.ts` | Key 生成/校验/撤销/统计 |
| `lib/mcp/rate-limit.ts` | MCP 限流封装 |
| `lib/mcp/errors.ts` | JSON-RPC 错误 |
| `lib/search.ts` | 三级搜索与结果摘要（excerpt） |
| `lib/text.ts` | Markdown 纯文本、描述/摘要截断工具 |
| `lib/image-hosting.ts` | Blob/S3 上传 |
| `lib/embedding-queue.ts` | 队列投递 |
| `lib/prisma.ts` | Prisma 客户端与断线重试 |
| `lib/cache-tags.ts` | 缓存 tag |
| `lib/admin.ts` | 管理端聚合查询 |
| `lib/comments.ts` | 评论审核查询 |
| `lib/metadata/index.ts` | Metadata 构建 |
| `lib/structured-data/index.tsx` | JSON-LD |
| `lib/i18n/*` | locale、字典、Provider、格式化 |

### 组件层

| 文件 | 职责 |
|---|---|
| `components/article-editor.tsx` | Monaco 编辑器、预览、图片、路径选择、摘要 AI 生成 |
| `components/markdown-renderer.tsx` | Markdown 插件管线 |
| `components/markdown-custom-components.tsx` | 自定义组件集合 |
| `components/markdown-custom-components/*` | Card/Chat/CodeBlock/Icon/Infographic/Timeline |
| `components/wiki-shell.tsx` | Wiki 页面骨架 |
| `components/wiki-sidebar.tsx` | 目录树侧栏 |
| `components/wiki-search-dialog.tsx` | Cmd/Ctrl+K 搜索 |
| `components/wiki-agent.tsx` | Agent 聊天 UI + SSE 解析 |
| `components/wiki-comments.tsx` | 评论展示/分页/输入区 |
| `components/wiki-toc.tsx` | 目录与滚动高亮 |
| `components/auth-form.tsx` | 登录/注册/第三方登录 |
| `components/settings-*.tsx` | 资料与账号绑定 |
| `components/app-sidebar.tsx` | 管理后台侧栏（角色菜单） |
| `components/ui/*` | shadcn/Radix 基础组件 |

### 数据与脚本

| 文件 | 职责 |
|---|---|
| `prisma/schema.prisma` | 数据模型 |
| `prisma/migrations/*` | 建表、扩展、索引迁移 |
| `prisma/seed.ts` | ROOT + home |
| `scripts/reindex-agent.ts` | 全量向量重建 |
| `scripts/import-articles.ts` | 导入 + 重索引 |
| `scripts/import-article-images.ts` | 图片导入 |
| `scripts/migrate-articles-markdown.ts` | Wiki.js 迁移 |
| `scripts/transform-internal-links.ts` | 站内链接改写 |
| `scripts/scrape-articles.mjs` | 线上抓取 |
| `scripts/import-scraped.ts` | 抓取结果导入 |
| `tests/article-summary.test.ts` | 摘要清洗、prompt、规范化、Chat Completions、metadata helper 测试 |

---

## 附：一条完整的内容生命周期

```text
1. 编写
   admin/articles/new → ArticleEditor（Markdown/HTML）
   图片粘贴/选择 → /api/uploads/images → 图床 URL → 插入正文
   摘要：默认人工填写；可选点击「AI 生成摘要」→ 只回填编辑器状态

2. 保存
   Server Action → Zod + canonicalizePath
   → articles 表（含 description/摘要、DRAFT/PUBLISHED，publishedAt 规则）
   → logs 表
   → updateTag + revalidatePath
   → 队列消息 {articleId, updatedAt}

3. 异步索引
   Vercel Queue → 检查 updatedAt 是否最新
   → 分块（标题/段落/900 字）
   → OpenAI embeddings（1024 维）
   → 事务替换 agent_chunks（vector + HNSW）
   → 草稿则删除 chunk

4. 阅读
   读者 → proxy locale → RSC 文章页
   → "use cache" 按 tag 命中
   → 标题下方展示摘要（description）
   → MarkdownRenderer / HTML
   → 评论（APPROVED）→ TOC → JSON-LD（description 优先摘要）

5. 发现
   搜索：BM25 → pg_trgm → Prisma 兜底（description/摘要参与）
   Agent：向量 ANN + BM25 融合 → LangGraph → SSE
   MCP：外部 AI 通过 Bearer Key 调 6 个只读工具

6. 治理
   评论 PENDING → ROOT 审核 → APPROVED/REJECTED
   所有管理操作写 logs
   缓存 tag 精准失效
```

---

_文档结束。若代码与本文不一致，以仓库当前源码为准；建议在重大重构后同步更新本文。_
