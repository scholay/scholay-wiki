import {
  ArrowRight,
  Briefcase,
  Clock3,
  FileText,
  Mail,
  MessageSquare,
} from "lucide-react";

const CHANNELS = [
  {
    icon: Mail,
    title: "产品支持",
    desc: "使用问题、Bug 报告、账号问题",
    cta: "support@scholay.com",
  },
  {
    icon: Briefcase,
    title: "商务合作",
    desc: "机构席位、API 接入、媒体采访",
    cta: "hello@scholay.com",
  },
  {
    icon: MessageSquare,
    title: "产品反馈",
    desc: "功能建议、改进意见、用户体验",
    cta: "前往反馈页",
  },
  {
    icon: FileText,
    title: "帮助中心",
    desc: "常见问题、使用指南、文章资源",
    cta: "查看帮助",
  },
] as const;

/**
 * 联系支持与响应时效 · 纯样式 fixture。
 * 来源：product-mock help/pages/ContactPage.tsx；邮箱为源组件的默认展示值。
 */
export function WikiEmbedContactSupport() {
  return (
    <div
      className="w-[min(100%,64rem)] bg-background"
      aria-hidden
      data-wiki-fixture="contact-support"
    >
      <header className="border-b border-border-soft bg-surface-1 px-6 py-10">
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-brand-red" />
          <p className="text-12 font-medium text-brand-red">CONTACT</p>
        </div>
        <p className="mt-3 text-32 font-medium leading-display-tight text-foreground">
          联系我们
        </p>
        <p className="mt-4 text-14 text-muted-foreground">
          选择合适的渠道；常规问题通常 1 个工作日内响应。
        </p>
      </header>

      <main className="px-6 py-10">
        <section>
          <p className="mb-4 text-16 font-medium text-foreground">联系渠道</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CHANNELS.map(({ icon: Icon, title, desc, cta }) => (
              <div key={title} className="rounded-8 border border-border p-6">
                <span className="inline-flex size-9 items-center justify-center rounded-8 border border-border-soft bg-surface-1 text-subtle">
                  <Icon className="size-4" />
                </span>
                <p className="mt-3 text-14 font-medium text-foreground">
                  {title}
                </p>
                <p className="mt-1 text-12 text-muted-foreground">{desc}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-12 font-medium text-brand-red">
                  {cta} <ArrowRight className="size-3" />
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <p className="mb-4 flex items-center gap-2 text-16 font-medium text-foreground">
            <Clock3 className="size-4 text-brand-red" /> 响应时效
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["产品支持", "1 个工作日", "工作日 9:00–18:00 回复"],
              ["商务合作", "1–3 个工作日", "评估后由商务同学联系"],
              ["产品反馈", "不一定回复", "每条都会被产品团队看到"],
            ].map(([scope, time, detail]) => (
              <div
                key={scope}
                className="rounded-8 border border-border-soft bg-surface-1 p-6"
              >
                <p className="text-12 font-medium text-faint">{scope}</p>
                <p className="mt-2 text-16 font-medium text-foreground">
                  {time}
                </p>
                <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
