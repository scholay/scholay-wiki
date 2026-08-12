import {
  Bot,
  Boxes,
  Braces,
  CreditCard,
  KeyRound,
  Layers3,
  MessageSquareCode,
  PanelTop,
  RadioTower,
  Smartphone,
  WalletCards,
} from "lucide-react";
import {
  AdminDetailFrame,
  DetailBadge,
  DetailDialog,
  DetailFields,
  DetailMetricStrip,
  DetailNotice,
  DetailSection,
  DetailSteps,
  DetailTable,
  DetailTabs,
} from "./WikiEmbedAdminDetailPrimitives";

/** ProviderSection：一个端点及其模型、同步与计价状态。 */
export function WikiEmbedAdminProviderSections() {
  return (
    <AdminDetailFrame
      fixture="admin-provider-sections"
      icon={Boxes}
      title="模型提供方分区"
      description="每个 Provider 独立显示 Base URL、API 格式、推送状态、零价告警和所属模型。"
      eyebrow="模型目录"
      action="新增端点"
    >
      <DetailSection
        title="DeepSeek 官方"
        description="anthropic · https://api.deepseek.com/anthropic"
        action="同步官方参数"
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <DetailBadge tone="green">端点启用</DetailBadge>
          <DetailBadge tone="green">已推送 agent</DetailBadge>
          <DetailBadge>3 个模型</DetailBadge>
        </div>
        <DetailTable
          columns={["模型", "上下文 / 输出", "价格（元 / 1M）", "状态"]}
          rows={[
            {
              id: "model-v32",
              cells: [
                <span key="m">
                  <strong className="font-medium text-foreground">
                    DeepSeek V3.2
                  </strong>
                  <br />
                  deepseek-v3.2 · 均衡
                </span>,
                "128K / 8K",
                "输入 2 · 输出 3",
                <span key="s" className="flex flex-wrap gap-1">
                  <DetailBadge tone="green">启用</DetailBadge>
                  <DetailBadge tone="blue">用户可选</DetailBadge>
                </span>,
              ],
            },
            {
              id: "model-r1",
              cells: [
                <span key="m">
                  <strong className="font-medium text-foreground">
                    DeepSeek R1
                  </strong>
                  <br />
                  deepseek-r1 · 强推理
                </span>,
                "128K / 16K",
                "输入 4 · 输出 16",
                <span key="s" className="flex flex-wrap gap-1">
                  <DetailBadge tone="green">启用</DetailBadge>
                  <DetailBadge>Max</DetailBadge>
                </span>,
              ],
            },
            {
              id: "model-free",
              cells: [
                <span key="m">
                  <strong className="font-medium text-foreground">
                    实验模型
                  </strong>
                  <br />
                  deepseek-experimental
                </span>,
                "64K / 4K",
                "输入 0 · 输出 0",
                <DetailBadge key="s" tone="red">
                  零价告警
                </DetailBadge>,
              ],
            },
          ]}
        />
      </DetailSection>
      <DetailNotice tone="red">
        输入与输出单价同时为 0
        的启用模型不会消耗任何用户额度，正式开放前必须补齐真实价格。
      </DetailNotice>
    </AdminDetailFrame>
  );
}

/** ModelFormDialog：模型参数、成本与可见性。 */
export function WikiEmbedAdminModelEditor() {
  return (
    <AdminDetailFrame
      fixture="admin-model-editor"
      icon={Bot}
      title="模型编辑器"
      description="模型 ID 对应真实上游；显示名、上下文、四类单价和可用范围独立配置。"
      eyebrow="模型目录"
    >
      <DetailDialog
        title="编辑模型"
        description="价格用于成本核算；上下文预算满足输入 + 输出不超过窗口。"
        primary="保存"
      >
        <DetailFields
          columns={3}
          fields={[
            { label: "模型 ID（上游真实 id）", value: "deepseek-v3.2" },
            { label: "对外展示名", value: "DeepSeek V3.2" },
            { label: "一句话说明", value: "均衡的日常主力模型" },
            { label: "上下文窗口", value: "128000" },
            { label: "最大输入", value: "120000" },
            { label: "最大输出", value: "8000" },
            { label: "输入 元 / 1M", value: "2.0000" },
            { label: "输出 元 / 1M", value: "3.0000" },
            { label: "缓存读 元 / 1M", value: "0.2000" },
            { label: "缓存写 元 / 1M", value: "2.0000" },
            {
              label: "上游 Provider",
              value: "DeepSeek 官方（anthropic）",
              kind: "select",
            },
            { label: "速度档", value: "balanced · 均衡", kind: "select" },
            { label: "档位门槛", value: "Pro 及以上", kind: "select" },
            { label: "用户可选", value: "已启用", kind: "toggle" },
            { label: "启用", value: "已启用", kind: "toggle" },
            { label: "视觉能力", value: "已关闭", kind: "readonly" },
            { label: "旗舰模型", value: "已启用", kind: "toggle" },
            { label: "内部备注", value: "智能搜索默认模型" },
          ]}
        />
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** ProviderDialogs：额外上游端点编辑。 */
export function WikiEmbedAdminProviderEditor() {
  return (
    <AdminDetailFrame
      fixture="admin-provider-editor"
      icon={RadioTower}
      title="模型端点编辑器"
      description="API key 空值表示保留旧值；保存后由后台推送到 agent 服务。"
      eyebrow="模型目录"
    >
      <DetailDialog
        title="编辑端点"
        description="端点名称用于后台识别，不展示给普通用户。"
        primary="保存"
      >
        <DetailFields
          fields={[
            { label: "名称", value: "DeepSeek 官方" },
            { label: "Base URL", value: "https://api.deepseek.com/anthropic" },
            { label: "API Key", value: "secret", kind: "secret" },
            { label: "API 格式", value: "Anthropic Messages", kind: "select" },
            { label: "推理内容回放", value: "已启用", kind: "toggle" },
            { label: "端点状态", value: "已启用", kind: "toggle" },
            {
              label: "内部备注",
              value: "中国区主端点，失败后由绑定策略降级",
              kind: "textarea",
            },
          ]}
        />
        <DetailNotice tone="green">
          当前配置已推送至 agent；最后同步 2026-08-12 10:12。
        </DetailNotice>
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** ThirdPartyPage ThirdPartyDialog：MiniCod / AI 模型账号池编辑。 */
export function WikiEmbedAdminThirdPartyEditor() {
  return (
    <AdminDetailFrame
      fixture="admin-third-party-editor"
      icon={KeyRound}
      title="三方账号编辑器"
      description="账号池按优先级调度；类型决定动态字段，敏感值默认脱敏。"
      eyebrow="三方账号池"
    >
      <DetailDialog title="编辑账号" primary="保存">
        <DetailFields
          fields={[
            { label: "名称", value: "MiniCod 主账号" },
            { label: "类型", value: "MiniCod 学术接口", kind: "readonly" },
            { label: "优先级", value: "10" },
            { label: "启用", value: "已启用", kind: "toggle" },
            { label: "API Key", value: "secret", kind: "secret" },
            { label: "Base URL", value: "https://api.minicod.example/v1" },
          ]}
        />
        <DetailNotice>
          类型在编辑态不可更改，避免旧类型的动态字段误写入另一类账号配置。
        </DetailNotice>
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** DimensionsPage：分析维度名称、AI 指示与启用状态。 */
export function WikiEmbedAdminDimensionEditor() {
  return (
    <AdminDetailFrame
      fixture="admin-dimension-editor"
      icon={Layers3}
      title="分析维度编辑器"
      description="维度 key 不可修改；AI 分析指示会加入每次论文分析的 prompt。"
      eyebrow="分析维度"
    >
      <DetailDialog
        title="编辑维度"
        description="research_method · key 不可修改，避免破坏 paper_analysis 缓存。"
        primary="保存"
      >
        <DetailFields
          fields={[
            { label: "维度名称", value: "研究方法" },
            { label: "排序（数字越小越靠前）", value: "20" },
            {
              label: "AI 分析指示",
              value:
                "请提取论文采用的研究方法，如实验、调查、案例分析或混合方法，并用简洁中文说明。",
              kind: "textarea",
            },
            { label: "启用", value: "矩阵分析会包含本维度", kind: "toggle" },
          ]}
        />
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** SystemConfigPage：基础、邮件和短信三个配置面板。 */
export function WikiEmbedAdminSystemChannelForms() {
  return (
    <AdminDetailFrame
      fixture="admin-system-channel-forms"
      icon={PanelTop}
      title="系统通道配置"
      description="基础安全、邮件 SMTP 和短信网关是三个独立配置资源，分别保存和测试。"
      eyebrow="系统设置"
    >
      <DetailTabs
        tabs={["基础", "邮件 · 已启用", "短信 · 已启用", "代码片段库"]}
        active="基础"
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <DetailSection title="平台基础配置" description="注册验证与人机校验。">
          <DetailFields
            columns={1}
            fields={[
              { label: "注册时必须验证邮箱", value: "已启用", kind: "toggle" },
              {
                label: "Cloudflare Turnstile",
                value: "已启用",
                kind: "toggle",
              },
              { label: "Turnstile Site Key", value: "0x4AAAAA…" },
              {
                label: "Turnstile Secret Key",
                value: "secret",
                kind: "secret",
              },
              { label: "Google 分析 ID", value: "G-8ABC123XYZ" },
            ]}
          />
        </DetailSection>
        <DetailSection
          title="邮件 SMTP"
          description="注册验证码、找回密码和通知邮件。"
          action="发送测试"
        >
          <DetailFields
            columns={1}
            fields={[
              { label: "Host / Port", value: "smtp.exmail.qq.com · 587" },
              { label: "SMTP User", value: "noreply@scholay.com" },
              { label: "SMTP Password", value: "secret", kind: "secret" },
              { label: "From", value: "Scholay · noreply@scholay.com" },
              { label: "启用邮件通道", value: "已启用", kind: "toggle" },
              { label: "测试接收地址", value: "ops@example.edu" },
            ]}
          />
        </DetailSection>
        <DetailSection
          title="短信网关"
          description="手机号验证码登录与手机绑定。"
          action="发送测试"
        >
          <DetailFields
            columns={1}
            fields={[
              { label: "Access Key ID", value: "LTAI5tExample" },
              { label: "Access Secret", value: "secret", kind: "secret" },
              { label: "签名 / 模板", value: "Scholay · SMS_284601" },
              { label: "Endpoint", value: "dysmsapi.aliyuncs.com" },
              { label: "启用短信通道", value: "已启用", kind: "toggle" },
              { label: "测试接收手机号", value: "13800138000" },
            ]}
          />
        </DetailSection>
      </div>
    </AdminDetailFrame>
  );
}

/** CodeSnippetsPage + SimpleCrudPage：全站注入代码的编辑弹窗。 */
export function WikiEmbedAdminCodeSnippetEditor() {
  return (
    <AdminDetailFrame
      fixture="admin-code-snippet-editor"
      icon={Braces}
      title="代码片段编辑器"
      description="SEO、统计、广告和社交脚本可注入 head、body 开始或 body 结束。"
      eyebrow="系统设置"
    >
      <DetailNotice tone="red">
        启用的代码会原样注入所有访客页面，权限等同站点自身代码；只使用来源可信的内容。
      </DetailNotice>
      <DetailDialog title="编辑片段 · Umami Analytics" primary="保存">
        <DetailFields
          fields={[
            { label: "名称", value: "Umami Analytics" },
            { label: "Key（唯一）", value: "umami_analytics" },
            { label: "分类", value: "统计分析", kind: "select" },
            { label: "注入位置", value: "head 头部", kind: "select" },
            { label: "优先级", value: "10" },
            { label: "首屏后空闲加载", value: "已关闭", kind: "readonly" },
            { label: "描述", value: "自托管站点访问统计" },
            {
              label: "代码内容",
              value:
                '<script defer src="https://analytics.scholay.com/script.js" data-website-id="…"></script>',
              kind: "textarea",
            },
            { label: "启用", value: "保存后全站生效", kind: "toggle" },
          ]}
        />
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** WechatMiniProgramPanel：微信小程序 OAuth 凭据。 */
export function WikiEmbedAdminOAuthMiniProgram() {
  return (
    <AdminDetailFrame
      fixture="admin-oauth-miniprogram"
      icon={Smartphone}
      title="微信小程序登录配置"
      description="AppID 与 AppSecret 用于小程序 code 换取登录会话；与微信公众号 OAuth 分开。"
      eyebrow="OAuth / SSO"
      action="保存配置"
    >
      <DetailSection
        title="微信小程序"
        description="AppSecret 留空表示保留旧值。"
      >
        <DetailFields
          fields={[
            { label: "AppID", value: "wx4f8c2a19d3e6b701" },
            { label: "AppSecret", value: "secret", kind: "secret" },
            { label: "登录状态", value: "已启用", kind: "toggle" },
            { label: "最近更新", value: "2026-08-08 14:20", kind: "readonly" },
          ]}
        />
      </DetailSection>
      <DetailNotice>
        小程序登录不使用网页授权回调地址；后端通过 jscode2session 完成身份交换。
      </DetailNotice>
    </AdminDetailFrame>
  );
}

/** PaymentConfigPage：支付宝商户配置弹窗。 */
export function WikiEmbedAdminAlipayEditor() {
  return (
    <AdminDetailFrame
      fixture="admin-alipay-editor"
      icon={WalletCards}
      title="支付宝配置编辑器"
      description="商户应用、网关、回调和密钥作为一条配置记录维护。"
      eyebrow="支付配置"
    >
      <DetailDialog title="编辑支付宝配置" primary="保存">
        <DetailFields
          fields={[
            { label: "配置名称", value: "支付宝正式商户" },
            { label: "App ID", value: "2021004186XXXXXX" },
            {
              label: "Gateway URL",
              value: "https://openapi.alipay.com/gateway.do",
            },
            {
              label: "支付回调 Notify URL",
              value: "https://api.scholay.com/payment/alipay/notify",
            },
            {
              label: "同步返回 Return URL",
              value: "https://scholay.com/payment/result",
            },
            { label: "商户私钥", value: "secret", kind: "secret" },
            { label: "支付宝公钥", value: "secret", kind: "secret" },
            { label: "状态", value: "已启用", kind: "toggle" },
          ]}
        />
        <DetailNotice>
          “启用”只允许测试；只有通过验证并激活的配置才会出现在用户支付入口。
        </DetailNotice>
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** WechatPayConfigDialog：微信支付证书、公钥模式和支付场景。 */
export function WikiEmbedAdminWechatPayEditor() {
  return (
    <AdminDetailFrame
      fixture="admin-wechatpay-editor"
      icon={MessageSquareCode}
      title="微信支付配置编辑器"
      description="证书、APIv3 密钥、验签方式、回调与支付场景按单条商户配置保存。"
      eyebrow="支付配置"
    >
      <DetailDialog
        title="编辑微信支付配置"
        description="未填写的新密钥会保留已配置值。"
        primary="保存"
      >
        <DetailTabs
          tabs={["基础", "密钥", "验签模式", "回调", "支付方式", "状态"]}
          active="基础"
        />
        <DetailFields
          columns={3}
          fields={[
            { label: "商户号 MchID", value: "1900008XXX" },
            { label: "AppID", value: "wx4f8c2a19d3e6b701" },
            { label: "商户证书序列号", value: "5B1F2C8D…" },
            { label: "APIv3 密钥", value: "secret", kind: "secret" },
            { label: "商户 API 私钥", value: "secret", kind: "secret" },
            { label: "商户 API 证书（可选）", value: "secret", kind: "secret" },
            { label: "微信支付公钥 ID", value: "PUB_KEY_ID_011…" },
            { label: "微信支付公钥", value: "secret", kind: "secret" },
            {
              label: "支付回调地址",
              value: "https://api.scholay.com/payment/wechat/notify",
            },
            { label: "退款回调地址", value: "自动推导", kind: "readonly" },
            { label: "支付方式", value: "Native · JSAPI" },
            { label: "配置状态", value: "已启用", kind: "toggle" },
          ]}
        />
      </DetailDialog>
    </AdminDetailFrame>
  );
}

/** PaymentConfigPage：测试后激活的最终确认面。 */
export function WikiEmbedAdminPaymentActivationConfirm() {
  return (
    <AdminDetailFrame
      fixture="admin-payment-activation-confirm"
      icon={CreditCard}
      title="支付配置激活确认"
      description="测试成功后仍需显式激活；同一支付渠道只保留一个生效配置。"
      eyebrow="支付配置"
    >
      <DetailDialog
        title="激活“微信支付正式商户”？"
        description="激活后用户端会立即显示微信支付入口。"
        primary="确认激活"
        destructive
      >
        <DetailMetricStrip
          metrics={[
            { label: "渠道", value: "微信支付", note: "Native · JSAPI" },
            { label: "商户号", value: "1900008XXX", note: "已脱敏" },
            {
              label: "最近验证",
              value: "成功",
              note: "今天 10:06",
              tone: "green",
            },
            {
              label: "当前生效",
              value: "旧配置",
              note: "将自动停用",
              tone: "amber",
            },
          ]}
        />
        <DetailSteps
          items={[
            {
              label: "验证凭据",
              detail: "APIv3 密钥、商户私钥与微信支付公钥验证成功。",
              status: "通过",
              tone: "green",
            },
            {
              label: "切换生效项",
              detail: "原“微信支付备用商户”将自动取消激活。",
              status: "将执行",
              tone: "amber",
            },
            {
              label: "开放用户入口",
              detail: "充值与订阅结算将出现微信支付选项。",
              status: "即时",
              tone: "red",
            },
          ]}
        />
        <DetailFields
          fields={[
            {
              label: "确认对象",
              value: "微信支付正式商户 · 1900008XXX",
              kind: "readonly",
            },
            {
              label: "验证结果",
              value: "签名与下单参数均通过",
              kind: "readonly",
            },
          ]}
        />
      </DetailDialog>
    </AdminDetailFrame>
  );
}
