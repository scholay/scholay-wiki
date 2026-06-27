/**
 * 合法 OA 全文查找 —— 镜像 backend/internal/openaccess/openaccess.go Result。
 *
 * 用于论文详情页:当 Minicod 未给 openAccessPdf 时,按 DOI 兜底问后端
 * (后端查 Unpaywall + 缓存),拿到合法免费全文链接就显示「免费全文」。
 */

import { useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';

export interface OpenAccessResult {
  doi: string;
  is_oa: boolean;
  /** 合法免费全文链接(优先 PDF 直链,否则落地页) */
  url?: string;
  is_pdf?: boolean;
  /** publisher / repository */
  host_type?: string;
  version?: string;
  license?: string;
}

export function useOpenAccess(doi: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['oa', 'resolve', doi] as const,
    enabled: enabled && !!doi,
    // 客户端缓存 1 天(后端 Redis 缓存更久);失败不重试,避免拖慢详情页。
    staleTime: 1000 * 60 * 60 * 24,
    retry: false,
    queryFn: async (): Promise<OpenAccessResult> => {
      try {
        const { data } = await http.get<{ data: OpenAccessResult }>(
          `/public/oa/resolve?doi=${encodeURIComponent(doi!)}`
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}
