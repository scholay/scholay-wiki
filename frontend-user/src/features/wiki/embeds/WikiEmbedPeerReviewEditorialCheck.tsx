import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const CHECKS = [
  {
    name: "查重率",
    indicator: "6.2%",
    threshold: "≤ 15%",
    comment: "重复内容集中在通用方法学描述，已识别为合理引用；未发现整段抄袭。",
  },
  {
    name: "AIGC 率",
    indicator: "4.1%",
    threshold: "≤ 20%",
    comment: "比例处于演示安全区间，主要分布于摘要润色与图注表述。",
  },
  {
    name: "排版规范",
    indicator: "模板符合度 96%",
    threshold: "≥ 90%",
    comment: "字号、行距与参考文献样式符合当前演示模板。",
  },
  {
    name: "选题与期刊定位",
    indicator: "匹配度 88%",
    threshold: "≥ 70%",
    comment: "主题契合目标期刊的近期方向，达到产品演示中的送审基线。",
  },
] as const;

/**
 * 编辑部初审页的冻结代表状态。
 * 视觉来源：EditorialCheckPanel；数值为产品前端固定演示，不是检测结果。
 */
export function WikiEmbedPeerReviewEditorialCheck() {
  return (
    <article
      className="flex w-[min(100%,68rem)] flex-col gap-7 bg-background px-8 py-7"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="peer-review-editorial-check"
    >
      <header className="flex flex-col gap-2">
        <p className="text-12 font-medium text-faint">编辑部初审</p>
        <h2 className="font-serif text-24 font-medium text-foreground">
          四项基础检查 · 全部通过
        </h2>
        <p className="text-16 leading-paragraph text-muted-foreground">
          编辑部初审仅做基础性合规检查；只有本环节通过，稿件才会被送往三位匿名审稿人。
        </p>
      </header>

      <section className="border-l-2 border-foreground py-4 pl-6">
        <p className="mb-2 text-12 font-medium text-faint">初审结论</p>
        <p className="font-serif text-18 italic font-medium leading-paragraph text-foreground">
          稿件四项检查全部达标，已自动转入同行评审环节，分配三位匿名 AI 审稿人 A
          / B / C 并行评分。
        </p>
      </section>

      <section className="min-w-[52rem]">
        <header className="flex items-end justify-between border-b-2 border-foreground pb-1">
          <h3 className="font-serif text-18 font-medium text-foreground">
            检查明细
          </h3>
          <p className="text-12 text-faint">4 项 · 通过 4 · 警示 0 · 失败 0</p>
        </header>
        <div className="grid grid-cols-[10.625rem_7.5rem_7.5rem_5rem_1fr] gap-3 py-2">
          {["检查项", "指标", "阈值", "结论", "说明"].map((heading) => (
            <p key={heading} className="text-12 font-medium text-faint">
              {heading}
            </p>
          ))}
        </div>
        {CHECKS.map((item) => (
          <div
            key={item.name}
            className="grid grid-cols-[10.625rem_7.5rem_7.5rem_5rem_1fr] gap-3 border-t border-border-hairline py-3 last:border-b"
          >
            <p className="text-16 font-medium text-foreground">{item.name}</p>
            <p className="text-16 text-subtle">{item.indicator}</p>
            <p className="text-16 text-muted-foreground">{item.threshold}</p>
            <p className="text-16 font-medium text-foreground">通过</p>
            <p className="text-16 leading-paragraph text-subtle">
              {item.comment}
            </p>
          </div>
        ))}
      </section>

      <footer className="flex items-center gap-4 border-t border-foreground pt-4">
        <p className="w-24 shrink-0 text-12 font-medium text-faint">
          编辑部签署
        </p>
        <div className="flex-1">
          <p className="text-16 font-medium text-subtle">
            AI 编辑部初审 · 自动检查通过 · 8-13 14:30
          </p>
          <p className="mt-1 text-14 italic text-muted-foreground">
            四项检查全部达标 ·
            稿件已送往三位匿名审稿人，进入下一环节后本页结果归档不再变动。
          </p>
        </div>
      </footer>
    </article>
  );
}
