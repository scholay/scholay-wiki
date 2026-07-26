import { type ReactNode } from 'react';
import { FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSubmissionAssets } from '../../api/submissions';
import type { SubmissionAsset } from '../../types';

/**
 * Wizard 右栏(.pen `DToay` / `x29bpl` 共用区域,~380px 宽):
 *
 *   ┌──────────────────────────────┐
 *   │ 已上传资料  N 个文件 · 已校验 │  ← UploadedAssetsCard
 *   │ ✓ thesis_main.pdf            │
 *   │ ✓ figures.zip                │
 *   ├──────────────────────────────┤
 *   │ (step-specific 选中卡片)     │  ← children prop
 *   ├──────────────────────────────┤
 *   │ ⚠️ 温馨提示 · 当前 step       │  ← TipCard
 *   │ • bullet 1                   │
 *   │ • bullet 2                   │
 *   └──────────────────────────────┘
 *
 * children 给每个 step 自己塞中间块用(Step2 = 已选期刊,Step3 = 信件大纲 等)。
 */
export interface RightRailPanelProps {
  submissionId: number;
  /** 中间槽位:Step2/3 各自传"已选期刊 mini / 信件大纲 mini" */
  children?: ReactNode;
  /** 黄色温馨提示卡:title + bullets */
  tip: { title: string; bullets: string[] };
}

export function RightRailPanel({ submissionId, children, tip }: RightRailPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <UploadedAssetsCard submissionId={submissionId} />
      {children}
      <TipCard title={tip.title} bullets={tip.bullets} />
    </div>
  );
}

// ─── 已上传资料 ────────────────────────────────────────────────────────

export function UploadedAssetsCard({ submissionId }: { submissionId: number }) {
  const { data: assets = [] } = useSubmissionAssets(submissionId);
  return (
    <section className="rounded-lg border border-border bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border-soft">
        <h3 className="text-sm font-bold text-foreground">
          已上传
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {assets.length > 0 ? `${assets.length} 个文件` : ''}
          </span>
        </h3>
      </header>
      <ul className="flex flex-col gap-1 p-2">
        {assets.length === 0 ? (
          <li className="px-2 py-3 text-xs text-faint">还没有上传任何文件</li>
        ) : (
          assets.map((a) => <AssetRow key={a.id} asset={a} />)
        )}
      </ul>
    </section>
  );
}

function AssetRow({ asset }: { asset: SubmissionAsset }) {
  const isManuscript = asset.role === 'manuscript';
  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-surface-1">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-[10px] font-bold text-muted-foreground">
        {extLabel(asset.filename)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-xs font-bold text-foreground">{asset.filename}</p>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          {isManuscript ? '稿件正文' : '附件'} · {formatBytes(asset.size)}
        </p>
      </div>
      <CheckCircle2 className="size-4 shrink-0 text-brand-green" />
    </li>
  );
}

// ─── 黄色温馨提示卡(.pen `cEWkw / NYvKU` 风) ───────────────────────────

// 提示卡:背景走 warning-soft token;边框无对应 token,用 brand-amber 30% 不透明度近似 #F2E2B3
export function TipCard({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <section className="rounded-12 border border-brand-amber/30 bg-warning-soft p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-foreground">
        <AlertCircle className="size-4 text-brand-amber" />
        {title}
      </h3>
      <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-subtle">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-brand-amber">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────

function extLabel(filename: string) {
  const i = filename.lastIndexOf('.');
  if (i < 0) return 'FIL';
  return filename.slice(i + 1).toUpperCase().slice(0, 4);
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// 配套图标导出(给 Step 自己用,不必再 import lucide)
export const RightRailIcons = { FileText, CheckCircle2 };
