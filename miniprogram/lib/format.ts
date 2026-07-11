// 纯格式化工具(从 Web 端 shared/lib 的等价逻辑搬运,无 DOM 依赖)。

// 大数缩写:万 / k(对齐 Web formatMetric)。被引/发文量等指标用。
export function formatMetric(n?: number): string {
  if (!n || n < 0) return '0'
  if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

// 影响因子等数值串:≥10 保留 1 位,否则 2 位;非法值回 '—'。
export function formatIF(v?: string | number): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  if (!isFinite(n) || n <= 0) return '—'
  return n >= 10 ? n.toFixed(1) : n.toFixed(2)
}

// 千分位(累计发文量等)。
export function formatCount(n?: number): string {
  if (!n || n < 0) return '0'
  return n.toLocaleString('en-US')
}

// 相对时间(情报卡「x 分钟前」)。小程序运行时 Date.now() 可用。
export function relativeTime(iso?: string): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!isFinite(t)) return ''
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟前'
  const h = Math.floor(m / 60)
  if (h < 24) return h + ' 小时前'
  const d = Math.floor(h / 24)
  if (d < 30) return d + ' 天前'
  const mo = Math.floor(d / 30)
  if (mo < 12) return mo + ' 个月前'
  return Math.floor(mo / 12) + ' 年前'
}

// 中科院分区:抽首位数字 1-4 → 「一区」..「四区」。
export function parseQuartile(v?: string): string {
  if (!v) return ''
  const m = String(v).match(/[1-4]/)
  if (!m) return ''
  return ['一', '二', '三', '四'][Number(m[0]) - 1] + '区'
}

// 工具价格 / 获取方式中文映射(对齐 Web PRICE_TYPE_LABEL / ACCESS_TYPE_LABEL)。
export const PRICE_TYPE_LABEL: Record<string, string> = {
  free: '免费',
  freemium: '免费增值',
  trial: '试用',
  paid: '付费',
  edu: '教育',
  unknown: '未知',
}
export const ACCESS_TYPE_LABEL: Record<string, string> = {
  website: '在线',
  download: '下载',
  both: '在线+下载',
}

// 字标封面取色:按字符串 hash 到一组柔和底色(复刻 JournalCover 思路)。
const COVER_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#6366f1']
export function coverColor(key?: string): string {
  const s = key || '?'
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return COVER_COLORS[h % COVER_COLORS.length]
}

// 首字母(封面用)。
export function initial(s?: string): string {
  const t = (s || '').trim()
  return t ? t[0].toUpperCase() : '?'
}

// 作者名 → 展示行(收口 5 处各写的 map(a=>a.name).filter.join+截断;见体检 R5)。
// max=展示前几名;超出拼 suffix(可含 {n} 占位=总人数);sep=分隔符(默认顿号,引用用 ', ')。
export function authorsLine(
  authors: ReadonlyArray<{ name?: string } | string | null | undefined> | null | undefined,
  opts?: { max?: number; suffix?: string; sep?: string },
): string {
  const names: string[] = []
  for (const a of authors || []) {
    const n = typeof a === 'string' ? a : a && a.name
    if (n) names.push(n)
  }
  if (names.length === 0) return ''
  const max = opts && opts.max !== undefined ? opts.max : 2
  const sep = (opts && opts.sep) || '、'
  if (names.length <= max) return names.join(sep)
  const suffix = ((opts && opts.suffix) || ' 等').replace('{n}', String(names.length))
  return names.slice(0, max).join(sep) + suffix
}
