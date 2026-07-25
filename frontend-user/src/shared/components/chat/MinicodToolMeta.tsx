import { normalizeSourceBrand } from '@/shared/lib/data-source-brand';

/**
 * minicod 检索工具的 chip 头部元信息(提升自 features/search/.../AssistantTurn.tsx)——
 * 在工具名右边追加 "OpenAlex" / 「query」,让人一眼看到"AI 在搜什么"。
 * smart-search 用户端与 admin 会话监控共用,保证两边 chip 视觉一致。
 */

/** chip 标题区追加的 "OpenAlex 「query」" 两块。 */
export function ToolHeaderExtras({ brand, query }: { brand?: string; query?: string }) {
  return (
    <>
      {brand && <span className="text-2xs font-semibold text-brand-green shrink-0">{brand}</span>}
      {query && <span className="truncate min-w-0 text-2xs text-muted-foreground">「{query}」</span>}
    </>
  );
}

export function extractToolQuery(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const obj = input as Record<string, unknown>;
  for (const k of ['query', 'q', 'keyword', 'search']) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

/**
 * 从工具入参里提取 source enum,归一化成数据源真名 (Semantic Scholar/OpenAlex/PubMed)。
 * Minicod search_papers 必传 source,此函数主要服务该工具的 chip 展示。
 */
export function extractToolSourceBrand(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const obj = input as Record<string, unknown>;
  const src = obj.source;
  if (typeof src !== 'string') return undefined;
  return normalizeSourceBrand(src);
}
