import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { saveInviteCode } from '@/shared/lib/invite-code';
import { useInviteOpen } from '../api/invite';

/**
 * 邀请落地页 /i/:code —— 无 UI 的中转,进入即:
 *   1. 存码到 localStorage(30 天过期语义,shared/lib/invite-code.ts;
 *      先存后请求 —— 就算 open 计数因网络 / 限流失败,归因也不能丢)
 *   2. POST /invite/open 计一次打开(valid 时的 toast 在 api hook 的
 *      hook 级 onSuccess 里发,导航走人后仍会执行)
 *   3. 立即 navigate('/', replace) —— 已登录用户也一样回首页;
 *      valid:false 同样静默回首页,不吓用户
 */
export function InviteLandingPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { mutate: openInvite } = useInviteOpen();
  // StrictMode 开发态 effect 双跑守卫:同一次进入不能把 open_count +2
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (code) {
      saveInviteCode(code);
      openInvite(code);
    }
    navigate('/', { replace: true });
  }, [code, navigate, openInvite]);

  // 一帧内就 replace 到首页,无需渲染任何内容
  return null;
}

export default InviteLandingPage;
