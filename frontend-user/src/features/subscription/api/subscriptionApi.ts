import { httpClient } from 'shared/api/client';
import type { ApiResponse } from 'shared/types/api';

export const subscriptionApi = {
  getPlans: () => httpClient.get<ApiResponse>('/user/subscription/plans'),
  getCurrentSubscription: () => httpClient.get<ApiResponse>('/user/subscription/current'),
  getQuota: () => httpClient.get<ApiResponse>('/user/subscription/quota'),
  getUsage: () => httpClient.get<ApiResponse>('/user/subscription/usage'),
};
