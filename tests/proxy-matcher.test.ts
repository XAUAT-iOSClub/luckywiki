import test from "node:test";
import assert from "node:assert/strict";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "@/proxy";
import nextConfig from "@/next.config";

// The matcher is what makes the HTTP-layer redirect work for wiki paths that
// contain a dot (e.g. `/zh/wiki/guide/v1.2`) without also intercepting static
// files such as `/sitemap.xml`.
test("proxy matcher covers wiki paths containing dots but skips static files", () => {
  assert.equal(
    unstable_doesMiddlewareMatch({
      config,
      url: "/zh/wiki/guide/v1.2",
      nextConfig,
    }),
    true,
  );
  assert.equal(
    unstable_doesMiddlewareMatch({
      config,
      url: "/en/wiki/guide",
      nextConfig,
    }),
    true,
  );
  assert.equal(
    unstable_doesMiddlewareMatch({ config, url: "/zh/admin", nextConfig }),
    true,
  );
  assert.equal(
    unstable_doesMiddlewareMatch({ config, url: "/sitemap.xml", nextConfig }),
    false,
  );
  assert.equal(
    unstable_doesMiddlewareMatch({ config, url: "/robots.txt", nextConfig }),
    false,
  );
  assert.equal(
    unstable_doesMiddlewareMatch({ config, url: "/api/v1/articles", nextConfig }),
    false,
  );
  assert.equal(
    unstable_doesMiddlewareMatch({
      config,
      url: "/_next/webpack-hmr",
      nextConfig,
    }),
    false,
  );
});
