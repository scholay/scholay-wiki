import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { cn } from '@/shared/lib/utils';

/**
 * 移动端详情顶栏 —— 论文 / 期刊 / 学者三类详情页(同 canonical URL,SEO 落地)在手机上
 * 用它替代 PC 的多页签条 BrowserTabsBar(390px 下多页签无意义)。
 *   返回(navigate(-1))+ 分类标签 + 分享(navigator.share / 复制链接)。
 * 实体大标题在下方 pane 正文里,故顶栏只放分类标签,不重复标题、也不需要数据。
 * 仅移动端渲染(BrowserPage 用 sm:hidden 控制),不改 URL → 不影响 SEO/canonical。
 */
export function MobileDetailHeader({ label, className }: { label: string; className?: string }) {
  const navigate = useNavigate();

  const share = async () => {
    const url = window.location.href;
    const title = document.title || label;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* 用户取消分享,不打扰 */
      }
      return;
    }
    const ok = await copyToClipboard(url);
    if (ok) toast.success('已复制链接');
    else toast.error('复制失败,请手动复制地址栏链接');
  };

  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center gap-1 border-b border-border bg-background px-2',
        className
      )}
    >
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="返回"
        className="flex size-9 items-center justify-center rounded-pill text-foreground transition-transform active:scale-90 active:bg-surface-2"
      >
        <ChevronLeft className="size-5" />
      </button>
      <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{label}</span>
      <button
        type="button"
        onClick={share}
        aria-label="分享"
        className="flex size-9 items-center justify-center rounded-pill text-muted-foreground transition-transform active:scale-90 active:bg-surface-2"
      >
        <Share2 className="size-5" />
      </button>
    </header>
  );
}
