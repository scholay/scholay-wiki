import type { ReactNode } from "react";
import { Code2, KeyRound, Save, ShieldAlert } from "lucide-react";
import {
  AdminMockBadge,
  AdminMockButton,
  AdminMockPage,
  AdminMockTabs,
} from "./WikiEmbedAdminShared";

/** 站点基础配置、邮件、短信与代码片段入口 · 纯样式 fixture。 */
export function WikiEmbedAdminSystemConfig() {
  return (
    <AdminMockPage
      fixture="admin-system-config"
      title="系统设置"
      description="平台基础配置 · 通知通道 · 注入脚本"
    >
      <AdminMockTabs
        items={["基础", "邮件", "短信", "代码片段库"]}
        active="基础"
      />
      <section className="mt-4 max-w-3xl space-y-4 rounded-8 border border-border bg-background p-4 sm:p-6">
        <header className="border-b border-border-hairline pb-3">
          <h3 className="text-24 font-medium text-foreground">平台基础配置</h3>
          <p className="mt-1 text-14 text-muted-foreground">
            邮件验证开关 · Cloudflare Turnstile 人机校验
          </p>
        </header>
        {["注册时必须验证邮箱", "启用 Cloudflare Turnstile"].map((label) => (
          <div key={label} className="flex items-center gap-2">
            <span className="inline-flex size-4 items-center justify-center rounded-4 border border-foreground bg-foreground text-12 text-on-dark">
              ✓
            </span>
            <span className="text-16 text-foreground">{label}</span>
          </div>
        ))}
        <SystemField label="Turnstile Site Key" value="0x4AAAA••••" />
        <SystemField label="Turnstile Secret Key" value="••••••••••••　　◉" />
        <SystemField label="Google 分析 ID" value="G-ABCD1234" />
        <p className="-mt-2 text-12 leading-paragraph text-faint">
          GA4 衡量 ID（G- 开头）或 GTM 容器 ID（GTM-
          开头），前端按前缀加载对应脚本。
        </p>
        <div className="border-t border-border-hairline pt-3">
          <AdminMockButton>
            <Save className="size-4" /> 保存配置
          </AdminMockButton>
        </div>
      </section>
      <div className="mt-4 rounded-8 border border-brand-amber/30 bg-brand-amber-soft px-3 py-2 text-14 leading-paragraph text-muted-foreground">
        保存通常是整行配置写入；维护状态只在后台全局提醒中展示，不是本页可编辑项。
      </div>
    </AdminMockPage>
  );
}

function SystemField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <p className="text-16 font-medium text-foreground">{label}</p>
      <div className="flex h-9 items-center rounded-8 border border-border bg-background px-3 text-16 text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

/** 可注入页面的 HTML / JavaScript 片段库 · 纯样式 fixture。 */
export function WikiEmbedAdminCodeSnippets() {
  return (
    <AdminMockPage
      fixture="admin-code-snippets"
      title="系统设置"
      description="平台基础配置 · 通知通道 · 注入脚本"
      tabs={
        <AdminMockTabs
          items={["基础", "邮件", "短信", "代码片段库"]}
          active="代码片段库"
        />
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-8 border border-brand-amber/30 bg-brand-amber-soft p-3">
        <ShieldAlert className="size-4 shrink-0 text-brand-amber" />
        <div className="text-12 leading-paragraph text-muted-foreground">
          <p className="font-medium text-foreground">
            每一条启用记录都会原样注入全站页面
          </p>
          <p className="mt-1">
            权限等同站点代码，可读取登录凭证、改写页面或支付跳转；第三方脚本必须先在测试环境评审。
          </p>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-20 font-medium text-foreground">
            <Code2 className="size-5" /> 代码片段库
          </h2>
          <p className="mt-1 text-14 text-muted-foreground">
            共 3 条 · 给用户端注入的 SEO / 统计 / 广告 / 社交脚本
          </p>
        </div>
        <AdminMockButton>＋ 新建片段</AdminMockButton>
      </div>
      <SystemTable
        columns={["名称", "分类", "注入位置", "优先级", "全站生效"]}
        template="minmax(260px,1fr) 110px 120px 80px 110px"
        minWidth={760}
        rows={[
          [
            <SystemIdentity
              key="snippet"
              title="Umami Analytics"
              detail="umami_analytics"
              mono
            />,
            <AdminMockBadge key="category">统计分析</AdminMockBadge>,
            <AdminMockBadge key="position">head 头部</AdminMockBadge>,
            "10",
            <SystemToggle key="state" label="注入中" />,
          ],
          [
            <SystemIdentity
              key="snippet"
              title="Search Console Verification"
              detail="search_console_verify"
              mono
            />,
            <AdminMockBadge key="category">SEO</AdminMockBadge>,
            <AdminMockBadge key="position">head 头部</AdminMockBadge>,
            "20",
            <SystemToggle key="state" label="注入中" />,
          ],
          [
            <SystemIdentity
              key="snippet"
              title="Legacy Campaign Pixel"
              detail="legacy_campaign_pixel"
              mono
            />,
            <AdminMockBadge key="category">广告</AdminMockBadge>,
            <AdminMockBadge key="position">body 结束</AdminMockBadge>,
            "30",
            <SystemToggle key="state" label="未注入" active={false} />,
          ],
        ]}
      />
    </AdminMockPage>
  );
}

/** OAuth / SSO Provider 与微信小程序登录配置 · 纯样式 fixture。 */
export function WikiEmbedAdminOAuthConfig() {
  return (
    <AdminMockPage
      fixture="admin-oauth-config"
      title="OAuth / SSO"
      description="第三方登录 Provider + 微信小程序一键登录 · 每个按自己的真实字段配置"
    >
      <AdminMockTabs
        items={[
          "GitHub ●",
          "Google ●",
          "Apple ○",
          "ORCID ●",
          "Microsoft ○",
          "恩特学术社区 ●",
          "微信 ○",
          "微信小程序",
        ]}
        active="GitHub ●"
      />
      <section className="mt-4 max-w-3xl space-y-4 rounded-16 border border-border bg-background p-4 sm:p-6">
        <header className="border-b border-border-hairline pb-3">
          <h2 className="flex items-center gap-2 text-16 font-medium text-foreground">
            <KeyRound className="size-4" /> GitHub
          </h2>
          <p className="mt-1 text-12 text-muted-foreground">
            GitHub Developer Settings · OAuth Apps · 最后更新 2026-08-10 16:42
          </p>
        </header>
        <SystemField label="Client ID" value="Ov23li••••" />
        <SystemField label="Client Secret" value="••••••••••••　◉" />
        <SystemField
          label="Redirect URI"
          value="https://scholay.com/github/callback"
        />
        <SystemToggle label="启用 GitHub 登录" />
        <div className="border-t border-border-hairline pt-3">
          <AdminMockButton>
            <Save className="size-4" /> 保存 GitHub 配置
          </AdminMockButton>
        </div>
      </section>
      <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
        Tab
        右侧状态点来自用户端公开配置，代表登录入口是否真实可见；凭据仍只在管理端按需揭示。
      </p>
    </AdminMockPage>
  );
}

/** 支付宝与微信支付商户、能力、测试与激活 · 纯样式 fixture。 */
export function WikiEmbedAdminPaymentMerchants() {
  return (
    <AdminMockPage
      fixture="admin-payment-merchants"
      title="支付配置"
      description="支付宝 + 微信支付 · 多商户切换"
    >
      <AdminMockTabs items={["支付宝", "微信支付"]} active="支付宝" />
      <div className="my-4 rounded-8 border border-brand-green/40 bg-brand-green-soft px-4 py-3">
        <p className="text-14 font-medium text-foreground">
          支付宝已生效 —— 用户端会显示支付宝入口
        </p>
        <p className="mt-1 font-mono text-12 text-muted-foreground">
          App ID 2021002188•••• · https://openapi.alipay.com/gateway.do
        </p>
      </div>
      <div className="mb-3 flex justify-end">
        <AdminMockButton>＋ 新增支付宝配置</AdminMockButton>
      </div>
      <SystemTable
        columns={["App ID", "环境", "活动", "创建时间", ""]}
        template="minmax(280px,1fr) 80px 110px 120px 110px"
        minWidth={720}
        rows={[
          [
            <SystemIdentity
              key="merchant"
              title="2021002188••••"
              detail="https://openapi.alipay.com/gateway.do"
              mono
            />,
            <AdminMockBadge key="env">生产</AdminMockBadge>,
            <SystemToggle key="active" label="活动" />,
            "2026-05-18",
            <span key="ops" className="text-faint">
              编辑　删除
            </span>,
          ],
          [
            <SystemIdentity
              key="merchant"
              title="2021002199••••"
              detail="https://openapi-sandbox.dl.alipaydev.com/gateway.do"
              mono
            />,
            <AdminMockBadge key="env" tone="amber">
              沙箱
            </AdminMockBadge>,
            <SystemToggle key="active" label="未激活" active={false} />,
            "2026-04-03",
            <span key="ops" className="text-faint">
              编辑　删除
            </span>,
          ],
        ]}
      />
      <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
        每个渠道仅使用一条活动配置；删除活动商户会让对应用户端支付入口立即消失。
      </p>
    </AdminMockPage>
  );
}

/** 微信支付商户的能力与加密材料 · 纯样式 fixture。 */
export function WikiEmbedAdminWechatPay() {
  return (
    <AdminMockPage
      fixture="admin-wechat-pay"
      title="支付配置"
      description="支付宝 + 微信支付 · 多商户切换"
    >
      <AdminMockTabs items={["支付宝", "微信支付"]} active="微信支付" />
      <div className="my-4 rounded-8 border border-brand-green/40 bg-brand-green-soft px-4 py-3">
        <p className="text-14 font-medium text-foreground">
          微信支付已生效 —— 当前活动配置已通过校验
        </p>
        <p className="mt-1 text-12 text-muted-foreground">
          商户号 190000•••• · 用户端显示 Native / H5 支付入口
        </p>
      </div>
      <div className="mb-3 flex justify-end">
        <AdminMockButton>＋ 新增微信支付配置</AdminMockButton>
      </div>
      <SystemTable
        columns={[
          "商户号 / AppID",
          "验签模式",
          "支付方式",
          "校验状态",
          "活动",
          "",
        ]}
        template="minmax(220px,1fr) 110px 180px 240px 110px 190px"
        minWidth={1050}
        rows={[
          [
            <SystemIdentity
              key="merchant"
              title="190000••••"
              detail="AppID wx8f2a••••"
              mono
            />,
            "平台公钥",
            <div key="modes" className="flex gap-1">
              <AdminMockBadge>Native</AdminMockBadge>
              <AdminMockBadge>H5</AdminMockBadge>
            </div>,
            <MetricState
              key="valid"
              status="校验通过"
              detail="上次测试 2026-08-12 09:20"
            />,
            <SystemToggle key="active" label="活动" />,
            <span key="ops" className="text-faint">
              测试配置　编辑　删除
            </span>,
          ],
          [
            <SystemIdentity
              key="merchant"
              title="190001••••"
              detail="AppID wx7a31••••"
              mono
            />,
            "平台证书",
            <AdminMockBadge key="modes">JSAPI</AdminMockBadge>,
            <MetricState
              key="valid"
              status="待测试"
              detail="从未测试"
              tone="amber"
            />,
            <SystemToggle key="active" label="未激活" active={false} />,
            <span key="ops" className="text-faint">
              测试配置　编辑　删除
            </span>,
          ],
        ]}
      />
      <p className="mt-4 text-14 leading-paragraph text-muted-foreground">
        修改
        APIv3、私钥、证书或支付方式后，后端会清空校验状态并强制下线；必须重新测试通过才能激活。
      </p>
    </AdminMockPage>
  );
}

function SystemTable({
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

function SystemIdentity({
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
      <p
        className={`truncate text-14 font-medium text-foreground ${mono ? "font-mono" : ""}`}
      >
        {title}
      </p>
      <p className={`truncate text-12 text-faint ${mono ? "font-mono" : ""}`}>
        {detail}
      </p>
    </div>
  );
}

function SystemToggle({
  label,
  active = true,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-12 ${active ? "text-brand-green" : "text-faint"}`}
    >
      <span
        className={`relative inline-flex h-5 w-9 rounded-pill ${active ? "bg-brand-green" : "bg-surface-2"}`}
      >
        <span
          className={`absolute top-1 size-3 rounded-pill bg-background ${active ? "right-1" : "left-1"}`}
        />
      </span>
      {label}
    </div>
  );
}

function MetricState({
  status,
  detail,
  tone = "green",
}: {
  status: string;
  detail: string;
  tone?: "green" | "amber";
}) {
  return (
    <div>
      <AdminMockBadge tone={tone}>{status}</AdminMockBadge>
      <p className="mt-1 text-12 text-faint">{detail}</p>
    </div>
  );
}
