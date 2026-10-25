// Headless renderer for JavaScript-rendered pages (Angular, React, Vue SPAs).
// One POST /render {url} returns the rendered HTML; the collector's body extractor uses it when a
// plain HTTP fetch only returns the empty shell. Internal only: no published port in compose.
import http from "node:http";
import { chromium } from "playwright";

const PORT = Number(process.env.PORT ?? 3000);
const TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS ?? 30_000);
const SETTLE_MS = Number(process.env.RENDER_SETTLE_MS ?? 1_200);
const CONCURRENCY = Number(process.env.RENDER_CONCURRENCY ?? 2);
const ALLOW = (process.env.RENDER_ALLOW_HOSTS ?? "")
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter(Boolean);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

let browser = null;
let active = 0;
const queue = [];

async function getBrowser() {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  return browser;
}

function allowed(url) {
  if (!ALLOW.length) return true;
  const host = url.hostname.toLowerCase();
  return ALLOW.some((rule) => host === rule || host.endsWith(`.${rule}`));
}

async function render({ url, waitFor, waitMs = SETTLE_MS, timeoutMs = TIMEOUT_MS }) {
  let target;
  try {
    target = new URL(String(url));
  } catch {
    throw new Error("url must be absolute");
  }
  if (!/^https?:$/.test(target.protocol)) throw new Error("only http(s) urls");
  if (!allowed(target)) throw new Error(`host not allowed: ${target.hostname}`);

  const context = await (await getBrowser()).newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  // The text is what matters: skip images, media and fonts to keep a render to a few seconds.
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "media" || type === "font") return route.abort();
    return route.continue();
  });
  try {
    const response = await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: timeoutMs }).catch(() => {});
    else await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    return {
      url: page.url(),
      status: response?.status() ?? null,
      title: await page.title(),
      html: await page.content(),
    };
  } finally {
    await context.close();
  }
}

function acquire() {
  if (active < CONCURRENCY) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

function release() {
  const next = queue.shift();
  if (next) next();
  else active -= 1;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    return json(res, 200, { ok: true, active, queued: queue.length, started: !!browser?.isConnected() });
  }
  if (req.method !== "POST" || req.url !== "/render") {
    return json(res, 404, { error: "POST /render" });
  }
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return json(res, 400, { error: String(error.message ?? error) });
  }
  await acquire();
  try {
    const out = await render(body);
    return json(res, 200, out);
  } catch (error) {
    return json(res, 502, { error: String(error.message ?? error) });
  } finally {
    release();
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`renderer listening on ${PORT} (allow: ${ALLOW.length ? ALLOW.join(",") : "*"}, concurrency ${CONCURRENCY})`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    server.close();
    await browser?.close().catch(() => {});
    process.exit(0);
  });
}
