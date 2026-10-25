# 保险行业 RSS 订阅源（国内 / 国外合并核查版）

核查日期：2026-10-23。这是工作笔记，不是站点配置。

核查方法：对去重后的候选地址逐个发一次 GET（curl 跟随跳转、桌面浏览器 UA、20 秒超时），只看 HTTP 状态码、Content-Type 和响应里能不能解析出 `<item>`。**没有判断内容质量，也不代表在 Feedly / Inoreader 里一定可用**——那些服务的出口 IP 与本机不同，被 Cloudflare 拦的站点常常对它们放行。

## 先说结论

1. **可用 23 个地址里，国外 22 个、中文 1 个（中国台湾，见 1.2）。** 本站的「国际」分类用的是这 22 个国外地址；那 1 个中文源不在国际里。国内不是"没找全"，是结构性的：监管机构、行业协会、行业报纸的官网都不提供 RSS，实测三家主要官网首页均无任何 `rss` / `.xml` 入口。
2. **原始调研里有 7 个地址是错的或已失效**（III 博客、CNN Money、IIHS、Asia Insurance Review 三个 feed 等），已在正文标出，不要再照抄。
3. **接入采集器后 Coverager 被停用**：它按 UA 拦爬虫（浏览器 UA 200、站点爬虫 UA 403），站内没有按信源改 UA 的配置。实际在跑的是 21 个。
4. 本项目的 `sources.kind` 本来就支持 `rss`（见 `0001_core.sql` 的 CHECK 约束），接国外源不需要改代码。国内源继续走现有的 `web_list` / `json_list` / `mp_account`，不要为了"统一用 RSS"退回到更差的方案。

## 一、国内（中文）

### 1.1 确认没有原生 RSS 的机构（实测首页无入口）

| 机构 | 官网 | 实测结果 | 本站现在怎么拿 |
|---|---|---|---|
| 国家金融监督管理总局 | nfra.gov.cn | 200，首页无 rss/xml 入口 | JSON 接口 + 渲染服务抓正文 |
| 中国银行保险报 | cbimc.cn | 200，首页仅 12KB（壳页），无 rss/xml | 未接，可考虑公众号 |
| 中国保险行业协会 | iachina.cn | 200，107KB，无 rss/xml | 外部推送（每小时四条栏目） |
| 中国保险学会《保险资讯》 | — | 付费内部电子刊物，非公开 feed | 学会公众号 |
| 西红精算 | GitHub Pages | 无 feed | 未接，价值不高 |

结论：国内这几家没有需要"再核实"的余地——官网层面就不提供订阅入口，只能在采网页、采公众号、自建生成器三条路里选。

### 1.2 有 feed，但停更或半死

| 来源 | 地址 | 实测 | 判断 |
|---|---|---|---|
| 中国台湾 · 寿险公会（保单分红） | `https://lia-roc.org.tw/storage/uploads/rss/D0DMM.xml` | 200，`text/xml`，**仅 1 条，2015-02-02** | 有订阅页面（"本會RSS訂閱與下載"），但 feed 十年前就停了。不要接 |
| 中国台湾 · 保险犯罪防治中心（最新消息） | `http://www.iafi.org.tw/TW/customer/ugC_RSS.asp?SID=4` | 200，`text/xml`，14 条 | 唯一实测可用的中文 feed。但是 HTTP 明文、站点老旧、内容偏犯罪防治，与本行业新闻关系弱 |

### 1.3 想要中文 feed 的四条替代路径，按成本排序

1. **直接采网页列表**（本项目已有的 `web_list`）。稳定、可控、不依赖第三方，代价是要为每个站写解析规则，改版会坏。
2. **采公众号**（`mp_account` + 极致了）。内容质量最好，成本 0.14 元/次列表 + 0.03 元/篇正文。国内保险媒体的主战场就在公众号。
3. **自建 RSSHub**。思路可行，但**本次没能证实存在现成路由**：公共实例 `rsshub.app` 从本机连不上（请求无响应），文档站也没打开。如果要用，需要自建实例、自己写或验证路由，属于新增运维负担，不建议为了三四个源上一套服务。
4. **第三方 feed 生成器**（RSS.app、Feedspot、newsloth）。粘贴 URL 就能出 feed，但这类服务对反爬严格的国内站点成功率低，且抓取行为、稳定性、合规性都不由自己控制，不适合做日更主线。

## 二、国外

### 2.1 实测可用（200，能解析出条目）

**行业新闻**

| 来源 | 地址 | 实测条目数 |
|---|---|---|
| Insurance Journal | `https://www.insurancejournal.com/rss/news` | 30（`/feed/` 等价，同样 30 条，二选一） |
| Claims Journal（理赔） | `https://www.claimsjournal.com/rss/news` | 15 |
| Business Insurance | `https://www.businessinsurance.com/rss` | 20 |
| Carrier Management（承保与财险经营） | `https://www.carriermanagement.com/feed/` | 10 |
| Risk & Insurance | `https://riskandinsurance.com/feed/` | 10 |

**监管**

| 来源 | 地址 | 实测条目数 |
|---|---|---|
| 英格兰银行 · 审慎监管出版物 | `https://www.bankofengland.co.uk/rss/prudential-regulation-publications` | 50 |
| 瑞士 FINMA | `https://www.finma.ch/en/rss/news/` | 50 |
| 欧盟 EIOPA | `https://www.eiopa.europa.eu/feed/68/rss_en` | 139（栏目范围偏技术文件，接之前先看几条内容） |

**保险科技**

| 来源 | 地址 | 实测条目数 |
|---|---|---|
| The Digital Insurer | `https://www.the-digital-insurer.com/feed` | 10 |
| Coverager | `https://coverager.com/feed/` | 10（**采集器 403，已停用**，见 2.2） |
| Digital Insurance | `https://www.dig-in.com/feed?rss=true` | 10 |
| InsurTech NY | `https://insurtechny.com/feed` | 6（单条体积大，542KB，注意入库量） |
| Socotra 博客（核心系统） | `https://socotra.com/feed` | 9 |

**再保险、精算、风险管理**

| 来源 | 地址 | 实测条目数 |
|---|---|---|
| Commercial Risk | `https://www.commercialriskonline.com/feed/` | 100（历史条目多，首次入库要限条数） |
| The Actuary（SOA 杂志） | `https://theactuarymagazine.org/feed/` | 10 |
| SOA 播客 | `https://soapodcasts.libsyn.com/rssfeed` | 100（音频，非文章） |
| SOA Get Plugged In | `https://getpluggedin.libsyn.com/rss` | 65（音频，非文章） |

**公司公告**

| 来源 | 地址 | 实测条目数 |
|---|---|---|
| Aon 全部新闻稿 | `https://aon.mediaroom.com/news-releases?pagetemplate=rss` | 5 |
| Aon plc（819） | `https://aon.mediaroom.com/news-releases?category=819&pagetemplate=rss` | 5（与全部新闻稿基本重合） |
| Aon Health Solutions（829） | 同上换 `category=829` | **0（空 feed）** |
| Aon Reinsurance Solutions（825） | 同上换 `category=825` | **0（空 feed）** |

Accenture Insurance Blog（`https://insuranceblog.accenture.com/feed`，55 条）也可以接，但它是咨询公司营销内容，密度低，只适合当补充。

### 2.2 被拦下，但可能在阅读器里能用

本机请求返回 403 / 500 / 连接失败。这些站不像失效，更像反爬或地区限制，**换成 Feedly / Inoreader 可能正常**，值得试一次再决定。

| 来源 | 地址 | 实测 |
|---|---|---|
| Insurance Business | `https://www.insurancebusinessmag.com/us/rss/` | 403（Cloudflare；`/uk/rss/`、去掉尾斜杠同样 403） |
| Artemis（再保险、ILS） | `https://www.artemis.bm/feed/` | 403（`/news/feed/` 同样 403） |
| Insurtech Insights | `https://www.insurtechinsights.com/feed/` | 403（响应仅 103 字节，典型 Cloudflare 挑战） |
| Asia Insurance Review | `https://www.asiainsurancereview.com/desktopmodules/rssedaily`（另两个：`rsseCIN`、`rssMiddleEast`） | 500。官网 `/RSS` 页仍列出这三个地址和一个 `rssTakaful`，说明入口存在但服务端报错 |
| 韩国 FSC | `http://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111`、`?fid=0112` | 503 |
| 中国台湾 · 金管会 | `https://www.fsc.gov.tw/RSS/Messages?serno=201202290001&language=chinese` | 连接失败（本机 TLS 握不上） |
| SCMP · China Life Insurance 话题 | `https://www.scmp.com/rss/195710/feed` | 连接失败 |

**接入后的补充实测（同日）**：把地址放进站点采集器后会换成站点的爬虫 UA（`Mozilla/5.0 (compatible; BaoxianHotBot/1.0; +…/about)`），这时结论要改：

- **Coverager** 浏览器 UA 返回 200（10 条），爬虫 UA 返回 403。它按 UA 拦爬虫，不是地址问题。站点没有按信源改 UA 的配置项，所以这一条已在库里停用（`enabled=false`）。
- **Insurance Business、Artemis** 两种 UA 都是 403 / 连不上，与我们的 UA 无关，是真的不给采，不要加。
- 其余 21 个用爬虫 UA 全部抓到，`found_count` 与上面表格里的数字一致。

所以这一节里，只有「阅读器里可能可用」这一层判断还成立；对本站的采集器，除 Coverager 外的 403 都是硬拦。


### 2.3 确认失效，别再照抄

| 来源 | 原地址 | 实测 |
|---|---|---|
| Insurance Information Institute 行业博客 | `insuranceindustryblog.iii.org/feed`、`www.iii.org/insuranceindustryblog/feed` | 两个都 404，`www.iii.org/feed` 也 404。博客应已迁移或关闭，需重新找入口 |
| CNN Money · Insurance | `http://rss.cnn.com/rss/money_pf_insurance.rss` | 域名已不响应，CNN 早就停掉了这套 RSS |
| IIHS（公路安全保险协会） | `http://feeds.feedburner.com/iihs` | FeedBurner 无响应，该项已死 |

另外两个原始调研提到的入口其实是**索引页，不是 feed**，不能直接粘贴到阅读器：`insuranceday.com/rss-feeds`、`insurancenews.com.au/rss`、`insurancetech.com/rss_feeds.html`。要接得先进页面挑具体栏目地址。

## 三、怎么用

**第一阶段接 6–8 个够了**：Insurance Journal、Claims Journal、Business Insurance、Bank of England、FINMA、The Digital Insurer、Coverager、Commercial Risk。

**其次补 3 个**：The Actuary、Digital Insurance、Carrier Management。这样覆盖新闻、监管、科技、精算四条线，其余等实际阅读频率再定。

三个要知道的坑：

1. **首次入库量**：Commercial Risk 一次 100 条、EIOPA 139 条，接的时候要限条数（和加公众号时限制 `maxNewPerCheck` 同理），否则第一轮就把正文和模型成本顶上去。
2. **两个 SOA 源是播客**，RSS 里是音频不是文章，进不了现有的正文分析流程，当作补充信息流可以，别当文章源。
3. **保险行业 blog 类源（Accenture、Socotra、InsurTech NY）本质是厂商内容**，入选率会很低，加之前先想清楚是要"覆盖度"还是要"精选率"。
