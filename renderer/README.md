# 渲染服务（Playwright）

把 JavaScript 渲染的页面（Angular、React、Vue）渲染成 HTML，给采集器补正文用。不对外开端口。

它的位置在本机已经接好了：`.env` 里有 `RENDER_URL=http://renderer:3000/render`、`RENDER_ALLOW_HOSTS=nfra.gov.cn`，api 和 worker 都在用；`aihot-renderer-1` 容器常驻，空闲约 240MB 内存。

## 起服务

```bash
docker compose --profile render up -d renderer    # 第一次会装 Chromium，几分钟
curl -s localhost:3000/healthz                     # 容器内是 3000，不映射到本机时跳过这步
```

想让它跟着 `docker compose up -d` 一起起，在 `.env` 里加一行 `COMPOSE_PROFILES=render`。

## 接上采集器

`.env` 里加：

```
RENDER_URL=http://renderer:3000/render
RENDER_ALLOW_HOSTS=nfra.gov.cn      # 只允许渲染这些域名，留空不限
```

然后 `docker compose up -d --no-deps api worker` 让两个进程读到新变量。

接上之后，正文抓取的顺序是：直接抓 → 渲染服务 → Jina（付费兜底）。渲染失败会静默跳到下一步，不会让整条资料失败。

页面本身只有空壳、直接抓会抓到版权声明或导航（Readability 会把它们当正文）时，在信源配置里加一项，让它直接走渲染：

```json
{ "render": true }
```

`nfra-*` 那三个信源已经这么配了。不加这项时渲染只是兜底；加了之后正文一定来自渲染结果。

## 直接调它

```bash
curl -s -X POST http://localhost:3000/render \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.nfra.gov.cn/cn/view/pages/ItemDetail.html?docId=1269552&itemId=919","waitFor":".content"}'
```

返回 `{ url, status, title, html }`。`waitFor` 是可选的 CSS 选择器，等它出现再取 HTML；不写就等 `networkidle` 最多 5 秒，再停 1.2 秒。

## 参数

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `RENDER_ALLOW_HOSTS` | 空（不限） | 逗号分隔的域名，按后缀匹配 |
| `RENDER_TIMEOUT_MS` | 30000 | 单页超时 |
| `RENDER_SETTLE_MS` | 1200 | 页面加载完再等的毫秒数 |
| `RENDER_CONCURRENCY` | 2 | 同时渲染几页，超出的排队 |

## 注意

- 镜像约 600MB，Chromium 常驻；不常抓 JS 站时别开 `COMPOSE_PROFILES` 里的 render。
- 服务能渲染任意网址，所以只在内部网络跑，别给它加 `ports`。
- 页面如果还要登录、点验证码，这个服务帮不上；它只负责把公开页面渲染出来。
