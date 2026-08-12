import { X } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

/**
 * 微信扫码登录 Dialog 的等待扫码态 · 纯样式 fixture。
 * 来源：current auth/components/WeChatQRDialog.tsx + WeChatQRPanel.tsx。
 */
export function WikiEmbedWechatQrLogin() {
  return (
    <div
      className="relative w-[24rem] max-w-full overflow-hidden rounded-16 border border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="wechat-qr-login"
    >
      <X className="absolute right-4 top-4 size-4 text-foreground opacity-70" />
      <div className="flex flex-col items-center gap-1 border-b border-border-soft px-6 pb-3 pt-6">
        <p className="text-16 font-medium text-foreground">使用微信扫一扫</p>
        <p className="text-12 text-muted-foreground">
          打开微信,扫描下方二维码完成登录
        </p>
      </div>

      <div className="py-4">
        <div className="flex flex-col items-center justify-center py-2">
          <div className="flex h-[240px] w-[220px] items-start justify-center overflow-hidden bg-surface-card">
            <QRCodeCanvas
              value="https://scholay.com/wechat/callback?code=wiki-preview&state=wechat-login"
              size={200}
              level="M"
              marginSize={0}
            />
          </div>
          <span className="mt-3 block h-4 text-12 text-faint">
            扫码后请在手机端确认授权
          </span>
        </div>
      </div>
    </div>
  );
}

/** 同一 WeChatQRDialog 在账户连接页中的绑定等待态。 */
export function WikiEmbedWechatQrBinding() {
  return (
    <div
      className="relative w-[24rem] max-w-full overflow-hidden rounded-16 border border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="wechat-qr-binding"
    >
      <X className="absolute right-4 top-4 size-4 text-foreground opacity-70" />
      <div className="flex flex-col items-center gap-1 border-b border-border-soft px-6 pb-3 pt-6">
        <p className="text-16 font-medium text-foreground">绑定微信</p>
        <p className="text-12 text-muted-foreground">
          打开微信，扫描下方二维码完成绑定
        </p>
      </div>
      <div className="py-4">
        <div className="flex flex-col items-center justify-center py-2">
          <div className="flex h-[240px] w-[220px] items-start justify-center overflow-hidden bg-surface-card">
            <QRCodeCanvas
              value="https://scholay.com/wechat/callback?code=wiki-preview&state=wechat-bind"
              size={200}
              level="M"
              marginSize={0}
            />
          </div>
          <span className="mt-3 block h-4 text-12 text-faint">
            扫码后请在手机端确认授权
          </span>
        </div>
      </div>
    </div>
  );
}
