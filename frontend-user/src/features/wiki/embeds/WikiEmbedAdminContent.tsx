import {
  Bell,
  Boxes,
  DatabaseZap,
  Flame,
  Megaphone,
  Sparkles,
} from "lucide-react";
import {
  AdminAnalyticsFixture,
  AdminSettingsFixture,
  AdminTableFixture,
} from "./WikiEmbedAdminShared";

const SETTLED_ACTIVITY = [
  {
    title: "数据聚合完成",
    detail: "",
    meta: "今天 10:20",
    status: "已完成",
    tone: "green" as const,
  },
  {
    title: "日报快照已生成",
    detail: "",
    meta: "昨天 23:55",
    status: "已归档",
    tone: "neutral" as const,
  },
] as const;

/** 公告类型、受众、排期与派生状态 · 纯样式 fixture。 */
export function WikiEmbedAdminAnnouncements() {
  return (
    <AdminTableFixture
      fixture="admin-announcements"
      icon={Megaphone}
      title="公告"
      description="维护全局横幅、弹窗与维护说明的排期和受众。"
      action="新建公告"
      filters={["全部类型", "全部受众", "展示状态"]}
      rows={[
        {
          title: "暑期科研写作服务安排",
          detail: "banner · info · 全部用户 · 可关闭",
          meta: "8 月 12–20 日",
          status: "展示中",
          tone: "green",
        },
        {
          title: "支付渠道维护提醒",
          detail: "maintenance_note · warning · 已登录用户",
          meta: "8 月 16 日",
          status: "待生效",
          tone: "amber",
        },
        {
          title: "旧版功能下线说明",
          detail: "popup · info · 付费用户",
          meta: "7 月 1–15 日",
          status: "已过期",
          tone: "neutral",
        },
      ]}
      notice="保存并启用公告只更新后台记录；当前没有用户侧公开读取路由。"
    />
  );
}

/** 热搜词、热门论文与数据保留策略 · 纯样式 fixture。 */
export function WikiEmbedAdminHotContent() {
  return (
    <AdminAnalyticsFixture
      fixture="admin-hot-content"
      icon={Flame}
      title="热门内容"
      description="按搜索、曝光、点击与 SEO 直访观察内容热度。"
      metrics={[
        { label: "热搜词条", value: "1,286", note: "近 30 天" },
        { label: "热门论文", value: "842", note: "近 30 天", tone: "blue" },
        { label: "总曝光", value: "286k", note: "内容指标" },
        { label: "点击率", value: "12.4%", note: "点击 / 曝光", tone: "green" },
      ]}
      tabs={["热门搜索词", "热门论文", "保留策略"]}
      activeTab="热门搜索词"
      bars={[
        {
          label: "diffusion model",
          value: "12,840",
          width: "full",
          tone: "red",
        },
        {
          label: "protein structure",
          value: "9,210",
          width: "four-fifths",
          tone: "blue",
        },
        { label: "RAG", value: "7,860", width: "two-thirds", tone: "green" },
        { label: "学术写作", value: "4,620", width: "half", tone: "amber" },
      ]}
      activity={SETTLED_ACTIVITY}
      notice="历史 view_count 不再更新；当前浏览信号应看 impression、click 与 seo_view。"
    />
  );
}

/** 期刊上游抓取、暂存、资格筛选与发布状态机 · 纯样式 fixture。 */
export function WikiEmbedAdminJournalSync() {
  return (
    <AdminTableFixture
      fixture="admin-journal-sync"
      icon={DatabaseZap}
      title="期刊数据同步"
      description="上游数据先进入 staged，再按资格与批次发布到公开数据面。"
      action="开始同步"
      metrics={[
        { label: "上游总量", value: "38,420", note: "最新快照" },
        {
          label: "本地收录",
          value: "34,806",
          note: "staged 6,120",
          tone: "blue",
        },
        {
          label: "已发布",
          value: "28,686",
          note: "进入 sitemap",
          tone: "green",
        },
        { label: "待发布", value: "1,842", note: "资格达标", tone: "amber" },
      ]}
      tabs={["同步控制", "发布控制", "批次历史"]}
      activeTab="同步控制"
      rows={[
        {
          title: "SYNC-20260812-01",
          detail: "抓取 2,000 · 暂存 1,986 · 跳过 14",
          meta: "10:20",
          status: "已完成",
          tone: "green",
        },
        {
          title: "PUBLISH-20260811-04",
          detail: "Tier S / A · 发布 1,200 · sitemap 已更新",
          meta: "昨天",
          status: "已发布",
          tone: "blue",
        },
        {
          title: "SYNC-20260810-03",
          detail: "上游限流后人工取消 · 暂存数据已保留",
          meta: "8 月 10 日",
          status: "已取消",
          tone: "neutral",
        },
      ]}
      notice="同一时间只允许一个 running 或 paused 任务；取消不会清除已暂存的数据。"
    />
  );
}

/** 功能工具目录、批量导入任务与 Webhook 投递 · 纯样式 fixture。 */
export function WikiEmbedAdminToolOperations() {
  return (
    <AdminTableFixture
      fixture="admin-tool-operations"
      icon={Boxes}
      title="功能广场"
      description="工具内容、JSON / ZIP 导入任务与出站 Webhook 共用运营工作区。"
      action="新建工具"
      tabs={["工具目录", "批量导入", "任务记录", "Webhook"]}
      activeTab="工具目录"
      filters={["draft / pending / published", "SEO 审核", "工具分类"]}
      rows={[
        {
          title: "Research Figure Cleaner",
          detail: "slug: figure-cleaner · 图像处理 · source_topic_id 8421",
          meta: "今天 09:48",
          status: "已发布",
          tone: "green",
        },
        {
          title: "Reference Style Checker",
          detail: "slug: citation-checker · 写作工具 · SEO 待审",
          meta: "昨天",
          status: "待审核",
          tone: "amber",
        },
        {
          title: "Legacy PDF Converter",
          detail: "slug: pdf-converter-v1 · 已停止推荐",
          meta: "8 月 8 日",
          status: "已归档",
          tone: "neutral",
        },
      ]}
      detailTitle="最近导入任务"
      detailLines={[
        "JOB-842 · 500 项 · succeeded",
        "JOB-839 · 2,400 项 · partial",
        "Webhook 最近测试 · 200 OK",
        "失败投递需人工重测",
      ]}
    />
  );
}

/** 社区 Skill 审核队列、举报与强制下架 · 纯样式 fixture。 */
export function WikiEmbedAdminSkillModeration() {
  return (
    <AdminTableFixture
      fixture="admin-skill-moderation"
      icon={Sparkles}
      title="Skill 审核"
      description="用户上传内容默认不可信；人工审核只是一层内容降噪。"
      tabs={["待审核", "已通过", "已拒绝", "已标记"]}
      activeTab="待审核"
      filters={["全部风险", "最近提交"]}
      rows={[
        {
          title: "Systematic Review Assistant",
          detail: "作者 #28461 · SKILL.md 已解析 · 2 个外部链接",
          meta: "28 分钟前",
          status: "待审核",
          tone: "amber",
        },
        {
          title: "LaTeX Table Formatter",
          detail: "作者 #28177 · 更新公开版本后重新提交",
          meta: "2 小时前",
          status: "待审核",
          tone: "amber",
        },
        {
          title: "Dataset Downloader",
          detail: "3 条举报 · 涉及权限诱导 · 等待人工判断",
          meta: "昨天",
          status: "已标记",
          tone: "red",
        },
      ]}
      notice="举报不会自动改变审核状态；强制下架需要输入 TAKEDOWN，且不能替代运行时隔离。"
    />
  );
}

/** 站内消息草稿、定向范围与不可逆发送 · 纯样式 fixture。 */
export function WikiEmbedAdminMessaging() {
  return (
    <AdminTableFixture
      fixture="admin-messaging"
      icon={Bell}
      title="站内消息"
      description="先保存草稿，再向全体、指定用户或套餐人群同步发送。"
      action="新建草稿"
      filters={[
        "system / promotion / transaction",
        "草稿 / 已发送",
        "发送范围",
      ]}
      rows={[
        {
          title: "本周服务更新说明",
          detail: "system · all · 全体发送前需输入 SEND",
          meta: "今天 09:20",
          status: "草稿",
          tone: "amber",
        },
        {
          title: "Pro 会员功能提醒",
          detail: "promotion · batch · 286 个明确用户 ID",
          meta: "昨天",
          status: "已发送",
          tone: "green",
        },
        {
          title: "退款到账通知",
          detail: "transaction · single · 用户 #27602",
          meta: "8 月 10 日",
          status: "已发送",
          tone: "green",
        },
      ]}
      notice="发送是同步、不可逆的状态推进；by_plan 仍有遗留字段风险，可靠定向应使用明确用户 ID。"
    />
  );
}

/** 邀请活动与推广弹窗的两个独立配置面 · 纯样式 fixture。 */
export function WikiEmbedAdminCampaignsPromo() {
  return (
    <AdminSettingsFixture
      fixture="admin-campaigns-promo"
      icon={Sparkles}
      title="活动管理"
      description="邀请奖励规则与推广弹窗共享页面，但权限、结算和展示彼此独立。"
      tabs={["邀请有礼", "限时领取会员"]}
      activeTab="邀请有礼"
      notice="本示例是具备 config.manage 的邀请页；operations 没有该权限，只显示“限时领取会员”Tab。关闭邀请会停止新绑定，但既有奖励承诺继续履约。"
      sections={[
        {
          title: "活动与权限",
          description: "邀请配置和 Tab 均要求 config.manage。",
          fields: [
            { label: "邀请活动总开关", value: "启用", kind: "enabled" },
            { label: "config.manage", value: "允许", kind: "enabled" },
          ],
        },
        {
          title: "注册关联礼",
          description: "新用户在绑定时窗内确认邀请人后，双方分别入账。",
          fields: [
            { label: "邀请人注册礼", value: "100 经费" },
            { label: "被邀请人注册礼", value: "50 经费" },
            { label: "每日奖励上限", value: "10 人 / 邀请人" },
            { label: "允许绑定时窗", value: "30 天" },
          ],
        },
        {
          title: "首次付费返利",
          description: "首单时窗独立于绑定时窗，从被邀请人注册时起计算。",
          fields: [
            { label: "首单返利比例", value: "5%" },
            { label: "首单有效时窗", value: "30 天" },
            {
              label: "邀请码帮助链接",
              value: "https://www.scholay.com/help/invite",
            },
          ],
        },
      ]}
    />
  );
}
