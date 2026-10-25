// 中保协（iachina.cn）的列表把条目放在 <script type="text/xml"><datastore><![CDATA[…]]> 里，
// 通用 web_list 抓取取不到 li，所以改成外部推送：本脚本解析各栏目首页，把条目 POST 到 /api/ingest/items。
//
// 用法（Node 24 可直接跑 TS）：
//   node --env-file=.env scripts/push-iachina.ts --dry    # 只打印，不推送
//   node --env-file=.env scripts/push-iachina.ts          # 真正推送
//
// 定时：每小时一次即可，例如 crontab：
//   0 * * * * cd /path/to/baoxian.news && node --env-file=.env scripts/push-iachina.ts >> .data/iachina.log 2>&1
//
// 需要 .env 里配置 INGEST_TOKEN（至少 16 位），否则接口是关闭的。

const COLUMNS = [
  { id: 1724, name: "监管要闻" },
  { id: 22, name: "协会要闻" },
  { id: 23, name: "行业要闻" },
  { id: 24, name: "公告通知" },
];
// 条款费率（col38）、法律法规（col37）等栏目是另一套模板，首页没有 li 列表，需要单独适配后再加。

/** 每个栏目只取最新这些条，避免一次推送太多。 */
const PER_COLUMN = 15;
/** 接口单次最多 50 条，留点余量。 */
const BATCH = 40;
const BASE = "https://www.iachina.cn";
const SOURCE_ID = "iachina";
const SOURCE_NAME = "中国保险行业协会";

/**
 * 协会站一天里大半是事务性公告（采购、中标、招聘、系统改造），对读者没有价值。
 * 命中这些词的标题直接丢掉；真要保留某一条，写进 KEEP 里。
 */
const DROP = ["采购", "中标", "成交公告", "招标", "询价", "比价", "招聘", "OA系统", "竞争性磋商", "废标", "流标"];
const KEEP: string[] = [];

interface Item {
  title: string;
  url: string;
  publishedAt: string;
  column: string;
}

const strip = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

function parseColumn(html: string, column: string): Item[] {
  const out: Item[] = [];
  for (const chunk of html.split("<li>").slice(1)) {
    const link = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
    const date = /(\d{4}-\d{2}-\d{2})/.exec(chunk);
    if (!link || !date) continue;
    const title = strip(link[2]).replace(/^【[^】]*】/, "").trim();
    if (title.length < 4) continue;
    const href = link[1]!.startsWith("http") ? link[1]! : new URL(link[1]!, BASE).toString();
    out.push({ title, url: href, publishedAt: date[1]!, column });
    if (out.length >= PER_COLUMN) break;
  }
  return out;
}

const dry = process.argv.includes("--dry");
const token = process.env.INGEST_TOKEN?.trim() ?? "";
const api = (process.env.API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");

if (!dry && token.length < 16) {
  console.error("缺少 INGEST_TOKEN（至少 16 位），无法推送");
  process.exit(1);
}

const seen = new Set<string>();
const items: Item[] = [];
for (const column of COLUMNS) {
  const url = `${BASE}/col/col${column.id}/index.html`;
  try {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; BaoxianHotBot/1.0)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseColumn(await res.text(), column.name).filter((item) => {
      if (KEEP.some((k) => item.title.includes(k))) return true;
      return !DROP.some((k) => item.title.includes(k));
    });
    let fresh = 0;
    for (const item of parsed) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
      fresh += 1;
    }
    console.log(`${column.name}: 取到 ${parsed.length} 条，新增 ${fresh} 条`);
  } catch (error) {
    console.error(`${column.name}: 抓取失败 ${String(error)}`);
  }
}

items.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
console.log(`合计 ${items.length} 条待推送`);

if (dry) {
  for (const item of items.slice(0, 8)) console.log(`  - ${item.publishedAt.slice(0, 10)} ${item.title.slice(0, 40)} | ${item.column}`);
  process.exit(0);
}

let created = 0;
for (let i = 0; i < items.length; i += BATCH) {
  const batch = items.slice(i, i + BATCH);
  const res = await fetch(`${api}/api/ingest/items`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      sourceId: SOURCE_ID,
      sourceName: SOURCE_NAME,
      items: batch.map(({ title, url, publishedAt, column }) => ({
        title,
        url,
        publishedAt,
        raw: { iachina: { column } },
      })),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`推送失败 HTTP ${res.status}: ${text.slice(0, 200)}`);
    process.exit(1);
  }
  const body = JSON.parse(text) as { created?: number };
  created += body.created ?? 0;
  console.log(`已推送 ${batch.length} 条，新增 ${body.created ?? 0} 条`);
}

console.log(`完成：新增 ${created} 条`);
