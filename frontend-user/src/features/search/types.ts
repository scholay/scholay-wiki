/**
 * 搜索筛选器模型 —— 实体已上移到 @/shared/lib/search-filters,
 * 让移动端搜索(features/mobile)也能复用同一套筛选 taxonomy / 联动逻辑,
 * 而不必反向 import features/search(违反分层)。
 *
 * 本文件保留为**再导出壳**:features/search 下原有 `import { ... } from '../types'`
 * 全部继续可用,无需改动。
 */
export * from '@/shared/lib/search-filters';
