import { useEffect, useId, useRef, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Gift,
  Loader2,
  Pencil,
  TicketCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@/shared/ui";
import {
  useInviteCampaign,
  useInvitePreview,
} from "@/shared/api/invite-campaign";
import { useInviteCandidate } from "@/stores/invite.store";
import { cn } from "@/shared/lib/utils";

/** 登录/注册三种壳共用的邀请码提示，保持紧凑，不挤掉同屏 OAuth 入口。 */
export function InviteAuthNotice({ className }: { className?: string }) {
  const { data: campaign } = useInviteCampaign();
  const candidate = useInviteCandidate((s) => s.candidate);
  const confirm = useInviteCandidate((s) => s.confirm);
  const clear = useInviteCandidate((s) => s.clear);
  const preview = useInvitePreview();
  const errorId = useId();
  const [code, setCode] = useState(candidate?.code ?? "");
  const persistedCodeRef = useRef(candidate?.code);
  const draftCodeRef = useRef(candidate?.code);
  const editingRef = useRef(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(
    !!candidate && candidate.valid !== true,
  );

  useEffect(() => {
    persistedCodeRef.current = candidate?.code;
    if (!editingRef.current) {
      draftCodeRef.current = candidate?.code;
      setCode(candidate?.code ?? "");
      setError("");
    }
  }, [candidate?.code]);
  useEffect(() => {
    if (candidate?.valid) setExpanded(false);
  }, [candidate?.valid]);

  if (!campaign?.enabled) return null;

  const inviteeGift = campaign.invitee_registration_credits;
  const rewardText =
    inviteeGift > 0 ? `获得 ${inviteeGift} 经费` : "完成好友关联";
  const normalized = code.trim().toUpperCase();

  const verify = async () => {
    if (!normalized) {
      setError("请输入邀请码");
      return;
    }
    setError("");
    try {
      const requestedCode = normalized;
      const result = await preview.mutateAsync(requestedCode);
      // 预览期间可能继续编辑；A 的迟到结果不得改写 B 的 UI/store。
      if (draftCodeRef.current !== requestedCode) return;
      if (!result.valid) {
        // 落地链接允许在 preview 前暂存；一旦服务端明确判无效就撤掉 header 候选。
        if (persistedCodeRef.current === requestedCode) {
          editingRef.current = true;
          persistedCodeRef.current = undefined;
          clear();
        }
        setError("邀请码无效或已过期");
        return;
      }
      editingRef.current = false;
      persistedCodeRef.current = result.code || requestedCode;
      draftCodeRef.current = result.code || requestedCode;
      confirm(
        result.code || requestedCode,
        result.inviter_name,
        result.campaign?.bind_window_days ?? campaign.bind_window_days,
      );
      setExpanded(false);
      toast.success("邀请码已确认");
    } catch {
      setError("暂时无法验证，请稍后重试");
    }
  };

  const confirmed = candidate?.valid === true;

  if (!candidate && !expanded) {
    return (
      <div
        className={cn(
          "relative mx-6 mt-3 min-w-0 overflow-hidden rounded-12 border border-brand-green/30 bg-brand-green/5 py-2.5 pl-4 pr-3",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1 bg-brand-green"
        />
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-pill border border-brand-green/20 bg-surface-card text-brand-green">
            <Gift className="size-4" />
          </span>
          <strong className="min-w-0 flex-1 text-14 font-medium text-brand-green">
            {rewardText}
          </strong>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              editingRef.current = true;
              draftCodeRef.current = code;
              setExpanded(true);
            }}
            className="h-9 shrink-0 border-brand-green/40 bg-surface-card px-3 text-brand-green hover:bg-brand-green/10 hover:text-brand-green"
          >
            填写邀请码
          </Button>
          {campaign.code_help_url && (
            <a
              href={campaign.code_help_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="查看邀请码帮助"
              className="inline-flex w-fit items-center gap-1 text-12 font-medium text-brand-green hover:underline"
            >
              获取邀请码
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    );
  }

  if (confirmed && !expanded) {
    return (
      <div
        className={cn(
          "relative mx-6 mt-3 flex min-w-0 items-center gap-2.5 overflow-hidden rounded-12 border border-brand-green/30 bg-brand-green/5 py-2.5 pl-4 pr-3",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1 bg-brand-green"
        />
        <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-brand-green/10 text-brand-green">
          <CheckCircle2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-12 text-faint">
            {candidate.inviterName
              ? `已接受 ${candidate.inviterName} 的邀请`
              : "邀请码已验证"}
          </p>
          <p className="text-14 font-medium text-brand-green">{rewardText}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            const draft = candidate.code;
            editingRef.current = true;
            persistedCodeRef.current = undefined;
            draftCodeRef.current = draft;
            setCode(draft);
            setExpanded(true);
            // 草稿不能继续作为 X-Invite-Code；重新 preview 成功后才恢复候选。
            clear();
          }}
          aria-label="编辑邀请码"
          className="flex size-9 shrink-0 items-center justify-center rounded-8 text-faint hover:bg-surface-2 hover:text-foreground sm:size-7"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            editingRef.current = false;
            clear();
            persistedCodeRef.current = undefined;
            draftCodeRef.current = undefined;
            setCode("");
          }}
          aria-label="取消使用邀请码"
          className="flex size-9 shrink-0 items-center justify-center rounded-8 text-faint hover:bg-surface-2 hover:text-foreground sm:size-7"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative mx-6 mt-3 min-w-0 overflow-hidden rounded-12 border border-brand-green/30 bg-brand-green/5 p-3 pl-4",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 bg-brand-green"
      />
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-brand-green/10 text-brand-green">
          <TicketCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-14 font-medium text-foreground">
            {candidate ? "确认邀请码" : "填写好友邀请码"}
          </p>
          <p className="mt-0.5 text-14 font-medium text-brand-green">
            {rewardText}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            editingRef.current = false;
            clear();
            persistedCodeRef.current = undefined;
            draftCodeRef.current = undefined;
            setCode("");
            setExpanded(false);
          }}
          aria-label="收起邀请码填写"
          className="flex size-9 shrink-0 items-center justify-center rounded-8 text-faint hover:bg-surface-2 hover:text-foreground sm:size-7"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Input
          value={code}
          onChange={(event) => {
            const next = event.target.value.toUpperCase();
            if (!editingRef.current) {
              editingRef.current = true;
              if (persistedCodeRef.current) {
                persistedCodeRef.current = undefined;
                clear();
              }
            }
            setCode(next);
            const nextCode = next.trim();
            // 编辑框只是草稿；只有 preview valid 才能重新写入 X-Invite-Code 候选。
            draftCodeRef.current = nextCode || undefined;
            setError("");
          }}
          maxLength={16}
          placeholder="输入邀请码"
          aria-label="邀请码"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="!h-11 min-w-0 flex-1 font-mono text-12 tracking-code sm:!h-9"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void verify()}
          disabled={preview.isPending || !normalized}
          className="h-11 shrink-0 border-brand-green bg-brand-green px-4 text-on-brand hover:bg-brand-green/90 hover:text-on-brand sm:h-9"
        >
          {preview.isPending && <Loader2 className="size-3.5 animate-spin" />}
          确认
        </Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-12 text-brand-red">
          {error}
        </p>
      )}
      {campaign.code_help_url && (
        <a
          href={campaign.code_help_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-12 font-medium text-brand-green hover:underline"
        >
          没有邀请码？查看获取方式
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
