import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Hourglass,
  RefreshCcw,
  Search,
  Send,
  Square,
  WifiOff,
} from "lucide-react";

/**
 * Claw 运行状态图例 · 纯样式 fixture。
 * 每张卡是互斥状态，不把执行中、断线和未发送伪装成同一轮同时发生。
 */
export function WikiEmbedClawRunStates() {
  return (
    <div
      className="w-[min(100%,44rem)] rounded-12 border border-border bg-surface-card p-4"
      aria-hidden
      data-wiki-fixture="claw-run-states"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-14 font-medium text-foreground">
            如何识别一轮的真实状态
          </p>
          <p className="mt-1 text-12 text-faint">
            以下为互斥示例，不是同一会话的并发状态。
          </p>
        </div>
        <span className="shrink-0 rounded-pill bg-surface-1 px-3 py-1 text-12 text-subtle">
          状态图例
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <StateCard
          icon={Search}
          title="工具执行中"
          tone="neutral"
          meta="文献检索 · 已运行 18 秒"
          body="连接正常，本轮仍在运行；可主动停止。"
          action="停止本轮"
          actionIcon={Square}
        />
        <StateCard
          icon={CheckCircle2}
          title="已完成并送达"
          tone="success"
          meta="报告生成 · 刚刚"
          body="后端已确认本轮，文件已进入扩展区。"
          action="查看交付物"
          actionIcon={Send}
        />
        <StateCard
          icon={Hourglass}
          title="长时间无新进展"
          tone="warning"
          meta="软提示，不等于服务已终止"
          body="复杂任务可能仍在执行，可继续等待或停止。"
          action="继续等待"
          actionIcon={Clock3}
        />
        <StateCard
          icon={WifiOff}
          title="连接已断开"
          tone="danger"
          meta="消息尚未确认送达"
          body="界面正在重连；未发送内容不会伪装成用户气泡。"
          action="重新发送"
          actionIcon={RefreshCcw}
        />
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-8 border border-brand-amber/30 bg-warning-soft px-3 py-2 text-12 text-subtle">
        <AlertTriangle className="size-3.5 shrink-0 text-brand-amber" />
        另一标签页接管时会单独提示“切回这里”，不会与普通重连共用文案。
      </div>
    </div>
  );
}

function StateCard({
  icon: Icon,
  title,
  tone,
  meta,
  body,
  action,
  actionIcon: ActionIcon,
}: {
  icon: typeof Search;
  title: string;
  tone: "neutral" | "success" | "warning" | "danger";
  meta: string;
  body: string;
  action: string;
  actionIcon: typeof Search;
}) {
  const iconTone =
    tone === "success"
      ? "text-brand-green"
      : tone === "warning"
        ? "text-brand-amber"
        : tone === "danger"
          ? "text-brand-red"
          : "text-subtle";

  return (
    <div className="rounded-8 border border-border-soft bg-surface-1 p-3">
      <div className="flex items-center gap-2">
        <Icon className={`size-4 shrink-0 ${iconTone}`} />
        <p className="text-12 font-medium text-foreground">{title}</p>
      </div>
      <p className="mt-2 text-12 text-faint">{meta}</p>
      <p className="mt-1 text-12 leading-paragraph text-subtle">{body}</p>
      <span className="mt-3 inline-flex h-7 items-center gap-1 rounded-8 border border-border bg-surface-card px-2 text-12 text-foreground">
        <ActionIcon className="size-3" />
        {action}
      </span>
    </div>
  );
}
