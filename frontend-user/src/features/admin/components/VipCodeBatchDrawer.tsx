import { useState } from 'react';
import { Copy, FileSpreadsheet, Loader2, PackageOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { formatGrantDuration } from '@/shared/lib/grant-unit';
import { useVipCodeBatch, type VipCodeBatch } from '../api/vip-codes';
import {
  buildVipCodeCopyText,
  exportVipCodeBatchToExcel,
  resolveCodeSeparator,
  type CodeSeparatorInput,
} from '../vip-code-export';
import { CopyableId } from './CopyableId';
import { TimeCell } from './TimeCell';
import { VipCodeBatchCodeTable } from './VipCodeBatchCodeTable';

const TIER_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  max: 'Max',
};

export function VipCodeBatchDrawer({
  batchId,
  open,
  onOpenChange,
}: {
  batchId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useVipCodeBatch(batchId, open);
  const [separatorKind, setSeparatorKind] =
    useState<CodeSeparatorInput['kind']>('newline');
  const [customSeparator, setCustomSeparator] = useState('');
  const [exporting, setExporting] = useState(false);
  const batch = detail.data?.batch;
  const codes = detail.data?.codes ?? [];

  const separatorInput: CodeSeparatorInput = {
    kind: separatorKind,
    custom: customSeparator,
  };

  const copyAll = async () => {
    if (codes.length === 0) return;
    const text = buildVipCodeCopyText(
      codes,
      resolveCodeSeparator(separatorInput),
    );
    const copied = await copyToClipboard(text);
    if (copied) toast.success(`已复制该批次 ${codes.length} 个兑换码`);
    else toast.error('复制失败，请重试或手动复制');
  };

  const exportExcel = async () => {
    if (!batch || codes.length === 0) return;
    setExporting(true);
    try {
      await exportVipCodeBatchToExcel(batch, codes);
      toast.success(`已导出 ${codes.length} 个兑换码`);
    } catch {
      toast.error('Excel 导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Sheet open={open && !!batchId} onOpenChange={onOpenChange}>
      {batchId && (
        <SheetContent className="gap-0 sm:max-w-4xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <PackageOpen className="size-4 text-brand-green" />
              兑换码批次
              {detail.isFetching && (
                <Loader2 className="size-3 animate-spin text-faint" />
              )}
            </SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-2">
              <span>批次号</span>
              <CopyableId
                value={batchId}
                label="批次号"
                className="font-mono text-12 text-foreground"
              />
              {batch?.note && <span>· {batch.note}</span>}
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
            {batch && <BatchOverview batch={batch} />}

            <section className="mb-4 rounded-12 border border-border bg-surface-card p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-14 font-medium text-foreground">
                    批量分发
                  </h3>
                  <p className="mt-1 text-12 text-faint">
                    复制和导出始终包含整个批次，不受下方分页影响。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={separatorKind}
                    onChange={(event) =>
                      setSeparatorKind(
                        event.target.value as CodeSeparatorInput['kind'],
                      )
                    }
                    fullWidth={false}
                    className="w-28"
                    aria-label="复制分隔符"
                  >
                    <option value="newline">换行</option>
                    <option value="comma">英文逗号</option>
                    <option value="chinese-comma">中文逗号</option>
                    <option value="space">空格</option>
                    <option value="tab">Tab</option>
                    <option value="custom">自定义</option>
                  </Select>
                  {separatorKind === 'custom' && (
                    <Input
                      value={customSeparator}
                      onChange={(event) =>
                        setCustomSeparator(event.target.value)
                      }
                      placeholder="如 | 或 ;"
                      aria-label="自定义分隔符"
                      className="h-8 w-28"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyAll}
                    disabled={codes.length === 0}
                  >
                    <Copy className="size-4" /> 复制全部
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportExcel}
                    disabled={!batch || codes.length === 0 || exporting}
                  >
                    {exporting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="size-4" />
                    )}
                    导出 Excel
                  </Button>
                </div>
              </div>

              <div className="rounded-8 bg-surface-1 px-3 py-2 font-mono text-12 text-subtle">
                {codes.length > 0
                  ? `共 ${codes.length} 个兑换码 · 当前分隔符：${separatorLabel(separatorInput)}`
                  : detail.isLoading
                    ? '正在读取整批兑换码…'
                    : '暂无可复制的兑换码'}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-14 font-medium text-foreground">
                  批次明细
                </h3>
                <span className="text-12 text-faint">
                  每页 50 条 · 共 {codes.length} 条
                </span>
              </div>
              <VipCodeBatchCodeTable
                batchId={batchId}
                codes={detail.data?.codes}
                loading={detail.isLoading}
                error={detail.error}
                onRetry={() => void detail.refetch()}
              />
            </section>
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}

function BatchOverview({ batch }: { batch: VipCodeBatch }) {
  return (
    <section className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-12">
        <BatchGrantBadge batch={batch} />
        {batch.mixed && (
          <Badge variant="warning">
            混合配置 · {batch.config_variant_count} 种
          </Badge>
        )}
        <TimeCell
          value={batch.created_at}
          prefix="生成于 "
          className="text-12"
        />
      </div>
      {batch.mixed && (
        <p className="rounded-8 bg-amber-soft px-3 py-2 text-12 text-subtle">
          该批次的部分兑换码曾被单独修改，发放内容或时长已不完全一致，请以明细为准。
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Stat label="码数" value={batch.code_count} />
        <Stat label="可兑换" value={batch.available_count} tone="success" />
        <Stat label="已用完" value={batch.exhausted_count} />
        <Stat label="已过期" value={batch.expired_count} />
        <Stat label="已停用" value={batch.revoked_count} tone="danger" />
        <Stat
          label="兑换次数"
          value={`${batch.total_used_count}/${batch.total_max_uses}`}
        />
      </div>
    </section>
  );
}

function BatchGrantBadge({ batch }: { batch: VipCodeBatch }) {
  if (batch.mixed) return <Badge variant="muted">具体配置见明细</Badge>;
  if (batch.grant_kind === 'credit') {
    return <Badge variant="muted">永久经费 {batch.grant_credits}</Badge>;
  }
  return (
    <Badge variant="default">
      {TIER_LABEL[batch.grant_tier] ?? batch.grant_tier} ·{' '}
      {formatGrantDuration(batch.grant_days, batch.grant_unit)}
    </Badge>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className="rounded-12 border border-border bg-surface-card px-3 py-2">
      <p className="text-12 text-faint">{label}</p>
      <p
        className={
          tone === 'success'
            ? 'mt-1 text-16 font-medium text-brand-green'
            : tone === 'danger'
              ? 'mt-1 text-16 font-medium text-brand-red'
              : 'mt-1 text-16 font-medium text-foreground'
        }
      >
        {value}
      </p>
    </div>
  );
}

function separatorLabel(input: CodeSeparatorInput): string {
  const labels: Record<
    Exclude<CodeSeparatorInput['kind'], 'custom'>,
    string
  > = {
    newline: '换行',
    comma: '英文逗号',
    'chinese-comma': '中文逗号',
    space: '空格',
    tab: 'Tab',
  };
  if (input.kind !== 'custom') return labels[input.kind];
  return input.custom ? `自定义「${input.custom}」` : '换行（自定义未填写）';
}
