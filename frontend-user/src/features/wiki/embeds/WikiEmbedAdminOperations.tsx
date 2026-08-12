import {
  BarChart3,
  Inbox,
  Mail,
  MessageSquare,
  ScanEye,
  UserPlus,
} from "lucide-react";
import {
  AdminAnalyticsFixture,
  AdminSettingsFixture,
  AdminTableFixture,
} from "./WikiEmbedAdminShared";

/** 反馈检索、详情、附件与回复状态 · 纯样式 fixture。 */
export function WikiEmbedAdminFeedback() {
  return (
    <AdminTableFixture
      fixture="admin-feedback"
      icon={MessageSquare}
      title="用户反馈"
      description="检索反馈、查看附件与提交 IP，并通过邮件和站内通知回复。"
      filters={["pending / processed / replied / closed", "问题类型", "有附件"]}
      rows={[
        {
          title: "PDF 解析后公式显示错位",
          detail: "问题报告 · 用户 #28461 · 2 个截图附件 · IP 已记录",
          meta: "20 分钟前",
          status: "待处理",
          tone: "amber",
        },
        {
          title: "希望支持新的引用格式",
          detail: "功能建议 · 已发送邮件回复与站内通知",
          meta: "昨天",
          status: "已回复",
          tone: "green",
        },
        {
          title: "移动端搜索筛选问题",
          detail: "问题报告 · 匿名提交 · 无附件",
          meta: "8 月 9 日",
          status: "已关闭",
          tone: "neutral",
        },
      ]}
      detailTitle="反馈详情"
      detailLines={[
        "原始描述与环境信息",
        "附件在受控预览中打开",
        "状态可推进，不提供指派入口",
        "回复成功后自动标记已回复",
      ]}
      notice="当前没有管理员指派路由；数据库中的 assignee 字段不等于完整工单队列。"
    />
  );
}

/** IMAP 收件、SMTP 回复、客服配置与发送日志 · 纯样式 fixture。 */
export function WikiEmbedAdminMailSupport() {
  return (
    <AdminTableFixture
      fixture="admin-mail-support"
      icon={Inbox}
      title="邮件中心"
      description="客服邮箱收件与回复、公开联系方式和全站发送日志分面管理。"
      action="写邮件"
      tabs={["收件箱", "客服配置", "发送记录"]}
      activeTab="收件箱"
      metrics={[
        { label: "未读邮件", value: "18", note: "当前支持邮箱", tone: "amber" },
        { label: "今日回复", value: "42", note: "SMTP 已发送", tone: "green" },
        {
          label: "发送成功",
          value: "98.7%",
          note: "邮件 + 短信",
          tone: "blue",
        },
        { label: "发送失败", value: "6", note: "需查看错误", tone: "red" },
      ]}
      filters={["未读 / 已读", "发件人 / 主题", "最近 30 天"]}
      rows={[
        {
          title: "Re: 会员权益到账问题",
          detail: "lin.xz@example.edu · 文本正文 · 1 个附件",
          meta: "今天 10:06",
          status: "未读",
          tone: "amber",
        },
        {
          title: "合作咨询：高校机构账号",
          detail: "research-office@example.edu · HTML 沙箱预览",
          meta: "今天 09:42",
          status: "已读",
          tone: "neutral",
        },
        {
          title: "验证码邮件未收到",
          detail: "zhou.yc@example.edu · 已通过 SMTP 回复",
          meta: "昨天",
          status: "已回复",
          tone: "green",
        },
      ]}
      notice="HTML 来信在 sandbox 预览；邮件中心不是系统通知的统一重试队列。"
    />
  );
}

/** AI 会话与智能审稿记录的只读排障面 · 纯样式 fixture。 */
export function WikiEmbedAdminSessionMonitoring() {
  return (
    <AdminTableFixture
      fixture="admin-session-monitoring"
      icon={ScanEye}
      title="用户会话监控"
      description="按功能查看 AI 会话与审稿记录，保留用户端一致的对话渲染。"
      tabs={["智能搜索", "智能助手", "智能写作", "智能审稿"]}
      activeTab="智能助手"
      filters={["用户 ID", "会话状态", "最近 7 天"]}
      rows={[
        {
          title: "sess_claw_8f2a · 用户 #28461",
          detail: "12 条消息 · 3 次工具调用 · 2 个附件",
          meta: "今天 10:12",
          status: "已结束",
          tone: "green",
        },
        {
          title: "sess_claw_6c91 · 用户 #28177",
          detail: "8 条消息 · 1 个结果产物 · 无异常",
          meta: "今天 09:08",
          status: "已结束",
          tone: "green",
        },
        {
          title: "sess_claw_3a74 · 用户 #27602",
          detail: "连接中断后恢复 · 最终结果已生成",
          meta: "昨天",
          status: "已恢复",
          tone: "blue",
        },
      ]}
      detailTitle="只读会话详情"
      detailLines={[
        "用户消息与模型回复",
        "工具调用与返回摘要",
        "附件仅用于故障定位",
        "不提供继续对话或改写入口",
      ]}
      notice="记录可能包含未发表研究与模型输出，应按敏感业务数据处理。"
    />
  );
}

/** 邀请打开、注册、奖励和历史规则快照 · 纯样式 fixture。 */
export function WikiEmbedAdminInviteAnalytics() {
  return (
    <AdminAnalyticsFixture
      fixture="admin-invite-analytics"
      icon={UserPlus}
      title="邀请监控"
      description="从邀请链接打开到注册与奖励，按关系快照解释历史转化。"
      metrics={[
        { label: "邀请人数", value: "4,286", note: "已生成邀请码" },
        { label: "链接打开", value: "38,420", note: "累计" },
        {
          label: "成功注册",
          value: "6,842",
          note: "转化 17.8%",
          tone: "green",
        },
        {
          label: "累计奖励",
          value: "¥18,640",
          note: "含首单返利",
          tone: "amber",
        },
      ]}
      tabs={["邀请关系", "注册明细", "奖励与冲销"]}
      activeTab="邀请关系"
      bars={[
        { label: "站内分享", value: "3,420", width: "full", tone: "blue" },
        {
          label: "链接复制",
          value: "2,180",
          width: "two-thirds",
          tone: "green",
        },
        { label: "活动页", value: "842", width: "half", tone: "amber" },
        { label: "其他来源", value: "400", width: "third", tone: "neutral" },
      ]}
      activity={[
        {
          title: "INV-28461 → #28942",
          detail: "",
          meta: "注册奖励已发",
          status: "已注册",
          tone: "green",
        },
        {
          title: "INV-28177 → #28806",
          detail: "",
          meta: "首单退款后冲销",
          status: "已冲销",
          tone: "red",
        },
      ]}
      notice="历史关系使用创建时的规则快照，不能用当前活动配置反推过去奖励。"
    />
  );
}

/** 发送通道成功、失败与错误记录 · 纯样式 fixture。 */
export function WikiEmbedAdminDeliveryLogs() {
  return (
    <AdminTableFixture
      fixture="admin-delivery-logs"
      icon={Mail}
      title="发送记录"
      description="查看邮件与短信的收件地址、主题、类别、结果和失败原因。"
      tabs={["邮件", "短信"]}
      activeTab="邮件"
      metrics={[
        { label: "累计发送", value: "84,260", note: "邮件通道" },
        { label: "成功", value: "83,178", note: "98.7%", tone: "green" },
        { label: "失败", value: "1,082", note: "需按错误分类", tone: "red" },
      ]}
      filters={["成功 / 失败", "验证码 / 反馈 / 会员", "收件人 / 主题"]}
      rows={[
        {
          title: "会员权益到账通知",
          detail: "lin.xz@example.edu · billing · 系统发信",
          meta: "今天 10:02",
          status: "成功",
          tone: "green",
        },
        {
          title: "反馈回复",
          detail: "zhou.yc@example.edu · feedback · 客服发信",
          meta: "今天 09:45",
          status: "成功",
          tone: "green",
        },
        {
          title: "邮箱验证码",
          detail: "invalid@example.edu · verification · mailbox rejected",
          meta: "昨天",
          status: "失败",
          tone: "red",
        },
      ]}
    />
  );
}

/** 客服公开联系方式、IMAP、SMTP 与通知通道 · 纯样式 fixture。 */
export function WikiEmbedAdminSupportConfig() {
  return (
    <AdminSettingsFixture
      fixture="admin-support-config"
      icon={BarChart3}
      title="客服配置"
      description="公开联系方式、客服收发信与飞书通知分别测试和保存。"
      sections={[
        {
          title: "联系方式展示",
          description: "用户端联系页读取的公开信息。",
          fields: [
            { label: "客服邮箱", value: "support@scholay.com" },
            { label: "工作时间", value: "工作日 09:00–18:00" },
          ],
        },
        {
          title: "IMAP 收件",
          description: "邮件中心拉取并轮询配置邮箱。",
          fields: [
            { label: "服务器", value: "imap.example.com" },
            { label: "密码", value: "", kind: "secret" },
            { label: "连接状态", value: "可用", kind: "enabled" },
          ],
        },
        {
          title: "SMTP 发信",
          description: "回复与主动写信使用已保存配置。",
          fields: [
            { label: "服务器", value: "smtp.example.com" },
            { label: "发件地址", value: "support@scholay.com" },
            { label: "测试结果", value: "通过", kind: "enabled" },
          ],
        },
        {
          title: "飞书通知",
          description: "将新反馈等事件推送至协作群。",
          fields: [
            { label: "Webhook", value: "", kind: "secret" },
            { label: "通知开关", value: "启用", kind: "enabled" },
          ],
        },
      ]}
    />
  );
}
