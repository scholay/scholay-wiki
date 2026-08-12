import {
  Clock3,
  ExternalLink,
  Flame,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";

/** 学术情报正文、来源与可信度说明 · 纯样式 fixture。 */
export function WikiEmbedAcademicIntelDetail() {
  return (
    <article
      className="w-[min(100%,44rem)] rounded-12 border border-border bg-surface-card px-4 py-4 sm:px-6"
      aria-hidden
      data-wiki-fixture="academic-intel-detail"
    >
      <div className="flex flex-wrap items-center gap-2 text-12">
        <span className="inline-flex items-center gap-1 font-medium text-cat-blue">
          <span className="size-1 rounded-pill bg-cat-blue" />
          顶刊速递
        </span>
        <span className="rounded-4 bg-surface-1 px-2 py-1 text-faint">
          今日要览
        </span>
        <span className="rounded-4 bg-brand-red px-2 py-1 text-on-dark">
          头条
        </span>
      </div>

      <h1 className="mt-3 font-serif text-24 font-medium leading-display-tight text-foreground">
        多机构发布医学影像基础模型评测框架
      </h1>
      <p className="mt-3 text-14 leading-paragraph text-subtle">
        新框架把跨设备泛化、少样本适配与临床安全性纳入统一评测，并公开说明数据覆盖限制。
      </p>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-b border-border-soft pb-4 text-12 text-faint">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="size-3.5" />
          发布 2 小时前
        </span>
        <span className="inline-flex items-center gap-1">
          <RefreshCcw className="size-3.5" />
          更新 35 分钟前
        </span>
        <span className="inline-flex items-center gap-1">
          <Flame className="size-3.5" />
          热度 1.8 万
        </span>
        <span>事件原始日期 2026-08-11</span>
      </div>

      <div className="mt-4 space-y-3 text-14 leading-paragraph text-foreground">
        <p>
          报告将训练数据透明度、跨中心稳定性和下游临床效用分开评价，避免用单一平均分掩盖失效场景。
        </p>
        <p>
          研究团队同时提醒，目前公开数据对低资源地区和少见病种覆盖有限，不能把榜单名次直接等同于临床可用性。
        </p>
      </div>

      <section className="mt-4 rounded-8 border border-border-soft bg-surface-1 p-4">
        <h2 className="text-14 font-medium text-foreground">信息来源</h2>
        <ul className="mt-2 space-y-2">
          <li className="flex items-center gap-1 text-12 text-brand-green">
            Nature Medicine · 原始研究说明
            <ExternalLink className="size-3" />
          </li>
          <li className="flex items-center gap-1 text-12 text-brand-green">
            评测框架项目主页
            <ExternalLink className="size-3" />
          </li>
        </ul>
      </section>

      <aside className="mt-3 flex items-start gap-3 rounded-8 border border-border-soft p-4">
        <ShieldCheck className="mt-1 size-4 shrink-0 text-brand-green" />
        <div>
          <p className="text-12 font-medium text-foreground">可信度说明</p>
          <p className="mt-1 text-12 leading-paragraph text-subtle">
            已交叉核对论文页面与项目主页；新闻摘要不能替代原始方法、数据与补充材料。
          </p>
        </div>
      </aside>

      <section className="mt-4 border-t border-border-soft pt-4">
        <h2 className="text-14 font-medium text-foreground">相关情报</h2>
        <div className="mt-2 divide-y divide-border-soft">
          <p className="py-2 text-12 leading-paragraph text-subtle">
            医学 AI 报告更新跨中心验证清单
          </p>
          <p className="py-2 text-12 leading-paragraph text-subtle">
            数据治理工作组发布临床模型透明度建议
          </p>
        </div>
        <p className="mt-2 text-12 leading-paragraph text-faint">
          相关性与热度只帮助继续浏览；政策、撤稿和规则变化仍应回到原发布机构核对。
        </p>
      </section>
    </article>
  );
}
