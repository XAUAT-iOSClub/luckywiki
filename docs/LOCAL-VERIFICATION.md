# 本地检验手册：动态修改子路径与重定向

> 适用环境：本机 Windows + Docker（`paradedb` 容器）+ 已配置好的 `.env`
> 目标：在不破坏现有内容的前提下，逐条验证 PRD 的 AC（验收标准）。
> 建议所有测试文章统一使用 **`qa/` 前缀**，最后统一清理。
> 开始前可以先跑一遍第 4 节的清理，确保 `qa/` 下没有上次留下的数据（计数断言才不会对不上）。

---

## 0. 开始前：环境自检（30 秒）

```powershell
# 1) 数据库容器在跑（应输出 Up ... 0.0.0.0:5432->5432/tcp）
docker ps --filter name=paradedb

# 2) 站点在跑（应输出 200）
curl.exe -s -o NUL -w '%{http_code}\n' http://localhost:3000/zh/wiki/home
```

如果第一条不是 `Up`：

```powershell
docker start paradedb
```

如果第二条不是 `200`：

```powershell
cd C:\Users\74827\Desktop\luckywiki
pnpm dev
```

打开 **http://localhost:3000** ，用 ROOT 账号登录（`root@luckywiki.local`，密码为你原来的密码）。登录入口：`http://localhost:3000/zh/auth/sign-in`。

> 说明：`.env` 已配置为 `postgresql://postgres:postgres@localhost:5432/luckywiki`；如果换库/换端口，改 `.env` 的 `DATABASE_URL` 后重启 dev server。

---

## 1. 自动化检查（约 2 分钟）

```powershell
cd C:\Users\74827\Desktop\luckywiki
pnpm typecheck     # 期望：无输出（成功）
pnpm test          # 期望：tests 193 / pass 193 / fail 0
```

可选，验证生产构建（先停掉 dev server，避免端口冲突；构建过程会访问数据库，需保证 `paradedb` 在跑）：

```powershell
pnpm build
pnpm start         # 做完按 Ctrl+C 停止，再 pnpm dev
```

> 自动化覆盖：路径规划/冲突/保留路由/子页面级联的纯逻辑、重定向解析顺序、链接重写规则、proxy matcher、proxy 308/fail-open。
> 界面交互与真实数据库行为请继续做下面的手工验收。

### 自动化跑 F/G/H/I（可选，约 1 分钟）

仓库里带了脚本 [`scripts/verify-path-change.mjs`](../scripts/verify-path-change.mjs)，用真实 HTTP + 临时夹具跑 F/G/H/I，并自动清理：

```powershell
cd C:\Users\74827\Desktop\luckywiki
$env:ROOT_EMAIL = "root@luckywiki.local"   # 你的 ROOT 账号
$env:ROOT_PASSWORD = "你的密码"
node scripts/verify-path-change.mjs
# 期望：ALL 26 CHECKS PASSED (fixtures cleaned up)
```

说明：

- 需要 Node 20+、`paradedb` 容器可访问（脚本用 `docker exec psql` 做了两件事：模拟发布草稿、核对重定向行）；
- 只会创建/删除 `qa-verify-<时间戳>/` 前缀的数据，以及临时 API Key / Webhook；
- **不覆盖场景 E**（文件夹重命名入口在 UI 里，需按下面手工步骤验证）；
- 失败时会保留本次前缀的数据并输出失败项，便于排查。

---

## 2. 手工验收（按场景执行）

> 各场景默认按顺序执行；**场景 E 会把整个 `qa/guide` 改名为 `qa/manual`**，所以 E 之后的示例路径会随之变化（用你界面里看到的当前路径替换即可）。
> 如果想完全独立验证，建议每个场景单独建一套 `qa/<场景>/...` 路径，做完就清理。
> 每一步的“预期”就是 PRD 的验收标准，括号里是 AC 编号。

### 场景 A：编辑器改路径 + 级联 + 旧地址 308（AC-1/2/3/4/7）

1. 后台 → 文章 → 「创建文章」，新建并发布：
   - `qa/guide/a`（标题随意，正文写点内容）
   - `qa/guide/a/child`
   - `qa/guide/a/child/deep`
   > 新建时在编辑器右侧「文章设置」里填路径，状态选「已发布」，点右上「保存更改」。
2. 打开 `qa/guide/a` 的编辑页 → 「文章设置」→ 把路径改成 `qa/guide/b` → 点「保存更改」。
3. **预期 1（弹出确认框）**：出现「确认修改路径」弹窗，显示
   - 当前路径 `/qa/guide/a` → 新路径 `/qa/guide/b`
   - 「将移动 3 个页面（3 个已发布）」
   - 「将创建 3 条重定向」
   - 一个默认勾选的「同时更新其他文章里指向旧路径的链接」
4. 点「确认移动」，回到文章列表。
5. **预期 2（树）**：打开任意 Wiki 页面看左侧树（或刷新首页）：`qa/guide/b` 下面有 `child` 和 `child/deep`，`qa/guide/a` 节点消失。
6. **预期 3（旧地址 308）**：

   ```powershell
   curl.exe -s -o NUL -w '%{http_code} %{redirect_url}\n' http://localhost:3000/zh/wiki/qa/guide/a
   # 期望：308 http://localhost:3000/zh/wiki/qa/guide/b
   ```

7. **预期 4（query 保留）**：

   ```powershell
   curl.exe -s -o NUL -w '%{http_code} %{redirect_url}\n' 'http://localhost:3000/zh/wiki/qa/guide/a?x=1'
   # 期望：308 .../zh/wiki/qa/guide/b?x=1
   ```

8. **预期 5（en 侧子页面）**：

   ```powershell
   curl.exe -s -o NUL -w '%{http_code} %{redirect_url}\n' http://localhost:3000/en/wiki/qa/guide/a/child
   # 期望：308 .../en/wiki/qa/guide/b/child
   ```

9. **预期 6（数据库无残留）**：

   ```powershell
   docker exec paradedb psql -U postgres -d luckywiki -t -A -c "select count(*) from articles where path like 'qa/guide/a%'"
   # 期望：0
   ```

10. **预期 7（多次移动无跳转链）**：再把 `qa/guide/b` 改到 `qa/guide/c`（重复步骤 2），然后：

    ```powershell
    curl.exe -s -o NUL -w '%{http_code} %{redirect_url}\n' http://localhost:3000/zh/wiki/qa/guide/a
    # 期望：一次 308 直接到 .../qa/guide/c（不是先到 b 再到 c）
    ```

### 场景 B：冲突 / 保留路由 / 保护路径（AC-5/16）

1. 新建并发布 `qa/guide/taken`。
2. 打开另一篇（例如 `qa/guide/c`）的编辑页，把路径改成 `qa/guide/taken` → 保存。
   **预期**：弹窗显示目标路径已被占用（含冲突路径），「确认移动」不可点；数据库里该文章路径仍是 `qa/guide/c`。
3. 把 path 改成 `category/x` → **预期**：提示这是系统保留路由。
4. 把 path 改成 `home` → **预期**：提示首页文章（home）不能移动。
5. 把 path 改成 `qa/guide/c/inside` → **预期**：提示页面不能移动到自身内部。
6. 在 `/zh/admin/taxonomy` → 「内容结构」里找到 `/home` → 「重命名」→ 输入 `qa/home2` → 预览。
   **预期**：提示首页文章不能移动（AC-16）。

### 场景 C：文章页「移动」对话框（PRD 6.2）

1. 打开 `http://localhost:3000/zh/wiki/qa/guide/c`（已登录）。
2. 右上角「移动」→ 输入 `qa/guide/d` → 点「预览影响范围」。
   **预期**：弹窗变为「确认移动页面」，显示「将移动 N 个页面」「将创建 N 条重定向」、链接更新数与勾选项。
3. 点「返回修改」→ 弹窗回到输入框，**没有发生移动**（刷新页面确认路径仍是 c）。
4. 再预览 → 点「确认移动」→ **预期**：跳到新地址 `/zh/wiki/qa/guide/d`，旧地址 308。

### 场景 D：站内链接重写（AC-11）

> ⚠️ **这条最容易误判**：代码保护只对“真的带 Markdown 标记”的内容生效。
> 行内代码 = 链接两边各一个反引号（键盘 `Esc` 下方那个键）；代码块 = **第一行和最后一行各输入三个反引号**。
> **从渲染后的文档/聊天窗口复制文字会丢掉反引号**，粘进编辑器后就只是普通链接，被重写是正常的——不是 bug。

1. 新建并发布 `qa/refs`，正文**手动输入**下面 4 段（注意第 2、4 段的标记）：

   - 第 1 段（普通站内链接，应被重写）：

     `[子页](/zh/wiki/qa/guide/d/child)`

   - 第 2 段（行内代码：整条链接两边各加一个反引号，应保持原样）：

     `` `[行内代码](/zh/wiki/qa/guide/d)` ``

   - 第 3 段（外链，应保持原样）：

     `[外链](https://example.com/zh/wiki/qa/guide/d)`

   - 第 4 段（围栏代码块，应保持原样）：**第 1 行输入三个反引号并回车，第 2 行写链接，第 3 行再输入三个反引号**，即：

     第 1 行：```` ``` ````
     第 2 行：`[代码块](/zh/wiki/qa/guide/d)`
     第 3 行：```` ``` ````

2. **先自检**：保存后重新打开 `qa/refs` 编辑页，确认正文里**肉眼能看到**：
   - 第 2 段链接两端各有一个反引号；
   - 第 4 段上下各有一行三个反引号。

   如果看不到，说明复制时标记丢了，先补上再继续（否则后面的断言没有意义）。
3. 把 `qa/guide/d` 改到 `qa/guide/e`（保持「同时更新链接」勾选）并确认。
4. 打开 `qa/refs` 编辑页查看正文：
   - 第 1 段的 `/zh/wiki/qa/guide/d/child` 变成 `/zh/wiki/qa/guide/e/child`
   - 第 2、3、4 段里的 `/zh/wiki/qa/guide/d` **保持原样**
5. 打开 `qa/refs` 的「历史」页：**预期**多了一个版本（这次重写会产生快照）。
6. `/zh/admin/logs`：**预期**多一条「更新文章」记录，详情会显示「因路径变更重写旧链接」。也可以直接查库：

   ```powershell
   docker exec paradedb psql -U postgres -d luckywiki -c "select detail from logs where action='UPDATE_ARTICLE' and detail like '%path-change-link-rewrite%' order by created_at desc limit 1"
   # 期望 detail 里有 "reason":"path-change-link-rewrite" 与 rewrittenCount
   ```

### 场景 E：文件夹重命名（AC-6/15，仅 ROOT）

1. 进入 `/zh/admin/taxonomy`，滚到底部「内容结构」。
2. 找到 `/qa/guide`（可用「内容结构」顶部的过滤输入框输入 `qa`）→ 点「重命名」。
3. 输入新路径 `qa/manual` → 「预览影响范围」。
   **预期**：显示将移动的页面数（等于 `/qa/guide` 下所有页面，含草稿/归档；至少 3 个）、对应重定向数与链接更新数。
4. 点「确认重命名」→ 页面上方列表刷新。
5. **预期（注意区分“文件夹前缀”和“具体文章”）**：
   - 树里 `qa/manual` 下保留原来的子树（`child/deep` 等）；
   - 访问**具体文章**的旧地址 → 308，例如：

     ```powershell
     curl.exe -s -o NUL -w '%{http_code} %{redirect_url}\n' http://localhost:3000/zh/wiki/qa/guide/e
     # 期望：308 .../zh/wiki/qa/manual/e（子页面同理）
     ```

   - ⚠️ **不要用文件夹本身测 308**：`/zh/wiki/qa/guide` 没有对应文章，会显示“页面不存在”（API `/api/v1/articles/qa/guide` 返回 404）。这是 PRD 边界 21 的预期行为，不是失败。
   - 刚移动完如果具体文章旧地址暂时还是 404，最多等 **5 秒**再试（proxy 解析缓存 TTL）。
6. 权限：用 AUTHOR 账号（如 `author@luckywiki.local`）登录，打开 `/zh/admin/taxonomy` → **预期**被重定向/拒绝，看不到重命名入口。

### 场景 F：草稿与归档（AC-9/10）

1. 新建 **草稿** `qa/draft/one`（状态选「草稿」）。
2. 在该草稿的编辑页把路径改成 `qa/draft/two` 并保存（草稿不在前台展示，所以用编辑器改路径）。
   **预期**：确认弹窗出现并显示移动 1 个页面（0 个已发布）。
3. 访问 `http://localhost:3000/zh/wiki/qa/draft/one`：
   **预期**：显示「这个 Wiki 页面还不存在 / 找不到」页面，**不跳转**，也不出现文章标题（不泄漏草稿）。
4. 在编辑器把 `qa/draft/two` 改为「已发布」并保存。等待最多 5 秒后访问旧地址：
   **预期**：308 到 `/zh/wiki/qa/draft/two`。
5. 把 `qa/draft/two` 归档（文章页「归档」或后台状态）。访问：
   - `http://localhost:3000/zh/wiki/qa/draft/two` → **410**
   - `http://localhost:3000/zh/wiki/qa/draft/one`（旧地址）→ **410**

### 场景 G：路径复用（AC-8）

1. 新建并发布 `qa/reuse/old`。
2. 把它改到 `qa/reuse/new`（旧地址此时 308）。
3. 再新建并发布一篇 `qa/reuse/old`。
4. 访问 `http://localhost:3000/zh/wiki/qa/reuse/old`：
   **预期**：显示新文章内容（200），**不再是 308**。
5. 数据库里该路径不应再有重定向：

   ```powershell
   docker exec paradedb psql -U postgres -d luckywiki -t -A -c "select count(*) from article_redirects where old_path='qa/reuse/old'"
   # 期望：0
   ```

### 场景 H：日志与 Webhook（AC-12/13）

1. `/zh/admin/logs`：
   **预期**：能看到「移动文章」「重命名文件夹」两类记录，详情包含旧路径/新路径/移动 N 个页面/N 条重定向/更新 N 条链接。
2. `/zh/admin/webhooks`（ROOT）→ 新建 Webhook（可以用 https://webhook.site 的临时地址）→ 勾选「移动文章」→ 保存。
3. 再移动一篇文章（例如当前 `qa/manual/...` 下的任意一篇；路径以你界面为准）。
   **预期**：webhook.site 收到 `article.moved`，payload 里 `move.oldPath`、`move.newPath`、`move.movedCount`、`move.items` 都在。

### 场景 I：REST / pages 接口（FR-10）

> 前面的场景（尤其 E）已经改过路径，这里用变量代替固定路径；先查出你当前的数据再执行。

```powershell
$base = "http://localhost:3000"
$key  = "<你的key>"          # /zh/admin/mcp-keys 创建

# 当前某个已发布 qa 文章的路径（按你实际结果取值）
$current = docker exec paradedb psql -U postgres -d luckywiki -t -A -c "select path from articles where path like 'qa/%' and status='PUBLISHED' order by path limit 1"
# 某个已存在的“冲突目标”路径
$taken = docker exec paradedb psql -U postgres -d luckywiki -t -A -c "select path from articles where path like 'qa/%taken%' limit 1"
$old = "qa/guide/a"          # 场景 A 的原始路径，仍应保留重定向
"current=$current taken=$taken"
```

1. **旧路径 308**（API 的 Location 指向 API 自身路径，保留 query）：

   ```powershell
   curl.exe -s -o NUL -w '%{http_code} %{redirect_url}\n' "$base/api/v1/articles/$old"
   curl.exe -s -o NUL -w '%{http_code} %{redirect_url}\n' "$base/api/v1/articles/$old`?x=1"
   # 期望：308 .../api/v1/articles/<当前路径>，第二行保留 ?x=1
   ```

2. **PUT 改路径**（必须带 Key；把 `$current` 改成新路径 `qa/rest/moved`）：

   ```powershell
   curl.exe -i -X PUT "$base/api/v1/articles/$current" `
     -H "Authorization: Bearer $key" -H "Content-Type: application/json" `
     -d '{"path":"qa/rest/moved","rewriteLinks":true}'
   # 期望：200，data 里有 oldPath / movedCount / redirectsCreated / linkRewriteCount
   ```

3. **PUT 到已占用路径 → 409**（如果 `$taken` 为空，先随便建一篇 `qa/taken`）：

   ```powershell
   curl.exe -i -X PUT "$base/api/v1/articles/qa/rest/moved" `
     -H "Authorization: Bearer $key" -H "Content-Type: application/json" `
     -d "{\"path\":\"$taken\"}"
   # 期望：409，body 里有 conflictPath
   ```

4. **pages 接口旧路径**：

   ```powershell
   curl.exe -s -o NUL -w '%{http_code} %{redirect_url}\n' "$base/api/pages/$old"
   # 期望：308 .../api/pages/<当前路径>
   ```

5. **草稿/归档接口语义**（用场景 F 的路径）：

   ```powershell
   curl.exe -s -o NUL -w '%{http_code}\n' "$base/api/v1/articles/qa/draft/two"
   # 若该文章是草稿/已归档：期望 404 / 410（发布后是 200）
   ```

6. **MCP 旧路径**（可选）：把 `get_article` 的 path 传成 `$old`，应返回当前路径的文章而不是 not found（`/api/mcp` 需要 MCP 客户端调用，可跳过）。

---

## 3. 数据库侧核查（可选）

```powershell
# 当前 QA 文章与状态
docker exec paradedb psql -U postgres -d luckywiki -c "select path,status from articles where path like 'qa/%' order by path"

# QA 相关重定向（old_path 唯一，指向文章当前路径）
docker exec paradedb psql -U postgres -d luckywiki -c "select old_path, article_id from article_redirects where old_path like 'qa/%' order by old_path"

# 最近的移动/文件夹日志
docker exec paradedb psql -U postgres -d luckywiki -c "select action,target_type,detail from logs where action in ('MOVE_ARTICLE','RENAME_FOLDER') order by created_at desc limit 5"

# 链接重写日志（detail 里 reason = path-change-link-rewrite）
docker exec paradedb psql -U postgres -d luckywiki -c "select action,detail from logs where action='UPDATE_ARTICLE' and detail like '%path-change-link-rewrite%' order by created_at desc limit 3"
```

判断标准：

- `articles` 中不应出现任何 `qa/...` 的旧前缀（级联生效）；
- `article_redirects` 的 `old_path` 每个只出现一次（唯一约束），且指向被移动文章；
- `MOVE_ARTICLE` / `RENAME_FOLDER` 的 `logs.detail` 是 JSON，含 `oldPath/newPath/movedCount/redirectsCreated/source`；
- 链接重写会额外写一条 `UPDATE_ARTICLE` 日志，其 detail 含 `reason: "path-change-link-rewrite"`、`rewrittenCount`、`source`。

---

## 4. 清理测试数据

最稳妥：后台逐篇「彻底删除」（ROOT，文章页或文章列表）。  
如果要批量清：

```powershell
# 仅删除测试前缀，避免误删正式内容；会级联删除版本、评论、重定向
docker exec paradedb psql -U postgres -d luckywiki -c "delete from articles where path like 'qa/%'"
```

> 提醒：
> - 不要用 `delete from articles`（无 where）或 `truncate`；
> - 删除文章会级联删除其 `article_redirects`（`onDelete: Cascade`）；
> - 审计日志不会随之删除，这是预期行为。

---

## 5. 验收对照表

| AC | 场景 | 关键预期 |
|---|---|---|
| AC-1 | A | 三篇路径全部换成新前缀，数据库中无旧前缀 |
| AC-2 | A | 树只有一个新分支，无孤立旧节点 |
| AC-3 | A | 旧 URL 308 到新路径（zh/en） |
| AC-4 | A | 308 保留 query |
| AC-5 | B | 冲突零写入，确认按钮不可用 |
| AC-6 | E | 文件夹整棵子树移动（含草稿），计数正确 |
| AC-7 | A 步骤 10 | 多次移动后旧地址一次跳到位 |
| AC-8 | G | 路径复用后旧地址展示新文章 |
| AC-9 | F | 草稿旧地址不跳转、不泄漏 |
| AC-10 | F | 归档旧地址与当前地址均 410 |
| AC-11 | D | 站内链接被改写，代码/外链不动，快照+日志齐全 |
| AC-12 | H | 日志页出现新动作且 detail 完整 |
| AC-13 | H | webhook 收到 `article.moved` 与 `move.items` |
| AC-14 | A | sitemap 只含新路径（可选：`curl http://localhost:3000/sitemap.xml` 搜 `qa/guide/a` 应为 0 条） |
| AC-15 | E 步骤 6 | AUTHOR 无文件夹重命名入口/被拒 |
| AC-16 | B 步骤 6 | `home` 文件夹重命名被拒 |

---

## 6. 常见问题

| 现象 | 原因/处理 |
|---|---|
| 页面打不开、500 | `docker ps` 看 `paradedb` 是否 Up；`.env` 是否存在；`pnpm dev` 是否在跑 |
| 旧地址仍 404/不跳转 | 解析缓存最长 5s，稍等重试；查 `article_redirects` 是否有该 `old_path`；确认文章确实被移动（有 `MOVE_ARTICLE` 日志） |
| 文件夹重命名后访问旧文件夹路径 404 | 文件夹前缀本身不是页面（PRD 边界 21），请访问具体文章的旧地址；刚移动完等 ≤5s |
| 改路径没有弹确认框 | 只在「路径确实变化」时弹；大小写/首尾空格经规范化后相同不弹 |
| 链接没被重写 | 链接在代码块/行内代码/外链中；或关闭了勾选；或候选超过 500 篇上限 |
| 反过来了：代码里的链接被重写 | 99% 是正文里根本没有反引号/围栏：从渲染后的文档复制会丢标记。重新手动输入反引号后再测（见场景 D 的 ⚠️） |
| 移动后树没变 | 强制刷新页面；确认不是只改了状态 |
| 文件夹重命名按钮不见 | 需要 ROOT；AUTHOR 看不到/被拒 |
| API PUT 401/403 | 需要 `/admin/mcp-keys` 创建的 Key，并带 `Authorization: Bearer <key>` |
| 410 与 404 混淆 | 归档 = 410；草稿 = 页面级 404（PPR 下 HTTP 仍可能是 200 + not-found UI，属既有行为） |

---

## 7. 建议的检验顺序

1. 环境自检（第 0 节）→ 自动化（第 1 节）
2. 场景 A（核心：级联 + 308）→ 场景 B（错误分支）
3. 场景 C（移动对话框）→ 场景 D（链接重写）
4. 场景 E（文件夹，需 ROOT）→ 场景 F（草稿/归档）→ 场景 G（路径复用）
5. 场景 H（日志/Webhook）→ 场景 I（API）
6. 第 3 节数据库核查 → 第 4 节清理

> 行为细节与实现说明见 [`PATH-CHANGE-AND-REDIRECTS.md`](./PATH-CHANGE-AND-REDIRECTS.md)；对应的 PRD/需求清单在仓库外 `C:\Users\74827\Documents\默认项目\`。
