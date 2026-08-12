import { Loader2 } from "lucide-react";

/**
 * OAuth 回调页的初始处理中状态 · 纯样式 fixture。
 * 来源：current auth/pages/OAuthCallbackPage.tsx；互斥的成功、失败与账号合并状态不并排拼接。
 */
export function WikiEmbedOAuthCallbackStates() {
  return (
    <div
      className="flex h-80 w-[min(100%,42rem)] items-center justify-center bg-background px-6"
      aria-hidden
      data-wiki-fixture="oauth-callback-states"
    >
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <Loader2 className="size-8 text-muted-foreground" />
        <p className="text-12 text-muted-foreground">正在完成 GitHub 登录…</p>
      </div>
    </div>
  );
}

/**
 * 微信 callback 独立中转页的初始处理态 · 纯样式 fixture。
 * 来源：current auth/pages/WeChatCallbackPage.tsx；iframe 成功态与独立访问错误态互斥。
 */
export function WikiEmbedWechatCallbackState() {
  return (
    <div
      className="flex h-80 w-[min(100%,42rem)] items-center justify-center bg-background px-6"
      aria-hidden
      data-wiki-fixture="wechat-callback-state"
    >
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <Loader2 className="size-8 text-muted-foreground" />
        <p className="text-12 text-muted-foreground">正在完成微信扫码…</p>
      </div>
    </div>
  );
}
