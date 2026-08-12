import { Code2, CreditCard, KeyRound, Settings } from "lucide-react";
import {
  AdminSettingsFixture,
  AdminTableFixture,
} from "./WikiEmbedAdminShared";

/** 站点基础配置、邮件、短信与代码片段入口 · 纯样式 fixture。 */
export function WikiEmbedAdminSystemConfig() {
  return (
    <AdminSettingsFixture
      fixture="admin-system-config"
      icon={Settings}
      title="系统设置"
      description="站点基础认证、通知通道与全局注入脚本按标签页维护。"
      tabs={["基础", "邮件", "短信", "代码片段库"]}
      activeTab="基础"
      notice="保存通常是整行配置写入；维护状态仅在后台全局提醒中展示，不是本页可编辑项。"
      sections={[
        {
          title: "平台基础配置",
          description: "邮箱验证与 Cloudflare Turnstile 人机校验。",
          fields: [
            { label: "邮箱验证", value: "启用", kind: "enabled" },
            { label: "Turnstile", value: "启用", kind: "enabled" },
            { label: "Site Key", value: "0x4AAAA••••" },
            { label: "Secret Key", value: "", kind: "secret" },
          ],
        },
        {
          title: "统计接入",
          description: "Google 分析 ID 按前缀识别 GA4 或 Google Tag Manager。",
          fields: [
            {
              label: "Google 分析 ID（GA4 / GTM）",
              value: "G-ABCD1234",
            },
          ],
        },
        {
          title: "邮件通道",
          description: "SMTP 配置单独保存并支持测试。",
          fields: [
            { label: "SMTP 主机", value: "smtp.example.com" },
            { label: "密码", value: "", kind: "secret" },
            { label: "测试状态", value: "通过", kind: "enabled" },
          ],
        },
        {
          title: "短信通道",
          description: "短信网关凭据与模板参数。",
          fields: [
            { label: "网关状态", value: "启用", kind: "enabled" },
            { label: "Access Secret", value: "", kind: "secret" },
          ],
        },
      ]}
    />
  );
}

/** 可注入页面的 HTML / JavaScript 片段库 · 纯样式 fixture。 */
export function WikiEmbedAdminCodeSnippets() {
  return (
    <AdminTableFixture
      fixture="admin-code-snippets"
      icon={Code2}
      title="代码片段库"
      description="按类别、注入位置、优先级与路径范围管理全站脚本。"
      action="新建片段"
      filters={["SEO / analytics / ad / social", "head / body", "启用状态"]}
      rows={[
        {
          title: "Umami Analytics",
          detail: "analytics · head · 全站 · 空闲加载关闭 · priority 10",
          meta: "今天 09:20",
          status: "已启用",
          tone: "green",
        },
        {
          title: "Search Console Verification",
          detail: "SEO · head · 全站 · priority 20",
          meta: "8 月 8 日",
          status: "已启用",
          tone: "green",
        },
        {
          title: "Legacy Campaign Pixel",
          detail: "ad · body-end · /membership · 已保留回滚文本",
          meta: "7 月 16 日",
          status: "已停用",
          tone: "neutral",
        },
      ]}
      notice="片段允许任意 HTML / JavaScript，属于全站高风险发布，应像代码变更一样评审。"
    />
  );
}

/** OAuth / SSO Provider 与微信小程序登录配置 · 纯样式 fixture。 */
export function WikiEmbedAdminOAuthConfig() {
  return (
    <AdminSettingsFixture
      fixture="admin-oauth-config"
      icon={KeyRound}
      title="OAuth / SSO"
      description="第三方登录 Provider 与微信小程序按各自真实字段独立配置。"
      tabs={[
        "GitHub",
        "Google",
        "Apple",
        "ORCID",
        "Microsoft",
        "Discourse",
        "微信",
        "微信小程序",
      ]}
      activeTab="GitHub"
      notice="启用 Provider 只决定是否展示入口；账号绑定、冲突与合并仍由后端认证流程处理。"
      sections={[
        {
          title: "GitHub 登录",
          description: "密钥默认掩码，保存时保留未修改的真值。",
          fields: [
            { label: "登录入口", value: "启用", kind: "enabled" },
            { label: "Client ID", value: "Ov23li••••" },
            { label: "Client Secret", value: "", kind: "secret" },
            {
              label: "Callback URL",
              value: "https://scholay.com/github/callback",
            },
          ],
        },
        {
          title: "公开配置语义",
          description: "客户端只能读取安全的启用状态等字段。",
          fields: [
            { label: "公开启用状态", value: "是", kind: "enabled" },
            { label: "公开密钥", value: "否", kind: "disabled" },
          ],
        },
      ]}
    />
  );
}

/** 支付宝与微信支付商户、能力、测试与激活 · 纯样式 fixture。 */
export function WikiEmbedAdminPaymentMerchants() {
  return (
    <AdminTableFixture
      fixture="admin-payment-merchants"
      icon={CreditCard}
      title="支付配置"
      description="支付宝与微信支付支持多商户配置，但每个渠道只使用有效且激活的配置。"
      action="新增商户"
      tabs={["支付宝", "微信支付"]}
      activeTab="支付宝"
      filters={["生产 / 沙箱", "激活状态", "测试结果"]}
      rows={[
        {
          title: "2021002188•••• · 生产商户",
          detail: "Gateway 官方生产地址 · Notify / Return 已配置 · 密钥已掩码",
          meta: "测试通过",
          status: "已激活",
          tone: "green",
        },
        {
          title: "2021002199•••• · 沙箱商户",
          detail: "沙箱网关 · 仅用于联调 · 密钥已掩码",
          meta: "测试通过",
          status: "未激活",
          tone: "amber",
        },
        {
          title: "2021002100•••• · 旧生产商户",
          detail: "关键凭据已变更 · 旧测试结果失效",
          meta: "待重测",
          status: "不可激活",
          tone: "red",
        },
      ]}
      notice="修改关键凭据会使测试结果失效并取消激活；测试只验证配置与连通性，不创建真实交易。"
    />
  );
}

/** 微信支付商户的能力与加密材料 · 纯样式 fixture。 */
export function WikiEmbedAdminWechatPay() {
  return (
    <AdminSettingsFixture
      fixture="admin-wechat-pay"
      icon={CreditCard}
      title="微信支付商户"
      description="商户号、AppID、APIv3 密钥、证书和支付能力必须成套配置。"
      sections={[
        {
          title: "商户身份",
          description: "基本身份与回调地址。",
          fields: [
            { label: "商户号", value: "190000••••" },
            { label: "AppID", value: "wx8f2a••••" },
            {
              label: "通知地址",
              value: "https://scholay.com/api/v1/payment/wechat/notify",
            },
          ],
        },
        {
          title: "加密材料",
          description: "APIv3、商户私钥和平台验证材料配套使用。",
          fields: [
            { label: "APIv3 密钥", value: "", kind: "secret" },
            { label: "商户私钥", value: "", kind: "secret" },
            { label: "证书序列号", value: "7A2C••••" },
          ],
        },
        {
          title: "支付能力",
          description: "Native、H5、JSAPI 至少开启一种。",
          fields: [
            { label: "Native", value: "开启", kind: "enabled" },
            { label: "H5", value: "开启", kind: "enabled" },
            { label: "JSAPI", value: "关闭", kind: "disabled" },
          ],
        },
        {
          title: "测试与激活",
          description: "有效测试结果是激活的前置条件。",
          fields: [
            { label: "测试状态", value: "通过", kind: "enabled" },
            { label: "激活状态", value: "已激活", kind: "enabled" },
          ],
        },
      ]}
    />
  );
}
