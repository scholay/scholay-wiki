import { Check, Download, ShieldCheck, Sparkles } from "lucide-react";

/** 社区 Skill 详情与安装 · 纯样式 fixture。 */
export function WikiEmbedCommunitySkill() {
  return (
    <div
      className="w-[min(100%,36rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="community-skill"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-8 bg-danger-soft text-brand-red">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-16 font-medium text-foreground">系统综述助手</p>
            <span className="rounded-pill bg-cat-green-soft px-2 py-1 text-12 text-cat-green">
              已审核
            </span>
          </div>
          <p className="mt-1 text-12 text-muted-foreground">
            把研究问题拆成检索、筛选和证据整理步骤。
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          { label: "安装量", value: "1.2k", Icon: Download },
          { label: "版本", value: "1.4.0", Icon: Check },
          { label: "信任状态", value: "社区审核", Icon: ShieldCheck },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="rounded-8 bg-surface-1 p-3">
            <div className="flex items-center gap-1 text-12 text-faint">
              <Icon className="size-3" />
              {label}
            </div>
            <p className="mt-2 text-14 font-medium text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-8 border border-border bg-surface-1 p-3">
        <p className="text-12 font-medium text-foreground">装载后可用</p>
        <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
          Skill 会在新会话中按需加载；安装不代表其输出无需核对。
        </p>
      </div>
      <span className="mt-4 inline-flex h-control-md items-center gap-2 rounded-8 bg-brand-red px-4 text-12 font-medium text-on-dark">
        <Download className="size-3" /> 安装 Skill
      </span>
    </div>
  );
}
