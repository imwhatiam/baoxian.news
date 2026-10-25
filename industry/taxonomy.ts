// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（研究、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  { key: "regulation", label: "监管", feedLabel: "监管政策", section: "监管与政策", guide: "监管总局及其派出机构、国务院及各部委发布的保险监管规章、规范性文件、征求意见稿、行政处罚、行政许可与风险提示，以及对这些文件的官方解读。公司自己的合规宣传不算；对政策的评论和预测归行业。" },
  { key: "industry", label: "行业", feedLabel: "行业动态", section: "行业与市场", guide: "整个行业层面的变化：保费与赔付等统计数据、市场格局、渠道与中介的结构变化（手续费与佣金规则、报行合一、银保与互联网渠道）、代理人队伍规模与执业制度、行业趋势与风险提示、理赔时效与服务水平的整体变化、对行业的分析与评论。单家保险公司的经营事件也归这里：业绩与偿付能力、融资与并购、股权变动、人事任免、机构设立与撤销、公司层面的合作与诉讼、拒赔与赔付争议、公司自己的产品与渠道策略。具体产品条款归产品。" },
  { key: "product", label: "产品", feedLabel: "产品与定价", section: "产品与定价", guide: "具体保险产品的上市、停售、条款与费率调整、保证续保与免责范围的变化、产品备案与创新设计。管产品的规则归监管，产品横向评测归行业。" },
  { key: "dator", label: "大童", feedLabel: "大童", section: "大童", guide: "主体是大童保险服务（含大童保险销售服务有限公司及其子公司、童管家、快保等自有品牌）的内容一律归这里，不管形态是公司动态、服务与产品发布、机构与合作、人事、客户服务与理赔案例，还是行业活动：大童自己的产品上市算大童，不算产品；大童的理赔案例算大童，不算保险公司。大童只是转发或评论别人的行业新闻、通篇没有大童自身动作的，按内容归行业（公司事件也归行业）或产品。大童的内容再按正文重心给一个 alsoCategory，使它同时出现在行业或产品里。" },
  { key: "international", label: "国际", feedLabel: "国际保险", section: "国际", guide: "中国内地以外市场的保险内容：外国监管机构与国际组织发布的规则、处罚与风险提示，外国保险公司与中国香港、中国澳门、中国台湾保险公司的经营事件、业绩与偿付能力，这些市场的产品与费率变化、行业数据与趋势、保险科技、再保险与巨灾债券动态。判断只看市场属地，不看新闻形态：境外的监管新规归国际，不归监管；境外的公司经营事件归国际，不归行业；境外的产品与费率变化归国际，不归产品。通篇没有指明中国内地市场的主体、数字或规则，讲的是全球或境外市场通用趋势（含咨询机构的行业预测、境外再保与科技厂商的经验稿）的，也归国际。中国内地的监管、行业、公司与产品一律归各自类别，不进国际。同一条内容同时讲中国内地与境外市场时，看正文主要讲哪个市场。" },
] as const satisfies ReadonlyArray<{ key: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布：保险业没有“新模型”那样统一的发布物，所以设成 null，日报报头不显示这个数。
 * 类别和标签都对上才算；unit 接在数字后面。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = null;

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = ["保险", "保费", "偿付能力", "银保", "个险", "车险", "寿险", "健康险", "财险", "监管", "理赔", "中介", "再保险", "保险资金", "精算", "承保", "退保"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["regulation_change", "market_move", "company_event", "product_change", "research_view"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。最后一个是兜底，新标签加在它前面。 */
export const CATEGORY_TAGS = [
  "监管政策", "处罚通报", "政策解读", "行业动态", "行业数据", "公司动态", "公司财报", "大童动态", "产品发布", "费率调整", "国际动态", "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "车险", "健康险", "寿险", "农险", "责任险", "巨灾保险", "养老金融", "互联网保险", "银保渠道", "个险", "保险中介", "偿付能力", "精算", "再保险", "保险科技",
] as const;

/** 可选的实体标签（公司、机构）。 */
export const ENTITY_TAGS = ["中国人保", "中国人寿", "中国平安", "中国太保", "新华保险", "泰康", "阳光保险", "友邦", "众安", "金融监管总局"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  新规: "监管政策", 规章: "监管政策", 征求意见稿: "监管政策", 监管: "监管政策", 政策: "监管政策", 法规: "监管政策",
  罚单: "处罚通报", 处罚: "处罚通报", 行政处罚: "处罚通报", 通报: "处罚通报",
  解读: "政策解读", 答记者问: "政策解读",
  行业: "行业动态", 市场: "行业动态", 趋势: "行业动态", 渠道: "行业动态", 中介: "行业动态", 经纪: "行业动态",
  代理: "行业动态", 银保: "行业动态", 报行合一: "行业动态", 代理人: "行业动态", 增员: "行业动态", 脱落: "行业动态",
  队伍: "行业动态", 执业登记: "行业动态", 研报: "行业动态", 研究: "行业动态", 报告: "行业动态", 观点: "行业动态", 评测: "行业动态",
  数据: "行业数据", 统计: "行业数据", 保费: "行业数据", 赔付率: "行业数据",
  融资: "公司动态", 收购: "公司动态", 并购: "公司动态", 人事: "公司动态", 股权: "公司动态", 合作: "公司动态", 诉讼: "公司动态",
  财报: "公司财报", 业绩: "公司财报", 年报: "公司财报", 偿付能力报告: "公司财报", 偿付能力: "公司财报",
  大童: "大童动态", 童管家: "大童动态",
  国际: "国际动态", 海外: "国际动态", 境外: "国际动态", 全球: "国际动态", 跨境: "国际动态", 国际市场: "国际动态", 海外市场: "国际动态",
  international: "国际动态", overseas: "国际动态", global: "国际动态",
  上新: "产品发布", 上市: "产品发布", 停售: "产品发布", 新品: "产品发布", 产品: "产品发布",
  降价: "费率调整", 涨价: "费率调整", 定价: "费率调整", 费率: "费率调整", 条款: "费率调整",
  拒赔: "公司动态", 赔付: "公司动态", 理赔: "公司动态", 判决: "公司动态",
  销售误导: "处罚通报",
  其他: "其他",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；orgNames 是这家公司发消息时开头用的组织名（集团、子公司、部门），
 * 在它自己的主题页上读者知道说的是谁，可以省去；otherNames 是公司的其他称呼（官方账号名、子品牌）。
 * 所有这些名字都用来认出说的是哪家公司，比如把事实的主体对到发布方。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  nfra: { name: "国家金融监督管理总局", displayTag: "金融监管总局", aliases: ["金融监管总局", "国家金融监督管理总局", "金融监督管理总局", "银保监会"], orgNames: ["国家金融监督管理总局", "金融监管总局"] },
  iachina: { name: "中国保险行业协会", displayTag: null, aliases: ["中国保险行业协会", "中保协"], orgNames: ["中国保险行业协会"] },
  picc: { name: "中国人保", displayTag: "中国人保", aliases: ["中国人保", "中国人民保险", "人保财险", "人保寿险", "PICC"], orgNames: ["中国人民保险集团", "人保财险", "人保寿险", "人保健康"], otherNames: ["中国人保财险"] },
  "china-life": { name: "中国人寿", displayTag: "中国人寿", aliases: ["中国人寿", "国寿", "China Life"], orgNames: ["中国人寿保险集团", "中国人寿保险股份有限公司", "国寿寿险"], otherNames: ["中国人寿保险"] },
  pingan: { name: "中国平安", displayTag: "中国平安", aliases: ["中国平安", "平安人寿", "平安产险", "平安保险", "Ping An"], orgNames: ["中国平安保险集团", "平安人寿", "平安产险", "平安健康险"], otherNames: ["平安集团"] },
  cpic: { name: "中国太保", displayTag: "中国太保", aliases: ["中国太保", "太保寿险", "太保产险", "太平洋保险", "CPIC"], orgNames: ["中国太平洋保险集团", "太保寿险", "太保产险"], otherNames: ["太平洋保险"] },
  newchinalife: { name: "新华保险", displayTag: "新华保险", aliases: ["新华保险", "新华人寿"], orgNames: ["新华人寿保险股份有限公司", "新华保险"] },
  taikang: { name: "泰康", displayTag: "泰康", aliases: ["泰康", "泰康人寿", "泰康资产", "泰康养老"], orgNames: ["泰康保险集团", "泰康人寿", "泰康资产", "泰康养老"], otherNames: ["泰康保险"] },
  sunshine: { name: "阳光保险", displayTag: "阳光保险", aliases: ["阳光保险", "阳光人寿", "阳光产险", "阳光财险"], orgNames: ["阳光保险集团", "阳光人寿", "阳光财险"] },
  aia: { name: "友邦", displayTag: "友邦", aliases: ["友邦", "友邦保险", "AIA"], orgNames: ["友邦保险", "友邦人寿", "AIA"] },
  zhongan: { name: "众安", displayTag: "众安", aliases: ["众安", "众安在线", "众安保险"], orgNames: ["众安在线财产保险股份有限公司", "众安保险"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "picc", name: "中国人保", patterns: [/中国人保|人保财险|人保寿险|人保健康|中国人民保险|\bPICC\b/i] },
  { id: "china-life", name: "中国人寿", patterns: [/中国人寿|国寿|\bChina Life\b/i] },
  { id: "pingan", name: "中国平安", patterns: [/中国平安|平安人寿|平安产险|平安健康险|平安集团|\bPing An\b/i] },
  { id: "cpic", name: "中国太保", patterns: [/中国太保|太保寿险|太保产险|太平洋保险|\bCPIC\b/i] },
  { id: "newchinalife", name: "新华保险", patterns: [/新华保险|新华人寿/] },
  { id: "taikang", name: "泰康", patterns: [/泰康/] },
  { id: "sunshine", name: "阳光保险", patterns: [/阳光保险|阳光人寿|阳光财险|阳光产险/] },
  { id: "aia", name: "友邦", patterns: [/友邦|\bAIA\b/] },
  { id: "zhongan", name: "众安", patterns: [/众安/] },
  { id: "nfra", name: "金融监管总局", patterns: [/金融监管总局|金融监督管理总局|银保监会|原银保监会/] },
  { id: "iachina", name: "中国保险行业协会", patterns: [/中国保险行业协会|中保协/] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台如微信公众号、交易所不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "picc", domains: ["picc.com.cn", "piccnet.com.cn", "epicc.com.cn"] },
  { entityId: "china-life", domains: ["chinalife.com.cn", "e-chinalife.com"] },
  { entityId: "pingan", domains: ["pingan.com", "pingan.cn"] },
  { entityId: "cpic", domains: ["cpic.com.cn"] },
  { entityId: "newchinalife", domains: ["newchinalife.com"] },
  { entityId: "taikang", domains: ["taikang.com"] },
  { entityId: "sunshine", domains: ["sinosig.com"] },
  { entityId: "aia", domains: ["aia.com.cn"] },
  { entityId: "zhongan", domains: ["zhongan.com"] },
  { entityId: "nfra", domains: ["nfra.gov.cn"] },
  { entityId: "iachina", domains: ["iachina.cn"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "picc", pattern: /@PICC_China\b/i },
  { entityId: "pingan", pattern: /@平安人寿\b/ },
];
