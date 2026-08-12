import {
  Compass,
  KeyRound,
  Layers,
  Newspaper,
  Send,
  ServerCog,
} from "lucide-react";
import {
  AdminSettingsFixture,
  AdminTableFixture,
} from "./WikiEmbedAdminShared";

/** Provider、模型能力、价格与推送健康 · 纯样式 fixture。 */
export function WikiEmbedAdminModelCatalog() {
  return (
    <AdminTableFixture
      fixture="admin-model-catalog"
      icon={Layers}
      title="模型与账号"
      description="模型目录按 Provider 分组，保存后把配置推送至执行器。"
      action="新增端点"
      tabs={["模型目录", "三方账号"]}
      activeTab="模型目录"
      filters={["全部 Provider", "启用模型", "用户可选"]}
      metrics={[
        { label: "Provider", value: "4", note: "全部健康", tone: "green" },
        { label: "目录模型", value: "18", note: "启用 14" },
        { label: "用户可选", value: "8", note: "价格已配置", tone: "blue" },
        { label: "推送失败", value: "0", note: "执行器同步", tone: "green" },
      ]}
      rows={[
        {
          title: "DeepSeek 官方 · deepseek-chat",
          detail: "OpenAI compatible · 上下文 128k · 四类价格已配置",
          meta: "默认端点",
          status: "已启用",
          tone: "green",
        },
        {
          title: "Qwen · qwen-max",
          detail: "OpenAI compatible · 允许 Pro / Max · 用户可选",
          meta: "额外端点",
          status: "已启用",
          tone: "green",
        },
        {
          title: "Kimi · kimi-k2",
          detail: "上下文 128k · 执行器配置待同步",
          meta: "额外端点",
          status: "待推送",
          tone: "amber",
        },
      ]}
      notice="仍有关联模型时不能删除 Provider；价格全为零的模型不能同时启用且对用户可选。"
    />
  );
}

/** 第三方 AI / Minicod 账号、健康与敏感凭据揭示 · 纯样式 fixture。 */
export function WikiEmbedAdminThirdPartyAccounts() {
  return (
    <AdminTableFixture
      fixture="admin-third-party-accounts"
      icon={KeyRound}
      title="第三方账号"
      description="维护 AI model 与 Minicod 账号池、优先级和健康指标。"
      tabs={["AI model", "Minicod"]}
      activeTab="AI model"
      filters={["健康状态", "优先级", "最近测试"]}
      rows={[
        {
          title: "deepseek-prod-01",
          detail: "API key 已掩码 · 优先级 1 · 成功 12,840 / 失败 18",
          meta: "延迟 842 ms",
          status: "健康",
          tone: "green",
        },
        {
          title: "qwen-prod-02",
          detail: "API key 已掩码 · 优先级 2 · 成功 8,420 / 失败 6",
          meta: "延迟 1.2 s",
          status: "健康",
          tone: "green",
        },
        {
          title: "legacy-model-03",
          detail: "API key 已掩码 · 连续测试失败 · 已停止路由",
          meta: "延迟 —",
          status: "不可用",
          tone: "red",
        },
      ]}
      notice="敏感值只在显式请求时返回；关闭查看面板后立即恢复掩码，避免屏幕共享泄露。"
      detailTitle="账号选择规则"
      detailLines={[
        "优先级数值越小越优先",
        "同优先级再参考使用次数",
        "测试结果与调用链分层查看",
        "模型 Provider 与账号池不是同一配置层",
      ]}
    />
  );
}

/** 规范用途键到具体模型的封闭绑定集 · 纯样式 fixture。 */
export function WikiEmbedAdminModelBindings() {
  return (
    <AdminTableFixture
      fixture="admin-model-bindings"
      icon={ServerCog}
      title="能力绑定"
      description="固定用途键只能改绑目标模型；缺少专用绑定时回退 system.main。"
      filters={["全部用途", "正常 / 回退中"]}
      rows={[
        {
          title: "system.main · 系统主模型",
          detail: "默认系统能力与专用绑定缺失时的回退目标",
          meta: "deepseek-chat",
          status: "正常",
          tone: "green",
        },
        {
          title: "project.smart · 智能搜索",
          detail: "用户问答与检索总结",
          meta: "qwen-max",
          status: "正常",
          tone: "green",
        },
        {
          title: "project.prism · 智能写作",
          detail: "planner / revision 别名归一到此用途",
          meta: "deepseek-chat",
          status: "正常",
          tone: "green",
        },
        {
          title: "project.wechat_oa · 公众号回复",
          detail: "绑定模型已停用，当前使用 system.main",
          meta: "fallback",
          status: "回退中",
          tone: "red",
        },
      ]}
      notice="用途 key 不可编辑；保存后清理缓存并向执行器推送。"
    />
  );
}

/** 矩阵分析系统维度、描述、排序与启用状态 · 纯样式 fixture。 */
export function WikiEmbedAdminAnalysisDimensions() {
  return (
    <AdminTableFixture
      fixture="admin-analysis-dimensions"
      icon={Compass}
      title="分析维度"
      description="系统维度的 key 锁定，名称、提示描述、排序与启用状态可维护。"
      filters={["启用状态", "排序"]}
      rows={[
        {
          title: "研究问题 · research_question",
          detail: "识别论文要解决的核心问题与边界条件",
          meta: "排序 10",
          status: "已启用",
          tone: "green",
        },
        {
          title: "研究方法 · methodology",
          detail: "归纳实验设计、数据与评估方法",
          meta: "排序 20",
          status: "已启用",
          tone: "green",
        },
        {
          title: "伦理与风险 · ethics_risk",
          detail: "提示潜在伦理、偏差与使用限制",
          meta: "排序 90",
          status: "已停用",
          tone: "neutral",
        },
      ]}
      notice="维度描述会直接进入分析提示；修改或停用会改变后续模型行为。"
    />
  );
}

/** 微信公众号接入、加密模式与 AI 自动回复 · 纯样式 fixture。 */
export function WikiEmbedAdminWechatOfficial() {
  return (
    <AdminSettingsFixture
      fixture="admin-wechat-official"
      icon={Send}
      title="公众号"
      description="接入参数、消息加密与自动回复模型用途分层配置。"
      notice="接入信息需要与微信公众平台回调配置同步；公众号页面不直接选择模型。"
      sections={[
        {
          title: "公众号接入",
          description: "App Secret 与 AES Key 留空表示保留原值。",
          fields: [
            { label: "AppID", value: "wx8f2a••••" },
            { label: "AppSecret", value: "", kind: "secret" },
            { label: "Token", value: "", kind: "secret" },
            { label: "EncodingAESKey", value: "", kind: "secret" },
          ],
        },
        {
          title: "消息安全",
          description: "可选 plaintext、compatible 或 secure。",
          fields: [
            { label: "加密模式", value: "安全模式" },
            { label: "回调验证", value: "通过", kind: "enabled" },
          ],
        },
        {
          title: "AI 自动回复",
          description: "系统提示决定语气，模型来自 project.wechat_oa。",
          fields: [
            { label: "自动回复", value: "启用", kind: "enabled" },
            { label: "绑定用途", value: "project.wechat_oa" },
            { label: "当前模型", value: "qwen-max" },
          ],
        },
      ]}
    />
  );
}

/** 研究新闻 Webhook 展示开关、接收地址与 HMAC 验签 · 纯样式 fixture。 */
export function WikiEmbedAdminNewsWebhook() {
  return (
    <AdminSettingsFixture
      fixture="admin-news-webhook"
      icon={Newspaper}
      title="情报 Webhook"
      description="接收上游 created、updated 与 heat 事件，并执行验签与幂等去重。"
      notice="用户端展示开关不会停止入库；页面中的退避重试是上游投递契约，不是本地重放能力。"
      sections={[
        {
          title: "展示开关",
          description: "关闭后隐藏用户侧入口、列表与详情。",
          fields: [
            { label: "用户端展示", value: "启用", kind: "enabled" },
            { label: "Webhook 入库", value: "继续接收", kind: "enabled" },
          ],
        },
        {
          title: "接收地址",
          description: "由 SITE_URL 派生，只读后复制到上游。",
          fields: [
            {
              label: "Webhook URL",
              value: "https://scholay.com/api/v1/webhook/minicod-news",
            },
            { label: "SITE_URL", value: "已配置", kind: "enabled" },
          ],
        },
        {
          title: "HMAC 验签",
          description: "对原始请求体校验，两端密钥必须一致。",
          fields: [
            { label: "共享密钥", value: "", kind: "secret" },
            { label: "校验算法", value: "HMAC-SHA256" },
            { label: "Redis 锁", value: "24 小时" },
          ],
        },
        {
          title: "事件契约",
          description: "delivery 入库后 upsert；未知事件记录并返回 200。",
          fields: [
            { label: "内容事件", value: "created / updated" },
            { label: "热度事件", value: "heat" },
            { label: "本地重放", value: "无", kind: "disabled" },
          ],
        },
      ]}
    />
  );
}
