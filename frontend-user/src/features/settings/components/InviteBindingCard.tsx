import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Gift,
  Loader2,
  TicketCheck,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button, Input } from "@/shared/ui";
import {
  inviteReasonText,
  useBindInvite,
  useInviteCampaign,
  useInviteStatus,
} from "@/shared/api/invite-campaign";
import { useInviteCandidate } from "@/stores/invite.store";
import { toApiError } from "@/shared/lib/http";

/** PC / mobile 设置页共用：只处理“我是被邀请人”的主动关联。 */
export function InviteBindingCard() {
  const { data: campaign } = useInviteCampaign();
  const statusQ = useInviteStatus(campaign?.enabled === true);
  const bind = useBindInvite();
  const candidate = useInviteCandidate((s) => s.candidate);
  const clearCandidate = useInviteCandidate((s) => s.clear);
  const [code, setCode] = useState(candidate?.code ?? "");
  const persistedCodeRef = useRef(candidate?.code);
  const editingRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    persistedCodeRef.current = candidate?.code;
    if (!editingRef.current) setCode(candidate?.code ?? "");
  }, [candidate?.code]);
  useEffect(() => {
    const status = statusQ.data;
    if (!status || (!status.bound && status.eligible)) return;
    if (persistedCodeRef.current) {
      persistedCodeRef.current = undefined;
      clearCandidate();
    }
  }, [clearCandidate, statusQ.data]);
  useEffect(() => {
    if (searchParams.get("bind") !== "1") return;
    const next = new URLSearchParams(searchParams);
    next.delete("bind");
    setSearchParams(next, { replace: true });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [searchParams, setSearchParams]);

  if (!campaign?.enabled) return null;

  const inviteeGift = campaign.invitee_registration_credits;
  const status = statusQ.data;

  const submit = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      toast.error("请输入邀请码");
      inputRef.current?.focus();
      return;
    }
    try {
      const result = await bind.mutateAsync(normalized);
      if (persistedCodeRef.current === normalized) {
        persistedCodeRef.current = undefined;
        clearCandidate();
      }
      if (result.status.bound) {
        const gift = result.rewards?.invitee_registration_credits ?? 0;
        toast.success(
          gift > 0 ? `关联成功，已获得 ${gift} 经费` : "邀请关联成功",
        );
      } else {
        toast.info(inviteReasonText(result.status.reason));
      }
    } catch (error) {
      const apiError = toApiError(error);
      const retryable = apiError.isNetworkError || apiError.status >= 500;
      if (!retryable && persistedCodeRef.current === normalized) {
        persistedCodeRef.current = undefined;
        clearCandidate();
      }
      toast.error(apiError.message || "关联失败，请检查邀请码");
    }
  };

  if (status?.bound) {
    const claimedCredits = status.invitee_rewarded_credits ?? 0;
    const claimed = claimedCredits > 0;
    return (
      <section className="rounded-12 border border-brand-green/30 bg-brand-green/5 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-8 bg-brand-green/10 text-brand-green">
            <CheckCircle2 className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-14 font-medium text-brand-green">
              {claimed ? "邀请礼已领取" : "邀请关系已建立"}
            </h3>
            <p className="truncate text-12 text-muted-foreground">
              {status.inviter_name
                ? `已关联 ${status.inviter_name}`
                : "邀请关联已生效"}
              {claimed ? ` · +${claimedCredits} 经费` : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-pill bg-brand-green/10 px-2.5 py-1 text-12 font-medium text-brand-green">
            {claimed ? "已领取" : "已关联"}
          </span>
        </div>
      </section>
    );
  }

  // 已超过邀请码关联期时不再展示入口，也不为失效状态保留页面占位。
  if (status && !status.eligible) return null;

  return (
    <section className="rounded-12 border border-border-hairline bg-surface-1 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-8 bg-brand-green/10 text-brand-green">
          <TicketCheck className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-14 font-medium text-foreground">
            {inviteeGift > 0 ? "填写邀请码，领取邀请礼" : "填写好友邀请码"}
          </h3>
          {inviteeGift > 0 && (
            <p className="text-12 font-medium tabular-nums text-brand-green">
              +{inviteeGift} 经费
            </p>
          )}
        </div>
        {campaign.code_help_url && (
          <a
            href={campaign.code_help_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-12 text-faint hover:text-foreground hover:underline"
          >
            获取邀请码
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      {statusQ.isLoading ? (
        <div className="mt-2 flex h-8 items-center gap-2 text-12 text-faint">
          <Loader2 className="size-3.5 animate-spin" />
          正在查询关联状态…
        </div>
      ) : statusQ.isError ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-8 bg-surface-card px-3 py-2">
          <p className="text-12 text-faint">关联状态加载失败。</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => void statusQ.refetch()}
          >
            重试
          </Button>
        </div>
      ) : (
        <div className="mt-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={inputRef}
              value={code}
              onChange={(event) => {
                const next = event.target.value.toUpperCase();
                if (!editingRef.current) {
                  editingRef.current = true;
                  if (persistedCodeRef.current) {
                    persistedCodeRef.current = undefined;
                    clearCandidate();
                  }
                }
                setCode(next);
              }}
              maxLength={16}
              placeholder="输入邀请码"
              className="h-10 min-w-0 flex-1 font-mono text-12 tracking-code sm:h-8"
            />
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={bind.isPending || !code.trim()}
              className="h-10 shrink-0 gap-2 px-4 sm:h-8"
            >
              {bind.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Gift className="size-4" />
              )}
              确认关联
            </Button>
          </div>
          {status?.bind_deadline && (
            <p className="mt-1.5 text-12 text-faint">
              请在 {status.bind_deadline.slice(0, 10)} 前完成关联。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
