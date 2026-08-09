import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { previewInviteCode } from '@/shared/api/invite-campaign';
import { getAuthToken } from '@/shared/lib/auth-token';
import { useInviteCandidate } from '@/stores/invite.store';
import { recordInviteOpen } from '../api/invite';

interface LandingInviteTask {
  preview: Promise<Awaited<ReturnType<typeof previewInviteCode>> | null>;
  settled: Promise<void>;
}

/**
 * React StrictMode 会重复订阅 effect。请求按码共享，让一次落地只记一次
 * open；preview 的结果由共享 task 投影到 store，投影前再比对当前
 * candidate，避免 A 码的迟到结果覆盖用户后来输入的 B 码。
 */
const landingInviteTasks = new Map<string, LandingInviteTask>();

function getLandingInviteTask(code: string): LandingInviteTask {
  const existing = landingInviteTasks.get(code);
  if (existing) return existing;

  const open = recordInviteOpen(code).catch(() => undefined);
  const preview = previewInviteCode(code).catch(() => null);
  const task: LandingInviteTask = {
    preview,
    settled: Promise.allSettled([preview, open]).then(() => undefined),
  };
  landingInviteTasks.set(code, task);

  void preview.then((result) => {
    if (!result || useInviteCandidate.getState().candidate?.code !== code) return;
    if (result.valid) {
      const bindWindowDays = result.campaign?.bind_window_days;
      if (bindWindowDays) {
        useInviteCandidate
          .getState()
          .confirm(result.code || code, result.inviter_name, bindWindowDays);
      } else {
        useInviteCandidate.getState().confirm(result.code || code, result.inviter_name);
      }
    } else {
      useInviteCandidate.getState().clear();
    }
  });

  // 只缓存 in-flight：消除同一次路由/StrictMode 的重复请求，
  // 后续真实再次打开同码链接仍会记一次 open。
  void task.settled.finally(() => {
    if (landingInviteTasks.get(code) === task) landingInviteTasks.delete(code);
  });
  return task;
}

/**
 * 邀请落地页 /i/:code:先捕获候选码，并发 preview + open，再带
 * `?invite=register` 回首页。鉴权弹窗由 App 级 InviteFlowController 在导航
 * 完成后打开，避免被“路由变化关闭全局弹窗”的守卫立刻收起。
 */
export function InviteLandingPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const capture = useInviteCandidate((s) => s.capture);

  useEffect(() => {
    let active = true;
    const normalized = code?.trim().toUpperCase();
    if (!normalized) {
      queueMicrotask(() => {
        if (active) navigate('/', { replace: true });
      });
      return () => {
        active = false;
      };
    }
    capture(normalized);
    getLandingInviteTask(normalized);

    // 将导航放入微任务：StrictMode 第一轮 effect 会先 cleanup，只有当前
    // active 订阅能执行导航；网络请求不会阻塞落地页跳转。
    queueMicrotask(() => {
      if (!active) return;
      navigate(
        getAuthToken() ? '/settings/invite?bind=1' : '/?invite=register',
        { replace: true },
      );
    });

    return () => {
      active = false;
    };
  }, [capture, code, navigate]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <BrandLogo size="md" />
      <Loader2 className="size-5 animate-spin text-faint" />
      <div>
        <p className="text-14 font-medium text-foreground">正在确认好友邀请…</p>
        <p className="mt-1 text-12 text-faint">稍后将为你打开注册</p>
      </div>
    </div>
  );
}

export default InviteLandingPage;
