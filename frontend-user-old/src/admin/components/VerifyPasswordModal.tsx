import { useState, type FormEvent } from 'react';
import { ShieldAlert } from 'lucide-react';
import { adminAPI } from '../services/api';
import { showToast } from './Toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export interface VerifyPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
}

/**
 * 二次验证管理员密码 — 用于查看敏感字段(API key / Secret 等)前。
 * 用 shadcn Dialog,跟整个 v2 配置中心视觉统一。
 */
export default function VerifyPasswordModal({
  isOpen,
  onClose,
  onVerified,
}: VerifyPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password.trim()) {
      showToast('请输入密码', 'error');
      return;
    }
    setLoading(true);
    try {
      const r = await adminAPI.verifyPassword(password);
      if (r.data.code === 0) {
        showToast('验证成功', 'success');
        setPassword('');
        onVerified();
        onClose();
      } else {
        showToast(r.data.message || '密码错误', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '验证失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  function handleOpenChange(open: boolean) {
    if (loading) return; // 验证中禁止关闭
    if (!open) {
      setPassword('');
      onClose();
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <DialogTitle className="text-center">安全验证</DialogTitle>
          <DialogDescription className="text-center">
            查看敏感字段(API Key / Secret 等)前需要再次验证管理员密码
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="verify-password">管理员密码</Label>
            <Input
              id="verify-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入登录密码"
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => handleOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '验证中…' : '验证并查看'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
