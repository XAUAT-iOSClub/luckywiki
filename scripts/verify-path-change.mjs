#!/usr/bin/env node
/**
 * End-to-end verification for path changes and redirects (scenarios F/G/H/I).
 *
 * It drives the running app over HTTP (and uses `docker exec psql` only for the
 * two steps that have no public API: publishing a draft and inspecting rows),
 * creates its own fixtures under a unique `qa-verify-<timestamp>/` prefix and
 * removes them again, including the temp webhook and API key.
 *
 * Usage:
 *   ROOT_EMAIL=root@luckywiki.local ROOT_PASSWORD=*** \
 *   BASE_URL=http://localhost:3000 \
 *   node scripts/verify-path-change.mjs
 *
 * Optional:
 *   DB_CONTAINER=paradedb DB_NAME=luckywiki DB_USER=postgres
 *
 * Requires Node 20+ (global fetch / headers.getSetCookie).
 */

import http from "node:http";
import { execFileSync } from "node:child_process";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;
const DB_CONTAINER = process.env.DB_CONTAINER ?? "paradedb";
const DB_NAME = process.env.DB_NAME ?? "luckywiki";
const DB_USER = process.env.DB_USER ?? "postgres";
const RUN = `qa-verify-${Date.now()}`;
const KEY_NAME = `qa-verify-key-${RUN}`;

if (!ROOT_EMAIL || !ROOT_PASSWORD) {
  console.error("ROOT_EMAIL 与 ROOT_PASSWORD 必填（需要一个 ROOT 账号来创建 API Key/Webhook、读日志页）。");
  process.exit(2);
}

const failures = [];
let passCount = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passCount += 1;
    console.log(`PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}  ${detail}`);
  }
}

function sql(query) {
  return execFileSync(
    "docker",
    ["exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-t", "-A", "-c", query],
    { encoding: "utf8" },
  ).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let cookie = "";

async function api(path, options = {}) {
  const headers = { Origin: BASE, ...(options.headers ?? {}) };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  return { status: response.status, text, headers: response.headers };
}

async function signIn() {
  const response = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: ROOT_EMAIL, password: ROOT_PASSWORD }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`ROOT 登录失败: ${response.status} ${await response.text()}`);
  }
  const setCookies = response.headers.getSetCookie();
  cookie = setCookies.map((value) => value.split(";")[0]).join("; ");
}

async function createArticle(payload) {
  return api("/api/v1/articles", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
}

async function moveArticle(fromPath, toPath, rewriteLinks = true) {
  return api(`/api/v1/articles/${encodeURI(fromPath)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ path: toPath, rewriteLinks }),
  });
}

/** Follows the proxy, so 308/410 are observed without redirect handling. */
async function probe(path) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(180_000),
  });
  return { status: response.status, location: response.headers.get("location") ?? "" };
}

async function waitForProbe(path, expectedStatus, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let last = { status: 0, location: "" };
  while (Date.now() < deadline) {
    last = await probe(path);
    if (last.status === expectedStatus) return last;
    await sleep(500);
  }
  return last;
}

async function pageHeading(path) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(180_000),
  });
  const html = await response.text();
  const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "";
  return {
    status: response.status,
    heading: heading.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
    html,
  };
}

async function waitForHeading(path, expectedHeading, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let last = { status: 0, heading: "", html: "" };
  while (Date.now() < deadline) {
    last = await pageHeading(path);
    if (last.heading === expectedHeading) return last;
    await sleep(500);
  }
  return last;
}

// ---------------------------------------------------------------------------
// Webhook receiver (local)
// ---------------------------------------------------------------------------
const webhookEvents = [];
const receiver = http.createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    try {
      webhookEvents.push(JSON.parse(body));
    } catch {
      webhookEvents.push({ raw: body });
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
  });
});

const receiverPort = await new Promise((resolve, reject) => {
  receiver.once("error", reject);
  receiver.listen(0, "127.0.0.1", () => resolve(receiver.address().port));
});

let apiKey = "";
let apiKeyId = "";
let webhookId = "";

async function cleanup() {
  try {
    if (webhookId) {
      await api(`/api/admin/webhooks/${webhookId}`, { method: "DELETE" });
    }
  } catch (error) {
    console.warn("cleanup webhook failed:", error.message);
  }
  try {
    if (apiKeyId) {
      await api(`/api/admin/mcp-keys/${apiKeyId}`, { method: "DELETE" });
    }
  } catch (error) {
    console.warn("cleanup api key failed:", error.message);
  }
  try {
    sql(`delete from articles where path like '${RUN}/%'`);
    sql(`delete from mcp_api_keys where name = '${KEY_NAME}'`);
  } catch (error) {
    console.warn("cleanup db failed:", error.message);
  }
  receiver.closeAllConnections?.();
  receiver.close();
}

try {
  console.log(`BASE=${BASE}  RUN=${RUN}`);

  // --- setup -------------------------------------------------------------
  await signIn();

  const keyResponse = await api("/api/admin/mcp-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: KEY_NAME }),
  });
  if (keyResponse.status !== 201) throw new Error(`创建 API Key 失败: ${keyResponse.text}`);
  const keyData = JSON.parse(keyResponse.text).data;
  apiKey = keyData.key;
  apiKeyId = keyData.id;

  const hookResponse = await api("/api/admin/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `qa-hook-${RUN}`,
      url: `http://127.0.0.1:${receiverPort}/hook`,
      events: ["article.moved"],
    }),
  });
  if (hookResponse.status !== 201) throw new Error(`创建 Webhook 失败: ${hookResponse.text}`);
  webhookId = JSON.parse(hookResponse.text).data.id;

  // --- F: draft / archive -------------------------------------------------
  console.log("\n===== F 草稿与归档 =====");
  const draftPath = `${RUN}/draft/one`;
  const draftTarget = `${RUN}/draft/two`;
  const draftTitle = `QA Verify Draft ${RUN}`;

  let response = await createArticle({
    title: draftTitle,
    path: draftPath,
    markdown: "# draft",
    status: "DRAFT",
  });
  check("F1 创建草稿", response.status === 201, `status=${response.status} ${response.text}`);

  const draftPage = await pageHeading(`/zh/wiki/${draftPath}`);
  check(
    "F2 草稿旧地址不展示内容（标题不泄漏）",
    draftPage.status === 200 && !draftPage.html.includes(draftTitle),
    `status=${draftPage.status}`,
  );
  response = await api(`/api/v1/articles/${draftPath}`);
  check("F3 草稿 API 404", response.status === 404, `status=${response.status}`);

  response = await moveArticle(draftPath, draftTarget);
  const movedDraft = response.status === 200 ? JSON.parse(response.text).data : null;
  check(
    "F4 草稿改路径走统一移动服务",
    response.status === 200 &&
      movedDraft?.oldPath === draftPath &&
      movedDraft?.path === draftTarget &&
      movedDraft?.movedCount === 1,
    `status=${response.status} ${response.text}`,
  );

  sql(
    `update articles set status='PUBLISHED', published_at=now() where path='${draftTarget}'`,
  );
  let result = await waitForProbe(`/zh/wiki/${draftPath}`, 308);
  check(
    "F5 发布后旧地址 308 到新地址",
    result.status === 308 && result.location.endsWith(`/zh/wiki/${draftTarget}`),
    `status=${result.status} location=${result.location}`,
  );
  const publishedPage = await waitForHeading(`/zh/wiki/${draftTarget}`, draftTitle);
  check(
    "F6 发布后新地址可访问且标题正确",
    publishedPage.status === 200 && publishedPage.heading === draftTitle,
    `status=${publishedPage.status} heading=${publishedPage.heading}`,
  );

  response = await api(`/api/v1/articles/${draftTarget}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  check("F7 归档文章", response.status === 200 && response.text.includes("archived"), `status=${response.status}`);

  result = await waitForProbe(`/zh/wiki/${draftTarget}`, 410);
  check("F8 归档后当前地址 410", result.status === 410, `status=${result.status}`);
  result = await waitForProbe(`/zh/wiki/${draftPath}`, 410);
  check("F9 归档后旧地址 410", result.status === 410, `status=${result.status}`);

  // --- G: path reuse ------------------------------------------------------
  console.log("\n===== G 路径复用 =====");
  const reusePath = `${RUN}/reuse/old`;
  const reuseTarget = `${RUN}/reuse/new`;
  const oldTitle = `QA Verify Old ${RUN}`;
  const newTitle = `QA Verify New ${RUN}`;

  response = await createArticle({
    title: oldTitle,
    path: reusePath,
    markdown: "# old",
    status: "PUBLISHED",
  });
  check("G1 创建旧路径文章", response.status === 201, `status=${response.status}`);

  response = await moveArticle(reusePath, reuseTarget, false);
  check("G2 移动到新路径", response.status === 200, `status=${response.status}`);

  result = await waitForProbe(`/zh/wiki/${reusePath}`, 308);
  check("G3 旧地址此时 308", result.status === 308, `status=${result.status}`);

  response = await createArticle({
    title: newTitle,
    path: reusePath,
    markdown: "# new",
    status: "PUBLISHED",
  });
  check("G4 用旧路径新建文章", response.status === 201, `status=${response.status}`);

  // The sidebar still lists other article titles, so compare the article H1.
  const reusePage = await waitForHeading(`/zh/wiki/${reusePath}`, newTitle);
  check(
    "G5 旧地址展示新文章（H1 为新标题）",
    reusePage.status === 200 && reusePage.heading === newTitle,
    `status=${reusePage.status} heading=${reusePage.heading}`,
  );
  const redirectCount = sql(
    `select count(*) from article_redirects where old_path='${reusePath}'`,
  );
  check("G6 路径复用后重定向被清理", redirectCount === "0", `count=${redirectCount}`);

  // --- H: cascade + webhook + logs ---------------------------------------
  console.log("\n===== H 日志与 Webhook =====");
  const movePath = `${RUN}/move/a`;
  const moveTarget = `${RUN}/move/b`;
  const refsPath = `${RUN}/refs`;
  for (const [title, path, markdown] of [
    ["QA Move A", movePath, "# move"],
    ["QA Move Child", `${movePath}/child`, "# move"],
    ["QA Move Deep", `${movePath}/child/deep`, "# move"],
    ["QA Refs", refsPath, `# refs\n\n[child](/zh/wiki/${movePath}/child)`],
  ]) {
    response = await createArticle({ title, path, markdown, status: "PUBLISHED" });
    if (response.status !== 201) throw new Error(`创建移动夹具失败: ${response.text}`);
  }

  webhookEvents.length = 0;
  response = await moveArticle(movePath, moveTarget, true);
  const moved = response.status === 200 ? JSON.parse(response.text).data : null;
  check(
    "H1 一次移动整棵子树（3 页）",
    response.status === 200 && moved?.movedCount === 3 && moved?.redirectsCreated === 3,
    `status=${response.status} ${response.text}`,
  );

  let event = null;
  for (let i = 0; i < 20 && !event; i += 1) {
    event = webhookEvents.find((item) => item?.move?.oldPath === movePath) ?? null;
    if (!event) await sleep(500);
  }
  check("H2 webhook 收到 article.moved", Boolean(event), `events=${webhookEvents.length}`);
  check(
    "H3 payload 含 move 明细",
    Boolean(event) &&
      event.move.newPath === moveTarget &&
      event.move.movedCount === 3 &&
      event.move.redirectsCreated === 3 &&
      event.move.items.length === 3,
    JSON.stringify(event?.move),
  );

  let delivery = null;
  for (let i = 0; i < 15 && !delivery; i += 1) {
    response = await api("/api/admin/webhooks");
    if (response.status === 200) {
      const hooks = JSON.parse(response.text).data;
      const hook = hooks.find((item) => item.id === webhookId);
      if (hook?.recentDeliveries?.[0]?.status === "success") delivery = hook.recentDeliveries[0];
    }
    if (!delivery) await sleep(1000);
  }
  check("H4 webhook 投递日志为 success", Boolean(delivery), "delivery log not success");

  response = await api("/zh/admin/logs");
  let logsText = response.text;
  for (let i = 0; i < 10; i += 1) {
    if (logsText.includes("因路径变更重写旧链接")) break;
    await sleep(500);
    logsText = (await api("/zh/admin/logs")).text;
  }
  check(
    "H5 日志页显示移动文章/文件夹/链接重写",
    response.status === 200 &&
      logsText.includes("移动文章") &&
      logsText.includes("重命名文件夹") &&
      logsText.includes("因路径变更重写旧链接"),
    `status=${response.status}`,
  );

  // --- I: REST / pages API -----------------------------------------------
  console.log("\n===== I REST / pages 接口 =====");
  const occupiedPath = `${RUN}/occupied`;
  response = await createArticle({
    title: `QA Occupied ${RUN}`,
    path: occupiedPath,
    markdown: "# occupied",
    status: "PUBLISHED",
  });
  if (response.status !== 201) throw new Error(`创建冲突夹具失败: ${response.text}`);

  result = await waitForProbe(`/api/v1/articles/${movePath}`, 308);
  check(
    "I1 v1 GET 旧路径 308",
    result.status === 308 && result.location.endsWith(`/api/v1/articles/${moveTarget}`),
    `status=${result.status} location=${result.location}`,
  );
  result = await waitForProbe(`/api/pages/${movePath}`, 308);
  check(
    "I2 pages 旧路径 308",
    result.status === 308 && result.location.endsWith(`/api/pages/${moveTarget}`),
    `status=${result.status} location=${result.location}`,
  );

  const restTarget = `${RUN}/rest/moved`;
  response = await moveArticle(moveTarget, restTarget, true);
  const restMoved = response.status === 200 ? JSON.parse(response.text).data : null;
  check(
    "I3 v1 PUT 改路径返回计数字段",
    response.status === 200 &&
      restMoved?.oldPath === moveTarget &&
      typeof restMoved?.movedCount === "number" &&
      typeof restMoved?.redirectsCreated === "number" &&
      typeof restMoved?.linkRewriteCount === "number",
    `status=${response.status} ${response.text}`,
  );

  response = await moveArticle(restTarget, occupiedPath);
  const conflict = response.status === 409 ? JSON.parse(response.text) : null;
  check(
    "I4 冲突 409 + conflictPath",
    response.status === 409 && conflict?.conflictPath === occupiedPath,
    `status=${response.status} ${response.text}`,
  );

  response = await api(`/api/v1/articles/${draftTarget}`);
  check("I5 归档文章 API 410", response.status === 410, `status=${response.status}`);
  response = await api(`/api/v1/articles/${reuseTarget}`);
  check("I6 路径复用后的新文章 API 200", response.status === 200, `status=${response.status}`);
} catch (error) {
  console.error("VERIFY FAILED:", error);
  failures.push("unexpected error");
} finally {
  await cleanup();
  console.log("");
  if (failures.length > 0) {
    console.log(`FAILURES (${failures.length}): ${failures.join(", ")}`);
    console.log(`fixtures under '${RUN}/' were cleaned up; logs remain for audit.`);
    process.exitCode = 1;
  } else {
    console.log(`ALL ${passCount} CHECKS PASSED (fixtures cleaned up)`);
  }
}
