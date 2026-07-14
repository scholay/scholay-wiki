// mirrors backend/internal/modelcatalog/service.go UserModelView
// 模型目录(P2 用户选模型):三个对话 feature 的选择器共用,故上提 shared/api(feature 私有 api
// 不允许跨 feature import)。locked 模型照常返回(选择器置灰 + 升级引导),过滤是后端 hub 闸的事。
import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface UserModel {
  model_id: string;
  display_name: string;
  description: string;
  context_window: number;
  speed_class: 'fast' | 'balanced' | 'powerful';
  billing_weight: number; // 计费倍率(×1 基准;加权计费上线后生效,先作徽标展示)
  locked: boolean; // min_tier 门槛未达
  min_tier: '' | 'pro' | 'max';
  is_default: boolean; // 该 feature 的默认模型(chat_default 绑定)
}

export type ModelFeatureKey = 'smart_search' | 'claw' | 'prism';

export function useUserModels(feature: ModelFeatureKey) {
  return useQuery({
    queryKey: ['shared', 'models', feature],
    queryFn: async () =>
      (await http.get<{ data: UserModel[] }>('/user/models', { params: { feature } })).data.data,
    staleTime: 5 * 60_000,
  });
}
