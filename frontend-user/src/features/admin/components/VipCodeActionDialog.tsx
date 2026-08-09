import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import {
  GRANT_UNITS,
  GRANT_UNIT_LABEL,
  formatGrantDuration,
  maxGrantAmount,
  normGrantUnit,
  type GrantUnit,
} from '@/shared/lib/grant-unit';
import {
  useExtendVipCode,
  useIncreaseVipCodeUses,
  useSetVipCodeGrantDays,
  type VipCode,
} from '../api/vip-codes';
import { useApiToast } from '../hooks/useApiToast';

type ActionOp = 'extend' | 'uses' | 'grant_days';

export interface VipCodeActionState {
  code: VipCode;
  op: ActionOp;
  value: number;
  unit: GrantUnit;
}

export function createVipCodeAction(
  code: VipCode,
  op: ActionOp,
): VipCodeActionState {
  return {
    code,
    op,
    value:
      op === 'extend' ? 30 : op === 'grant_days' ? code.grant_days || 30 : 10,
    unit: op === 'grant_days' ? normGrantUnit(code.grant_unit) : 'day',
  };
}

export function VipCodeActionDialog({
  action,
  onActionChange,
}: {
  action: VipCodeActionState | null;
  onActionChange: (action: VipCodeActionState | null) => void;
}) {
  const extend = useExtendVipCode();
  const increaseUses = useIncreaseVipCodeUses();
  const setGrantDays = useSetVipCodeGrantDays();
  const apiToast = useApiToast();
  const pending =
    extend.isPending || increaseUses.isPending || setGrantDays.isPending;

  const update = (patch: Partial<VipCodeActionState>) => {
    if (action) onActionChange({ ...action, ...patch });
  };

  const submit = async () => {
    if (!action) return;
    if (!Number.isFinite(action.value) || action.value < 1) return;
    const amount = Math.max(1, Number(action.value) || 1);
    const call =
      action.op === 'extend'
        ? extend.mutateAsync({ id: action.code.id, days: amount })
        : action.op === 'grant_days'
          ? setGrantDays.mutateAsync({
              id: action.code.id,
              days: Math.min(amount, maxGrantAmount(action.unit)),
              unit: action.unit,
            })
          : increaseUses.mutateAsync({ id: action.code.id, add: amount });
    const success =
      action.op === 'extend'
        ? '已续期'
        : action.op === 'grant_days'
          ? '已修改会员时长'
          : '已加次数';
    const result = await apiToast(call, { success, failure: '操作失败' }).catch(
      () => null,
    );
    if (result) onActionChange(null);
  };

  return (
    <Dialog
      open={!!action}
      onOpenChange={(open) => !open && onActionChange(null)}
    >
      {action && (
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {action.op === 'extend'
                ? '续期 · 延长有效期'
                : action.op === 'grant_days'
                  ? '修改会员时长'
                  : '增加可兑换次数'}
            </DialogTitle>
            <DialogDescription className="break-all">
              兑换码{' '}
              <span className="font-mono text-foreground">
                {action.code.code}
              </span>
              {action.op === 'extend'
                ? ` · 当前有效期至 ${action.code.valid_until?.slice(0, 10) || '永久'}（已过期则从今天起算）`
                : action.op === 'grant_days'
                  ? ` · 当前授予 ${formatGrantDuration(action.code.grant_days, action.code.grant_unit)}，修改只影响之后的兑换`
                  : ` · 当前 ${action.code.used_count}/${Math.max(1, action.code.max_uses)} 次`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 py-1">
            <Label className="text-12 text-faint">
              {action.op === 'extend'
                ? '延长天数'
                : action.op === 'grant_days'
                  ? '会员时长'
                  : '增加次数'}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={
                  action.op === 'grant_days'
                    ? maxGrantAmount(action.unit)
                    : undefined
                }
                value={Number.isFinite(action.value) ? action.value : ''}
                onChange={(event) => {
                  const parsed =
                    event.target.value === ''
                      ? Number.NaN
                      : Number(event.target.value);
                  const amount = Number.isFinite(parsed)
                    ? Math.max(1, parsed)
                    : parsed;
                  update({
                    value:
                      action.op === 'grant_days'
                        ? Math.min(amount, maxGrantAmount(action.unit))
                        : amount,
                  });
                }}
                className="h-8 w-32"
                autoFocus
              />
              {action.op === 'grant_days' && (
                <Select
                  value={action.unit}
                  onChange={(event) => {
                    const unit = normGrantUnit(event.target.value);
                    update({
                      unit,
                      value: Math.min(action.value, maxGrantAmount(unit)),
                    });
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
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onActionChange(null)}>
              取消
            </Button>
            <Button
              onClick={submit}
              disabled={pending || !Number.isFinite(action.value) || action.value < 1}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
