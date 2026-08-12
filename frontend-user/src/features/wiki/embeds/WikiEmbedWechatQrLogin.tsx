import { MessageCircle, ScanLine, ShieldCheck } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

/**
 * 微信扫码登录 · 纯样式 fixture。
 * 来源：product-mock auth/components/WeChatQRDialog.tsx + WeChatQRPanel.tsx。
 */
export function WikiEmbedWechatQrLogin() {
  return (
    <div
      className="w-[min(100%,24rem)] overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay"
      aria-hidden
      data-wiki-fixture="wechat-qr-login"
    >
      <div className="flex flex-col items-center border-b border-border px-6 pb-4 pt-6 text-center">
        <span className="inline-flex size-9 items-center justify-center rounded-pill bg-brand-green-soft text-brand-green">
          <MessageCircle className="size-4" />
        </span>
        <p className="mt-3 text-16 font-medium text-foreground">
          使用微信扫一扫
        </p>
        <p className="mt-1 text-12 text-muted-foreground">
          扫码后请在手机端确认授权
        </p>
      </div>

      <div className="flex flex-col items-center px-6 py-6">
        <div className="rounded-8 border border-border bg-on-dark p-3">
          <QRCodeCanvas
            value="https://scholay.com/wiki/wechat-demo"
            size={180}
            level="M"
            marginSize={1}
          />
        </div>
        <span className="mt-3 inline-flex items-center gap-1 rounded-pill bg-surface-1 px-3 py-1 text-12 text-faint">
          <ScanLine className="size-3" /> 演示二维码 · 不连接微信服务
        </span>
        <div className="mt-4 flex items-start gap-2 rounded-8 border border-border bg-surface-1 p-3">
          <ShieldCheck className="mt-1 size-4 shrink-0 text-brand-green" />
          <p className="text-12 leading-paragraph text-muted-foreground">
            登录与绑定共用扫码面板；授权成功后由回调页确认结果。
          </p>
        </div>
      </div>
    </div>
  );
}
