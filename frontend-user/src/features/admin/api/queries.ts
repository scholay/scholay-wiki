import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from './adminApi';

export const adminKeys = {
  dashboard: ['admin', 'dashboard'] as const,
  users: (
    page?: number,
    pageSize?: number,
    sortBy?: string,
    sortOrder?: string
  ) => ['admin', 'users', page, pageSize, sortBy, sortOrder] as const,
  userDetail: (id: string | number) => ['admin', 'user', id] as const,
  userStats: ['admin', 'userStats'] as const,
  userStatsChart: (params?: Record<string, any>) =>
    ['admin', 'userStatsChart', params] as const,
  onlineUsers: ['admin', 'onlineUsers'] as const,
  onlineChart: (params?: Record<string, any>) =>
    ['admin', 'onlineChart', params] as const,
  thirdParty: (type?: string) => ['admin', 'thirdParty', type] as const,
  thirdPartyStats: ['admin', 'thirdPartyStats'] as const,
  prompts: ['admin', 'prompts'] as const,
  feedbacks: (params?: Record<string, any>) =>
    ['admin', 'feedbacks', params] as const,
  feedbackStats: ['admin', 'feedbackStats'] as const,
  messages: (params?: Record<string, any>) =>
    ['admin', 'messages', params] as const,
  messageTemplates: (params?: Record<string, any>) =>
    ['admin', 'messageTemplates', params] as const,
  codeSnippets: (category?: string) =>
    ['admin', 'codeSnippets', category] as const,
  latexConfig: ['admin', 'latexConfig'] as const,
  latexModels: ['admin', 'latexModels'] as const,
  latexPresets: ['admin', 'latexPresets'] as const,
  latexConfigOptions: ['admin', 'latexConfigOptions'] as const,
  latexApiFormats: ['admin', 'latexApiFormats'] as const,
  wechatConfigs: ['admin', 'wechatConfigs'] as const,
  wechatOfficialConfig: ['admin', 'wechatOfficialConfig'] as const,
  emailConfig: ['admin', 'emailConfig'] as const,
  smsConfig: ['admin', 'smsConfig'] as const,
  githubConfig: ['admin', 'githubConfig'] as const,
  dimensions: ['admin', 'dimensions'] as const,
};

export const useDashboardStats = () =>
  useQuery({
    queryKey: adminKeys.dashboard,
    queryFn: () =>
      adminAPI.getDashboardStatistics().then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useUserList = (
  page: number = 1,
  pageSize: number = 20,
  sortBy?: string,
  sortOrder?: string
) =>
  useQuery({
    queryKey: adminKeys.users(page, pageSize, sortBy, sortOrder),
    queryFn: () =>
      adminAPI.getUserList(page, pageSize, sortBy, sortOrder).then((r) => r.data),
    staleTime: 30 * 1000,
  });

export const useUserDetail = (userId: string | number) =>
  useQuery({
    queryKey: adminKeys.userDetail(userId),
    queryFn: () => adminAPI.getUserDetail(userId).then((r) => r.data),
    enabled: !!userId,
  });

export const useUserStats = () =>
  useQuery({
    queryKey: adminKeys.userStats,
    queryFn: () => adminAPI.getUserStatistics().then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useUserStatsChart = (params?: Record<string, any>) =>
  useQuery({
    queryKey: adminKeys.userStatsChart(params),
    queryFn: () => adminAPI.getUserStatisticsChart(params).then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useOnlineUsers = () =>
  useQuery({
    queryKey: adminKeys.onlineUsers,
    queryFn: () => adminAPI.getOnlineUsers().then((r) => r.data),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });

export const useOnlineChart = (params?: Record<string, any>) =>
  useQuery({
    queryKey: adminKeys.onlineChart(params),
    queryFn: () => adminAPI.getOnlineUserChart(params).then((r) => r.data),
    staleTime: 30 * 1000,
  });

export const useThirdPartyAccounts = (type?: string) =>
  useQuery({
    queryKey: adminKeys.thirdParty(type),
    queryFn: () => adminAPI.getThirdPartyAccounts(type).then((r) => r.data),
    staleTime: 30 * 1000,
  });

export const useThirdPartyStats = () =>
  useQuery({
    queryKey: adminKeys.thirdPartyStats,
    queryFn: () => adminAPI.getThirdPartyAccountStats().then((r) => r.data),
    staleTime: 30 * 1000,
  });

export const usePromptTemplates = () =>
  useQuery({
    queryKey: adminKeys.prompts,
    queryFn: () => adminAPI.getPromptTemplates().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const useFeedbacks = (params?: Record<string, any>) =>
  useQuery({
    queryKey: adminKeys.feedbacks(params),
    queryFn: () => adminAPI.getFeedbacks(params).then((r) => r.data),
    staleTime: 30 * 1000,
  });

export const useFeedbackStats = () =>
  useQuery({
    queryKey: adminKeys.feedbackStats,
    queryFn: () => adminAPI.getFeedbackStats().then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useAdminMessages = (params?: Record<string, any>) =>
  useQuery({
    queryKey: adminKeys.messages(params),
    queryFn: () => adminAPI.getMessages(params).then((r) => r.data),
    staleTime: 30 * 1000,
  });

export const useMessageTemplates = (params?: Record<string, any>) =>
  useQuery({
    queryKey: adminKeys.messageTemplates(params),
    queryFn: () => adminAPI.getMessageTemplates(params).then((r) => r.data),
    staleTime: 30 * 1000,
  });

export const useCodeSnippets = (category?: string) =>
  useQuery({
    queryKey: adminKeys.codeSnippets(category),
    queryFn: () => adminAPI.getCodeSnippets(category).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const useLatexAgentConfig = () =>
  useQuery({
    queryKey: adminKeys.latexConfig,
    queryFn: () => adminAPI.getLatexAgentConfig().then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useLatexAgentModels = () =>
  useQuery({
    queryKey: adminKeys.latexModels,
    queryFn: () => adminAPI.getLatexAgentModels().then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useDeleteUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number | string) => adminAPI.deleteUser(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
};

export const useCreateThirdPartyAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminAPI.createThirdPartyAccount(data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin', 'thirdParty'] }),
  });
};

export const useUpdateThirdPartyAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: any }) =>
      adminAPI.updateThirdPartyAccount(id, data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin', 'thirdParty'] }),
  });
};

export const useDeleteThirdPartyAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) =>
      adminAPI.deleteThirdPartyAccount(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin', 'thirdParty'] }),
  });
};

export const useCreatePromptTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminAPI.createPromptTemplate(data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: adminKeys.prompts }),
  });
};

export const useUpdatePromptTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: any }) =>
      adminAPI.updatePromptTemplate(id, data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: adminKeys.prompts }),
  });
};

export const useDeletePromptTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) =>
      adminAPI.deletePromptTemplate(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: adminKeys.prompts }),
  });
};

/* ----------------------------------------------------------------
 * Auth / Profile
 * ---------------------------------------------------------------- */

export const useAdminLogin = () =>
  useMutation({
    mutationFn: (params: { username: string; password: string }) =>
      adminAPI.login(params.username, params.password),
  });

export const useAdminProfile = () =>
  useQuery({
    queryKey: ['admin', 'profile'] as const,
    queryFn: () => adminAPI.getProfile().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const useAdminUpdatePassword = () =>
  useMutation({
    mutationFn: (params: { oldPassword: string; newPassword: string }) =>
      adminAPI.updatePassword(params.oldPassword, params.newPassword),
  });

export const useAdminVerifyPassword = () =>
  useMutation({
    mutationFn: (password: string) => adminAPI.verifyPassword(password),
  });

/* ----------------------------------------------------------------
 * Privacy / Terms
 * ---------------------------------------------------------------- */

export const useUpdatePrivacyPolicy = () =>
  useMutation({
    mutationFn: (params: { content: string; version: string }) =>
      adminAPI.updatePrivacyPolicy(params.content, params.version),
  });

export const useUpdateTermsOfService = () =>
  useMutation({
    mutationFn: (params: { content: string; version: string }) =>
      adminAPI.updateTermsOfService(params.content, params.version),
  });

/* ----------------------------------------------------------------
 * Email Config
 * ---------------------------------------------------------------- */

export const useEmailConfig = (showPassword = false) =>
  useQuery({
    queryKey: [...adminKeys.emailConfig, showPassword] as const,
    queryFn: () => adminAPI.getEmailConfig(showPassword).then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useUpdateEmailConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: any) => adminAPI.updateEmailConfig(config),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.emailConfig }),
  });
};

export const useTestEmailConfig = () =>
  useMutation({
    mutationFn: (config: any) => adminAPI.testEmailConfig(config),
  });

/* ----------------------------------------------------------------
 * SMS Config
 * ---------------------------------------------------------------- */

export const useSMSConfig = (showSecret = false) =>
  useQuery({
    queryKey: [...adminKeys.smsConfig, showSecret] as const,
    queryFn: () => adminAPI.getSMSConfig(showSecret).then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useUpdateSMSConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: any) => adminAPI.updateSMSConfig(config),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.smsConfig }),
  });
};

export const useTestSMSConfig = () =>
  useMutation({
    mutationFn: (config: any) => adminAPI.testSMSConfig(config),
  });

/* ----------------------------------------------------------------
 * System Config
 * ---------------------------------------------------------------- */

export const useUpdateSystemConfig = () =>
  useMutation({
    mutationFn: (config: any) => adminAPI.updateSystemConfig(config),
  });

/* ----------------------------------------------------------------
 * GitHub Config
 * ---------------------------------------------------------------- */

export const useGithubConfig = () =>
  useQuery({
    queryKey: adminKeys.githubConfig,
    queryFn: () => adminAPI.getGithubConfig().then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useUpdateGithubConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: any) => adminAPI.updateGithubConfig(config),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.githubConfig }),
  });
};

/* ----------------------------------------------------------------
 * WeChat Mini Program Config
 * ---------------------------------------------------------------- */

export const useWeChatConfigs = (showSecret = false) =>
  useQuery({
    queryKey: [...adminKeys.wechatConfigs, showSecret] as const,
    queryFn: () => adminAPI.getWeChatConfigs(showSecret).then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useCreateWeChatConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminAPI.createWeChatConfig(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.wechatConfigs }),
  });
};

export const useUpdateWeChatConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: any }) =>
      adminAPI.updateWeChatConfig(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.wechatConfigs }),
  });
};

export const useDeleteWeChatConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => adminAPI.deleteWeChatConfig(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.wechatConfigs }),
  });
};

export const useActivateWeChatConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => adminAPI.activateWeChatConfig(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.wechatConfigs }),
  });
};

/* ----------------------------------------------------------------
 * WeChat Official Account Config
 * ---------------------------------------------------------------- */

export const useWeChatOfficialConfig = (showSensitive = false) =>
  useQuery({
    queryKey: [...adminKeys.wechatOfficialConfig, showSensitive] as const,
    queryFn: () => adminAPI.getWeChatOfficialConfig(showSensitive).then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useUpdateWeChatOfficialConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminAPI.updateWeChatOfficialConfig(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.wechatOfficialConfig }),
  });
};

/* ----------------------------------------------------------------
 * Analysis Dimensions
 * ---------------------------------------------------------------- */

export const useAdminDimensions = () =>
  useQuery({
    queryKey: adminKeys.dimensions,
    queryFn: () => adminAPI.getAnalysisDimensions().then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useUpdateAdminDimension = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: any }) =>
      adminAPI.updateAnalysisDimension(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.dimensions }),
  });
};

/* ----------------------------------------------------------------
 * Feedbacks
 * ---------------------------------------------------------------- */

export const useUpdateFeedbackStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string | number; status: string }) =>
      adminAPI.updateFeedbackStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feedbacks'] }),
  });
};

export const useReplyFeedback = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, replyContent }: { id: string | number; replyContent: string }) =>
      adminAPI.replyFeedback(id, replyContent),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feedbacks'] }),
  });
};

export const useDeleteFeedback = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => adminAPI.deleteFeedback(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feedbacks'] }),
  });
};

/* ----------------------------------------------------------------
 * Messages
 * ---------------------------------------------------------------- */

export const useMessageStats = () =>
  useQuery({
    queryKey: ['admin', 'messageStats'] as const,
    queryFn: () => adminAPI.getMessageStats().then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useCreateAdminMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminAPI.createMessage(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'messages'] }),
  });
};

export const useSendAdminMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => adminAPI.sendMessage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'messages'] }),
  });
};

/* ----------------------------------------------------------------
 * Message Templates
 * ---------------------------------------------------------------- */

export const useCreateMessageTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminAPI.createMessageTemplate(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'messageTemplates'] }),
  });
};

export const useUpdateMessageTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: any }) =>
      adminAPI.updateMessageTemplate(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'messageTemplates'] }),
  });
};

export const useDeleteMessageTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => adminAPI.deleteMessageTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'messageTemplates'] }),
  });
};

/* ----------------------------------------------------------------
 * Code Snippets
 * ---------------------------------------------------------------- */

export const useCreateCodeSnippet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminAPI.createCodeSnippet(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'codeSnippets'] }),
  });
};

export const useUpdateCodeSnippet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: any }) =>
      adminAPI.updateCodeSnippet(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'codeSnippets'] }),
  });
};

export const useDeleteCodeSnippet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => adminAPI.deleteCodeSnippet(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'codeSnippets'] }),
  });
};

/* ----------------------------------------------------------------
 * LaTeX Agent Config & Models
 * ---------------------------------------------------------------- */

export const useUpdateLatexAgentConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminAPI.updateLatexAgentConfig(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.latexConfig }),
  });
};

export const useLatexAgentPresets = () =>
  useQuery({
    queryKey: adminKeys.latexPresets,
    queryFn: () => adminAPI.getLatexAgentModelPresets().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const useLatexAgentConfigOptions = () =>
  useQuery({
    queryKey: adminKeys.latexConfigOptions,
    queryFn: () => adminAPI.getLatexAgentConfigOptions().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const useApplyLatexAgentPreset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { provider: string; name: string }) =>
      adminAPI.applyLatexAgentModelPreset(params.provider, params.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.latexConfig }),
  });
};

export const useTestLatexAgentConnection = () =>
  useMutation({
    mutationFn: () => adminAPI.testLatexAgentConnection(),
  });

export const useLatexAgentApiFormats = () =>
  useQuery({
    queryKey: adminKeys.latexApiFormats,
    queryFn: () => adminAPI.getLatexAgentApiFormats().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const useCreateLatexAgentModel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => adminAPI.createLatexAgentModel(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.latexModels }),
  });
};

export const useUpdateLatexAgentModel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: any }) =>
      adminAPI.updateLatexAgentModel(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.latexModels }),
  });
};

export const useDeleteLatexAgentModel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => adminAPI.deleteLatexAgentModel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.latexModels }),
  });
};

export const useSetDefaultLatexAgentModel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => adminAPI.setDefaultLatexAgentModel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.latexModels }),
  });
};

/* ----------------------------------------------------------------
 * Third-party Account extended ops
 * ---------------------------------------------------------------- */

export const useTestThirdPartyAccount = () =>
  useMutation({
    mutationFn: (id: string | number) => adminAPI.testThirdPartyAccount(id),
  });

export const useRefreshThirdPartyAccountCache = () =>
  useMutation({
    mutationFn: () => adminAPI.refreshThirdPartyAccountCache(),
  });
