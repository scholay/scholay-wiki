import { useEffect, useState } from'react';
import { Check, Search, Loader2, X } from'lucide-react';
import { toast } from'sonner';
import { Input } from'@/shared/ui/input';
import { Button } from'@/shared/ui/button';
import { PaginationPrevNext } from'@/shared/components/PaginationPrevNext';
import { useDebounce } from'@/shared/hooks';
import { useJournalSearch } from'@/features/journals/api/journals';
import { cn } from'@/shared/lib/utils';
import type { JournalTarget } from'../../types';
import type { Journal } from'@/shared/api/types';

/**
 * Step2 期刊选择(.pen`AwRED`) —— 复用 /public/journals/search 走真期刊库。
 *
 * 设计要点:
 * - 顶部头:标题"选择投递期刊"+ 副标题 + 右上 outlined"自定义期刊"(预留)
 * - 搜索框 (#FAFAFA 灰底) + 排序按钮(预留)
 * - 结果列表(固定上限高度 + 内部滚动,最多 10 条)
 * - 每条期刊卡:左侧 44×44 logo box,中间名称 + publisher/issn + IF/Quartile/CCF 标签,右侧"✓ 已选"/"选择"* - 单选 / **可取消(再次点击)**,允许空选状态
 */
export interface JournalPickerStepProps {
  value: JournalTarget | undefined;
  onChange: (target: JournalTarget | undefined) => void;
}

export function JournalPickerStep({ value, onChange }: JournalPickerStepProps) {
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 300);
  const hasQuery = debouncedKeyword.trim().length > 0;
  const [customOpen, setCustomOpen] = useState(false);
  // 翻页 —— 换关键词时回到第 1 页
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [debouncedKeyword]);

  function submitCustom(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('请填写期刊名称');
      return;
    }
    if (trimmed.length > 250) {
      toast.error('期刊名称过长 (最多 250 字)');
      return;
    }
    // journalId = 0 (sentinel) — 后端识别为自定义期刊, 不写 journal_id 关联,
    // 只存 journal_name + meta_json (没有 IF/Quartile 等元数据)。
    onChange({ journalId: 0, canonicalName: trimmed });
    setCustomOpen(false);
    toast.success(`已选自定义期刊:${trimmed}`);
  }

  // 不传 sortBy → 后端按**相关度**排序 (与期刊搜索页 relevance 默认一致);
  // 之前硬传 jcr_impact_factor 会把相关度盖成"IF 倒序", 导致搜"Psychology"排在前面的
  // 反而是 IF 最高但不一定最贴题的刊。
  const { data, isFetching } = useJournalSearch({
    keyword: hasQuery ? debouncedKeyword : undefined,
    page,
    pageSize: 10,
  });

  const items = hasQuery ? (data?.items ?? []) : [];

  return (
    <section className="rounded-16 border border-border bg-surface-card p-6">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-14 font-medium text-foreground">选择目标期刊</h2>
          <p className="mt-1 text-12 text-muted-foreground">
            选填。选了 AI 审稿口吻会贴合这本期刊;不选也可以,走通用 STM 模板
          </p>
        </div>
        <button
          type="button"onClick={() => setCustomOpen((v) => !v)}
          className={cn('inline-flex h-8 items-center gap-1 rounded-8 border px-3 text-12 transition',
            customOpen
              ?'border-brand-red bg-danger-soft text-brand-red':'border-border-button bg-surface-card text-subtle hover:border-foreground hover:text-foreground')}
        >
          + 自定义期刊
        </button>
      </header>

      {customOpen && (
        <CustomJournalForm
          onSubmit={submitCustom}
          onCancel={() => setCustomOpen(false)}
        />
      )}

      {/* 搜索框 */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"/>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索期刊名、ISSN 或学科…"className="h-10 bg-surface-1 pl-9"/>
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-faint"/>
        )}
      </div>

      {/* 当前选中提示行(同时给"取消选择"入口) */}
      {value && (
        <div className="mb-3 flex items-center justify-between rounded-12 border border-brand-red/40 bg-danger-soft px-3 py-2">
          <span className="text-12 text-subtle">
            已选:<span className="font-medium text-brand-red">{value.canonicalName}</span>
            {value.journalId <= 0 && (
              <span className="ml-2 rounded-pill bg-surface-card px-2 py-0.5 text-12 text-muted-foreground">
                自定义
              </span>
            )}
          </span>
          <button
            type="button"onClick={() => onChange(undefined)}
            className="text-12 font-medium text-brand-red hover:text-brand-red/80">
            取消选择
          </button>
        </div>
      )}

      {/* 结果区:固定上限高度 + 内部滚动 */}
      <div className="max-h-96 overflow-y-auto pr-1">
        {!hasQuery && (
          <p className="rounded-12 border border-dashed border-border bg-surface-1 py-10 text-center text-12 text-muted-foreground">
            输入关键词开始搜索 · 不选期刊也能继续
          </p>
        )}
        {hasQuery && items.length === 0 && !isFetching && (
          <p className="rounded-12 border border-dashed border-border bg-surface-1 py-10 text-center text-12 text-muted-foreground">
            没找到匹配的期刊,换个关键词试试 · 也可以点右上「+ 自定义期刊」
          </p>
        )}
        {items.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {items.map((j) => (
              <JournalCard
                key={j.id}
                j={j}
                selected={value?.journalId === j.id}
                onToggle={() => {
                  if (value?.journalId === j.id) {
                    onChange(undefined);
                  } else {
                    // 把分区 / IF / CCF 等全部带上 —— 这些会随投稿提交给后续审稿流程
                    onChange({
                      journalId: j.id,
                      canonicalName: j.canonical_name,
                      issns: j.issns,
                      jcrImpactFactor: j.jcr_impact_factor,
                      jcrQuartile: j.jcr_quartile,
                      fqbQuartile: j.fqb_quartile,
                      ccfRank: j.ccf_rank,
                      publisher: j.publisher,
                      country: j.country,
                      hIndex: j.openalex_h_index,
                      isOA: j.is_oa,
                    });
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 分页 —— 上游不给 total, 用 hasMore 游标式 (与期刊搜索页同一组件) */}
      {hasQuery && items.length > 0 && (
        <PaginationPrevNext
          page={page}
          onPageChange={setPage}
          hasMore={data?.has_more}
          disabled={isFetching}
          className="pt-1"/>
      )}
    </section>
  );
}

// ─── 期刊卡 (.pen`nrpuw`selected /`q3e9k`unselected) ─────────────────

function JournalCard({
  j,
  selected,
  onToggle,
}: {
  j: Journal;
  selected: boolean;
  onToggle: () => void;
}) {
  // logo 初始字母作为占位 (设计稿是真 logo;我们没真实 logo 资源,用首字母 + 品牌色块)
  const initial = (j.canonical_name?.[0] ??'?').toUpperCase();
  const logoBg = colorForInitial(initial);

  return (
    <article
      role="button"tabIndex={0}
      aria-pressed={selected}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key ==='Enter'|| e.key ==='') {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        // 整卡可点即选;选中态做强对比 (红边 + 红环 + 浅红底), 一眼可辨'cursor-pointer rounded-12 border bg-surface-card p-3.5 text-left outline-none transition','',
        selected
          ?'border-brand-red bg-danger-soft ring-1 ring-brand-red':'border-border hover:border-brand-red/50 hover:bg-surface-1')}
    >
      <header className="flex items-start gap-3">
        <span
          className={cn('flex size-11 shrink-0 items-center justify-center rounded-8 text-14 font-medium text-background',
            logoBg
          )}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-14 font-medium text-foreground">{j.canonical_name}</h3>
          <p className="mt-1 text-12 text-muted-foreground">
            {j.publisher ??'—'}
            {j.is_oa &&'· Open Access'}
            {j.issns?.[0] &&`· ISSN ${j.issns[0]}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {j.fqb_quartile && (
            <span className="rounded-4 bg-danger-soft px-2 py-0.5 text-12 font-medium text-brand-red">
              中科院 {j.fqb_quartile} 区
            </span>
          )}
          {j.jcr_quartile && (
            <span className="rounded-4 bg-surface-2 px-2 py-0.5 text-12 font-medium text-subtle">
              JCR {j.jcr_quartile}
            </span>
          )}
          {j.jcr_impact_factor != null && (
            <span className="rounded-4 border border-border-strong px-2 py-0.5 text-12 font-medium text-foreground">
              IF {j.jcr_impact_factor.toFixed(1)}
            </span>
          )}
          {j.ccf_rank && (
            <span className="rounded-4 bg-surface-2 px-2 py-0.5 text-12 font-medium text-subtle">
              CCF {j.ccf_rank}
            </span>
          )}
        </div>
      </header>

      <footer className="mt-3 flex items-center justify-between gap-3 border-t border-border-soft pt-3">
        <div className="flex flex-wrap items-center gap-2 text-12 text-muted-foreground">
          <span>投稿要求:</span>
          {j.is_oa && (
            <span className="rounded-4 bg-surface-2 px-2 py-0.5 text-subtle">
              Open Access
            </span>
          )}
          {j.openalex_h_index != null && (
            <span className="rounded-4 bg-surface-2 px-2 py-0.5 text-subtle">
              h-index {j.openalex_h_index}
            </span>
          )}
          {j.country && (
            <span className="rounded-4 bg-surface-2 px-2 py-0.5 text-subtle">
              {j.country}
            </span>
          )}
        </div>
        {/* 选中态指示 —— 整卡已可点选, 这里只作状态标识 (不再单独是按钮) */}
        <span
          className={cn('inline-flex shrink-0 items-center gap-1 text-12 font-medium',
            selected ?'text-brand-red':'text-muted-foreground')}
        >
          {selected ? (
            <>
              <Check className="size-3"strokeWidth={3} />
              已选
            </>
          ) : ('点击选择')}
        </span>
      </footer>
    </article>
  );
}

// ─── 自定义期刊 inline 表单 ────────────────────────────────────────────
//
// 只让用户填一个 canonicalName (后端会做空字符 / 长度合法性校验)。
// IF / Quartile / ISSN 等元数据不收集 — 自定义期刊属于"用户口语化指定",
// agent 拿到 name 文本去 letter / review 阶段当目标参考即可。

function CustomJournalForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const invalid = trimmed.length === 0 || trimmed.length > 250;

  return (
    <div className="mb-3 rounded-12 border border-brand-red/40 bg-surface-1 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-12 font-medium text-foreground">
          自定义期刊 <span className="ml-1 text-muted-foreground">(只填一个名字就行)</span>
        </p>
        <button
          type="button"onClick={onCancel}
          className="text-faint hover:text-foreground"aria-label="取消">
          <X className="size-3.5"/>
        </button>
      </div>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key ==='Enter'&& !invalid) {
              e.preventDefault();
              onSubmit(name);
            }
            if (e.key ==='Escape') onCancel();
          }}
          autoFocus
          placeholder="例:Journal of My Special Field"maxLength={250}
          className="h-9"/>
        <Button
          size="sm"variant="default"disabled={invalid}
          onClick={() => onSubmit(name)}
          className="h-9 bg-brand-red text-background hover:bg-brand-red/90 disabled:opacity-40">
          确认
        </Button>
      </div>
      <p className="mt-2 text-12 text-muted-foreground">
        AI 审稿时会贴合这本期刊的口吻 · {trimmed.length} / 250
      </p>
    </div>
  );
}

// 简单根据首字母分配 logo 颜色 — 不严格,只让视觉有区分度
function colorForInitial(c: string): string {
  const map: Record<string, string> = {
    N:'bg-[#1A1A1A]',
    S:'bg-[#B22234]',
    I:'bg-[#003E7E]',
    P:'bg-[#5A4FCF]',
    A:'bg-[#2A7A2A]',
    J:'bg-[#8B5A2B]',
  };
  return map[c] ??'bg-foreground';
}
