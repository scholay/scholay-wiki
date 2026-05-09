import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { EmptyState } from '../../components/ui/empty-state';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { Plus, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { WeChatIcon } from '../../../components/icons/providers';

interface WechatConfig {
  id: number;
  app_id: string;
  app_secret: string;
  redirect_uri: string;
  scope: string;
  is_active: boolean;
}

interface FormState {
  app_id: string;
  app_secret: string;
  redirect_uri: string;
  scope: string;
  is_active: boolean;
}

const WechatOAuthTab = React.memo(() => {
  const { isVerified, verifyEpoch } = useSettingsContext();
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<WechatConfig[]>([]);
  const [editing, setEditing] = useState<WechatConfig | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WechatConfig | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  function emptyForm(): FormState {
    return {
      app_id: '',
      app_secret: '',
      redirect_uri: typeof window !== 'undefined' ? `${window.location.origin}/wechat/callback` : '',
      scope: 'snsapi_login',
      is_active: false,
    };
  }

  const load = useCallback(async (showSensitive: boolean) => {
    setLoading(true);
    try {
      const r = await adminAPI.getWeChatConfigs(showSensitive);
      if (r.data.code === 0 && r.data.data) setList(r.data.data || []);
    } catch {
      showToast('加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(isVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  }
  function openEdit(c: WechatConfig) {
    setEditing(c);
    setForm({
      app_id: c.app_id,
      app_secret: c.app_secret?.includes('****') ? '' : c.app_secret,
      redirect_uri: c.redirect_uri,
      scope: c.scope || 'snsapi_login',
      is_active: c.is_active,
    });
    setShowForm(true);
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      let r;
      if (editing) {
        const data: Partial<FormState> = { ...form };
        if (!data.app_secret) delete data.app_secret;
        r = await adminAPI.updateWeChatConfig(editing.id, data);
      } else {
        r = await adminAPI.createWeChatConfig(form);
      }
      if (r.data.code === 0) {
        showToast(editing ? '已更新' : '已创建', 'success');
        setShowForm(false);
        load(isVerified);
      } else {
        showToast(r.data.message || '操作失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '操作失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const r = await adminAPI.deleteWeChatConfig(deleteTarget.id);
      if (r.data.code === 0) {
        showToast('已删除', 'success');
        setDeleteTarget(null);
        load(isVerified);
      }
    } catch { showToast('删除失败', 'error'); }
  }

  async function handleActivate(id: number) {
    try {
      const r = await adminAPI.activateWeChatConfig(id);
      if (r.data.code === 0) {
        showToast('已激活', 'success');
        load(isVerified);
      }
    } catch { showToast('激活失败', 'error'); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-muted/50 p-2">
                <WeChatIcon size={22} />
              </div>
              <div>
                <CardTitle>微信扫码登录</CardTitle>
                <CardDescription>微信开放平台 / 公众号 OAuth 登录配置(可建多个,激活其一)</CardDescription>
              </div>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              添加配置
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {loading && list.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
          ) : list.length === 0 ? (
            <EmptyState title="暂无微信登录配置" description="点击右上角添加" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((c) => (
                <Card key={c.id} className={c.is_active ? 'border-primary/60 bg-primary/5' : undefined}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.app_id}</span>
                        {c.is_active && <Badge variant="success">已激活</Badge>}
                        <Badge variant="outline">{c.scope}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        callback: {c.redirect_uri}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!c.is_active && (
                        <Button variant="outline" size="sm" onClick={() => handleActivate(c.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          激活
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(c)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(o) => !o && setShowForm(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑微信登录配置' : '添加微信登录配置'}</DialogTitle>
            <DialogDescription>
              snsapi_login = 网站扫码 · snsapi_userinfo = 公众号网页授权
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>App ID</Label>
                <Input value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>Scope (授权范围)</Label>
                <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="snsapi_login">snsapi_login (扫码登录)</SelectItem>
                    <SelectItem value="snsapi_base">snsapi_base (静默授权)</SelectItem>
                    <SelectItem value="snsapi_userinfo">snsapi_userinfo (公众号授权)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>App Secret</Label>
              <Input
                type="password"
                value={form.app_secret}
                onChange={(e) => setForm({ ...form, app_secret: e.target.value })}
                placeholder={editing ? '留空表示不修改' : ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label>回调地址 (Redirect URI)</Label>
              <Input type="url" value={form.redirect_uri} onChange={(e) => setForm({ ...form, redirect_uri: e.target.value })} required />
              <p className="text-xs text-muted-foreground">需要在微信开放平台 / 公众号后台 OAuth 域名白名单中配置</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              创建后立即激活
            </label>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>取消</Button>
              <Button type="submit" disabled={loading}>{loading ? '保存中…' : '保存'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="删除该配置?"
        description={`将删除 App ID 为 "${deleteTarget?.app_id}" 的微信登录配置`}
        destructive
        loading={loading}
        onConfirm={handleDelete}
      />
    </div>
  );
});

WechatOAuthTab.displayName = 'WechatOAuthTab';
export default WechatOAuthTab;
