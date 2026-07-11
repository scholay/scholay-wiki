// 列表分页追加:用 path-set 逐项追加,避免每次 loadMore 把整个增长数组重新序列化过桥(见体检 P2)。
// 用法:this.setData(appendPatch('papers', this.data.papers.length, vms, { hasMore, offset }))
export function appendPatch(
  key: string,
  baseLen: number,
  items: unknown[],
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = extra ? { ...extra } : {}
  for (let i = 0; i < items.length; i++) {
    patch[key + '[' + (baseLen + i) + ']'] = items[i]
  }
  return patch
}
