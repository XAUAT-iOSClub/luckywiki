下面给出一份**论坛 AI API 可实现功能清单**，按论坛里“通常使用频率”从高到低排名。

前提：当前 LuckyWiki 本身没有论坛模块，所以论坛数据模型、页面、API 需要新增；AI 部分可以复用现有的 `lib/agent`、`lib/search`、`lib/mcp`、Better Auth、Prisma、SSE、i18n 和 Server Action 模式。

频率定义：

- **极高**：浏览、发帖、回帖时几乎都会触发。
- **高**：每天多次使用。
- **中**：每周多次或版主/运营日常使用。
- **低**：按需、管理向、外部集成向。
- **极低/不建议默认开放**：高风险写操作。

---

## 论坛 AI API 功能排名

| 排名  | 功能                | 典型场景              | 频率      | 建议实现入口                                | 复用/新增                                                                     |
| --- | ----------------- | ----------------- | ------- | ------------------------------------- | ------------------------------------------------------------------------- |
| 1   | 长帖 / 讨论串摘要        | 用户不想读完长帖，先看 TL;DR | 极高      | `POST /api/ai/forum/summarize`        | 复用 `lib/agent/openai.ts`，新增 `lib/ai/forum/summarize.ts`，缓存 `ForumSummary` |
| 2   | 自然语言语义搜索          | 用一句话搜论坛，而不是关键词    | 极高      | `POST /api/ai/forum/search`           | 复用 `lib/agent/search.ts`、`lib/search.ts`，过滤 `PUBLISHED + PUBLIC`          |
| 3   | 相似帖 / 重复帖检测       | 发帖前提示“已有相关讨论”     | 高       | `POST /api/ai/forum/similar`          | embedding + 标题/标签匹配，新增 `lib/ai/forum/similar.ts`                          |
| 4   | 相关帖子推荐            | 帖子底部推荐相关内容        | 高       | `GET /api/ai/forum/related?threadId=` | 复用检索与标签匹配，可缓存                                                             |
| 5   | 发帖辅助：标题优化         | 把“问个问题”改成清晰标题     | 高       | `app/actions/forum-ai.ts`             | Server Action + Zod，返回建议不直接发布                                             |
| 6   | 发帖辅助：标签 / 版块建议    | 自动推荐标签、分类、版块      | 高       | `app/actions/forum-ai.ts`             | 复用字典与论坛 taxonomy                                                          |
| 7   | 回帖草稿 / 回复建议       | 基于上下文生成回复草稿       | 高       | `app/actions/forum-ai.ts`             | 只生成草稿，用户确认后发布                                                             |
| 8   | 自动翻译              | 跨语言社区，一键翻译帖子/回帖   | 高       | `POST /api/ai/forum/translate`        | 复用 OpenAI 兼容接口，结果可缓存                                                      |
| 9   | 自动审核：垃圾 / 广告 / 毒性 | 发帖、回帖自动过审核流水线     | 高       | `POST /api/ai/forum/moderate`         | 写 `ForumModerationResult`，可异步执行                                           |
| 10  | 举报分类与优先级          | 自动给举报打标签、排序       | 中高      | `app/actions/forum-moderation.ts`     | 写审计日志，版主工作台展示                                                             |
| 11  | 审核理由生成            | 给版主或用户可读的通过/拒绝理由  | 中高      | `POST /api/ai/forum/moderate` 返回      | 输出需审核，避免直接对用户展示未过滤内容                                                      |
| 12  | RAG 问答：论坛 + Wiki  | 用户直接提问，AI 检索后回答   | 中       | `POST /api/ai/forum/ask`              | 复用 `lib/agent/graph.ts`、`lib/agent/tools.ts`                              |
| 13  | FAQ / 常见问题机器人     | 自动回答新人常见问题        | 中       | `POST /api/ai/forum/faq`              | 规则 + 检索 + 缓存                                                              |
| 14  | 长讨论串观点聚类          | 汇总支持、反对、中立、跑题     | 中       | `POST /api/ai/forum/cluster`          | 先摘要再聚类，结果缓存                                                               |
| 15  | 通知摘要              | 把大量通知压缩成一条摘要      | 中       | `app/actions/forum-notifications.ts`  | 用户级缓存，注意隐私                                                                |
| 16  | 个性化 Feed / 推荐     | 按兴趣、版块、历史行为排序     | 中       | `lib/ai/forum/recommend.ts`           | 可先规则 + embedding，后做模型排序                                                   |
| 17  | 帖子质量评分 / 高价值识别    | 运营识别优质帖、低质帖       | 中       | `lib/ai/forum/quality.ts`             | 评分 + 标签，写入审计                                                              |
| 18  | 版主工作台摘要           | 待处理事项、风险帖、重复帖汇总   | 中       | `app/[lang]/admin/forum` 页面           | 复用 admin shell 与 `Log`                                                    |
| 19  | 运营周报 / 健康度报告      | 活跃、情绪、争议、垃圾率      | 中低      | `scripts/forum-report.ts`             | 定时任务或手动触发                                                                 |
| 20  | 高价值讨论转 Wiki 草稿    | 把优质问答沉淀为百科草稿      | 低但高价值   | `app/actions/forum-to-wiki.ts`        | 复用 Article 模型，草稿状态                                                        |
| 21  | 用户兴趣画像 / 学习路径     | 推荐关注、阅读顺序         | 低       | `lib/ai/forum/profile.ts`             | 隐私敏感，需用户同意                                                                |
| 22  | 外部 MCP 只读工具       | 让外部 AI 查询论坛内容     | 低中      | `lib/mcp/tools.ts` 新增工具               | 复用 MCP 鉴权、限流、审计                                                           |
| 23  | 外部 AI API Key 管理  | 给外部应用发 Key、限流、撤销  | 基础能力    | `app/api/admin/ai-keys`               | 参考 `lib/mcp/api-keys.ts`                                                  |
| 24  | 自动发帖 / 自动回帖 / 写操作 | AI 直接发布内容         | 极低，默认不做 | 不建议默认开放                               | 高风险，必须独立权限 + 审计 + 人工确认                                                    |

---

## 最推荐先做的 MVP

如果只做第一版，建议按这个顺序：

1. **长帖 / 讨论串摘要**
2. **自然语言语义搜索**
3. **相似帖 / 重复帖检测**
4. **相关帖子推荐**
5. **发帖标题优化 + 标签建议**
6. **回帖草稿建议**
7. **自动翻译**
8. **自动审核：垃圾 / 广告 / 毒性**
9. **举报分类与审核理由**
10. **基础 API Key + 限流 + 审计日志**

这 10 个覆盖了论坛里最高频的用户行为：浏览、搜索、发帖、回帖、审核。

---

## 按角色看高频功能

| 角色            | 最常用 AI 功能                    |
| ------------- | ---------------------------- |
| 普通浏览者         | 摘要、语义搜索、相关推荐、翻译              |
| 发帖者           | 标题优化、标签建议、重复帖检测、正文润色         |
| 回帖者           | 回复建议、引用建议、翻译                 |
| 版主            | 自动审核、举报分类、审核理由、风险帖摘要         |
| 管理员           | 版主工作台摘要、运营周报、健康度报告           |
| 外部 AI / 社团 AI | 搜索论坛、获取帖子、目录树、最近更新、相关帖子、分类统计 |
| 运营            | 质量评分、高价值识别、转 Wiki 草稿、个性化推荐   |

---

## 建议的 API 分组

| 分组   | 端点                             | 说明            |
| ---- | ------------------------------ | ------------- |
| 摘要   | `POST /api/ai/forum/summarize` | 单帖、讨论串、长回帖    |
| 搜索   | `POST /api/ai/forum/search`    | 自然语言、语义、混合搜索  |
| 推荐   | `GET /api/ai/forum/related`    | 相关帖、相似帖、重复帖   |
| 发帖辅助 | `POST /api/ai/forum/suggest`   | 标题、标签、正文、版块   |
| 回帖辅助 | `POST /api/ai/forum/reply`     | 回复草稿、引用建议     |
| 翻译   | `POST /api/ai/forum/translate` | 帖子、回帖、摘要      |
| 审核   | `POST /api/ai/forum/moderate`  | 垃圾、广告、毒性、风险分级 |
| 问答   | `POST /api/ai/forum/ask`       | RAG，论坛 + Wiki |
| 聚类   | `POST /api/ai/forum/cluster`   | 观点、争议、跑题      |
| 运营   | `POST /api/ai/forum/report`    | 周报、健康度、质量评分   |
| MCP  | `POST /api/mcp`                | 新增论坛只读工具      |
| 管理   | `app/api/admin/ai-keys`        | Key、限流、审计     |

---

## 安全底线

无论做哪些功能，都建议保持：

- 每个 API / Server Action **独立认证**，不能只靠 proxy。
- 所有输入用 **Zod** 校验。
- 默认 **只读**；写操作必须单独授权并加人工确认。
- 只返回 **已发布 + 公开** 内容，草稿、私密版块、私信不暴露。
- AI 生成内容在公开发布前 **再过一次审核**。
- 记录 **审计日志**：调用者、任务、模型、token、耗时、结果状态。
- 限流：单实例可内存，多实例必须 Redis。
- 隐私：私密内容不发给第三方模型，或先脱敏。
- 嵌入维度：如果论坛也用 embedding，保持模型、环境变量、迁移 `vector(N)` 一致。

一句话总结：**最高频、最值得先做的是摘要、语义搜索、相似/相关推荐、发帖回帖辅助、翻译和自动审核；RAG 问答、观点聚类、运营报告、MCP 外部工具属于第二梯队；自动发帖等写操作默认不要开放。**