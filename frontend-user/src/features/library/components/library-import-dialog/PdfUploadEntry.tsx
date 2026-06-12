import { Check, Edit3, FileText, FolderInput, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { MAX_PDF_SIZE } from '../../api/pdf';
import { StepBanner } from '../shared/dialog-chrome';

/**
 * 本地上传 PDF · State 0 —— 起点(等待用户上传 PDF)
 *
 * 对照设计稿 scholay0523.pen 帧 `M6NQBY` 第一段 State 0:
 *   - 顶部状态条:State 0 · 起点 · 等待用户上传 PDF
 *   - 双卡片入口:[先上传 PDF · 橙][先填写信息 · 蓝,即将推出]
 *   - 底部 4 步预告 stepper:上传 PDF → 自动检索 → 确认匹配 → 入库并完善
 *
 * "先填写信息"(无 PDF 直接建条目)需后端提供独立创建入口,暂未实现 —— 卡片
 * 保留并标注「即将推出」,点击给明确反馈。"先上传 PDF" 触发 onPickFile,
 * 父组件打开 file picker;同时整张左卡片是 dropzone(拖拽 PDF 进来也行)。
 */
interface PdfUploadEntryProps {
  dragOver: boolean;
  currentFolderName: string;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onPickFile: () => void;
}

export function PdfUploadEntry({
  dragOver,
  currentFolderName,
  onDragOver,
  onDragLeave,
  onDrop,
  onPickFile,
}: PdfUploadEntryProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* 状态条:State 0 起点提示(active=false → 前景黑底编号 pill) */}
      <StepBanner
        step={1}
        active={false}
        title="上传 PDF"
        desc="拖拽文件进来,或点击选择;上传后会自动识别并匹配在线论文"
      />

      {/* 双卡片入口 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-4">
        {/* 左:先上传 PDF —— 整张卡都接受 drag/drop,中央 CTA 大橙按钮 */}
        <button
          type="button"
          onClick={onPickFile}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            'group flex flex-col items-center justify-center gap-4 p-8 rounded-md border-2 transition-all text-center min-h-[240px]',
            dragOver
              ? 'border-brand-amber bg-warning-soft scale-[1.01]'
              : 'border-dashed border-border-strong bg-warning-soft/40 hover:bg-warning-soft hover:border-brand-amber/60'
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-brand-amber/15 group-hover:bg-brand-amber/25 transition-colors">
            <Upload className="size-5 text-brand-amber" strokeWidth={2.25} />
          </div>
          <div className="space-y-1.5">
            <div className="text-base font-bold text-foreground">先上传 PDF</div>
            <div className="text-xs text-muted-foreground max-w-[280px]">
              拖拽到这里,或点下面的按钮选择文件;上传后会自动识别并匹配在线论文
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 h-9 px-4 rounded-sm bg-brand-amber text-background text-sm font-bold group-hover:bg-brand-amber/90 transition-colors">
            <FileText className="size-3.5" strokeWidth={2.25} />
            选择 PDF 文件
          </div>
        </button>

        {/* 中:或 —— 视觉分隔 */}
        <div className="flex flex-col items-center justify-center gap-2 self-stretch min-w-[24px]">
          <div className="flex-1 w-px bg-border-soft" />
          <span className="text-xs text-faint">或</span>
          <div className="flex-1 w-px bg-border-soft" />
        </div>

        {/* 右:先填写信息 —— 无 PDF 直接建条目需后端独立创建入口,暂未实现,
            卡片保留占位 + 「即将推出」角标,点击给明确反馈(不做静默 no-op) */}
        <button
          type="button"
          onClick={() =>
            toast.info('「先填写信息」即将推出 — 现在可先上传 PDF,或用「在线搜索加入」')
          }
          className={cn(
            'group relative flex flex-col items-center justify-center gap-4 p-8 rounded-md border transition-all text-center min-h-[240px]',
            'border-border-strong bg-brand-blue-soft/40 hover:bg-brand-blue-soft hover:border-brand-blue/60'
          )}
        >
          <span
            aria-hidden="true"
            className="absolute top-3 right-3 inline-flex items-center h-4 px-1.5 rounded-pill bg-brand-amber text-background text-[9px] font-bold leading-none whitespace-nowrap"
          >
            即将推出
          </span>
          <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-brand-blue/15 group-hover:bg-brand-blue/25 transition-colors">
            <Edit3 className="size-5 text-brand-blue" strokeWidth={2.25} />
          </div>
          <div className="space-y-1.5">
            <div className="text-base font-bold text-foreground">先填写信息</div>
            <div className="text-xs text-muted-foreground max-w-[280px]">
              没有 PDF 也可以先填好文献信息,之后再补充 PDF
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 h-9 px-4 rounded-sm border border-brand-blue text-brand-blue text-sm font-bold group-hover:bg-brand-blue/5 transition-colors">
            <Edit3 className="size-3.5" strokeWidth={2.25} />
            开始填写
          </div>
        </button>
      </div>

      {/* 4 步预告 stepper —— "上传后会发生什么"
          上传 PDF (active 橙) → 自动检索 → 确认/接受 → 保存入库 */}
      <div className="rounded-md border border-border-soft bg-background p-4">
        <div className="text-xs font-semibold text-muted-foreground mb-3">
          上传后会发生什么
        </div>
        <ol className="grid grid-cols-4 gap-3">
          <StepNode
            n={1}
            icon={<Upload className="size-3.5" strokeWidth={2.25} />}
            label="上传 PDF"
            hint="拖入或点选择"
            active
          />
          <StepNode
            n={2}
            icon={<Search className="size-3.5" strokeWidth={2.25} />}
            label="自动检索"
            hint="系统匹配在线论文信息"
          />
          <StepNode
            n={3}
            icon={<Check className="size-3.5" strokeWidth={2.25} />}
            label="确认匹配"
            hint="接受候选,或直接保存"
          />
          <StepNode
            n={4}
            icon={<FolderInput className="size-3.5" strokeWidth={2.25} />}
            label="加入并完善"
            hint={`存入「${currentFolderName}」后可继续编辑`}
          />
        </ol>
      </div>

      {/* 兜底文案 */}
      <p className="text-2xs text-faint leading-relaxed">
        仅支持 PDF,大小 ≤ {MAX_PDF_SIZE / 1024 / 1024} MB。上传后会自动识别标题并匹配在线论文;没有匹配也可以
        <span className="text-brand-green font-semibold">直接保存</span>
        ,之后再完善信息。
      </p>
    </div>
  );
}

// ─── 单个 step 节点 ──────────────────────────────────────────────────────────

function StepNode({
  n,
  icon,
  label,
  hint,
  active,
}: {
  n: number;
  icon: React.ReactNode;
  label: string;
  hint: string;
  active?: boolean;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-pill text-2xs font-bold shrink-0 tabular-nums',
          active
            ? 'bg-brand-amber text-background'
            : 'bg-surface-2 text-faint border border-border-soft'
        )}
      >
        {n}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-semibold truncate',
            active ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          <span className={active ? 'text-brand-amber' : 'text-faint'}>
            {icon}
          </span>
          {label}
        </div>
        <div className="mt-0.5 text-2xs text-faint truncate">{hint}</div>
      </div>
    </li>
  );
}
