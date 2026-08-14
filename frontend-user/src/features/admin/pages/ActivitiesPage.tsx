import { useEffect, useMemo, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Save,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useConfirm } from "@/shared/components";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";
import type { InviteCampaign } from "@/shared/api/invite-campaign";
import { AdminPageLayout } from "../components/AdminPageLayout";
import { ConfigPageGuard } from "../components/ConfigPageGuard";
import { useApiToast } from "../hooks/useApiToast";
import { PromoConfigPanel } from "./PromoConfigPage";
import {
  ADMIN_INVITE_CAMPAIGN_QUERY_KEY,
  useAdminInviteCampaign,
  useUpdateAdminInviteCampaign,
} from "../api/invite-campaign";
import { useInviteSummary } from "../api/invites";
import { PERM, useHasPermission } from "../permissions";

/** 活动管理：邀请活动与限时会员推广分别使用各自的配置真源。 */
export function ActivitiesPage() {
  const qc = useQueryClient();
  const canConfigureInvite = useHasPermission(PERM.configManage);
  const fetchingInvite = useIsFetching({
    queryKey: ADMIN_INVITE_CAMPAIGN_QUERY_KEY,
  });
  const fetchingPromo = useIsFetching({ queryKey: ["admin", "promo"] });

  return (
    <Tabs
      defaultValue={canConfigureInvite ? "invite" : "promo"}
      className="flex h-full min-h-0 flex-col"
    >
      <AdminPageLayout
        title="活动管理"
        description="管理邀请有礼与限时会员推广，各活动独立开关、独立配置"
        onRefresh={() => {
          void qc.invalidateQueries({
            queryKey: ADMIN_INVITE_CAMPAIGN_QUERY_KEY,
          });
          void qc.invalidateQueries({ queryKey: ["admin", "promo"] });
          void qc.invalidateQueries({ queryKey: ["admin", "invites"] });
        }}
        refreshing={fetchingInvite + fetchingPromo > 0}
        tabs={
          <TabsList>
            {canConfigureInvite && (
              <TabsTrigger value="invite">邀请有礼</TabsTrigger>
            )}
            <TabsTrigger value="promo">限时领取会员</TabsTrigger>
          </TabsList>
        }
      >
        {canConfigureInvite && (
          <TabsContent value="invite" className="mt-0">
            <InviteCampaignPanel />
          </TabsContent>
        )}
        <TabsContent value="promo" className="mt-0">
          <PromoConfigPanel />
        </TabsContent>
      </AdminPageLayout>
    </Tabs>
  );
}

function InviteCampaignPanel() {
  const query = useAdminInviteCampaign();
  return (
    <ConfigPageGuard query={query} resourceName="邀请活动配置">
      {(config) => <InviteCampaignForm initial={config} />}
    </ConfigPageGuard>
  );
}

function InviteCampaignForm({ initial }: { initial: InviteCampaign }) {
  const update = useUpdateAdminInviteCampaign();
  const summaryQ = useInviteSummary();
  const apiToast = useApiToast();
  const confirm = useConfirm();
  const [form, setForm] = useState(initial);

  useEffect(() => setForm(initial), [initial]);

  const errors = useMemo(() => validateCampaign(form), [form]);
  const setInteger = (
    key: keyof Pick<
      InviteCampaign,
      | "inviter_registration_credits"
      | "invitee_registration_credits"
      | "registration_daily_cap"
      | "bind_window_days"
      | "first_purchase_window_days"
    >,
    raw: string,
  ) => {
    // 编辑中允许真正清空；空串不能在 onChange 阶段立刻折回 0，
    // 否则受控输入会马上又渲染出「0」，用户无法删除后重新输入。
    const next = raw === "" ? Number.NaN : Number(raw);
    setForm((current) => ({
      ...current,
      [key]: next,
    }));
  };

  const onSave = async () => {
    if (errors.length > 0) return;
    const next = { ...form, code_help_url: form.code_help_url.trim() };
    const changes = campaignChanges(initial, next);
    if (changes.length === 0) {
      toast("当前没有任何改动");
      return;
    }
    const enabling = !initial.enabled && next.enabled;
    const raisesReward =
      next.inviter_registration_credits >
        initial.inviter_registration_credits ||
      next.invitee_registration_credits >
        initial.invitee_registration_credits ||
      next.first_purchase_rebate_bps > initial.first_purchase_rebate_bps;
    const widensEligibility =
      next.bind_window_days > initial.bind_window_days ||
      next.first_purchase_window_days > initial.first_purchase_window_days ||
      (next.registration_daily_cap === 0 &&
        initial.registration_daily_cap !== 0) ||
      (initial.registration_daily_cap !== 0 &&
        next.registration_daily_cap > initial.registration_daily_cap);
    const higherCostRisk = enabling || raisesReward || widensEligibility;
    const disabling = initial.enabled && !next.enabled;
    const ok = await confirm({
      title: higherCostRisk
        ? "确认调整邀请有礼发放规则？"
        : "确认保存邀请有礼配置？",
      description: (
        <span className="flex flex-col gap-2">
          <span>
            本次将修改 {changes.length} 项，保存后立即影响全站新邀请：
          </span>
          <span className="flex flex-col gap-1 text-foreground">
            {changes.map((change) => (
              <span key={change}>· {change}</span>
            ))}
          </span>
          {higherCostRisk && (
            <span className="flex items-start gap-1.5 font-medium text-brand-red">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              本次包含开启活动、提高奖励或扩大适用范围，可能直接增加经费成本。
            </span>
          )}
          {disabling && (
            <span className="text-faint">
              关闭后停止新曝光与新绑定；已绑定且仍在首单时窗内的奖励承诺会继续履约。
            </span>
          )}
        </span>
      ),
      confirmText: higherCostRisk ? "确认规则并保存" : "确认保存",
      danger: higherCostRisk,
    });
    if (!ok) return;
    await apiToast(update.mutateAsync(next), {
      success: form.enabled
        ? "已保存，邀请活动已开启"
        : "已保存，邀请活动已关闭",
      failure: "保存失败（需要配置管理权限）",
    });
  };

  const percent = form.first_purchase_rebate_bps / 100;
  const summary = summaryQ.data;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-16 border border-border bg-surface-card p-4">
        <div className="flex items-center gap-3">
          <Switch
            checked={form.enabled}
            onCheckedChange={(enabled) =>
              setForm((current) => ({ ...current, enabled }))
            }
            aria-label="开启邀请活动"
          />
          <div>
            <p className="text-14 font-medium text-foreground">
              邀请活动总开关
            </p>
            <p className="text-12 text-faint">
              {form.enabled
                ? "已开启：用户端顶栏、设置与注册归因入口可见"
                : "已关闭：隐藏用户端入口并停止新绑定；已绑定奖励承诺继续履约"}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={onSave}
          disabled={update.isPending || errors.length > 0}
        >
          {update.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          保存配置
        </Button>
      </div>

      <section className="rounded-16 border border-border bg-surface-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="size-4 text-brand-red" />
          <div>
            <h2 className="text-14 font-medium text-foreground">注册关联礼</h2>
            <p className="text-12 text-faint">
              好友在绑定时窗内确认邀请人后，双方分别入账。
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="邀请人注册礼（经费）"
            value={form.inviter_registration_credits}
            onChange={(value) =>
              setInteger("inviter_registration_credits", value)
            }
            hint="每成功关联 1 位新用户给邀请人的奖励"
            max={1_000_000_000}
          />
          <NumberField
            label="被邀请人注册礼（经费）"
            value={form.invitee_registration_credits}
            onChange={(value) =>
              setInteger("invitee_registration_credits", value)
            }
            hint="新用户成功关联后立即获得的奖励"
            max={1_000_000_000}
          />
          <NumberField
            label="每日奖励上限（人 / 邀请人）"
            value={form.registration_daily_cap}
            onChange={(value) => setInteger("registration_daily_cap", value)}
            hint="0 表示不限；超出后仍记录关联，但不发当日注册礼"
            max={1_000_000}
          />
          <NumberField
            label="允许绑定时窗（天）"
            value={form.bind_window_days}
            onChange={(value) => setInteger("bind_window_days", value)}
            hint="从新账号注册时起计算；建议 30 天"
            min={1}
            max={3650}
          />
        </div>
      </section>

      <section className="rounded-16 border border-border bg-surface-card p-4">
        <div className="mb-4">
          <h2 className="text-14 font-medium text-foreground">首次付费返利</h2>
          <p className="text-12 text-faint">
            被邀请人在规定时窗内完成首单后，按实付金额向邀请人返经费。
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-12 text-subtle">首单返利比例（%）</span>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={Number.isFinite(percent) ? percent : ""}
              onChange={(event) => {
                const humanPercent =
                  event.target.value === ""
                    ? Number.NaN
                    : Number(event.target.value);
                setForm((current) => ({
                  ...current,
                  first_purchase_rebate_bps: humanPercent * 100,
                }));
              }}
            />
            <span className="text-12 text-faint">
              界面输入百分数；保存时转为 {form.first_purchase_rebate_bps} bps
            </span>
          </label>
          <NumberField
            label="首单有效时窗（天）"
            value={form.first_purchase_window_days}
            onChange={(value) =>
              setInteger("first_purchase_window_days", value)
            }
            hint="从被邀请人的账号注册时起计算"
            min={1}
            max={3650}
          />
        </div>
      </section>

      <section className="rounded-16 border border-border bg-surface-card p-4">
        <label className="flex flex-col gap-1">
          <span className="text-12 text-subtle">邀请码帮助链接</span>
          <Input
            type="url"
            value={form.code_help_url}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                code_help_url: event.target.value,
              }))
            }
            placeholder="https://www.scholay.com/help/invite"
          />
          <span className="text-12 text-faint">
            可留空；填写时必须是完整 http(s) 链接。
          </span>
        </label>
      </section>

      {errors.length > 0 && (
        <div className="rounded-12 border border-brand-red/30 bg-danger-soft px-4 py-3">
          {errors.map((error) => (
            <p key={error} className="text-12 text-brand-red">
              · {error}
            </p>
          ))}
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PreviewCard
          label="双方注册礼"
          value={`${formatDraftNumber(form.inviter_registration_credits)} / ${formatDraftNumber(form.invitee_registration_credits)} 经费`}
          hint="邀请人 / 新用户"
        />
        <PreviewCard
          label="首单返利"
          value={`邀请人 ${formatDraftNumber(percent)}%`}
          hint={`${form.first_purchase_window_days} 天内首次付费`}
        />
        <PreviewCard
          label="历史总成本"
          value={
            summary
              ? `${summary.total_reward_credits.toLocaleString()} 经费`
              : "—"
          }
          hint={
            summary
              ? `共 ${summary.total_registrations.toLocaleString()} 条关联`
              : "正在读取汇总"
          }
        />
      </section>

      <div className="flex items-center justify-between gap-3 rounded-16 border border-border bg-surface-card p-4">
        <p className="text-12 leading-paragraph text-faint">
          <Sparkles className="mr-1 inline size-3.5" />
          保存后邀请活动配置成为用户端唯一活动信号；关闭不会删除历史归因与奖励流水。
        </p>
        <Link
          to="/admin/invites"
          className="inline-flex shrink-0 items-center gap-1 text-12 text-brand-red hover:underline"
        >
          查看邀请成本与明细
          <ExternalLink className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  hint,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  hint: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-12 text-subtle">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        step={1}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="text-12 leading-paragraph text-faint">{hint}</span>
    </label>
  );
}

function formatDraftNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : "—";
}

function PreviewCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-16 border border-border bg-surface-card p-4">
      <p className="text-12 text-faint">{label}</p>
      <p className="mt-1 text-16 font-medium tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-1 text-12 text-faint">{hint}</p>
    </div>
  );
}

const CAMPAIGN_FIELD_LABEL: Record<keyof InviteCampaign, string> = {
  enabled: "活动开关",
  inviter_registration_credits: "邀请人注册礼",
  invitee_registration_credits: "被邀请人注册礼",
  registration_daily_cap: "每日奖励上限",
  bind_window_days: "允许绑定时窗",
  first_purchase_window_days: "首单有效时窗",
  first_purchase_rebate_bps: "首单返利比例",
  code_help_url: "邀请码帮助链接",
};

function campaignValue(
  key: keyof InviteCampaign,
  value: InviteCampaign[keyof InviteCampaign],
) {
  if (key === "enabled") return value ? "开启" : "关闭";
  if (key === "first_purchase_rebate_bps") return `${Number(value) / 100}%`;
  if (key === "registration_daily_cap")
    return Number(value) === 0 ? "不限" : `${value} 人/日`;
  if (key === "bind_window_days" || key === "first_purchase_window_days")
    return `${value} 天`;
  if (
    key === "inviter_registration_credits" ||
    key === "invitee_registration_credits"
  ) {
    return `${Number(value).toLocaleString()} 经费`;
  }
  return String(value || "未设置");
}

function campaignChanges(
  initial: InviteCampaign,
  next: InviteCampaign,
): string[] {
  return (Object.keys(next) as Array<keyof InviteCampaign>)
    .filter((key) => initial[key] !== next[key])
    .map(
      (key) =>
        `${CAMPAIGN_FIELD_LABEL[key]}：${campaignValue(key, initial[key])} → ${campaignValue(key, next[key])}`,
    );
}

function validateCampaign(config: InviteCampaign): string[] {
  const errors: string[] = [];
  const integerFields: Array<[number, string]> = [
    [config.inviter_registration_credits, "邀请人注册礼"],
    [config.invitee_registration_credits, "被邀请人注册礼"],
    [config.registration_daily_cap, "每日奖励上限"],
    [config.bind_window_days, "绑定时窗"],
    [config.first_purchase_window_days, "首单时窗"],
  ];
  for (const [value, label] of integerFields) {
    if (!Number.isInteger(value) || value < 0)
      errors.push(`${label}必须是非负整数`);
  }
  if (
    !Number.isInteger(config.first_purchase_rebate_bps) ||
    config.first_purchase_rebate_bps < 0 ||
    config.first_purchase_rebate_bps > 10_000
  ) {
    errors.push("首单返利必须在 0% 到 100% 之间，且百分数最多两位小数");
  }
  if (
    config.inviter_registration_credits > 1_000_000_000 ||
    config.invitee_registration_credits > 1_000_000_000
  ) {
    errors.push("双方注册礼均不能超过 1,000,000,000 经费");
  }
  if (config.registration_daily_cap > 1_000_000) {
    errors.push("每日奖励上限不能超过 1,000,000 人");
  }
  if (config.bind_window_days < 1 || config.bind_window_days > 3650) {
    errors.push("绑定时窗必须在 1 到 3650 天之间");
  }
  if (
    config.first_purchase_window_days < 1 ||
    config.first_purchase_window_days > 3650
  ) {
    errors.push("首单时窗必须在 1 到 3650 天之间");
  }
  if (
    config.enabled &&
    config.inviter_registration_credits === 0 &&
    config.invitee_registration_credits === 0 &&
    config.first_purchase_rebate_bps === 0
  ) {
    errors.push("开启活动时至少配置一种注册礼或首单返利");
  }
  const helpUrl = config.code_help_url.trim();
  if (helpUrl.length > 500) {
    errors.push("邀请码帮助链接不能超过 500 个字符");
  } else if (helpUrl) {
    try {
      const url = new URL(helpUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new Error();
    } catch {
      errors.push("邀请码帮助链接必须是完整的 http(s) 地址");
    }
  }
  return [...new Set(errors)];
}
