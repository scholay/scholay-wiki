// 全局额度通知器(挂在 providers)——
//  · 任一协议拿到 6010/quota_exceeded → 弹「额度已耗尽」重置弹窗(经费够:消耗经费重置 + 自动重置开关;不够:升级/充值)
//  · 每次 AI 用量结束(billing-changed)→ 刷新额度,过半/将尽时弹 toastr(每级每天一次)
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Switch } from '@/shared/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/shared/ui/dialog';
import { toast } from 'sonner';
import { http, toApiError } from '@/shared/lib/http';
import { getAuthToken } from '@/shared/lib/auth-token';
import { QUOTA_EXCEEDED_EVENT, BILLING_CHANGED_EVENT } from '@/shared/lib/quota-events';
import { useQuotaStore } from '@/stores/quota.store';
import { showQuotaToast } from './quota-toast';

interface Overview {
  tier: string;
  token: { used: number; ceiling: number; percent: number; unlimited: boolean };
  credit: { temp: number; perm: number; total: number };
  auto_reset: boolean;
  reset_cost: number;
}
const KEY = ['settings', 'billing'];

export function QuotaNotifier() {
  const qc = useQueryClient();
  const resetOpen = useQuotaStore((s) => s.resetOpen);
  const openReset = useQuotaStore((s) => s.openReset);
  const closeReset = useQuotaStore((s) => s.closeReset);

  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await http.get<{ data: Overview }>('/user/billing/overview')).data.data,
    enabled: !!getAuthToken(),
    staleTime: 15_000,
  });

  // 6010 / quota_exceeded → 弹重置弹窗 + 刷新额度;billing-changed → 刷新额度(触发阈值 toastr)
  useEffect(() => {
    const onExceeded = () => {
      openReset();
      qc.invalidateQueries({ queryKey: KEY });
    };
    const onChanged = () => qc.invalidateQueries({ queryKey: KEY });
    window.addEventListener(QUOTA_EXCEEDED_EVENT, onExceeded);
    window.addEventListener(BILLING_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(QUOTA_EXCEEDED_EVENT, onExceeded);
      window.removeEventListener(BILLING_CHANGED_EVENT, onChanged);
    };
  }, [openReset, qc]);

  // 阈值 toastr:过半(>=50%)/ 将尽(>=80%),每级每天只弹一次
  useEffect(() => {
    if (!data || data.token.unlimited || data.token.ceiling <= 0) return;
    const day = new Date().toISOString().slice(0, 10);
    const s = useQuotaStore.getState();
    const level = s.warnDay === day ? s.warnLevel : 0;
    const pct = data.token.percent;
    if (pct >= 80 && level < 2) {
      showQuotaToast('almost');
      s.markWarn(day, 2);
    } else if (pct >= 50 && level < 1) {
      showQuotaToast('half');
      s.markWarn(day, 1);
    }
  }, [data]);

  const reset = useMutation({
    mutationFn: async () => (await http.post('/user/billing/reset')).data,
    onSuccess: () => {
      showQuotaToast('reset');
      qc.invalidateQueries({ queryKey: KEY });
      closeReset();
    },
    onError: (err) => toast.error(toApiError(err).message || '重置失败'),
  });
  const setAuto = useMutation({
    mutationFn: async (enabled: boolean) => (await http.put('/user/billing/auto-reset', { enabled })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  if (!data) return null;
  const enough = data.credit.total >= data.reset_cost;

  return (
    <Dialog open={resetOpen} onOpenChange={(o) => (o ? openReset() : closeReset())}>
      <DialogContent>
        {enough ? (
          <>
            <DialogHeader>
              <DialogTitle>您今日科研额度已耗尽</DialogTitle>
              <DialogDescription>
                额度每日 00:00 自动重置满额。您也可以消耗 <b className="text-foreground">{data.reset_cost}</b> 经费立即重置(当前 {data.credit.total} 经费)。
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between rounded-md border border-border bg-surface-1 p-3">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-subtle">自动消耗经费重置额度</span>
                <span className="text-2xs text-faint">额度耗尽时自动消耗 {data.reset_cost} 经费</span>
              </div>
              <Switch checked={data.auto_reset} disabled={setAuto.isPending} onCheckedChange={(v) => setAuto.mutate(v)} />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" size="sm">稍后再说</Button>
              </DialogClose>
              <Button size="sm" onClick={() => reset.mutate()} disabled={reset.isPending}>
                {reset.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                使用 {data.reset_cost} 经费重置
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>当前没有可用于重置额度的经费</DialogTitle>
              <DialogDescription>请选择更高的订阅套餐,或购入科研经费后再试。</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { closeReset(); window.location.assign('/pricing'); }}>
                升级订阅套餐
              </Button>
              <Button size="sm" onClick={() => { closeReset(); window.location.assign('/settings/membership'); }}>
                购入科研经费
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
