// 额度展示辅助已提升到 shared/lib/quota-display(用户设置卡与后台用户监控共用,口径单一真源)。
// 保留本文件仅作 re-export,避免改动 settings 内既有 import 路径。
export { monthDay, resetInfo, type ResetInfo, type QuotaWindowLike } from '@/shared/lib/quota-display';
