/**
 * 后端 utils.Success 把 payload 统一包成 `{code, message, data}`,
 * 这里只取 `data` 字段。极少数旧接口直接裸出 payload,fallback 到 raw 本身。
 */
export function unwrap<T>(raw: { data?: T } & Partial<T>): T {
  return (raw.data as T) ?? (raw as unknown as T);
}
