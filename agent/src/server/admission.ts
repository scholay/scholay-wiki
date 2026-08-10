import { readFileSync } from "node:fs";
import { log } from "../obs/log.ts";

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
// 阈值按容器内存标定:1.5G ≈ 2。
//
// ⚠️ 2026-08-05 曾把并发槽刻意钉在 2(4G = 2×765MiB 峰值 + 1×800MB statkit + 头,按最坏
//    体积×槽数预留)。2026-08-10 线上事故:部署后用户扎堆,2 槽被打满,第 3 个用户起每条
//    消息瞬时 busy(admin 后台连环 4ms 失败轮)—— 「按最坏体积预留」把常见的轻负载并发
//    也挡死了。现口径改为「槽数放宽(prod=4,经 compose env)+ RSS 真实水位闸兜底」:
//      · 槽约束「同时几条 turn」;statkit 仍由 StatRun 信号量=1 单独约束;
//      · 真正防 OOM 的是下面的 RSS 闸 —— 按进程真实体积准入,而不是按最坏假设拒人。

/** parseSlots —— env 槽位数解析。非法值(如 "8x")回落默认 2:Math.max(1, NaN)=NaN 会让
 * `active >= NaN` 恒 false = 静默取消并发上限,且 /api/admission 的 max 序列化成 null
 * 误导 backend 的让路闸(2026-08-10 复审)。 */
export function parseSlots(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
}

const MAX_CONCURRENT_TURNS = parseSlots(process.env.EXECUTOR_MAX_CONCURRENT_TURNS);

// ── 内存水位闸(2026-08-10)───────────────────────────────────────────────────
// 并发槽只约束「同时几条 turn」,不感知每条的真实体积。prod 把槽位从 2 提到 4 后,
// 4×765MiB 峰值 + 1×800MB statkit 在 4G 容器里没有余量 —— 上面注释里「先算这道题」
// 的答案就是这道闸:槽位之外再看**容器真实用量**,超水位即拒新 turn(同样回 busy
// 可重试),在「撞 cgroup OOM、连坐所有租户」之前刹车。
//
// 度量口径(2026-08-10 复审定稿):**cgroup 当前用量 − inactive_file**(docker stats 同口径),
// 而不是 Bun 进程自身 RSS —— OOM 账上算的是整个 cgroup,statkit(~800MB pandas)/bash/
// weasyprint 都是独立 PID,只看父进程 RSS 会对它们全盲;减 inactive_file 是剔除可回收页缓存。
// 读不到 cgroup(裸机/dev)→ 回落 Bun 进程 RSS。
//   · 水位默认 = cgroup 内存上限 × 70%;上限也读不到 → 闸不启用(行为同旧版,启动日志明示);
//   · env EXECUTOR_ADMIT_MAX_RSS_MB 显式覆盖(0/负值 = 强制关闭)。
//
// ⚠️ 诚实边界:这是**准入时点**的检查 —— 已放行的轮在其后数分钟才长到峰值,同一秒内
// 4 条重轮齐发仍可能越顶(概率窗口大幅收窄,不是数学上限);兜底是 cgroup OOM 只杀容器内
// 进程 + compose 自动重启。要绝对上限只能回到「按最坏体积×槽数预留」= 槽位退回 2。
function readCgroupFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function readCgroupMemLimitBytes(): number | null {
  const v2 = readCgroupFile("/sys/fs/cgroup/memory.max")?.trim();
  if (v2 && v2 !== "max") {
    const n = Number(v2);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const v1 = readCgroupFile("/sys/fs/cgroup/memory/memory.limit_in_bytes")?.trim();
  if (v1) {
    const n = Number(v1);
    // v1 无限制时是一个巨大的哨兵值(约 2^63),> 1TiB 视为无限制
    if (Number.isFinite(n) && n > 0 && n < 1024 ** 4) return n;
  }
  return null;
}

function inactiveFileBytes(statRaw: string | null, key: string): number {
  if (!statRaw) return 0;
  for (const line of statRaw.split("\n")) {
    if (line.startsWith(key + " ")) {
      const n = Number(line.slice(key.length + 1));
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
  }
  return 0;
}

/** containerMemUsageBytes —— 当前内存用量(cgroup usage − inactive_file;无 cgroup 回落进程 RSS)。 */
export function containerMemUsageBytes(): number {
  const v2 = readCgroupFile("/sys/fs/cgroup/memory.current")?.trim();
  if (v2) {
    const n = Number(v2);
    if (Number.isFinite(n) && n > 0) {
      return Math.max(0, n - inactiveFileBytes(readCgroupFile("/sys/fs/cgroup/memory.stat"), "inactive_file"));
    }
  }
  const v1 = readCgroupFile("/sys/fs/cgroup/memory/memory.usage_in_bytes")?.trim();
  if (v1) {
    const n = Number(v1);
    if (Number.isFinite(n) && n > 0) {
      return Math.max(0, n - inactiveFileBytes(readCgroupFile("/sys/fs/cgroup/memory/memory.stat"), "total_inactive_file"));
    }
  }
  // 裸机/dev 回落:只看得见自己(rss() 快路径,退化到全量 memoryUsage)
  return process.memoryUsage.rss?.() ?? process.memoryUsage().rss;
}

const ADMIT_MEM_LIMIT_BYTES: number | null = (() => {
  const raw = process.env.EXECUTOR_ADMIT_MAX_RSS_MB;
  if (raw !== undefined && raw !== "") {
    const mb = Number(raw);
    return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : null; // 0/负值 = 强制关闭
  }
  const cg = readCgroupMemLimitBytes();
  return cg ? Math.floor(cg * 0.7) : null;
})();

/** admitByMemory —— 水位判定(纯函数,供测试注入 usage/limit)。 */
export function admitByMemory(usageBytes: number, limitBytes: number | null): boolean {
  return limitBytes === null || usageBytes <= limitBytes;
}

/** 当前水位配置(可观测,/api/admission 报数用)。null = 未启用。 */
export function rssAdmitLimitBytes(): number | null {
  return ADMIT_MEM_LIMIT_BYTES;
}

// 启动即声明闸的状态:水位闸静默不启用(dev 无内存限制/裸机)时,「以为有保护其实没有」
// 是最贵的一种误会(2026-08-10 复审)。一行日志把口径钉死在启动输出里。
log.info("turn admission configured", {
  slots: MAX_CONCURRENT_TURNS,
  mem_watermark_bytes: ADMIT_MEM_LIMIT_BYTES,
  mem_gate: ADMIT_MEM_LIMIT_BYTES === null ? "disabled (no cgroup limit / env off)" : "enabled",
});

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
  if (!admitByMemory(containerMemUsageBytes(), ADMIT_MEM_LIMIT_BYTES)) return null; // 内存水位闸(见上)
  active++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active--;
  };
}
