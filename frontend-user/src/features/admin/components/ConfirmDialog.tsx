// 已上移到 shared/components/ConfirmDialog —— 全应用通用。
// 这里仅 re-export 保持旧 import 路径兼容(future:逐步迁移引用方,删除本文件)。
export {
  ConfirmDialog,
  useConfirm,
  type ConfirmOptions,
} from '@/shared/components';
