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
import { Plus, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { WeChatIcon } from '../../../components/icons/providers';

interface WechatPayConfig {
  id: number;
  mch_id: string;
  app_id: string;
  api_v3_key: string;
  serial_no: string;
  private_key: string;
  notify_url: string;
  is_sandbox: boolean;
  is_active: boolean;
}

interface FormState {
  mch_id: string;
  app_id: string;
  api_v3_key: string;
  serial_no: string;
  private_key: string;
  notify_url: string;
  is_sandbox: boolean;
  is_active: boolean;
}

const WechatPayTab = React.memo(() => {
  const { isVerified, verifyEpoch } = useSettingsContext();
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<WechatPayConfig[]>([]);
  const [editing, setEditing] = useState<WechatPayConfig | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WechatPayConfig | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  function emptyForm(): FormState {
    return {
      mch_id: '', app_id: '', api_v3_key: '', serial_no: '', private_key: '',
      notify_url: typeof window !== 'undefined' ? `${window.location.origin}/api/v1/payment/wechat/notify` : '',
      is_sandbox: false, is_active: false,
    };
  }

  const load = useCallback(async (showSensitive: boolean) => {
    setLoading(true);
    try {
      const r = await adminAPI.getWeChatPayConfigs(showSensitive);
      if (r.data.code === 0 && r.data.data) setList(r.data.data || []);
    } catch {
      showToast('加载微信支付配置失败', 'error');
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
  function openEdit(c: WechatPayConfig) {
    setEditing(c);
    setForm({
      mch_id: c.mch_id,
      app_id: c.app_id,
      api_v3_key: c.api_v3_key?.includes('****') ? '' : c.api_v3_key,
      serial_no: c.serial_no,
      private_key: c.private_key?.includes('****') ? '' : c.private_key,
      notify_url: c.notify_url,
      is_sandbox: c.is_sandbox,
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
        if (!data.api_v3_key) delete data.api_v3_key;
        if (!data.private_key) delete data.private_key;
        r = await adminAPI.updateWeChatPayConfig(editing.id, data);
      } else {
        r = await adminAPI.createWeChatPayConfig(form);
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
      const r = await adminAPI.deleteWeChatPayConfig(deleteTarget.id);
      if (r.data.code === 0) {
        showToast('已删除', 'success');
        setDeleteTarget(null);
        load(isVerified);
      }
    } catch { showToast('删除失败', 'error'); }
  }

  async function handleActivate(id: number) {
    try {
      const r = await adminAPI.activateWeChatPayConfig(id);
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
                <CardTitle>微信支付</CardTitle>
                <CardDescription>管理多个商户号,选择一个激活</CardDescription>
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
            <EmptyState title="暂无微信支付配置" description="点击右上角添加" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((c) => (
                <Card key={c.id} className={c.is_active ? 'border-primary/60 bg-primary/5' : undefined}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">商户 {c.mch_id}</span>
                          {c.is_active && <Badge variant="success">已激活</Badge>}
                          {c.is_sandbox && <Badge variant="outline">沙箱</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">App ID: {c.app_id}</span>
                      </div>
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
            <DialogTitle>{editing ? '编辑微信支付配置' : '添加微信支付配置'}</DialogTitle>
            <DialogDescription>从微信商户平台获取相关密钥</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>商户号 (mch_id)</Label>
                <Input value={form.mch_id} onChange={(e) => setForm({ ...form, mch_id: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>App ID</Label>
                <Input value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>API v3 密钥</Label>
                <Input type="password" value={form.api_v3_key} onChange={(e) => setForm({ ...form, api_v3_key: e.target.value })} placeholder={editing ? '留空表示不修改' : ''} />
              </div>
              <div className="space-y-1.5">
                <Label>证书序列号 (serial_no)</Label>
                <Input value={form.serial_no} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>商户私钥 (PEM 格式)</Label>
              <textarea
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                value={form.private_key}
                onChange={(e) => setForm({ ...form, private_key: e.target.value })}
                placeholder={editing ? '留空表示不修改' : '-----BEGIN PRIVATE KEY-----\n...'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>支付通知 URL</Label>
              <Input type="url" value={form.notify_url} onChange={(e) => setForm({ ...form, notify_url: e.target.value })} required />
            </div>
            <div className="flex items-center gap-6">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <Switch checked={form.is_sandbox} onCheckedChange={(v) => setForm({ ...form, is_sandbox: v })} />
                沙箱环境
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                创建后立即激活
              </label>
            </div>
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
        description={`将删除商户号 "${deleteTarget?.mch_id}" 的微信支付配置`}
        destructive
        loading={loading}
        onConfirm={handleDelete}
      />
    </div>
  );
});

WechatPayTab.displayName = 'WechatPayTab';
export default WechatPayTab;
