import { useQuery } from '@tanstack/react-query';
import { subscriptionApi } from './subscriptionApi';

export const subscriptionKeys = {
  plans: ['subscription', 'plans'] as const,
  current: ['subscription', 'current'] as const,
  quota: ['subscription', 'quota'] as const,
  usage: ['subscription', 'usage'] as const,
};

export const useSubscriptionPlans = () =>
  useQuery({
    queryKey: subscriptionKeys.plans,
    queryFn: () => subscriptionApi.getPlans().then((r) => r.data),
    staleTime: 60 * 60 * 1000,
  });

export const useCurrentSubscription = () =>
  useQuery({
    queryKey: subscriptionKeys.current,
    queryFn: () => subscriptionApi.getCurrentSubscription().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const useQuota = () =>
  useQuery({
    queryKey: subscriptionKeys.quota,
    queryFn: () => subscriptionApi.getQuota().then((r) => r.data),
    staleTime: 60 * 1000,
  });

export const useUsage = () =>
  useQuery({
    queryKey: subscriptionKeys.usage,
    queryFn: () => subscriptionApi.getUsage().then((r) => r.data),
    staleTime: 60 * 1000,
  });
