/**
 * 期刊搜索筛选状态 —— 与后端 JournalSearchOptions(精简后)对齐。
 * 单一来源:JournalSearchPage 持有,主区筛选弹窗编辑、useJournalSearch 消费。
 *
 * 设计稿 `[02-期刊]` 左侧 5 个 group:
 *   1. 中科院分区(fqbQuartile)
 *   2. JCR 分区(jcrQuartile)
 *   3. 影响因子(minImpactFactor 阶梯档:5/10/20/30)
 *   4. CCF 推荐(ccfRank)
 *   5. 出版商(publisher)
 *
 * 任意字段变化 → useJournalSearch 自动重查(queryKey 含全字段)。
 */
export interface JournalFilters {
  fqbQuartile?: '1' | '2' | '3' | '4';
  jcrQuartile?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  /** 阶梯档,选哪个就把对应数值传给后端 min_impact_factor */
  minImpactFactor?: 5 | 10 | 20 | 30;
  ccfRank?: 'A' | 'B' | 'C';
  publisher?: string;
}

export const DEFAULT_JOURNAL_FILTERS: JournalFilters = {};

/** 中科院分区 4 档(.pen `pvFIF`-`oDqMb`) */
export const FQB_QUARTILE_OPTIONS = [
  { value: '1', label: '1 区 (Top)' },
  { value: '2', label: '2 区' },
  { value: '3', label: '3 区' },
  { value: '4', label: '4 区' },
] as const;

/** JCR 分区 4 档(.pen `mvcpF`-`P4TyxU`) */
export const JCR_QUARTILE_OPTIONS = [
  { value: 'Q1', label: 'Q1' },
  { value: 'Q2', label: 'Q2' },
  { value: 'Q3', label: 'Q3' },
  { value: 'Q4', label: 'Q4' },
] as const;

/** 影响因子阶梯(.pen `qWOsB`-`z2u3Ug`) —— 数值代表 ≥N */
export const IF_THRESHOLD_OPTIONS = [
  { value: 30, label: 'IF ≥ 30' },
  { value: 20, label: 'IF ≥ 20' },
  { value: 10, label: 'IF ≥ 10' },
  { value: 5, label: 'IF ≥ 5' },
] as const;

/** CCF 推荐 3 档(.pen `e6vxX`-`h3gtqv`) */
export const CCF_OPTIONS = [
  { value: 'A', label: 'A 类' },
  { value: 'B', label: 'B 类' },
  { value: 'C', label: 'C 类' },
] as const;

/** 常用出版商(.pen `k97zdc`-`ntT3a`) —— 实际项目可改成 GetJournalFilters fetch */
export const PUBLISHER_OPTIONS = [
  { value: 'Nature Portfolio', label: 'Nature Portfolio' },
  { value: 'Elsevier', label: 'Elsevier' },
  { value: 'IEEE', label: 'IEEE' },
  { value: 'Springer', label: 'Springer' },
  { value: 'ACM', label: 'ACM' },
] as const;
