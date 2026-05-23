/**
 * 论文翻译 —— 已上移到 `@/shared/api/translate`,library / search 都消费同一份。
 * 本文件保留为薄 re-export,旧的 `from '../api/translate'` 导入继续可用。
 */
export {
  useTranslatePaper,
  needsTranslation,
  type TranslatePaperRequest,
  type TranslatePaperResult,
} from '@/shared/api/translate';
