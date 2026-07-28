import type { AgentConfig } from "@/features/admin/api/agent-config";
import type { Announcement } from "@/features/admin/api/announcements";
import type { BillingConfig } from "@/features/admin/api/billing-config";
import type { CodeSnippet } from "@/features/admin/api/code-snippets";
import type { AnalysisDimension } from "@/features/admin/api/dimensions";
import type { EmailLog } from "@/features/admin/api/email-logs";
import type {
  Feedback,
  FeedbackAttachment,
} from "@/features/admin/api/feedback";
import type {
  ImportJob,
  Webhook,
  WebhookDelivery,
} from "@/features/admin/api/feature-tools";
import type {
  HotContentConfig,
  HotKeyword,
  HotPaper,
} from "@/features/admin/api/hot-content";
import type { AdminMessage } from "@/features/admin/api/messages";
import type {
  AgentModel,
  AgentProviderDTO,
  ModelBinding,
} from "@/features/admin/api/model-catalog";
import type { NewsWebhookConfig } from "@/features/admin/api/news-webhook";
import type { OAuthConfigRecord } from "@/features/admin/api/oauth";
import type { AdminOrder as BillingOrder } from "@/features/admin/api/orders";
import type {
  AlipayConfig,
  WeChatPayConfig,
} from "@/features/admin/api/payment";
import type { PromoConfig } from "@/features/admin/api/promo-config";
import type { AdminSkillReport } from "@/features/admin/api/skills";
import type {
  InboxMail,
  SupportCenterConfig,
} from "@/features/admin/api/support-center";
import type {
  EmailConfig,
  SMSConfig,
  SystemConfig,
} from "@/features/admin/api/system-config";
import type { ThirdPartyAccount } from "@/features/admin/api/third-party";
import type { AdminUser, UserVipStatus } from "@/features/admin/api/users";
import type { VipCode } from "@/features/admin/api/vip-codes";
import type { WechatMiniProgramConfig } from "@/features/admin/api/wechat-miniprogram";
import type { WechatOfficialConfig } from "@/features/admin/api/wechat-official";
import type { MySkill } from "@/shared/api/skills";
import type { FeatureTool } from "@/types/feature-tool";

const STORAGE_KEY = "scholay:mock:admin:v1";
const DAY_MS = 86_400_000;

const avatarDataUrl = (name: string, index: number): string => {
  const colors = ["#DCEFE6", "#F8E6DD", "#E5E7F7", "#F4EDCF"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${colors[index % colors.length]}"/><text x="48" y="59" text-anchor="middle" font-family="system-ui,sans-serif" font-size="36" font-weight="700" fill="#31413A">${name.slice(0, 1)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const isoDaysAgo = (days: number, hour = 10): string => {
  const date = new Date(Date.now() - days * DAY_MS);
  date.setHours(hour, (days * 7) % 60, 0, 0);
  return date.toISOString();
};

export const dateDaysAgo = (days: number): string =>
  isoDaysAgo(days).slice(0, 10);

const futureIso = (days: number): string => {
  const date = new Date(Date.now() + days * DAY_MS);
  date.setHours(23, 59, 59, 0);
  return date.toISOString();
};

const people = [
  ["林墨", "lin.mo@scholay.test", "13800001001", "wechat"],
  ["陈知远", "zhi.yuan@scholay.test", "13800001002", "github"],
  ["周若岚", "ruolan.zhou@scholay.test", "13800001003", "google"],
  ["许砚秋", "yanqiu.xu@scholay.test", "13800001004", "wechat_miniprogram"],
  ["顾南星", "nanxing.gu@scholay.test", "13800001005", "orcid"],
  ["沈清和", "qinghe.shen@scholay.test", "13800001006", "email"],
  ["陆嘉言", "jiayan.lu@scholay.test", "13800001007", "microsoft"],
  ["苏晚舟", "wanzhou.su@scholay.test", "13800001008", "wechat"],
  ["唐映雪", "yingxue.tang@scholay.test", "13800001009", "github"],
  ["江屿", "yu.jiang@scholay.test", "13800001010", "wechat_miniprogram"],
  ["宋时安", "shian.song@scholay.test", "13800001011", "discourse"],
  ["叶青川", "qingchuan.ye@scholay.test", "13800001012", "email"],
] as const;

const users: AdminUser[] = people.map(
  ([username, email, phone, source], index) => {
    const tier =
      index === 0 || index === 4 ? "max" : index < 7 ? "pro" : "free";
    const status = index === 8 ? 2 : index === 11 ? 0 : 1;
    return {
      id: index + 1,
      email,
      username,
      phone,
      avatar_url: avatarDataUrl(username, index),
      bio:
        index % 3 === 0
          ? "关注人工智能与科研工作流，希望让复杂研究更简单。"
          : null,
      role:
        index === 0
          ? "super_admin"
          : index === 1
            ? "operations"
            : index === 2
              ? "admin"
              : "user",
      status,
      frozen_at: status === 2 ? isoDaysAgo(2) : null,
      frozen_reason: status === 2 ? "异常高频请求，等待人工复核" : "",
      admin_notes: index === 4 ? "高校联合实验室核心用户" : "",
      email_verified: index !== 10,
      phone_verified: index % 4 !== 3,
      last_login_at: isoDaysAgo(index % 6, 8 + (index % 8)),
      last_login_ip: `116.23.${index + 10}.${80 + index}`,
      last_active_at:
        status === 1
          ? isoDaysAgo(index % 4, 9 + (index % 7))
          : isoDaysAgo(10 + index),
      vip_tier: tier,
      vip_expires_at: tier === "free" ? null : futureIso(18 + index * 13),
      register_source: source,
      created_at: isoDaysAgo(8 + index * 17),
      updated_at: isoDaysAgo(index % 5),
    };
  },
);

const userVips: Record<number, UserVipStatus> = Object.fromEntries(
  users.map((user, index) => {
    const tier = user.vip_tier ?? "free";
    const ceiling =
      tier === "max" ? 9_000_000 : tier === "pro" ? 3_000_000 : 350_000;
    const used = Math.round(ceiling * (0.08 + (index % 7) * 0.11));
    const temp = tier === "free" ? 0 : 120 + index * 35;
    const perm = 40 + index * 18;
    return [
      user.id,
      {
        tier,
        cycle:
          tier === "free" ? undefined : index % 3 === 0 ? "yearly" : "monthly",
        expires_at: user.vip_expires_at ?? null,
        token: {
          used,
          ceiling,
          percent: Number(((used / ceiling) * 100).toFixed(1)),
          unlimited: false,
          consumed_today: 12_400 + index * 3_780,
          window_days: 7,
          window_started_at: isoDaysAgo(4),
          window_reset_at: futureIso(3),
        },
        credit: { temp, perm, total: temp + perm },
        auto_reset: index % 2 === 0,
        reset_cost: 30,
      } satisfies UserVipStatus,
    ];
  }),
);

const planNames = [
  "Pro 月度会员",
  "Max 月度会员",
  "科研经费充值",
  "Pro 年度会员",
] as const;
const orders: BillingOrder[] = Array.from({ length: 28 }, (_, index) => {
  const orderType = index % 4 === 2 ? "recharge" : "subscription";
  const status =
    index % 9 === 7 ? "pending" : index % 11 === 8 ? "expired" : "paid";
  const amount =
    orderType === "recharge"
      ? [29, 68, 128][index % 3]
      : [39, 89, 399][index % 3];
  const user = users[index % users.length];
  return {
    id: index + 1,
    user_id: user.id,
    username: user.username ?? `用户 ${user.id}`,
    email: user.email ?? "",
    order_no: `SC${dateDaysAgo(index % 24).replaceAll("-", "")}${String(10018 + index)}`,
    order_type: orderType,
    plan_code:
      orderType === "recharge"
        ? `credit_${amount}`
        : index % 3 === 1
          ? "max_month"
          : "pro_month",
    plan_name: planNames[index % planNames.length],
    billing_cycle:
      orderType === "recharge"
        ? "once"
        : index % 4 === 3
          ? "yearly"
          : "monthly",
    amount,
    final_amount: index % 6 === 0 ? Number((amount * 0.9).toFixed(2)) : amount,
    status,
    payment_method: index % 3 === 0 ? "alipay" : "wechat",
    payment_time:
      status === "paid" ? isoDaysAgo(index % 24, 9 + (index % 10)) : null,
    credits_granted:
      orderType === "recharge" ? amount * 10 : index % 3 === 1 ? 500 : 180,
    transaction_no:
      status === "paid" ? `420000${String(2200000000 + index)}` : "",
    sub_action:
      orderType === "subscription" ? (index % 5 === 0 ? "renew" : "new") : "",
    created_at: isoDaysAgo(index % 24, 8 + (index % 11)),
  };
});

const vipCodes: VipCode[] = [
  [
    "SCHOLAR-PRO-7D",
    "tier",
    "pro",
    7,
    0,
    "",
    0,
    50,
    37,
    null,
    14,
    "新用户体验活动",
  ],
  [
    "LAB-MAX-30D",
    "tier",
    "max",
    30,
    0,
    "",
    0,
    20,
    8,
    null,
    26,
    "实验室合作批次",
  ],
  [
    "CREDIT-500",
    "credit",
    "",
    0,
    500,
    "temp",
    30,
    100,
    63,
    null,
    20,
    "科研经费体验包",
  ],
  [
    "CAMPUS-2026",
    "tier",
    "pro",
    90,
    0,
    "",
    0,
    10,
    10,
    null,
    6,
    "校园大使已领完",
  ],
  [
    "PERM-200",
    "credit",
    "",
    0,
    200,
    "perm",
    0,
    30,
    4,
    null,
    28,
    "永久经费补偿",
  ],
  [
    "SUMMER-MAX",
    "tier",
    "max",
    14,
    0,
    "",
    0,
    60,
    12,
    isoDaysAgo(1),
    12,
    "活动暂停",
  ],
].map((row, index) => {
  const [
    code,
    grantKind,
    grantTier,
    grantDays,
    grantCredits,
    creditKind,
    creditValidityDays,
    maxUses,
    usedCount,
    revokedAt,
    validDays,
    note,
  ] = row;
  return {
    id: index + 1,
    code: String(code),
    grant_kind: String(grantKind),
    grant_tier: String(grantTier),
    grant_days: Number(grantDays),
    grant_credits: Number(grantCredits),
    credit_kind: String(creditKind),
    credit_validity_days: Number(creditValidityDays),
    max_uses: Number(maxUses),
    used_count: Number(usedCount),
    revoked_at: revokedAt ? String(revokedAt) : null,
    valid_until: futureIso(Number(validDays)),
    redeemed_by_user_id:
      Number(usedCount) > 0 ? (index % users.length) + 1 : null,
    redeemed_at: Number(usedCount) > 0 ? isoDaysAgo(index + 1) : null,
    note: String(note),
    created_by: 1,
    created_at: isoDaysAgo(32 - index * 4),
  };
});

const announcements: Announcement[] = [
  {
    id: 1,
    type: "banner",
    title: "模型能力升级",
    content: "智能搜索与智能审稿已切换到更快的新模型，长文处理速度提升约 40%。",
    link_url: "/pricing",
    link_text: "查看会员权益",
    severity: "info",
    target_audience: "all",
    dismissable: 1,
    starts_at: isoDaysAgo(2),
    ends_at: futureIso(12),
    is_active: 1,
    priority: 90,
    created_by: 1,
    created_at: isoDaysAgo(3),
    updated_at: isoDaysAgo(1),
  },
  {
    id: 2,
    type: "modal",
    title: "服务维护提醒",
    content:
      "本周六 02:00–03:00 将进行数据库维护，期间部分历史记录可能短暂不可用。",
    severity: "warning",
    target_audience: "logged_in",
    dismissable: 1,
    starts_at: futureIso(1),
    ends_at: futureIso(4),
    is_active: 1,
    priority: 100,
    created_by: 1,
    created_at: isoDaysAgo(1),
    updated_at: isoDaysAgo(1),
  },
  {
    id: 3,
    type: "toast",
    title: "欢迎体验功能广场",
    content: "超过 120 款科研工具已完成结构化整理。",
    severity: "info",
    target_audience: "guests",
    dismissable: 1,
    starts_at: null,
    ends_at: null,
    is_active: 0,
    priority: 30,
    created_by: 2,
    created_at: isoDaysAgo(20),
    updated_at: isoDaysAgo(8),
  },
];

const snippets: CodeSnippet[] = [
  {
    id: 1,
    name: "Google Analytics 4",
    code_key: "ga4-production",
    category: "analytics",
    position: "head",
    code_content:
      '<script async src="https://www.googletagmanager.com/gtag/js?id=G-SCHOLAY"></script>',
    description: "主站访问分析，生产环境全页面注入",
    is_enabled: true,
    priority: 100,
    pages: ["*"],
    created_at: isoDaysAgo(80),
    updated_at: isoDaysAgo(3),
  },
  {
    id: 2,
    name: "结构化数据补充",
    code_key: "schema-org",
    category: "seo",
    position: "head",
    code_content:
      '<script type="application/ld+json">{"@context":"https://schema.org"}</script>',
    description: "论文详情页 Schema.org 基础结构",
    is_enabled: true,
    priority: 80,
    pages: ["/paper/*"],
    created_at: isoDaysAgo(42),
    updated_at: isoDaysAgo(10),
  },
  {
    id: 3,
    name: "客服浮窗实验",
    code_key: "support-widget-ab",
    category: "other",
    position: "body_end",
    code_content: '<div id="support-experiment"></div>',
    description: "设计验证用，默认停用",
    is_enabled: false,
    priority: 10,
    pages: ["/help"],
    created_at: isoDaysAgo(12),
    updated_at: isoDaysAgo(2),
  },
];

const dimensions: AnalysisDimension[] = [
  ["novelty", "创新性", "研究问题、观点与方法相较现有工作的创新程度"],
  ["methodology", "方法严谨性", "研究设计、数据、实验与统计方法是否严谨"],
  ["evidence", "证据充分性", "结论是否被数据与论证充分支持"],
  ["clarity", "表达清晰度", "结构、语言与图表是否清楚准确"],
  ["reproducibility", "可复现性", "材料、代码和步骤能否支持独立复现"],
  ["impact", "学术影响力", "对领域理论、方法或实践的潜在贡献"],
  ["ethics", "伦理与合规", "伦理审批、隐私、利益冲突与研究规范"],
  ["literature", "文献完整性", "相关工作覆盖与引用是否全面恰当"],
].map(([key, name, description], index) => ({
  id: index + 1,
  userId: 0,
  dimensionKey: key,
  name,
  description,
  sortOrder: (index + 1) * 10,
  isActive: index !== 7,
  isHidden: false,
  createdAt: isoDaysAgo(180),
  updatedAt: isoDaysAgo(index + 1),
}));

const feedbacks: Feedback[] = [
  ["智能搜索结果能否增加年份范围快捷筛选？", "feature", "pending"],
  ["导出的审稿报告里有一张图片没有显示。", "bug", "processed"],
  ["希望矩阵分析支持自定义列顺序并保存模板。", "suggestion", "replied"],
  ["会员升级后额度显示延迟，刷新后恢复。", "billing", "closed"],
  ["移动端打开论文详情时工具栏遮挡正文。", "bug", "pending"],
  ["非常喜欢新的知识库视图，检索体验很好。", "praise", "replied"],
].map(([content, category, status], index) => {
  const user = users[(index + 2) % users.length];
  return {
    id: index + 1,
    email: user.email ?? "",
    content,
    attachments: index === 1 || index === 4 ? "1" : "",
    userId: user.id,
    username: user.username ?? "",
    ip: `120.82.10.${20 + index}`,
    ipLocation: index % 2 ? "上海市" : "广东省深圳市",
    status: status as Feedback["status"],
    category,
    replyContent:
      status === "replied" ? "感谢建议，我们已记录并纳入下一轮产品迭代。" : "",
    repliedAt: status === "replied" ? isoDaysAgo(1) : undefined,
    repliedBy: status === "replied" ? "产品运营 · 陈知远" : "",
    assignedTo: status === "pending" ? null : 2,
    assigneeName: status === "pending" ? "" : "陈知远",
    internalNotes:
      status === "processed" ? "已复现，关联前端渲染任务 FE-218。" : "",
    firstResponseAt: status !== "pending" ? isoDaysAgo(index + 1) : undefined,
    createdAt: isoDaysAgo(index * 2 + 1, 9 + index),
    updatedAt: isoDaysAgo(Math.max(0, index - 1)),
  };
});

const feedbackAttachments: Record<number, FeedbackAttachment[]> = {
  2: [
    {
      name: "report-export-preview.png",
      url: "/api/v1/public/feedback/attachment/mock-report",
      size: 348_120,
      type: "image",
    },
  ],
  5: [
    {
      name: "mobile-toolbar-overlap.jpg",
      url: "/api/v1/public/feedback/attachment/mock-mobile",
      size: 512_840,
      type: "image",
    },
  ],
};

const messages: AdminMessage[] = [
  {
    id: 1,
    title: "智能搜索模型升级完成",
    content: "新模型已上线，你可以获得更快的检索规划与更稳定的引用结果。",
    category: "system",
    send_type: "all",
    link_url: "/search",
    link_text: "立即体验",
    sender_id: 1,
    sender_name: "Scholay 团队",
    send_at: isoDaysAgo(2),
    expire_at: futureIso(30),
    status: "sent",
    recipient_count: 12_486,
    read_count: 8_209,
    created_at: isoDaysAgo(3),
    updated_at: isoDaysAgo(2),
  },
  {
    id: 2,
    title: "Max 会员专属功能预告",
    content: "下一版本将开放跨项目记忆与超长上下文。",
    category: "marketing",
    send_type: "plans",
    target_plans: '["max"]',
    sender_id: 2,
    sender_name: "产品运营",
    status: "draft",
    recipient_count: 0,
    read_count: 0,
    created_at: isoDaysAgo(1),
    updated_at: isoDaysAgo(1),
  },
  {
    id: 3,
    title: "维护结束通知",
    content: "数据维护已完成，所有功能均已恢复。",
    category: "notification",
    send_type: "all",
    sender_id: 1,
    sender_name: "Scholay 团队",
    send_at: isoDaysAgo(12),
    status: "sent",
    recipient_count: 11_920,
    read_count: 9_806,
    created_at: isoDaysAgo(12),
    updated_at: isoDaysAgo(12),
  },
];

const hotKeywords: HotKeyword[] = [
  "大语言模型",
  "单细胞测序",
  "具身智能",
  "气候变化",
  "扩散模型",
  "钙钛矿太阳能电池",
  "强化学习",
  "空间转录组",
  "数字孪生",
  "脑机接口",
  "CRISPR",
  "学术写作",
].map((keyword, index) => ({
  id: index + 1,
  keyword,
  keyword_hash: `mock-${String(index + 1).padStart(4, "0")}`,
  search_type: index % 5 === 4 ? "journal" : "paper",
  search_count: 1_960 - index * 127,
  first_searched_at: isoDaysAgo(90 - index),
  last_searched_at: isoDaysAgo(index % 3, 10 + (index % 8)),
}));

const paperSeeds = [
  [
    "Sparks of Artificial General Intelligence: Early experiments with GPT-4",
    "10.48550/arXiv.2303.12712",
    2023,
    "arXiv",
  ],
  ["Segment Anything", "10.1109/ICCV51070.2023.00371", 2023, "ICCV"],
  ["Attention Is All You Need", "10.48550/arXiv.1706.03762", 2017, "NeurIPS"],
  [
    "Highly accurate protein structure prediction with AlphaFold",
    "10.1038/s41586-021-03819-2",
    2021,
    "Nature",
  ],
  [
    "A foundation model for generalist medical artificial intelligence",
    "10.1038/s41586-023-05881-4",
    2023,
    "Nature",
  ],
  [
    "Denoising Diffusion Probabilistic Models",
    "10.48550/arXiv.2006.11239",
    2020,
    "NeurIPS",
  ],
  [
    "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    "10.48550/arXiv.2005.11401",
    2020,
    "NeurIPS",
  ],
  [
    "Language models are few-shot learners",
    "10.5555/3495724.3495883",
    2020,
    "NeurIPS",
  ],
] as const;

const hotPapers: HotPaper[] = paperSeeds.map(
  ([title, doi, year, venue], index) => ({
    id: index + 1,
    paper_id: `mock-paper-${index + 1}`,
    doi,
    title,
    abstract:
      "This mock abstract provides enough realistic content for layout, truncation and detail-state testing.",
    authors: ["A. Researcher, B. Scholar", "Y. Chen, M. Li", "J. Smith et al."][
      index % 3
    ],
    year,
    venue,
    impression_count: 18_420 - index * 1_230,
    click_count: 4_890 - index * 317,
    seo_view_count: 2_140 - index * 129,
    first_viewed_at: isoDaysAgo(120 - index * 4),
    last_viewed_at: isoDaysAgo(index % 4),
  }),
);

const makeModel = (
  id: number,
  modelId: string,
  displayName: string,
  overrides: Partial<AgentModel> = {},
): AgentModel => ({
  id,
  model_id: modelId,
  provider_id: 0,
  display_name: displayName,
  description: "适合日常科研问答、文献梳理与结构化分析。",
  channel: "agent",
  context_window: 1_000_000,
  max_input: 616_000,
  max_output: 384_000,
  price_in: 1,
  price_out: 2,
  price_cache_r: 0.02,
  price_cache_w: 0,
  input_tier_threshold: 0,
  price_in_hi: 0,
  price_out_hi: 0,
  price_cache_r_hi: 0,
  price_cache_w_hi: 0,
  input_tier_threshold_2: 0,
  price_in_hi2: 0,
  price_out_hi2: 0,
  price_cache_r_hi2: 0,
  price_cache_w_hi2: 0,
  speed_class: "balanced",
  vision: false,
  flagship: false,
  user_selectable: true,
  min_tier: "",
  enabled: true,
  sort_order: id * 10,
  notes: "",
  created_at: isoDaysAgo(40 - id),
  updated_at: isoDaysAgo(id % 5),
  ...overrides,
});

const models: AgentModel[] = [
  makeModel(1, "deepseek-v4-flash", "DeepSeek V4 Flash", { flagship: true }),
  makeModel(2, "deepseek-v4-pro", "DeepSeek V4 Pro", {
    description: "复杂推理与长链路研究任务的旗舰模型。",
    price_in: 3,
    price_out: 6,
    speed_class: "powerful",
    flagship: true,
    min_tier: "max",
  }),
  makeModel(3, "qwen3.7-plus", "Qwen3.7 Plus", {
    provider_id: 2,
    vision: true,
    price_in: 2.4,
    price_out: 9.6,
    input_tier_threshold: 262_144,
    price_in_hi: 7.2,
    price_out_hi: 28.8,
    min_tier: "pro",
  }),
  makeModel(4, "kimi-k3", "Kimi K3", {
    provider_id: 3,
    description: "长文本理解与工具调用表现出色。",
    speed_class: "powerful",
    max_output: 131_072,
    max_input: 868_928,
    price_in: 4,
    price_out: 16,
    min_tier: "max",
  }),
  makeModel(5, "glm-5.2", "GLM 5.2", {
    provider_id: 4,
    vision: true,
    context_window: 262_144,
    max_input: 196_608,
    max_output: 65_536,
    price_in: 3,
    price_out: 9,
  }),
  makeModel(6, "qwen3.7-flash", "Qwen3.7 Flash", {
    provider_id: 2,
    description: "高速轻量模型，适合标题、摘要和后台带外任务。",
    speed_class: "fast",
    price_in: 0.6,
    price_out: 2.4,
    flagship: false,
  }),
];

const modelBindings: ModelBinding[] = [
  ["system.main", "deepseek-v4-flash"],
  ["system.fast", "qwen3.7-flash"],
  ["chat_default.smart_search", "qwen3.7-plus"],
  ["chat_default.claw", "deepseek-v4-pro"],
  ["chat_default.prism", "kimi-k3"],
  ["peerreview.meta", "qwen3.7-flash"],
  ["peerreview.methodology", "deepseek-v4-pro"],
  ["project.translate", "qwen3.7-flash"],
  ["project.analysis", "qwen3.7-plus"],
  ["project.wechat_oa", "qwen3.7-flash"],
].map(([purpose, modelId]) => ({
  purpose,
  model_id: modelId,
  effective: modelId,
  fallback: false,
}));

const modelProviders: AgentProviderDTO[] = [
  {
    id: 1,
    name: "平台默认 · DeepSeek",
    base_url: "https://api.deepseek.com/anthropic",
    api_key: "sk-••••••••••••D92a",
    api_format: "anthropic",
    reasoning_replay: false,
    enabled: true,
    push_status: "success",
    push_error: "",
    notes: "系统主端点",
  },
  {
    id: 2,
    name: "阿里云百炼 · Qwen",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key: "sk-••••••••••••Qwen",
    api_format: "openai",
    reasoning_replay: false,
    enabled: true,
    push_status: "success",
    push_error: "",
    notes: "多模态与快速模型",
  },
  {
    id: 3,
    name: "Moonshot · Kimi",
    base_url: "https://api.moonshot.cn/v1",
    api_key: "sk-••••••••••••Kimi",
    api_format: "openai",
    reasoning_replay: true,
    enabled: true,
    push_status: "success",
    push_error: "",
    notes: "开启 reasoning replay",
  },
  {
    id: 4,
    name: "智谱 · GLM",
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    api_key: "••••••••.mockGLM",
    api_format: "openai",
    reasoning_replay: false,
    enabled: false,
    push_status: "failed",
    push_error: "最近一次健康检查超时",
    notes: "备用视觉端点",
  },
];

const featureTools: FeatureTool[] = [
  {
    id: 1,
    slug: "zotero",
    name: "Zotero",
    name_en: "Zotero",
    aliases: ["佐特罗"],
    logo: "https://www.zotero.org/static/images/favicon.ico",
    tagline: "免费、开源的文献管理与引用工具",
    description_md: "收集、组织、标注并引用研究资料，支持丰富的插件生态。",
    category: "reference",
    category_label: "文献管理",
    tags: ["文献管理", "引用", "开源"],
    price_type: "free",
    is_open_source: true,
    languages: ["中文", "English"],
    platforms: ["Windows", "macOS", "Linux"],
    access_type: "both",
    official_url: "https://www.zotero.org",
    status: "published",
    sort_weight: 100,
    view_count: 48_230,
    favorite_count: 8_420,
    stats: {
      rating: 4.9,
      rating_count: 2_180,
      monthly_visits: 7_800_000,
      favorites: 8_420,
    },
    data_quality: {
      enriched: true,
      needs_review: false,
      sources: ["official"],
    },
    created_by: 1,
    created_at: isoDaysAgo(100),
    updated_at: isoDaysAgo(2),
    published_at: isoDaysAgo(90),
  },
  {
    id: 2,
    slug: "connected-papers",
    name: "Connected Papers",
    tagline: "用可视化图谱探索相关论文",
    description_md: "从种子论文生成相似工作图谱，快速理解研究领域结构。",
    category: "discovery",
    category_label: "文献发现",
    tags: ["知识图谱", "文献发现"],
    price_type: "freemium",
    languages: ["English"],
    platforms: ["Web"],
    access_type: "website",
    official_url: "https://www.connectedpapers.com",
    status: "published",
    sort_weight: 90,
    view_count: 31_204,
    favorite_count: 5_882,
    stats: { rating: 4.7, rating_count: 942, monthly_visits: 1_900_000 },
    data_quality: { enriched: true, needs_review: false },
    created_by: 1,
    created_at: isoDaysAgo(88),
    updated_at: isoDaysAgo(7),
    published_at: isoDaysAgo(80),
  },
  {
    id: 3,
    slug: "vosviewer",
    name: "VOSviewer",
    tagline: "构建与查看文献计量网络",
    description_md: "适用于共现、共引、合作网络与科学地图分析。",
    category: "bibliometrics",
    category_label: "文献计量",
    tags: ["计量分析", "网络可视化"],
    price_type: "free",
    languages: ["English"],
    platforms: ["Windows", "macOS", "Linux"],
    access_type: "download",
    official_url: "https://www.vosviewer.com",
    status: "published",
    sort_weight: 80,
    view_count: 18_932,
    favorite_count: 2_704,
    created_by: 2,
    created_at: isoDaysAgo(62),
    updated_at: isoDaysAgo(12),
    published_at: isoDaysAgo(58),
  },
  {
    id: 4,
    slug: "research-rabbit",
    name: "ResearchRabbit",
    tagline: "像 Spotify 一样发现论文与作者",
    category: "discovery",
    category_label: "文献发现",
    tags: ["推荐", "收藏夹"],
    price_type: "free",
    access_type: "website",
    official_url: "https://www.researchrabbit.ai",
    status: "pending",
    sort_weight: 50,
    view_count: 0,
    favorite_count: 0,
    data_quality: {
      enriched: false,
      needs_review: true,
      needs_enrich: ["pricing", "vendor"],
    },
    created_by: 2,
    created_at: isoDaysAgo(4),
    updated_at: isoDaysAgo(1),
  },
  {
    id: 5,
    slug: "rayyan",
    name: "Rayyan",
    tagline: "系统综述筛选协作平台",
    category: "systematic-review",
    category_label: "系统综述",
    tags: ["系统综述", "筛选", "协作"],
    price_type: "freemium",
    access_type: "website",
    official_url: "https://www.rayyan.ai",
    status: "draft",
    sort_weight: 30,
    view_count: 0,
    favorite_count: 0,
    created_by: 1,
    created_at: isoDaysAgo(2),
    updated_at: isoDaysAgo(2),
  },
  {
    id: 6,
    slug: "gephi",
    name: "Gephi",
    tagline: "开源网络分析与可视化软件",
    category: "visualization",
    category_label: "数据可视化",
    tags: ["网络分析", "开源"],
    price_type: "free",
    is_open_source: true,
    access_type: "download",
    official_url: "https://gephi.org",
    status: "archived",
    sort_weight: 10,
    view_count: 9_821,
    favorite_count: 1_280,
    created_by: 1,
    created_at: isoDaysAgo(190),
    updated_at: isoDaysAgo(60),
  },
];

const importJobs: ImportJob[] = [
  {
    id: 1,
    status: "succeeded",
    phase: "done",
    source: "运营工具集",
    filename: "research-tools-2026-07.zip",
    notify: true,
    total: 42,
    processed: 42,
    logo_total: 38,
    logo_done: 38,
    created_cnt: 31,
    updated_cnt: 9,
    skipped_cnt: 2,
    failed_cnt: 0,
    detail: [
      { idx: 0, name: "Zotero", action: "updated" },
      { idx: 1, name: "Connected Papers", action: "created" },
      { idx: 2, name: "重复测试项", action: "skipped" },
    ],
    created_at: isoDaysAgo(3),
    updated_at: isoDaysAgo(3),
    finished_at: isoDaysAgo(3),
  },
  {
    id: 2,
    status: "partial",
    phase: "done",
    source: "社区征集",
    filename: "community-batch.json",
    notify: false,
    total: 18,
    processed: 18,
    logo_total: 0,
    logo_done: 0,
    created_cnt: 14,
    updated_cnt: 2,
    skipped_cnt: 0,
    failed_cnt: 2,
    error: "2 个条目缺少必填字段",
    detail: [
      {
        idx: 7,
        name: "Unnamed item",
        action: "failed",
        error: "name is required",
      },
      {
        idx: 12,
        name: "Bad URL Tool",
        action: "failed",
        error: "official_url is invalid",
      },
    ],
    created_at: isoDaysAgo(8),
    updated_at: isoDaysAgo(8),
    finished_at: isoDaysAgo(8),
  },
];

const webhooks: Webhook[] = [
  {
    id: 1,
    name: "运营内容同步",
    url: "https://ops.example.test/hooks/scholay-tools",
    secret: "••••••••••••9a2f",
    events: ["tool.created", "tool.updated", "tool.published"],
    enabled: true,
    last_status: "success",
    last_delivered_at: isoDaysAgo(1),
    created_at: isoDaysAgo(36),
    updated_at: isoDaysAgo(2),
  },
  {
    id: 2,
    name: "审核告警",
    url: "https://alerts.example.test/webhook/tools",
    secret: "••••••••••••c031",
    events: ["tool.import.failed"],
    enabled: false,
    last_status: "failed",
    last_delivered_at: isoDaysAgo(5),
    last_error: "HTTP 502 Bad Gateway",
    created_at: isoDaysAgo(20),
    updated_at: isoDaysAgo(5),
  },
];

const webhookDeliveries: WebhookDelivery[] = [
  {
    id: 1,
    webhook_id: 1,
    tool_id: 2,
    event: "tool.updated",
    status: "success",
    http_status: 200,
    attempt: 1,
    response_body: '{"ok":true}',
    created_at: isoDaysAgo(1),
  },
  {
    id: 2,
    webhook_id: 2,
    tool_id: 4,
    event: "tool.import.failed",
    status: "failed",
    http_status: 502,
    attempt: 3,
    error: "upstream unavailable",
    created_at: isoDaysAgo(5),
  },
];

const skills: MySkill[] = [
  [
    "literature-gap-finder",
    "研究空白发现器",
    "从文献集提炼研究空白与可验证问题",
    "research",
    "pending",
    142,
  ],
  [
    "systematic-review-helper",
    "系统综述助手",
    "生成检索式、纳排标准与 PRISMA 清单",
    "review",
    "approved",
    2_486,
  ],
  [
    "academic-tone-polisher",
    "学术语气润色",
    "在不改变含义的前提下改善论文表达",
    "writing",
    "flagged",
    918,
  ],
  [
    "figure-caption-auditor",
    "图注检查器",
    "检查图注是否自洽且包含必要说明",
    "writing",
    "rejected",
    17,
  ],
  [
    "methodology-critic",
    "方法论批评者",
    "从研究设计与统计角度提出质疑",
    "review",
    "pending",
    381,
  ],
].map(([slug, name, tagline, category, moderation, installs], index) => ({
  id: index + 1,
  slug: String(slug),
  name: String(name),
  tagline: String(tagline),
  category: String(category),
  visibility: "public",
  moderationStatus: moderation as MySkill["moderationStatus"],
  moderationNote:
    moderation === "rejected" ? "描述与实际能力不一致，请补充限制条件。" : "",
  status: moderation === "approved" ? "published" : "active",
  installCount: Number(installs),
  version: (index % 3) + 1,
  updatedAt: isoDaysAgo(index + 1),
}));

const skillReports: AdminSkillReport[] = [
  {
    id: 1,
    skillId: 3,
    versionId: 3,
    reporterUserId: 8,
    reason: "prompt_injection",
    detail: "技能说明中包含诱导模型忽略系统要求的段落。",
    status: "pending",
    createdAt: isoDaysAgo(1),
  },
  {
    id: 2,
    skillId: 2,
    reporterUserId: 11,
    reason: "ip_infringe",
    detail: "示例模板疑似直接复制某商业产品内容。",
    status: "pending",
    createdAt: isoDaysAgo(3),
  },
  {
    id: 3,
    skillId: 4,
    reporterUserId: 5,
    reason: "spam",
    detail: "技能输出包含与功能无关的推广链接。",
    status: "actioned",
    handledBy: 1,
    createdAt: isoDaysAgo(12),
    resolvedAt: isoDaysAgo(9),
  },
];

const inbox: InboxMail[] = [
  [
    "Dr. Emily Chen",
    "emily.chen@university.test",
    "关于机构版合作与 SSO 接入",
    "希望为实验室的 80 位研究人员采购机构版，并了解 SSO 与统一结算方案。",
    "unread",
  ],
  [
    "王老师",
    "wang.lab@university.test",
    "审稿报告导出格式问题",
    "我们发现导出的 PDF 在双栏论文中有少量行号偏移，附件已发送。",
    "read",
  ],
  [
    "Alex Morgan",
    "alex@research.test",
    "API access for literature discovery",
    "Could you share details about API access and rate limits for a research prototype?",
    "replied",
  ],
  [
    "高校联合实验室",
    "contact@jointlab.test",
    "续费发票信息确认",
    "请确认本年度续费的发票抬头与开票时间。",
    "unread",
  ],
  [
    "Zhang Wei",
    "zhangwei@example.test",
    "Account migration",
    "I would like to migrate my ORCID-linked account to a new email address.",
    "read",
  ],
].map(([fromName, fromAddr, subject, body, status], index) => ({
  id: index + 1,
  account: index % 2 === 0 ? "support@scholay.com" : "business@scholay.com",
  from_name: fromName,
  from_addr: fromAddr,
  to_addr: index % 2 === 0 ? "support@scholay.com" : "business@scholay.com",
  subject,
  sent_at: isoDaysAgo(index, 8 + index),
  snippet: body.slice(0, 72),
  text_body: body,
  html_body: `<p>${body}</p>`,
  status: status as InboxMail["status"],
  replied_at: status === "replied" ? isoDaysAgo(Math.max(0, index - 1)) : null,
  created_at: isoDaysAgo(index, 8 + index),
}));

const emailLogs: EmailLog[] = Array.from({ length: 18 }, (_, index) => {
  const channel = index % 4 === 3 ? "sms" : "email";
  const status = index % 7 === 5 ? "failed" : "success";
  const category = ["verification", "feedback", "billing", "test"][index % 4];
  const user = users[index % users.length];
  return {
    id: index + 1,
    channel,
    to_email: channel === "sms" ? (user.phone ?? "") : (user.email ?? ""),
    subject:
      channel === "sms"
        ? `【Scholay】您的验证码为 ${String(302814 + index)}，5 分钟内有效。`
        : category === "billing"
          ? "Scholay 会员订单支付成功"
          : category === "feedback"
            ? "我们已回复你的反馈"
            : "验证你的 Scholay 邮箱",
    category,
    from_email: channel === "email" ? "noreply@scholay.com" : "",
    from_name: channel === "email" ? "Scholay" : "Scholay科研",
    status,
    error:
      status === "failed"
        ? channel === "sms"
          ? "isv.MOBILE_NUMBER_ILLEGAL"
          : "550 mailbox unavailable"
        : "",
    created_at: isoDaysAgo(index % 9, 8 + (index % 12)),
  };
});

const thirdPartyAccounts: ThirdPartyAccount[] = [
  {
    id: 1,
    name: "Crossref 主账号",
    type: "minicod",
    config: {
      api_base: "https://api.crossref.org",
      mailto: "api@scholay.com",
      token: "mock_crossref_polite_token",
    },
    status: 1,
    priority: 10,
    usage_count: 82_410,
    last_used_at: isoDaysAgo(0),
    created_at: isoDaysAgo(220),
    updated_at: isoDaysAgo(7),
    total_requests: 82_410,
    success_count: 81_672,
    fail_count: 738,
    max_latency_ms: 4_820,
    slow_count: 184,
    stats: {
      success_rate: 99.1,
      avg_latency_ms: 284,
      std_dev_ms: 92,
      slow_avg_ms: 1_840,
      slow_rate: 0.22,
    },
  },
  {
    id: 2,
    name: "Semantic Scholar API",
    type: "minicod",
    config: {
      api_base: "https://api.semanticscholar.org/graph/v1",
      api_key: "mock_semantic_scholar_key_A81c",
    },
    status: 1,
    priority: 20,
    usage_count: 46_208,
    last_used_at: isoDaysAgo(0),
    created_at: isoDaysAgo(168),
    updated_at: isoDaysAgo(12),
    total_requests: 46_208,
    success_count: 44_960,
    fail_count: 1_248,
    max_latency_ms: 7_210,
    slow_count: 603,
    stats: {
      success_rate: 97.3,
      avg_latency_ms: 516,
      std_dev_ms: 203,
      slow_avg_ms: 2_410,
      slow_rate: 1.31,
    },
  },
  {
    id: 3,
    name: "备用 AI 摘要账号",
    type: "ai_model",
    config: {
      api_base: "https://api.example.test/v1",
      api_key: "mock_summary_provider_key",
      model: "summary-fast",
    },
    status: 0,
    priority: 50,
    usage_count: 2_891,
    last_used_at: isoDaysAgo(15),
    created_at: isoDaysAgo(90),
    updated_at: isoDaysAgo(15),
    total_requests: 2_891,
    success_count: 2_511,
    fail_count: 380,
    max_latency_ms: 12_430,
    slow_count: 211,
    stats: {
      success_rate: 86.85,
      avg_latency_ms: 1_480,
      std_dev_ms: 610,
      slow_avg_ms: 4_820,
      slow_rate: 7.3,
    },
  },
];

const alipayConfigs: AlipayConfig[] = [
  {
    id: 1,
    app_id: "2021000000000001",
    private_key: "MOCK_ALIPAY_PRIVATE_KEY_FOR_DESIGN_ONLY",
    alipay_public_key: "MOCK_ALIPAY_PUBLIC_KEY_FOR_DESIGN_ONLY",
    gateway_url: "https://openapi.alipay.com/gateway.do",
    notify_url: "https://scholay.com/api/v1/payment/alipay/notify",
    return_url: "https://scholay.com/payment/result",
    is_sandbox: false,
    is_active: true,
    created_at: isoDaysAgo(210),
    updated_at: isoDaysAgo(20),
  },
  {
    id: 2,
    app_id: "2021000000000099",
    private_key: "MOCK_SANDBOX_PRIVATE_KEY_FOR_DESIGN_ONLY",
    alipay_public_key: "MOCK_SANDBOX_PUBLIC_KEY_FOR_DESIGN_ONLY",
    gateway_url: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
    notify_url: "https://staging.scholay.com/api/v1/payment/alipay/notify",
    return_url: "https://staging.scholay.com/payment/result",
    is_sandbox: true,
    is_active: false,
    created_at: isoDaysAgo(120),
    updated_at: isoDaysAgo(35),
  },
];

const wechatPayConfigs: WeChatPayConfig[] = [
  {
    id: 1,
    mch_id: "1900000001",
    app_id: "wx1234567890mock",
    api_v3_key: "mock_wechat_api_v3_key_32_chars",
    serial_no: "6E5A7D9F0210MOCK",
    private_key: "MOCK_WECHAT_PRIVATE_KEY_FOR_DESIGN_ONLY",
    notify_url: "https://scholay.com/api/v1/payment/wechat/notify",
    is_sandbox: false,
    is_active: true,
    created_at: isoDaysAgo(190),
    updated_at: isoDaysAgo(18),
  },
];

const configs = {
  agent: {
    base_url: "https://api.deepseek.com/anthropic",
    api_key: "sk-mock-deepseek-design-D92a",
    enabled: true,
    push_status: "success",
    push_error: "",
  } satisfies AgentConfig,
  billing: {
    id: 1,
    free_daily_tokens: 50_000,
    free_window_tokens: 350_000,
    window_days: 7,
    base_price_per_m: 2,
    pro_multiplier: 8,
    max_multiplier: 24,
    pro_price_cents: 3_900,
    pro_original_cents: 5_900,
    max_price_cents: 8_900,
    max_original_cents: 12_900,
    pro_grant_credits: 180,
    max_grant_credits: 500,
    pro_year_price_cents: 39_900,
    pro_year_original_cents: 59_900,
    max_year_price_cents: 89_900,
    max_year_original_cents: 129_900,
    pro_year_grant_credits: 2_160,
    max_year_grant_credits: 6_000,
    subscription_year_days: 365,
    recharge_rate: 10,
    min_recharge_cents: 1_000,
    reset_cost_credits: 30,
    subscription_period_days: 30,
    popular_plan: "pro",
    enabled: true,
  } satisfies BillingConfig,
  system: {
    id: 1,
    require_email_verification: true,
    enable_turnstile: true,
    turnstile_site_key: "0x4AAAAAAAMOCK_SITE_KEY",
    turnstile_secret_key: "mock_turnstile_secret_for_design",
    google_analytics_id: "G-SCHOLAY26",
    created_at: isoDaysAgo(300),
    updated_at: isoDaysAgo(15),
  } satisfies SystemConfig,
  email: {
    id: 1,
    smtp_host: "smtp.exmail.qq.com",
    smtp_port: 465,
    smtp_user: "noreply@scholay.com",
    smtp_password: "mock_smtp_password_for_design",
    from_email: "noreply@scholay.com",
    from_name: "Scholay",
    is_active: true,
    created_at: isoDaysAgo(280),
    updated_at: isoDaysAgo(21),
  } satisfies EmailConfig,
  sms: {
    id: 1,
    access_key_id: "LTAI5tMockAccessKey",
    access_secret: "mock_aliyun_access_secret_for_design",
    sign_name: "Scholay科研",
    template_code: "SMS_289100001",
    template_content: "您的验证码为 ${code}，5 分钟内有效。",
    endpoint: "dysmsapi.aliyuncs.com",
    is_active: true,
    created_at: isoDaysAgo(260),
    updated_at: isoDaysAgo(32),
  } satisfies SMSConfig,
  newsWebhook: {
    enabled: true,
    webhook_url: "https://scholay.com/api/v1/public/news/webhook",
    webhook_secret: "mock_news_hmac_secret_for_design",
  } satisfies NewsWebhookConfig,
  promo: {
    id: 1,
    enabled: true,
    title: "限时领取 7 天 Pro 会员",
    subtitle: "添加科研顾问微信，领取专属体验权益",
    benefits: "7 天 Pro 会员\n350 万 Token 周额度\n专属科研工作流指导",
    button_text: "扫码立即领取",
    wechat_qr: "",
  } satisfies PromoConfig,
  miniProgram: {
    app_id: "wx9f00000000mock",
    app_secret: "mock_miniprogram_secret_for_design",
    enabled: true,
  } satisfies WechatMiniProgramConfig,
  officialWechat: {
    app_id: "wxoa00000000mock",
    app_secret: "mock_official_account_secret",
    token: "mock_official_account_token",
    encoding_aes_key: "mock_official_account_encoding_aes_key",
    encryption_mode: "secure",
    auto_reply_enabled: true,
    ai_model_level: "medium",
    system_prompt:
      "你是 Scholay 科研助手。回答简洁、可靠，并引导用户使用站内功能。",
  } satisfies WechatOfficialConfig,
  support: {
    id: 1,
    support_email: "support@scholay.com",
    business_email: "business@scholay.com",
    contact_note: "工作日 9:30–18:30，我们通常会在 4 小时内回复。",
    wecom_qr: "",
    feishu_qr: "",
    imap_enabled: true,
    imap_host: "imap.exmail.qq.com",
    imap_port: 993,
    imap_username: "support@scholay.com",
    imap_password: "mock_imap_password_for_design",
    imap_tls: true,
    imap_poll_minutes: 5,
    smtp_host: "smtp.exmail.qq.com",
    smtp_port: 465,
    smtp_username: "support@scholay.com",
    smtp_password: "mock_support_smtp_password",
    smtp_from_name: "Scholay 客服中心",
    feishu_webhook_url: "https://open.feishu.cn/open-apis/bot/v2/hook/mock",
    feishu_secret: "mock_feishu_signing_secret",
    feishu_notify_feedback: true,
    feishu_notify_email: true,
    feishu_notify_payment: true,
  } satisfies SupportCenterConfig,
};

const oauthConfigs: Record<string, OAuthConfigRecord> = {
  github: {
    client_id: "Iv1.scholaymock",
    client_secret: "mock_github_client_secret",
    redirect_uri: "https://scholay.com/github/callback",
    enabled: true,
    updated_at: isoDaysAgo(25),
  },
  google: {
    client_id: "103000000000-mock.apps.googleusercontent.com",
    client_secret: "mock_google_client_secret",
    enabled: true,
    updated_at: isoDaysAgo(18),
  },
  apple: {
    service_id: "com.scholay.web",
    team_id: "A1B2C3D4E5",
    key_id: "K1L2M3N4O5",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nMOCK_APPLE_PRIVATE_KEY\n-----END PRIVATE KEY-----",
    redirect_uri: "https://scholay.com/apple/callback",
    enabled: false,
    updated_at: isoDaysAgo(60),
  },
  orcid: {
    client_id: "APP-MOCKORCID",
    client_secret: "mock_orcid_client_secret",
    redirect_uri: "https://scholay.com/orcid/callback",
    use_sandbox: false,
    enabled: true,
    updated_at: isoDaysAgo(34),
  },
  microsoft: {
    client_id: "9de00000-mock-4000-8000-scholay",
    client_secret: "mock_microsoft_client_secret",
    redirect_uri: "https://scholay.com/microsoft/callback",
    tenant: "common",
    enabled: false,
    updated_at: isoDaysAgo(70),
  },
  discourse: {
    site_url: "https://enterscholar.com",
    sso_secret: "mock_discourse_sso_secret",
    redirect_uri: "https://scholay.com/discourse/callback",
    enabled: true,
    updated_at: isoDaysAgo(12),
  },
  wechat: {
    id: 1,
    app_id: "wxweb00000000mock",
    app_secret: "mock_wechat_web_client_secret",
    redirect_uri: "https://scholay.com/wechat/callback",
    scope: "snsapi_login",
    is_active: true,
    updated_at: isoDaysAgo(16),
  },
};

export interface AdminMockState {
  users: AdminUser[];
  userVips: Record<number, UserVipStatus>;
  orders: BillingOrder[];
  vipCodes: VipCode[];
  announcements: Announcement[];
  snippets: CodeSnippet[];
  dimensions: AnalysisDimension[];
  feedbacks: Feedback[];
  feedbackAttachments: Record<number, FeedbackAttachment[]>;
  messages: AdminMessage[];
  hotKeywords: HotKeyword[];
  hotPapers: HotPaper[];
  hotConfig: HotContentConfig;
  models: AgentModel[];
  modelBindings: ModelBinding[];
  modelProviders: AgentProviderDTO[];
  featureTools: FeatureTool[];
  importJobs: ImportJob[];
  webhooks: Webhook[];
  webhookDeliveries: WebhookDelivery[];
  skills: MySkill[];
  skillReports: AdminSkillReport[];
  inbox: InboxMail[];
  emailLogs: EmailLog[];
  thirdPartyAccounts: ThirdPartyAccount[];
  alipayConfigs: AlipayConfig[];
  wechatPayConfigs: WeChatPayConfig[];
  configs: typeof configs;
  oauthConfigs: Record<string, OAuthConfigRecord>;
}

const createInitialState = (): AdminMockState => ({
  users,
  userVips,
  orders,
  vipCodes,
  announcements,
  snippets,
  dimensions,
  feedbacks,
  feedbackAttachments,
  messages,
  hotKeywords,
  hotPapers,
  hotConfig: {
    id: 1,
    retention_days: 180,
    max_records: 250_000,
    updated_at: isoDaysAgo(14),
  },
  models,
  modelBindings,
  modelProviders,
  featureTools,
  importJobs,
  webhooks,
  webhookDeliveries,
  skills,
  skillReports,
  inbox,
  emailLogs,
  thirdPartyAccounts,
  alipayConfigs,
  wechatPayConfigs,
  configs,
  oauthConfigs,
});

const loadState = (): AdminMockState => {
  const fallback = createInitialState();
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AdminMockState>;
    return {
      ...fallback,
      ...parsed,
      configs: { ...fallback.configs, ...parsed.configs },
      oauthConfigs: { ...fallback.oauthConfigs, ...parsed.oauthConfigs },
    };
  } catch {
    return fallback;
  }
};

export const adminMockState = loadState();

export const persistAdminMockState = (): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(adminMockState));
  } catch {
    // Storage may be unavailable in private browsing. In-memory state still works.
  }
};

export const nextAdminId = (items: Array<{ id: number }>): number =>
  items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
