import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { latexApi } from './latexApi';

export const latexKeys = {
  documents: (tree?: boolean) => ['latex', 'documents', tree] as const,
  document: (id: string | number) => ['latex', 'document', id] as const,
  models: ['latex', 'models'] as const,
  conversation: (docId: string | number) =>
    ['latex', 'conversation', docId] as const,
  history: (docId: string | number, page?: number, pageSize?: number) =>
    ['latex', 'history', docId, page, pageSize] as const,
  mcpTools: ['latex', 'mcp', 'tools'] as const,
  mcpToolsLLM: ['latex', 'mcp', 'toolsLLM'] as const,
};

export const useLatexDocuments = (tree: boolean = false) =>
  useQuery({
    queryKey: latexKeys.documents(tree),
    queryFn: () => latexApi.getDocuments(tree).then((r) => r.data),
    staleTime: 30 * 1000,
  });

export const useLatexDocument = (id: number) =>
  useQuery({
    queryKey: latexKeys.document(id),
    queryFn: () => latexApi.getDocument(id).then((r) => r.data),
    enabled: !!id,
    staleTime: 10 * 1000,
  });

export const useLatexModels = () =>
  useQuery({
    queryKey: latexKeys.models,
    queryFn: () => latexApi.getAgentModels().then((r) => r.data),
    staleTime: 60 * 60 * 1000,
  });

export const useCreateLatexDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      latexApi.createDocument(data).then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['latex', 'documents'] }),
  });
};

export const useUpdateLatexDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, any> }) =>
      latexApi.updateDocument(id, data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: latexKeys.document(vars.id) });
      qc.invalidateQueries({ queryKey: ['latex', 'documents'] });
    },
  });
};

export const useDeleteLatexDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => latexApi.deleteDocument(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['latex', 'documents'] }),
  });
};

export const useDocumentConversation = (documentId: number) =>
  useQuery({
    queryKey: latexKeys.conversation(documentId),
    queryFn: () =>
      latexApi.getDocumentConversation(documentId).then((r) => r.data),
    enabled: !!documentId,
    staleTime: 30 * 1000,
  });

export const useConversationHistory = (
  documentId: number,
  page: number = 1,
  pageSize: number = 20
) =>
  useQuery({
    queryKey: latexKeys.history(documentId, page, pageSize),
    queryFn: () =>
      latexApi
        .getConversationHistory(documentId, page, pageSize)
        .then((r) => r.data),
    enabled: !!documentId,
    staleTime: 30 * 1000,
  });

export const useClearConversation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: number) =>
      latexApi.clearConversation(documentId),
    onSuccess: (_d, docId) => {
      qc.invalidateQueries({ queryKey: latexKeys.conversation(docId) });
      qc.invalidateQueries({ queryKey: ['latex', 'history', docId] });
    },
  });
};

export const useMCPTools = () =>
  useQuery({
    queryKey: latexKeys.mcpTools,
    queryFn: () => latexApi.getMCPTools().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const useMCPToolsForLLM = () =>
  useQuery({
    queryKey: latexKeys.mcpToolsLLM,
    queryFn: () => latexApi.getMCPToolsForLLM().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const useCallMCPTool = () =>
  useMutation({
    mutationFn: (params: { name: string; args?: Record<string, any> }) =>
      latexApi.callMCPTool(params.name, params.args),
  });
