// 二次热度探查源：一条新闻发布后，用它的标题去 Bing 搜一次，结果落在这些主机上的才算「有人也在报」。
//
// 清单取自大事记（modules/history/data.ts）的官方来源与媒体报道，剔除公司官网
// （pingan.cn、cpic.com.cn、e-chinalife.com、cntaiping.com、picc.com.cn、aia.com.cn、
// zhongan.com、cic.cn、manulife-sinochem.com、allianzholding.cn、cramc.cn）——单家公司的公告
// 不构成热度。已接入日常采集的机构（nfra.gov.cn、iachina.cn、cisf.cn、cbimc.cn）留在这里：
// 探查要回答的是「除本站已采的源以外还有谁在报」，命中的如果是已经采过的源，不计入 heat，
// 但仍在 matches 里留痕，方便核对。
//
// host 按后缀匹配：ce.cn 认 finance.ce.cn、paper.ce.cn、m.ce.cn。一个结果同时命中多条时取最长的那条
// 作署名（jrj.sh.gov.cn 记「上海市委金融办」，不记「中国政府网」）。同一机构报多条只算一家。
// 加号时把 host 写成注册域，别写 www。腾讯是例外：写成 qq.com 会认下 mp.weixin.qq.com 的公众号文章，
// 所以只收它的新闻频道域名。
//
// 2026-10-23 按用户给的清单补了 12 家（人民银行、互金协会、债券信息网、电子银行网、中国经济时报、
// 中青在线、中国财经报、经济观察网、未央网、海外网、金融界、腾讯）。没加的几家：
//  - 12377.cn 违法和不良信息举报中心：举报受理平台，不发布新闻。
//  - shfinancialnews.com 上海金融报：2020-01-01 休刊、网站同步停更，报社 2024 年注销，不会再有新报道。
//  - chinafph.com 中国金融出版社：图书出版，官网已跳转 cfph.cn，不发新闻。
//  - zgjx.cn 中国记协网：行业自律组织，不报道保险事件。
//  - cfcpn.com 金采网（中国金融采购网）：只做金融采购招标信息，与保险新闻无关。

export interface HeatSource {
  host: string;
  org: string;
  kind: "official" | "media";
}

export const HEAT_SOURCES: readonly HeatSource[] = [
  // 官方：政府、监管、协会、司法与事业单位
  { host: "gov.cn", org: "中国政府网及各级政府部门", kind: "official" },
  { host: "npc.gov.cn", org: "中国人大网", kind: "official" },
  { host: "mof.gov.cn", org: "财政部", kind: "official" },
  { host: "ndrc.gov.cn", org: "国家发展和改革委员会", kind: "official" },
  { host: "moj.gov.cn", org: "司法部", kind: "official" },
  { host: "mohrss.gov.cn", org: "人力资源和社会保障部", kind: "official" },
  { host: "nhc.gov.cn", org: "国家卫生健康委员会", kind: "official" },
  { host: "stats.gov.cn", org: "国家统计局", kind: "official" },
  { host: "chinatax.gov.cn", org: "国家税务总局", kind: "official" },
  { host: "court.gov.cn", org: "法院系统", kind: "official" },
  { host: "xuexi.cn", org: "学习强国", kind: "official" },
  { host: "cssn.cn", org: "中国社会科学院", kind: "official" },
  { host: "nfra.gov.cn", org: "国家金融监督管理总局", kind: "official" },
  { host: "pbc.gov.cn", org: "中国人民银行", kind: "official" },
  { host: "nifa.org.cn", org: "中国互联网金融协会", kind: "official" },
  { host: "chinabond.com.cn", org: "中国债券信息网", kind: "official" },
  { host: "iachina.cn", org: "中国保险行业协会", kind: "official" },
  { host: "isc-org.cn", org: "中国保险学会", kind: "official" },
  { host: "e-caa.org.cn", org: "中国精算师协会", kind: "official" },
  { host: "cisf.cn", org: "中国保险保障基金", kind: "official" },
  { host: "jrj.sh.gov.cn", org: "上海市委金融办", kind: "official" },
  { host: "jrj.wuhan.gov.cn", org: "武汉市委金融办", kind: "official" },
  { host: "shtong.gov.cn", org: "上海市地方志办公室", kind: "official" },

  // 媒体
  { host: "news.cn", org: "新华网", kind: "media" },
  { host: "xinhuanet.com", org: "新华网", kind: "media" },
  { host: "people.com.cn", org: "人民网", kind: "media" },
  { host: "peopleapp.com", org: "人民日报客户端", kind: "media" },
  { host: "ce.cn", org: "中国经济网", kind: "media" },
  { host: "cnr.cn", org: "央广网", kind: "media" },
  { host: "cctv.com", org: "央视网", kind: "media" },
  { host: "cntv.cn", org: "央视网", kind: "media" },
  { host: "chinanews.com", org: "中国新闻网", kind: "media" },
  { host: "chinanews.com.cn", org: "中国新闻网", kind: "media" },
  { host: "gmw.cn", org: "光明网", kind: "media" },
  { host: "jingjiribao.cn", org: "经济日报", kind: "media" },
  { host: "jjckb.cn", org: "经济参考报", kind: "media" },
  { host: "stcn.com", org: "证券时报", kind: "media" },
  { host: "cs.com.cn", org: "中国证券报·中证网", kind: "media" },
  { host: "cnstock.com", org: "上海证券报", kind: "media" },
  { host: "yicai.com", org: "第一财经", kind: "media" },
  { host: "21jingji.com", org: "21 世纪经济报道", kind: "media" },
  { host: "mrjjxw.com", org: "每日经济新闻", kind: "media" },
  { host: "nbd.com.cn", org: "每日经济新闻", kind: "media" },
  { host: "financialnews.com.cn", org: "金融时报", kind: "media" },
  { host: "cnfin.com", org: "新华财经", kind: "media" },
  { host: "thepaper.cn", org: "澎湃新闻", kind: "media" },
  { host: "p5w.net", org: "全景网", kind: "media" },
  { host: "cbimc.cn", org: "中国银行保险报", kind: "media" },
  { host: "sinoins.com", org: "中国银行保险报（旧域名）", kind: "media" },
  { host: "legaldaily.com.cn", org: "法治日报", kind: "media" },
  { host: "rmzxw.com.cn", org: "人民政协网", kind: "media" },
  { host: "chinacourt.cn", org: "中国法院网", kind: "media" },
  { host: "china.com.cn", org: "中国网", kind: "media" },
  { host: "chinaqw.com", org: "中国侨网", kind: "media" },
  // 新浪两个域名算一家：按 org 去重，org 名字必须写成一样的。
  { host: "sina.com.cn", org: "新浪财经", kind: "media" },
  { host: "sina.cn", org: "新浪财经", kind: "media" },
  { host: "sohu.com", org: "搜狐", kind: "media" },
  { host: "163.com", org: "网易", kind: "media" },
  // 腾讯要拆到具体频道：写成 qq.com 会把 mp.weixin.qq.com 的公众号文章算成「腾讯网」，
  // 而公众号正是本站日常采集的对象，等于自己给自己加热度。
  { host: "news.qq.com", org: "腾讯网", kind: "media" },
  { host: "new.qq.com", org: "腾讯网", kind: "media" },
  { host: "finance.qq.com", org: "腾讯网", kind: "media" },
  { host: "ifeng.com", org: "凤凰网", kind: "media" },
  { host: "enorth.com.cn", org: "北方网", kind: "media" },
  { host: "dzwww.com", org: "大众日报", kind: "media" },
  { host: "ycwb.com", org: "羊城晚报", kind: "media" },
  { host: "cnnb.com.cn", org: "宁波晚报", kind: "media" },
  { host: "xinminweekly.com.cn", org: "新民周刊", kind: "media" },
  { host: "zqbao.com.cn", org: "中国企业报", kind: "media" },
  { host: "dahecube.com", org: "大河财立方", kind: "media" },
  { host: "cebnet.com.cn", org: "中国电子银行网", kind: "media" },
  { host: "cet.com.cn", org: "中国经济时报", kind: "media" },
  { host: "cyol.net", org: "中青在线", kind: "media" },
  { host: "cfen.com.cn", org: "中国财经报", kind: "media" },
  { host: "eeo.com.cn", org: "经济观察网", kind: "media" },
  { host: "weiyangx.com", org: "未央网", kind: "media" },
  { host: "haiwainet.cn", org: "海外网", kind: "media" },
  { host: "jrj.com.cn", org: "金融界", kind: "media" },
];

/** 报道这条新闻的机构：最长后缀命中的那条白名单。 */
export function heatSourceFor(host: string): HeatSource | null {
  const h = host.toLowerCase().replace(/^www\./, "");
  let best: HeatSource | null = null;
  for (const source of HEAT_SOURCES) {
    if (h === source.host || h.endsWith(`.${source.host}`)) {
      if (!best || source.host.length > best.host.length) best = source;
    }
  }
  return best;
}

/**
 * 探查命中在热度里的分量，相对本站自己采到的一条报道（1.0）。
 *
 * 排行的口径是「一件事有多少家独立来源在报」，本站拿到原文的报道算一份；探查命中的只是
 * 「标题在 Bing 上撞上了这家机构的一条结果」，没有核验内容，所以打折：官方站（政府、监管、
 * 协会、司法）接近一手，给 0.8；媒体转载更低，给 0.5。
 *
 * 这个数和 events/hot.ts 的半衰期一起是可校准参数。改之前先看 `hot_rankings` 的历史，
 * 按 docs/selection.md 的办法用样本定，不要凭感觉调。
 */
export const HEAT_WEIGHTS = { official: 0.8, media: 0.5 } as const;
