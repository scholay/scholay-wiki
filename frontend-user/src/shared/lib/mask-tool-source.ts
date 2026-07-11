/**
 * 把工具入参 / 结果里**内部数据源 enum**(semantic / openalex / pubmed / stc / olx / pmd / jnl…)
 * 深度替换成对外品牌名(Graph / Discovery / Medicine / Journal),用于工具调用详情的展示层。
 *
 * 背景:Minicod MCP 工具调用入参用 `source: "openalex"` 这类内部枚举,直接 JSON 展开给用户看
 * 会泄漏内部实现(对照 system prompt 的硬约束:对外只用三个品牌名)。这里只动**展示**,不影响
 * 真正发给工具的入参。
 *
 * 注:映射表与 `features/search/.../dataSourceBrand.ts` 的 normalizeSourceBrand 一致;那个服务于
 * 论文卡 / chip 的品牌展示,本文件服务于通用 ToolCallBlock 的入参/结果折叠,层级不同(shared 不能
 * 反向 import feature),故各持一份稳定映射。
 */
const SOURCE_BRAND: Record<string, string> = {
  semantic: 'Graph',
  semanticscholar: 'Graph',
  semantic_scholar: 'Graph',
  stc: 'Graph',
  graph: 'Graph',
  openalex: 'Discovery',
  open_alex: 'Discovery',
  olx: 'Discovery',
  discovery: 'Discovery',
  pubmed: 'Medicine',
  pub_med: 'Medicine',
  pmd: 'Medicine',
  medicine: 'Medicine',
  minicod: 'Journal',
  jnl: 'Journal',
  journal: 'Journal',
};

/**
 * 深度遍历,把对象里 key 为 `source` 且值命中已知 enum 的字段换成品牌名。
 * 其余字段原样保留;命中不到的 source 值也原样返回(可能是真实 venue)。
 *
 * 字符串也处理:MCP tool_result 常把论文 JSON 作为 content[].text 字符串整体返回,
 * 对象遍历够不到里面的 "source":"olx",会让内部源码从「结果」折叠里泄漏。这里对字符串
 * 里的 "source":"<enum>" 同样替换成品牌名。
 */
export function maskToolSource(value: unknown): unknown {
  if (typeof value === 'string') return maskSourceInString(value);
  if (Array.isArray(value)) return value.map(maskToolSource);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'source' && typeof v === 'string') {
        out[k] = SOURCE_BRAND[v.trim().toLowerCase()] ?? v;
      } else {
        out[k] = maskToolSource(v);
      }
    }
    return out;
  }
  return value;
}

/**
 * 无歧义的内部源 token —— 只有这些「一看就是内部实现」的写法才在自由文本里全局替换成品牌名。
 * 刻意不含 semantic / graph / medicine / journal / discovery 这类与普通英文或品牌名撞词的 token,
 * 避免把正文里合法的 "semantic web" / "medicine" 误伤。
 */
const UNAMBIGUOUS_INTERNAL_SOURCE =
  /\b(open_?alex|semantic_?scholar|pub_?med|stc|olx|pmd|jnl)\b/gi;

/**
 * 把字符串里裸露的内部数据源替换成品牌名(评审 #7)。两道:
 *   1. `"source":"<enum>"` 这种 JSON 键值(含命中不到的真实 venue 原样留);
 *   2. 自由文本 / 非 `source` 键 / 错误串里裸露的无歧义内部 token(如 tool_result 报错文本里的 "openalex")。
 */
function maskSourceInString(s: string): string {
  let out = s.replace(/("source"\s*:\s*")([A-Za-z_]+)(")/g, (whole, pre, val, post) => {
    const brand = SOURCE_BRAND[val.trim().toLowerCase()];
    return brand ? pre + brand + post : whole;
  });
  out = out.replace(UNAMBIGUOUS_INTERNAL_SOURCE, (tok) => SOURCE_BRAND[tok.toLowerCase()] ?? tok);
  return out;
}
