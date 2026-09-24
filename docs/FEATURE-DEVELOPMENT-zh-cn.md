# LuckyWiki 功能开发与 MCP 集成综合指南

> 本文整合 `FEATURE-DEVELOPMENT.md`、`MCP-INTEGRATION.md`、`MCP-SUMMARY.md`，作为 LuckyWiki / 建大百科的功能开发、MCP 对接、部署运维与项目总结的统一参考。
>
> 阅读原则：**代码实现优先于文档描述**；若文档之间冲突，以当前仓库代码和最新迁移为准，并在“常见陷阱与已知同步差距”中记录需要更新的文档。

---

## 目录

1. [项目概览与架构](#1-项目概览与架构)
2. [开发前准备](#2-开发前准备)
3. [Next.js 与渲染约定](#3-nextjs-与渲染约定)
4. [路由、Shell 与元数据](#4-路由shell-与元数据)
5. [国际化](#5-国际化)
6. [认证与授权](#6-认证与授权)
7. [数据库驱动功能](#7-数据库驱动功能)
8. [重新验证与缓存正确性](#8-重新验证与缓存正确性)
9. [文章相关功能](#9-文章相关功能)
10. [API 端点](#10-api-端点)
11. [管理后台功能](#11-管理后台功能)
12. [搜索、Agent 与 MCP](#12-搜索agent-与-mcp)
13. [内容导入与图片托管](#13-内容导入与图片托管)
14. [样式与 UI 约定](#14-样式与-ui-约定)
15. [测试与验证](#15-测试与验证)
16. [常见陷阱与已知同步差距](#16-常见陷阱与已知同步差距)
17. [功能实现清单](#17-功能实现清单)
18. [关键文件索引](#18-关键文件索引)
19. [开发者命令](#19-开发者命令)
20. [附录：MCP 开发总结](#20-附录mcp-开发总结)

---

## 1. 项目概览与架构

LuckyWiki 是一个本地化、数据库驱动的 Next.js App Router 应用。最安全的心智模型是：

> 路由和 UI 位于 `app/` 与 `components/`；可复用的服务端行为位于 `lib/`；持久化内容通过 Prisma 存入 PostgreSQL；功能变更通常使用 Server Actions；外部集成使用 Route Handlers 或专用库模块。

### 1.1 请求流程

```text
Browser request
  -> proxy.ts
  -> app/[lang]/layout.tsx
  -> section layout (wiki, agent, settings, auth, or admin)
  -> page or Route Handler
  -> lib/ 领域模块
  -> Prisma/PostgreSQL 或外部服务
```

### 1.2 主要产品区域

- 本地化公共 Wiki 页面；
- Markdown 与可信 HTML 文章渲染和编辑；
- 文章搜索：ParadeDB BM25、PostgreSQL `pg_trgm`、应用层回退；
- 邮箱/密码认证，可选 GitHub 与 OIDC；
- 作者/根管理员管理与评论审核；
- LangGraph / OpenAI 兼容的 Wiki Agent；
- 只读 MCP 服务器，支持 API Key、SSE、限流与审计记录；
- Markdown 导入、图片转换/上传、旧内容迁移。

### 1.3 仓库地图

| 路径 | 职责 |
| --- | --- |
| `app/` | App Router 页面、布局、Route Handlers、Server Actions、元数据路由、全局 CSS |
| `app/[lang]/` | `zh` 和 `en` 的本地化用户路由 |
| `app/actions/` | 数据库变更与其他 Server Actions |
| `app/api/` | JSON、SSE、上传、认证、MCP 等 HTTP 端点 |
| `components/` | 产品组件与功能 UI |
| `components/ui/` | 可复用 shadcn/Radix 风格原语 |
| `hooks/` | 小型客户端 React hooks |
| `lib/` | 领域逻辑、数据库访问、认证、搜索、集成、i18n |
| `prisma/schema.prisma` | 持久化数据模型 |
| `prisma/migrations/` | 有序数据库迁移 |
| `prisma/seed.ts` | 开发/引导数据 |
| `scripts/` | 导入、迁移、抓取、索引命令 |
| `tests/` | 通过 `tsx` 执行的 Node 内置测试 |
| `types/` | 共享 TypeScript 类型与声明 |
| `public/` | 静态资源 |
| `docs/` | 集成与开发文档 |

Prisma Client 生成到 `generated/prisma/`。该目录被 Git 忽略，安装或修改 schema 后必须重新生成。

---

## 2. 开发前准备

### 2.1 阅读仓库说明

- `CLAUDE.md` 委托给 `AGENTS.md`。
- `AGENTS.md` 警告：本仓库使用 breaking 版本的 Next.js。修改 Next.js API 前，先安装依赖，并阅读 `node_modules/next/dist/docs/` 下的相关文档。
- 不要依赖旧版 Next.js 约定。本代码库在页面、布局和 Route Handlers 中使用异步 `params` 与 `searchParams`。

裸检出可能不包含 `node_modules/` 或生成的 Prisma Client。安装依赖后，本地 Next.js 文档或 `generated/prisma/` 才会存在。

### 2.2 建立基线

```bash
git status --short
pnpm install
pnpm lint
pnpm test
```

`pnpm` 是 `package.json` 和 `pnpm-lock.yaml` 声明的包管理器。保持 lockfile 权威，避免依赖漂移。

### 2.3 配置本地服务

仓库当前未跟踪 `.env.example`，尽管 README 提到它。使用 `README.md` 和本文的环境变量章节作为当前契约。不要提交真实 `.env` 或凭据。

数据库驱动的本地运行至少需要：

- PostgreSQL 连接变量；
- `BETTER_AUTH_URL`，通常为 `http://localhost:3000`；
- 开发用 `BETTER_AUTH_SECRET`。

PostgreSQL 可用后：

```bash
pnpm prisma generate
pnpm prisma migrate deploy
pnpm db:seed
pnpm dev
```

种子脚本创建或提升 root 账号，并创建 `home` 文章。本地工作应显式设置 `ROOT_EMAIL`、`ROOT_PASSWORD`、`ROOT_NAME`。

### 2.4 环境变量

除非明确需要浏览器使用并加 `NEXT_PUBLIC_*` 前缀，否则环境变量均为服务端使用。不要通过 `NEXT_PUBLIC_*` 暴露密钥。

#### 数据库

| 变量 | 用途 |
| --- | --- |
| `PARADEDB_DATABASE_URL` | 首选直连/ParadeDB 连接 |
| `DIRECT_URL` | 直连 PostgreSQL 回退 |
| `PRISMA_DATABASE_URL` | Prisma 连接回退 |
| `POSTGRES_URL` | PostgreSQL 连接回退 |
| `DATABASE_URL` | 通用数据库回退 |
| `PARADEDB_SSL_MODE` | 纯 TCP ParadeDB 端点设为 `disable` |
| `PRISMA_TRANSACTION_MAX_WAIT_MS` | 可选，Agent 索引事务等待调优 |
| `PRISMA_TRANSACTION_TIMEOUT_MS` | 可选，Agent 索引事务超时调优 |

#### 站点元数据

- `SITE_NAME`
- `SITE_DESCRIPTION`
- `SITE_LOGO_URL`
- `SITE_FAVICON_URL`
- `SITE_FOOTER_COPYRIGHT`
- `SITE_FOOTER_ICP`

这些由 `lib/site.ts` 读取；当前站点设置不是数据库驱动。

#### 认证与邮件

- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`（认证/种子代码的回退）
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `OIDC_DISCOVERY_URL`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_PROVIDER_NAME`
- `RESEND_API_KEY`
- `EMAIL_FROM`

未配置 Resend 时，本地验证链接由 `lib/email.ts` 打印到日志，而不是发送邮件。

#### 图片托管

- `BLOB_READ_WRITE_TOKEN`
- `IMAGE_HOSTING_BUCKET`
- `IMAGE_HOSTING_REGION`
- `IMAGE_HOSTING_ACCESS_KEY_ID`
- `IMAGE_HOSTING_SECRET_ACCESS_KEY`
- `IMAGE_HOSTING_ENDPOINT`
- `IMAGE_HOSTING_PUBLIC_URL_BASE`
- `IMAGE_HOSTING_PATH_PREFIX`
- `IMAGE_UPLOAD_MAX_BYTES`

#### Agent

- `OPENAI_API_KEY`
- `OPENAI_API_BASE_URL`
- `OPENAI_RESPONSES_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `AGENT_EMBEDDING_DIMENSIONS`

代码使用 OpenAI 兼容网关。默认聊天和嵌入值定义在 `lib/agent/openai.ts`。需要语义索引时，确保网关同时支持聊天和嵌入操作。

#### MCP

- `MCP_SERVER_API_KEY`：可选全局 Bearer Key；
- `MCP_RATE_LIMIT`：全局 Key 每小时限制。

每用户 MCP Key 和限制存储在数据库中。

#### 种子

- `ROOT_EMAIL`
- `ROOT_PASSWORD`
- `ROOT_NAME`

---

## 3. Next.js 与渲染约定

### 3.1 本地化请求预处理

`proxy.ts`：

1. 检测首个 URL 段是否为 `zh` 或 `en`；
2. 将未本地化的浏览器路由重定向到带语言前缀的路由；
3. 从 `NEXT_LOCALE` 或 `Accept-Language` 选择语言；
4. 持久化语言 Cookie；
5. 对本地化 `/admin` 路由做轻量 Better Auth Cookie 检查。

Proxy **不是授权边界**。它只检查 Cookie。每个需要保护的 Server Action、页面和 API Handler 必须自行进行会话与角色检查。API 路由被排除在 proxy matcher 之外，因此 API Handler 必须显式认证。

### 3.2 默认使用 Server Components

页面和布局默认是 Server Components，除非跨越客户端边界。数据库读取、会话读取、元数据生成和授权应保留在 Server Components 或服务端模块中。

仅在需要浏览器状态或浏览器专用 API 时使用客户端组件，例如：

- `useState`、`useEffect` 或事件处理器；
- `sessionStorage`、`navigator`、`window`、`AbortController`；
- Monaco、Mermaid、主题 API 或其他浏览器专用库；
- 实时流、对话框或交互式表单状态。

用以下指令标记尽可能小的文件：

```tsx
"use client";
```

不要将 Prisma、Better Auth 服务端模块、密钥或其他仅服务端代码导入客户端组件。在服务端加载数据，并向客户端组件传递可序列化 props 或绑定的 Server Action。

### 3.3 异步路由参数

使用本仓库的 Next.js 16 风格：

```tsx
type Params = Promise<{ lang: string }>;
type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { lang } = await params;
  const query = await searchParams;
  // ...
}
```

动态 Route Handler 参数同样是异步的：

```ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // ...
}
```

始终用 `hasLocale()` 验证语言，并对无效值调用 `notFound()`。

### 3.4 动态行为

根本地化布局是 `dynamic = "force-dynamic"`，因为应用依赖会话、数据库内容和环境驱动设置。Admin 和 Agent 界面也适当使用动态行为。新增页面时遵循最近的现有路由；不要在会话或数据库依赖路由上添加静态生成，除非检查其数据和缓存行为。

MCP 路由显式使用：

```ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
```

保持 MCP 和其他仅 Node 集成使用 Node 运行时。

---

## 4. 路由、Shell 与元数据

### 4.1 主路由表

| URL | 来源 | 用途 |
| --- | --- | --- |
| `/{lang}` | `app/[lang]/page.tsx` | 重定向到 `/{lang}/wiki/home` |
| `/{lang}/wiki` | `app/[lang]/wiki/[[...slug]]/page.tsx` | 可选 catch-all Wiki 路由；空路径重定向到 home |
| `/{lang}/wiki/{path}` | 同上 | 渲染已发布文章 |
| `/{lang}/agent` | `app/[lang]/agent/page.tsx` | Wiki Agent UI |
| `/{lang}/settings` | `app/[lang]/settings/page.tsx` | 资料与关联账号设置 |
| `/{lang}/auth/*` | `app/[lang]/auth/*/page.tsx` | 登录、注册、邮箱验证 |
| `/{lang}/admin` | `app/[lang]/admin/page.tsx` | Root 仪表盘 |
| `/{lang}/admin/articles` | `app/[lang]/admin/articles/page.tsx` | 文章列表、筛选、状态变更 |
| `/{lang}/admin/articles/new` | `app/[lang]/admin/articles/new/page.tsx` | 创建文章 |
| `/{lang}/admin/articles/{id}` | `app/[lang]/admin/articles/[id]/page.tsx` | 编辑文章 |
| `/{lang}/admin/comments` | `app/[lang]/admin/comments/page.tsx` | 评论审核 |
| `/{lang}/admin/logs` | `app/[lang]/admin/logs/page.tsx` | 操作日志浏览 |
| `/{lang}/admin/taxonomy` | `app/[lang]/admin/taxonomy/page.tsx` | 栏目/标签摘要 |
| `/{lang}/admin/users` | `app/[lang]/admin/users/page.tsx` | 用户角色管理 |
| `/{lang}/admin/mcp-keys` | `app/[lang]/admin/mcp-keys/page.tsx` | MCP Key 管理 |
| `/api/auth/*` | `app/api/auth/[...all]/route.ts` | Better Auth Handler |
| `/api/search` | `app/api/search/route.ts` | 公共文章搜索 JSON |
| `/api/pages` | `app/api/pages/route.ts` | 已发布文章树 JSON |
| `/api/pages/{path}` | `app/api/pages/[...path]/route.ts` | 已发布文章 JSON |
| `/api/agent` | `app/api/agent/route.ts` | Agent SSE 端点 |
| `/api/uploads/images` | `app/api/uploads/images/route.ts` | 认证图片上传 |
| `/api/mcp` | `app/api/mcp/route.ts` | MCP SSE 与 JSON-RPC 端点 |
| `/api/admin/mcp-keys` | `app/api/admin/mcp-keys/route.ts` | 列出/创建当前用户 MCP Key |
| `/api/admin/mcp-keys/{id}` | `app/api/admin/mcp-keys/[id]/route.ts` | 撤销当前用户 MCP Key |
| `/robots.txt` | `app/robots.ts` | Robots 元数据 |
| `/sitemap.xml` | `app/sitemap.ts` | 本地化静态与文章 URL |
| `/og` | `app/og/route.tsx` | Edge 生成社交预览图 |

### 4.2 选择正确的 Shell

- 公共 Wiki、Agent 和设置页面通过各自的 section layout 使用 `components/wiki-shell.tsx`。Shell 加载已发布树、会话、字典和站点设置。
- Admin 页面使用 `app/[lang]/admin/layout.tsx`，渲染 `AppSidebar`、`AdminHeader`、`SiteFooter`，并要求 author 能力会话。
- 认证页面使用 `app/[lang]/auth/layout.tsx`。

### 4.3 元数据与可发现性

使用 `lib/metadata/index.ts` 中的现有 helper：

- `buildPageMetadata()`：普通页面；
- `buildArticleMetadata()`：Wiki 文章；
- `getOgImageUrl()`：生成的 `/og` 预览。

如果新公共路由应被索引，将其加入 `app/sitemap.ts`，并在适当位置包含本地化 alternates。

---

## 5. 国际化

支持的语言定义在 `lib/i18n/config.ts`：

```ts
export const locales = ["zh", "en"] as const;
export const defaultLocale = "zh";
```

使用以下 helper：

- `hasLocale(value)`：验证语言；
- `localizeHref(locale, path)`：添加或替换语言前缀；
- `buildWikiHref(path, locale)`：构建编码后的文章 URL；
- `getDictionary(locale)`：在服务端代码加载翻译；
- `useLocale()` 与 `useT()`：在客户端组件读取翻译；
- `formatTemplate()`：插值翻译字符串；
- `formatDate()` 与 `formatNumber()`：语言感知格式化。

每个用户可见字符串：

1. 在 `lib/i18n/dictionaries/zh.ts` 添加属性；
2. 在 `lib/i18n/dictionaries/en.ts` 添加相同形状；
3. 在 Server Component 或 action 中使用 `getDictionary()`，在客户端组件中使用 `useT()`；
4. 占位符使用 `formatTemplate()`，不要在代码中拼接翻译句子。

将两个字典视为同一个类型契约。只有两种语言都正确渲染，功能才算完成。

---

## 6. 认证与授权

### 6.1 集中权限模型

权限 helper 位于 `lib/auth/permissions.ts`：

| 角色 | 预期能力 |
| --- | --- |
| `ROOT` | 完整 Admin Shell、文章管理、评论审核、用户角色管理、日志、分类 |
| `AUTHOR` | Admin Shell、文章创建/编辑/状态变更、文章图片上传 |
| `USER` | 无 Admin Shell；邮箱验证后可评论 |

使用 `lib/auth/session.ts` 中的现有会话守卫：

- `getCurrentSession()`：可空会话查询；
- `requireSession(locale, nextPath)`：重定向未认证用户；
- `requireAuthorSession(locale)`：要求 `ROOT` 或 `AUTHOR`；
- `requireRootSession(locale, redirectPath?)`：要求 `ROOT`；
- `requireVerifiedSession(locale, nextPath)`：要求已验证账号。

当这些 helper 或 `lib/auth/permissions.ts` 函数适用时，不要内联实现角色比较。

### 6.2 页面保护

即使 proxy 有 admin Cookie 检查，也要在页面或布局本身保护页面：

```tsx
const session = await requireAuthorSession(lang);
```

仅 Root 页面应调用 `requireRootSession(lang, ...)` 作为自身边界。

### 6.3 Server Action 保护

每个 mutation 内部都要认证，而不仅是调用它的页面。客户端可以独立于 UI 调用 action 或端点。

公共评论 mutation 的现有模式：

1. `requireVerifiedSession()`；
2. 用 Zod 解析 `FormData`；
3. 写入 `PENDING` 记录；
4. 重新验证受影响文章路径。

管理 mutation 还应在操作改变内容、审核状态或角色时创建 `Log` 记录。

### 6.4 Better Auth

`lib/auth/index.ts` 配置 Better Auth，使用 Prisma adapter、邮箱/密码、可选 GitHub/OIDC provider、邮箱验证和账号关联。认证 Route Handler 是 `app/api/auth/[...all]/route.ts`。

可选 provider 配置隔离在 `lib/auth/provider-config.ts`。provider 启用应取决于完整环境配置，而不是暴露损坏的登录按钮。

---

## 7. 数据库驱动功能

### 7.1 Schema 与迁移工作流

持久化状态：

1. 在 `prisma/schema.prisma` 添加或修改模型；
2. 有意添加关系、可空性、唯一性和索引；
3. 创建命名迁移；
4. 重新生成客户端；
5. 更新领域查询和 mutation；
6. 为新行为和迁移假设添加测试。

开发命令：

```bash
pnpm prisma migrate dev --name describe_the_change
pnpm prisma generate
```

部署命令：

```bash
pnpm prisma migrate deploy
```

不要编辑已应用的迁移来改变生产行为。添加新迁移。

### 7.2 当前数据模型

`prisma/schema.prisma` 当前包含：

- `User`、`Session`、`Account`、`Verification`：Better Auth；
- `Article`：Wiki 内容；
- `AgentChunk`：标题感知文章分块与嵌入；
- `Comment`：审核讨论；
- `Log`：管理审计记录；
- `McpApiKey`、`McpCallLog`：MCP 凭据与审计数据。

重要枚举：

- `Role`：`ROOT`、`AUTHOR`、`USER`；
- `ArticleStatus`：`DRAFT`、`PUBLISHED`；
- `CommentStatus`：`PENDING`、`APPROVED`、`REJECTED`；
- `LogAction`：文章、评论、角色管理操作。

`Article.path` 唯一，是规范 Wiki 标识符。标签是 PostgreSQL 文本数组。公共文章查询必须过滤 `status = PUBLISHED`。公共文章页面只加载已批准评论。

`AgentChunk` 在 `embedding` 中保留序列化 JSON，并有一个不支持的 `embeddingVector` 列（`vector(1024)`）。vector 列通过 raw SQL 填充，因为 Prisma 不将 vector 类型暴露为原生标量。

### 7.3 Prisma 访问

使用 `lib/prisma.ts` 中的共享 `prisma` 实例。它使用 `@prisma/adapter-pg`，配置时选择 direct/ParadeDB 连接，并对读操作重试关闭连接。不要在页面、action 或 request handler 中实例化新的 Prisma Client。

将可复用读取放在领域模块中，例如：

- `lib/articles/index.ts`：公共和管理文章查询；
- `lib/admin.ts`：仪表盘、分类、用户、日志；
- `lib/comments.ts`：审核查询；
- `lib/search.ts`：公共搜索；
- `lib/mcp/tools.ts`：MCP 专用已发布内容查询；
- `lib/agent/tools.ts`：Agent 专用已发布内容查询。

优先使用窄 `select` 和显式排序。避免在路由只需要少量字段时返回整个关系记录。

### 7.4 Server Action mutation 模式

将功能 mutation 放在标记为以下内容的模块中：

```ts
"use server";
```

`app/actions/admin.ts` 中的现有文章 action 展示预期顺序：

1. 要求适当会话；
2. 加载语言字典；
3. 用 Zod 解析和验证输入；
4. 规范化用户控制路径；
5. 通过共享 Prisma Client 写入；
6. 需要时更新依赖数据，如 Agent chunks；
7. 为管理变更创建审计日志；
8. 重新验证每个受影响本地化路由；
9. 返回类型化成功或错误状态。

客户端表单需要字段级或提交反馈时使用 `useActionState`。保持 action 返回类型显式且可序列化。

示例大纲：

```ts
"use server";

import { revalidateLocalizedPath } from "@/lib/i18n/revalidate";
import { requireAuthorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function updateFeatureAction(
  locale: Locale,
  _previousState: FeatureActionState,
  formData: FormData,
): Promise<FeatureActionState> {
  const session = await requireAuthorSession(locale);
  const parsed = schema.safeParse(readFormData(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  await prisma.someModel.update({
    where: { id: parsed.data.id },
    data: { value: parsed.data.value },
  });

  revalidateLocalizedPath("/admin");
  return { success: "Saved." };
}
```

使用实际字典中的消息，并在管理操作时添加审计记录。

---

## 8. 重新验证与缓存正确性

`lib/i18n/revalidate.ts` 中的共享 helper 存在，因为每个用户可见路由都有两个语言变体：

```ts
revalidateLocalizedPath("/admin/articles");
```

文章 mutation 遵循 `app/actions/admin.ts`：

- 使通用 Wiki 路由失效；
- 使旧文章路径失效；
- 如果路径变化，使新文章路径失效；
- 视情况使 admin 文章/仪表盘/分类视图失效；
- 使 `zh` 和 `en` 变体都失效。

路径变更更新时，始终重新验证旧路径和新路径。否则旧 URL 可能仍可访问陈旧页面。

用户可见资料变更时，`app/actions/settings.ts` 为每个语言重新验证 settings、wiki 和 Agent 路由。当变更影响共享 Shell 数据时遵循该模式。

不要假设更改数据库行会自动更新已渲染路由。识别受影响路径并显式重新验证。

---

## 9. 文章相关功能

文章不仅被文章页面消费。在称文章功能完成前，检查以下表面：

- `lib/articles/index.ts`：公共/管理读取；
- `app/[lang]/wiki/[[...slug]]/page.tsx`：公共渲染与元数据；
- `lib/search.ts`：公共搜索与摘要；
- `lib/wiki/tree.ts` 与 `components/wiki-sidebar.tsx`：导航树；
- `lib/agent/chunks.ts`：分块；
- `lib/agent/index.ts`：嵌入同步；
- `lib/agent/tools.ts` 与 `lib/agent/search.ts`：Agent 检索/工具；
- `lib/mcp/tools.ts`：外部只读 MCP 暴露；
- `app/sitemap.ts`：索引 URL；
- `app/actions/admin.ts`：mutation、日志和重新验证；
- `lib/articles/` 与 `scripts/` 下的导入脚本。

### 9.1 路径

规范化集中在 `lib/wiki/path.ts`：

- 规范化 Unicode 和斜杠分隔符；
- 拒绝空段、`.`、`..`、查询/片段标记和控制字符；
- 将 ASCII 大写转为小写；
- 构建链接时编码每个路径段。

存储路径使用 `canonicalizePath()`，路由段使用 `canonicalizeSlugSegments()`。不要用临时字符串替换构建文章路径。

### 9.2 文章渲染

Markdown 文章使用 `components/markdown-renderer.tsx`，支持 GFM、math/KaTeX、语法高亮、图表和自定义组件。Markdown 管道使用 sanitization，并跳过 raw HTML。

`editor === "html"` 的文章使用 `components/wiki-html-renderer.tsx` 和 `dangerouslySetInnerHTML`。将其视为可信、管理员创建的内容。不要在没有显式 sanitization 策略的情况下将不可信用户输入路由到 HTML 编辑器路径。

### 9.3 嵌入

文章创建/更新/状态 action 调用 `lib/agent/index.ts` 中的 `safeSyncArticleEmbeddingsForArticleId()`。

- 未发布文章移除 chunks；
- 已发布文章在 Agent 配置时分块并嵌入；
- 嵌入失败由安全包装器记录，因此可选 Agent provider 不一定阻止内容 mutation；
- `pnpm agent:index` 重新索引所有已发布文章。

ParadeDB 迁移当前定义 `vector(1024)`。更改嵌入 provider 时保持以下对齐：

1. `OPENAI_EMBEDDING_MODEL` 或 gateway model；
2. `AGENT_EMBEDDING_DIMENSIONS`；
3. 迁移的 `vector(N)` 列；
4. 现有存储向量和索引。

---

## 10. API 端点

当功能需要为浏览器、外部服务或非 React 客户端提供 HTTP 接口时，在 `app/api/` 下使用 Route Handler。

推荐结构：

1. 解析 URL、headers 或 body；
2. 用 Zod 或等价物验证所有用户控制输入；
3. 显式认证和授权；
4. 调用 `lib/` 下的领域函数；
5. 返回稳定的 JSON 或 stream 形状；
6. 将预期失败映射为有意 HTTP 状态码；
7. 避免暴露堆栈、凭据、SQL 或 provider 内部。

普通 JSON 使用 `NextResponse.json()`。流式端点遵循 `lib/agent/route.ts` 或 `app/api/mcp/route.ts` 中的 SSE 实现，并设置显式 `Content-Type` 和 no-store/cache headers。

动态路由参数是 Promise。示例：

```ts
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const canonicalPath = path.join("/");
  // ...
}
```

公共文章 API 应在领域查询中过滤已发布内容，而不仅在 UI 中过滤。

---

## 11. 管理后台功能

### 11.1 服务端

- 将页面放在 `app/[lang]/admin/`；
- 让 `app/[lang]/admin/layout.tsx` 提供 author 级 Shell 保护；
- 在仅 Root 页面和 action 中添加 `requireRootSession()`；
- 将可复用读取放在 `lib/admin.ts` 或相关领域模块；
- 为管理 mutation 添加 `LogAction` 和字典标签；
- 重新验证受影响 admin 和公共路径。

### 11.2 导航

更新 `components/app-sidebar.tsx` 以添加 admin 导航。侧边栏对 root 用户和 author 有不同项目集，因此决定哪些角色应看到新项目。使用本地化 URL 和翻译标签。

### 11.3 UI

复用 `components/ui/` 原语，而不是引入第二套组件系统。现有 admin 页面使用 `Card`、`Table`、`Badge`、`Button`、分页组件，以及 `app/globals.css` 中的共享 CSS 类，如 `surface-panel`、`admin-card`、`select-native`。

将数据加载保留在服务端页面。对话框、乐观状态、剪贴板操作或基于 fetch 的管理屏幕使用客户端组件。

### 11.4 MCP Key 授权注意

MCP Key 页面位于 author 保护的 admin shell 内，但其 API Handler 当前检查已认证用户，并操作该用户的 keys，而不是显式要求 `ROOT`。仅在确实打算按用户管理 keys 时保留该行为；否则一致地收紧页面和 API Handler。

---

## 12. 搜索、Agent 与 MCP

### 12.1 公共搜索

`lib/search.ts` 同时支撑全局搜索 Server Action（`app/actions/search.ts`）和 `GET /api/search`。

回退顺序：

1. `pg_search` 可用时使用 ParadeDB BM25；
2. PostgreSQL `pg_trgm` 相似搜索；
3. Prisma 字符串匹配和应用层评分。

只搜索已发布文章。结果包含 score、match field 和纯文本摘要。

添加可搜索文章字段时：

- 更新相关 SQL 查询和回退查询；
- 考虑 ParadeDB 索引和迁移；
- 更新结果类型和摘要；
- 实际可行时为扩展和回退行为添加测试。

### 12.2 Wiki Agent

Agent HTTP 边界是 `app/api/agent/route.ts`，请求/流行为在 `lib/agent/route.ts`。浏览器 UI 是 `components/wiki-agent.tsx`。

运行时划分：

| 文件 | 职责 |
| --- | --- |
| `lib/agent/openai.ts` | OpenAI 兼容聊天/嵌入调用与流解析 |
| `lib/agent/graph.ts` | LangGraph QA 工作流 |
| `lib/agent/tools.ts` | 六个只读 LangChain 工具 |
| `lib/agent/search.ts` | 语义/向量/词法检索与回退 |
| `lib/agent/chunks.ts` | 标题感知分块与余弦相似度 |
| `lib/agent/index-core.ts` | provider 无关嵌入同步 |
| `lib/agent/index.ts` | Prisma 支持索引与重试逻辑 |
| `lib/agent/message-state.ts` | 空流和错误消息处理 |
| `types/agent.ts` | 共享 stream 和 tool-event 类型 |

除非产品和安全模型明确改变，否则 Agent 新增应保持只读。在 `lib/agent/tools.ts` 添加工具，定义 Zod schema，仅返回已发布内容，并在 UI 应表示时更新 tool-event 标签/摘要。

Agent 端点返回 SSE 事件，例如：

- `sources`；
- `delta`；
- `tool`；
- `done`；
- `error`。

如果添加事件，更新服务端 emitter 和 `components/wiki-agent.tsx` 中的 `readAgentEventStream()`，并添加测试。

### 12.3 MCP 集成

#### 12.3.1 概述

建大百科提供 MCP（Model Context Protocol）接口，允许外部 AI 平台（如社团 AI）通过标准 MCP 协议查询百科知识库内容。

- **传输协议**：MCP over SSE（JSON-RPC 2.0）
- **协议版本**：2024-11-05
- **鉴权方式**：Bearer Token（API Key）
- **限流**：每 Key 每小时 200 次调用
- **接口地址**：`/api/mcp`
- **生产示例**：`https://baike.xauat.site/api/mcp`

> 注意：当前实现中 API Key 前缀为 `lkw_`。旧版 `MCP-INTEGRATION.md` 中有一处写为 `lwk_`，应视为笔误并更新文档。创建后以管理后台实际显示为准。

#### 12.3.2 LobeHub 配置步骤

1. 登录建大百科管理后台：`https://baike.xauat.site/zh/admin/mcp-keys`
2. 点击「创建新 Key」
3. 填写 Key 名称（如「社团AI调用」）
4. 创建后复制完整 Key，**仅显示一次**
5. 登录社团 AI 平台（如 LobeHub）
6. 进入 MCP 服务管理页面
7. 选择「SSE 模式」添加新服务
8. 填写配置：

| 配置项 | 值 |
| --- | --- |
| SSE 端点地址 | `https://baike.xauat.site/api/mcp` |
| 鉴权方式 | Bearer Token |
| Token | 管理后台创建的 API Key |

9. 保存后测试连接

连接成功后，LobeHub 会自动调用 `initialize` 和 `tools/list`，可在工具列表中看到当前 6 个工具。

#### 12.3.3 MCP 协议交互流程

SSE 模式（推荐）：

```text
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

直返模式（兼容）：也支持直接 POST 不建 SSE 连接，响应直接在 HTTP body 返回：

```bash
curl -X POST https://baike.xauat.site/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

#### 12.3.4 MCP 工具详情

当前工具列表以代码为准：

| 工具名 | 功能 | 必填参数 |
| --- | --- | --- |
| `search_wiki` | 全文搜索文章 | `query` |
| `get_article` | 获取文章详情 | `path` |
| `list_wiki_tree` | 获取文章目录树 | 无 |
| `list_recent_articles` | 最近更新文章 | 无 |
| `get_related_articles` | 相关文章推荐 | `path` |
| `list_categories` | 分类统计 | 无 |

> 旧总结文档中写为 `get_categories`，当前实现和对接文档使用 `list_categories`。更新文档时应统一为 `list_categories`。

##### `search_wiki`

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
| --- | --- | --- | --- |
| query | string | 是 | 搜索关键词 |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页数量，默认 10，最大 50 |

##### `get_article`

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
| --- | --- | --- | --- |
| path | string | 是 | 文章路径（如 `home`、`学校/简介`） |

##### `list_wiki_tree`

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

##### `list_recent_articles`

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
| --- | --- | --- | --- |
| limit | number | 否 | 返回数量，默认 10，最大 50 |

##### `get_related_articles`

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
| --- | --- | --- | --- |
| path | string | 是 | 文章路径 |
| limit | number | 否 | 返回数量，默认 5，最大 20 |

##### `list_categories`

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

#### 12.3.5 MCP 安全约束

- 所有工具只返回 **已发布（PUBLISHED）** 的文章；
- 不暴露 Agent/AI 相关能力；
- 不暴露任何写操作（创建/删除/修改文章、用户管理）；
- 不复用前端缓存，每次请求直接查数据库；
- 错误响应不暴露内部堆栈信息；
- 所有调用记录审计日志。

#### 12.3.6 MCP 错误处理

| HTTP 状态码 | MCP 错误码 | 说明 |
| --- | --- | --- |
| 401 | -32001 | 未提供或无效的 API Key |
| 429 | -32002 | 超出限流（含 resetAt 时间） |
| 400 | -32700 | JSON 解析错误 |
| 200 | -32601 | 未知方法 |
| 200 | -32602 | 参数校验失败 |
| 200 | -32603 | 内部错误 |

#### 12.3.7 MCP 部署运维

环境变量：

```env
# 全局 MCP API Key（可选，与用户级 Key 并行）
MCP_SERVER_API_KEY=
# 限流：每小时最大调用次数
MCP_RATE_LIMIT=200
```

数据库迁移：

```bash
pnpm prisma migrate deploy
# 或
npx prisma migrate deploy
```

监控：

- 调用日志存储在 `mcp_call_logs` 表；
- 管理后台 `/admin/mcp-keys` 可查看每个 Key 的调用次数和最后使用时间；
- 每个 Key 可单独配置限流，也可在创建后撤销。

#### 12.3.8 MCP 本地开发测试

```bash
# 启动开发服务器
pnpm dev
# 或
node node_modules/next/dist/bin/next dev

# 运行基础测试（历史文档：18 项）
node scripts/test-mcp-full.mjs

# 运行 SSE 增强测试（历史文档：14 项）
node scripts/test-mcp-sse-advanced.mjs
```

> 注意：`FEATURE-DEVELOPMENT.md` 指出，历史文档引用的 `scripts/test-mcp-full.mjs` 和 `scripts/test-mcp-sse-advanced.mjs` 可能不在当前 tracked 脚本列表中。运行前先确认脚本是否存在。

#### 12.3.9 MCP 支持模块

- `app/api/mcp/route.ts`：MCP 传输入口；
- `lib/mcp/auth.ts`：Bearer-token 认证；
- `lib/mcp/api-keys.ts`：key 生成、哈希、验证、撤销、使用日志；
- `lib/mcp/rate-limit.ts`：内存每小时限流器；
- `lib/mcp/server.ts`：JSON-RPC/MCP 分发；
- `lib/mcp/tools.ts`：只读工具；
- `lib/mcp/errors.ts`：协议错误与响应。

服务器支持 SSE 会话、直接 POST 响应、JSON-RPC 批处理、心跳和重连元数据。session map 和 rate limiter 是进程本地的；多实例部署需要共享存储，如 Redis 或协调的 pub/sub 层。

永远不要通过 MCP 暴露草稿、写操作、用户管理、内部 Agent 控制、API Key 明文或数据库/provider 错误。

---

## 13. 内容导入与图片托管

### 13.1 Markdown 导入

导入实现是 `lib/articles/import.ts`，命令入口是 `scripts/import-articles.ts`。

支持的 frontmatter 字段：

- `title`；
- `description`；
- `published`；
- `date`；
- `tags`；
- `editor`；
- `dateCreated`（被支持键列表识别，但发布行为主要由 `date` 驱动）。

`index.md` 映射到所在路径。第一个 H1 可提供标题，并从存储 Markdown 中移除。查找前路径会被规范化。

命令：

```bash
pnpm articles:import -- articles
pnpm articles:import -- articles --dry-run
pnpm articles:import -- articles --status=draft
```

导入脚本在导入后重新索引已发布 Agent 嵌入。`scripts/import-scraped.ts` 是单独的旧版/导入路径，不应假设具有相同的后处理。

### 13.2 图片托管

文章编辑器调用 `POST /api/uploads/images`，实现于 `app/api/uploads/images/route.ts`。存储行为在 `lib/image-hosting.ts`：

- 存在 `BLOB_READ_WRITE_TOKEN` 时选择 Vercel Blob；
- 否则使用 S3 兼容配置；
- 允许的图片类型和上传大小在服务端验证；
- 返回 URL 根据编辑器模式插入 Markdown 或 HTML。

该路由当前使用 `canWriteArticles()`，因此 `ROOT` 和 `AUTHOR` 可上传。如果改变，保持文档和授权行为同步。

本地图片引用的导入 Markdown 在文章导入前运行图片重写：

```bash
pnpm articles:import-images -- articles
pnpm articles:import -- articles
```

两个命令都支持 `--dry-run`。

---

## 14. 样式与 UI 约定

Tailwind CSS 4 和 shadcn/Radix 风格原语由以下配置：

- `components.json`；
- `app/globals.css`；
- `postcss.config.mjs`。

导入别名：

- `@/components`；
- `@/components/ui`；
- `@/lib`；
- `@/hooks`。

优先使用现有原语和 CSS 变量。条件类名使用 `lib/utils.ts` 的 `cn()`。保持项目的响应式和暗色模式模式：

- 语义颜色变量，如 `bg-background`、`text-foreground`、`border-border`；
- 组件需要显式暗色行为时使用 `dark:` 变体；
- 与附近屏幕一致的圆角卡片和响应式布局；
- 交互控件具有可访问标签和键盘行为。

新 UI 组件检查 `.agents/skills/` 和 `.claude/skills/` 下的仓库本地 shadcn 与 UI skills。不要在没有检查现有原语是否已提供行为的情况下，将组件复制到 `components/ui/`。

---

## 15. 测试与验证

测试使用 Node 内置测试运行器和 `tsx`，不是 Jest、Vitest、Playwright 或 Cypress。

运行：

```bash
pnpm test
pnpm lint
pnpm build
```

当前测试覆盖：

- 路径规范化与 Wiki 树构建；
- 文章导入/frontmatter 与图片导入；
- Markdown 渲染；
- 认证 provider 配置与错误映射；
- 权限规则；
- 语言 proxy 行为；
- Prisma 重连逻辑；
- Agent 分块、索引、工具、图、OpenAI helper 和 SSE 路由行为；
- 图片托管；
- i18n。

### 15.1 测试模式

新领域行为优先使用纯函数和依赖注入。Agent 和文章导入模块接受 repository 或 provider 函数，因此测试不总是需要实时数据库或模型 provider。

新功能在最低有用层测试，并在边界本身重要时添加 HTTP/页面级测试：

- 路径和规范化规则：纯单元测试；
- 查询和 mutation 编排：注入 repository 测试或 Prisma 集成测试；
- API 验证和状态码：Route Handler 测试；
- SSE 变更：解析发出的事件流；
- 权限：显式角色/验证矩阵；
- 本地化 UI：字典键和路由构建。

最终验证至少：

1. `pnpm lint`；
2. `pnpm test`；
3. 变更影响路由、导入、配置或客户端/服务端边界时运行 `pnpm build`；
4. schema 变更时对数据库运行相关迁移；
5. 功能面向用户时检查 `zh` 和 `en` 路由。

---

## 16. 常见陷阱与已知同步差距

1. **环境模板缺失。** `README.md` 说复制 `.env.example`，但当前仓库未跟踪该文件。保持 README、源码引用和部署配置同步。
2. **MCP 文档有过时细节。** 实现使用 key 前缀 `lkw_`，而 `docs/MCP-INTEGRATION.md` 某处写 `lwk_`。实现使用 `list_categories`，旧总结提到 `get_categories`。更改 MCP 行为时更新集成文档。
3. **旧 MCP 测试脚本引用可能过时。** 历史文档提到 `scripts/test-mcp-full.mjs` 和 `scripts/test-mcp-sse-advanced.mjs`，它们不在当前 tracked 脚本列表中。
4. **站点设置现在由环境驱动。** `20260922000000_add_site_settings` 迁移之后是 `20260924120000_drop_site_settings`；使用 `lib/site.ts` 和 `SITE_*` 变量，不要在没有深思设计决策的情况下添加新的数据库设置。
5. **嵌入维度必须匹配。** 迁移使用 `vector(1024)`，而不同嵌入模型可能产生其他维度。一起重新配置模型、环境、迁移和存储数据。
6. **Proxy 只是 Cookie 门。** 带有陈旧或无效会话 Cookie 的请求仍会到达页面；服务端守卫仍然强制。
7. **HTML 文章是可信内容。** `WikiHtmlRenderer` 使用 `dangerouslySetInnerHTML`；不要将其视为已 sanitize 的 Markdown。
8. **MCP 限流是进程本地的。** 当前内存限流器不跨实例或重启共享。
9. **MCP Key API 是按用户而非显式 root-only。** 在扩展或限制它们之前确认所需授权策略。
10. **图片上传文档可能与代码分歧。** 当前代码允许 author 和 root 用户，而一些 README 措辞说 root-only。
11. **部分认证 UI 链接指向当前树中不存在的路由。** 添加或复用密码重置、条款、隐私页面等链接前检查现有路由文件。
12. **被忽略的 `articles/` 目录可能不存在。** 规范生产内容是数据库驱动的；导入 fixture 可能需要单独提供。
13. **MCP 总结中的 Agent 状态可能过时。** `MCP-SUMMARY.md` 提到 Agent 已欠费停用；实际能力以当前部署为准。

---

## 17. 功能实现清单

复制到 issue 或 PR 描述中。

### 设计与放置

- [ ] 功能是公共页面、管理页面、Server Action、Route Handler、领域模块、导入脚本还是集成？
- [ ] 行为是否在最近的现有 `lib/` 领域模块中，而不是在页面或组件中重复？
- [ ] 功能需要仅服务端代码还是客户端边界？
- [ ] 是否已检查 `node_modules/next/dist/docs/` 下相关的 Next.js 16 文档？

### 路由与 i18n

- [ ] `params` 和 `searchParams` 是否已 await？
- [ ] `lang` 是否用 `hasLocale()` 验证？
- [ ] 所有内部链接是否用 `localizeHref()` 或 `buildWikiHref()` 构建？
- [ ] 字符串是否同时存在于 `zh.ts` 和 `en.ts`？
- [ ] 是否在适当位置添加元数据和 sitemap 覆盖？

### 安全与授权

- [ ] 每个 mutation 或 API 端点是否独立于 UI/proxy 认证？
- [ ] 是否使用正确的 `ROOT`、`AUTHOR` 或已验证用户守卫？
- [ ] 所有外部输入是否验证并有界？
- [ ] 公共响应是否排除草稿、密钥、堆栈和内部 provider 细节？
- [ ] 如果涉及 HTML，信任/sanitization 边界是否明确？

### 数据与一致性

- [ ] Prisma schema 是否更新了适当索引和关系？
- [ ] 是否新增迁移而不是编辑旧迁移？
- [ ] 是否运行 `prisma generate`？
- [ ] 如果文章数据变更，是否考虑搜索、Agent、MCP、sitemap、树和导入消费者？
- [ ] 路径变更时是否重新验证旧路径和新路径？
- [ ] 是否重新验证所有受影响本地化路径？
- [ ] 管理 mutation 是否在适当时候记录日志？

### 验证

- [ ] 是否添加单元或边界测试？
- [ ] `pnpm lint` 是否通过？
- [ ] `pnpm test` 是否通过？
- [ ] 相关时 `pnpm build` 是否通过？
- [ ] UI 功能是否在明/暗模式和两种支持语言中检查？
- [ ] 环境、迁移和部署说明是否更新？

---

## 18. 关键文件索引

### 应用与路由

- `proxy.ts`
- `app/[lang]/layout.tsx`
- `app/[lang]/wiki/[[...slug]]/page.tsx`
- `app/[lang]/admin/layout.tsx`
- `app/sitemap.ts`
- `next.config.ts`
- `tsconfig.json`

### 认证与权限

- `lib/auth/index.ts`
- `lib/auth/session.ts`
- `lib/auth/permissions.ts`
- `lib/auth/provider-config.ts`
- `app/api/auth/[...all]/route.ts`

### 数据库与 mutation

- `prisma/schema.prisma`
- `prisma/migrations/`
- `prisma/seed.ts`
- `lib/prisma.ts`
- `app/actions/admin.ts`
- `app/actions/comments.ts`
- `app/actions/settings.ts`
- `lib/i18n/revalidate.ts`

### 文章、路径与渲染

- `lib/articles/index.ts`
- `lib/articles/import.ts`
- `lib/articles/image-import.ts`
- `lib/articles/markdown-migrate.ts`
- `lib/wiki/path.ts`
- `lib/wiki/tree.ts`
- `components/markdown-renderer.tsx`
- `components/wiki-html-renderer.tsx`
- `components/article-editor.tsx`

### 搜索、Agent 与 MCP

- `lib/search.ts`
- `app/api/search/route.ts`
- `lib/agent/openai.ts`
- `lib/agent/graph.ts`
- `lib/agent/tools.ts`
- `lib/agent/search.ts`
- `lib/agent/index.ts`
- `app/api/agent/route.ts`
- `components/wiki-agent.tsx`
- `app/api/mcp/route.ts`
- `lib/mcp/server.ts`
- `lib/mcp/tools.ts`
- `lib/mcp/auth.ts`
- `lib/mcp/api-keys.ts`
- `lib/mcp/rate-limit.ts`
- `docs/MCP-INTEGRATION.md`

### MCP 开发新增文件（据 MCP 总结）

- `app/api/mcp/route.ts`
- `lib/mcp/server.ts`
- `lib/mcp/tools.ts`
- `lib/mcp/auth.ts`
- `lib/mcp/api-keys.ts`
- `lib/mcp/rate-limit.ts`
- `lib/mcp/errors.ts`
- `app/api/admin/mcp-keys/route.ts`
- `app/api/admin/mcp-keys/[id]/route.ts`
- `app/[lang]/admin/mcp-keys/page.tsx`
- `scripts/test-mcp*.mjs`（4 个，部分可能已过时）
- `scripts/scrape-articles.mjs`
- `scripts/import-scraped.ts`
- `prisma/migrations/20260914000000_add_mcp_tables/migration.sql`

---

## 19. 开发者命令

`package.json` 中定义：

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm test
pnpm articles:migrate
pnpm articles:import-images
pnpm articles:import
pnpm articles:transform-links
pnpm agent:index
pnpm db:seed
```

数据库相关：

```bash
pnpm prisma generate
pnpm prisma migrate dev --name describe_the_change
pnpm prisma migrate deploy
```

本地 MCP 测试（历史脚本，运行前确认存在）：

```bash
node scripts/test-mcp-full.mjs
node scripts/test-mcp-sse-advanced.mjs
```

---

## 20. 附录：MCP 开发总结

> 来源：`MCP-SUMMARY.md`。以下为项目过程总结，具体实现以当前代码为准。

### 20.1 负责人与时间

- 负责人：陈智祥
- 截止：10 月 10 日
- 当前日期：9 月 21 日

### 20.2 已完成工作

#### 本地环境搭建

- 拉取 GitHub 上的 LuckyWiki 代码并完整跑起来；
- PostgreSQL 17 安装在 `D:\PostgreSQL`，端口 5432；
- 创建 `luckywiki` 数据库，7 张表；
- `pnpm install`，1270 个包；
- 种子数据：Root 管理员账号 + Home 文章；
- 从 `baike.xauat.site` 抓取 280 篇真实文章导入本地；
- 开发服务器 `localhost:3000` 正常运行。

#### MCP 接口开发

在百科后端新增 MCP 模块，外部 AI 可通过标准 MCP 协议查询百科内容。

新增代码文件（16 个）：

| 文件 | 用途 |
| --- | --- |
| `app/api/mcp/route.ts` | MCP 接口入口，处理 SSE 连接和请求 |
| `lib/mcp/server.ts` | MCP 核心逻辑，JSON-RPC 2.0 协议处理 |
| `lib/mcp/tools.ts` | 6 个工具的具体实现 |
| `lib/mcp/auth.ts` | 鉴权，验证 API Key |
| `lib/mcp/api-keys.ts` | API Key 生成、校验、管理 |
| `lib/mcp/rate-limit.ts` | 限流，每小时 200 次 |
| `lib/mcp/errors.ts` | 错误处理，不暴露内部堆栈 |
| `app/api/admin/mcp-keys/route.ts` | 管理后台 API（创建 Key） |
| `app/api/admin/mcp-keys/[id]/route.ts` | 管理后台 API（撤销 Key） |
| `app/[lang]/admin/mcp-keys/page.tsx` | 管理后台 Key 管理页面 |
| `scripts/test-mcp*.mjs`（4 个） | 测试脚本 |
| `scripts/scrape-articles.mjs` | 从线上抓文章脚本 |
| `scripts/import-scraped.ts` | 导入文章脚本 |

#### 修复的原有 Bug

| 文件 | 问题 | 修复方式 |
| --- | --- | --- |
| `hooks/use-mobile.ts` | Wiki 页面水合错误 | 初始值固定为 `false`，mount 后再检测 |
| `components/theme-switcher.tsx` | 主题切换水合错误 | 加 mounted 守卫 |
| `components/locale-switcher.tsx` | 语言切换水合警告 | 加 `suppressHydrationWarning` |
| `app/[lang]/wiki/[[...slug]]/page.tsx` | 访问 `/zh/wiki` 显示“文章不存在” | 自动跳转到 `/zh/wiki/home` |

#### 配置文件

| 文件 | 说明 |
| --- | --- |
| `prisma/migrations/20260914000000_add_mcp_tables/migration.sql` | 建 `mcp_api_keys` 和 `mcp_call_logs` 两张表 |
| `.env.example` | 环境变量模板，包含 MCP 相关变量 |
| `.gitignore` | 排除 `.pnpm-store/` 和 `articles-scraped/` |

### 20.3 改动原有代码

共改动 8 个原有文件，均为小改动：

| 文件 | 改动量 | 内容 |
| --- | --- | --- |
| `prisma/schema.prisma` | +46 行 | 追加 `McpApiKey` 和 `McpCallLog` 两个模型（未动原有模型） |
| `components/app-sidebar.tsx` | +11 行 | 侧边栏加“MCP Keys”菜单入口 |
| `app/[lang]/wiki/[[...slug]]/page.tsx` | 改 3 行 | `/zh/wiki` 自动跳转 home |
| `hooks/use-mobile.ts` | 重写 13 行 | 修复水合错误 |
| `components/theme-switcher.tsx` | +4 行 | 修复水合错误 |
| `components/locale-switcher.tsx` | +1 行 | 修复水合警告 |
| `package.json` | +1 行 | 加 `packageManager` 字段 |
| `pnpm-workspace.yaml` | +9 行 | pnpm 安装时自动生成 |

原有业务逻辑未被破坏，所有改动均为新增功能或修 Bug。

### 20.4 MCP 提供的能力

#### 6 个只读工具

| 工具 | 功能 | 举例 |
| --- | --- | --- |
| `search_wiki` | 全文搜索 | 搜“校园卡”返回相关文章列表 |
| `get_article` | 获取文章详情 | 传 `path="home"` 返回完整 Markdown 内容 |
| `list_wiki_tree` | 获取目录树 | 返回所有已发布文章层级结构 |
| `list_recent_articles` | 最近更新 | 返回最近改过的文章 |
| `get_related_articles` | 相关文章 | 传一篇文章返回相关文章 |
| `list_categories` | 分类统计 | 返回每个分类有多少篇文章 |

> 旧总结中写为 `get_categories`，当前实现为 `list_categories`。

#### 安全约束

- 只返回 **已发布** 的文章，草稿看不到；
- 不暴露 Agent；
- 不暴露任何写操作；
- 不复用前端缓存，每次直接查数据库；
- 错误信息不暴露内部堆栈；
- 所有调用都记审计日志。

#### 技术规格

| 项 | 值 |
| --- | --- |
| 传输协议 | MCP over SSE（JSON-RPC 2.0） |
| 协议版本 | 2024-11-05 |
| 鉴权 | Bearer Token（API Key） |
| 限流 | 每 Key 每小时 200 次 |
| 接口地址 | `/api/mcp` |
| 测试 | 历史记录：32 项全部通过（18 基础 + 14 SSE 增强） |

### 20.5 使用方式

给社团 AI 用：

1. 管理员登录 `https://baike.xauat.site/zh/admin/mcp-keys`；
2. 创建 API Key，复制保存；
3. 在社团 AI（LobeHub）添加 MCP 服务：
   - SSE 地址：`https://baike.xauat.site/api/mcp`
   - 鉴权：Bearer Token
   - Token：刚才创建的 Key
4. 连接成功后即可使用。

管理 API Key：

- 管理后台 `/admin/mcp-keys` 可创建、查看、撤销 Key；
- 每个 Key 可单独配置限流；
- 可查看每个 Key 的调用次数和最后使用时间。

### 20.6 待办事项

必须做（阻塞上线）：

| # | 事项 | 说明 |
| --- | --- | --- |
| 1 | 跟李哥确认社团 AI 的正确地址 | 之前问 `gpt.xauat.site` 他说不是，还需确认 |
| 2 | 部署到测试环境 | 李哥说可以给部署一个，数据跟生产一样 |
| 3 | 实际联调 | 部署后跟 LobeHub 实际对接跑通 |

可后续做（不阻塞）：

| # | 事项 | 说明 |
| --- | --- | --- |
| 4 | 限流改 Redis | 目前内存限流，单实例够用，多实例需要 Redis |
| 5 | SSE 会话改 Redis Pub/Sub | 多实例部署时需要 |
| 6 | MCP 工具增加更多能力 | 如果 6 个不够可加 |

不需要做：

- Agent 相关：李哥明确说不碰；
- OIDC 鉴权：已确认用 Bearer Token；
- 新建独立微服务：已确认嵌入后端。

### 20.7 时间线回顾

| 时间 | 完成的事 |
| --- | --- |
| 9.13 | 代码拉取、PostgreSQL 安装、数据库创建、依赖安装、服务器跑通 |
| 9.14 | MCP 模块开发（6 工具 + 鉴权 + 限流 + 审计日志 + 管理后台）、线上 280 篇文章导入、SSE 增强、Bug 修复 |
| 9.14 | 32 项测试全部通过、迁移文件生成、对接文档编写 |
| 9.21 | 限流改为每小时 200 次、生成完整说明文档 |
| 待定 | 跟李哥确认社团 AI 地址 → 部署测试环境 → 联调 → 正式上线 |

### 20.8 关键文件索引

| 文件 | 用途 |
| --- | --- |
| `docs/MCP-INTEGRATION.md` | 给社团 AI 配置用的详细说明 |
| `.env.example` | 环境变量模板 |
| `prisma/migrations/20260914000000_add_mcp_tables/migration.sql` | 部署时执行 `prisma migrate deploy` |

---

## 结语

本文是 LuckyWiki 功能开发、MCP 集成、部署运维与项目总结的综合参考。新增功能时，优先遵循仓库现有模式：服务端默认、显式授权、领域模块复用、Zod 输入验证、Prisma 迁移、审计日志、本地化字典完整、显式缓存重新验证，以及在最低有用层测试。MCP 相关变更还需同步更新 `docs/MCP-INTEGRATION.md`，并确保只暴露已发布、只读、经过审计的百科内容。