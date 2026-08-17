import { MessageSquareText } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { EmptyState } from '@/shared/components/EmptyState';
import { useUrlState } from '@/shared/hooks';

interface PlazaPrompt {
  id: string;
  title: string;
  scene: string;
  body: string;
  tags: string[];
  uses: number;
}

const PROMPTS: PlazaPrompt[] = [
  {
    id: 'review-rewrite',
    title: '审稿意见对照改写',
    scene: '写作 / 审稿',
    body: '把下面这条审稿意见改写成可执行的修改清单,并标出需要补实验或补引用的地方。',
    tags: ['写作', '审稿'],
    uses: 248,
  },
  {
    id: 'related-work',
    title: '相关工作段落骨架',
    scene: '综述',
    body: '根据这组论文,按方法 / 数据集 / 结论三列整理相关工作,并写出一段可直接改的 Related Work。',
    tags: ['综述', '引用'],
    uses: 186,
  },
  {
    id: 'abstract-zh',
    title: '中文摘要压缩',
    scene: '写作',
    body: '把英文摘要压成约 200 字中文,保留研究问题、方法、关键结果与局限,不新增事实。',
    tags: ['摘要', '翻译'],
    uses: 163,
  },
  {
    id: 'rebuttal',
    title: 'Rebuttal 逐条回应',
    scene: '投稿',
    body: '针对每条审稿意见先复述对方关切,再给证据或改动承诺,语气克制、可核对。',
    tags: ['投稿', '审稿'],
    uses: 121,
  },
];

/**
 * scholay广场 · 学术prompts(/tools/prompts)。
 */
export function ToolsPromptsPage() {
  const [rawQ] = useUrlState('q', '');
  const q = rawQ.trim().toLowerCase();
  const items = q
    ? PROMPTS.filter((p) =>
        [p.title, p.scene, p.body, ...p.tags].join(' ').toLowerCase().includes(q),
      )
    : PROMPTS;

  return (
    <>
      <RouteSEO
        title="学术prompts · scholay广场"
        description="可复用的科研提示词:综述、摘要、审稿回应与改写清单。"
        keywords="学术提示词,prompt,审稿,综述,摘要,Scholay"
        canonical="/tools/prompts"
      />

      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-16 font-medium text-foreground">
          {q ? `“${rawQ.trim()}” 的结果` : '全部 prompts'}
        </h2>
        <span className="text-12 text-faint">共 {items.length} 个</span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="没有匹配的 prompt"
          description="换个场景或关键词试试"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((p) => (
            <article
              key={p.id}
              className="rounded-16 border border-border bg-background p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-14 font-medium text-foreground">{p.title}</h3>
                <span className="shrink-0 text-12 text-faint">{p.uses} 次</span>
              </div>
              <p className="mt-1 text-12 text-faint">{p.scene}</p>
              <p className="mt-2.5 line-clamp-3 text-12 leading-relaxed text-muted-foreground">
                {p.body}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-4 bg-surface-2 px-1.5 py-0.5 text-12 text-subtle"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export default ToolsPromptsPage;
