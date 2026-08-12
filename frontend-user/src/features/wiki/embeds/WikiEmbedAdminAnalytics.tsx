import { BarChart2, BarChart3, Coins, Globe2 } from "lucide-react";
import {
  AdminAnalyticsFixture,
  AdminSettingsFixture,
} from "./WikiEmbedAdminShared";

/** Umami 访问概览、趋势与爬虫维度 · 纯样式 fixture。 */
export function WikiEmbedAdminSiteAnalytics() {
  return (
    <AdminAnalyticsFixture
      fixture="admin-site-analytics"
      icon={Globe2}
      title="数据统计"
      description="后端读取自托管 Umami 数据并直接渲染访问与爬虫分析。"
      metrics={[
        {
          label: "独立访客",
          value: "82,640",
          note: "较上期 +12%",
          tone: "blue",
        },
        { label: "会话数", value: "106k", note: "最近 30 天" },
        { label: "访问页数", value: "284k", note: "2.7 页 / 会话" },
        { label: "实时访客", value: "326", note: "当前在线", tone: "green" },
      ]}
      tabs={["访问概览", "来源与设备", "爬虫分析"]}
      activeTab="访问概览"
      bars={[
        { label: "/search", value: "84,260", width: "full", tone: "blue" },
        {
          label: "/wiki",
          value: "61,420",
          width: "three-fourths",
          tone: "green",
        },
        {
          label: "直接访问",
          value: "42,180",
          width: "two-thirds",
          tone: "neutral",
        },
        { label: "Google", value: "26,840", width: "half", tone: "amber" },
      ]}
      activity={[
        {
          title: "访问聚合完成",
          detail: "",
          meta: "今天 10:20",
          status: "已更新",
          tone: "green",
        },
        {
          title: "爬虫报表生成",
          detail: "",
          meta: "今天 09:55",
          status: "已更新",
          tone: "green",
        },
      ]}
      notice="访问分析是聚合视图；与用户、订单或模型账本的业务口径不可直接互换。"
    />
  );
}

/** 功能事件、趋势与智能审稿漏斗 · 纯样式 fixture。 */
export function WikiEmbedAdminFeatureUsage() {
  return (
    <AdminAnalyticsFixture
      fixture="admin-feature-usage"
      icon={BarChart2}
      title="使用统计"
      description="按事件统计功能使用量，并以 submission 串联智能审稿漏斗。"
      metrics={[
        { label: "总使用次数", value: "486k", note: "最近 30 天" },
        { label: "今日使用", value: "18,420", note: "进行中", tone: "blue" },
        { label: "活跃用户", value: "12,680", note: "登录用户", tone: "green" },
        { label: "匿名访客", value: "3,842", note: "去重统计" },
      ]}
      tabs={["功能排行", "每日趋势", "智能审稿漏斗"]}
      activeTab="功能排行"
      bars={[
        { label: "论文搜索", value: "168k", width: "full", tone: "green" },
        {
          label: "智能搜索",
          value: "96k",
          width: "three-fourths",
          tone: "blue",
        },
        { label: "智能助手", value: "62k", width: "half", tone: "red" },
        { label: "智能写作", value: "38k", width: "third", tone: "amber" },
      ]}
      activity={[
        {
          title: "审稿已提交",
          detail: "",
          meta: "1,842 submissions",
          status: "100%",
          tone: "green",
        },
        {
          title: "报告已生成",
          detail: "",
          meta: "1,486 submissions",
          status: "80.7%",
          tone: "blue",
        },
      ]}
    />
  );
}

/** 算力点账本、Token 与模型成本维度 · 纯样式 fixture。 */
export function WikiEmbedAdminTokenCost() {
  return (
    <AdminAnalyticsFixture
      fixture="admin-token-cost"
      icon={Coins}
      title="算力用量统计"
      description="统一 LLM 账本 · 按模型单价精算 · 1 算力点 = ¥0.001，与用户额度同单位。"
      metrics={[
        {
          label: "总算力点",
          value: "18.42M",
          note: "≈ ¥18,420 真实成本",
          tone: "amber",
        },
        { label: "调用次数", value: "486k", note: "公众号 / 匿名 12,840 次" },
        {
          label: "总 Tokens",
          value: "2.84B",
          note: "缓存 1.2B · 命中率 42.3%",
          tone: "green",
        },
        {
          label: "独立用户",
          value: "12,680",
          note: "匿名消耗 386k 算力点",
          tone: "blue",
        },
      ]}
      tabs={["模型", "功能", "来源", "Provider", "Top 用户"]}
      activeTab="模型"
      bars={[
        {
          label: "deepseek-chat",
          value: "6.82M 算力点",
          width: "full",
          tone: "red",
        },
        {
          label: "qwen-max",
          value: "4.26M 算力点",
          width: "three-fourths",
          tone: "blue",
        },
        {
          label: "kimi-k2",
          value: "2.94M 算力点",
          width: "half",
          tone: "green",
        },
        {
          label: "glm-4.5",
          value: "1.72M 算力点",
          width: "third",
          tone: "amber",
        },
      ]}
      activity={[
        {
          title: "project.smart",
          detail: "",
          meta: "92,640 calls",
          status: "6.82M 点",
          tone: "blue",
        },
        {
          title: "project.claw",
          detail: "",
          meta: "64,280 calls",
          status: "4.26M 点",
          tone: "red",
        },
      ]}
      notice="未计价调用的 Tokens 不折算为算力点，并从总算力点中排除；成本未知不等于免费。"
    />
  );
}

/** 全局 AI 额度、会员倍率、套餐与经费换算 · 纯样式 fixture。 */
export function WikiEmbedAdminBillingConfiguration() {
  return (
    <AdminSettingsFixture
      fixture="admin-billing-configuration"
      icon={Coins}
      title="计费体系配置"
      description="统一维护周期额度、会员价格与经费按需付费换算。"
      notice="总开关关闭后 AI 调用不计费且不受额度限制；保存前应检查套餐与按量价格是否倒挂。"
      sections={[
        {
          title: "收费体系总开关",
          description: "用于全局灰度与应急，保存后最多 30 秒生效。",
          fields: [
            { label: "计费状态", value: "启用", kind: "enabled" },
            { label: "最受欢迎", value: "Pro" },
          ],
        },
        {
          title: "周期额度",
          description: "Free 基准与 Pro、Max 派生倍率。",
          fields: [
            { label: "窗口天数", value: "7 天" },
            { label: "Free 基准", value: "300 算力点" },
            { label: "Pro 倍率", value: "20×" },
            { label: "Max 倍率", value: "5× Pro" },
          ],
        },
        {
          title: "套餐价格",
          description: "月付与年付为独立价格，年付为零时隐藏入口。",
          fields: [
            { label: "Pro 月价", value: "¥59" },
            { label: "Max 月价", value: "¥269" },
            { label: "Pro 年价", value: "¥590" },
            { label: "Max 年价", value: "¥2,690" },
          ],
        },
        {
          title: "经费 / 按需付费",
          description: "充值汇率与经费兑换率共同决定按需付费单价。",
          fields: [
            { label: "充值汇率", value: "1 元 = 100 经费" },
            { label: "经费兑换率", value: "1 经费 = 3 算力点" },
            { label: "起充金额", value: "¥10" },
            {
              label: "经费→重置次数换算率（历史迁移用）",
              value: "60 经费 / 次 · 只读",
              kind: "readonly",
            },
          ],
        },
      ]}
    />
  );
}

/** 后台统计数据源缺失时的明确配置空态 · 纯样式 fixture。 */
export function WikiEmbedAdminAnalyticsSetup() {
  return (
    <AdminSettingsFixture
      fixture="admin-analytics-setup"
      icon={BarChart3}
      title="数据统计"
      description="Umami WEBSITE_ID 尚未配置时，页面显示可操作的安装指引。"
      action="查看部署说明"
      sections={[
        {
          title: "连接 Umami",
          description: "先创建 Website，再将 Website ID 写入环境配置。",
          fields: [
            { label: "Website ID", value: "未配置", kind: "disabled" },
            { label: "数据库", value: "scholar_mysql" },
            { label: "后端连接", value: "等待配置", kind: "disabled" },
          ],
        },
      ]}
    />
  );
}
