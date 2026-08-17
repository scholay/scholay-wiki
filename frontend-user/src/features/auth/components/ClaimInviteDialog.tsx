import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  CheckCircle2,
  CircleX,
  ExternalLink,
  Gift,
  Loader2,
  QrCode,
  TicketCheck,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  inviteReasonText,
  previewInviteCode,
  useBindInvite,
  useInviteCampaign,
} from '@/shared/api/invite-campaign';
import { usePublicConfig } from '@/shared/api/public-config';
import { usePromoConfig } from '@/shared/api/promo';
import { useUserInvite } from '@/shared/api/user-invite';
import { InviteRewardPoster } from '@/shared/components/invite/InviteRewardPoster';
import { InviteShareMethods } from '@/shared/components/invite/InviteShareMethods';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { isPhoneDevice } from '@/shared/lib/device';
import { toApiError } from '@/shared/lib/http';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
} from '@/shared/ui';
import { cn } from '@/shared/lib/utils';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useIsAuthenticated } from '@/stores/auth.store';
import {
  useClaimInvite,
  type ClaimInviteScene,
} from '@/stores/claim-invite.store';
import { persistInvitationCode } from '@/shared/lib/auth-invitation';
import { useInviteFilled } from '../hooks/useInviteFilled';

const SOCIAL_CHANNELS = ['小红书', '抖音', '视频号', '公众号'] as const;

const SCENE_TITLE: Record<ClaimInviteScene, string> = {
  fill: '填写邀请码可获得奖励',
  promote: '推广有好礼',
  get: '获取邀请码',
};

const SCENE_TABS: { scene: ClaimInviteScene; label: string }[] = [
  { scene: 'fill', label: '填写邀请码' },
  { scene: 'promote', label: '推广有好礼' },
  { scene: 'get', label: '获取邀请码' },
];

function inviteCenterPath() {
  return isPhoneDevice() ? '/m/me/invite' : '/settings/invite';
}

/**
 * 顶栏邀请入口弹窗：填写 / 推广有好礼 / 获取邀请码 三场景，
 * 并覆盖未登录、已登录未绑定、已绑定等多种状态。
 */
export function ClaimInviteDialog() {
  const open = useClaimInvite((s) => s.open);
  const scene = useClaimInvite((s) => s.scene);
  const setScene = useClaimInvite((s) => s.setScene);
  const closeClaim = useClaimInvite((s) => s.closeClaim);
  const { filled } = useInviteFilled();
  const { data: campaign, isLoading: campaignLoading } = useInviteCampaign();
  const authenticated = useIsAuthenticated();

  const reward =
    campaign?.enabled && campaign.invitee_registration_credits > 0
      ? `获得 ${campaign.invitee_registration_credits} 经费`
      : '完成好友关联';

  useEffect(() => {
    if (open && filled && scene !== 'promote') setScene('promote');
  }, [filled, open, scene, setScene]);

  const activeScene = filled ? 'promote' : scene;
  const tabs = filled
    ? SCENE_TABS.filter((item) => item.scene === 'promote')
    : SCENE_TABS;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeClaim();
      }}
    >
      <DialogContent
        className="max-w-2xl gap-0 overflow-x-hidden p-0"
        aria-describedby={undefined}
      >
        <div className="border-b border-border-soft px-6 pb-4 pt-6">
          <DialogTitle className="text-16 font-medium">
            {SCENE_TITLE[activeScene]}
          </DialogTitle>
          {tabs.length > 1 && (
            <div
              className="mt-3 flex flex-wrap gap-1.5"
              role="tablist"
              aria-label="邀请场景"
            >
              {tabs.map((item) => (
                <button
                  key={item.scene}
                  type="button"
                  role="tab"
                  aria-selected={activeScene === item.scene}
                  onClick={() => setScene(item.scene)}
                  className={cn(
                    'h-7 rounded-pill border px-2.5 text-12 font-medium transition-colors',
                    activeScene === item.scene
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-surface-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {campaignLoading && !campaign ? (
          <div
            className="flex min-h-40 items-center justify-center"
            aria-label="正在加载邀请活动"
          >
            <Loader2 className="size-5 animate-spin text-faint" />
          </div>
        ) : activeScene === 'fill' ? (
          <FillInviteScene reward={reward} authenticated={authenticated} />
        ) : activeScene === 'get' ? (
          <div className="px-6 py-5">
            <GetInviteChannels />
          </div>
        ) : (
          <PromoteInviteScene
            authenticated={authenticated}
            campaign={campaign}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FillInviteScene({
  reward,
  authenticated,
}: {
  reward: string;
  authenticated: boolean;
}) {
  const open = useClaimInvite((s) => s.open);
  const closeClaim = useClaimInvite((s) => s.closeClaim);
  const setScene = useClaimInvite((s) => s.setScene);
  const openAuthDialog = useAuthDialog((s) => s.openDialog);
  const setInvitationCode = useAuthDialog((s) => s.setInvitationCode);
  const bind = useBindInvite();
  const invitePath = inviteCenterPath();

  const [code, setCode] = useState('');
  const [previewed, setPreviewed] = useState<{
    code: string;
    valid: boolean;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const normalized = code.trim().toUpperCase();
  const debounced = useDebounce(normalized, 280);
  const pending = Boolean(normalized) && (checking || normalized !== debounced);
  const settled =
    previewed !== null && previewed.code === normalized && !pending;
  const canSubmit = settled && previewed.valid && !bind.isPending;

  useEffect(() => {
    if (!open) {
      setCode('');
      setPreviewed(null);
      setChecking(false);
    }
  }, [open]);

  useEffect(() => {
    if (!debounced) {
      setPreviewed(null);
      setChecking(false);
      return;
    }
    let live = true;
    const started = Date.now();
    setChecking(true);
    setPreviewed(null);
    const settle = async (valid: boolean) => {
      const wait = 1000 - (Date.now() - started);
      if (wait > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, wait));
      }
      if (!live) return;
      setPreviewed({ code: debounced, valid });
      setChecking(false);
    };
    void previewInviteCode(debounced)
      .then((result) => settle(result.valid === true))
      .catch(() => settle(false));
    return () => {
      live = false;
    };
  }, [debounced]);

  const persistDraft = (next: string) => {
    setInvitationCode(next);
    persistInvitationCode(next);
  };

  const handleBind = async () => {
    if (!canSubmit) return;
    persistDraft(normalized);
    if (!authenticated) {
      closeClaim();
      openAuthDialog('register');
      toast.success('邀请码已保存，注册后即可领取');
      return;
    }
    try {
      const result = await bind.mutateAsync(normalized);
      if (result.status.bound) {
        const gift = result.rewards?.invitee_registration_credits ?? 0;
        toast.success(
          gift > 0 ? `关联成功，已获得 ${gift} 经费` : '邀请关联成功',
        );
        closeClaim();
        return;
      }
      toast.info(inviteReasonText(result.status.reason));
    } catch (error) {
      toast.error(toApiError(error).message || '关联失败，请检查邀请码');
    }
  };

  return (
    <div className="grid min-w-0 gap-6 px-6 py-5 sm:grid-cols-2">
      <form
        className="min-w-0"
        onSubmit={(event) => {
          event.preventDefault();
          void handleBind();
        }}
      >
        <p className="text-14 font-medium text-foreground">填写邀请码</p>
        <p className="mt-1 text-12 text-brand-green">{reward}</p>
        <div className="mt-3 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              value={code}
              onChange={(event) => {
                const next = event.target.value.toUpperCase();
                setCode(next);
                persistDraft(next.trim());
              }}
              maxLength={16}
              placeholder="邀请码（选填）"
              aria-label="邀请码"
              autoComplete="off"
              className="h-10 pr-20 font-mono text-12 tracking-code"
            />
            {normalized ? (
              <span
                className={cn(
                  'pointer-events-none absolute inset-y-0 right-3 flex items-center gap-1 text-12',
                  pending && 'text-faint',
                  settled && previewed.valid && 'text-brand-green',
                  settled && !previewed.valid && 'text-brand-red',
                )}
                aria-live="polite"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    核验中
                  </>
                ) : settled && previewed.valid ? (
                  <>
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    有效
                  </>
                ) : (
                  <>
                    <CircleX className="size-3.5" aria-hidden />
                    无效
                  </>
                )}
              </span>
            ) : null}
          </div>
          <Button type="submit" disabled={!canSubmit} className="h-10 shrink-0 px-4">
            {bind.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : authenticated ? (
              '确认关联'
            ) : (
              '保存并注册'
            )}
          </Button>
        </div>
        <a
          href={invitePath}
          onClick={closeClaim}
          className="mt-4 inline-flex items-center gap-1 text-12 font-medium text-foreground hover:underline"
        >
          前往推广邀请中心查看规则详情
          <ExternalLink className="size-3" />
        </a>
        <button
          type="button"
          onClick={() => setScene('get')}
          className="mt-2 block text-12 text-muted-foreground hover:text-foreground hover:underline"
        >
          还没有邀请码？去获取
        </button>
      </form>

      <div className="min-w-0 border-t border-border-soft pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
        <GetInviteChannels compact />
      </div>
    </div>
  );
}

function PromoteInviteScene({
  authenticated,
  campaign,
}: {
  authenticated: boolean;
  campaign:
    | {
        enabled: boolean;
        inviter_registration_credits: number;
        invitee_registration_credits: number;
        bind_window_days: number;
        first_purchase_rebate_bps: number;
        code_help_url: string;
      }
    | undefined;
}) {
  const closeClaim = useClaimInvite((s) => s.closeClaim);
  const setScene = useClaimInvite((s) => s.setScene);
  const openAuthDialog = useAuthDialog((s) => s.openDialog);
  const invitePath = inviteCenterPath();
  const campaignOn = campaign?.enabled === true;
  const inviteQ = useUserInvite(authenticated && campaignOn);
  const bothReceive =
    (campaign?.inviter_registration_credits ?? 0) > 0 &&
    (campaign?.invitee_registration_credits ?? 0) > 0;
  const rewardOn =
    (campaign?.inviter_registration_credits ?? 0) > 0 ||
    (campaign?.first_purchase_rebate_bps ?? 0) > 0;

  const startRegistration = () => {
    closeClaim();
    openAuthDialog('register');
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 px-6 py-5">
      <InviteRewardPoster />

      {authenticated ? (
        <>
          <p className="text-12 text-muted-foreground">
            {rewardOn
              ? '分享专属邀请，好友注册后双方按活动规则领取奖励。'
              : '分享专属链接、邀请码或二维码，邀请好友使用 Scholay。'}
          </p>
          {inviteQ.isLoading ? (
            <div
              className="flex min-h-44 items-center justify-center rounded-12 border border-border-hairline"
              aria-label="正在加载邀请信息"
            >
              <Loader2 className="size-5 animate-spin text-faint" />
            </div>
          ) : !inviteQ.data?.code || !inviteQ.data.url ? (
            <div className="rounded-12 border border-border-hairline bg-surface-1 p-4">
              <p className="text-14 font-medium text-foreground">
                邀请信息加载失败
              </p>
              <p className="mt-1 text-12 text-faint">
                请稍后重试，活动规则与邀请数据不会受影响。
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => void inviteQ.refetch()}
              >
                重试
              </Button>
            </div>
          ) : (
            <InviteShareMethods
              code={inviteQ.data.code}
              url={inviteQ.data.url}
            />
          )}
        </>
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex min-w-0 items-start gap-2 rounded-12 border border-brand-green/30 bg-brand-green/5 p-3 text-12 text-subtle">
              <Gift className="mt-0.5 size-4 shrink-0 text-brand-green" />
              <span>
                {bothReceive
                  ? `邀请人获得 ${campaign?.inviter_registration_credits} 经费，受邀好友获得 ${campaign?.invitee_registration_credits} 经费。`
                  : '完成邀请关联后，即可按活动规则参与邀请活动。'}
              </span>
            </div>
            <div className="flex min-w-0 items-start gap-2 rounded-12 border border-brand-green/30 bg-brand-green/5 p-3 text-12 text-subtle">
              <TicketCheck className="mt-0.5 size-4 shrink-0 text-brand-green" />
              <span>
                没有邀请码也可以先注册，注册后 {campaign?.bind_window_days ?? 7}{' '}
                天内仍可补填邀请码。
              </span>
            </div>
          </div>
          <Button type="button" className="h-9 w-fit gap-2" onClick={startRegistration}>
            <UserPlus className="size-4" />
            直接注册
          </Button>
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href={invitePath}
          onClick={closeClaim}
          className="inline-flex items-center gap-1 text-12 font-medium text-foreground hover:underline"
        >
          前往推广邀请中心查看规则详情
          <ExternalLink className="size-3" />
        </a>
        {campaign?.code_help_url && (
          <a
            href={campaign.code_help_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-12 font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            活动说明
            <ExternalLink className="size-3" />
          </a>
        )}
        {!authenticated && (
          <button
            type="button"
            onClick={() => setScene('fill')}
            className="text-12 text-muted-foreground hover:text-foreground hover:underline"
          >
            已有邀请码？去填写
          </button>
        )}
      </div>
    </div>
  );
}

function GetInviteChannels({ compact = false }: { compact?: boolean }) {
  const { data: publicConfig } = usePublicConfig();
  const { data: promo } = usePromoConfig();
  const communityUrl = publicConfig?.discourse_site_url?.trim();
  const qrSrc = promo?.wechat_qr_url;

  return (
    <div className="min-w-0">
      <p className="text-14 font-medium text-foreground">
        {compact ? '或者扫码添加微信客服获取邀请码' : '扫码添加微信客服获取邀请码'}
      </p>
      <div className="mt-3 flex flex-col items-center">
        <div className="rounded-12 border border-border bg-surface-card p-2">
          {qrSrc ? (
            <img
              src={qrSrc}
              alt="微信客服二维码"
              className={cn('object-contain', compact ? 'size-36' : 'size-40')}
            />
          ) : (
            <QRCodeCanvas
              value={`${window.location.origin}/?invite=support`}
              size={compact ? 144 : 160}
              level="M"
              marginSize={1}
            />
          )}
        </div>
        <p className="mt-2 inline-flex items-center gap-1 text-12 text-faint">
          <QrCode className="size-3" />
          微信扫一扫，添加客服领取
        </p>
      </div>

      {communityUrl && (
        <a
          href={communityUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-12 font-medium text-brand-green hover:underline"
        >
          去社区找二维码
          <ExternalLink className="size-3" />
        </a>
      )}

      <p className="mt-4 text-12 text-muted-foreground">
        也可关注小红书、抖音、视频号、公众号，后台私信获取邀请码
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SOCIAL_CHANNELS.map((label) => (
          <span
            key={label}
            className="inline-flex h-7 items-center rounded-pill border border-border bg-surface-2 px-2.5 text-12 text-foreground"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
