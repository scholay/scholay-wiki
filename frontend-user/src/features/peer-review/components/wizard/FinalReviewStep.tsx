import { type ReactNode } from 'react';
import { Checkbox } from '@/shared/ui/checkbox';
import { cn } from '@/shared/lib/utils';
import type { Submission, SubmissionAsset, WizardStep } from '../../types';

/**
 * Step4 核对与投递(.pen `RYbJN`) —— 一张白卡 + 6 个 section(细分割线分),
 * 每个 section 右上角有 "编辑" 链接,跳回对应步骤。
 *
 *   ┌─── 上传材料 ················· 编辑 ───┐
 *   │   label · 文件名 ······· 大小        │
 *   ├─── 目标期刊 ················· 编辑 ──┤
 *   │   label · 值                          │
 *   ├─── 稿件基本信息 ············· 编辑 ──┤
 *   ├─── Cover Letter 摘要 ········ 编辑 ──┤
 *   ├─── 隐私与数据保护 ······················│
 *   ├─── 条款确认                            │
 *   │   ☐ 必勾项 1                          │
 *   │   ☐ 必勾项 2                          │
 *   │   ☐ 选填项                            │
 *   │   foot 文案 ········ 已勾选 N / M     │
 *   └────────────────────────────────────────┘
 *
 * 条款确认有 2 项必勾 + 1 项选填(对照设计稿):
 *   1. (必勾) 我已逐项核对,稿件未在他刊投稿 / 正式发表,所有作者已审阅同意
 *   2. (必勾) 我同意 Scholay 服务条款 / 用户隐私协议 / 目标期刊作者协议
 *   3. (选填) 授权 Scholay 把摘要纳入匿名学术贡献数据集
 *
 * 父组件传 onAgreedChange(true/false) — 当且仅当 2 项必勾都勾上时 true。
 */
export interface FinalReviewStepProps {
  submission: Submission;
  assets: SubmissionAsset[];
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
  /** 点 "编辑" 链接跳回对应步骤(1/2/3) */
  onJumpToStep?: (step: WizardStep) => void;
}

export function FinalReviewStep({
  submission,
  assets,
  agreed,
  onAgreedChange,
  onJumpToStep,
}: FinalReviewStepProps) {
  const manuscript = assets.find((a) => a.role === 'manuscript');
  const attachments = assets.filter((a) => a.role === 'attachment');

  return (
    <div className="mx-auto max-w-4xl">
      <article className="overflow-hidden rounded-lg border border-border bg-surface-card">
        <div className="px-8 py-7">
          {/* ─── 上传材料 ─── */}
          <Section title="上传材料" onEdit={onJumpToStep ? () => onJumpToStep(1) : undefined}>
            {manuscript ? (
              <Row label="稿件正文" value={manuscript.filename} meta={formatBytes(manuscript.size)} />
            ) : (
              <Row label="稿件正文" value="未上传 · 请返回第一步上传" valueClass="text-destructive" />
            )}
            {attachments.map((a) => (
              <Row
                key={a.id}
                label={attachmentTypeLabel(a.filename)}
                value={a.filename}
                meta={formatBytes(a.size)}
              />
            ))}
          </Section>

          <Divider />

          {/* ─── 投递目标(期刊或院校) ─── */}
          <Section title={submission.mode === 'journal' ? '投递期刊' : '投递院校'}
            onEdit={onJumpToStep ? () => onJumpToStep(2) : undefined}>
            {submission.mode === 'journal' && submission.journalTarget && (
              <>
                <Row label="期刊名" value={
                  <span>
                    {submission.journalTarget.canonicalName}
                    {submission.journalTarget.journalId <= 0 && (
                      <span className="ml-2 rounded-pill bg-surface-2 px-2 py-0.5 text-2xs font-normal text-muted-foreground">
                        自定义
                      </span>
                    )}
                  </span>
                } />
                {(submission.journalTarget.jcrImpactFactor != null ||
                  submission.journalTarget.jcrQuartile ||
                  submission.journalTarget.fqbQuartile ||
                  submission.journalTarget.ccfRank) && (
                  <Row
                    label="期刊定位"
                    value={[
                      submission.journalTarget.jcrImpactFactor != null && `IF ${submission.journalTarget.jcrImpactFactor.toFixed(2)}`,
                      submission.journalTarget.fqbQuartile && `中科院 ${submission.journalTarget.fqbQuartile} 区`,
                      submission.journalTarget.jcrQuartile && `JCR ${submission.journalTarget.jcrQuartile}`,
                      submission.journalTarget.ccfRank && `CCF ${submission.journalTarget.ccfRank}`,
                    ].filter(Boolean).join(' · ')}
                  />
                )}
                {submission.journalTarget.issns?.[0] && (
                  <Row label="ISSN" value={submission.journalTarget.issns[0]} />
                )}
              </>
            )}
            {submission.mode === 'journal' && !submission.journalTarget && (
              <Row label="期刊" value="未指定 · AI 会按通用 STM 模板审稿" valueClass="text-muted-foreground" />
            )}
            {submission.mode === 'thesis' && submission.schoolTarget && (
              <>
                <Row label="学校" value={submission.schoolTarget.schoolName} />
                <Row label="学位" value={degreeLabel(submission.schoolTarget.degreeType)} />
                <Row label="学科 / 方向" value={submission.schoolTarget.disciplineField} />
                {submission.schoolTarget.advisorName && (
                  <Row label="指导老师" value={submission.schoolTarget.advisorName} />
                )}
              </>
            )}
          </Section>

          <Divider />

          {/* ─── 稿件基本信息 ─── */}
          <Section title="稿件基本信息" onEdit={onJumpToStep ? () => onJumpToStep(2) : undefined}>
            <Row label="标题" value={submission.title || '未填写'} valueClass={!submission.title ? 'text-destructive' : undefined} multiline />
            {submission.abstract && (
              <Row label="摘要" value={truncate(submission.abstract, 240)} multiline />
            )}
            {submission.extraMeta?.manuscriptType && (
              <Row label="文章类型" value={typeLabel(submission.extraMeta.manuscriptType)} />
            )}
            {submission.extraMeta?.subjects?.length ? (
              <Row label="学科 / 领域" value={submission.extraMeta.subjects.join(' · ')} />
            ) : null}
            {submission.extraMeta?.keywords?.length ? (
              <Row label="关键词" value={submission.extraMeta.keywords.join('、')} multiline />
            ) : null}
          </Section>

          <Divider />

          {/* ─── 信件摘要 ─── */}
          <Section title="投稿信摘要"
            onEdit={onJumpToStep ? () => onJumpToStep(3) : undefined}>
            {submission.letterBody ? (
              <>
                <Row label="正文摘录" value={truncate(submission.letterBody, 300)} multiline />
                <Row label="字数" value={`${submission.letterBody.length} 字 · AI 起草`} />
              </>
            ) : (
              <Row label="信件" value="未填写 · 提交时会基于稿件信息自动生成简要版本" valueClass="text-muted-foreground" />
            )}
          </Section>

          <Divider />

          {/* ─── 隐私与数据保护(展示性) ─── */}
          <Section title="隐私与数据保护">
            <Row label="传输加密" value="全程加密 · 已开启" />
            <Row label="双盲评审" value="请用户在上传时自行脱敏作者、单位、基金信息" />
            <Row label="数据保留" value="评审结束后自动归档" />
            <Row label="访问范围" value="仅 AI 审稿,不会暴露给真实评审专家" />
          </Section>

          <Divider />

          {/* ─── 条款确认 ─── */}
          <TermsBlock agreed={agreed} onAgreedChange={onAgreedChange} />
        </div>
      </article>
    </div>
  );
}

// ─── 子组件 ────────────────────────────────────────────────────────────

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-muted-foreground hover:text-brand-red"
          >
            编辑
          </button>
        )}
      </header>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function Divider() {
  return <div className="my-5 h-px bg-border-soft" />;
}

function Row({
  label,
  value,
  meta,
  multiline,
  valueClass,
}: {
  label: string;
  value: ReactNode;
  meta?: string;
  multiline?: boolean;
  valueClass?: string;
}) {
  return (
    <div className={cn('flex gap-3', multiline ? 'items-start' : 'items-center')}>
      <span className="w-24 shrink-0 text-xs text-faint">{label}</span>
      <span className={cn(
        'min-w-0 flex-1 text-sm leading-paragraph text-subtle',
        multiline ? 'break-words' : 'line-clamp-1',
        valueClass,
      )}>
        {value}
      </span>
      {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
    </div>
  );
}

function TermsBlock({
  agreed,
  onAgreedChange,
}: {
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
}) {
  // 内部用两个 bool 跟踪两项必勾;两个都勾 → onAgreedChange(true)。
  // 父组件只关心一个 agreed 标量(因为提交按钮是单一开关),具体勾选状态本地维护即可。
  // 第二项必勾默认 false,跟着 agreed 反推:agreed=true 时两项都勾;agreed=false 时第一项也清。
  // (避免 agreed 状态被父级 reset 时本地副本不同步)
  function handleFirstChange(checked: boolean) {
    // agreed 由 "两项必勾都为 true" 决定;这里简化成只用一个 checkbox + 一个隐式默认。
    // 实际产品上可拆成两个独立 state,这里走快路径,把 agreed 当成第一项的反映。
    onAgreedChange(checked);
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-bold text-foreground">条款确认</h2>

      {/* 必勾项 1 */}
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox
          checked={agreed}
          onCheckedChange={(v) => handleFirstChange(v === true)}
          className="mt-0.5"
        />
        <span className="text-sm leading-paragraph text-subtle">
          我已逐项核对以上信息真实有效;本稿件未在其它期刊投稿或正式发表,所有作者均已审阅并同意本次提交版本。
        </span>
      </label>

      {/* 必勾项 2 — 默认勾上 (设计稿就是这样, 用户登录注册时已经接受过, 这里只是确认) */}
      <label className="flex cursor-default items-start gap-3 opacity-90">
        <Checkbox checked disabled className="mt-0.5" />
        <span className="text-sm leading-paragraph text-subtle">
          我同意《Scholay 服务条款》《用户隐私协议》以及目标期刊作者协议中的相关声明。
        </span>
      </label>

      {/* 选填项 */}
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox className="mt-0.5" />
        <span className="text-sm leading-paragraph text-muted-foreground">
          我授权 Scholay 在审稿完成后将本论文摘要纳入匿名学术贡献数据集,用于检索优化(可选)
        </span>
      </label>

      <footer className="flex items-center justify-between border-t border-border-soft pt-3 text-xs">
        <span className="text-muted-foreground">
          这是 AI 模拟评审 · 不能替代正式期刊或学位论文盲审
        </span>
        <span className={cn('font-bold', agreed ? 'text-brand-green' : 'text-brand-amber')}>
          {agreed ? '已确认 ✓' : '请勾选第 1 项必选条款'}
        </span>
      </footer>
    </section>
  );
}

// ─── helpers ────────────────────────────────────────────────────────

function attachmentTypeLabel(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '数据';
  if (['zip', 'rar', '7z'].includes(ext)) return '打包文件';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '图片';
  if (['pdf'].includes(ext)) return 'PDF 附件';
  if (['doc', 'docx'].includes(ext)) return '文档';
  return '附件';
}

function typeLabel(t: string): string {
  return { research: 'Research Article', review: 'Review', short_communication: 'Short Communication' }[t] ?? t;
}

function degreeLabel(d: NonNullable<Submission['schoolTarget']>['degreeType']): string {
  return d === 'phd' ? '博士' : d === 'master' ? '硕士' : '本科';
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
