import type { ReactNode } from "react";
import {
  Copy,
  KeyRound,
  Newspaper,
  Send,
  ServerCog,
  TriangleAlert,
} from "lucide-react";
import {
  AdminMockBadge,
  AdminMockButton,
  AdminMockPage,
  AdminMockTabs,
} from "./WikiEmbedAdminShared";

/** Provider、模型能力、价格与推送健康 · 纯样式 fixture。 */
export function WikiEmbedAdminModelCatalog() {
  return (
    <AdminMockPage
      fixture="admin-model-catalog"
      title="模型与账号"
      description="AI 上游接入 —— 模型目录（端点 / 模型 / 能力绑定）与三方账号（API key 池）"
      tabs={
        <AdminMockTabs items={["模型目录", "三方账号"]} active="模型目录" />
      }
    >
      <p className="mb-6 text-14 leading-paragraph text-muted-foreground">
        平台上游：DeepSeek 官方（默认端点）+ 千问 / Kimi /
        智谱（额外端点）。各厂商模型参数、四类单价可编辑；改动后自动推送 agent。
      </p>
      <div className="space-y-6">
        <ProviderFixture
          title="DeepSeek 官方"
          endpoint="https://api.deepseek.com/v1"
          format="openai"
          defaultProvider
          models={[
            [
              "DeepSeek Chat",
              "deepseek-chat",
              "128k",
              "2 / 8",
              "均衡",
              "Pro+",
              "启用",
            ],
            [
              "DeepSeek Reasoner",
              "deepseek-reasoner",
              "128k",
              "4 / 16",
              "强推理",
              "Max+",
              "启用",
            ],
          ]}
        />
        <ProviderFixture
          title="千问"
          endpoint="https://dashscope.aliyuncs.com/compatible-mode/v1"
          format="openai"
          models={[
            [
              "Qwen Max",
              "qwen-max",
              "128k",
              "2.4 / 9.6",
              "均衡",
              "Pro+",
              "启用",
            ],
            [
              "Qwen Plus",
              "qwen-plus",
              "128k",
              "0.8 / 2",
              "快",
              "Free+",
              "启用",
            ],
          ]}
        />
        <section className="rounded-8 border border-border bg-background">
          <div className="border-b border-border-hairline p-4">
            <h3 className="text-24 font-medium text-foreground">能力绑定</h3>
            <p className="mt-1 text-14 text-muted-foreground">
              固定能力各自绑定一个目录模型；红色标记代表绑定缺失或正在走回退链。
            </p>
          </div>
          {[
            [
              "系统主模型",
              "默认系统能力与专用绑定缺失时的回退目标",
              "deepseek-chat",
              false,
            ],
            ["智能搜论文", "用户问答与检索总结", "qwen-max", false],
            [
              "智能写作",
              "planner / revision 别名归一到此用途",
              "deepseek-chat",
              false,
            ],
            ["公众号回复", "绑定模型已停用", "回退 → deepseek-chat", true],
          ].map(([label, hint, model, fallback], index) => (
            <div
              key={label as string}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${index < 3 ? "border-b border-border-hairline" : ""}`}
            >
              <div className="min-w-0">
                <p className="text-16 font-medium text-foreground">
                  {label as string}
                  {fallback ? (
                    <span className="ml-2 text-12 text-brand-red">回退中</span>
                  ) : null}
                </p>
                <p className="mt-1 truncate text-12 text-faint">
                  {hint as string}
                </p>
              </div>
              <span className="rounded-8 border border-border bg-background px-3 py-2 font-mono text-14 text-foreground">
                {model as string}
              </span>
            </div>
          ))}
        </section>
      </div>
      <div className="mt-4 rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-3 py-2 text-14 leading-paragraph text-muted-foreground">
        仍有关联模型时不能删除
        Provider；价格全为零的模型不能同时启用且对用户可选。
      </div>
    </AdminMockPage>
  );
}

function ProviderFixture({
  title,
  endpoint,
  format,
  models,
  defaultProvider = false,
}: {
  title: string;
  endpoint: string;
  format: string;
  models: readonly (readonly string[])[];
  defaultProvider?: boolean;
}) {
  return (
    <section className="rounded-8 border border-border bg-background">
      <header className="flex items-start justify-between gap-3 border-b border-border-hairline p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-24 font-medium text-foreground">{title}</h3>
            {defaultProvider ? (
              <AdminMockBadge tone="green">默认端点</AdminMockBadge>
            ) : null}
            <AdminMockBadge>{format}</AdminMockBadge>
          </div>
          <p className="mt-1 truncate font-mono text-12 text-faint">
            {endpoint}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {defaultProvider ? (
            <AdminMockButton tone="outline">应用官方预设</AdminMockButton>
          ) : null}
          <AdminMockButton tone="outline">＋ 添加模型</AdminMockButton>
          <AdminMockButton tone="ghost">✎</AdminMockButton>
        </div>
      </header>
      <div className="overflow-x-auto">
        <div className="grid min-w-3xl grid-cols-[minmax(200px,1fr)_80px_140px_80px_110px_70px_70px] border-b border-border bg-surface-1 text-12 font-medium text-faint">
          {[
            "模型",
            "上下文",
            "价格 入/出（元/1M）",
            "速度",
            "用户可选",
            "状态",
            "",
          ].map((label) => (
            <span key={label} className="flex h-9 items-center px-3">
              {label}
            </span>
          ))}
        </div>
        {models.map(
          ([name, id, context, price, speed, tier, status], index) => (
            <div
              key={id}
              className={`grid min-w-3xl grid-cols-[minmax(200px,1fr)_80px_140px_80px_110px_70px_70px] ${index < models.length - 1 ? "border-b border-border-hairline" : ""}`}
            >
              <div className="flex h-12 flex-col justify-center px-3">
                <p className="text-16 font-medium text-foreground">{name}</p>
                <p className="font-mono text-12 text-faint">{id}</p>
              </div>
              <span className="flex h-12 items-center justify-end px-3 text-14 tabular-nums text-muted-foreground">
                {context}
              </span>
              <span className="flex h-12 items-center justify-end px-3 text-14 tabular-nums text-muted-foreground">
                {price}
              </span>
              <span className="flex h-12 items-center px-3">
                <AdminMockBadge>{speed}</AdminMockBadge>
              </span>
              <span className="flex h-12 items-center gap-1 px-3">
                <AdminMockBadge tone="green">可选</AdminMockBadge>
                <AdminMockBadge>{tier}</AdminMockBadge>
              </span>
              <span className="flex h-12 items-center px-3">
                <AdminMockBadge tone="green">{status}</AdminMockBadge>
              </span>
              <span className="flex h-12 items-center justify-end px-3 text-faint">
                ✎　×
              </span>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

/** 第三方 AI / Minicod 账号、健康与敏感凭据揭示 · 纯样式 fixture。 */
export function WikiEmbedAdminThirdPartyAccounts() {
  return (
    <AdminMockPage
      fixture="admin-third-party-accounts"
      title="模型与账号"
      description="AI 上游接入 —— 模型目录（端点 / 模型 / 能力绑定）与三方账号（API key 池）"
      tabs={
        <AdminMockTabs items={["模型目录", "三方账号"]} active="三方账号" />
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-14 text-muted-foreground">
          共 3 个 · API key 池，按优先级和健康度轮询，5 分钟缓存
        </p>
        <AdminMockButton>＋ 添加账号</AdminMockButton>
      </div>
      <AiTable
        columns={["账号", "类型", "状态", "调用", "最近使用", ""]}
        template="minmax(260px,1fr) 150px 80px 130px 140px 170px"
        minWidth={930}
        rows={[
          [
            <AiIdentity
              key="account"
              title="deepseek-prod-01"
              detail="优先级 1 · https://api.deepseek.com/v1 · key ····91f2"
            />,
            <AdminMockBadge key="type">AI 模型</AdminMockBadge>,
            <AdminMockBadge key="status" tone="green">
              启用
            </AdminMockBadge>,
            <MetricStack
              key="calls"
              primary="12,858"
              secondary="成功率 99.9% · 842ms"
            />,
            "2026-08-12 10:24",
            <span key="ops" className="text-faint">
              测试　重置　编辑　删除
            </span>,
          ],
          [
            <AiIdentity
              key="account"
              title="qwen-prod-02"
              detail="优先级 2 · DashScope compatible · key ····4ac8"
            />,
            <AdminMockBadge key="type">AI 模型</AdminMockBadge>,
            <AdminMockBadge key="status" tone="green">
              启用
            </AdminMockBadge>,
            <MetricStack
              key="calls"
              primary="8,426"
              secondary="成功率 99.9% · 1,204ms"
            />,
            "2026-08-12 10:18",
            <span key="ops" className="text-faint">
              测试　重置　编辑　删除
            </span>,
          ],
          [
            <AiIdentity
              key="account"
              title="minicod-news-01"
              detail="优先级 1 · https://minicod.example.com · key ····782b"
            />,
            <AdminMockBadge key="type">MiniCod</AdminMockBadge>,
            <AdminMockBadge key="status">停用</AdminMockBadge>,
            <MetricStack key="calls" primary="—" secondary="成功率 —" />,
            "—",
            <span key="ops" className="text-faint">
              测试　重置　编辑　删除
            </span>,
          ],
        ]}
      />
      <div className="mt-4 rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-3 py-2 text-14 leading-paragraph text-muted-foreground">
        敏感值只在显式揭示时返回，关闭编辑面板后立即恢复掩码。优先级和健康度只决定账号池路由；模型
        Provider 是另一层配置。
      </div>
    </AdminMockPage>
  );
}

/** 规范用途键到具体模型的封闭绑定集 · 纯样式 fixture。 */
export function WikiEmbedAdminModelBindings() {
  return (
    <AdminMockPage
      fixture="admin-model-bindings"
      title="模型与账号"
      description="AI 上游接入 —— 模型目录（端点 / 模型 / 能力绑定）与三方账号（API key 池）"
      tabs={
        <AdminMockTabs items={["模型目录", "三方账号"]} active="模型目录" />
      }
    >
      <section className="rounded-8 border border-border bg-background">
        <div className="border-b border-border-hairline p-4">
          <h2 className="flex items-center gap-2 text-20 font-medium text-foreground">
            <ServerCog className="size-5" /> 能力绑定
          </h2>
          <p className="mt-1 text-14 leading-paragraph text-muted-foreground">
            固定能力各自绑定一个目录模型；红色标记表示绑定缺失或目标已停用，正在走回退链。
          </p>
        </div>
        <div>
          {[
            [
              "系统主模型",
              "system.main · 默认回退目标",
              "deepseek-chat",
              false,
            ],
            [
              "智能搜论文",
              "project.smart · 用户问答与检索总结",
              "qwen-max",
              false,
            ],
            [
              "智能写作",
              "project.prism · planner / revision 归一用途",
              "deepseek-chat",
              false,
            ],
            [
              "公众号自动回复",
              "project.wechat_oa · 绑定模型已停用",
              "回退 → deepseek-chat",
              true,
            ],
          ].map(([label, hint, model, fallback], index) => (
            <div
              key={label as string}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${index < 3 ? "border-b border-border-hairline" : ""}`}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-14 font-medium text-foreground">
                  {label as string}
                  {fallback ? (
                    <span className="inline-flex items-center gap-1 text-12 text-brand-red">
                      <TriangleAlert className="size-3" /> 回退中
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 truncate text-12 text-faint">
                  {hint as string}
                </p>
              </div>
              <span
                className={`max-w-56 truncate rounded-8 border px-3 py-2 font-mono text-14 ${fallback ? "border-brand-red/40 bg-danger-soft text-brand-red" : "border-border bg-background text-foreground"}`}
              >
                {model as string}
              </span>
            </div>
          ))}
        </div>
      </section>
      <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
        用途 key 不可编辑；改绑后清理缓存并向执行器推送。专用绑定缺失时回退
        system.main。
      </p>
    </AdminMockPage>
  );
}

/** 矩阵分析系统维度、描述、排序与启用状态 · 纯样式 fixture。 */
export function WikiEmbedAdminAnalysisDimensions() {
  return (
    <AdminMockPage
      fixture="admin-analysis-dimensions"
      title="分析维度"
      description="共 3 个系统维度 · 名称 / 描述 / 排序 / 启用可改，key 锁定"
    >
      <AiTable
        columns={["维度", "描述 / AI 分析指示", "排序", "状态", ""]}
        template="220px minmax(300px,1fr) 70px 90px 80px"
        minWidth={820}
        rows={[
          [
            <AiIdentity
              key="dim"
              title="研究问题"
              detail="research_question"
              mono
            />,
            "识别论文要解决的核心问题、研究对象与边界条件。",
            "10",
            <AdminMockBadge key="status" tone="green">
              启用
            </AdminMockBadge>,
            <span key="edit" className="text-faint">
              编辑
            </span>,
          ],
          [
            <AiIdentity key="dim" title="研究方法" detail="methodology" mono />,
            "归纳实验设计、样本、数据来源与评估方法。",
            "20",
            <AdminMockBadge key="status" tone="green">
              启用
            </AdminMockBadge>,
            <span key="edit" className="text-faint">
              编辑
            </span>,
          ],
          [
            <AiIdentity
              key="dim"
              title="伦理与风险"
              detail="ethics_risk"
              mono
            />,
            "提示潜在伦理、偏差、滥用风险与适用限制。",
            "90",
            <AdminMockBadge key="status">停用</AdminMockBadge>,
            <span key="edit" className="text-faint">
              编辑
            </span>,
          ],
        ]}
      />
      <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
        维度描述会直接进入分析提示；修改、排序或停用只影响后续分析结果。
      </p>
    </AdminMockPage>
  );
}

/** 微信公众号接入、加密模式与 AI 自动回复 · 纯样式 fixture。 */
export function WikiEmbedAdminWechatOfficial() {
  return (
    <AdminMockPage
      fixture="admin-wechat-official"
      title="公众号"
      description="微信公众号自动回复（模型由后台「能力绑定 · 公众号自动回复」选择）"
    >
      <section className="max-w-3xl space-y-4 rounded-8 border border-border bg-background p-4 sm:p-6">
        <header className="border-b border-border-hairline pb-3">
          <h2 className="flex items-center gap-2 text-20 font-medium text-foreground">
            <Send className="size-5" /> 公众号接入
          </h2>
          <p className="mt-1 text-12 text-muted-foreground">
            App Secret / Token / EncodingAESKey 留空表示保留原值
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          <AiField label="App ID" value="wx8f2a••••" />
          <AiField label="App Secret" value="••••••••••••" />
          <AiField label="Token" value="••••••••••••" />
          <AiField label="EncodingAESKey" value="••••••••••••" />
          <AiField label="加密模式" value="安全模式（secure）" />
        </div>
        <div>
          <p className="mb-1 text-12 text-faint">
            System Prompt（给关注者的 AI 回复语气）
          </p>
          <div className="min-h-32 rounded-8 border border-border bg-background px-3 py-2 font-mono text-14 leading-paragraph text-muted-foreground">
            你是 Scholay
            的客服助理，用友好简洁的语气回答用户关于学术搜索、会员与产品使用的问题；不确定时引导联系人工客服。
          </div>
        </div>
        <AiSwitch label="启用 AI 自动回复" />
        <div className="border-t border-border-hairline pt-3">
          <AdminMockButton>保存配置</AdminMockButton>
        </div>
        <p className="text-12 leading-paragraph text-faint">
          此页不直接选择模型；自动回复固定读取 project.wechat_oa 能力绑定。
        </p>
      </section>
    </AdminMockPage>
  );
}

/** 研究新闻 Webhook 展示开关、接收地址与 HMAC 验签 · 纯样式 fixture。 */
export function WikiEmbedAdminNewsWebhook() {
  return (
    <AdminMockPage
      fixture="admin-news-webhook"
      title="情报 Webhook"
      description="接收上游 Minicod 推送的scholay 情报（news.created / news.updated / news.heat），验签即闸"
      actions={<AdminMockButton>保存</AdminMockButton>}
    >
      <div className="flex max-w-2xl flex-col gap-6">
        <AiSection icon={<Newspaper className="size-4" />} title="展示开关">
          <div className="flex items-center justify-between gap-4 rounded-8 border border-border bg-surface-1 px-4 py-3">
            <div>
              <p className="text-14 font-medium text-foreground">
                在用户端展示情报
              </p>
              <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
                关闭后隐藏入口、列表与详情；Webhook 接收和入库照常进行。
              </p>
            </div>
            <AiSwitch />
          </div>
        </AiSection>
        <AiSection
          icon={<Newspaper className="size-4" />}
          title="接收地址（配到上游）"
        >
          <p className="text-12 text-faint">Webhook 接收 URL（只读）</p>
          <div className="flex gap-2">
            <span className="flex h-9 min-w-0 flex-1 items-center truncate rounded-8 border border-border bg-background px-3 font-mono text-12 text-foreground">
              https://scholay.com/api/v1/webhook/minicod-news
            </span>
            <AdminMockButton tone="outline">
              <Copy className="size-4" /> 复制
            </AdminMockButton>
          </div>
        </AiSection>
        <AiSection icon={<KeyRound className="size-4" />} title="验签密钥">
          <AiField label="HMAC 密钥（上游生成）" value="••••••••••••••••" />
          <p className="text-12 leading-paragraph text-faint">
            对原始请求体执行 HMAC-SHA256；两端密钥必须一致，否则返回
            401。留空保存会保留旧值。
          </p>
        </AiSection>
        <section className="rounded-8 border border-border-hairline bg-surface-1 p-4 text-12 leading-paragraph text-muted-foreground">
          <h3 className="font-medium text-foreground">对接说明</h3>
          <ul className="mt-2 list-disc space-y-2 pl-4">
            <li>
              created / updated 逐条投递，heat 批量投递；按 delivery ID
              幂等去重。
            </li>
            <li>
              上游约 10 秒内需要收到 2xx；失败按 1m / 5m / 30m / 2h / 6h 退避，5
              次进入死信。
            </li>
            <li>重试属于上游投递契约，当前后台没有本地重放入口。</li>
          </ul>
        </section>
      </div>
    </AdminMockPage>
  );
}

function AiTable({
  columns,
  template,
  minWidth,
  rows,
}: {
  columns: readonly string[];
  template: string;
  minWidth: number;
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div className="overflow-x-auto rounded-8 border border-border bg-background">
      <div
        className="grid border-b border-border bg-surface-1 text-12 font-medium text-faint"
        style={{ gridTemplateColumns: template, minWidth }}
      >
        {columns.map((column) => (
          <span key={column} className="flex h-9 items-center px-3">
            {column}
          </span>
        ))}
      </div>
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={`grid ${rowIndex < rows.length - 1 ? "border-b border-border-hairline" : ""}`}
          style={{ gridTemplateColumns: template, minWidth }}
        >
          {row.map((cell, cellIndex) => (
            <div
              key={cellIndex}
              className="flex min-h-12 min-w-0 items-center px-3 text-14 text-muted-foreground"
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AiIdentity({
  title,
  detail,
  mono = false,
}: {
  title: string;
  detail: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-14 font-medium text-foreground">{title}</p>
      <p className={`truncate text-12 text-faint ${mono ? "font-mono" : ""}`}>
        {detail}
      </p>
    </div>
  );
}

function MetricStack({
  primary,
  secondary,
}: {
  primary: string;
  secondary: string;
}) {
  return (
    <div className="text-right">
      <p className="text-14 tabular-nums text-foreground">{primary}</p>
      <p className="text-12 tabular-nums text-faint">{secondary}</p>
    </div>
  );
}

function AiField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-12 text-faint">{label}</p>
      <span className="flex h-9 items-center rounded-8 border border-border bg-background px-3 text-14 text-foreground">
        {value}
      </span>
    </div>
  );
}

function AiSwitch({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-14 text-muted-foreground">
      <span className="relative inline-flex h-5 w-9 shrink-0 rounded-pill bg-brand-green">
        <span className="absolute right-1 top-1 size-3 rounded-pill bg-background" />
      </span>
      {label}
    </div>
  );
}

function AiSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-8 border border-border bg-background p-4">
      <h3 className="flex items-center gap-2 text-16 font-medium text-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
