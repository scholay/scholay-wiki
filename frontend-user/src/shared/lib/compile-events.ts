// prism 编译状态推送的事件桥(2026-08-12 推送化)。
//
// 链路:后端编译状态翻转 → 通知 WS(per-user 常连,useNotificationSocket)下发
// type='compile_status' 消息 → 这里定义的 window CustomEvent → prism 的 useCompile
// 监听后 setQueryData,把 1s 轮询降级为 5s 兜底。
// 走 window 事件而不是让 useNotificationSocket 直接写 prism 的 queryKey:
// 通知 socket 是 shared 层,不该知道任何 feature 的缓存键形状(分层约束)。
export const PRISM_COMPILE_STATUS_EVENT = 'prism-compile-status';

/** 与后端 prism.Compile 的 JSON 序列化对齐(mirrors backend/internal/prism/model.go Compile)。
 *  这里只声明路由/去重需要的字段,完整形状由 prism 侧的 PrismCompile 类型消费。 */
export interface PrismCompileStatusDetail {
  id: number;
  project_id: number;
  status: string;
  [key: string]: unknown;
}

export function dispatchPrismCompileStatus(detail: PrismCompileStatusDetail): void {
  window.dispatchEvent(new CustomEvent(PRISM_COMPILE_STATUS_EVENT, { detail }));
}
