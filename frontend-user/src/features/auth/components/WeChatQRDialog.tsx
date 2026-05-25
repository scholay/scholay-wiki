import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/ui';
import { WeChatQRPanel } from './WeChatQRPanel';

/**
 * 微信扫码登录 / 绑定的 Dialog 壳。
 *
 * 实际的二维码 + WxLogin SDK 集成抽到 WeChatQRPanel(无 Dialog 包裹)——
 * AuthDialog 直接复用 Panel 走"原地切换"心智(不再嵌套二层 Dialog),
 * 本 Dialog 只剩 settings/ConnectionsPage 的"绑定微信"流程独立使用。
 *
 * 之前历史:同一组件既包 Dialog 又跑 WxLogin 逻辑,从 AuthDialog 触发时弹双层,
 * 扫码成功只关掉里层 → 主登录弹窗仍在,体验混乱。
 */
export function WeChatQRDialog({
  open,
  onOpenChange,
  mode = 'login',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode?: 'login' | 'bind';
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0 border-border">
        <div className="flex flex-col items-center gap-1 pt-6 pb-3 px-6 border-b border-border-soft">
          <DialogTitle className="text-base font-semibold">
            {mode === 'bind' ? '绑定微信' : '使用微信扫一扫'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            打开微信,扫描下方二维码完成
            {mode === 'bind' ? '绑定' : '登录'}
          </DialogDescription>
        </div>

        {/* open=false 时不挂载 Panel(避免后台保留无用 listener / iframe) */}
        {open && (
          <div className="py-4">
            <WeChatQRPanel mode={mode} onSuccess={() => onOpenChange(false)} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
