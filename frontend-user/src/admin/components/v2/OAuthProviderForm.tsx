/**
 * OAuthProviderForm — 6 个 OAuth Provider 共享的表单视觉模板
 *
 * 包含:
 *   - Header: Icon + 标题 + 描述 + 启用开关
 *   - 必填字段: Client ID / Client Secret(后者带"已设置"提示)
 *   - 可选字段: 自动生成的 Callback URL(可复制)
 *   - 额外字段插槽 (extras) 用于 Orcid sandbox / GitHub redirect URI 等
 *   - 使用说明 collapse (instructions slot)
 *   - 提交按钮
 *
 * 各 OAuth Tab 维持自己的 useState / API,通过 props 接入
 */

import { useState, type FormEvent } from 'react';
import { Copy, ChevronDown, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';

export interface OAuthProviderFormProps {
  // Header
  icon: React.ReactNode;
  title: string;
  description?: string;

  // Toggle
  enabled?: boolean;
  onEnabledChange?: (v: boolean) => void;
  showEnabled?: boolean;

  // Required fields
  clientId: string;
  onClientIdChange: (v: string) => void;
  clientIdLabel?: string;
  clientIdPlaceholder?: string;
  clientIdHint?: React.ReactNode;

  clientSecret: string;
  onClientSecretChange: (v: string) => void;
  clientSecretLabel?: string;
  hasSecret?: boolean;
  clientSecretHint?: React.ReactNode;

  // Optional callback URL display
  callbackBaseUrl?: string;
  callbackPath?: string;
  onCallbackBaseUrlChange?: (v: string) => void;
  callbackBaseUrlHint?: React.ReactNode;

  // Extra fields slot (e.g. sandbox toggle, custom redirect)
  extras?: React.ReactNode;

  // Usage guide collapse
  instructions?: React.ReactNode;

  // Submit
  loading?: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void | Promise<void>;
}

export function OAuthProviderForm({
  icon,
  title,
  description,
  enabled,
  onEnabledChange,
  showEnabled = true,
  clientId,
  onClientIdChange,
  clientIdLabel = 'Client ID',
  clientIdPlaceholder,
  clientIdHint,
  clientSecret,
  onClientSecretChange,
  clientSecretLabel = 'Client Secret',
  hasSecret,
  clientSecretHint,
  callbackBaseUrl,
  callbackPath,
  onCallbackBaseUrlChange,
  callbackBaseUrlHint,
  extras,
  instructions,
  loading,
  onSubmit,
}: OAuthProviderFormProps) {
  const [showInstructions, setShowInstructions] = useState(false);

  const fullCallback =
    callbackBaseUrl && callbackPath
      ? `${callbackBaseUrl.replace(/\/$/, '')}/${callbackPath.replace(/^\//, '')}`
      : '';

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-muted/50 p-2 text-foreground">{icon}</div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              {description && (
                <CardDescription className="mt-1">{description}</CardDescription>
              )}
            </div>
          </div>
          {showEnabled && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{enabled ? '已启用' : '未启用'}</span>
              <Switch
                checked={!!enabled}
                onCheckedChange={(v) => onEnabledChange?.(v)}
              />
            </label>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <Field label={clientIdLabel} hint={clientIdHint}>
            <Input
              value={clientId}
              onChange={(e) => onClientIdChange(e.target.value)}
              placeholder={clientIdPlaceholder}
              required
            />
          </Field>

          <Field
            label={clientSecretLabel}
            hint={
              clientSecretHint || (
                <>
                  {hasSecret && (
                    <span className="font-medium text-emerald-600">已设置</span>
                  )}{' '}
                  {hasSecret
                    ? '— 留空表示不修改现有密钥'
                    : '从 Provider 控制台获取(请妥善保管)'}
                </>
              )
            }
          >
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => onClientSecretChange(e.target.value)}
              placeholder={hasSecret ? '••••••••' : '输入 Client Secret'}
              autoComplete="new-password"
            />
          </Field>

          {onCallbackBaseUrlChange !== undefined && (
            <>
              <Field label="网站域名" hint={callbackBaseUrlHint}>
                <Input
                  type="url"
                  value={callbackBaseUrl || ''}
                  onChange={(e) => onCallbackBaseUrlChange(e.target.value)}
                  placeholder="https://your-domain.com"
                  required
                />
              </Field>

              <Field label="回调地址 (自动生成,粘贴到 Provider 控制台)">
                <div className="flex gap-2">
                  <Input
                    value={fullCallback || '请先填写网站域名'}
                    readOnly
                    className="bg-muted/50"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!fullCallback}
                    onClick={() => {
                      navigator.clipboard.writeText(fullCallback);
                      toast.success('已复制到剪贴板');
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    复制
                  </Button>
                </div>
              </Field>
            </>
          )}

          {extras}

          {instructions && (
            <div className="rounded-md border bg-muted/20">
              <button
                type="button"
                onClick={() => setShowInstructions((s) => !s)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium"
              >
                <Info className="h-4 w-4 text-blue-500" />
                <span className="flex-1">如何获取 Client ID / Secret?</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    showInstructions && 'rotate-180',
                  )}
                />
              </button>
              {showInstructions && (
                <div className="border-t px-4 py-3 text-sm text-muted-foreground">
                  {instructions}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? '保存中…' : '保存配置'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
