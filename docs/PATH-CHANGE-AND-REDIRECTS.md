# 动态修改子路径与重定向（实现说明 + 本地验证）

> 对应文档：`PRD-动态修改子路径与重定向.md`、`功能需求清单-动态修改子路径与重定向.md`
> 实现日期：2026-11-13

## 1. 行为概览

- **改路径 = 移动**：单篇移动会级联移动整棵 `path` 前缀子树（含草稿、已发布、已归档）。
- **旧地址永久重定向**：每个被移动路径写入一条 `article_redirects(old_path → article_id)`。只存旧路径，跳转目标永远是文章**当前** `path`，所以 `x → y → z` 不会产生多跳链。
- **HTTP 层 308**：`proxy.ts` 在渲染前查询重定向表并返回真实 `308`（保留 locale、query）。
- **归档 → 410**：归档文章本身或重定向目标为归档时返回 `410 Gone`；草稿不会泄漏存在性（页面按不存在处理）。
- **路径复用优先**：新建/导入/保存把文章放到某个旧路径时，删除该路径的重定向；重定向永远让位于当前文章。
- **站内链接重写（默认开启）**：Markdown / HTML 正文里指向旧路径的链接会被改写到新路径，保留 locale、query/hash，跳过代码块、行内代码、外链；被重写文章会生成版本快照、写审计日志、重新入队索引。
- **树/缓存/搜索/Webhook 同步**：移动后刷新侧边栏树、sitemap 数据源、文章页与后台页面缓存，重新入队嵌入索引，并派发 `article.moved`（同时为兼容订阅方保留每篇文章的 `article.updated`）。
- **审计日志**：`MOVE_ARTICLE` / `RENAME_FOLDER`，detail 含 `oldPath`、`newPath`、`movedCount`、`redirectsCreated`、`linkRewriteCount`、`source`。
- **文件夹重命名（仅 ROOT）**：`/admin/taxonomy` 的“内容结构”区域，把路径前缀整棵子树搬到新前缀；支持改名与换父级。

## 2. 数据模型

```prisma
model ArticleRedirect {
  id        String    @id @default(cuid())
  oldPath   String    @unique @map("old_path")
  articleId String    @map("article_id")
  createdAt DateTime  @default(now()) @map("created_at")
  createdBy String?   @map("created_by")
  hitCount  Int       @default(0) @map("hit_count")
  lastHitAt DateTime? @map("last_hit_at")
  article   Article   @relation(fields: [articleId], references: [id], onDelete: Cascade)

  @@index([articleId])
  @@map("article_redirects")
}
```

`LogAction` 新增 `MOVE_ARTICLE`、`RENAME_FOLDER`。迁移文件：`prisma/migrations/20261113000000_add_article_redirects/migration.sql`。

> 本仓库检出中没有 `prisma/migrations` 基线。**本地开发/验证用 `prisma db push`**；已有迁移历史的部署库用 `prisma migrate deploy`。两种方式都必须先应用 `schema.prisma` 的变更（枚举值只在 schema 里，不会由迁移 SQL 自动同步到 `db push` 之外）。

## 3. 本地启动

```bash
pnpm install

# .env（至少这些）
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/luckywiki
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<至少 32 位随机串>
NEXT_PUBLIC_APP_URL=http://localhost:3000
ROOT_EMAIL=root@luckywiki.local
ROOT_PASSWORD=ChangeMe123!
ROOT_NAME=LuckyWiki Root

# 建表（新库）
pnpm exec prisma db push
# 或已有迁移历史：
# pnpm exec prisma migrate deploy

pnpm exec prisma db seed
# 如果 Prisma 版本没有 db seed 命令，可直接执行：
# pnpm exec tsx prisma/seed.ts
pnpm dev
```

打开 `http://localhost:3000/zh/admin`，用 `ROOT_EMAIL` / `ROOT_PASSWORD` 登录。

## 4. 手工验证清单

> 更完整、可直接勾选的验收步骤（含 REST/Webhook/数据库核查与清理）见
> [`LOCAL-VERIFICATION.md`](./LOCAL-VERIFICATION.md)。下面是最小核心路径。

### 4.1 编辑器改路径（核心）

1. 后台新建文章 `guide/a`，状态“已发布”，正文里写一段。
2. 再建 `guide/a/child` 与 `guide/a/child/deep`。
3. 打开 `guide/a` 编辑页 → 右侧「文章设置」→ 把 path 改成 `guide/b` → 点保存。
4. 预期：弹出「确认修改路径」弹窗，显示：
   - 当前路径 `/guide/a` → 新路径 `/guide/b`；
   - 将移动 3 个页面（3 个已发布）；
   - 将创建 3 条重定向；
   - 可勾选「同时更新其他文章里指向旧路径的链接」（默认勾选）。
5. 取消 → 不保存；再次保存并确认 → 跳到文章列表。
6. 检查：
   - 侧边栏/树只有一个 `guide/b` 分支，`guide/a` 消失；
   - `guide/b/child`、`guide/b/child/deep` 仍存在；
   - 访问 `http://localhost:3000/zh/wiki/guide/a` → **308** 到 `/zh/wiki/guide/b`；
   - 带参数 `.../guide/a?x=1` → 308 且保留 `?x=1`；
   - `/api/v1/articles/guide/a` → 308 到 `/api/v1/articles/guide/b`。
7. 在另一篇文章正文里写 `[去子页](/zh/wiki/guide/a/child)`，重复一次移动（例如 `guide/b → guide/c`），确认该链接被改写成 `/zh/wiki/guide/c/child`，且历史版本里能看到这次重写。

### 4.2 冲突 / 保留路径 / 保护路径

- 先建 `guide/x`，再尝试把另一篇改到 `guide/x`：确认弹窗显示「目标路径已被占用」，确认按钮不可用；数据库无任何变化。
- 改到 `category/foo`：提示保留路由（category/tag）。
- 改到 `home`：提示首页文章不能移动。
- 改成当前路径的子路径（如 `guide/b/inside`）：提示不能移动到自身内部。
- 一次移动超过 200 篇：提示分批。

### 4.3 文章页「移动」对话框

文章页右上「移动」→ 输入新路径 → 点「预览影响范围」→ 显示将移动页面数、重定向数、链接更新数 → 「确认移动」。成功后跳转到新地址。

### 4.4 文件夹重命名（仅 ROOT）

1. `/zh/admin/taxonomy` → 底部「内容结构」→ 找到 `/guide`（或任意前缀）→「重命名」。
2. 输入 `manual` → 预览（影响页面数、重定向数、链接更新数）→ 确认。
3. 预期：`guide/**` 全部变成 `manual/**`（含草稿/归档），旧地址逐条 308；树里旧前缀消失。
4. 用 AUTHOR 账号访问该页/调用服务端 action：应被拒绝（页面本身要求 ROOT）。

### 4.5 草稿 / 归档

- 草稿文章移动后，旧地址应表现为“页面不存在”，**不跳转、不泄漏标题**。
- 把文章归档后访问其旧地址：`410`；归档文章自己的当前地址：`410`。
- 恢复为草稿再发布：旧地址恢复 308（最长等待 5s 解析缓存 TTL）。

### 4.6 路径复用

先把 `old/page` 移到 `new/page`（旧地址 308），再新建一篇 `old/page`：访问 `/zh/wiki/old/page` 应显示新文章，不再是 308。

### 4.7 接口

```bash
# 旧路径 308（curl 不要跟随重定向）
curl -i http://localhost:3000/api/v1/articles/guide/a

# 归档 → 410
curl -i http://localhost:3000/api/v1/articles/<archived-old-path>

# PUT 改路径（需要 MCP API Key，Authorization: Bearer <key>）
curl -X PUT http://localhost:3000/api/v1/articles/guide/b \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"path":"guide/c","rewriteLinks":true}'
# 响应包含 oldPath / movedCount / redirectsCreated / linkRewriteCount
# 目标冲突返回 409 { error, conflictPath }
```

### 4.8 日志与 Webhook

- `/zh/admin/logs`：能看到「移动文章 / 重命名文件夹」，detail 显示旧路径、新路径、移动数量、重定向数、链接更新数。
- `/zh/admin/webhooks`：勾选「移动文章」，移动后收到 `article.moved`，payload 含 `move.oldPath/newPath/movedCount/redirectsCreated/items`。

## 5. 排障

| 现象 | 排查 |
|---|---|
| 旧地址仍是 404 | 是否真的产生移动（`MOVE_ARTICLE` 日志）？`select * from article_redirects where old_path='...'`；proxy 缓存最长 5s |
| 旧地址跳错文章 | 该路径是否被新文章复用（重定向应已删除）？查 `article_redirects.old_path` 与 `articles.path` |
| 草稿地址返回 410 | 检查目标文章状态；草稿→不跳转，归档→410 |
| 移动后树没变化 | 强制刷新；确认 `ARTICLES_CACHE_TAG` 失效（Server Action 内 `updateTag`） |
| 链接没被重写 | 是否在代码块/行内代码/外链中？是否关闭了「更新链接」？候选扫描上限 500 篇 |

## 6. 本期未实现（P2）

- `/admin/redirects` 重定向管理页与命中统计（`hitCount` / `lastHitAt` 字段已预留）。
- 历史“父移子留”孤儿结构体检脚本。
- 超过 200 篇的异步移动任务（当前直接拒绝并提示分批）。
