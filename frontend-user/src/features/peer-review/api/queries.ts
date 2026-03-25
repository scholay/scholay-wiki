import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { peerReviewApi } from './peerReviewApi';

export const reviewKeys = {
  all: ['peerReview'] as const,
  draft: ['peerReview', 'draft'] as const,
  tasks: (page?: number, pageSize?: number, status?: string, search?: string) =>
    ['peerReview', 'tasks', page, pageSize, status, search] as const,
  task: (id: string) => ['peerReview', 'task', id] as const,
  progress: (id: string) => ['peerReview', 'progress', id] as const,
  steps: (id: string) => ['peerReview', 'steps', id] as const,
};

export const useDraft = () =>
  useQuery({
    queryKey: reviewKeys.draft,
    queryFn: () => peerReviewApi.getDraft().then((r) => r.data),
    staleTime: 30 * 1000,
  });

export const useTaskList = (
  page: number = 1,
  pageSize: number = 10,
  status?: string,
  search?: string
) =>
  useQuery({
    queryKey: reviewKeys.tasks(page, pageSize, status, search),
    queryFn: () =>
      peerReviewApi
        .getTaskList(page, pageSize, status, search)
        .then((r) => r.data),
    staleTime: 30 * 1000,
  });

export const useTaskDetail = (taskId: string) =>
  useQuery({
    queryKey: reviewKeys.task(taskId),
    queryFn: () => peerReviewApi.getTaskDetail(taskId).then((r) => r.data),
    enabled: !!taskId,
  });

export const useTaskProgress = (taskId: string) =>
  useQuery({
    queryKey: reviewKeys.progress(taskId),
    queryFn: () => peerReviewApi.getTaskProgress(taskId).then((r) => r.data),
    enabled: !!taskId,
    refetchInterval: 5000,
  });

export const useTaskSteps = (taskId: string) =>
  useQuery({
    queryKey: reviewKeys.steps(taskId),
    queryFn: () => peerReviewApi.getTaskSteps(taskId).then((r) => r.data),
    enabled: !!taskId,
  });

export const useSaveDraft = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) => peerReviewApi.saveDraft(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.draft }),
  });
};

export const useSubmitDraft = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      targetVenue?: string;
      modelLevel?: string;
    }) =>
      peerReviewApi
        .submitDraft(params.targetVenue, params.modelLevel)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }),
  });
};

export const useDeleteTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => peerReviewApi.deleteTask(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }),
  });
};

export const useCreateTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, any>) => peerReviewApi.createTask(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }),
  });
};

export const useStartTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      taskId: string;
      targetVenue?: string;
      modelLevel?: string;
    }) =>
      peerReviewApi.startTask(
        params.taskId,
        params.targetVenue,
        params.modelLevel
      ),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: reviewKeys.task(vars.taskId) }),
  });
};

export const useUploadFile = () =>
  useMutation({
    mutationFn: (file: File) => peerReviewApi.uploadFile(file),
  });

export const useUploadAttachment = () =>
  useMutation({
    mutationFn: (file: File) => peerReviewApi.uploadAttachment(file),
  });

export const useDeleteAttachment = () =>
  useMutation({
    mutationFn: (attachmentId: string) =>
      peerReviewApi.deleteAttachment(attachmentId),
  });

export const useDeleteManuscript = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => peerReviewApi.deleteManuscript(),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.draft }),
  });
};

export const useClearDraft = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => peerReviewApi.clearDraft(),
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.draft }),
  });
};
