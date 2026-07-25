/**
 * 科研绘图「内置图标包」—— 车道 D(素材库装配)的**可插拔基础设施 + 原创种子集**。
 *
 * 定位:agent 画 scene-graph 时,icon 节点用 `iconKey` 引用这里的专业图标(而非临时手绘丑 SVG);
 * 画布 IconNode 据 key 取出内联 SVG 渲染。这样图标**一致、专业、可复用**,scene-graph 也更小(只存 key)。
 *
 * 两层素材(经 icon-registry.ts 合并,统一走 getIcon(key) 取):
 *   1) 本文件 = **常驻手绘核心**(全原创,CC0 心智),含器官示意/箭头等基础词汇,体积小、随画布常驻。
 *   2) icon-pack.bioicons.ts = **bioicons CC0 专业图标大包**(真实开源素材,按需动态加载独立 chunk),
 *      由 scripts/gen-bioicons.mjs 从 bioicons(https://bioicons.com)的 CC0 集下载+优化生成,更贴论文质感。
 * 扩充核心:把资产 SVG 加进 ICON_PACK,填 license/attribution;CC-BY 资产必须带 attribution(画布会汇总署名)。
 * 扩充 bioicons:改 scripts/bioicons-manifest.json 后重跑生成器(仅收 CC0,无署名义务)。
 *
 * ⚠️ 契约:ICON_PACK 的 key 必须与 agent 侧 figures skill 的「内置图标目录」严格对齐(改一处两处一起改)。
 */

export interface IconAsset {
  /** 中文标签(给 agent 目录 + UI 显示)。 */
  label: string;
  /** 内联 SVG 源码(viewBox="0 0 64 64",渲染前经 DOMPurify 清洗)。 */
  svg: string;
  /** 许可:cc0=无署名义务;cc-by=需署名(attribution 必填);pd=公共领域。 */
  license: 'cc0' | 'cc-by' | 'pd';
  /** CC-BY 必需的署名串(画布/导出汇总展示);cc0/pd 留空。 */
  attribution?: string;
  /** 检索/匹配关键词(agent 或后期检索用)。 */
  tags?: string[];
  /** 溯源(如 'bioicons');自制种子留空。 */
  source?: string;
}

export const ICON_PACK: Record<string, IconAsset> = {
  cell: {
    label: '细胞',
    license: 'cc0',
    tags: ['cell', '细胞'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="32" cy="32" rx="28" ry="21" fill="#eaf3ee" stroke="#2f8f4e" stroke-width="2.5"/><ellipse cx="25" cy="29" rx="8" ry="7" fill="#c4e2d1"/></svg>',
  },
  nucleus: {
    label: '细胞核',
    license: 'cc0',
    tags: ['nucleus', '核', '细胞核'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#efe8ff" stroke="#6a3fd6" stroke-width="2.5"/><circle cx="36" cy="34" r="6" fill="#b79ff0"/><circle cx="24" cy="25" r="2.2" fill="#8b6be0"/><circle cx="28" cy="41" r="2" fill="#8b6be0"/><circle cx="43" cy="22" r="1.8" fill="#8b6be0"/></svg>',
  },
  mitochondrion: {
    label: '线粒体',
    license: 'cc0',
    tags: ['mitochondrion', '线粒体'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="32" cy="32" rx="28" ry="15" fill="#fdeede" stroke="#d9822b" stroke-width="2.5"/><path d="M12 28 q6 8 12 0 t12 0 t12 0" fill="none" stroke="#d9822b" stroke-width="2"/><path d="M12 36 q6 -8 12 0 t12 0 t12 0" fill="none" stroke="#d9822b" stroke-width="2"/></svg>',
  },
  membrane: {
    label: '细胞膜(脂双层)',
    license: 'cc0',
    tags: ['membrane', '膜', '脂双层', 'lipid bilayer'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="#f6c453" stroke="#c9962a" stroke-width="1"><circle cx="10" cy="22" r="5"/><circle cx="24" cy="22" r="5"/><circle cx="38" cy="22" r="5"/><circle cx="52" cy="22" r="5"/><circle cx="10" cy="42" r="5"/><circle cx="24" cy="42" r="5"/><circle cx="38" cy="42" r="5"/><circle cx="52" cy="42" r="5"/></g><g stroke="#c9962a" stroke-width="1.5"><line x1="10" y1="27" x2="10" y2="34"/><line x1="24" y1="27" x2="24" y2="34"/><line x1="38" y1="27" x2="38" y2="34"/><line x1="52" y1="27" x2="52" y2="34"/><line x1="10" y1="37" x2="10" y2="30"/><line x1="24" y1="37" x2="24" y2="30"/><line x1="38" y1="37" x2="38" y2="30"/><line x1="52" y1="37" x2="52" y2="30"/></g></svg>',
  },
  receptor: {
    label: '膜受体',
    license: 'cc0',
    tags: ['receptor', '受体'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="6" y="28" width="52" height="10" fill="#f2e8d5" stroke="#c9a15a" stroke-width="1.5"/><path d="M32 12 l-9 -6 M32 12 l9 -6 M32 12 v42" fill="none" stroke="#8a6d3b" stroke-width="4" stroke-linecap="round"/><rect x="26" y="26" width="12" height="14" rx="2" fill="#e7d3a6" stroke="#8a6d3b" stroke-width="1.5"/></svg>',
  },
  dna: {
    label: 'DNA 双螺旋',
    license: 'cc0',
    tags: ['dna', '双螺旋', '基因'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M24 8 q16 12 0 24 t0 24" fill="none" stroke="#2f6fd6" stroke-width="3"/><path d="M40 8 q-16 12 0 24 t0 24" fill="none" stroke="#d64f6f" stroke-width="3"/><g stroke="#9aa5b1" stroke-width="2"><line x1="27" y1="16" x2="37" y2="16"/><line x1="30" y1="32" x2="34" y2="32"/><line x1="27" y1="48" x2="37" y2="48"/></g></svg>',
  },
  protein: {
    label: '蛋白质',
    license: 'cc0',
    tags: ['protein', '蛋白', '酶'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M20 22 q4 -12 16 -8 q14 2 12 16 q4 12 -8 18 q-12 8 -22 -2 q-10 -10 2 -22z" fill="#e6eefc" stroke="#3b5bdb" stroke-width="2.5"/></svg>',
  },
  antibody: {
    label: '抗体',
    license: 'cc0',
    tags: ['antibody', '抗体', 'igg'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 54 V34 M32 34 L18 12 M32 34 L46 12" fill="none" stroke="#c0392b" stroke-width="5" stroke-linecap="round"/></svg>',
  },
  virus: {
    label: '病毒',
    license: 'cc0',
    tags: ['virus', '病毒'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g stroke="#7048e8" stroke-width="2"><line x1="32" y1="6" x2="32" y2="14"/><line x1="32" y1="50" x2="32" y2="58"/><line x1="6" y1="32" x2="14" y2="32"/><line x1="50" y1="32" x2="58" y2="32"/><line x1="14" y1="14" x2="19" y2="19"/><line x1="45" y1="45" x2="50" y2="50"/><line x1="50" y1="14" x2="45" y2="19"/><line x1="14" y1="50" x2="19" y2="45"/></g><g fill="#c0392b"><circle cx="32" cy="6" r="3"/><circle cx="32" cy="58" r="3"/><circle cx="6" cy="32" r="3"/><circle cx="58" cy="32" r="3"/></g><circle cx="32" cy="32" r="16" fill="#efe8ff" stroke="#7048e8" stroke-width="2.5"/><circle cx="32" cy="32" r="6" fill="#b79ff0"/></svg>',
  },
  arrow_cycle: {
    label: '循环箭头',
    license: 'cc0',
    tags: ['cycle', '循环', 'loop'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M50 24 A20 20 0 1 0 52 40" fill="none" stroke="#2f8f4e" stroke-width="4"/><path d="M44 12 L52 24 L38 26 Z" fill="#2f8f4e"/></svg>',
  },

  // ── 细胞器 ─────────────────────────────────────────────────────────────
  er: {
    label: '内质网',
    license: 'cc0',
    tags: ['er', '内质网', 'endoplasmic reticulum'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="none" stroke="#c9962a" stroke-width="2.5"><path d="M6 18 q10 -8 20 0 t20 0 q6 2 10 6"/><path d="M6 30 q10 -8 20 0 t20 0 q6 2 10 6"/><path d="M6 42 q10 -8 20 0 t20 0 q6 2 10 6"/></g><g fill="#8a6d3b"><circle cx="12" cy="15" r="1.8"/><circle cx="30" cy="27" r="1.8"/><circle cx="48" cy="39" r="1.8"/></g></svg>',
  },
  golgi: {
    label: '高尔基体',
    license: 'cc0',
    tags: ['golgi', '高尔基', 'golgi apparatus'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="#fdeede" stroke="#d9822b" stroke-width="2"><path d="M14 16 q18 -6 36 0 q-2 3 0 6 q-18 -6 -36 0 z"/><path d="M12 28 q20 -6 40 0 q-2 3 0 6 q-20 -6 -40 0 z"/><path d="M15 40 q17 -6 34 0 q-2 3 0 6 q-17 -6 -34 0 z"/></g><circle cx="10" cy="52" r="4" fill="#fdeede" stroke="#d9822b" stroke-width="1.5"/><circle cx="54" cy="52" r="3" fill="#fdeede" stroke="#d9822b" stroke-width="1.5"/></svg>',
  },
  ribosome: {
    label: '核糖体',
    license: 'cc0',
    tags: ['ribosome', '核糖体'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="32" cy="26" rx="18" ry="12" fill="#cfe0f5" stroke="#3b5bdb" stroke-width="2"/><ellipse cx="32" cy="42" rx="14" ry="9" fill="#a9c6ef" stroke="#3b5bdb" stroke-width="2"/></svg>',
  },
  lysosome: {
    label: '溶酶体',
    license: 'cc0',
    tags: ['lysosome', '溶酶体'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#ffe1ec" stroke="#c0397b" stroke-width="2.5"/><g fill="#c0397b"><circle cx="26" cy="28" r="2.5"/><circle cx="39" cy="26" r="2"/><circle cx="34" cy="39" r="3"/><circle cx="24" cy="38" r="1.8"/><circle cx="41" cy="37" r="1.6"/></g></svg>',
  },
  vesicle: {
    label: '囊泡',
    license: 'cc0',
    tags: ['vesicle', '囊泡'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="none" stroke="#c9962a" stroke-width="3"/><circle cx="32" cy="32" r="13" fill="#fff7e6"/></svg>',
  },

  // ── 分子 ───────────────────────────────────────────────────────────────
  rna: {
    label: 'RNA(单链)',
    license: 'cc0',
    tags: ['rna', 'mrna', '单链'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 8 q16 12 0 24 t0 24" fill="none" stroke="#e8590c" stroke-width="3"/><g stroke="#f0a868" stroke-width="2"><line x1="32" y1="14" x2="41" y2="14"/><line x1="32" y1="32" x2="23" y2="32"/><line x1="32" y1="50" x2="41" y2="50"/></g></svg>',
  },
  atp: {
    label: 'ATP',
    license: 'cc0',
    tags: ['atp', '能量', 'energy'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#fff4d6" stroke="#d4a017" stroke-width="2.5"/><text x="32" y="39" text-anchor="middle" font-size="17" font-family="sans-serif" font-weight="700" fill="#a67c00">ATP</text></svg>',
  },
  glucose: {
    label: '葡萄糖(六元环)',
    license: 'cc0',
    tags: ['glucose', '葡萄糖', 'sugar', '糖'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><polygon points="32,12 50,22 50,42 32,52 14,42 14,22" fill="#eaf3ee" stroke="#2f8f4e" stroke-width="2.5"/><g fill="#2f8f4e"><circle cx="32" cy="12" r="2.6"/><circle cx="50" cy="22" r="2.6"/><circle cx="14" cy="22" r="2.6"/></g></svg>',
  },
  ion: {
    label: '离子(阳离子)',
    license: 'cc0',
    tags: ['ion', '离子', 'cation'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="18" fill="#e6eefc" stroke="#3b5bdb" stroke-width="2.5"/><path d="M32 23 v18 M23 32 h18" stroke="#3b5bdb" stroke-width="3.5" stroke-linecap="round"/></svg>',
  },
  drug: {
    label: '药物(胶囊)',
    license: 'cc0',
    tags: ['drug', '药物', 'pill', 'capsule', '胶囊'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="rotate(-35 32 32)"><rect x="12" y="25" width="40" height="14" rx="7" fill="#eef2ff" stroke="#3b5bdb" stroke-width="2"/><path d="M32 25 h13 a7 7 0 0 1 0 14 h-13 z" fill="#c7d2fe" stroke="#3b5bdb" stroke-width="2"/></g></svg>',
  },

  // ── 细胞 / 免疫 ────────────────────────────────────────────────────────
  tcell: {
    label: 'T 细胞',
    license: 'cc0',
    tags: ['tcell', 't细胞', 't cell', '淋巴细胞'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g stroke="#2f6fd6" stroke-width="2.5" stroke-linecap="round"><line x1="24" y1="16" x2="22" y2="9"/><line x1="32" y1="14" x2="32" y2="7"/><line x1="40" y1="16" x2="42" y2="9"/></g><circle cx="32" cy="35" r="19" fill="#e6f0ff" stroke="#2f6fd6" stroke-width="2.5"/><text x="32" y="42" text-anchor="middle" font-size="18" font-family="sans-serif" font-weight="700" fill="#2f6fd6">T</text></svg>',
  },
  bcell: {
    label: 'B 细胞',
    license: 'cc0',
    tags: ['bcell', 'b细胞', 'b cell', '淋巴细胞'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="#eaf3ee" stroke="#2f8f4e" stroke-width="2.5"/><text x="32" y="40" text-anchor="middle" font-size="21" font-family="sans-serif" font-weight="700" fill="#2f8f4e">B</text></svg>',
  },
  macrophage: {
    label: '巨噬细胞',
    license: 'cc0',
    tags: ['macrophage', '巨噬细胞', '免疫细胞'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M20 14 q6 -6 14 -2 q10 -6 14 4 q10 2 6 14 q6 10 -4 16 q-2 12 -14 8 q-10 8 -18 -2 q-12 -2 -8 -14 q-8 -10 4 -16 q0 -6 6 -8z" fill="#f3e8ff" stroke="#7048e8" stroke-width="2.5"/><ellipse cx="30" cy="34" rx="9" ry="7" fill="#d9c4f5"/></svg>',
  },
  bacteria: {
    label: '细菌',
    license: 'cc0',
    tags: ['bacteria', '细菌', 'bacillus'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="12" y="24" width="34" height="16" rx="8" fill="#eaf3ee" stroke="#2f8f4e" stroke-width="2.5"/><path d="M46 32 q9 -5 14 1 q-3 7 -12 4" fill="none" stroke="#2f8f4e" stroke-width="2"/><g fill="#2f8f4e"><circle cx="23" cy="32" r="2"/><circle cx="34" cy="30" r="2"/></g></svg>',
  },
  rbc: {
    label: '红细胞',
    license: 'cc0',
    tags: ['rbc', '红细胞', 'red blood cell', '红血球'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="32" cy="32" rx="24" ry="16" fill="#f6cccc" stroke="#c0392b" stroke-width="2.5"/><ellipse cx="32" cy="32" rx="10" ry="6" fill="#e59a9a"/></svg>',
  },
  neuron: {
    label: '神经元',
    license: 'cc0',
    tags: ['neuron', '神经元', 'nerve'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g stroke="#e8590c" stroke-width="2.5" stroke-linecap="round" fill="none"><line x1="24" y1="26" x2="10" y2="14"/><line x1="22" y1="30" x2="6" y2="30"/><line x1="26" y1="37" x2="14" y2="49"/></g><line x1="39" y1="32" x2="58" y2="32" stroke="#e8590c" stroke-width="2.5" stroke-linecap="round"/><circle cx="30" cy="30" r="11" fill="#fde3d0" stroke="#e8590c" stroke-width="2.5"/><circle cx="30" cy="30" r="4" fill="#e8590c"/><circle cx="58" cy="32" r="3" fill="#e8590c"/></svg>',
  },

  // ── 实验器材 ───────────────────────────────────────────────────────────
  test_tube: {
    label: '试管',
    license: 'cc0',
    tags: ['test tube', '试管'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M26 6 h12 v40 a6 6 0 0 1 -12 0 z" fill="#e6f0ff" stroke="#2f6fd6" stroke-width="2.5"/><path d="M26 32 h12 v14 a6 6 0 0 1 -12 0 z" fill="#a9c6ef"/><line x1="23" y1="6" x2="41" y2="6" stroke="#2f6fd6" stroke-width="3" stroke-linecap="round"/></svg>',
  },
  flask: {
    label: '锥形瓶',
    license: 'cc0',
    tags: ['flask', '烧瓶', '锥形瓶', 'erlenmeyer'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M27 8 h10 v14 l13 28 a4 4 0 0 1 -4 6 H18 a4 4 0 0 1 -4 -6 l13 -28 z" fill="#eaf3ee" stroke="#2f8f4e" stroke-width="2.5"/><path d="M23 40 h18 l6 12 a3 3 0 0 1 -3 4 H20 a3 3 0 0 1 -3 -4 z" fill="#bfe0cc"/><line x1="25" y1="8" x2="39" y2="8" stroke="#2f8f4e" stroke-width="3" stroke-linecap="round"/></svg>',
  },
  petri_dish: {
    label: '培养皿',
    license: 'cc0',
    tags: ['petri', '培养皿', 'culture'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="32" cy="38" rx="26" ry="9" fill="#dcefe3" stroke="#2f8f4e" stroke-width="2.5"/><ellipse cx="32" cy="31" rx="26" ry="9" fill="#f4fbf6" stroke="#2f8f4e" stroke-width="2.5"/><g fill="#2f8f4e" opacity="0.55"><circle cx="26" cy="31" r="2"/><circle cx="37" cy="29" r="1.6"/><circle cx="41" cy="33" r="2.2"/><circle cx="30" cy="34" r="1.4"/></g></svg>',
  },
  syringe: {
    label: '注射器',
    license: 'cc0',
    tags: ['syringe', '注射器', 'injection'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="rotate(-45 32 32)"><rect x="16" y="27" width="28" height="10" rx="1" fill="#e6f0ff" stroke="#2f6fd6" stroke-width="2"/><line x1="44" y1="32" x2="58" y2="32" stroke="#2f6fd6" stroke-width="2"/><line x1="6" y1="32" x2="16" y2="32" stroke="#2f6fd6" stroke-width="4"/><line x1="16" y1="23" x2="16" y2="41" stroke="#2f6fd6" stroke-width="2.5"/><g stroke="#2f6fd6" stroke-width="1.4"><line x1="24" y1="27" x2="24" y2="31"/><line x1="30" y1="27" x2="30" y2="31"/><line x1="36" y1="27" x2="36" y2="31"/></g></g></svg>',
  },
  microscope: {
    label: '显微镜',
    license: 'cc0',
    tags: ['microscope', '显微镜'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M30 10 l8 4 l-11 21 l-8 -4 z" fill="#cfd8e3" stroke="#4a5568" stroke-width="2"/><rect x="20" y="31" width="11" height="6" rx="1" fill="#4a5568" transform="rotate(27 25 34)"/><path d="M27 38 q-14 8 -8 22" fill="none" stroke="#4a5568" stroke-width="3"/><rect x="13" y="52" width="36" height="6" rx="2" fill="#4a5568"/><line x1="30" y1="47" x2="30" y2="52" stroke="#4a5568" stroke-width="3"/></svg>',
  },
  mouse_animal: {
    label: '实验小鼠',
    license: 'cc0',
    tags: ['mouse', '小鼠', '实验动物', 'model animal'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><ellipse cx="28" cy="40" rx="20" ry="12" fill="#e2e2e2" stroke="#8a8a8a" stroke-width="2"/><circle cx="47" cy="36" r="8" fill="#e2e2e2" stroke="#8a8a8a" stroke-width="2"/><circle cx="45" cy="28" r="4" fill="#e2e2e2" stroke="#8a8a8a" stroke-width="2"/><circle cx="51" cy="36" r="1.6" fill="#333"/><path d="M9 42 q-8 2 -6 11" fill="none" stroke="#8a8a8a" stroke-width="2"/></svg>',
  },

  // ── 信号 / 关系箭头 ────────────────────────────────────────────────────
  arrow_activate: {
    label: '激活箭头',
    license: 'cc0',
    tags: ['activate', '激活', 'arrow', '箭头'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M8 32 h40 M40 22 l12 10 l-12 10" fill="none" stroke="#2f8f4e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  inhibit: {
    label: '抑制(T 形)',
    license: 'cc0',
    tags: ['inhibit', '抑制', 'repress'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M8 32 h42 M52 20 v24" fill="none" stroke="#c0392b" stroke-width="5" stroke-linecap="round"/></svg>',
  },
  transport: {
    label: '转运(虚线箭头)',
    license: 'cc0',
    tags: ['transport', '转运', 'translocate'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M8 32 h34" fill="none" stroke="#3b5bdb" stroke-width="4" stroke-dasharray="6 5" stroke-linecap="round"/><path d="M40 24 l12 8 l-12 8" fill="none" stroke="#3b5bdb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },

  // ── 器官(简化示意,非写实肌理)────────────────────────────────────────
  heart: {
    label: '心脏(示意)',
    license: 'cc0',
    tags: ['heart', '心脏', 'cardiac'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 54 C10 38 8 20 22 16 c6 -2 10 2 10 6 c0 -4 4 -8 10 -6 c14 4 12 22 -10 38z" fill="#f6cccc" stroke="#c0392b" stroke-width="2.5"/></svg>',
  },
  kidney: {
    label: '肾脏(示意)',
    license: 'cc0',
    tags: ['kidney', '肾脏', 'renal'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M22 12 c-13 3 -16 24 -5 35 c10 10 28 8 34 -4 c5 -10 1 -20 -8 -22 c-6 -1 -9 5 -13 5 c-6 0 -3 -17 -8 -14z" fill="#e0b98a" stroke="#9c6b2f" stroke-width="2.5"/><path d="M30 32 q8 -1 12 4" fill="none" stroke="#9c6b2f" stroke-width="1.8"/></svg>',
  },
  lung: {
    label: '肺(示意)',
    license: 'cc0',
    tags: ['lung', '肺', 'pulmonary'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><line x1="32" y1="8" x2="32" y2="26" stroke="#b0567a" stroke-width="3"/><path d="M30 26 c-2 -8 -14 -6 -18 4 c-4 11 -2 22 6 24 c8 2 12 -6 12 -15 z" fill="#f3d0d8" stroke="#b0567a" stroke-width="2.5"/><path d="M34 26 c2 -8 14 -6 18 4 c4 11 2 22 -6 24 c-8 2 -12 -6 -12 -15 z" fill="#f3d0d8" stroke="#b0567a" stroke-width="2.5"/></svg>',
  },
  brain: {
    label: '脑(示意)',
    license: 'cc0',
    tags: ['brain', '脑', '大脑', 'neural'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M22 14 q-10 2 -8 12 q-8 6 0 14 q0 8 10 8 q4 6 12 2 q8 4 12 -2 q10 0 10 -8 q8 -8 0 -14 q2 -10 -8 -12 q-6 -6 -14 -2 q-8 -4 -14 2z" fill="#f3d9e6" stroke="#a05a8a" stroke-width="2.5"/><path d="M32 14 v36 M22 24 q6 4 0 8 M42 24 q-6 4 0 8" fill="none" stroke="#a05a8a" stroke-width="1.8"/></svg>',
  },
  liver: {
    label: '肝脏(示意)',
    license: 'cc0',
    tags: ['liver', '肝脏', 'hepatic'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M8 22 q24 -10 48 -6 q4 12 -6 22 q-16 10 -30 6 q-14 -4 -12 -22z" fill="#c98a5a" stroke="#8a5a2c" stroke-width="2.5"/><path d="M32 17 v9" stroke="#8a5a2c" stroke-width="2"/></svg>',
  },
};

/** 给 agent / UI 用的图标目录(key + label + tags)。派生自 ICON_PACK,单一真源。 */
export const ICON_CATALOG = Object.entries(ICON_PACK).map(([key, a]) => ({
  key,
  label: a.label,
  tags: a.tags ?? [],
}));

/** 汇总一组已用 iconKey 里需要署名的图标(CC-BY)—— 画布/导出展示。种子全 CC0 时为空。 */
export function collectAttributions(iconKeys: string[]): string[] {
  const out = new Set<string>();
  for (const k of iconKeys) {
    const a = ICON_PACK[k];
    if (a?.license === 'cc-by' && a.attribution) out.add(a.attribution);
  }
  return [...out];
}
