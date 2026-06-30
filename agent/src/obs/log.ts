// 结构化 stdout 日志(与 backend slog 同构:{time,level,msg,...fields})。
// 走 docker logs json-file 收集,不依赖外部观测平台。

type Level = "INFO" | "WARN" | "ERROR" | "DEBUG";

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  const rec: Record<string, unknown> = { time: new Date().toISOString(), level, msg };
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
