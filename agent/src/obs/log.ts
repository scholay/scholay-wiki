// 结构化 stdout 日志(与 backend slog 同构:{time,level,msg,...fields})。
// 走 docker logs json-file 收集,不依赖外部观测平台。

type Level = "INFO" | "WARN" | "ERROR" | "DEBUG";

// 本地时间戳(跟随容器 TZ,与 backend slog 的 time.Now() 一致落地北京时间)——
// 不用 toISOString():那恒输出 UTC 'Z' 串,比容器本地慢 8h,和后端日志/运维墙钟错位。
function localTimestamp(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ` +
    `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  );
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  const rec: Record<string, unknown> = { time: localTimestamp(), level, msg };
  if (fields) for (const k of Object.keys(fields)) rec[k] = fields[k];
  // 单行 JSON,便于 grep / 解析
  console.log(JSON.stringify(rec));
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => emit("INFO", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("WARN", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("ERROR", msg, fields),
  debug: (msg: string, fields?: Record<string, unknown>) => emit("DEBUG", msg, fields),
};
