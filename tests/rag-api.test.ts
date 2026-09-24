import assert from "node:assert";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { prisma } from "../lib/prisma";
import { hashRagKey } from "../lib/rag/auth";

const testApiKey = `rag_${randomBytes(24).toString("hex")}`;
let testKeyId: string;

test.before(async () => {
  const key = await prisma.ragApiKey.create({
    data: {
      name: "test-key",
      keyHash: hashRagKey(testApiKey),
      keyPrefix: testApiKey.slice(0, 12),
      status: "ACTIVE",
      hourlyLimit: 100,
    },
  });
  testKeyId = key.id;
});

test.after(async () => {
  await prisma.ragCallLog.deleteMany({
    where: { keyId: testKeyId },
  });
  await prisma.ragApiKey.delete({
    where: { id: testKeyId },
  });
});

test("POST /api/v1/rag/search - valid request returns results", async () => {
  const response = await fetch("http://localhost:3000/api/v1/rag/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testApiKey}`,
    },
    body: JSON.stringify({
      query: "校园卡",
      top_k: 5,
      mode: "auto",
      include_content: true,
      include_context: false,
    }),
  });

  assert.equal(response.status, 200);

  const data = (await response.json()) as {
    query: string;
    mode: string;
    top_k: number;
    took_ms: number;
    results: unknown[];
  };

  assert.equal(data.query, "校园卡");
  assert.equal(data.mode, "auto");
  assert.ok(Array.isArray(data.results));
  assert.ok(typeof data.took_ms === "number");
});

test("POST /api/v1/rag/search - missing token returns 401", async () => {
  const response = await fetch("http://localhost:3000/api/v1/rag/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "test",
    }),
  });

  assert.equal(response.status, 401);

  const data = (await response.json()) as {
    error: { code: string; message: string };
  };

  assert.equal(data.error.code, "missing_token");
});

test("POST /api/v1/rag/search - invalid token returns 401", async () => {
  const response = await fetch("http://localhost:3000/api/v1/rag/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer invalid_key",
    },
    body: JSON.stringify({
      query: "test",
    }),
  });

  assert.equal(response.status, 401);

  const data = (await response.json()) as {
    error: { code: string; message: string };
  };

  assert.equal(data.error.code, "invalid_api_key");
});

test("POST /api/v1/rag/search - empty query returns 400", async () => {
  const response = await fetch("http://localhost:3000/api/v1/rag/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testApiKey}`,
    },
    body: JSON.stringify({
      query: "",
    }),
  });

  assert.equal(response.status, 400);

  const data = (await response.json()) as {
    error: { code: string; message: string };
  };

  assert.equal(data.error.code, "validation_error");
});

test("POST /api/v1/rag/search - query too long returns 400", async () => {
  const response = await fetch("http://localhost:3000/api/v1/rag/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testApiKey}`,
    },
    body: JSON.stringify({
      query: "a".repeat(201),
    }),
  });

  assert.equal(response.status, 400);

  const data = (await response.json()) as {
    error: { code: string; message: string };
  };

  assert.equal(data.error.code, "validation_error");
});

test("POST /api/v1/rag/search - invalid JSON returns 400", async () => {
  const response = await fetch("http://localhost:3000/api/v1/rag/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testApiKey}`,
    },
    body: "invalid json",
  });

  assert.equal(response.status, 400);

  const data = (await response.json()) as {
    error: { code: string; message: string };
  };

  assert.equal(data.error.code, "invalid_json");
});

test("POST /api/v1/rag/search - include_context returns context", async () => {
  const response = await fetch("http://localhost:3000/api/v1/rag/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testApiKey}`,
    },
    body: JSON.stringify({
      query: "test",
      top_k: 3,
      include_context: true,
    }),
  });

  assert.equal(response.status, 200);

  const data = (await response.json()) as {
    results: unknown[];
    context?: string;
  };

  if (data.results.length > 0) {
    assert.ok(typeof data.context === "string");
  }
});

test("POST /api/v1/rag/search - mode=lexical uses lexical search only", async () => {
  const response = await fetch("http://localhost:3000/api/v1/rag/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${testApiKey}`,
    },
    body: JSON.stringify({
      query: "test",
      mode: "lexical",
      top_k: 3,
    }),
  });

  assert.equal(response.status, 200);

  const data = (await response.json()) as {
    mode: string;
    results: Array<{ match_types: string[] }>;
  };

  assert.equal(data.mode, "lexical");
});

test("GET /api/v1/rag/articles/{path} - returns published article", async () => {
  const article = await prisma.article.findFirst({
    where: { status: "PUBLISHED" },
  });

  if (!article) {
    console.log("No published articles found, skipping test");
    return;
  }

  const response = await fetch(
    `http://localhost:3000/api/v1/rag/articles/${encodeURIComponent(article.path)}`,
    {
      headers: {
        Authorization: `Bearer ${testApiKey}`,
      },
    },
  );

  assert.equal(response.status, 200);

  const data = (await response.json()) as {
    path: string;
    title: string;
    content: string;
  };

  assert.equal(data.path, article.path);
  assert.equal(data.title, article.title);
  assert.ok(typeof data.content === "string");
});

test("GET /api/v1/rag/articles/{path} - non-existent article returns 404", async () => {
  const response = await fetch(
    "http://localhost:3000/api/v1/rag/articles/non-existent-path",
    {
      headers: {
        Authorization: `Bearer ${testApiKey}`,
      },
    },
  );

  assert.equal(response.status, 404);

  const data = (await response.json()) as {
    error: { code: string; message: string };
  };

  assert.equal(data.error.code, "not_found");
});

test("Rate limiting - exceeding hourly limit returns 429", async () => {
  const limitedKey = `rag_${randomBytes(24).toString("hex")}`;
  const limited = await prisma.ragApiKey.create({
    data: {
      name: "limited-key",
      keyHash: hashRagKey(limitedKey),
      keyPrefix: limitedKey.slice(0, 12),
      status: "ACTIVE",
      hourlyLimit: 2,
    },
  });

  try {
    await fetch("http://localhost:3000/api/v1/rag/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${limitedKey}`,
      },
      body: JSON.stringify({ query: "test1" }),
    });

    await fetch("http://localhost:3000/api/v1/rag/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${limitedKey}`,
      },
      body: JSON.stringify({ query: "test2" }),
    });

    const response = await fetch("http://localhost:3000/api/v1/rag/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${limitedKey}`,
      },
      body: JSON.stringify({ query: "test3" }),
    });

    assert.equal(response.status, 429);

    const data = (await response.json()) as {
      error: { code: string; retry_after_seconds: number };
    };

    assert.equal(data.error.code, "rate_limited");
    assert.ok(typeof data.error.retry_after_seconds === "number");
  } finally {
    await prisma.ragCallLog.deleteMany({ where: { keyId: limited.id } });
    await prisma.ragApiKey.delete({ where: { id: limited.id } });
  }
});
