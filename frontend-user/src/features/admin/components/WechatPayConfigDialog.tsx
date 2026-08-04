import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { SecretInput } from '@/shared/ui/secret-input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { Field, SecretTextareaField } from './PaymentConfigParts';
import { TimeCell } from './TimeCell';
import {
  WechatPayTestResultPanel, WechatPayValidationBadge, WECHAT_KEY_MODE_LABEL,
} from './WechatPayTestResultPanel';
import type { WeChatPayConfig, WeChatPayConfigInput, WechatPayTestResult } from '../api/payment';

/** 打开状态。null = 关闭(Dialog 本体常驻,只切 open,绝不在 open 时被卸载)。 */
export type WechatMode = { kind: 'create' } | { kind: 'edit'; row: WeChatPayConfig } | null;

export const WECHAT_PAY_MODES: { value: string; label: string; hint: string }[] = [
  { value: 'native', label: '扫码 (native)', hint: 'PC 端展示二维码' },
  { value: 'h5', label: '手机浏览器 (h5)', hint: '微信外的移动端浏览器' },
  { value: 'jsapi', label: '微信内 (jsapi)', hint: '公众号 / 小程序,需要 openid' },
];

/** 脱敏占位提示 —— *_configured 为真时告诉管理员"填过了,原样提交不会覆盖"。 */
function secretPlaceholder(configured: boolean | undefined, whenEmpty: string): string {
  return configured ? '已配置 · 留空或保持星号占位即不修改' : whenEmpty;
}

/** 受控密文字段 —— 随后端下发的值(脱敏 / reveal 后的明文)同步。 */
function useSyncedSecret(source: string | undefined) {
  const [value, setValue] = useState('');
  useEffect(() => {
    setValue(source ?? '');
  }, [source]);
  return [value, setValue] as const;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-12 border border-border p-3">
      <div className="space-y-1">
        <h3 className="text-12 font-medium text-foreground">{title}</h3>
        {description && <p className="text-12 text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function WechatPayConfigDialog({
  mode,
  row,
  reveal,
  onToggleReveal,
  onClose,
  onSubmit,
  submitting,
  onTest,
  testing,
  testResult,
}: {
  mode: WechatMode;
  /** 列表里的最新一行(reveal 切换会重拉,拿到明文 / 脱敏)。create 态为 undefined。 */
  row: WeChatPayConfig | undefined;
  reveal: boolean;
  onToggleReveal: () => void;
  onClose: () => void;
  /** 返回 true 表示保存成功(由上层关闭弹窗)。 */
  onSubmit: (data: WeChatPayConfigInput) => Promise<boolean>;
  submitting: boolean;
  onTest: () => void;
  testing: boolean;
  testResult: WechatPayTestResult | null;
}) {
  const isEdit = mode?.kind === 'edit';
  // 状态区读**最新**一行:测试完会 invalidate 列表,只读打开时的 mode.row 快照
  // 会让「刚测过了」的徽章还停在「未测试」。
  const editRow = mode?.kind === 'edit' ? (row ?? mode.row) : undefined;
  const [apiV3Key, setApiV3Key] = useSyncedSecret(row?.api_v3_key);
  const [privateKey, setPrivateKey] = useSyncedSecret(row?.private_key);
  const [merchantCert, setMerchantCert] = useSyncedSecret(row?.merchant_certificate);
  const [publicKey, setPublicKey] = useSyncedSecret(row?.wechatpay_public_key);
  const [payModes, setPayModes] = useState<string[]>(['native']);

  // 每次打开重置支付方式:编辑取该行现值,新建回落 native(后端同款默认)。
  useEffect(() => {
    if (!mode) return;
    setPayModes(
      mode.kind === 'edit' && mode.row.pay_modes?.length ? mode.row.pay_modes : ['native'],
    );
  }, [mode]);

  const toggleMode = (value: string) =>
    setPayModes((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value],
    );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!mode) return;
    const fd = new FormData(e.currentTarget);
    const data: WeChatPayConfigInput = {
      mch_id: String(fd.get('mch_id') || ''),
      app_id: String(fd.get('app_id') || ''),
      serial_no: String(fd.get('serial_no') || ''),
      api_v3_key: apiV3Key,
      private_key: privateKey,
      merchant_certificate: merchantCert,
      wechatpay_public_key_id: String(fd.get('wechatpay_public_key_id') || ''),
      wechatpay_public_key: publicKey,
      notify_url: String(fd.get('notify_url') || ''),
      refund_notify_url: String(fd.get('refund_notify_url') || ''),
      pay_modes: payModes,
      // 历史列,v3 无沙箱概念,不给 UI;原样带回避免更新时被静默清掉。
      is_sandbox: editRow?.is_sandbox ?? false,
      // 后端新建强制 false;更新时凭证有改动也会强制 false 并打回 untested。
      is_active: editRow?.is_active ?? false,
    };
    const ok = await onSubmit(data);
    if (ok) onClose();
  };

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑微信支付配置' : '新增微信支付配置'}</DialogTitle>
          <DialogDescription>
            保存后配置会被打回「未测试」并自动下线 —— 必须先「测试配置」通过,才能在列表里启用。
          </DialogDescription>
        </DialogHeader>
        {mode && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Section title="基础">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="商户号(MchID)">
                  <Input name="mch_id" defaultValue={isEdit ? mode.row.mch_id : ''} required />
                </Field>
                <Field label="AppID">
                  <Input name="app_id" defaultValue={isEdit ? mode.row.app_id : ''} required />
                </Field>
              </div>
              <Field
                label="商户 API 证书序列号"
                hint="商户平台「API 安全」→ 商户 API 证书里的序列号(40 位十六进制)。"
              >
                <Input
                  name="serial_no"
                  className="font-mono"
                  defaultValue={isEdit ? mode.row.serial_no : ''}
                  required
                />
              </Field>
            </Section>

            <Section
              title="密钥"
              description="脱敏显示;原样提交不会覆盖库里的原值,要换才填新值。点右侧眼睛可拉取明文。"
            >
              <Field label="APIv3 密钥">
                <SecretInput
                  name="api_v3_key"
                  value={apiV3Key}
                  onChange={(e) => setApiV3Key(e.target.value)}
                  revealed={reveal}
                  onToggleReveal={onToggleReveal}
                  required={!isEdit}
                  placeholder={secretPlaceholder(row?.api_v3_key_configured, '32 个字符,商户平台自行设置')}
                />
              </Field>
              <SecretTextareaField
                label="商户 API 私钥(apiclient_key.pem)"
                name="private_key"
                rows={4}
                value={privateKey}
                onChange={setPrivateKey}
                revealed={reveal}
                onToggleReveal={onToggleReveal}
                required={!isEdit}
                placeholder={secretPlaceholder(row?.private_key_configured, '-----BEGIN PRIVATE KEY-----')}
              />
              <SecretTextareaField
                label="商户 API 证书(apiclient_cert.pem,可选)"
                name="merchant_certificate"
                rows={3}
                value={merchantCert}
                onChange={setMerchantCert}
                revealed={reveal}
                onToggleReveal={onToggleReveal}
                placeholder={secretPlaceholder(row?.merchant_certificate_configured, '-----BEGIN CERTIFICATE-----')}
                hint="不参与任何网络调用,但填了就能在「测试配置」里离线验出序列号 / 商户号 / 私钥是否配对。"
              />
            </Section>

            <Section
              title="验签模式"
              description={
                <>
                  两项<strong className="font-medium text-foreground">都留空 = 平台证书模式</strong>:
                  系统用 APIv3 密钥自动下载并缓存微信平台证书,不需要手工维护。
                  2024 年后新开通的商户号在商户平台「API 安全」里下载的是
                  <strong className="font-medium text-foreground">微信支付公钥</strong>,
                  这时必须两项一起填(公钥 ID 以 PUB_KEY_ID_ 开头)。
                  只填其中一项后端会直接拒绝保存 —— 这是配置时最容易搞错的一步。
                </>
              }
            >
              <Field label="微信支付公钥 ID">
                <Input
                  name="wechatpay_public_key_id"
                  className="font-mono"
                  defaultValue={isEdit ? mode.row.wechatpay_public_key_id : ''}
                  placeholder="PUB_KEY_ID_...(留空 = 平台证书模式)"
                />
              </Field>
              <SecretTextareaField
                label="微信支付公钥(PEM)"
                name="wechatpay_public_key"
                rows={3}
                value={publicKey}
                onChange={setPublicKey}
                revealed={reveal}
                onToggleReveal={onToggleReveal}
                placeholder={secretPlaceholder(row?.wechatpay_public_key_configured, '-----BEGIN PUBLIC KEY-----(留空 = 平台证书模式)')}
              />
            </Section>

            <Section title="回调">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="支付回调地址" hint="必须是公网可达的 HTTPS 地址。">
                  <Input name="notify_url" defaultValue={isEdit ? mode.row.notify_url : ''} required />
                </Field>
                <Field label="退款回调地址" hint="留空由支付回调地址自动推导。">
                  <Input
                    name="refund_notify_url"
                    defaultValue={isEdit ? mode.row.refund_notify_url : ''}
                    placeholder="留空自动推导"
                  />
                </Field>
              </div>
            </Section>

            <Section title="支付方式" description="至少勾一项;未勾选的场景下单会被后端拒绝。">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
                {WECHAT_PAY_MODES.map((m) => (
                  <label key={m.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={payModes.includes(m.value)}
                      onChange={() => toggleMode(m.value)}
                    />
                    <span className="text-12 text-foreground">{m.label}</span>
                    <span className="text-12 text-faint">{m.hint}</span>
                  </label>
                ))}
              </div>
            </Section>

            {editRow && (
              <Section title="状态">
                <div className="flex flex-wrap items-center gap-2">
                  <WechatPayValidationBadge status={editRow.validation_status} />
                  <span className="text-12 text-subtle">
                    {WECHAT_KEY_MODE_LABEL[editRow.key_mode] ?? editRow.key_mode}
                  </span>
                  <span className="text-12 text-faint">
                    {editRow.is_active ? '当前活动配置' : '未启用'}
                  </span>
                  {/* 这个字段的用途就是回答「这份凭证多久没验过了」—— 直出
                      `2026-08-03 14:00:00` 是答不出来的;另外后端给的是空格分隔格式,
                      Safari 直接 new Date() 会得 NaN(TimeCell 内部已处理)。 */}
                  {editRow.last_validated_at && (
                    <TimeCell value={editRow.last_validated_at} prefix="上次测试 " />
                  )}
                </div>
                {editRow.last_validation_message && (
                  <p
                    className={cn(
                      'whitespace-pre-wrap break-words text-12',
                      editRow.validation_status === 'invalid'
                        ? 'text-brand-red'
                        : 'text-muted-foreground',
                    )}
                  >
                    {editRow.last_validation_message}
                  </p>
                )}
                <Label className="text-faint">启用 / 停用在列表的「活动」列操作(需先测试通过)。</Label>
              </Section>
            )}

            {testResult && <WechatPayTestResultPanel result={testResult} />}

            <DialogFooter>
              {isEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onTest}
                  disabled={testing}
                  className="sm:mr-auto"
                >
                  {testing ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  测试配置
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose}>取消</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {isEdit ? '保存' : '新增'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
