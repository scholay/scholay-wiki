import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐 backend/internal/common/model/code_snippet.go CodeSnippet。
 * 不是通用代码片段库 —— 是给用户端前端做 SEO / 广告 / 统计注入的代码片段。
 */
export type CodeSnippetCategory = 'seo' | 'analytics' | 'ad' | 'social' | 'other';
export type CodeSnippetPosition = 'head' | 'body_start' | 'body_end';

export interface CodeSnippet {
  id: number;
  name: string;
  code_key: string;
  category: CodeSnippetCategory;
  position: CodeSnippetPosition;
  code_content: string;
  description?: string;
  is_enabled: boolean;
  priority: number;
  pages?: string[];
  created_at: string;
  updated_at: string;
}

export function useCodeSnippets() {
  return useQuery({
    queryKey: ['admin', 'code-snippets', 'list'],
    queryFn: async () => (await http.get<{ data: CodeSnippet[] }>('/admin/code-snippets')).data.data,
  });
}

export function useCreateSnippet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<CodeSnippet, 'id' | 'created_at' | 'updated_at'>) =>
      http.post('/admin/code-snippets', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'code-snippets'] }),
  });
}

export function useUpdateSnippet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: Partial<CodeSnippet> }) =>
      http.put(`/admin/code-snippets/${vars.id}`, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'code-snippets'] }),
  });
}

export function useDeleteSnippet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/code-snippets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'code-snippets'] }),
  });
}
