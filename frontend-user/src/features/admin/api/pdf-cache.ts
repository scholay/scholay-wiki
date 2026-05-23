import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐 backend/internal/pdf/cache.go Cache.Stats():
 *   { entries, max_entries, used_memory, max_memory, ttl_seconds }
 * 后端没有 hits / misses / hit_rate / created_at 等字段。
 */
export interface PdfCacheStats {
  entries: number;
  max_entries: number;
  used_memory: number;
  max_memory: number;
  ttl_seconds: number;
}

export function usePdfCacheStats() {
  return useQuery({
    queryKey: ['admin', 'pdf-cache', 'stats'],
    queryFn: async () =>
      (await http.get<{ data: PdfCacheStats }>('/admin/pdf/cache/stats')).data.data,
  });
}
