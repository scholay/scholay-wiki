import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, Info } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/shared/ui/button';
import { ResourceError } from '@/shared/components';
import { useSubmission } from '../api/submissions';

/**
 * 投递成功 splash —— 复刻设计稿 .pen `J9MCZ` Step7。
 *
 * 路由: /peer-review/submitted/:id (从 Submit Wizard step4 投递成功后导航过来)。
 *
 * 关键设计点:
 *   - 灰底白卡片居中, 卡片宽 720px
 *   - 顶部 104px 绿色环 + 80px 白勾 (E8F5E9 / 2A7A2A)
 *   - 信息卡 5 行: 稿件标题 / 投稿期刊 / 投稿编号 / 提交时间 / 通讯作者
 *   - 黄色 tip box: 「接下来会发生什么？」
 *   - 双按钮: 「返回投稿管理」outline + 「前往审稿记录 →」红色实心
 *
 * 没有手动 polling — 用户点 「前往审稿记录」后 RecordDetailPage 用 useSubmission
 * polling 拿审稿进度。本页本身只是个 confirmation splash。
 */
export function SubmitSuccessPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const id = params.id ? Number(params.id) : undefined;
  const { data: submission, isLoading, isError, error } = useSubmission(id);

  // 投稿编号:用 submission.id 拼一个看起来像期刊收到的回执号。
  // 设计稿示例: NM-2026-051408-A7K3,这里用 id + 提交日期 hash 出可读编号。
  const trackingNo = useMemo(() => {
    if (!submission) return '——';
    const prefix = submission.mode === 'journal' ? 'SCY' : 'THS';
    const date = submission.submittedAt ? parseISO(submission.submittedAt) : new Date();
    const ymd = format(date, 'yyyy-MMdd');
    return `${prefix}-${ymd}-${submission.id.toString(36).toUpperCase().padStart(4, '0')}`;
  }, [submission]);

  const submittedAtText = submission?.submittedAt
    ? format(parseISO(submission.submittedAt), 'yyyy-MM-dd HH:mm')
    : '——';

  const targetLabel = submission?.mode === 'journal'
    ? submission.journalTarget?.canonicalName || '通用 STM 期刊'
    : submission?.schoolTarget
      ? `${submission.schoolTarget.schoolName} · ${degreeLabel(submission.schoolTarget.degreeType)}`
      : '——';

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-3">
        <div className="text-faint text-base">加载中…</div>
      </div>
    );
  }

  // id 不存在 / 非本人(后端统一 404)/ 上游失败 —— 不再永远卡在「加载中…」,
  // 给友好提示并自动回审稿记录列表。
  if (isError || !submission) {
    return (
      <ResourceError
        resourceName="投稿"
        error={error}
        backTo="/peer-review/records"
        backLabel="返回审稿记录"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-3 px-8 py-10">
      <article
        className={
          'flex w-full max-w-[720px] flex-col gap-6 rounded-16 border ' +
          'border-border bg-surface-card px-14 py-12'
        }
      >
        {/* 顶部成功标志 + 标题块 ─────────────────────────────────────── */}
        <header className="flex flex-col items-center gap-2">
          <CheckRing />
          <h1 className="mt-2 font-serif text-2xl font-bold leading-display-tight text-foreground">
            恭喜！稿件已成功投递
          </h1>
          <p className="max-w-[480px] text-center text-md leading-paragraph text-muted-foreground">
            您的稿件已成功投递至期刊编辑部,编辑团队已收到投稿并进入处理流程。
          </p>
        </header>

        {/* 投稿信息卡 ────────────────────────────────────────────────── */}
        <section className="rounded-12 border border-border bg-surface-3 px-6 py-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">投稿信息</h2>
            <span className="rounded-pill bg-danger-soft px-3 py-0.5 text-xs font-bold text-brand-red">
              已提交 · 待初审
            </span>
          </div>
          <div className="my-3 h-px bg-border-soft" />
          <dl className="flex flex-col gap-3">
            <InfoRow label="稿件标题" value={submission.title || '(未命名)'} bold />
            <InfoRow label={submission.mode === 'journal' ? '投稿期刊' : '目标院校'} value={targetLabel} />
            <InfoRow label="投稿编号" value={trackingNo} />
            <InfoRow label="提交时间" value={submittedAtText} />
            <InfoRow label="通讯作者" value="本账户作者" />
          </dl>
        </section>

        {/* 黄色 tip box ──────────────────────────────────────────────── */}
        <aside className="flex gap-3 rounded-12 border border-brand-amber/40 bg-warning-soft px-4 py-3.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-brand-amber">
            <Info className="h-3.5 w-3.5 text-background" strokeWidth={3} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-base font-bold text-brand-amber">接下来会发生什么？</p>
            <p className="text-sm leading-paragraph text-brand-amber/80">
              投递后系统会立即启动 AI 审稿流程:编辑部初审 → 通读全文并为本文匹配合适的审稿人 →
              三位审稿人依次给出结构化意见(逐句意见、维度评分)→ 主审综合三方意见做出决议。
              整个过程通常十分钟左右,点下方「前往审稿记录」可<strong className="font-bold">实时观看</strong>每位审稿人的意见逐条生成;
              也可以关掉页面,稍后回来查看完整结果。
            </p>
          </div>
        </aside>

        {/* 双按钮 ────────────────────────────────────────────────────── */}
        <footer className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="lg"
            className="h-11 border-foreground/80 px-6 text-base font-semibold text-foreground"
            onClick={() => navigate('/peer-review')}
          >
            返回投稿管理
          </Button>
          <Button
            size="lg"
            className="h-11 gap-2 bg-brand-red px-7 text-base font-bold text-background hover:bg-brand-red/90"
            onClick={() => navigate(`/peer-review/records/${submission.id}`)}
          >
            前往审稿记录 <ArrowRight className="h-4 w-4" />
          </Button>
        </footer>
      </article>
    </div>
  );
}

/* ─── 子组件 ───────────────────────────────────────────────────────── */

/** 104px 绿色外环 + 80px 内圈实心绿底白勾 — .pen `J9MCZ` checkRing */
function CheckRing() {
  return (
    <div className="flex h-[104px] w-[104px] items-center justify-center rounded-pill bg-brand-green/10">
      <div className="flex h-20 w-20 items-center justify-center rounded-pill bg-brand-green">
        <Check className="h-10 w-10 text-background" strokeWidth={3.5} />
      </div>
    </div>
  );
}

function InfoRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-sm text-faint">{label}</dt>
      <dd
        className={
          'flex-1 text-base text-subtle ' +
          (bold ?'font-semibold':'font-semibold')
        }
      >
        {value}
      </dd>
    </div>
  );
}

function degreeLabel(d?: string) {
  switch (d) {
    case 'phd': return '博士';
    case 'master': return '硕士';
    case 'bachelor': return '本科';
    default: return d ?? '';
  }
}
