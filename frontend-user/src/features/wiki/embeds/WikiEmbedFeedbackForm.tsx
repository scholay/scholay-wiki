import {
  Bug,
  CheckCircle2,
  Lightbulb,
  Mail,
  MessageCircle,
  Paperclip,
  Send,
  Sparkles,
} from "lucide-react";

const CATEGORIES = [
  {
    icon: Lightbulb,
    label: "功能建议",
    hint: "改进想法 / 新功能",
    active: true,
  },
  { icon: Bug, label: "Bug 报告", hint: "问题 / 异常", active: false },
  {
    icon: MessageCircle,
    label: "其他",
    hint: "投诉 / 表扬 / 咨询",
    active: false,
  },
] as const;

/**
 * 产品反馈表单 · 纯样式 fixture。
 * 来源：product-mock help/pages/FeedbackPage.tsx；无上传与提交逻辑。
 */
export function WikiEmbedFeedbackForm() {
  return (
    <div
      className="grid w-[min(100%,48rem)] gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]"
      aria-hidden
      data-wiki-fixture="feedback-form"
    >
      <section className="rounded-12 border border-border bg-surface-1 p-4 md:p-6">
        <div>
          <p className="text-12 font-medium text-brand-red">FEEDBACK</p>
          <p className="mt-1 text-20 font-medium text-foreground">
            告诉我们哪里可以做得更好
          </p>
          <p className="mt-1 text-12 text-faint">
            表单示意 · 不会提交或上传文件
          </p>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-12 font-medium text-foreground">反馈类型</p>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map(({ icon: Icon, label, hint, active }) => (
              <div
                key={label}
                className={`flex flex-col items-center rounded-8 border p-3 text-center ${
                  active
                    ? "border-brand-red bg-brand-red-soft"
                    : "border-border bg-surface-card"
                }`}
              >
                <Icon
                  className={`size-4 ${active ? "text-brand-red" : "text-subtle"}`}
                />
                <p className="mt-2 text-12 font-medium text-foreground">
                  {label}
                </p>
                <p className="mt-1 text-12 text-faint">{hint}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-12 font-medium text-foreground">反馈内容 *</p>
          <div className="min-h-32 rounded-8 border border-border bg-surface-card p-3 text-12 leading-paragraph text-faint">
            请详细描述遇到的问题或建议，越具体我们越能帮上忙……
          </div>
          <p className="mt-1 text-right text-12 text-faint">
            0 / 2000 · 最少 10 字
          </p>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-12 font-medium text-foreground">回复邮箱 *</p>
          <div className="flex h-10 items-center gap-2 rounded-8 border border-border bg-surface-card px-3 text-12 text-subtle">
            <Mail className="size-4 text-faint" /> researcher@example.edu
          </div>
          <p className="mt-1 flex items-center gap-1 text-12 text-brand-green">
            <CheckCircle2 className="size-3" /> 示例登录邮箱
          </p>
        </div>

        <div className="mt-4 rounded-8 border border-dashed border-border bg-surface-card p-6 text-center">
          <Paperclip className="mx-auto size-4 text-faint" />
          <span className="mt-2 inline-flex h-8 items-center rounded-8 border border-border px-3 text-12 text-subtle">
            选择文件
          </span>
          <p className="mt-2 text-12 text-faint">也可以把截图或文件拖到这里</p>
        </div>

        <span className="mt-6 inline-flex h-10 items-center gap-2 rounded-8 bg-foreground px-4 text-14 font-medium text-on-dark">
          <Send className="size-4" /> 提交反馈
        </span>
      </section>

      <aside className="space-y-4">
        <section className="rounded-12 border border-border bg-surface-card p-4">
          <p className="flex items-center gap-2 text-14 font-medium text-foreground">
            <Sparkles className="size-4 text-brand-amber" /> 我们承诺
          </p>
          <ul className="mt-3 space-y-3 text-12 leading-paragraph text-subtle">
            {[
              "每一条反馈都会被产品团队看到",
              "明确的 Bug 通常在 1–3 个工作日内修复",
              "建议采纳后会通过邮件告知",
            ].map((copy) => (
              <li key={copy} className="flex items-start gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-pill bg-brand-amber" />
                {copy}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-12 border border-border bg-surface-card p-4">
          <p className="text-12 font-medium text-foreground">其他联系方式</p>
          <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
            账号或付款问题可通过产品支持邮箱联系团队。
          </p>
          <p className="mt-3 text-12 font-medium text-brand-red">
            support@scholay.com
          </p>
        </section>
      </aside>
    </div>
  );
}
