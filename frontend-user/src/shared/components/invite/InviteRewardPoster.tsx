import { cn } from "@/shared/lib/utils";

export function InviteRewardPoster({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-12 border border-border-hairline bg-surface-1",
        className,
      )}
    >
      {/* v2.webp = 原 3264px PNG(1.97MB)重导出 1632px WebP(76KB)。原 PNG 必须保留:
          已部署的旧 chunk 仍引用旧文件名,且 /images/ 吃 1y immutable,换内容必须换文件名。 */}
      <img
        src="/images/invite-reward-poster-v2.webp"
        alt="邀请有礼活动海报"
        width={1632}
        height={276}
        decoding="async"
        loading="lazy"
        className="h-28 w-full object-cover object-[30%_center] sm:h-auto sm:object-center"
      />
    </div>
  );
}
