import type { WikiNavNode } from "../../../types";
import { primary } from "../targets";

export const administrationNode: WikiNavNode = {
  id: "other-administration",
  title: "管理后台",
  adminOnly: true,
  children: [
    {
      id: "other-admin-console",
      title: "管理后台总览",
      target: primary("admin-console"),
    },
    {
      id: "other-admin-access",
      title: "后台角色与权限",
      target: primary("admin-access-control"),
    },
    {
      id: "other-admin-dashboard",
      title: "后台仪表盘",
      target: primary("admin-dashboard"),
    },
    {
      id: "other-admin-users",
      title: "用户查询与详情",
      target: primary("admin-user-directory"),
    },
    {
      id: "other-admin-user-lifecycle",
      title: "用户冻结、删除与角色变更",
      target: primary("admin-user-lifecycle"),
    },
    {
      id: "other-admin-entitlements",
      title: "会员、科研经费与重置次数发放",
      target: primary("admin-user-entitlement-grants"),
    },
    {
      id: "other-admin-announcements",
      title: "公告管理",
      target: primary("admin-announcements"),
    },
    {
      id: "other-admin-hot-content",
      title: "热门内容运营",
      target: primary("admin-hot-content"),
    },
    {
      id: "other-admin-journal-sync",
      title: "期刊同步与发布",
      target: primary("admin-journal-sync"),
    },
    {
      id: "other-admin-tools",
      title: "工具目录、导入任务与 Webhook",
      target: primary("admin-tool-operations"),
    },
    {
      id: "other-admin-skill-moderation",
      title: "社区 Skill 审核",
      target: primary("admin-skill-moderation"),
    },
    {
      id: "other-admin-feedback",
      title: "反馈处理",
      target: primary("admin-feedback-operations"),
    },
    {
      id: "other-admin-messaging",
      title: "站内消息管理",
      target: primary("admin-messaging"),
    },
    {
      id: "other-admin-mail-support",
      title: "邮件中心、客服配置与日志",
      target: primary("admin-mail-support-observability"),
    },
    {
      id: "other-admin-session-monitoring",
      title: "AI 会话监控",
      target: primary("admin-session-monitoring"),
    },
    {
      id: "other-admin-site-analytics",
      title: "网站与爬虫分析",
      target: primary("admin-site-analytics"),
    },
    {
      id: "other-admin-feature-usage",
      title: "功能使用统计",
      target: primary("admin-feature-usage"),
    },
    {
      id: "other-admin-token-cost",
      title: "算力用量统计",
      target: primary("admin-token-cost"),
    },
    {
      id: "other-admin-invite-analytics",
      title: "邀请关系与转化分析",
      target: primary("admin-invite-analytics"),
    },
    {
      id: "other-admin-campaigns",
      title: "邀请活动与推广弹窗",
      target: primary("admin-campaigns-promo"),
    },
    {
      id: "other-admin-billing",
      title: "AI 计费配置",
      target: primary("admin-billing-configuration"),
    },
    {
      id: "other-admin-providers",
      title: "AI Provider 与模型目录",
      target: primary("admin-model-provider-catalog"),
    },
    {
      id: "other-admin-third-party",
      title: "第三方账号池",
      target: primary("admin-third-party-account-pool"),
    },
    {
      id: "other-admin-bindings",
      title: "模型用途绑定",
      target: primary("admin-model-bindings"),
    },
    {
      id: "other-admin-analysis-dimensions",
      title: "矩阵分析维度",
      target: primary("admin-analysis-dimensions"),
    },
    {
      id: "other-admin-wechat",
      title: "微信公众号配置",
      target: primary("admin-wechat-official"),
    },
    {
      id: "other-admin-news-webhook",
      title: "研究新闻 Webhook",
      target: primary("admin-news-webhook"),
    },
    {
      id: "other-admin-system-code",
      title: "系统配置与代码片段",
      target: primary("admin-system-code-snippets"),
    },
    {
      id: "other-admin-oauth",
      title: "OAuth 与第三方登录配置",
      target: primary("admin-oauth-config"),
    },
    {
      id: "other-admin-payment",
      title: "支付商户配置",
      target: primary("admin-payment-merchants"),
    },
  ],
};
