import { CircleSlash } from 'lucide-react';

/**
 * 「已暂停」收尾标识 —— 用户点"停止生成"打断一轮对话后, 在该 turn 末尾展示。
 *
 * 与 ToolCallBlock 内的单工具「已停止」(ToolBlock.aborted) 区分:
 *   - 那个是"某个在途工具没拿到结果"
 *   - 这个是"整轮被用户主动暂停"
 *
 * 实时 (点 stop) 与历史回放 (重入) 都用同一个组件, 视觉一致。smart-search / claw 共用。
 */
export function PausedNotice() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-sm bg-surface-2 px-2 py-1 text-2xs font-semibold text-muted-foreground">
      <CircleSlash className="size-3 shrink-0" />
      已暂停
    </div>
  );
}
