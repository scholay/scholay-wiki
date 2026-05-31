// Stub for `bun:bundle` — cc-haha 原本期望被 bundler 静态替换为常量。
// 我们直接运行源码,因此用运行时实现:所有 feature flag 默认 false (= 走外部构建路径)。
// 如需启用某个 feature,改为读取 process.env: 例如 ENABLE_HISTORY_SNIP=1。
export function feature(name: string): boolean {
  const envKey = `ENABLE_${name.toUpperCase()}`
  return process.env[envKey] === '1' || process.env[envKey] === 'true'
}
