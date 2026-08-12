import {
  Clock3,
  ExternalLink,
  Flame,
  RefreshCcw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

/** 对齐 NewsDetailPage 正文、来源与可信度区域的已加载状态。 */
export function WikiEmbedAcademicIntelDetail() {
  return (
    <article
      className="w-[min(100%,48rem)] bg-background px-6 py-10"
      aria-hidden
      data-wiki-fixture="academic-intel-detail"
    >
      <div className="flex flex-wrap items-center gap-2 text-12">
        <span className="inline-flex items-center gap-1 font-medium text-cat-blue">
          <span className="size-1 rounded-pill bg-cat-blue" /> 顶刊速递
        </span>
        <span className="rounded-4 bg-surface-1 px-2 py-1 text-faint">
          今日要览
        </span>
        <span className="rounded-4 bg-brand-red px-2 py-1 font-medium text-on-dark">
          头条
        </span>
      </div>

      <h1 className="mt-3 text-24 font-medium leading-display-tight text-foreground">
        多机构发布医学影像基础模型评测框架
      </h1>
      <p className="mt-3 text-16 leading-paragraph text-muted-foreground">
        新框架把跨设备泛化、少样本适配与临床安全性纳入统一评测，并公开说明数据覆盖限制。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-soft pb-4 text-12 text-faint">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="size-3" /> 发布 2 小时前
        </span>
        <span className="inline-flex items-center gap-1">
          <RefreshCcw className="size-3" /> 更新 35 分钟前
        </span>
        <span className="inline-flex items-center gap-1">
          <Flame className="size-3" /> 热度 1.8 万
          <TrendingUp className="size-3 text-brand-red" />
        </span>
        <span>事件原始日期 2026-08-11</span>
      </div>

      <div className="mt-6 space-y-4 text-14 leading-paragraph text-foreground">
        <p>
          报告将训练数据透明度、跨中心稳定性和下游临床效用分开评价，避免用单一平均分掩盖失效场景。
        </p>
        <p>
          研究团队同时提醒，目前公开数据对低资源地区和少见病种覆盖有限，不能把榜单名次直接等同于临床可用性。
        </p>
      </div>

      <section className="mt-10 rounded-8 border border-border-soft bg-surface-1 p-6">
        <h2 className="text-14 font-medium text-foreground">信息来源</h2>
        <ul className="mt-2 space-y-2 text-12 text-brand-green">
          <li className="flex items-center gap-1">
            Nature Medicine · 原始研究说明
            <ExternalLink className="size-3" />
          </li>
          <li className="flex items-center gap-1">
            评测框架项目主页 <ExternalLink className="size-3" />
          </li>
        </ul>
      </section>

      <aside className="mt-4 flex gap-3 rounded-8 border border-border-soft bg-background p-4">
        <ShieldCheck className="size-4 shrink-0 text-brand-green" />
        <div>
          <p className="text-12 font-medium text-foreground">可信度说明</p>
          <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
            已交叉核对论文页面与项目主页；新闻摘要不能替代原始方法、数据与补充材料。
          </p>
        </div>
      </aside>

      <section className="mt-12 border-t border-border-soft pt-8">
        <h2 className="text-16 font-medium text-foreground">相关情报</h2>
        <div className="mt-4 space-y-3">
          {[
            "医学 AI 报告更新跨中心验证清单",
            "数据治理工作组发布临床模型透明度建议",
          ].map((title) => (
            <div
              key={title}
              className="rounded-8 border border-border-soft px-4 py-3 text-14 text-subtle"
            >
              {title}
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}
