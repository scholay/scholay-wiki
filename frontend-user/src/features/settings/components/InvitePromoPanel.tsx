import { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  QrCode,
  Users,
  UserCheck,
  Coins,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { toApiError } from '@/shared/lib/http';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { verifyInvitationCode } from '@/shared/lib/auth-invitation';
import {
  useBindInvitationCode,
  useInvitationOverview,
} from '../api/membership';

function absolutePromoUrl(promoLink: string): string {
  try {
    return new URL(promoLink, window.location.origin).href;
  } catch {
    return `${window.location.origin}/?invite=${promoLink}`;
  }
}

async function copyLabel(text: string, label: string) {
  if (await copyToClipboard(text)) toast.success(`${label}已复制`);
  else toast.error('复制失败，请手动选择复制');
}

/**
 * 账户资产 · 推广/邀请：
 *   1. 统计：已注册 / 已认证 / 经费奖励总额
 *   2. 我的推广码 / 推广链接 / 二维码（可复制）
 *   3. 绑定上级邀请码（仅一次）
 */
export function InvitePromoPanel() {
  const { data, isLoading, isError } = useInvitationOverview();
  const bind = useBindInvitationCode();
  const [code, setCode] = useState('');

  if (isLoading) {
    return (
      <section className="flex items-center justify-center gap-2 rounded-md border border-border bg-background p-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        加载推广数据…
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section className="rounded-md border border-border bg-background p-8 text-center text-sm text-muted-foreground">
        推广数据加载失败，请稍后重试
      </section>
    );
  }

  const promoUrl = absolutePromoUrl(data.promo_link);
  const bound = !!data.bound_upline_code;

  const onBind = async () => {
    const trimmed = code.trim();
    const local = verifyInvitationCode(trimmed);
    if (!local.ok) {
      toast.error(local.message || '邀请码无效或已失效');
      return;
    }
    if (trimmed.toUpperCase() === data.promo_code.toUpperCase()) {
      toast.error('不能绑定自己的推广码');
      return;
    }
    try {
      await bind.mutateAsync(trimmed.toUpperCase());
      toast.success('已绑定上级邀请码');
      setCode('');
    } catch (err) {
      toast.error(toApiError(err).message || '绑定失败，请稍后重试');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 绑定上级 —— 置顶，方便新用户补填 */}
      <section className="rounded-md border border-border bg-background p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Link2 className="size-4 text-brand-red" />
            绑定上级邀请码
          </h3>
          <span className="text-2xs text-faint">每个账号仅可绑定一次</span>
        </div>

        {bound ? (
          <div
            className={cn(
              'flex h-11 items-center gap-2 rounded-md border border-brand-green/30',
              'bg-brand-green/5 px-3',
            )}
          >
            <CheckCircle2 className="size-4 shrink-0 text-brand-green" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-wide">
              {data.bound_upline_code}
            </span>
            <span className="shrink-0 text-2xs font-medium text-brand-green">已绑定</span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="请输入好友邀请码"
                className="h-11 flex-1 text-sm tracking-wide"
                maxLength={32}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void onBind();
                  }
                }}
              />
              <Button
                type="button"
                onClick={() => void onBind()}
                disabled={bind.isPending || !code.trim()}
                className="h-11 shrink-0 bg-brand-red px-5 text-background hover:bg-brand-red/90"
              >
                {bind.isPending ? '提交中…' : '确认绑定'}
              </Button>
            </div>
            <p className="mt-2 text-2xs text-faint">
              扫码或第三方注册时若未填写，可在此补绑上级。绑定后不可更改。
            </p>
          </>
        )}
      </section>

      {/* 统计 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={Users}
          label="已注册用户"
          value={String(data.registered_count)}
          hint="通过你的推广完成注册"
        />
        <StatCard
          icon={UserCheck}
          label="已认证用户"
          value={String(data.verified_count)}
          hint="完成邮箱/手机认证"
        />
        <StatCard
          icon={Coins}
          label="经费奖励总额"
          value={`${data.reward_total}`}
          suffix="经费"
          hint="推广带来的累计奖励"
          accent
        />
      </div>

      {/* 我的推广物料 */}
      <section className="rounded-md border border-border bg-background p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <QrCode className="size-4 text-brand-red" />
            我的推广
          </h3>
          <span className="text-2xs text-faint">分享给好友注册即可累计奖励</span>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-3">
            <ShareRow
              label="推广码"
              value={data.promo_code}
              mono
              onCopy={() => void copyLabel(data.promo_code, '推广码')}
            />
            <ShareRow
              label="推广链接"
              value={promoUrl}
              onCopy={() => void copyLabel(promoUrl, '推广链接')}
            />
          </div>

          <div className="flex flex-col items-center gap-2 rounded-md border border-border-soft bg-surface-1 p-3">
            <QRCodeCanvas
              value={promoUrl}
              size={132}
              level="M"
              marginSize={1}
              className="rounded-sm bg-white p-1"
            />
            <button
              type="button"
              onClick={() => void copyLabel(promoUrl, '推广链接')}
              className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
            >
              <Copy className="size-3" />
              复制链接（含二维码落地）
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  hint,
  accent,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  suffix?: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex items-center gap-1.5 text-2xs font-medium text-faint">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p
        className={cn(
          'mt-2 text-2xl font-bold tabular-nums tracking-tight',
          accent ? 'text-brand-green' : 'text-foreground',
        )}
      >
        {value}
        {suffix ? (
          <span className="ml-1 text-sm font-medium text-muted-foreground">{suffix}</span>
        ) : null}
      </p>
      <p className="mt-1 text-2xs text-faint">{hint}</p>
    </div>
  );
}

function ShareRow({
  label,
  value,
  mono,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium text-faint">{label}</span>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex h-10 min-w-0 flex-1 items-center truncate rounded-md border border-border bg-surface-1 px-3 text-sm text-foreground',
            mono && 'font-mono tracking-wide',
          )}
          title={value}
        >
          {value}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 shrink-0 gap-1.5"
          onClick={onCopy}
        >
          <Copy className="size-3.5" />
          复制
        </Button>
      </div>
    </div>
  );
}

/** @deprecated 使用 InvitePromoPanel；保留别名避免旧 import 断裂 */
export const InviteBindPanel = InvitePromoPanel;
