import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { router } from "./router";
import {
  useInviteCampaign,
  bindInviteCode,
  inviteReasonText,
  INVITE_STATUS_QUERY_KEY,
} from "@/shared/api/invite-campaign";
import {
  AUTH_SUCCESS_EVENT,
  type AuthSuccessEventDetail,
} from "@/shared/lib/auth-events";
import { getAuthToken } from "@/shared/lib/auth-token";
import { toApiError } from "@/shared/lib/http";
import { useAuthDialog } from "@/stores/auth-dialog.store";
import { useInviteCandidate } from "@/stores/invite.store";
import { useAuthStore } from "@/stores/auth.store";
import { usePendingAction } from "@/stores/pending-action.store";
import { PostRegisterInviteDialog } from "@/features/auth/components/PostRegisterInviteDialog";
import { isPhoneDevice } from "@/shared/lib/device";

// 鉴权提供方在极端情况下可能重复发出 success event。按新用户+候选码
// 去重，网络请求未 settle 时不允许第二次 bind；失败后也只允许
// 用户在设置页主动重试，避免 OAuth/StrictMode 重复归因。
const handledNewUserInvites = new Set<string>();
const inviteBindInFlight = new Map<string, Promise<unknown>>();

interface PendingInviteAuth extends AuthSuccessEventDetail {
  inviteDestination?: string;
}

function isInviteDestination(to: string): boolean {
  return to === "/settings/invite" || to === "/m/me/invite";
}

/**
 * 邀请流程的 App 级承接点：
 * - 消费 /i/:code 回首页带回的 query，导航完成后再打开 register；
 * - 只对 is_new_user=true 的鉴权成功自动 bind 候选码；
 * - 新账号没有候选码且本人可领取邀请礼时，给一次补录提示。
 */
export function InviteFlowController() {
  const queryClient = useQueryClient();
  const campaignQ = useInviteCampaign();
  const [pendingAuth, setPendingAuth] = useState<PendingInviteAuth | null>(
    null,
  );
  const [postRegisterOpen, setPostRegisterOpen] = useState(false);
  const [postRegisterDestination, setPostRegisterDestination] =
    useState("/settings/invite");
  const handledLocation = useRef("");

  useEffect(() => {
    const onAuthSuccess = (event: Event) => {
      const detail = (event as CustomEvent<AuthSuccessEventDetail>).detail;
      if (!detail) return;
      // OAuth email 冲突时，用户需先在 callback 页的弹层登录目标账号。
      // 这次登录只是 confirm-merge 的身份校验：候选码保留，
      // 也不能导航离开携带 merge_token 的页面。合并完成会再发正常事件。
      if (detail.suppressInviteFlow) return;
      const pendingAction = usePendingAction.getState().pending;
      const inviteDestination =
        pendingAction?.type === "navigate" &&
        isInviteDestination(pendingAction.to)
          ? pendingAction.to
          : undefined;
      if (inviteDestination) usePendingAction.getState().consume();
      setPendingAuth({ ...detail, inviteDestination });
    };
    window.addEventListener(AUTH_SUCCESS_EVENT, onAuthSuccess);
    return () => window.removeEventListener(AUTH_SUCCESS_EVENT, onAuthSuccess);
  }, []);

  useEffect(() => {
    if (!pendingAuth || !campaignQ.data) return;
    setPendingAuth(null);
    if (useAuthStore.getState().user?.id !== pendingAuth.userId) return;
    if (!campaignQ.data.enabled) {
      useInviteCandidate.getState().clear();
      setPostRegisterOpen(false);
      return;
    }

    const candidate = useInviteCandidate.getState().candidate;
    const code = candidate?.code;
    const destination = pendingAuth.inviteDestination;

    if (!pendingAuth.isNewUser) {
      // 老账号不做静默归因；但从邀请链接切到“登录”后，
      // 需把已保留的候选码送到设置页让本人明确确认。
      if (code) {
        const target =
          destination ||
          (isPhoneDevice() ? "/m/me/invite" : "/settings/invite");
        void router.navigate(`${target}?bind=1`);
      } else if (destination) {
        void router.navigate(destination);
      }
      return;
    }

    // 顶栏的匿名“邀请有礼”有明确落点：注册成功先进邀请页。
    // 无候选码的新用户仍会在该页上方看到补录 dialog，关闭后留在“邀请好友”区。
    if (destination) void router.navigate(destination);

    const authKey = `${pendingAuth.userId}:${code || "no-code"}`;
    if (handledNewUserInvites.has(authKey) || inviteBindInFlight.has(authKey))
      return;
    handledNewUserInvites.add(authKey);

    if (!code) {
      setPostRegisterDestination(
        destination || (isPhoneDevice() ? "/m/me/invite" : "/settings/invite"),
      );
      // 注册后提示只以当前用户的受邀礼为理由；若本人无奖励，
      // 不用“邀请礼”弹窗打扰新用户，仍可在设置页主动关联。
      setPostRegisterOpen(campaignQ.data.invitee_registration_credits > 0);
      return;
    }

    const request = bindInviteCode(code)
      .then(({ status, rewards }) => {
        if (useAuthStore.getState().user?.id !== pendingAuth.userId) return;
        void queryClient.invalidateQueries({
          queryKey: INVITE_STATUS_QUERY_KEY,
        });
        void queryClient.invalidateQueries({
          queryKey: ["settings", "invite"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["settings", "billing"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["settings", "billing", "txns"],
        });
        // 服务端已经给出确定结果，不让候选码继续污染后续账号。
        if (useInviteCandidate.getState().candidate?.code === code) {
          useInviteCandidate.getState().clear();
        }
        if (status.bound) {
          const inviteeGift = rewards?.invitee_registration_credits ?? 0;
          toast.success(
            inviteeGift > 0
              ? `邀请关联成功，已获得 ${inviteeGift} 经费`
              : "邀请关联成功",
          );
        } else if (status.reason) {
          toast.info(inviteReasonText(status.reason, "该邀请码无法关联"));
        }
      })
      .catch((error) => {
        if (useAuthStore.getState().user?.id !== pendingAuth.userId) return;
        const apiError = toApiError(error);
        const retryable = apiError.isNetworkError || apiError.status >= 500;
        if (retryable) {
          // 断网 / 5xx 时保留候选，但不在 auth event 里自动重试。
          toast.info("邀请码已保留，可稍后在“邀请好友”中确认");
          return;
        }
        // invalid / self / expired / already-bound 等确定性 4xx 不能继续污染后续请求。
        if (useInviteCandidate.getState().candidate?.code === code) {
          useInviteCandidate.getState().clear();
        }
        toast.info(apiError.message || "该邀请码无法关联");
      })
      .finally(() => {
        if (inviteBindInFlight.get(authKey) === request) {
          inviteBindInFlight.delete(authKey);
        }
      });
    inviteBindInFlight.set(authKey, request);
  }, [campaignQ.data, pendingAuth, queryClient]);

  useEffect(() => {
    if (campaignQ.data?.enabled === false) {
      useInviteCandidate.getState().clear();
      setPendingAuth(null);
      setPostRegisterOpen(false);
    } else if (campaignQ.data?.enabled) {
      // /i 首屏先用 30 天兜底；campaign 到达后按活动真实绑定时窗校正。
      useInviteCandidate
        .getState()
        .setBindWindowDays?.(campaignQ.data.bind_window_days);
    }
  }, [campaignQ.data]);

  useEffect(() => {
    if (!campaignQ.data && !campaignQ.isError) return;

    const consume = () => {
      const location = router.state.location;
      const params = new URLSearchParams(location.search);
      if (params.get("invite") !== "register") return;
      const signature = `${location.pathname}?${params.toString()}`;
      if (handledLocation.current === signature) return;
      handledLocation.current = signature;

      params.delete("invite");
      if (campaignQ.data?.enabled === false) {
        void router.navigate(
          {
            pathname: location.pathname,
            search: params.toString() ? `?${params}` : "",
          },
          { replace: true },
        );
        return;
      }

      if (getAuthToken()) {
        // 老账号绝不静默绑定，只把候选码带到设置页让用户点确认。
        void router.navigate("/settings/invite?bind=1", { replace: true });
        return;
      }

      void router
        .navigate(
          {
            pathname: location.pathname,
            search: params.toString() ? `?${params}` : "",
          },
          { replace: true },
        )
        .then(() => useAuthDialog.getState().openDialog("register"));
    };

    consume();
    return router.subscribe(consume);
  }, [campaignQ.data, campaignQ.isError]);

  if (!campaignQ.data?.enabled) return null;

  return (
    <PostRegisterInviteDialog
      open={postRegisterOpen}
      campaign={campaignQ.data}
      onOpenChange={setPostRegisterOpen}
      onFillCode={() => {
        setPostRegisterOpen(false);
        void router.navigate(`${postRegisterDestination}?bind=1`);
      }}
    />
  );
}
