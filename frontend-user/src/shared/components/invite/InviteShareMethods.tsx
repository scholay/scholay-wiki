import { useRef } from "react";
import { Check, Copy, Download, Link2, QrCode, Share2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

export interface InviteShareMethodsProps {
  code: string;
  url: string;
  className?: string;
}

// 页面上缩放显示，但导出保留 512px 和四模块 quiet zone，避免下载图扫码不稳。
const QR_SIZE = 512;

function qrFileName(code: string) {
  const safeCode = code.replace(/[^a-zA-Z0-9_-]/g, "") || "invite";
  return `scholay-invite-${safeCode}.png`;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * 邀请信息的三种分享方式。
 *
 * - 链接：不把长 URL 露在界面上，hover / focus 可查看对应邀请码。
 * - 邀请码：码本体和尾部按钮都可复制。
 * - 二维码：始终可预览；有 Web Share 时唤起系统分享，否则下载 PNG。
 *
 * 页面只需传入后端 `GET /user/invite` 返回的 code / url，不重复实现
 * 剪贴板、二维码或降级逻辑。
 */
export function InviteShareMethods({
  code,
  url,
  className,
}: InviteShareMethodsProps) {
  const qrRef = useRef<HTMLCanvasElement>(null);

  const copy = async (value: string, successMessage: string) => {
    if (await copyToClipboard(value)) toast.success(successMessage);
    else toast.error("复制失败，请稍后重试");
  };

  const downloadQr = async (blob?: Blob | null) => {
    const qrBlob =
      blob ?? (qrRef.current ? await canvasToBlob(qrRef.current) : null);
    if (!qrBlob) {
      toast.error("二维码生成失败，请稍后重试");
      return;
    }
    downloadBlob(qrBlob, qrFileName(code));
    toast.success("邀请二维码已下载");
  };

  const shareOrDownloadQr = async () => {
    const canvas = qrRef.current;
    if (!canvas) return;

    const blob = await canvasToBlob(canvas);
    const share =
      typeof navigator !== "undefined" && typeof navigator.share === "function"
        ? navigator.share.bind(navigator)
        : null;

    if (!share) {
      await downloadQr(blob);
      return;
    }

    try {
      if (blob && typeof File !== "undefined") {
        const file = new File([blob], qrFileName(code), {
          type: "image/png",
        });
        let canShareFile = false;
        try {
          canShareFile = navigator.canShare?.({ files: [file] }) === true;
        } catch {
          // 部分 WebView 会对 files 参数抛异常，继续用 URL 分享。
        }
        if (canShareFile) {
          await share({
            title: "Scholay 邀请",
            text: `邀请码：${code}`,
            files: [file],
          });
          return;
        }
      }

      await share({
        title: "Scholay 邀请",
        text: `邀请码：${code}`,
        url,
      });
    } catch (error) {
      // DOMException 在 Safari / WebView / iframe 中可能来自不同 realm，不能依赖 instanceof Error。
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError"
      ) {
        return;
      }
      await downloadQr(blob);
    }
  };

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 divide-y divide-border overflow-hidden rounded-12 border border-border bg-surface-card sm:grid-cols-3 sm:divide-x sm:divide-y-0",
        className,
      )}
      aria-label="邀请分享方式"
    >
      <section className="flex min-w-0 flex-col p-3">
        <div className="flex items-center gap-2 text-14 font-medium text-foreground">
          <span className="flex size-8 items-center justify-center rounded-8 bg-brand-red/10 text-brand-red">
            <Link2 className="size-4" />
          </span>
          链接
        </div>
        <div className="mt-auto pt-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-9 w-full"
                title={`邀请码：${code}`}
                aria-label="复制邀请链接"
                onClick={() => void copy(url, "邀请链接已复制")}
              >
                <Copy />
                复制链接
              </Button>
            </TooltipTrigger>
            <TooltipContent>邀请码：{code}</TooltipContent>
          </Tooltip>
        </div>
      </section>

      <section className="flex min-w-0 flex-col p-3">
        <div className="flex items-center gap-2 text-14 font-medium text-foreground">
          <span className="flex size-8 items-center justify-center rounded-8 bg-brand-green/10 text-brand-green">
            <Check className="size-4" />
          </span>
          邀请码
        </div>
        <div className="mt-auto pt-3">
          <div className="flex h-9 items-center rounded-8 border border-border-control-emphasis bg-surface-1">
            <button
              type="button"
              className="min-w-0 flex-1 truncate px-3 text-left text-14 font-medium tracking-code text-foreground"
              onClick={() => void copy(code, "邀请码已复制")}
              aria-label={`复制邀请码 ${code}`}
            >
              {code}
            </button>
            <button
              type="button"
              className="flex size-9 shrink-0 items-center justify-center border-l border-border text-faint transition-colors hover:bg-surface-2 hover:text-foreground"
              onClick={() => void copy(code, "邀请码已复制")}
              aria-label="复制邀请码"
              title="复制邀请码"
            >
              <Copy className="size-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="flex min-w-0 flex-col p-3">
        <div className="flex items-center gap-2 text-14 font-medium text-foreground">
          <span className="flex size-8 items-center justify-center rounded-8 bg-brand-amber-soft text-brand-amber">
            <QrCode className="size-4" />
          </span>
          二维码
        </div>
        <div className="mt-auto pt-3">
          <button
            type="button"
            className="group/qr flex w-full min-w-0 items-center gap-3 rounded-8 bg-surface-1 px-2 text-left transition-colors hover:bg-surface-2"
            onClick={() => void shareOrDownloadQr()}
            aria-label="分享或下载邀请二维码"
          >
            <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-8 border border-border bg-surface-card p-1.5 transition-colors group-hover/qr:border-border-control-emphasis">
              <QRCodeCanvas
                ref={qrRef}
                value={url}
                size={QR_SIZE}
                level="M"
                marginSize={4}
                className="block max-h-full max-w-full"
                // qrcode.react 会把 size 同时写成 512px inline style；显式覆盖
                // CSS 展示尺寸，画布像素仍保留 512px 供分享与下载。
                style={{ width: "100%", height: "100%" }}
              />
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-12 font-medium text-foreground">
              {typeof navigator !== "undefined" &&
              typeof (navigator as { share?: unknown }).share === "function" ? (
                <Share2 className="size-3.5" />
              ) : (
                <Download className="size-3.5" />
              )}
              分享或下载
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
