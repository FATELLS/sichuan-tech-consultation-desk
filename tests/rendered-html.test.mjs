import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

const assets = {
  fetch: async () => new Response("Not found", { status: 404 }),
};

test("server-renders the consultation response platform", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    { ASSETS: assets },
    executionContext,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>川科讯｜科技信息咨询响应平台<\/title>/);
  assert.match(html, /四川省科学技术信息研究所/);
  assert.match(html, /来电不慌/);
  assert.match(html, /咨询工作台/);
  assert.match(html, /小科助手/);
  assert.match(html, /内部示意 Demo/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});

test("chat endpoint rejects unconfigured calls without leaking configuration", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/xk-assistant/respond", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        persona: "科技型企业",
        messages: [{ role: "user", content: "创新券怎么申领？" }],
      }),
    }),
    { ASSETS: assets },
    executionContext,
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /尚未配置服务密钥/);
  assert.doesNotMatch(
    JSON.stringify(body),
    /Bearer|GLM_API_KEY|hard-coded-secret-marker/,
  );
});

test("assistant health route exposes no secret", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/xk-assistant/health"),
    { ASSETS: assets, GLM_API_KEY: "test-only-key" },
    executionContext,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.model, "glm-5.2");
  assert.equal(body.configured, true);
  assert.doesNotMatch(JSON.stringify(body), /test-only-key|Bearer/);
});

test("local production health route reads process environment", async () => {
  const worker = await loadWorker();
  const previous = process.env.GLM_API_KEY;
  process.env.GLM_API_KEY = "local-production-test-key";

  try {
    const response = await worker.fetch(
      new Request("http://localhost/xk-assistant/health"),
      undefined,
      executionContext,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.configured, true);
    assert.doesNotMatch(JSON.stringify(body), /local-production-test-key/);
  } finally {
    if (previous === undefined) {
      delete process.env.GLM_API_KEY;
    } else {
      process.env.GLM_API_KEY = previous;
    }
  }
});

test("keeps secrets out of committed source and ships the social preview", async () => {
  const [workerSource, gitignore] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);

  assert.match(workerSource, /runtimeValue\(env, "GLM_API_KEY"\)/);
  assert.match(workerSource, /process\.env\[key\]/);
  assert.match(workerSource, /model:\s*"glm-5\.2"/);
  assert.match(workerSource, /xk-assistant\/respond/);
  assert.match(workerSource, /不披露非公开企业数据/);
  assert.doesNotMatch(workerSource, /GLM_API_KEY\s*=\s*["'][^"']+/);
  assert.match(gitignore, /\.dev\.vars\*/);
});
