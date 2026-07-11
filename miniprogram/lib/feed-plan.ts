// 论文 feed 的 (seed,page) 纯函数规划器 —— 1:1 搬自 Web features/mobile/api/feed.ts。
// 同 seed 同 page = 同结果;换 seed = 刷新一批。无 DOM 依赖。

export const FEED_PAGE_SIZE = 10
export const FEED_MAX_PAGES = 60
export const EMPTY_STOP = 4
const RECENT_YEARS = 3

const GENERAL_TOPICS = [
  'large language models', 'graph neural networks', 'reinforcement learning',
  'diffusion models', 'computer vision', 'natural language processing',
  'quantum computing', 'superconductivity', 'black holes', 'dark matter',
  'perovskite solar cells', 'lithium battery', 'carbon capture', 'renewable energy',
  'nanomaterials', 'metamaterials', '2D materials', 'catalysis',
  'climate change', 'remote sensing', 'earthquake prediction', 'ocean warming',
  'robotics', 'autonomous driving', 'federated learning', 'protein structure prediction',
]

const BIOMED_TOPICS = [
  'CRISPR gene editing', 'cancer immunotherapy', 'gut microbiome', 'gene therapy',
  'single-cell RNA sequencing', 'Alzheimer disease', 'vaccine development', 'stem cells',
  'metabolomics', 'antibiotic resistance', 'tumor microenvironment', 'neural stem cells',
  'mRNA vaccine', 'CAR-T cell therapy', 'epidemiology', 'diabetes treatment',
]

const FEED_SOURCES = ['stc', 'olx', 'pmd'] as const

export interface PaperPagePlan {
  source: string
  query: string
  limit: number
  offset: number
  year_from: number
  sort?: string
}

// 把一页的「源/主题/offset/排序」由 (seed,page) 确定地推出来。
export function planPaperPage(seed: number, page: number): PaperPagePlan {
  const source = FEED_SOURCES[page % FEED_SOURCES.length]
  const pool = source === 'pmd' ? BIOMED_TOPICS : GENERAL_TOPICS
  const topic = pool[(seed + page * 7) % pool.length]
  const round = Math.floor(page / FEED_SOURCES.length)
  // 第一页固定 offset 0 保首屏稳;其余按 (round + seed%5) 深翻抖动。
  const offset = page === 0 ? 0 : (round + (seed % 5)) * FEED_PAGE_SIZE
  const sort = source === 'olx' ? 'publication_date:desc' : source === 'pmd' ? 'date' : undefined
  const year_from = new Date().getFullYear() - RECENT_YEARS
  const plan: PaperPagePlan = { source, query: topic, limit: FEED_PAGE_SIZE, offset, year_from }
  if (sort) plan.sort = sort
  return plan
}

// 期刊 feed 起始页抖动(固定按影响因子降序,seed%8 切不同高分切片)。
export function planJournalStartPage(seed: number): number {
  return 1 + (seed % 8)
}

// 生成一个新 seed(下拉刷新换一批)。
export function newSeed(): number {
  return Math.floor(Date.now() % 100000)
}
