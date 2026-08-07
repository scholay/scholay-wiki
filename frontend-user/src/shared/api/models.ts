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
  // P5 成本制:额度按真实成本扣,不再向用户下发计费倍率(用户端只看百分比)。
  locked: boolean; // min_tier 门槛未达
  min_tier: '' | 'pro' | 'max';
  is_default: boolean; // 该 feature 的默认模型(chat_default 绑定)
  vision: boolean; // 视觉能力(P2 图片通道):false 时前端不放行图片上传
  flagship: boolean; // 旗舰标识(0089):选择器差异化高亮 + 旗舰标签
}

/**
 * 当前会话生效模型是否支持图片输入(P2 图片通道:三家 composer 的图片入口启停)。
 * current=null / isDefault → 看目录里标 is_default 的模型;找不到 → false(诚实 UI:
 * 不确定就不放行,避免「传了图模型看不见」)。
 */
export function modelSupportsVision(
  models: UserModel[] | undefined,
  current: { modelId: string; isDefault: boolean } | null,
): boolean {
  if (!models || models.length === 0) return false;
  const target =
    current && !current.isDefault
      ? models.find((m) => m.model_id === current.modelId)
      : models.find((m) => m.is_default);
  return !!target?.vision;
}

export type ModelFeatureKey = 'smart_search' | 'claw' | 'prism' | 'boltslides' | 'sci_draw' | 'stat_lab';

export function useUserModels(feature: ModelFeatureKey) {
  return useQuery({
    queryKey: ['shared', 'models', feature],
    queryFn: async () =>
      (await http.get<{ data: UserModel[] }>('/user/models', { params: { feature } })).data.data,
    staleTime: 5 * 60_000,
  });
}
