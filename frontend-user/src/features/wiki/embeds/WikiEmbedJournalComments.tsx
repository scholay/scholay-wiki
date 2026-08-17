import { MessageCircle } from "lucide-react";

const COMMENTS = [
  {
    author: "林晓舟",
    when: "昨天",
    body: "编辑部沟通清晰，方法论文的范围说明很具体；实际周期仍应以投稿系统为准。",
  },
  {
    author: "周屿",
    when: "6 天前",
    body: "适合交叉方向，但不要只凭评论判断投稿匹配度，还要核对最新栏目与作者指南。",
  },
] as const;

/** 期刊详情评论的产品演示态；评论只保存在当前 mock 会话。 */
export function WikiEmbedJournalComments() {
  return (
    <section
      className="w-[38rem] max-w-full rounded-16 border border-border bg-background p-4 shadow-raised"
      aria-hidden
      data-wiki-fixture="journal-comments"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 flex items-center gap-2 text-16 font-medium text-foreground">
          <MessageCircle className="size-4" /> 用户评论
        </h3>
        <span className="rounded-pill bg-warning-soft px-2 py-1 text-12 text-brand-amber">
          产品演示 · 刷新重置
        </span>
      </div>
      <ul className="mt-4 divide-y divide-border">
        {COMMENTS.map((comment) => (
          <li key={comment.author} className="py-3 first:pt-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-12 font-medium text-foreground">
                {comment.author}
              </span>
              <span className="text-12 text-faint">{comment.when}</span>
            </div>
            <p className="mb-0 mt-1 text-14 leading-paragraph text-muted-foreground">
              {comment.body}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-2 rounded-8 border border-border px-3 py-3 text-12 text-faint">
        登录后可以发表评论
      </div>
      <div className="mt-2 flex justify-end">
        <span className="rounded-8 bg-surface-2 px-3 py-2 text-12 text-faint">
          发表评论
        </span>
      </div>
    </section>
  );
}
