This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

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

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

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

## Wiki Agent

The wiki agent answers questions only from published wiki content and links back to the relevant articles.

Set these server-side environment variables before using it:

```bash
OPENAI_API_KEY=your-openai-api-key

# Optional. Defaults to gpt-4.1-mini.
OPENAI_RESPONSES_MODEL=gpt-4.1-mini

# Optional. Defaults to text-embedding-3-small.
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Optional when you proxy OpenAI through a compatible gateway.
OPENAI_API_BASE_URL=https://api.openai.com/v1
```

After adding the variables, backfill embeddings for existing published articles:

```bash
npm run agent:index
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
