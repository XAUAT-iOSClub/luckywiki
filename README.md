This is a [Next.js](https://nextjs.org) project for LuckyWiki.

## Getting Started

Start by copying the example environment file and filling in the values you need:

```bash
cp .env.example .env
```

Then run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the app immediately after that. Changes update automatically in development.

## Site Settings

Basic site metadata is configured with environment variables instead of the database.

```bash
SITE_NAME=LuckyWiki
SITE_DESCRIPTION=A lightweight knowledge base for your team
SITE_LOGO_URL=https://example.com/logo.png
SITE_FAVICON_URL=https://example.com/favicon.ico
SITE_FOOTER_COPYRIGHT=© 2026 LuckyWiki
SITE_FOOTER_ICP=
```

Notes:

- Update these in your deployment environment, then restart or redeploy the app.
- `SITE_LOGO_URL`, `SITE_FAVICON_URL`, `SITE_FOOTER_COPYRIGHT`, and `SITE_FOOTER_ICP` are optional.
- If `SITE_FAVICON_URL` is empty, the app falls back to `/favicon.ico`.

## Authentication

LuckyWiki supports email/password sign-in by default. You can also enable GitHub and a custom OIDC provider.

Set these server-side environment variables to enable the optional providers:

```bash
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=change-me

# GitHub login
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Custom OIDC login
OIDC_DISCOVERY_URL=https://issuer.example/.well-known/openid-configuration
OIDC_CLIENT_ID=your-oidc-client-id
OIDC_CLIENT_SECRET=your-oidc-client-secret

# Optional. Defaults to "SSO" in the UI.
OIDC_PROVIDER_NAME=Campus SSO
```

Provider callback URLs:

- GitHub: `/api/auth/callback/github`
- OIDC: `/api/auth/oauth2/callback/oidc`

Notes:

- Email/password remains available even when GitHub or OIDC are disabled.
- GitHub and OIDC buttons only appear when the required provider environment variables are fully configured.
- Third-party accounts are linked automatically only when the provider returns a verified email address that matches an existing user.
- For production, `BETTER_AUTH_SECRET` should be a random secret at least 32 characters long.

## Image Hosting

The admin article editor can upload images and insert the Markdown image link automatically.

### Vercel Blob

If you use Vercel Blob, set this server-side environment variable:

```bash
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx

# Optional object key prefix inside the blob store.
IMAGE_HOSTING_PATH_PREFIX=wiki-assets

# Optional upload size limit in bytes. Defaults to 5242880 (5 MB).
IMAGE_UPLOAD_MAX_BYTES=5242880
```

### S3-Compatible Providers

If you use AWS S3, Cloudflare R2, MinIO, or another S3-compatible provider, set these variables instead:

```bash
IMAGE_HOSTING_BUCKET=your-bucket
IMAGE_HOSTING_REGION=auto
IMAGE_HOSTING_ACCESS_KEY_ID=your-access-key
IMAGE_HOSTING_SECRET_ACCESS_KEY=your-secret-key

# Optional but recommended when you front the bucket with a CDN or custom domain.
IMAGE_HOSTING_PUBLIC_URL_BASE=https://cdn.example.com/wiki-assets

# Optional for Cloudflare R2, MinIO, and other S3-compatible services.
IMAGE_HOSTING_ENDPOINT=https://<account-or-host-endpoint>

# Optional object key prefix inside the bucket.
IMAGE_HOSTING_PATH_PREFIX=wiki-assets

# Optional upload size limit in bytes. Defaults to 5242880 (5 MB).
IMAGE_UPLOAD_MAX_BYTES=5242880
```

Notes:

- Uploads are restricted to root admins in the LuckyWiki admin area.
- Vercel Blob uses `BLOB_READ_WRITE_TOKEN` and does not need the S3-style `IMAGE_HOSTING_*` credentials.
- S3-compatible buckets or CDN origins must be publicly readable, otherwise uploaded Markdown image URLs will not render.
- If your storage endpoint is private or internal, set `IMAGE_HOSTING_PUBLIC_URL_BASE` to the public CDN/domain that serves the uploaded files.

## Article Image Import

When importing Markdown articles from disk, run the image pass first so local image references are converted to WebP, uploaded, and rewritten in place:

```bash
npm run articles:import-images -- articles
npm run articles:import -- articles
```

Use `--dry-run` on either command to preview without writing files.

## Wiki Agent

The wiki agent answers questions only from published wiki content and links back to the relevant articles.
It now uses a LangGraph-based runtime with read-only tools for semantic search, article lookup, related articles, recent updates, and path/category navigation.

Set these server-side environment variables before using it:

```bash
OPENAI_API_KEY=your-openai-api-key

# Optional. Defaults to gpt-4.1-mini.
OPENAI_RESPONSES_MODEL=gpt-4.1-mini

# Optional. Defaults to text-embedding-3-small.
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Optional when you proxy OpenAI through a compatible gateway. The root URL
# is also accepted and will be normalized to its `/v1` API endpoint.
OPENAI_API_BASE_URL=https://api.openai.com/v1
```

The chat model and embedding model must both be enabled and priced in the
gateway. If the gateway does not provide embeddings, chat still works with
article/path tools, but semantic retrieval and `npm run agent:index` cannot
run until an embedding model is configured.

After adding the variables, backfill embeddings for existing published articles:

```bash
npm run agent:index
```

## Database Seed

To create the initial root account and default home article:

```bash
pnpm prisma db seed
```

Seed behavior is controlled by:

```bash
ROOT_EMAIL=root@luckywiki.local
ROOT_PASSWORD=ChangeMe123!
ROOT_NAME=LuckyWiki Root
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
