// 站点身份和读者看得到的文案。换成你的行业时，先改这个文件。
// 网页和后端都读它；改完重新构建（docker compose up --build）即可生效。
// 域名不在这里：部署时用环境变量 SITE_URL 设置。

import type { Founder } from "@aihot/contracts/site-config";

/**
 * 日报、周报、月报什么时候出（北京时间，HH:mm）：日报收这个时间之前的 24 小时，周报在每个自然周之后的周一出，
 * 月报在每月 1 日出。排程、成刊时间窗口、缺期告警和所有提到时间的文案都读它（public/ 里的文件写占位
 * {{dailyTime}}、{{weeklyTime}}、{{monthlyTime}}）；排程每半小时检查一次，所以写整点或半点。
 */
export const EDITION_TIMES = { daily: "08:00", weekly: "10:00", monthly: "10:30" };

/**
 * 每日采集什么时候跑（北京时间 HH:mm）。间隔是整天（1440 分钟、4320 分钟……）的信源按这个时刻对齐，
 * 而不是“上次抓完 + 24 小时”——后者每天都被抓取耗时往后推几分钟，几周就漂到中午了。
 * 公众号、RSS、监管栏目都读这个值；抓取失败只记录，等下一次对齐的时刻再抓。
 */
export const COLLECT_TIMES = { daily: "03:00" };

/**
 * 模型分析每天什么时候开始（北京时间 HH:mm）：此刻之前入库的文章排到这个时刻再分析，
 * 一次批量跑完，不在采集当口零散调用；之后进来的（含失败重试）照常立即处理。
 * 排在采集和出刊之间，留够一轮分析的余量。
 */
export const ANALYSIS_TIME = "05:00";

/** “每天 08:00”“每周一 10:00”“每月 1 日 10:30”：写进句子里的出刊时间。 */
export const EDITION_WHEN = {
  daily: `每天 ${EDITION_TIMES.daily}`,
  weekly: `每周一 ${EDITION_TIMES.weekly}`,
  monthly: `每月 1 日 ${EDITION_TIMES.monthly}`,
};

export const SITE = {
  /** 站名：导航、页面标题、分享图、RSS、MCP、后台都用它。 */
  name: "保险热点",
  /**
   * 行业词：拼进默认说法里，比如“保险日报”“保险动态”。
   * 改成“法律”“HR”“黄金”之类，页面上就会变成“法律日报”“法律动态”。
   */
  subject: "保险",
  /** 首页的完整标题（浏览器标签、搜索结果）。 */
  homeTitle: "保险热点 — 保险行业动态 · 每日精选与日报",
  /** 一句话介绍：搜索引擎、分享卡片、RSS、llms.txt 会用。 */
  description: `从一批保险信源里挑出值得看的动态，把同一件事的多篇报道归到一起，${EDITION_WHEN.daily} 出一份日报。`,
  /** 一行小字：分享图、海报下方。 */
  tagline: "值得关注的保险动态",
  /** 搜索引擎读到的关键词（首页结构化数据）。 */
  keywords: ["保险资讯", "保险新闻", "保险日报", "保险行业动态", "监管政策"] as string[],
  /** 网站开始收录的年份（结构化数据的时间范围，选填）。 */
  since: null as string | null,
  /** 界面语言（HTML lang、og:locale）。 */
  locale: "zh-CN",
  /** 默认域名，只在没设置 SITE_URL 时使用。 */
  defaultUrl: "http://localhost:3000",
  /** 标准图标（favicon.ico、icon.png、icon-192.png、apple-icon.png、logo.svg）以外也放在网站根目录的图标，site/brand/ 里的文件名（选填）；manifest.webmanifest 或外站引用了它们时用。 */
  rootIcons: [] as string[],
  /**
   * 站点的 ASCII 标识（小写字母、数字、连字符）：导出 Markdown、分享海报的文件名前缀用。
   */
  slug: "baoxianhot",
  /** 中国大陆网站的 ICP 备案号（选填），填了就显示在侧栏底部和“我的”页底部，并链接到工信部备案系统。 */
  icp: null as string | null,
  /** 中国大陆网站的公安备案信息（选填），填了显示在侧栏底部和“我的”页底部。 */
  psb: null as string | null,
  /** 源码的 GitHub 仓库地址（选填），填了就在侧栏底部和“我的”页底部显示“GitHub 开源”。 */
  github: null as string | null,
  /** 结构化数据里的网站运营者（搜索引擎用）。 */
  organization: {
    name: "保险热点",
    /** 创始人（选填）。 */
    founder: null as Founder | null,
  },
  /** 抓取信源时报上的名字和版本（User-Agent 里用），不要冒用别的站。 */
  crawlerName: "BaoxianHotBot/1.0",
} as const;

/** 内容的展示规则。 */
export const POLICY = {
  /**
   * X 帖子本身的文字和图片算不算全文：算的话，只在这篇允许站内全文时显示（信源允许全文、正文也取到了）；
   * 不算的话总是显示，和标题、摘要一样。
   */
  xPostIsFullText: true,
} as const;

/** 导航（电脑侧栏、手机底栏、“我的”页）。 */
export const NAV = {
  /**
   * 不放进导航的引擎入口，目前只支持热点榜（"/hot"）。页面照样能打开；原来回到它的返回按钮和链接改回精选，
   * 写 "/hot" 时首页也不放当前热点。
   */
  hidden: [] as Array<"/hot">,
};

/** 条目卡片和详情页上的几处说法和显示。 */
export const ITEM_COPY = {
  /** 模型写的那句理由叫什么：卡片、详情页、Markdown 导出、给 Agent 的回答和群推送都用它。 */
  reasonLabel: "推荐理由",
  /** 读者在网页和分享图上看不看得到 AI 评分。只管显示：公开 API 和 MCP 的数据照样带 score，后台照常显示。 */
  showScore: true,
};

/** 关于页的一张二维码卡片。 */
interface ContactCard {
  kind: string;
  title: string;
  note: string;
  /** 站外链接过的根目录文件名（选填），比如 qr-wechat.jpg：这个地址总是跳到现在的二维码。 */
  alias?: string;
}

/** 关于页的文案。数字（信源数、收录数、精选数、日报期数）来自站内实时统计，不用写在这里。 */
export const ABOUT = {
  kicker: `关于 ${SITE.name}`,
  /** 页面描述（搜索结果、分享卡片）。 */
  description: `关于 ${SITE.name}：${SITE.description}`,
  /** 大标题：第一行正常颜色，第二行强调色。 */
  headline: ["保险业每天都有新动静，", "值得看的，只有几条。"] as [string, string],
  /** 标题下面的一段话。{sources} 会换成实时的信源数（两边自动加空格，所以 {sources} 两边不写空格）；统计没取到时换成 sourcesFallback。 */
  lead: `${SITE.name} 替你盯着{sources}个信源：抓取、归并、打分、精选，${EDITION_WHEN.daily} 出一份日报。免费，不用注册。`,
  sourcesFallback: "十几",
  /** 信源河动画下面的四个环节。 */
  steps: {
    collect: "监管总局、行业协会和行业媒体都在看；更新越勤的源看得越勤，最快 15 分钟看一次。",
    store: "抓到的都存下来，同一件事的报道归到一起，热点榜就是从这里算出来的。",
    select: `模型先看是不是这个行业的事、有没有实际信息，再写中文标题、摘要和${ITEM_COPY.reasonLabel}；营销稿和重复转发进不来。`,
    publish: `${EDITION_WHEN.daily} 出日报，${EDITION_WHEN.weekly} 出周报，${EDITION_WHEN.monthly} 出月报。`,
  },
  /**
   * 作者块（选填），null 就不显示。
   * avatarSourceId：一个 X 账号信源的 id，头像取它的（选填）。
   * 二维码在后台“设置”里上传，或者放进 site/brand/contact/；没有二维码就不显示那张卡片。
   */
  maker: null as null | {
    name: string;
    avatarSourceId?: string | null;
    greeting: string[];
    wechat?: ContactCard;
  },
  /**
   * 页面底部的开源致谢（选填），null 就不显示：说明本站是拿哪个开源项目做的。
   * {project} 换成指向代码仓库的链接，其余文字照原样显示。
   */
  builtOn: { text: "本站基于开源项目 {project} 构建。", project: "AIHOT", url: "https://github.com/KKKKhazix/AIHOT" } as
    | { text: string; project: string; url: string }
    | null,
  /** 页面底部“使用规则”链接的锚点 id（选填）：外部文档写死过这个锚点就填上，以后不要改。 */
  termsAnchor: null as string | null,
} as const;

/** 后台页面上给管理员的提示（选填）。 */
export const ADMIN = {
  /** 确认框里补的一句本站规定：调整付费服务的请求上限时。 */
  budgetNote: null as string | null,
};

/** 日报、周报、月报版面上的说法。 */
export const REPORTS = {
  /** 报头下面的出版者一行。 */
  imprint: SITE.name.toUpperCase(),
  /** 报头旁边的一个词。 */
  motto: SITE.subject as string,
  /** 每种报告页面的描述（搜索结果、分享卡片），不带句号；llms.txt 介绍周报、月报时也用它。 */
  descriptions: {
    daily: `${SITE.name} ${subjectAfter(`${EDITION_WHEN.daily}（北京时间）发布的`, "行业精编日报")}`,
    weekly: subjectAfter("每周", "行业综合回顾"),
    monthly: subjectAfter("每月", "行业盘点"),
  },
  /**
   * 一期里的一条怎么称呼（“4 件大事”）：没有头条时的标题（“这一天的 4 件 AI 大事”）、报头和往期目录的条数、
   * 周报月报没有总述时的那句话，以及订阅说明里的“按栏目分好的大事”都用它。
   */
  entry: { measure: "件", noun: "大事" },
  /** 报头上其余几个数字后面的说法；精选数和日报期数在关于页、主题页也这样写。 */
  metricUnits: { sourcesCount: "个来源", firstPartyEvents: "件一手发布", selectedCount: "条精选", reportsCovered: "期日报" },
  /** 报告分享图上“共几条”的说法。 */
  shareUnit: "件大事",
  /** 日报时段内有资料经过评判、但没有新大事时的标题与导语。 */
  quiet: { title: "今日安静，无大事发生", paragraph: `${subjectAfter("北京时间 {start} 至 {end}，没有新的", "大事")}。` },
};

/** 运维告警（只发给站长）里随部署而变的几处说法。 */
export const ALERTS = {
  /** 多少分钟没有收录新文章就告警“网站停止收录新内容”；环境变量 ALERT_QUIET_MINUTES 优先。比最慢信源的抓取间隔还短时按“间隔加一小时”算，每天抓一次的站不会因此误报。 */
  quietMinutes: 360,
  /** 同一条告警里，“没有”后面补一句平时的收录量；null 就不写。 */
  usualFlow: null as string | null,
  /** worker 停了的告警里，怎么看它的日志。 */
  workerLogs: "看 worker 的日志（docker compose logs worker）",
};

/** 后台新建信源时的默认设置。 */
export const SOURCE_DEFAULTS = {
  /** 站内展示全文；false 时只显示摘要和原文链接。 */
  siteFulltext: false,
};

/**
 * 社区站的信源（填信源 id）：算热度时按发帖的账号计，一个账号算一个独立来源，而不是整个信源只算一个。
 * dev 是 dev.to 的文章流，hn 是 Hacker News 的帖子流。
 */
export const COMMUNITY_FEEDS: { dev: string[]; hn: string[] } = {
  dev: [],
  hn: [],
};

/** 各页分享图（/og/pages/*.png）上的文字。主题目录页的那张按主题数自动生成。 */
export const CARDS: Record<string, { kicker: string; title: string; subtitle: string; accent?: "hot" | "amber" }> = {
  site: { kicker: subjectAfter("每日", "精选"), title: SITE.tagline, subtitle: SITE.description },
  all: { kicker: subjectAfter("全部", "动态"), title: "所有信源的最新动态，一站看完", subtitle: "按时间汇总各信源的最新动态，可按类别与标签筛选。" },
  hot: { kicker: "热点榜", title: "过去 48 小时，大家在讨论什么", subtitle: "热度指数、趋势与组成热度的公开来源。", accent: "hot" },
  daily: { kicker: withSubject("日报"), title: subjectAfter(`每天 ${spokenTime(EDITION_TIMES.daily)}，一份读得完的`, "日报"), subtitle: `${subjectAfter("前一天值得关注的", "动态")}。` },
  weekly: { kicker: withSubject("周报"), title: `一周${REPORTS.entry.noun}，一次看清`, subtitle: "本周的主线、重要发布与值得回看的讨论。" },
  monthly: { kicker: withSubject("月报"), title: "一个月的变化", subtitle: "月度主线与关键事件回顾。" },
  about: { kicker: "关于", title: `关于 ${SITE.name}`, subtitle: SITE.description },
};

/** 这个部署自己的几处安排（选填）。 */
export const DEPLOYMENT = {
  /** 凭据分组文件（models.env、collectors.env……）默认放在哪个目录，相对仓库根目录；环境变量 AIHOT_CREDENTIALS_DIR 优先，都没有就只读环境变量。 */
  credentialsDir: null as string | null,
  /** 凭据分组的文件名（放在凭据目录下，选填）：没写的分组用“分组名.env”，比如 models.env。 */
  credentialFiles: {} as Partial<Record<string, string>>,
  /** 这个部署额外要求的凭据（[分组, 环境变量名]）；生产 API 启动时检查，默认没有额外要求。 */
  requiredSecrets: [] as const,
  /** 线上 api 收到的 Host（CDN 回源用的域名，选填）；本地开发时，网页开发服务器转给 api 的请求也换成它，和线上一致。 */
  originHost: null as string | null,
  /** 反向代理把没登录的后台访问转去登录时，用哪个请求头带上原来的地址（选填，登录后回到那里）。 */
  loginReturnHeader: null as string | null,
  /**
   * 图片代理从原站取图的流量上限：超过后没缓存的图先返回 503，等这一分钟或这一天过去，当天额度用完会进运营日报；
   * null 就不设上限。环境变量 IMGPROXY_UPSTREAM_MB_PER_MINUTE、IMGPROXY_UPSTREAM_GB_PER_DAY 优先。
   */
  imageUpstreamBudget: null as null | { mbPerMinute: number; gbPerDay: number },
  /**
   * 已实测应由服务器直接连接、不走出网代理（EGRESS_PROXY_URL）的域名，采集和图片共用（选填）。
   * 每次重定向重新按目标域名选路，直连仍检查实际连接地址。
   */
  directFetchHosts: [] as string[],
  /**
   * 精选评测（scripts/eval-selection.ts）不带参数时用的金标集：文件（相对仓库根目录）、抽样条数、只抽哪一份、门槛扫描范围。
   * null 就用 .data/gold.jsonl 的全部样本（最多 200 条），在 40–90 之间扫描。
   */
  selectionGold: null as null | { file: string; sample: number; split: string; sweep: [number, number] },
};

/**
 * 同步账本里和网页不同的类别（选填）。上线后不要改：账本里的记录按它归类。
 * merge：并进另一类发布的类别，key 是行业包里的类别，值是它并进的类别（账本比网页少一类时用）。
 */
export const PUBLIC_CATEGORIES = {
  merge: {},
} as const;

/** “AI 日报”这类说法：行业词和名词之间，英文词加空格，中文词不加。 */
export function withSubject(noun: string): string {
  return /[A-Za-z0-9]$/.test(SITE.subject) ? `${SITE.subject} ${noun}` : `${SITE.subject}${noun}`;
}

/** “按主题看 AI”“往期 AI 日报”这类说法：行业词接在中文后面，英文词前加空格，中文词不加；noun 照 withSubject 接上。 */
export function subjectAfter(text: string, noun?: string): string {
  const gap = /^[A-Za-z0-9]/.test(SITE.subject) ? " " : "";
  return `${text}${gap}${noun ? withSubject(noun) : SITE.subject}`;
}

/** “8 点”“10 点 30 分”：口语里的 HH:mm。 */
function spokenTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return `${hour} 点${minute ? ` ${minute} 分` : ""}`;
}
