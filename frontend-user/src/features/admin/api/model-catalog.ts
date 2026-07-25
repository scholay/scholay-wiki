// mirrors backend/internal/modelcatalog/model.go AgentModel / BindingView
// 模型目录 + 能力绑定(模型目录化 P1,方案 docs/research/model-catalog-2026-07/REPORT.md)。
// 改字段时后端 Go struct 与这里两侧一起改。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface AgentModel {
  id: number;
  model_id: string;
  provider_id: number; // 0 = 默认 provider(agent_config 链);>0 = agent_providers.id(F0)
  display_name: string;
  description: string;
  channel: string; // agent | project(第一期只用 agent)
  context_window: number;
  // max_input 最大输入 token(0088)。0 = 未配,agent 压缩墙回落「上下文 − 输出预留」自动算。
  // 上下文 = 输入 + 输出 的共享预算(前端表单可填两个自动算第三个,也可强改)。
  max_input: number;
  max_output: number;
  price_in: number; // 元 / 1M token
  price_out: number;
  price_cache_r: number;
  price_cache_w: number;
  // 输入长度分档计价(0084):prompt(input+cacheRead)超过 input_tier_threshold 时切高档价
  // (千问 qwen3.7-plus 等 >256k 约 3×)。threshold=0 → 不分档;*_hi=0 → 回落基础值。
  // P5 成本制:额度按四类单价的真实成本扣,不再有 billing_weight 倍率(列在库里保留但已弃用)。
  input_tier_threshold: number;
  price_in_hi: number;
  price_out_hi: number;
  price_cache_r_hi: number;
  price_cache_w_hi: number;
  // 第三档(0087):prompt 超过 input_tier_threshold_2(须 > 第一阈值)时切更高档价 hi2。
  // 千问 qwen3.7-flash 等按 32k/256k 分 3 档(1×/3×/6×)。=0 → 只 2 档或不分档;hi2=0 回落档2。
  input_tier_threshold_2: number;
  price_in_hi2: number;
  price_out_hi2: number;
  price_cache_r_hi2: number;
  price_cache_w_hi2: number;
  speed_class: 'fast' | 'balanced' | 'powerful';
  vision: boolean; // 视觉能力(P2 图片通道)
  flagship: boolean; // 旗舰标识(0089):用户选择器差异化高亮 + 旗舰标签
  user_selectable: boolean;
  min_tier: '' | 'pro' | 'max';
  enabled: boolean;
  sort_order: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

// 新建/编辑提交体 = AgentModel 去掉服务端字段。
export type AgentModelPayload = Omit<AgentModel, 'id' | 'created_at' | 'updated_at'>;

export interface ModelBinding {
  purpose: string;
  model_id: string; // 绑定值(空 = 未绑定)
  effective: string; // Resolve 实际生效值
  fallback: boolean; // 生效值 ≠ 绑定值(缺绑定/指向不存在) → 标红
}

export function useAdminModels() {
  return useQuery({
    queryKey: ['admin', 'models'],
    queryFn: async () => (await http.get<{ data: AgentModel[] }>('/admin/models')).data.data,
  });
}

export function useCreateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AgentModelPayload) => http.post('/admin/models', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'models'] }),
  });
}

export function useUpdateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: AgentModelPayload }) =>
      http.put(`/admin/models/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'models'] });
      qc.invalidateQueries({ queryKey: ['admin', 'model-bindings'] });
    },
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/models/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'models'] });
      qc.invalidateQueries({ queryKey: ['admin', 'model-bindings'] });
    },
  });
}

export function useModelBindings() {
  return useQuery({
    queryKey: ['admin', 'model-bindings'],
    queryFn: async () =>
      (await http.get<{ data: ModelBinding[] }>('/admin/model-bindings')).data.data,
  });
}

export function useSetModelBinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ purpose, modelId }: { purpose: string; modelId: string }) =>
      http.put(`/admin/model-bindings/${encodeURIComponent(purpose)}`, { model_id: modelId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'model-bindings'] }),
  });
}

// ── 上游 Provider(双协议 F0;mirrors backend/internal/modelcatalog/provider.go)──
export interface AgentProviderDTO {
  id: number;
  name: string;
  base_url: string;
  api_key: string; // GET 打码;提交空/遮罩 = 保留旧值
  api_format: 'anthropic' | 'openai';
  reasoning_replay: boolean; // openai 方言:工具轮回传 reasoning(Kimi 系要求;DeepSeek 勿开)
  enabled: boolean;
  push_status: string;
  push_error: string;
  notes: string;
}
export type AgentProviderPayload = Omit<AgentProviderDTO, 'id' | 'push_status' | 'push_error'>;

export function useAdminProviders() {
  return useQuery({
    queryKey: ['admin', 'model-providers'],
    queryFn: async () =>
      (await http.get<{ data: AgentProviderDTO[] }>('/admin/model-providers')).data.data,
  });
}
export function useSaveProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: AgentProviderPayload }) =>
      id ? http.put(`/admin/model-providers/${id}`, data) : http.post('/admin/model-providers', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'model-providers'] }),
  });
}
export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/model-providers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'model-providers'] }),
  });
}

// purpose → 人类可读标签(与 backend modelcatalog.AllPurposes 对齐 —— 精简后只剩「系统槽 + 8 个
// 用户功能」;被合并/折叠的能力经后端 purposeAlias 归到主绑定,不在此列。查不到的 purpose 页面
// 回退渲染原样字符串)。制作PPT/科研绘图 → 智能助手默认;写作画像/修改意见拆条 → 智能写作默认;
// 审稿信件起草 → 预填识别;审稿人盲评/主审裁决 → 审稿环节;免费档覆盖(*.free)整套已下线。
export const PURPOSE_LABELS: Record<string, { label: string; hint: string }> = {
  // 系统槽(基础设施,非用户功能)
  'system.main': { label: '系统主模型', hint: '推送 agent 主槽位;所有回退链的兜底' },
  'system.fast': { label: '系统快模型', hint: '会话标题生成 / 记忆抽取等带外小任务' },
  // 用户功能默认模型(8 项)
  'chat_default.smart_search': { label: '智能文献搜索 · 默认对话', hint: '用户未选模型时的会话默认' },
  'chat_default.claw': { label: '智能助手 · 默认对话', hint: '用户未选模型时的会话默认(制作PPT / 科研绘图 一并走此)' },
  'chat_default.prism': { label: '智能写作 · 默认对话', hint: '用户未选模型时的会话默认(写作画像 / 修改意见拆条 一并走此)' },
  'peerreview.meta': { label: '智能审稿 · 预填识别 / 信件起草', hint: '上传后抽标题/摘要/学科 + 推荐信/审稿信起草(便宜快 + 可靠 JSON)' },
  'peerreview.methodology': { label: '智能审稿 · 审稿环节', hint: '方法论 / 审稿人盲评 / 主审裁决(强推理)' },
  'project.translate': { label: '论文翻译', hint: '标题/摘要/TLDR 流式翻译成中文(便宜快)' },
  'project.analysis': { label: '矩阵分析', hint: '按维度分析论文摘要、输出结构化 JSON(便宜)' },
  'project.wechat_oa': { label: '公众号自动回复', hint: '微信公众号 AI 自动回复(便宜快)' },
};

// ── 厂商官方模型预设(参数一键补全)────────────────────────────────────────────────
// 「预制参数」的前端真源。价格单位:元 / 1M token(= 微元/token,与后端 PriceUsage 口径一致)。
// P5 成本制:额度按四类单价(input/output/cacheRead/cacheWrite)的真实成本扣,不再有 billing_weight
// 倍率;贵模型自然扣得快。分档只影响**价格**(长输入切高档价),不再有 billing_weight_hi。
//
// 端点归属:DeepSeek = 平台默认端点(agent_config,Anthropic 原生,provider_id=0);
//           千问(Qwen)= 额外 provider(DashScope,OpenAI 兼容格式)。
export const DEEPSEEK_ENDPOINT = {
  baseUrl: 'https://api.deepseek.com/anthropic',
  apiFormat: 'anthropic',
} as const;
export const QWEN_ENDPOINT = {
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiFormat: 'openai',
} as const;
// Kimi(Moonshot)= 额外 provider(OpenAI 兼容)。⚠️ 建端点时须开 reasoning_replay(Kimi 系要求工具轮回传 reasoning)。
export const KIMI_ENDPOINT = {
  baseUrl: 'https://api.moonshot.cn/v1',
  apiFormat: 'openai',
} as const;
// 智谱(Zhipu / GLM,bigmodel.cn)= 额外 provider(OpenAI 兼容)。
export const ZHIPU_ENDPOINT = {
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiFormat: 'openai',
} as const;
// 豆包(字节 · 火山方舟 Volcano Ark)= 额外 provider(OpenAI 兼容)。Seed 系是思考模型,建端点建议开 reasoning_replay。
export const DOUBAO_ENDPOINT = {
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  apiFormat: 'openai',
} as const;
// MiniMax(稀宇)= 额外 provider(OpenAI 兼容)。国内 minimaxi.com;⚠️不支持 developer 角色(我们只用 system/user/assistant,无影响)。
export const MINIMAX_ENDPOINT = {
  baseUrl: 'https://api.minimaxi.com/v1',
  apiFormat: 'openai',
} as const;

export type PresetParams = Pick<
  AgentModelPayload,
  | 'display_name' | 'description' | 'context_window' | 'max_output'
  | 'price_in' | 'price_cache_r' | 'price_out' | 'price_cache_w'
  | 'speed_class' | 'vision'
  | 'input_tier_threshold' | 'price_in_hi' | 'price_out_hi'
  | 'price_cache_r_hi' | 'price_cache_w_hi'
  | 'input_tier_threshold_2' | 'price_in_hi2' | 'price_out_hi2'
  | 'price_cache_r_hi2' | 'price_cache_w_hi2'
> & {
  // max_input 可选:多数厂商只给「上下文 + 最大输出」,max_input 留空(0)让 agent 自动算;
  // 千问等明确给了「最大输入」的模型可预置(如 991_800)。
  max_input?: number;
};

// 不分档(扁平计价)的默认分档字段。DeepSeek 全系、qwen max/flash 用它(官网无分档 tab)。
const NO_TIER = {
  input_tier_threshold: 0,
  price_in_hi: 0, price_out_hi: 0, price_cache_r_hi: 0, price_cache_w_hi: 0,
  input_tier_threshold_2: 0,
  price_in_hi2: 0, price_out_hi2: 0, price_cache_r_hi2: 0, price_cache_w_hi2: 0,
} as const;

// 全部官方预设模型(按 model_id 索引)。vendor 决定归属端点。价格均为官方原价(非促销)。
// 分档:仅 qwen3.7-plus / 豆包 mini 官网确认长输入切高档价(仅价格分档);其余扁平(NO_TIER)。
export const MODEL_PRESETS: Record<
  string,
  PresetParams & { vendor: 'deepseek' | 'qwen' | 'kimi' | 'zhipu' | 'doubao' | 'minimax' }
> = {
  'deepseek-v4-flash': {
    vendor: 'deepseek', display_name: 'DeepSeek V4 Flash', description: '均衡高性价比,日常主力',
    context_window: 1_000_000, max_output: 384_000,
    price_in: 1.0, price_cache_r: 0.02, price_out: 2.0, price_cache_w: 0,
    speed_class: 'balanced', vision: false, ...NO_TIER,
  },
  'deepseek-v4-pro': {
    vendor: 'deepseek', display_name: 'DeepSeek V4 Pro', description: '更强推理,复杂任务',
    context_window: 1_000_000, max_output: 384_000,
    price_in: 3.0, price_cache_r: 0.025, price_out: 6.0, price_cache_w: 0,
    speed_class: 'powerful', vision: false, ...NO_TIER,
  },
  'qwen3.7-plus': {
    vendor: 'qwen', display_name: 'Qwen3.7 Plus', description: '多模态·支持视觉,1M 上下文',
    // 上下文=总窗 1M;最大输入 991.8K / 最大输出 65.53K 分开配(压缩墙据 max_input 定输入预算)。
    context_window: 1_000_000, max_input: 991_800, max_output: 65_536,
    // ⚠️ 缓存 0.4(=输入 2 的 20%,与 qwen 全系一致;你写的 0.04 疑似漏小数点,若真是 0.04 再改)。
    price_in: 2.0, price_cache_r: 0.4, price_out: 8.0, price_cache_w: 0,
    speed_class: 'balanced', vision: true,
    // >256k 输入约 3×:价格切高档 6/1.2/24(仅价格分档,成本自然翻 3×)。仅 2 档,无第三档。
    input_tier_threshold: 256_000,
    price_in_hi: 6.0, price_cache_r_hi: 1.2, price_out_hi: 24.0, price_cache_w_hi: 0,
    input_tier_threshold_2: 0, price_in_hi2: 0, price_out_hi2: 0, price_cache_r_hi2: 0, price_cache_w_hi2: 0,
  },
  'qwen3.7-max': {
    vendor: 'qwen', display_name: 'Qwen3.7 Max', description: '旗舰·强推理(纯文本),1M 上下文',
    context_window: 1_000_000, max_input: 991_800, max_output: 65_536,
    price_in: 12.0, price_cache_r: 2.4, price_out: 36.0, price_cache_w: 0,
    speed_class: 'powerful', vision: false, ...NO_TIER,
  },
  'qwen3.7-flash': {
    vendor: 'qwen', display_name: 'Qwen3.7 Flash', description: '轻量极速·支持视觉,1M 上下文',
    context_window: 1_000_000, max_input: 991_800, max_output: 65_536,
    // 官网(qianwenai.com)按输入长度分 3 档(1×/3×/6×):
    //   ≤32k:      输入 0.2 / 输出 0.8 / 缓存命中 0.04
    //   32k–256k:  输入 0.6 / 输出 2.4 / 缓存命中 0.12
    //   256k–1M:   输入 1.2 / 输出 4.8 / 缓存命中 0.24
    price_in: 0.2, price_cache_r: 0.04, price_out: 0.8, price_cache_w: 0,
    speed_class: 'fast', vision: true,
    input_tier_threshold: 32_000,
    price_in_hi: 0.6, price_out_hi: 2.4, price_cache_r_hi: 0.12, price_cache_w_hi: 0,
    input_tier_threshold_2: 256_000,
    price_in_hi2: 1.2, price_out_hi2: 4.8, price_cache_r_hi2: 0.24, price_cache_w_hi2: 0,
  },
  // ── Kimi(Moonshot)官方原价;max_output=0 → 回落全局(openai 出口 400 自愈)。均不分档。──
  'kimi-k3': {
    vendor: 'kimi', display_name: 'Kimi K3', description: '旗舰·1M 上下文(输出极贵)',
    context_window: 1_048_576, max_output: 0,
    price_in: 20.0, price_cache_r: 2.0, price_out: 100.0, price_cache_w: 0,
    speed_class: 'powerful', vision: false, ...NO_TIER,
  },
  'kimi-k2.6': {
    vendor: 'kimi', display_name: 'Kimi K2.6', description: '多模态·支持视觉,256K',
    context_window: 262_144, max_output: 0,
    price_in: 6.5, price_cache_r: 1.1, price_out: 27.0, price_cache_w: 0,
    speed_class: 'balanced', vision: true, ...NO_TIER,
  },
  'kimi-k2.7-code': {
    vendor: 'kimi', display_name: 'Kimi K2.7 Code', description: '代码·多模态,256K',
    context_window: 262_144, max_output: 0,
    price_in: 6.5, price_cache_r: 1.3, price_out: 27.0, price_cache_w: 0,
    speed_class: 'balanced', vision: true, ...NO_TIER,
  },
  // ── 智谱(Zhipu / GLM,bigmodel.cn)——文本 2(GLM-5.2 / GLM-4.7-FlashX)+ 视觉 1(GLM-5V-Turbo)。
  //    价格取自官网定价页(截图核对,2026-07)。分档按「输入长度」:32=32000。缓存存储(写)限时免费 → cache_w=0;
  //    「缓存命中」= 我们的 cache_r。max_output=128K(>全局 64K,实际输出仍被全局 64K 兜)。──
  'glm-5.2': {
    vendor: 'zhipu', display_name: 'GLM-5.2', description: '旗舰·新品,1M 上下文',
    context_window: 1_000_000, max_output: 131_072,
    // 扁平(1M 单档):输入 8 / 输出 28 / 缓存命中 2。
    price_in: 8.0, price_cache_r: 2.0, price_out: 28.0, price_cache_w: 0,
    speed_class: 'powerful', vision: false, ...NO_TIER,
  },
  'glm-4.7-flashx': {
    vendor: 'zhipu', display_name: 'GLM-4.7-FlashX', description: '轻量极速·低成本,200K',
    context_window: 200_000, max_output: 131_072,
    // 扁平(200K):输入 0.5 / 输出 3 / 缓存命中 0.1。
    price_in: 0.5, price_cache_r: 0.1, price_out: 3.0, price_cache_w: 0,
    speed_class: 'fast', vision: false, ...NO_TIER,
  },
  'glm-5v-turbo': {
    vendor: 'zhipu', display_name: 'GLM-5V-Turbo', description: '多模态·视觉极速,新品',
    context_window: 200_000, max_output: 131_072,
    // 2 档(32k):≤32k 输入 5/输出 22/缓存 1.2;>32k 输入 7/输出 26/缓存 1.8。
    price_in: 5.0, price_cache_r: 1.2, price_out: 22.0, price_cache_w: 0,
    speed_class: 'fast', vision: true,
    input_tier_threshold: 32_000,
    price_in_hi: 7.0, price_out_hi: 26.0, price_cache_r_hi: 1.8, price_cache_w_hi: 0,
    input_tier_threshold_2: 0, price_in_hi2: 0, price_out_hi2: 0, price_cache_r_hi2: 0, price_cache_w_hi2: 0,
  },
  // ── 豆包(火山方舟)—— 模型 ID 带日期快照;均原生多模态。cache 价为估值(火山控制台核对)。──
  'doubao-seed-2-1-pro-260628': {
    vendor: 'doubao', display_name: '豆包 Seed 2.1 Pro', description: '旗舰·原生多模态,256K',
    context_window: 224_000, max_output: 32_768, // 火山:最大输入 224K(压缩墙用它)+ 输出上限 32K(避免发 64000 撞 400)
    price_in: 6.0, price_cache_r: 0.6, price_out: 30.0, price_cache_w: 0, // cache 估值
    speed_class: 'powerful', vision: true, ...NO_TIER,
  },
  'doubao-seed-2-1-turbo-260628': {
    vendor: 'doubao', display_name: '豆包 Seed 2.1 Turbo', description: '多模态·均衡,256K',
    context_window: 224_000, max_output: 32_768, // 火山:最大输入 224K(压缩墙用它)+ 输出上限 32K(避免发 64000 撞 400)
    price_in: 3.0, price_cache_r: 0.3, price_out: 15.0, price_cache_w: 0, // cache 估值
    speed_class: 'balanced', vision: true, ...NO_TIER,
  },
  'doubao-seed-2-0-mini-260215': {
    vendor: 'doubao', display_name: '豆包 Seed 2.0 Mini', description: '轻量极便宜·支持视觉,256K',
    context_window: 224_000, max_output: 32_768, // 火山:最大输入 224K(压缩墙用它)+ 输出上限 32K(避免发 64000 撞 400)
    price_in: 0.2, price_cache_r: 0.03, price_out: 2.0, price_cache_w: 0, // cache 估值
    speed_class: 'fast', vision: true,
    // ⚠️ 豆包 mini 输入 >32k 价格分档涨价(官方确认,倍数为估值 ≈2×,请在火山控制台核实后改)。仅 2 档。
    input_tier_threshold: 32_000,
    price_in_hi: 0.4, price_cache_r_hi: 0.06, price_out_hi: 4.0, price_cache_w_hi: 0,
    input_tier_threshold_2: 0, price_in_hi2: 0, price_out_hi2: 0, price_cache_r_hi2: 0, price_cache_w_hi2: 0,
  },
  // ── MiniMax(稀宇)—— M3(2 档 @512k)+ M2.7 / M2.7-highspeed(扁平)。价格取自官网(截图,2026-07)。
  //    ⚠️ M3 标「永久五折」,已按折后价填(非划线原价)。M2.7 系上下文窗口截图未给,取保守值待核对。──
  'MiniMax-M3': {
    vendor: 'minimax', display_name: 'MiniMax M3', description: '旗舰·超长上下文(多模态)',
    context_window: 1_000_000, max_output: 0,
    // 2 档(输入 512k;永久五折价):≤512k 输入 2.10/输出 8.40/缓存读 0.42;>512k 输入 4.20/输出 16.80/缓存读 0.84。
    price_in: 2.1, price_cache_r: 0.42, price_out: 8.4, price_cache_w: 0,
    speed_class: 'powerful', vision: true,
    input_tier_threshold: 512_000,
    price_in_hi: 4.2, price_out_hi: 16.8, price_cache_r_hi: 0.84, price_cache_w_hi: 0,
    input_tier_threshold_2: 0, price_in_hi2: 0, price_out_hi2: 0, price_cache_r_hi2: 0, price_cache_w_hi2: 0,
  },
  'MiniMax-M2.7': {
    vendor: 'minimax', display_name: 'MiniMax M2.7', description: '均衡·多模态,204.8K',
    context_window: 204_800, max_output: 0,
    // 扁平:输入 2.1 / 输出 8.4 / 缓存读 0.42 / 缓存写 2.625。
    price_in: 2.1, price_cache_r: 0.42, price_out: 8.4, price_cache_w: 2.625,
    speed_class: 'balanced', vision: true, ...NO_TIER,
  },
  'MiniMax-M2.7-highspeed': {
    vendor: 'minimax', display_name: 'MiniMax M2.7 Highspeed', description: '高速·多模态,204.8K',
    context_window: 204_800, max_output: 0,
    // 扁平:输入 4.2 / 输出 16.8 / 缓存读 0.42 / 缓存写 2.625。
    price_in: 4.2, price_cache_r: 0.42, price_out: 16.8, price_cache_w: 2.625,
    speed_class: 'fast', vision: true, ...NO_TIER,
  },
};

// 各厂商「一键补全」遍历的型号顺序(也是面板区块内的渲染顺序)。
export const DEEPSEEK_MODEL_ORDER = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const;
export const QWEN_MODEL_ORDER = ['qwen3.7-plus', 'qwen3.7-max', 'qwen3.7-flash'] as const;
export const KIMI_MODEL_ORDER = ['kimi-k3', 'kimi-k2.6', 'kimi-k2.7-code'] as const;
export const ZHIPU_MODEL_ORDER = ['glm-5.2', 'glm-4.7-flashx', 'glm-5v-turbo'] as const;
export const DOUBAO_MODEL_ORDER = ['doubao-seed-2-1-pro-260628', 'doubao-seed-2-1-turbo-260628', 'doubao-seed-2-0-mini-260215'] as const;
export const MINIMAX_MODEL_ORDER = ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'] as const;

// ── 额外厂商面板注册表(数据驱动)────────────────────────────────────────────────
// DeepSeek 是平台**默认端点**(agent_config,Anthropic 原生,provider_id=0),单独特判、不在此列。
// 其余厂商都是「额外 provider(OpenAI 兼容)+ 预设模型」同一套:面板按 baseUrlMatch 认出其 provider,
// 渲染成独立区块(带「应用官方预设」);没建端点则渲染引导。加新厂商 = 往这个数组加一项。
export interface VendorPanelDef {
  key: 'qwen' | 'kimi' | 'zhipu' | 'doubao' | 'minimax';
  label: string; // 面板区块标题
  endpoint: { baseUrl: string; apiFormat: 'openai' | 'anthropic' };
  models: readonly string[]; // 一键补全的型号(需在 MODEL_PRESETS 里)
  baseUrlMatch: string; // 用它在 providers 里认出该厂商端点(base_url.includes)
  requiresReasoningReplay?: boolean; // 建端点提示:须开 reasoning_replay
}
export const EXTRA_VENDOR_PANELS: VendorPanelDef[] = [
  { key: 'qwen', label: '千问 官方', endpoint: QWEN_ENDPOINT, models: QWEN_MODEL_ORDER, baseUrlMatch: 'dashscope.aliyuncs.com' },
  { key: 'kimi', label: 'Kimi 官方', endpoint: KIMI_ENDPOINT, models: KIMI_MODEL_ORDER, baseUrlMatch: 'moonshot', requiresReasoningReplay: true },
  { key: 'zhipu', label: '智谱 官方(GLM)', endpoint: ZHIPU_ENDPOINT, models: ZHIPU_MODEL_ORDER, baseUrlMatch: 'bigmodel.cn' },
  { key: 'doubao', label: '豆包(火山方舟)', endpoint: DOUBAO_ENDPOINT, models: DOUBAO_MODEL_ORDER, baseUrlMatch: 'volces.com', requiresReasoningReplay: true },
  { key: 'minimax', label: 'MiniMax', endpoint: MINIMAX_ENDPOINT, models: MINIMAX_MODEL_ORDER, baseUrlMatch: 'minimax' },
];

// 一键预设时**自动写入**的排序 + 旗舰标识(集中一处维护,不散落到每个预设对象)。
// PRESET_SORT_ORDER:用户选择器里的默认展示顺序 —— 数组下标 → sort_order=(下标+1)*10(留插入缝)。
//   规则:按厂商分组(DeepSeek 平台默认端点在前),组内 旗舰→均衡→轻量。不在此列的模型保留 admin 既有 sort。
const PRESET_SORT_ORDER: readonly string[] = [
  'deepseek-v4-pro', 'deepseek-v4-flash',
  'qwen3.7-max', 'qwen3.7-plus', 'qwen3.7-flash',
  'glm-5.2', 'glm-5v-turbo', 'glm-4.7-flashx',
  'MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed',
  'kimi-k3', 'kimi-k2.6', 'kimi-k2.7-code',
  'doubao-seed-2-1-pro-260628', 'doubao-seed-2-1-turbo-260628', 'doubao-seed-2-0-mini-260215',
];
// PRESET_FLAGSHIP:一键预设自动标为旗舰的模型(各厂商最强的那个)。不在此集的预设**不动** admin 的旗舰选择
//   (只加不减:admin 可手动把别的模型标旗舰,重应用预设不会取消)。
const PRESET_FLAGSHIP: ReadonlySet<string> = new Set([
  'deepseek-v4-pro', 'qwen3.7-max', 'glm-5.2', 'MiniMax-M3', 'kimi-k3', 'doubao-seed-2-1-pro-260628',
]);

// 把预设展开成完整 payload。providerId:DeepSeek=0(默认端点,system 槽位只能绑它);
// 千问=其 DashScope provider 的 id。existing 存在时保留 admin 的可选开关,只覆盖官方参数;
// 排序 + 旗舰由 PRESET_SORT_ORDER / PRESET_FLAGSHIP 自动写入(用户的要求)。
export function presetPayload(
  modelId: string,
  existing: AgentModel | null | undefined,
  providerId: number,
): AgentModelPayload {
  const p = MODEL_PRESETS[modelId];
  return {
    model_id: modelId,
    provider_id: providerId,
    channel: 'agent',
    display_name: p.display_name,
    description: p.description,
    context_window: p.context_window,
    max_input: p.max_input ?? 0, // 未预置 → 0,由 agent 压缩墙自动算「上下文 − 输出预留」
    max_output: p.max_output,
    price_in: p.price_in,
    price_cache_r: p.price_cache_r,
    price_out: p.price_out,
    price_cache_w: p.price_cache_w,
    speed_class: p.speed_class,
    vision: p.vision,
    // 输入价格分档(官方预设一并写入;扁平模型这些为 0)
    input_tier_threshold: p.input_tier_threshold,
    price_in_hi: p.price_in_hi,
    price_out_hi: p.price_out_hi,
    price_cache_r_hi: p.price_cache_r_hi,
    price_cache_w_hi: p.price_cache_w_hi,
    input_tier_threshold_2: p.input_tier_threshold_2,
    price_in_hi2: p.price_in_hi2,
    price_out_hi2: p.price_out_hi2,
    price_cache_r_hi2: p.price_cache_r_hi2,
    price_cache_w_hi2: p.price_cache_w_hi2,
    // 保留 admin 既有的可选项(不被官方预设覆盖)
    user_selectable: existing?.user_selectable ?? true,
    min_tier: existing?.min_tier ?? '',
    enabled: existing?.enabled ?? true,
    notes: existing?.notes ?? '',
    // 排序 + 旗舰:一键预设自动写入(用户要求)。sort_order 由全局顺序表定;
    // flagship 命中集合即置 true,否则保留 admin 既有(只加不减)。
    sort_order:
      PRESET_SORT_ORDER.indexOf(modelId) >= 0
        ? (PRESET_SORT_ORDER.indexOf(modelId) + 1) * 10
        : existing?.sort_order ?? 0,
    flagship: PRESET_FLAGSHIP.has(modelId) ? true : existing?.flagship ?? false,
  };
}
