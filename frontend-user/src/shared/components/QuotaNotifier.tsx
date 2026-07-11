// 全局额度通知器(挂在 providers)——
//  · 任一协议拿到 6010/quota_exceeded → 弹「额度已耗尽」重置弹窗(经费够:消耗经费重置 + 自动重置开关;不够:升级/充值)
//  · 每次 AI 用量结束(billing-changed)→ 刷新额度,过半/将尽时弹 toastr(每级每天一次)
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Ticket } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
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
import { localDateKey } from '@/shared/lib/daily-trend';
import { QUOTA_EXCEEDED_EVENT, BILLING_CHANGED_EVENT } from '@/shared/lib/quota-events';
import { useQuotaStore } from '@/stores/quota.store';
import { showQuotaToast } from './quota-toast';

interface Overview {
  tier: string;
  token: { used: number; ceiling: number; percent: number; unlimited: boolean };
  credit: { temp: number; perm: number; total: number };
  reset_cost: number;
}
const KEY = ['settings', 'billing'];

export function QuotaNotifier() {
  const qc = useQueryClient();
  const resetOpen = useQuotaStore((s) => s.resetOpen);
  const openReset = useQuotaStore((s) => s.openReset);
  const closeReset = useQuotaStore((s) => s.closeReset);

  const [code, setCode] = useState('');

  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await http.get<{ data: Overview }>('/user/billing/overview')).data.data,
    enabled: !!getAuthToken(),
    staleTime: 15_000,
    // 跨设备:在别的设备充了会员/重置后,回到本设备(标签页重新聚焦)立即重新核对额度/等级,
    // 让额度显示及时跟上(发送本身走后端真源不受影响,这里修的是「显示滞后」)。
    refetchOnWindowFocus: true,
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
    // 本地日历日(与后端本地零点额度重置对齐);toISOString() 是 UTC,北京 00:00–08:00 会错算成昨天。
    const day = localDateKey();
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

  // 兑换码就地开通 —— **唯一不跳转支付**的开通方式。兑换成功 = tier/经费即时到账,
  // 用户可直接回对话「重新发送」未发送的那条消息(见 claw blocked 轮)。inline 调 http,
  // 不 import features/settings(shared 不可反向依赖 features)。
  const redeem = useMutation({
    mutationFn: async (c: string) => (await http.post('/user/redeem-code', { code: c })).data,
    onSuccess: () => {
      toast.success('兑换成功,已到账');
      setCode('');
      qc.invalidateQueries({ queryKey: KEY });
      closeReset();
    },
    onError: (err) => toast.error(toApiError(err).message || '兑换失败,请检查兑换码'),
  });

  // ⚠️ 绝不 `return null`:resetOpen===true 时卸载 Dialog 会让 Radix body 锁泄漏(全站点击失灵,
  // 见 BodyPointerLockGuard)。改为把 data 闸折进 open prop + 内容用 data 守卫,让 Radix 正常收尾。
  const enough = !!data && data.credit.total >= data.reset_cost;

  return (
    <Dialog open={resetOpen && !!data} onOpenChange={(o) => (o ? openReset() : closeReset())}>
      {data && (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>今日 AI 额度已用完</DialogTitle>
          <DialogDescription>
            {enough ? (
              <>
                额度每日 00:00 自动重置满额。可消耗 <b className="text-foreground">{data.reset_cost}</b> 经费立即重置(当前 {data.credit.total} 经费),或升级会员获更高额度。
              </>
            ) : (
              <>升级会员可获更高额度,或购入科研经费后重置;有兑换码也可在下方立即开通。</>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* 兑换码就地开通(不跳转、不离开当前页)——开完即可回对话一键重发未发送的消息。 */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const c = code.trim();
            if (c && !redeem.isPending) redeem.mutate(c);
          }}
          className="flex items-center gap-2"
        >
          <Ticket className="size-4 shrink-0 text-faint" />
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="输入兑换码立即开通"
            className="h-9 flex-1"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!code.trim() || redeem.isPending}>
            {redeem.isPending ? <Loader2 className="size-3.5 animate-spin" /> : '兑换'}
          </Button>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">稍后再说</Button>
          </DialogClose>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              closeReset();
              window.location.assign('/pricing');
            }}
          >
            升级会员
          </Button>
          {enough ? (
            <Button size="sm" onClick={() => reset.mutate()} disabled={reset.isPending}>
              {reset.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              使用 {data.reset_cost} 经费重置
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                closeReset();
                window.location.assign('/settings/membership');
              }}
            >
              购入经费
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
      )}
    </Dialog>
  );
}
