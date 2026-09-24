# LuckyWiki Feature Development Guide

This document is a practical guide for adding features to LuckyWiki. It summarizes the conventions already used in the repository and identifies the files that normally need to change together.

The safest mental model is:

> LuckyWiki is a localized, database-backed Next.js App Router application. Routes and UI live under `app/` and `components/`; reusable server-side behavior lives under `lib/`; persistent content lives in PostgreSQL through Prisma; feature mutations are normally Server Actions; external integrations are Route Handlers or dedicated library modules.

---

## 1. Before starting

### Read the repository instructions

- `CLAUDE.md` delegates to `AGENTS.md`.
- `AGENTS.md` warns that this repository uses a breaking version of Next.js. Before changing a Next.js API, install dependencies and read the relevant documentation under `node_modules/next/dist/docs/`.
- Do not rely on conventions from an older Next.js release. This codebase uses asynchronous `params` and `searchParams` values in pages, layouts, and Route Handlers.

A bare checkout may not contain `node_modules/` or the generated Prisma client. Install dependencies before expecting the local Next.js documentation or `generated/prisma/` to exist.

### Establish a baseline

```bash
git status --short
pnpm install
pnpm lint
pnpm test
```

`pnpm` is the declared package manager in `package.json` and `pnpm-lock.yaml`. Keep the lockfile authoritative to avoid dependency drift.

### Configure local services

The repository currently does not contain a tracked `.env.example`, although the README refers to one. Use `README.md` and the environment-variable section in this guide as the current contract. Never commit a real `.env` file or credentials.

At minimum, a database-backed local run needs:

- a PostgreSQL connection variable;
- `BETTER_AUTH_URL` (normally `http://localhost:3000`);
- a development `BETTER_AUTH_SECRET`.

After PostgreSQL is available:

```bash
pnpm prisma generate
pnpm prisma migrate deploy
pnpm db:seed
pnpm dev
```

The seed script creates or promotes the root account and creates the `home` article. Set `ROOT_EMAIL`, `ROOT_PASSWORD`, and `ROOT_NAME` explicitly for local work.

---

## 2. Architecture at a glance

```text
Browser request
  -> proxy.ts
  -> app/[lang]/layout.tsx
  -> section layout (wiki, agent, settings, auth, or admin)
  -> page or Route Handler
  -> lib/ domain module
  -> Prisma/PostgreSQL or an external provider
```

Major product areas are:

- localized public wiki pages;
- Markdown and trusted HTML article rendering and editing;
- article search with ParadeDB BM25, PostgreSQL `pg_trgm`, and an application fallback;
- email/password authentication with optional GitHub and OIDC providers;
- author/root administration and comment moderation;
- a LangGraph/OpenAI-compatible wiki Agent;
- a read-only MCP server with API keys, SSE, rate limiting, and audit records;
- Markdown import, image conversion/upload, and legacy content migration.

### Repository map

| Path | Responsibility |
| --- | --- |
| `app/` | App Router pages, layouts, Route Handlers, Server Actions, metadata routes, and global CSS |
| `app/[lang]/` | Localized user-facing routes for `zh` and `en` |
| `app/actions/` | Database-backed mutations and other Server Actions |
| `app/api/` | JSON, SSE, upload, authentication, MCP, and other HTTP endpoints |
| `components/` | Product components and feature UI |
| `components/ui/` | Reusable shadcn/Radix-style primitives |
| `hooks/` | Small client-side React hooks |
| `lib/` | Domain logic, database access, authentication, search, integrations, and i18n |
| `prisma/schema.prisma` | Persistent data model |
| `prisma/migrations/` | Ordered database migrations |
| `prisma/seed.ts` | Development/bootstrap data |
| `scripts/` | Import, migration, scraping, and indexing commands |
| `tests/` | Node built-in test-runner tests executed through `tsx` |
| `types/` | Shared TypeScript types and declarations |
| `public/` | Static assets |
| `docs/` | Integration and developer documentation |

The Prisma client is generated into `generated/prisma/`. That directory is ignored by Git and must be regenerated after installation or schema changes.

---

## 3. Next.js and rendering conventions

### Localized request preprocessing

`proxy.ts`:

1. detects whether the first URL segment is `zh` or `en`;
2. redirects unlocalized browser routes to a locale-prefixed route;
3. chooses the locale from `NEXT_LOCALE` or `Accept-Language`;
4. persists the locale cookie;
5. performs a lightweight Better Auth cookie check for localized `/admin` routes.

The proxy is **not** the authorization boundary. It only checks for a cookie. Every Server Action, page, and API handler that needs protection must perform its own session and role check. API routes are excluded from the proxy matcher, so API handlers must authenticate explicitly.

### Server Components by default

Pages and layouts are Server Components unless they cross a client boundary. Keep database reads, session reads, metadata generation, and authorization in Server Components or server-side modules.

Use a client component only when the feature needs browser state or browser-only APIs, such as:

- `useState`, `useEffect`, or event handlers;
- `sessionStorage`, `navigator`, `window`, or `AbortController`;
- Monaco, Mermaid, theme APIs, or another browser-only library;
- live streaming, dialogs, or interactive form state.

Mark the smallest possible file with:

```tsx
"use client";
```

Do not import Prisma, Better Auth server modules, secrets, or other server-only code into a client component. Load data on the server and pass serializable props or a bound Server Action to the client component.

### Asynchronous route parameters

Use the repository's Next.js 16 style:

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

Dynamic Route Handler parameters are asynchronous too:

```ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // ...
}
```

Always validate a locale with `hasLocale()` and call `notFound()` for an invalid value.

### Dynamic behavior

The root localized layout is `dynamic = "force-dynamic"` because the application depends on sessions, database content, and environment-backed settings. Admin and Agent surfaces also use dynamic behavior where appropriate. Follow the nearest existing route when adding a page; do not add static generation to a session- or database-dependent route without checking its data and cache behavior.

The MCP route explicitly uses:

```ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
```

Keep MCP and other Node-only integrations on the Node runtime.

---

## 4. Routing, shells, and metadata

### Main route map

| URL | Source | Purpose |
| --- | --- | --- |
| `/{lang}` | `app/[lang]/page.tsx` | Redirects to `/{lang}/wiki/home` |
| `/{lang}/wiki` | `app/[lang]/wiki/[[...slug]]/page.tsx` | Optional catch-all wiki route; empty path redirects to home |
| `/{lang}/wiki/{path}` | same catch-all page | Renders a published article |
| `/{lang}/agent` | `app/[lang]/agent/page.tsx` | Wiki Agent UI |
| `/{lang}/settings` | `app/[lang]/settings/page.tsx` | Profile and linked-account settings |
| `/{lang}/auth/*` | `app/[lang]/auth/*/page.tsx` | Sign-in, sign-up, and email verification |
| `/{lang}/admin` | `app/[lang]/admin/page.tsx` | Root dashboard |
| `/{lang}/admin/articles` | `app/[lang]/admin/articles/page.tsx` | Article list, filters, and status changes |
| `/{lang}/admin/articles/new` | `app/[lang]/admin/articles/new/page.tsx` | Article creation |
| `/{lang}/admin/articles/{id}` | `app/[lang]/admin/articles/[id]/page.tsx` | Article editing |
| `/{lang}/admin/comments` | `app/[lang]/admin/comments/page.tsx` | Comment moderation |
| `/{lang}/admin/logs` | `app/[lang]/admin/logs/page.tsx` | Operation-log browsing |
| `/{lang}/admin/taxonomy` | `app/[lang]/admin/taxonomy/page.tsx` | Section/tag summaries |
| `/{lang}/admin/users` | `app/[lang]/admin/users/page.tsx` | User-role management |
| `/{lang}/admin/mcp-keys` | `app/[lang]/admin/mcp-keys/page.tsx` | MCP key management |
| `/api/auth/*` | `app/api/auth/[...all]/route.ts` | Better Auth handler |
| `/api/search` | `app/api/search/route.ts` | Public article search JSON |
| `/api/pages` | `app/api/pages/route.ts` | Published article tree JSON |
| `/api/pages/{path}` | `app/api/pages/[...path]/route.ts` | Published article JSON |
| `/api/agent` | `app/api/agent/route.ts` | Agent SSE endpoint |
| `/api/uploads/images` | `app/api/uploads/images/route.ts` | Authenticated image upload |
| `/api/mcp` | `app/api/mcp/route.ts` | MCP SSE and JSON-RPC endpoint |
| `/api/admin/mcp-keys` | `app/api/admin/mcp-keys/route.ts` | List/create current-user MCP keys |
| `/api/admin/mcp-keys/{id}` | `app/api/admin/mcp-keys/[id]/route.ts` | Revoke a current-user MCP key |
| `/robots.txt` | `app/robots.ts` | Robots metadata |
| `/sitemap.xml` | `app/sitemap.ts` | Localized static and article URLs |
| `/og` | `app/og/route.tsx` | Edge-generated social preview image |

### Choose the correct shell

- Public wiki, Agent, and settings pages use `components/wiki-shell.tsx` through their section layouts. The shell loads the published tree, session, dictionary, and site settings.
- Admin pages use `app/[lang]/admin/layout.tsx`, which renders `AppSidebar`, `AdminHeader`, and `SiteFooter`, and requires an author-capable session.
- Authentication pages use `app/[lang]/auth/layout.tsx`.

### Metadata and discoverability

Use the existing helpers in `lib/metadata/index.ts`:

- `buildPageMetadata()` for ordinary pages;
- `buildArticleMetadata()` for wiki articles;
- `getOgImageUrl()` for the generated `/og` preview.

If a new public route should be indexed, add it to `app/sitemap.ts` and include localized alternates where appropriate.

---

## 5. Adding a public page

Recommended sequence:

1. Add a route below `app/[lang]/`.
2. Validate `lang` with `hasLocale()`.
3. Load the dictionary and required data on the server.
4. Move only browser interaction into a child client component.
5. Use `localizeHref()` for all internal links.
6. Add metadata with `buildPageMetadata()` when the page is indexable.
7. Add the route to `app/sitemap.ts` if it should be discoverable.
8. Add tests for path, validation, or domain behavior not already covered.

Example shape:

```tsx
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale } from "@/lib/i18n/config";

type Params = Promise<{ lang: string }>;

export default async function FeaturePage({
  params,
}: {
  params: Params;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);
  // Read server data here and pass it to a client component if necessary.

  return <main>{dictionary.common.featureLabel}</main>;
}
```

For links, prefer:

```tsx
<Link href={localizeHref(lang, "/settings")}>...</Link>
```

Do not concatenate `/${lang}` manually or link to `/settings` directly from a localized page.

---

## 6. Internationalization

Supported locales are defined in `lib/i18n/config.ts`:

```ts
export const locales = ["zh", "en"] as const;
export const defaultLocale = "zh";
```

Use these helpers:

- `hasLocale(value)` — validates a locale;
- `localizeHref(locale, path)` — adds or replaces the locale prefix;
- `buildWikiHref(path, locale)` — builds an encoded article URL;
- `getDictionary(locale)` — loads translations in server code;
- `useLocale()` and `useT()` — read translations in client components;
- `formatTemplate()` — interpolates translated strings;
- `formatDate()` and `formatNumber()` — locale-aware formatting.

For every user-visible string:

1. add the property to `lib/i18n/dictionaries/zh.ts`;
2. add the same property shape to `lib/i18n/dictionaries/en.ts`;
3. use `getDictionary()` in a Server Component or action, or `useT()` in a client component;
4. use `formatTemplate()` for placeholders instead of assembling translated sentences in code.

Treat both dictionaries as one type contract. A feature is not complete until both locales render correctly.

---

## 7. Authentication and authorization

### Central permission model

The permission helpers are in `lib/auth/permissions.ts`:

| Role | Intended capabilities |
| --- | --- |
| `ROOT` | Full admin shell, article management, comment moderation, user-role management, logs, and taxonomy |
| `AUTHOR` | Admin shell, article creation/editing/status changes, and article image uploads |
| `USER` | No admin shell; can comment after email verification |

Use the existing session guards in `lib/auth/session.ts`:

- `getCurrentSession()` — nullable session lookup;
- `requireSession(locale, nextPath)` — redirects unauthenticated users;
- `requireAuthorSession(locale)` — requires `ROOT` or `AUTHOR`;
- `requireRootSession(locale, redirectPath?)` — requires `ROOT`;
- `requireVerifiedSession(locale, nextPath)` — requires a verified account.

Do not implement role comparisons inline when one of these helpers or `lib/auth/permissions.ts` functions applies.

### Page protection

Protect a page in the page or layout itself, even though the proxy has an admin cookie check:

```tsx
const session = await requireAuthorSession(lang);
```

Root-only pages should call `requireRootSession(lang, ...)` as their own boundary.

### Server Action protection

Authenticate inside every mutation, not only in the page that invokes it. A client can call an action or endpoint independently of the UI.

For a public comment mutation, the existing pattern is:

1. `requireVerifiedSession()`;
2. parse `FormData` with Zod;
3. write a `PENDING` record;
4. revalidate the affected article path.

For an administrative mutation, also create a `Log` record when the operation changes content, moderation state, or roles.

### Better Auth

`lib/auth/index.ts` configures Better Auth with the Prisma adapter, email/password, optional GitHub/OIDC providers, email verification, and account linking. The auth Route Handler is `app/api/auth/[...all]/route.ts`.

Optional provider configuration is isolated in `lib/auth/provider-config.ts`. Keep provider enablement conditional on complete environment configuration rather than exposing a broken login button.

---

## 8. Adding a database-backed feature

### Schema and migration workflow

For persistent state:

1. Add or modify the model in `prisma/schema.prisma`.
2. Add relations, nullability, uniqueness, and indexes deliberately.
3. Create a named migration.
4. Regenerate the client.
5. Update domain queries and mutations.
6. Add tests for the new behavior and migration assumptions.

Development commands:

```bash
pnpm prisma migrate dev --name describe_the_change
pnpm prisma generate
```

Deployment command:

```bash
pnpm prisma migrate deploy
```

Do not edit an already-applied migration to change production behavior. Add a new migration instead.

### Current data model

`prisma/schema.prisma` currently contains:

- `User`, `Session`, `Account`, and `Verification` for Better Auth;
- `Article` for wiki content;
- `AgentChunk` for heading-aware article chunks and embeddings;
- `Comment` for moderated discussion;
- `Log` for administrative audit records;
- `McpApiKey` and `McpCallLog` for MCP credentials and audit data.

Important enums are:

- `Role`: `ROOT`, `AUTHOR`, `USER`;
- `ArticleStatus`: `DRAFT`, `PUBLISHED`;
- `CommentStatus`: `PENDING`, `APPROVED`, `REJECTED`;
- `LogAction`: article, comment, and role-management operations.

`Article.path` is unique and is the canonical wiki identifier. Tags are a PostgreSQL text array. Public article queries must filter `status = PUBLISHED`. Public article pages only load approved comments.

`AgentChunk` retains serialized JSON in `embedding` and also has an unsupported `embeddingVector` column (`vector(1024)`). The vector column is populated through raw SQL because Prisma does not expose the vector type as a native scalar.

### Prisma access

Use the shared `prisma` instance from `lib/prisma.ts`. It uses `@prisma/adapter-pg`, chooses a direct/ParadeDB connection when configured, and retries closed connections for read operations. Do not instantiate a new Prisma client inside a page, action, or request handler.

Keep reusable reads in domain modules such as:

- `lib/articles/index.ts` — public and admin article queries;
- `lib/admin.ts` — dashboard, taxonomy, users, and logs;
- `lib/comments.ts` — moderation queries;
- `lib/search.ts` — public search;
- `lib/mcp/tools.ts` — MCP-specific published-content queries;
- `lib/agent/tools.ts` — Agent-specific published-content queries.

Prefer narrow `select` clauses and explicit ordering. Avoid returning entire relational records when a route only needs a few fields.

### Server Action mutation pattern

Put a feature mutation in a module marked with:

```ts
"use server";
```

The existing article actions in `app/actions/admin.ts` demonstrate the expected sequence:

1. require the appropriate session;
2. load the locale dictionary;
3. parse and validate input with Zod;
4. canonicalize user-controlled paths;
5. write through the shared Prisma client;
6. update dependent data such as Agent chunks when needed;
7. create an audit log for administrative changes;
8. revalidate every affected localized route;
9. return a typed success or error state.

Use `useActionState` in a client form when the action needs field-level or submission feedback. Keep the action's return type explicit and serializable.

Example outline:

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

Use the actual dictionary for messages and add an audit record when the operation is administrative.

---

## 9. Revalidation and cache correctness

The shared helper in `lib/i18n/revalidate.ts` exists because every user-facing route has both locale variants:

```ts
revalidateLocalizedPath("/admin/articles");
```

For article mutations, follow `app/actions/admin.ts`:

- invalidate the general wiki route;
- invalidate the old article path;
- invalidate the new article path if the path changed;
- invalidate admin article/dashboard/taxonomy views as applicable;
- invalidate both `zh` and `en` variants.

For a path-changing update, always revalidate both the old and new paths. Otherwise a stale page can remain accessible through the old URL.

For user-facing profile changes, `app/actions/settings.ts` revalidates settings, wiki, and Agent routes for every locale. Follow that pattern when a change affects shared shell data.

Do not assume that changing a database row automatically updates an already-rendered route. Identify the affected paths and explicitly revalidate them.

---

## 10. Article-related features: update every consumer

Articles are consumed by more than the article page. Before calling an article feature complete, check the following surfaces:

- `lib/articles/index.ts` — public/admin reads;
- `app/[lang]/wiki/[[...slug]]/page.tsx` — public rendering and metadata;
- `lib/search.ts` — public search and excerpts;
- `lib/wiki/tree.ts` and `components/wiki-sidebar.tsx` — navigation tree;
- `lib/agent/chunks.ts` — chunking;
- `lib/agent/index.ts` — embedding synchronization;
- `lib/agent/tools.ts` and `lib/agent/search.ts` — Agent retrieval/tools;
- `lib/mcp/tools.ts` — external read-only MCP exposure;
- `app/sitemap.ts` — indexed URLs;
- `app/actions/admin.ts` — mutation, logs, and revalidation;
- import scripts under `lib/articles/` and `scripts/`.

### Paths

Canonicalization is centralized in `lib/wiki/path.ts`:

- normalizes Unicode and slash separators;
- rejects empty segments, `.` and `..`, query/fragment markers, and control characters;
- lowercases ASCII capitals;
- encodes each path segment when building links.

Use `canonicalizePath()` for stored paths and `canonicalizeSlugSegments()` for route segments. Do not build article paths with ad hoc string replacement.

### Article rendering

Markdown articles use `components/markdown-renderer.tsx`, which supports GFM, math/KaTeX, syntax highlighting, diagrams, and custom components. The Markdown pipeline uses sanitization and skips raw HTML.

Articles whose `editor === "html"` use `components/wiki-html-renderer.tsx` and `dangerouslySetInnerHTML`. Treat these as trusted, admin-created content. Do not route untrusted user input into the HTML editor path without adding an explicit sanitization policy.

### Embeddings

Article create/update/status actions call `safeSyncArticleEmbeddingsForArticleId()` from `lib/agent/index.ts`.

- unpublished articles have their chunks removed;
- published articles are chunked and embedded when the Agent is configured;
- embedding failures are logged by the safe wrapper so a content mutation is not necessarily blocked by an optional Agent provider;
- `pnpm agent:index` reindexes all published articles.

The ParadeDB migration currently defines `vector(1024)`. Keep these aligned when changing embedding providers:

1. `OPENAI_EMBEDDING_MODEL` or gateway model;
2. `AGENT_EMBEDDING_DIMENSIONS`;
3. the migration's `vector(N)` column;
4. existing stored vectors and indexes.

---

## 11. Adding an API endpoint

Use a Route Handler under `app/api/` when the feature needs an HTTP interface for a browser, external service, or non-React client.

Recommended structure:

1. parse URL, headers, or body;
2. validate all user-controlled input with Zod or equivalent;
3. authenticate and authorize explicitly;
4. call a domain function under `lib/`;
5. return a stable JSON or stream shape;
6. map expected failures to intentional HTTP status codes;
7. avoid exposing stack traces, credentials, SQL, or provider internals.

Use `NextResponse.json()` for ordinary JSON. For streaming endpoints, follow the SSE implementation in `lib/agent/route.ts` or `app/api/mcp/route.ts` and set an explicit `Content-Type` and no-store/cache headers.

Dynamic route parameters are promises. Example:

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

For public article APIs, filter published content in the domain query, not only in the UI.

---

## 12. Adding an admin feature

### Server side

- Put the page under `app/[lang]/admin/`.
- Let `app/[lang]/admin/layout.tsx` provide the author-level shell protection.
- Add `requireRootSession()` inside root-only pages and actions.
- Put reusable reads in `lib/admin.ts` or the relevant domain module.
- Add `LogAction` and dictionary labels for administrative mutations.
- Revalidate affected admin and public paths.

### Navigation

Update `components/app-sidebar.tsx` for admin navigation. The sidebar has different item sets for root users and authors, so decide which roles should see the new item. Use localized URLs and translated labels.

### UI

Reuse primitives from `components/ui/` rather than introducing a second component system. Existing admin pages use `Card`, `Table`, `Badge`, `Button`, pagination components, and the shared CSS classes in `app/globals.css` such as `surface-panel`, `admin-card`, and `select-native`.

Keep data loading in the server page. Use a client component for dialogs, optimistic state, clipboard operations, or fetch-based management screens.

### MCP key authorization note

The MCP key page is inside the author-protected admin shell, but its API handlers currently check for an authenticated user and operate on that user's keys rather than explicitly requiring `ROOT`. Preserve that behavior only if per-user keys are intended; otherwise tighten both the page and API handlers consistently.

---

## 13. Search, Agent, and MCP extensions

### Public search

`lib/search.ts` backs both the global search Server Action (`app/actions/search.ts`) and `GET /api/search`.

Its fallback order is:

1. ParadeDB BM25 when `pg_search` is available;
2. PostgreSQL `pg_trgm` similarity search;
3. Prisma string matching and application-level scoring.

Only published articles are searched. Results include score, match field, and a plain-text excerpt.

When adding searchable article fields:

- update the relevant SQL query and fallback query;
- consider ParadeDB indexes and migrations;
- update result types and excerpts;
- add tests for both extension and fallback behavior when practical.

### Wiki Agent

The Agent HTTP boundary is `app/api/agent/route.ts`, with request/streaming behavior in `lib/agent/route.ts`. The browser UI is `components/wiki-agent.tsx`.

The runtime is divided into:

| File | Responsibility |
| --- | --- |
| `lib/agent/openai.ts` | OpenAI-compatible chat/embedding calls and stream parsing |
| `lib/agent/graph.ts` | LangGraph QA workflow |
| `lib/agent/tools.ts` | Six read-only LangChain tools |
| `lib/agent/search.ts` | semantic/vector/lexical retrieval and fallbacks |
| `lib/agent/chunks.ts` | heading-aware chunking and cosine similarity |
| `lib/agent/index-core.ts` | provider-independent embedding synchronization |
| `lib/agent/index.ts` | Prisma-backed indexing and retry logic |
| `lib/agent/message-state.ts` | empty-stream and error-message handling |
| `types/agent.ts` | shared stream and tool-event types |

Agent additions should remain read-only unless the product and security model explicitly change. Add a tool in `lib/agent/tools.ts`, define a Zod schema, return published content only, and update tool-event labels/summaries if the UI should represent it.

The Agent endpoint returns SSE events such as:

- `sources`;
- `delta`;
- `tool`;
- `done`;
- `error`.

If you add an event, update both the server emitter and `readAgentEventStream()` in `components/wiki-agent.tsx`, plus tests.

### MCP

The MCP transport is `app/api/mcp/route.ts`. Supporting modules are:

- `lib/mcp/auth.ts` — Bearer-token authentication;
- `lib/mcp/api-keys.ts` — key generation, hashing, validation, revocation, and usage logs;
- `lib/mcp/rate-limit.ts` — in-memory hourly limiter;
- `lib/mcp/server.ts` — JSON-RPC/MCP dispatch;
- `lib/mcp/tools.ts` — read-only tools;
- `lib/mcp/errors.ts` — protocol errors and responses.

Current MCP tools are:

- `search_wiki`;
- `get_article`;
- `list_wiki_tree`;
- `list_recent_articles`;
- `get_related_articles`;
- `list_categories`.

To add a tool:

1. add its JSON Schema-style declaration to `mcpTools`;
2. add a Zod input schema;
3. add dispatch and implementation in `callTool()`;
4. ensure every query filters `ArticleStatus.PUBLISHED`;
5. return serializable dates and bounded result sizes;
6. update `docs/MCP-INTEGRATION.md`;
7. add protocol/tool tests.

The server supports SSE sessions, direct POST responses, JSON-RPC batches, heartbeats, and reconnect metadata. The session map and rate limiter are process-local; a multi-instance deployment needs shared storage such as Redis or a coordinated pub/sub layer.

Never expose drafts, write operations, user management, internal Agent controls, API key plaintext, or database/provider errors through MCP.

---

## 14. Content import and image hosting

### Markdown import

The import implementation is `lib/articles/import.ts`, with `scripts/import-articles.ts` as the command entry point.

Supported frontmatter fields are:

- `title`;
- `description`;
- `published`;
- `date`;
- `tags`;
- `editor`;
- `dateCreated` (recognized by the supported-key list, though publication behavior is driven primarily by `date`).

`index.md` maps to the containing path. A first H1 can provide the title and is removed from stored Markdown. Paths are canonicalized before lookup.

Commands:

```bash
pnpm articles:import -- articles
pnpm articles:import -- articles --dry-run
pnpm articles:import -- articles --status=draft
```

The import script reindexes published Agent embeddings after the import. `scripts/import-scraped.ts` is a separate legacy/import path and should not be assumed to have identical post-processing.

### Image hosting

The article editor calls `POST /api/uploads/images`, implemented by `app/api/uploads/images/route.ts`. Storage behavior is in `lib/image-hosting.ts`:

- Vercel Blob is selected when `BLOB_READ_WRITE_TOKEN` is present;
- otherwise S3-compatible configuration is used;
- allowed image types and upload size are validated server-side;
- the returned URL is inserted as Markdown or HTML depending on editor mode.

The route currently uses `canWriteArticles()`, so `ROOT` and `AUTHOR` can upload. Keep documentation and authorization behavior synchronized if this changes.

For local image references in imported Markdown, run image rewriting before article import:

```bash
pnpm articles:import-images -- articles
pnpm articles:import -- articles
```

Both commands support `--dry-run`.

---

## 15. Styling and UI conventions

Tailwind CSS 4 and shadcn/Radix-style primitives are configured by:

- `components.json`;
- `app/globals.css`;
- `postcss.config.mjs`.

The import aliases are:

- `@/components`;
- `@/components/ui`;
- `@/lib`;
- `@/hooks`.

Prefer existing primitives and CSS variables. Use `cn()` from `lib/utils.ts` for conditional class names. Preserve the project's responsive and dark-mode patterns:

- semantic color variables such as `bg-background`, `text-foreground`, and `border-border`;
- `dark:` variants where a component needs explicit dark behavior;
- rounded cards and responsive layouts consistent with nearby screens;
- accessible labels and keyboard behavior for interactive controls.

For a new UI component, check the repository-local shadcn and UI skills under `.agents/skills/` and `.claude/skills/` when applicable. Do not copy a component into `components/ui/` without checking whether an existing primitive already provides the behavior.

---

## 16. Environment variables

Environment values are server-side unless explicitly prefixed for a browser use case. Do not expose secrets through `NEXT_PUBLIC_*` values.

### Database

| Variable | Purpose |
| --- | --- |
| `PARADEDB_DATABASE_URL` | Preferred direct/ParadeDB connection |
| `DIRECT_URL` | Direct PostgreSQL connection fallback |
| `PRISMA_DATABASE_URL` | Prisma connection fallback |
| `POSTGRES_URL` | PostgreSQL connection fallback |
| `DATABASE_URL` | General database fallback |
| `PARADEDB_SSL_MODE` | Set to `disable` for plain TCP ParadeDB endpoints |
| `PRISMA_TRANSACTION_MAX_WAIT_MS` | Optional Agent indexing transaction wait tuning |
| `PRISMA_TRANSACTION_TIMEOUT_MS` | Optional Agent indexing transaction timeout tuning |

### Site metadata

- `SITE_NAME`
- `SITE_DESCRIPTION`
- `SITE_LOGO_URL`
- `SITE_FAVICON_URL`
- `SITE_FOOTER_COPYRIGHT`
- `SITE_FOOTER_ICP`

These are read by `lib/site.ts`; current site settings are not database-backed.

### Authentication and email

- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL` (fallback used by auth/seed code)
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `OIDC_DISCOVERY_URL`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_PROVIDER_NAME`
- `RESEND_API_KEY`
- `EMAIL_FROM`

Without Resend configuration, local verification links are logged by `lib/email.ts` instead of being sent.

### Image hosting

- `BLOB_READ_WRITE_TOKEN`;
- `IMAGE_HOSTING_BUCKET`;
- `IMAGE_HOSTING_REGION`;
- `IMAGE_HOSTING_ACCESS_KEY_ID`;
- `IMAGE_HOSTING_SECRET_ACCESS_KEY`;
- `IMAGE_HOSTING_ENDPOINT`;
- `IMAGE_HOSTING_PUBLIC_URL_BASE`;
- `IMAGE_HOSTING_PATH_PREFIX`;
- `IMAGE_UPLOAD_MAX_BYTES`.

### Agent

- `OPENAI_API_KEY`;
- `OPENAI_API_BASE_URL`;
- `OPENAI_RESPONSES_MODEL`;
- `OPENAI_EMBEDDING_MODEL`;
- `AGENT_EMBEDDING_DIMENSIONS`.

The code uses an OpenAI-compatible gateway. The default chat and embedding values are defined in `lib/agent/openai.ts`; ensure the configured gateway supports both operations when semantic indexing is required.

### MCP

- `MCP_SERVER_API_KEY` — optional global Bearer key;
- `MCP_RATE_LIMIT` — global-key hourly limit.

Per-user MCP keys and limits are stored in the database.

### Seed

- `ROOT_EMAIL`;
- `ROOT_PASSWORD`;
- `ROOT_NAME`.

---

## 17. Testing and verification

Tests use Node's built-in test runner and `tsx`, not Jest, Vitest, Playwright, or Cypress.

Run:

```bash
pnpm test
pnpm lint
pnpm build
```

Tests currently cover:

- path canonicalization and wiki-tree construction;
- article import/frontmatter and image import;
- Markdown rendering;
- auth provider configuration and error mapping;
- permission rules;
- locale proxy behavior;
- Prisma reconnect logic;
- Agent chunking, indexing, tools, graph, OpenAI helpers, and SSE route behavior;
- image hosting;
- i18n.

### Testing patterns

Prefer pure functions and dependency injection for new domain behavior. The Agent and article import modules accept repositories or provider functions specifically so tests do not always require a live database or model provider.

For a new feature, test at the lowest useful layer and add an HTTP/page-level test when the boundary itself is important:

- path and normalization rules: pure unit tests;
- queries and mutation orchestration: injected repository tests or Prisma integration tests;
- API validation and status codes: Route Handler tests;
- SSE changes: parse the emitted event stream;
- permissions: explicit role/verification matrix;
- localized UI: both dictionary keys and route construction.

Before finalizing, verify at least:

1. `pnpm lint`;
2. `pnpm test`;
3. `pnpm build` when the change affects routes, imports, configuration, or client/server boundaries;
4. the relevant migration against a database when the schema changed;
5. both `zh` and `en` routes when the feature is user-facing.

---

## 18. Common pitfalls and known synchronization gaps

These are important repository-specific details to check before extending the system:

1. **The environment template is missing.** `README.md` says to copy `.env.example`, but that file is not tracked in the current repository. Keep README, source references, and deployment configuration synchronized.
2. **MCP documentation has stale details.** The implementation uses the key prefix `lkw_`, while `docs/MCP-INTEGRATION.md` documents `lwk_` in one place. The implementation uses `list_categories`, while an older summary mentions `get_categories`. Update the integration document when changing MCP behavior.
3. **Old MCP test-script references may be stale.** Historical docs refer to `scripts/test-mcp-full.mjs` and `scripts/test-mcp-sse-advanced.mjs`, which are not part of the current tracked script list.
4. **Site settings are environment-backed now.** The `20260922000000_add_site_settings` migration is followed by `20260924120000_drop_site_settings`; use `lib/site.ts` and `SITE_*` variables rather than adding new database settings without a deliberate design decision.
5. **Embedding dimensions must match.** The migration uses `vector(1024)`, while a different embedding model may produce another dimension. Reconfigure the model, environment, migration, and stored data together.
6. **The proxy is only a cookie gate.** A request with a stale or invalid session cookie still reaches the page; server guards remain mandatory.
7. **HTML articles are trusted content.** `WikiHtmlRenderer` uses `dangerouslySetInnerHTML`; do not treat it like sanitized Markdown.
8. **MCP rate limiting is process-local.** The current in-memory limiter is not shared across instances or restarts.
9. **MCP key APIs are per-user, not explicitly root-only.** Confirm the desired authorization policy before expanding or restricting them.
10. **Image upload documentation can diverge from code.** Current code permits authors as well as root users, while some README wording says root-only.
11. **Some auth UI links refer to routes not present in the current tree.** Check existing route files before adding or reusing links such as password reset, terms, or privacy pages.
12. **The ignored `articles/` directory may be absent.** The canonical production content is database-backed; import fixtures may need to be supplied separately.

---

## 19. Feature implementation checklist

Copy this checklist into an issue or pull request description when useful.

### Design and placement

- [ ] Is the feature a public page, admin page, Server Action, Route Handler, domain module, import script, or integration?
- [ ] Is the behavior in the nearest existing `lib/` domain module rather than duplicated in a page or component?
- [ ] Does the feature need server-only code or a client boundary?
- [ ] Have the relevant Next.js 16 docs under `node_modules/next/dist/docs/` been checked?

### Routing and i18n

- [ ] Are `params` and `searchParams` awaited?
- [ ] Is `lang` validated with `hasLocale()`?
- [ ] Are all internal links built with `localizeHref()` or `buildWikiHref()`?
- [ ] Are strings present in both `zh.ts` and `en.ts`?
- [ ] Is metadata and sitemap coverage added where appropriate?

### Security and authorization

- [ ] Does every mutation or API endpoint authenticate independently of the UI/proxy?
- [ ] Is the correct `ROOT`, `AUTHOR`, or verified-user guard used?
- [ ] Is all external input validated and bounded?
- [ ] Are drafts, secrets, stack traces, and internal provider details excluded from public responses?
- [ ] If HTML is involved, is the trust/sanitization boundary explicit?

### Data and consistency

- [ ] Is the Prisma schema updated with appropriate indexes and relations?
- [ ] Is there a new migration rather than an edited old migration?
- [ ] Was `prisma generate` run?
- [ ] Are article search, Agent, MCP, sitemap, tree, and import consumers considered if article data changed?
- [ ] Are old and new paths revalidated when a path changes?
- [ ] Are all affected localized paths revalidated?
- [ ] Are admin mutations logged when appropriate?

### Verification

- [ ] Are unit or boundary tests added?
- [ ] Does `pnpm lint` pass?
- [ ] Does `pnpm test` pass?
- [ ] Does `pnpm build` pass when relevant?
- [ ] Has the feature been checked in both light/dark mode and both supported locales when UI-facing?
- [ ] Have environment, migration, and deployment notes been updated?

---

## 20. Key file index

### Application and routing

- `proxy.ts`
- `app/[lang]/layout.tsx`
- `app/[lang]/wiki/[[...slug]]/page.tsx`
- `app/[lang]/admin/layout.tsx`
- `app/sitemap.ts`
- `next.config.ts`
- `tsconfig.json`

### Authentication and permissions

- `lib/auth/index.ts`
- `lib/auth/session.ts`
- `lib/auth/permissions.ts`
- `lib/auth/provider-config.ts`
- `app/api/auth/[...all]/route.ts`

### Database and mutations

- `prisma/schema.prisma`
- `prisma/migrations/`
- `prisma/seed.ts`
- `lib/prisma.ts`
- `app/actions/admin.ts`
- `app/actions/comments.ts`
- `app/actions/settings.ts`
- `lib/i18n/revalidate.ts`

### Articles, paths, and rendering

- `lib/articles/index.ts`
- `lib/articles/import.ts`
- `lib/articles/image-import.ts`
- `lib/articles/markdown-migrate.ts`
- `lib/wiki/path.ts`
- `lib/wiki/tree.ts`
- `components/markdown-renderer.tsx`
- `components/wiki-html-renderer.tsx`
- `components/article-editor.tsx`

### Search, Agent, and MCP

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

### Developer commands

Defined in `package.json`:

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
