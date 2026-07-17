// 进程级并发准入(性能审计 P0)。
//
// 背景:scholar_agent 是 Bun 单进程多租户容器,同时承载 claw/smart-search/prism/peerreview 四个 AI
// feature 的全部并发。每连接虽有 inFlight 守卫(一连接一轮),但【不同连接】各跑一轮 runTurn 是无上限的
// —— 审计实测单会话峰值 ~765MiB,约 2 个重会话即打爆 1.5G 容器,拖垮所有租户。
//
// 这里给一个进程级并发上限:同时执行的主 turn 数不超过 MAX_CONCURRENT_TURNS。满了即刻回 busy(可重试),
// 不排队 —— 排队会让请求连同其连接/半成品状态堆在内存里,与「限内存」初衷相悖;即刻拒 + 客户端重试是干净的背压。
// 标题生成 / 记忆抽取 / math / mermaid 等旁路负载不占此配额(它们各有自己的串行队列或属轻量旁路)。
//
// 阈值按容器内存标定:1.5G ≈ 2;若把 compose 内存上限提到 3-4G,同步调大 EXECUTOR_MAX_CONCURRENT_TURNS。

const MAX_CONCURRENT_TURNS = Math.max(1, Number(process.env.EXECUTOR_MAX_CONCURRENT_TURNS || 2));

let active = 0;

/** 当前占用的并发槽数(可观测)。 */
export function turnSlotsInUse(): number {
  return active;
}

/** 并发槽上限。 */
export function maxTurnSlots(): number {
  return MAX_CONCURRENT_TURNS;
}

/**
 * 非阻塞占一个并发槽。成功返回一个幂等的 release 函数;已满返回 null(调用方应回 busy 让客户端重试)。
 * release 多次调用安全(只在首次真正归还)。
 */
export function tryAcquireTurn(): (() => void) | null {
  if (active >= MAX_CONCURRENT_TURNS) return null;
  active++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active--;
  };
}
