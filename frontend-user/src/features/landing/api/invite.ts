// 邀请落地 —— 打开计数。mirrors backend/internal/invite(POST /api/v1/invite/open,公开+限流)。
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { http } from '@/shared/lib/http';
import { clearInviteCode } from '@/shared/lib/invite-code';

// mirrors backend/internal/invite 响应:data:{valid:boolean}。
// 码不存在时后端也回 200 + valid:false(刻意不报 4xx,防探测噪音)。
export interface InviteOpenResult {
  valid: boolean;
}

/**
 * 打开邀请链接计一次数(后端 open_count 原子 +1)。
 *
 * 副作用(toast / 清码)收在 **hook 级** onSuccess:落地页发完请求立即
 * navigate 走人,页面 unmount 后 mutate 级回调不会执行,而 mutation options
 * 级回调仍会跑 —— 放错层级 = toast 永远不出现。
 * onError 刻意缺席:公开限流端点,网络失败 / 429 一律静默(计数是 best-effort,
 * 码已先存进 localStorage,归因不受影响)。
 */
export function useInviteOpen() {
  return useMutation({
    mutationFn: async (code: string) =>
      (await http.post<{ data: InviteOpenResult }>('/invite/open', { code })).data.data,
    onSuccess: (data) => {
      if (data.valid) {
        toast.success('邀请已生效,注册后自动关联');
      } else {
        // 码不存在:静默清掉本地暂存,别让垃圾码跟着 X-Invite-Code 头跑 30 天
        clearInviteCode();
      }
    },
  });
}
