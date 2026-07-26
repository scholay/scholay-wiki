import { Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { UploadedAssetsCard, TipCard } from './RightRailPanel';
import type { Submission, SubmissionAsset } from '../../types';

/**
 * Step4 专用右栏(.pen `RYbJN` rightCol):
 *
 *   - 已上传资料(同其它 step,复用 UploadedAssetsCard)
 *   - 投递前自检 (5/N 完成 checklist,数据派生自当前 submission)
 *   - 温馨提示
 *
 * 投递费用卡(设计稿有)暂不实装 — 没有真实定价逻辑,放上去是装饰。
 */

export interface Step4RailProps {
  submissionId: number;
  submission: Submission;
  assets: SubmissionAsset[];
  agreed: boolean;
}

export function Step4Rail({ submissionId, submission, assets, agreed }: Step4RailProps) {
  const items = buildChecklist(submission, assets, agreed);
  const passed = items.filter((it) => it.passed).length;

  return (
    <div className="flex flex-col gap-4">
      <UploadedAssetsCard submissionId={submissionId} />

      <section className="rounded-lg border border-border bg-background p-4">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">投递前自检</h3>
          <span className={cn(
            'text-xs font-bold',
            passed === items.length ? 'text-brand-green' : 'text-brand-amber'
          )}>
            {passed} / {items.length} 完成
          </span>
        </header>
        <ul className="flex flex-col gap-2.5">
          {items.map((it) => (
            <li key={it.key} className="flex items-start gap-2.5">
              <span className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-pill',
                it.passed ? 'bg-[#E9F7EC] text-brand-green' : 'border border-border-button text-faint'
              )}>
                {it.passed && <Check className="size-2.5" strokeWidth={3} />}
              </span>
              <span className={cn(
                'text-xs leading-relaxed',
                it.passed ? 'text-subtle' : 'text-muted-foreground'
              )}>
                {it.label}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <TipCard
        title="投递前提醒"
        bullets={[
          '这是 AI 模拟评审,不会真投递到期刊编辑部',
          '提交后会跑 3 位审稿人 + 主审,大约 3-5 分钟完成',
          '完成后可在「我的审稿」查看 4 份报告',
        ]}
      />
    </div>
  );
}

interface ChecklistItem {
  key: string;
  label: string;
  passed: boolean;
}

function buildChecklist(sub: Submission, assets: SubmissionAsset[], agreed: boolean): ChecklistItem[] {
  const hasManuscript = assets.some((a) => a.role === 'manuscript');
  const items: ChecklistItem[] = [
    { key: 'manuscript', label: '已上传稿件正文', passed: hasManuscript },
    { key: 'title', label: '稿件标题已填写', passed: !!sub.title?.trim() },
  ];
  if (sub.mode === 'journal') {
    items.push({
      key: 'target',
      label: sub.journalTarget
        ? `目标期刊已选择 (${sub.journalTarget.canonicalName})`
        : '目标期刊未选 · 将走通用模板',
      passed: true, // journal 选填, 不算未通过 — 只是提示
    });
  } else {
    const t = sub.schoolTarget;
    const ok = !!t?.schoolName?.trim() && !!t?.disciplineField?.trim();
    items.push({
      key: 'target',
      label: ok ? `院校信息已填写 (${t!.schoolName})` : '院校信息未完整',
      passed: ok,
    });
  }
  items.push({
    key: 'letter',
    label: sub.letterBody?.trim() ? '投稿信已确认' : '投稿信将自动生成',
    passed: !!sub.letterBody?.trim(),
  });
  items.push({
    key: 'agreed',
    label: '已同意投递条款',
    passed: agreed,
  });
  return items;
}
