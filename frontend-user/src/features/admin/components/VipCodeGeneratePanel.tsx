import { useState } from 'react';
import { Gift, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { cn } from '@/shared/lib/utils';
import {
  GRANT_UNITS,
  GRANT_UNIT_LABEL,
  maxGrantAmount,
  normGrantUnit,
  type GrantUnit,
} from '@/shared/lib/grant-unit';
import { useGenerateVipCodes } from '../api/vip-codes';
import { useApiToast } from '../hooks/useApiToast';

const TIER_LABEL: Record<string, string> = { pro: 'Pro', max: 'Max' };

/** 授予数量夹到当前单位上界，避免切换单位后表单所见与后端所发不一致。 */
const clampAmount = (value: number, unit: GrantUnit) =>
  Math.min(maxGrantAmount(unit), Math.max(1, Number(value) || 1));

export function VipCodeGeneratePanel({
  onGenerated,
}: {
  onGenerated: (batchId: string) => void;
}) {
  const [count, setCount] = useState(10);
  const [kind, setKind] = useState<'tier' | 'credit'>('tier');
  const [tier, setTier] = useState('pro');
  const [grantAmount, setGrantAmount] = useState(30);
  const [grantUnit, setGrantUnit] = useState<GrantUnit>('day');
  const [credits, setCredits] = useState(500);
  const [maxUses, setMaxUses] = useState(1);
  const [validDays, setValidDays] = useState(7);
  const [note, setNote] = useState('');
  const generate = useGenerateVipCodes();
  const apiToast = useApiToast();

  const submit = async () => {
    const common = {
      count,
      max_uses: maxUses,
      valid_days: validDays,
      note: note || undefined,
    };
    const payload =
      kind === 'credit'
        ? {
            ...common,
            grant_kind: 'credit',
            grant_credits: credits,
            credit_kind: 'perm',
            credit_validity_days: 30,
          }
        : {
            ...common,
            grant_kind: 'tier',
            tier,
            grant_days: grantAmount,
            grant_unit: grantUnit,
          };

    const result = await apiToast(generate.mutateAsync(payload), {
      success: `已生成 ${count} 个兑换码`,
      failure: '生成失败',
    }).catch(() => null);
    if (result?.batch_id) onGenerated(result.batch_id);
  };

  return (
    <section className="mb-4 rounded-16 border border-border bg-surface-card p-4">
      <div className="mb-3">
        <h3 className="flex items-center gap-2 text-14 font-medium text-foreground">
          <Gift className="size-4" /> 生成新批次
        </h3>
        <p className="mt-1 text-12 text-faint">
          每次生成都会创建一个独立批次，可随时回看、复制和导出。
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="数量">
          <Input
            type="number"
            min={1}
            max={1000}
            value={count}
            onChange={(event) =>
              setCount(
                Math.min(1000, Math.max(1, Number(event.target.value) || 1)),
              )
            }
            className="h-8 w-24"
          />
        </Field>
        <Field label="发放类型">
          <Select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as 'tier' | 'credit')
            }
            fullWidth={false}
            className="w-24"
          >
            <option value="tier">会员</option>
            <option value="credit">经费</option>
          </Select>
        </Field>

        {kind === 'tier' ? (
          <>
            <Field label="等级">
              <Select
                value={tier}
                onChange={(event) => setTier(event.target.value)}
                fullWidth={false}
                className="w-24"
              >
                <option value="pro">{TIER_LABEL.pro}</option>
                <option value="max">{TIER_LABEL.max}</option>
              </Select>
            </Field>
            <Field label="授予时长">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={maxGrantAmount(grantUnit)}
                  value={grantAmount}
                  onChange={(event) =>
                    setGrantAmount(
                      clampAmount(Number(event.target.value), grantUnit),
                    )
                  }
                  className="h-8 w-20"
                />
                <Select
                  value={grantUnit}
                  onChange={(event) => {
                    const next = normGrantUnit(event.target.value);
                    setGrantUnit(next);
                    setGrantAmount((value) => clampAmount(value, next));
                  }}
                  fullWidth={false}
                  className="w-20"
                >
                  {GRANT_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {GRANT_UNIT_LABEL[unit]}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
          </>
        ) : (
          <Field label="经费数">
            <Input
              type="number"
              min={1}
              value={credits}
              onChange={(event) =>
                setCredits(Math.max(1, Number(event.target.value) || 1))
              }
              className="h-8 w-24"
            />
          </Field>
        )}

        <Field label="每码兑换次数">
          <Input
            type="number"
            min={1}
            max={100}
            value={maxUses}
            onChange={(event) =>
              setMaxUses(
                Math.min(100, Math.max(1, Number(event.target.value) || 1)),
              )
            }
            className="h-8 w-24"
          />
        </Field>
        <Field label="兑换码有效天数">
          <Input
            type="number"
            min={1}
            max={30}
            value={validDays}
            onChange={(event) =>
              setValidDays(
                Math.min(30, Math.max(1, Number(event.target.value) || 1)),
              )
            }
            className="h-8 w-24"
          />
        </Field>
        <Field label="批次备注">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="用途 / 渠道 / 客户"
            className="h-8 w-40"
          />
        </Field>
        <Button onClick={submit} disabled={generate.isPending || count < 1}>
          {generate.isPending && <Loader2 className="size-4 animate-spin" />}
          生成批次
        </Button>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-12 text-faint">{label}</Label>
      {children}
    </div>
  );
}
