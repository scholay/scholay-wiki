import { cn } from "@/shared/lib/utils";

export function InviteRewardPoster({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-12 border border-border-hairline bg-surface-1",
        className,
      )}
    >
      <img
        src="/images/invite-reward-poster.png"
        alt="邀请有礼活动海报"
        width={3264}
        height={552}
        decoding="async"
        className="h-28 w-full object-cover object-[30%_center] sm:h-auto sm:object-center"
      />
    </div>
  );
}
