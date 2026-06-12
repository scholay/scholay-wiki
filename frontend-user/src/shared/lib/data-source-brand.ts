/**
 * Scholay 平台对 Minicod 三个学术数据源的对外品牌名。
 *
 * Minicod MCP server 内部用 `semantic` / `openalex` / `pubmed` 作为工具调用入参的 enum,
 * 而在返回的论文条目里 `source` 字段又被简写为 `stc` / `olx` / `pmd`(以及 `jnl` 表示
 * Minicod 自有期刊库)。这两套命名都不直接面向终端用户。
 *
 * 我们在 UI(工具调用气泡、论文卡 meta)和 system prompt 里统一使用品牌名:
 *   - Graph    = Semantic Scholar (引文图谱,citation graph)
 *   - Discovery = OpenAlex (全量学术发现)
 *   - Medicine  = PubMed (生物医学专属)
 *
 * 注意:这只是 *展示层* 的映射,工具调用入参仍必须用 minicod 接受的 enum 值。
 * 不要把品牌名传给工具。
 */

/** 用户可见的品牌名 */
export type SourceBrand = 'Graph' | 'Discovery' | 'Medicine' | 'Journal';

/**
 * 把任意已知的 source 标识(工具入参 enum、tool_result.source 缩写、或品牌名本身)
 * 归一化为 SourceBrand。命中不到时返回 undefined,调用方决定 fallback。
 */
export function normalizeSourceBrand(
  raw: string | undefined | null
): SourceBrand | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  switch (v) {
    case 'semantic':
    case 'semanticscholar':
    case 'semantic_scholar':
    case 'stc':
    case 'graph':
      return 'Graph';
    case 'openalex':
    case 'open_alex':
    case 'olx':
    case 'discovery':
      return 'Discovery';
    case 'pubmed':
    case 'pub_med':
    case 'pmd':
    case 'medicine':
      return 'Medicine';
    case 'minicod':
    case 'jnl':
    case 'journal':
      return 'Journal';
    default:
      return undefined;
  }
}

/**
 * 优先返回品牌名,匹配不到就把原始字段当作"venue 字符串"原样返回。
 * 用在论文卡 meta 行(authors · source · year)上 —— 真实的 venue
 * (例如 "Nature Medicine" / "arXiv")保留原样,而 "stc" 这种内部码
 * 替换为 "Graph"。
 */
export function displaySourceLabel(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return normalizeSourceBrand(raw) ?? raw;
}
