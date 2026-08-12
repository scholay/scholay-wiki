import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  Mail,
  Quote,
  Share2,
  Smartphone,
} from "lucide-react";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { ProviderLogo, type Provider } from "@/shared/components/ProviderLogo";

const MOBILE_WIDTH = "w-[min(100%,24rem)]";

/** MobileAuthPage 的邮箱密码登录已填写、待提交状态。 */
export function WikiEmbedMobileAuthPage() {
  return (
    <div
      className={`flex ${MOBILE_WIDTH} flex-col overflow-hidden bg-background px-6 pb-10`}
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-auth-page"
    >
      <div className="flex flex-col items-center pb-9 pt-14 text-center">
        <BrandLogo size="lg" />
        <h1 className="mt-5 text-24 font-medium text-foreground">欢迎回来</h1>
        <p className="mt-2 text-14 text-muted-foreground">继续你的学术之旅</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-12 bg-surface-2 p-1 text-12">
            <span className="flex h-8 items-center rounded-8 bg-surface-card px-4 text-foreground shadow-raised">
              邮箱
            </span>
            <span className="flex h-8 items-center px-4 text-muted-foreground">
              手机号
            </span>
          </div>
          <span className="text-12 text-muted-foreground">使用验证码登录</span>
        </div>
        <MobileField label="邮箱" value="you@example.com" />
        <MobileField label="密码" value="••••••••" />
        <span className="flex h-12 items-center justify-center rounded-12 bg-brand-red text-16 font-medium text-on-brand">
          登录
        </span>
        <p className="text-center text-12 leading-paragraph text-faint">
          登录即表示同意 <span className="text-muted-foreground">服务条款</span>{" "}
          与 <span className="text-muted-foreground">隐私政策</span>
        </p>
        <div className="flex items-center justify-between text-12 text-muted-foreground">
          <span>忘记密码?</span>
          <span>还没有账号? 立即注册</span>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center">
          <span className="h-px flex-1 bg-border" />
          <span className="px-3 text-12 text-faint">或继续使用</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="mt-4 flex justify-center gap-2">
          {(["github", "google", "orcid"] as Provider[]).map((provider) => (
            <span
              key={provider}
              className="inline-flex size-9 items-center justify-center rounded-8 border border-border"
            >
              <ProviderLogo provider={provider} className="size-4" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** MobileProfilePage 的已加载编辑态。 */
export function WikiEmbedMobileProfileSettings() {
  return (
    <MobilePage title="个人资料" fixture="mobile-profile-settings">
      <div className="space-y-3 p-3">
        <section className="space-y-3 rounded-8 border border-border bg-background p-4">
          <MobileField label="昵称" value="牛犀犀" />
          <MobileArea label="简介" value="关注科研工具与研究方法" />
        </section>
        <section className="space-y-3 rounded-8 border border-border bg-background p-4">
          <ReadonlyRow label="邮箱" value="niu@example.com" />
          <ReadonlyRow label="手机号" value="138****2026" />
          <ReadonlyRow label="注册时间" value="2026/7/18" />
        </section>
        <span className="flex h-11 items-center justify-center rounded-8 bg-foreground text-14 font-medium text-on-brand">
          保存
        </span>
      </div>
    </MobilePage>
  );
}

/** MobileSecurityPage 的绑定状态与修改密码态。 */
export function WikiEmbedMobileSecuritySettings() {
  return (
    <MobilePage title="安全设置" fixture="mobile-security-settings">
      <div className="space-y-3 p-3">
        <section className="space-y-3 rounded-8 border border-border bg-background p-4">
          <h2 className="text-12 font-medium text-muted-foreground">
            绑定状态
          </h2>
          <BoundRow label="邮箱" value="niu@example.com" />
          <BoundRow label="手机号" value="138****2026" />
          <p className="text-12 leading-paragraph text-faint">
            换绑邮箱或手机号需要双重验证码确认，请在电脑端完成。
          </p>
        </section>
        <section className="space-y-3 rounded-8 border border-border bg-background p-4">
          <h2 className="text-12 font-medium text-muted-foreground">
            修改密码
          </h2>
          <PasswordField value="当前密码" />
          <PasswordField value="新密码（至少 8 位）" />
          <PasswordField value="再输一遍新密码" />
          <span className="flex h-10 items-center justify-center rounded-8 bg-foreground text-14 font-medium text-on-brand opacity-50">
            确认修改
          </span>
        </section>
      </div>
    </MobilePage>
  );
}

/** MobileConnectionsPage 的只读连接列表。 */
export function WikiEmbedMobileConnectionSettings() {
  const rows: Array<{
    provider: "email" | "phone" | Provider;
    label: string;
    value: string;
    bound: boolean;
  }> = [
    {
      provider: "email",
      label: "邮箱",
      value: "niu@example.com",
      bound: true,
    },
    {
      provider: "phone",
      label: "手机号",
      value: "138****2026",
      bound: true,
    },
    { provider: "github", label: "GitHub", value: "niu-lab", bound: true },
    { provider: "orcid", label: "ORCID", value: "未绑定", bound: false },
  ];
  return (
    <MobilePage title="已连接账号" fixture="mobile-connection-settings">
      <div className="space-y-3 p-3">
        <section className="overflow-hidden rounded-8 border border-border bg-background">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex h-13 items-center gap-3 border-b border-border-soft px-4 last:border-b-0"
            >
              <ConnectionIcon provider={row.provider} />
              <span className="flex-1 text-14 text-foreground">
                {row.label}
              </span>
              <span
                className={`max-w-32 truncate text-12 ${row.bound ? "text-muted-foreground" : "text-faint"}`}
              >
                {row.value}
              </span>
              <span
                className={`size-2 rounded-pill ${row.bound ? "bg-brand-green" : "bg-border-strong"}`}
              />
            </div>
          ))}
        </section>
        <p className="px-1 text-12 leading-paragraph text-faint">
          绑定或解绑需要授权跳转，请在电脑端“设置 → 已连接账号”操作。
        </p>
      </div>
    </MobilePage>
  );
}

/** MobileFolderPage 的非空文件夹详情态。 */
export function WikiEmbedMobileLibraryFolder() {
  const papers = [
    [
      "W",
      "Wang, Li 等 8 位作者",
      "Nature · 2025",
      "Large language models in scientific discovery",
      "本文讨论大语言模型如何支持假设生成、证据检索与实验设计。",
    ],
    [
      "L",
      "Lewis, Perez 等 5 位作者",
      "Science · 2024",
      "Retrieval-augmented generation for research",
      "研究评估检索增强生成在科学问答中的证据一致性。",
    ],
    [
      "C",
      "Chen, Rao 等 6 位作者",
      "JASIST · 2026",
      "Evaluating AI agents in scholarly workflows",
      "文章提出面向学术工作流的智能体评测框架与复核指标。",
    ],
  ] as const;
  return (
    <div
      className={`flex ${MOBILE_WIDTH} flex-col overflow-hidden bg-background`}
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-library-folder"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
        <ArrowLeft className="size-5 text-muted-foreground" />
        <h1 className="min-w-0 flex-1 truncate text-14 font-medium text-foreground">
          LLM 综述
        </h1>
        <span className="flex items-center gap-1 rounded-pill border border-border px-3 py-2 text-12 text-muted-foreground">
          <Share2 className="size-3" />
          分享整本
        </span>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        {papers.map(([initial, authors, meta, title, abstract]) => (
          <article
            key={title}
            className="flex gap-3 border-b border-border px-4 py-4"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-brand-green text-16 font-medium text-on-brand">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-14 font-medium text-foreground">
                {authors}
              </p>
              <p className="truncate text-12 text-faint">{meta}</p>
              <h2 className="mt-2 text-14 font-medium leading-paragraph text-foreground">
                {title}
              </h2>
              <p className="mt-1 line-clamp-2 text-12 leading-paragraph text-muted-foreground">
                {abstract}
              </p>
              <div className="mt-3 flex items-center justify-between pr-2 text-12 text-foreground">
                <span className="inline-flex items-center gap-1">
                  <Bookmark className="size-3" /> 已收藏
                </span>
                <span className="inline-flex items-center gap-1">
                  <Share2 className="size-3" /> 分享
                </span>
                <span className="inline-flex items-center gap-1">
                  <Quote className="size-3" /> 引用
                </span>
              </div>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}

function MobilePage({
  title,
  fixture,
  children,
}: {
  title: string;
  fixture: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex ${MOBILE_WIDTH} flex-col overflow-hidden bg-surface-1`}
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture={fixture}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-2">
        <ArrowLeft className="size-5 text-foreground" />
        <span className="text-14 font-medium text-foreground">{title}</span>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function MobileField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block space-y-2">
      <span className="block text-12 font-medium text-muted-foreground">
        {label}
      </span>
      <span className="flex h-12 items-center rounded-12 border border-border bg-surface-1 px-3 text-14 text-foreground">
        {value}
      </span>
    </label>
  );
}

function MobileArea({ label, value }: { label: string; value: string }) {
  return (
    <label className="block space-y-2">
      <span className="block text-12 font-medium text-muted-foreground">
        {label}
      </span>
      <span className="block h-24 rounded-8 border border-border bg-surface-1 px-3 py-3 text-14 leading-paragraph text-foreground">
        {value}
      </span>
    </label>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-12 text-faint">{label}</span>
      <span className="text-14 text-foreground">{value}</span>
    </div>
  );
}

function BoundRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-14 text-foreground">{label}</span>
      <span className="flex items-center gap-2 text-14 text-foreground">
        {value}
        <CheckCircle2 className="size-4 text-brand-green" />
      </span>
    </div>
  );
}

function PasswordField({ value }: { value: string }) {
  return (
    <span className="flex h-10 items-center rounded-8 border border-border bg-surface-1 px-3 text-14 text-faint">
      {value}
    </span>
  );
}

function ConnectionIcon({
  provider,
}: {
  provider: "email" | "phone" | Provider;
}) {
  if (provider === "email") return <Mail className="size-5" />;
  if (provider === "phone") return <Smartphone className="size-5" />;
  return <ProviderLogo provider={provider} className="size-5" />;
}
