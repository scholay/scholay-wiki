#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const FINAL_ROOT = path.join(ROOT, 'feature-tools-academic-5000');
const AUDIT_FILE = path.join(ROOT, 'feature-tools-academic-audit', '5000-reviewed-independence.json');
const NEXT_ROOT = path.join(ROOT, 'feature-tools-academic-5000-next');
const REPLACEMENT_WORK = path.join(ROOT, 'feature-tools-academic-audit', 'openalex-replacements');
const TARGET_TOTAL = 50000;
const BATCH_SIZE = 5000;
const MAX_IMAGE_BYTES = Number(process.env.ACADEMIC_LOGO_MAX_BYTES || 80 * 1024);
const LOGO_TIMEOUT_MS = Number(process.env.ACADEMIC_LOGO_TIMEOUT_MS || 5000);
const LOGO_CONCURRENCY = Number(process.env.ACADEMIC_LOGO_CONCURRENCY || 32);
const OPENALEX_PAGE_SIZE = 200;
const OPENALEX_MAX_PAGES = Number(process.env.ACADEMIC_OPENALEX_MAX_PAGES || 80);
const COLLECTED_AT = new Date().toISOString();
const USER_AGENT = 'ScholayAcademicToolCollector/1.0 (+https://scholay.app)';

const CATEGORY = {
  'stats-econometrics': { label: '统计 & 计量分析', sourceCategoryId: 2301, hue: 212 },
  'chem-materials': { label: '化学 · 材料 · 光谱', sourceCategoryId: 2401, hue: 168 },
  'bio-life': { label: '生物信息 & 生命科学', sourceCategoryId: 2501, hue: 134 },
  'math-numerical': { label: '数学 & 数值计算', sourceCategoryId: 2601, hue: 250 },
  'viz-plotting': { label: '绘图 · 可视化 · 数字化', sourceCategoryId: 2701, hue: 286 },
  'engineering-cad': { label: '工程 · 仿真 · CAD/EDA', sourceCategoryId: 2801, hue: 24 },
  'lit-manage-pdf': { label: '文献管理 & 阅读/PDF', sourceCategoryId: 2101, hue: 200 },
  'writing-latex': { label: '学术写作 · LaTeX · 查重', sourceCategoryId: 2201, hue: 338 },
  'journal-metrics': { label: '期刊评价 & 投稿', sourceCategoryId: 2901, hue: 45 },
  'medical-reference': { label: '医药参考 & 考试', sourceCategoryId: 3001, hue: 2 },
  'general-utility': { label: '通用工具 · 效率 · 系统', sourceCategoryId: 3101, hue: 220 },
};

const CATEGORY_TASK = {
  'stats-econometrics': '统计建模、计量分析、数据清洗、时间序列和结果解释',
  'chem-materials': '化学数据查询、材料信息整理、分子与光谱分析',
  'bio-life': '生物信息分析、组学数据处理、序列检索、数据库查询和实验结果整理',
  'math-numerical': '数学计算、数值分析、算法验证和科研教学',
  'viz-plotting': '数据可视化、图表制作、空间数据处理和结果展示',
  'engineering-cad': '工程建模、仿真分析、CAD/EDA、有限元和计算流程管理',
  'lit-manage-pdf': '文献检索、论文阅读、资料归档、引用整理和综述准备',
  'writing-latex': '论文写作、LaTeX 排版、可重复报告和投稿准备',
  'journal-metrics': '期刊筛选、投稿决策、引文指标和科研影响力分析',
  'medical-reference': '医学资料查询、临床研究参考、生物医学数据整理和循证资料检索',
  'general-utility': '科研数据管理、开放科学、团队协作、计算环境和日常研究效率提升',
};

const OPENALEX_TYPES = ['journal', 'repository', 'conference'];

const BAD_HOSTS = new Set([
  'doi.org',
  'dx.doi.org',
  'pubmed.ncbi.nlm.nih.gov',
  'ncbi.nlm.nih.gov',
  'archive.org',
  'web.archive.org',
  'books.google.com',
  'worldcat.org',
  'pypi.org',
  'cran.r-project.org',
  'bioconductor.org',
  'npmjs.com',
  'anaconda.org',
  'rubygems.org',
  'packagist.org',
  'metacpan.org',
]);

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncate(value, max) {
  const text = cleanName(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function pathOf(url) {
  try {
    return new URL(url).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function canonicalURL(url) {
  try {
    const u = new URL(url);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    u.hash = '';
    u.search = '';
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return '';
  }
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function uniq(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = cleanName(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function escapeXML(s) {
  return String(s || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}

function tagLabel(value) {
  const text = cleanName(value);
  const dict = new Map([
    ['Medicine', '医学'],
    ['Nursing', '护理学'],
    ['Health Professions', '健康科学'],
    ['Biochemistry, Genetics and Molecular Biology', '生命科学'],
    ['Agricultural and Biological Sciences', '农业与生物科学'],
    ['Immunology and Microbiology', '免疫与微生物'],
    ['Pharmacology, Toxicology and Pharmaceutics', '药理与毒理'],
    ['Chemistry', '化学'],
    ['Materials Science', '材料科学'],
    ['Chemical Engineering', '化学工程'],
    ['Engineering', '工程'],
    ['Computer Science', '计算机科学'],
    ['Energy', '能源'],
    ['Mathematics', '数学'],
    ['Physics and Astronomy', '物理与天文'],
    ['Earth and Planetary Sciences', '地球科学'],
    ['Environmental Science', '环境科学'],
    ['Social Sciences', '社会科学'],
    ['Psychology', '心理学'],
    ['Economics, Econometrics and Finance', '经济与计量'],
    ['Business, Management and Accounting', '管理与商业'],
    ['Arts and Humanities', '人文艺术'],
    ['Decision Sciences', '决策科学'],
  ]);
  return dict.get(text) || text;
}

function categoryFromOpenAlex(source) {
  const text = [
    source.display_name,
    ...(source.topics || []).flatMap((topic) => [
      topic.display_name,
      topic.field?.display_name,
      topic.subfield?.display_name,
      topic.domain?.display_name,
    ]),
  ].join(' ').toLowerCase();
  if (/medicine|medical|clinical|health|nursing|dentistry|veterinary|pharmacology|toxicology|pediatrics|oncology|cardiology|neurology|psychiatry|surgery|public health/.test(text)) return 'medical-reference';
  if (/biology|biochemistry|genetics|molecular|agricultural|microbiology|immunology|ecology|neuroscience|bioinformatics|genomics|protein/.test(text)) return 'bio-life';
  if (/chemistry|chemical|materials|molecule|spectroscopy|polymer|catalysis/.test(text)) return 'chem-materials';
  if (/engineering|computer science|software|electrical|mechanical|civil|robotics|energy|information systems/.test(text)) return 'engineering-cad';
  if (/mathematics|physics|astronomy|algebra|geometry|numerical/.test(text)) return 'math-numerical';
  if (/earth|planetary|environmental|climate|geography|geology|ocean|gis|remote sensing/.test(text)) return 'viz-plotting';
  if (/economics|econometrics|finance|business|management|accounting|decision|statistics|psychology|sociology|social sciences|education|policy/.test(text)) return 'stats-econometrics';
  if (/language|linguistics|history|humanities|arts|philosophy|law/.test(text)) return 'lit-manage-pdf';
  return 'journal-metrics';
}

function sourceKind(type) {
  if (type === 'repository') return '学术资源库或论文仓储平台';
  if (type === 'conference') return '学术会议/论文集网站';
  return '学术期刊网站';
}

function isBadHomepage(url) {
  const host = hostOf(url);
  const p = pathOf(url).toLowerCase();
  if (!host || BAD_HOSTS.has(host)) return true;
  if (host === 'doaj.org') return true;
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|tar|gz|rar)$/i.test(p)) return true;
  if (/\/(article|articles|chapter|book|record|records|dataset|datasets|package|packages|project|abs|pdf)\b/.test(p)) return true;
  if (host.endsWith('archive.org') && /^\/details\//.test(p)) return true;
  if (/\/(login|signin|register|cart|search)\b/.test(p)) return true;
  return false;
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': USER_AGENT,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchText(url, timeout = LOGO_TIMEOUT_MS) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': USER_AGENT,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchBytes(url, timeout = LOGO_TIMEOUT_MS) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        accept: 'image/avif,image/webp,image/svg+xml,image/png,image/jpeg,image/x-icon,*/*;q=0.5',
        'user-agent': USER_AGENT,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!/^image\//i.test(contentType) && !url.match(/\.(svg|png|jpe?g|webp|ico)$/i)) {
      throw new Error(`not image: ${contentType}`);
    }
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`too large: ${bytes.length}`);
    return { bytes, contentType };
  } finally {
    clearTimeout(t);
  }
}

function absolutize(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return '';
  }
}

function parseIconLinks(html, base) {
  const links = [];
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const rel = (tag.match(/\brel=["']?([^"'>\s]+)/i)?.[1] || '').toLowerCase();
    if (!rel.includes('icon')) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1] || tag.match(/\bhref=([^"'>\s]+)/i)?.[1] || '';
    const sizes = tag.match(/\bsizes=["']([^"']+)["']/i)?.[1] || '';
    const url = absolutize(base, href);
    if (!url) continue;
    const sizeScore = Number(String(sizes).match(/\d+/)?.[0] || 0);
    links.push({ url, score: (rel.includes('apple') ? 100 : 80) + sizeScore / 10 });
  }
  return links.sort((a, b) => b.score - a.score).map((x) => x.url);
}

function iconExt(contentType, url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  if (contentType.includes('svg') || ext === '.svg') return '.svg';
  if (contentType.includes('png') || ext === '.png') return '.png';
  if (contentType.includes('jpeg') || contentType.includes('jpg') || ext === '.jpg' || ext === '.jpeg') return '.jpg';
  if (contentType.includes('webp') || ext === '.webp') return '.webp';
  if (contentType.includes('icon') || ext === '.ico') return '.ico';
  return '.png';
}

async function discoverLogo(homepage) {
  const urls = [];
  try {
    const html = await fetchText(homepage);
    urls.push(...parseIconLinks(html.slice(0, 220000), homepage));
  } catch {
    // try conventional favicon paths
  }
  try {
    const u = new URL(homepage);
    urls.push(`${u.origin}/favicon.ico`, `${u.origin}/favicon.png`, `${u.origin}/apple-touch-icon.png`);
  } catch {
    return null;
  }
  for (const url of uniq(urls).slice(0, 5)) {
    try {
      const img = await fetchBytes(url);
      if (img.contentType.includes('svg')) {
        const text = img.bytes.toString('utf8').slice(0, 2000).toLowerCase();
        if (text.includes('<script') || text.includes('onload=')) continue;
      }
      return { ...img, url };
    } catch {
      // try next candidate
    }
  }
  return null;
}

function glyphForCategory(category) {
  switch (category) {
    case 'medical-reference':
      return '<path d="M48 24v48M24 48h48"/><path d="M31 27h34a7 7 0 0 1 7 7v28a7 7 0 0 1-7 7H31a7 7 0 0 1-7-7V34a7 7 0 0 1 7-7z" opacity=".72"/>';
    case 'bio-life':
      return '<path d="M35 22c18 10 34 20 26 52"/><path d="M61 22c-18 10-34 20-26 52"/><path d="M36 34h24M32 48h32M36 62h24"/>';
    case 'chem-materials':
      return '<circle cx="31" cy="35" r="8"/><circle cx="65" cy="35" r="8"/><circle cx="48" cy="65" r="8"/><path d="M39 39l18 21M57 39 39 60"/>';
    case 'engineering-cad':
      return '<path d="M28 68 48 24l20 44H28z"/><path d="M38 53h20"/><path d="M48 24v44"/>';
    case 'math-numerical':
      return '<path d="M27 33h42M27 63h42"/><path d="M35 24l26 48"/>';
    case 'viz-plotting':
      return '<path d="M24 68c13-24 21-32 32-20 7 8 11 6 16-13"/><circle cx="24" cy="68" r="4"/><circle cx="56" cy="48" r="4"/><circle cx="72" cy="35" r="4"/>';
    case 'stats-econometrics':
      return '<path d="M24 70h48"/><path d="M31 62V46M48 62V30M65 62V39"/>';
    default:
      return '<path d="M30 25h29l9 9v37H30z"/><path d="M59 25v12h12"/><path d="M39 48h18M39 60h22"/>';
  }
}

function functionalLogo(tool) {
  const cat = CATEGORY[tool.category] || CATEGORY['general-utility'];
  const bg1 = `hsl(${cat.hue} 72% 43%)`;
  const bg2 = `hsl(${(cat.hue + 42) % 360} 70% 54%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${escapeXML(tool.name)} logo"><defs><linearGradient id="g" x1="12" y1="10" x2="84" y2="86" gradientUnits="userSpaceOnUse"><stop stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs><rect width="96" height="96" rx="20" fill="url(#g)"/><g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".96">${glyphForCategory(tool.category)}</g></svg>`;
  return Buffer.from(svg);
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function loadCurrentTools() {
  const batchDirs = fs.readdirSync(FINAL_ROOT)
    .filter((name) => /^feature-tools-academic-5000-batch-\d+$/.test(name))
    .sort();
  const imageBySlug = new Map();
  const tools = [];
  for (const dir of batchDirs) {
    const base = path.join(FINAL_ROOT, dir);
    const items = readJSON(path.join(base, 'feature-tools.json'));
    for (const file of fs.readdirSync(path.join(base, 'images'))) {
      const stem = path.basename(file, path.extname(file));
      imageBySlug.set(stem, path.join(base, 'images', file));
    }
    for (const item of items) tools.push({ ...item, __batchDir: dir });
  }
  return { tools, imageBySlug };
}

function existingSets(tools) {
  const slugs = new Set();
  const urls = new Set();
  const sourceUrls = new Set();
  let maxId = 0;
  for (const tool of tools) {
    if (tool.slug) slugs.add(tool.slug);
    const u = canonicalURL(tool.official_url || tool.access?.official_url || '');
    if (u) urls.add(u);
    const su = canonicalURL(tool.source_url || tool.source?.url || '');
    if (su) sourceUrls.add(su);
    maxId = Math.max(maxId, Number(tool.id) || 0);
  }
  return { slugs, urls, sourceUrls, maxId };
}

function duplicateKeepScore(tool) {
  const name = String(tool.name || '');
  let score = 0;
  if (!/[（(]付费工具[）)]/.test(name)) score += 10;
  if (!/工具索引|R 包库|LaTeX 宏包库|packages?|registry/i.test(name)) score += 8;
  if (tool.source_url && !/bio\.tools\/?$|cran\.r-project\.org\/web\/packages|BiocViews\.html|ctan\.org\/pkg/i.test(tool.source_url)) score += 5;
  if (Number(tool.sort_weight || 0) > 50) score += 2;
  score -= Math.min(name.length, 120) / 100;
  return score;
}

function buildRemovalSet(tools, auditRows) {
  const removeIds = new Set(auditRows.map((row) => Number(row.id)));
  const duplicateGroups = new Map();
  for (const tool of tools) {
    if (removeIds.has(Number(tool.id))) continue;
    const key = canonicalURL(tool.official_url || tool.access?.official_url || '');
    if (!key) continue;
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
    duplicateGroups.get(key).push(tool);
  }
  const duplicateRemoved = [];
  const duplicateKept = [];
  for (const [url, group] of duplicateGroups) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => duplicateKeepScore(b) - duplicateKeepScore(a));
    duplicateKept.push({ url, id: sorted[0].id, slug: sorted[0].slug, name: sorted[0].name, duplicate_count: group.length });
    for (const tool of sorted.slice(1)) {
      removeIds.add(Number(tool.id));
      duplicateRemoved.push({ url, id: tool.id, slug: tool.slug, name: tool.name, kept_id: sorted[0].id, kept_slug: sorted[0].slug });
    }
  }
  return { removeIds, duplicateRemoved, duplicateKept };
}

function makeUniqueSlug(name, sets) {
  const base = slugify(name) || 'academic-source';
  let slug = base;
  let suffix = 2;
  while (sets.slugs.has(slug)) slug = `${base}-${suffix++}`;
  sets.slugs.add(slug);
  return slug;
}

function candidateFromOpenAlex(row, sets, nextId) {
  const name = cleanName(row.display_name);
  const homepage = row.homepage_url || '';
  if (!name || !homepage || isBadHomepage(homepage)) return null;
  const cu = canonicalURL(homepage);
  const sourceUrl = row.id || '';
  const sourceCu = canonicalURL(sourceUrl);
  if (!cu || sets.urls.has(cu) || sets.sourceUrls.has(sourceCu)) return null;
  const category = categoryFromOpenAlex(row);
  const cat = CATEGORY[category] || CATEGORY['journal-metrics'];
  const type = row.type || 'journal';
  const fields = uniq((row.topics || []).flatMap((topic) => [
    topic.field?.display_name,
    topic.subfield?.display_name,
    topic.display_name,
  ].filter(Boolean)).map(tagLabel)).slice(0, 5);
  const tags = uniq([
    sourceKind(type),
    row.is_oa || row.is_in_doaj ? '开放获取' : '',
    ...fields,
    cat.label,
  ]).slice(0, 6);
  const focus = fields.slice(0, 3).join('、') || cat.label;
  const issn = uniq([row.issn_l, ...(row.issn || [])]).slice(0, 4);
  const yearText = row.last_publication_year ? `，OpenAlex 记录显示其近年仍有出版活动（最近年份 ${row.last_publication_year}）` : '';
  const kind = sourceKind(type);
  const tagline = type === 'repository'
    ? `学术资源库入口，可用于文献发现、资料归档、开放获取和来源核对`
    : `面向${focus}方向的${kind}，可用于论文阅读、期刊筛选和投稿前信息核对`;
  const description = `${name} 是一个面向「${cat.label}」的${kind}，适合用于${CATEGORY_TASK[category]}。公开资料显示，它与「${focus}」等方向相关${yearText}；使用前建议核对官网栏目、收录范围、开放获取政策、投稿说明、引用格式和费用信息，再将其纳入论文阅读、投稿决策、课程资料或研究信息管理流程。`;
  const slug = makeUniqueSlug(name, sets);
  sets.urls.add(cu);
  if (sourceCu) sets.sourceUrls.add(sourceCu);
  return {
    id: nextId,
    slug,
    source: {
      topic_id: nextId,
      url: sourceUrl || homepage,
      category_id: cat.sourceCategoryId,
      created_at: COLLECTED_AT,
    },
    source_topic_id: nextId,
    source_url: sourceUrl || homepage,
    source_category_id: cat.sourceCategoryId,
    name,
    name_en: name,
    aliases: issn,
    logo: '',
    tagline,
    description_md: description,
    category,
    category_label: cat.label,
    tags,
    price_type: row.is_oa || row.is_in_doaj ? 'free' : 'unknown',
    is_open_source: false,
    languages: ['multi'],
    platforms: ['web'],
    access_type: 'website',
    official_url: homepage,
    access: {
      type: 'website',
      official_url: homepage,
      resources: [
        { label: '官网/工具入口', url: homepage },
        ...(sourceUrl ? [{ label: 'OpenAlex 条目', url: sourceUrl }] : []),
      ],
      download: {
        provider: 'website',
        url: '',
        extract_code: '',
        filename: '',
        gated: false,
      },
    },
    spec: {
      core_use: tagline,
      audience: '研究生、科研人员、教师、实验室成员、数据分析人员及相关学科用户',
      scenarios: [
        `${cat.label}相关的文献阅读、投稿前调研或学术资源核对`,
        '论文、课题、课程作业、综述写作或期刊筛选中的资料入口',
        '团队协作、研究信息管理、开放获取核查或引用整理中的辅助资源',
      ],
      workflow: [
        '打开官网，确认期刊/平台范围、栏目设置、访问方式和更新时间',
        '核对投稿说明、开放获取政策、费用信息、版权许可和引用格式',
        '结合数据库收录、ISSN、主题范围和近期出版记录判断适配度',
        '记录访问日期、来源页面、引用信息和关键政策，便于团队复核',
      ],
      key_features: tags,
      input_formats: ['论文题名、关键词、作者信息、ISSN、学科方向或投稿需求'],
      output: ['期刊/平台信息、论文列表、投稿说明、开放获取政策、引用信息或来源记录'],
      version: '',
    },
    faq: [
      {
        q: `${name} 适合做什么？`,
        a: `适合围绕${focus}方向进行论文阅读、期刊筛选、投稿前核对、开放获取政策确认或学术来源记录。`,
      },
      {
        q: '使用前需要确认哪些信息？',
        a: '建议核对官网、ISSN、收录范围、投稿说明、费用政策、版权许可、引用格式和最近更新情况。',
      },
      {
        q: '如何放进科研工作流？',
        a: '可作为文献入口或投稿备选来源，配合数据库检索、期刊评价、团队复核和论文写作记录使用。',
      },
    ],
    disclaimer: '功能、价格、许可证、平台支持和可访问性可能变化，请以官网最新说明为准。',
    use_cases: [
      { icon: '', title: '期刊筛选', desc: `判断它是否适合当前的${cat.label}论文阅读或投稿任务。` },
      { icon: '', title: '政策核对', desc: '核查开放获取、版权许可、费用说明和投稿要求。' },
      { icon: '', title: '来源记录', desc: '保存访问日期、ISSN、引用信息和官网链接，便于复核。' },
    ],
    vendor: {
      name: row.host_organization_name || '',
      country: row.country_code || '',
      founded: row.first_publication_year && row.first_publication_year > 1000 ? row.first_publication_year : null,
      homepage,
      desc: '',
    },
    founded_year: row.first_publication_year && row.first_publication_year > 1000 ? row.first_publication_year : null,
    country: row.country_code || '',
    pricing: [],
    free_trial: '',
    alternatives: [],
    similar_tool_ids: [],
    tutorials: [],
    stats: row.summary_stats ? {
      works_count: row.works_count || 0,
      cited_by_count: row.cited_by_count || 0,
      h_index: row.summary_stats.h_index || 0,
      i10_index: row.summary_stats.i10_index || 0,
    } : null,
    reviews: [],
    featured: false,
    status: 'published',
    sort_weight: 10,
    view_count: 0,
    favorite_count: 0,
    created_at: COLLECTED_AT,
    updated_at: COLLECTED_AT,
    data_quality: {
      enriched: true,
      needs_review: false,
      needs_enrich: [],
      sources: uniq([sourceUrl, homepage, ...(row.ids ? Object.values(row.ids).flat() : [])]),
    },
  };
}

async function collectOpenAlexReplacements(need, sets) {
  const replacements = [];
  let nextId = sets.maxId + 1;
  for (const type of OPENALEX_TYPES) {
    let cursor = '*';
    for (let page = 1; page <= OPENALEX_MAX_PAGES && replacements.length < need; page += 1) {
      const url = `https://api.openalex.org/sources?filter=type:${encodeURIComponent(type)}&sort=works_count:desc&per-page=${OPENALEX_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`;
      const json = await fetchJSON(url);
      const rows = json.results || [];
      for (const row of rows) {
        const tool = candidateFromOpenAlex(row, sets, nextId);
        if (!tool) continue;
        replacements.push(tool);
        nextId += 1;
        if (replacements.length >= need) break;
      }
      cursor = json.meta?.next_cursor || '';
      console.log(`[openalex] type=${type} page=${page} replacements=${replacements.length}`);
      if (!cursor || !rows.length) break;
    }
  }
  if (replacements.length < need) {
    throw new Error(`Not enough OpenAlex replacements: need=${need}, got=${replacements.length}`);
  }
  return replacements;
}

async function writeReplacementLogos(replacements) {
  const imageDir = path.join(REPLACEMENT_WORK, 'images');
  ensureDir(imageDir);
  let real = 0;
  let fallback = 0;
  await mapLimit(replacements, LOGO_CONCURRENCY, async (tool, i) => {
    if ((i + 1) % 100 === 0) console.log(`[logos] ${i + 1}/${replacements.length}`);
    try {
      const logo = await discoverLogo(tool.official_url);
      if (logo) {
        const ext = iconExt(logo.contentType, logo.url);
        fs.writeFileSync(path.join(imageDir, `${tool.slug}${ext}`), logo.bytes);
        real += 1;
        return;
      }
    } catch {
      // fall back to generated SVG
    }
    fs.writeFileSync(path.join(imageDir, `${tool.slug}.svg`), functionalLogo(tool));
    fallback += 1;
  });
  return { imageDir, real, fallback };
}

function writeBatch(root, batchNumber, tools, imageBySlug, report) {
  const dir = path.join(root, `feature-tools-academic-5000-batch-${String(batchNumber).padStart(2, '0')}`);
  ensureDir(path.join(dir, 'images'));
  writeJSON(path.join(dir, 'feature-tools.json'), tools.map(({ __batchDir, ...tool }) => tool));
  let copiedImages = 0;
  let generatedFallbackImages = 0;
  for (const tool of tools) {
    const src = imageBySlug.get(tool.slug);
    if (src && fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dir, 'images', path.basename(src)));
      copiedImages += 1;
    } else {
      fs.writeFileSync(path.join(dir, 'images', `${tool.slug}.svg`), functionalLogo(tool));
      generatedFallbackImages += 1;
    }
  }
  const imageFiles = fs.readdirSync(path.join(dir, 'images'));
  const maxImageBytes = imageFiles.reduce((max, file) => Math.max(max, fs.statSync(path.join(dir, 'images', file)).size), 0);
  if (tools.length !== BATCH_SIZE) throw new Error(`${dir}: expected ${BATCH_SIZE}, got ${tools.length}`);
  if (imageFiles.length !== BATCH_SIZE) throw new Error(`${dir}: expected ${BATCH_SIZE} images, got ${imageFiles.length}`);
  if (maxImageBytes > MAX_IMAGE_BYTES) throw new Error(`${dir}: image too large ${maxImageBytes}`);
  writeJSON(path.join(dir, '_merge-report.json'), {
    ...report,
    batch: batchNumber,
    output: {
      directory: path.basename(dir),
      tools: tools.length,
      images: imageFiles.length,
      copied_images: copiedImages,
      generated_fallback_images: generatedFallbackImages,
      max_image_bytes: maxImageBytes,
    },
  });
  fs.writeFileSync(path.join(dir, 'README.txt'), [
    `Scholay academic feature tools batch ${String(batchNumber).padStart(2, '0')}`,
    '',
    `Import zip: feature-tools-academic-5000-batch-${String(batchNumber).padStart(2, '0')}.zip`,
    'Structure: feature-tools.json + images/<slug>.(png/svg/ico/jpg/webp)',
    'Sources include existing Scholay academic packs and OpenAlex replacement sources.',
    `Generated at: ${COLLECTED_AT}`,
    '',
  ].join('\n'));
  const zipName = `feature-tools-academic-5000-batch-${String(batchNumber).padStart(2, '0')}.zip`;
  const zipPath = path.join(root, zipName);
  const zip = spawnSync('zip', ['-qr', zipPath, 'feature-tools.json', 'images', '_merge-report.json', 'README.txt'], {
    cwd: dir,
    stdio: 'pipe',
  });
  if (zip.status !== 0) throw new Error(`zip failed for ${dir}: ${zip.stderr.toString()}`);
}

function validateRoot(root) {
  const dirs = fs.readdirSync(root).filter((name) => /^feature-tools-academic-5000-batch-\d+$/.test(name)).sort();
  let total = 0;
  let images = 0;
  let maxImage = 0;
  const slugs = new Set();
  const urls = new Set();
  for (const dir of dirs) {
    const base = path.join(root, dir);
    const tools = readJSON(path.join(base, 'feature-tools.json'));
    const files = fs.readdirSync(path.join(base, 'images'));
    if (tools.length !== BATCH_SIZE) throw new Error(`${dir}: expected ${BATCH_SIZE} tools, got ${tools.length}`);
    if (files.length !== BATCH_SIZE) throw new Error(`${dir}: expected ${BATCH_SIZE} images, got ${files.length}`);
    total += tools.length;
    images += files.length;
    for (const file of files) maxImage = Math.max(maxImage, fs.statSync(path.join(base, 'images', file)).size);
    for (const tool of tools) {
      if (slugs.has(tool.slug)) throw new Error(`duplicate slug ${tool.slug}`);
      slugs.add(tool.slug);
      const u = canonicalURL(tool.official_url || '');
      if (u && urls.has(u)) throw new Error(`duplicate url ${u}`);
      if (u) urls.add(u);
    }
  }
  if (dirs.length !== 10) throw new Error(`expected 10 dirs, got ${dirs.length}`);
  if (total !== TARGET_TOTAL) throw new Error(`expected ${TARGET_TOTAL} tools, got ${total}`);
  if (images !== TARGET_TOTAL) throw new Error(`expected ${TARGET_TOTAL} images, got ${images}`);
  if (maxImage > MAX_IMAGE_BYTES) throw new Error(`image cap exceeded ${maxImage}`);
  for (const zipFile of fs.readdirSync(root).filter((name) => /^feature-tools-academic-5000-batch-\d+\.zip$/.test(name))) {
    const result = spawnSync('zip', ['-T', path.join(root, zipFile)], { stdio: 'pipe' });
    if (result.status !== 0) throw new Error(`zip test failed: ${zipFile}\n${result.stderr.toString()}`);
  }
  return { dirs: dirs.length, total, images, maxImage };
}

async function main() {
  const { tools, imageBySlug } = loadCurrentTools();
  const removeRows = readJSON(AUDIT_FILE).filter((row) => row.decision === 'remove');
  const removal = buildRemovalSet(tools, removeRows);
  const keep = tools.filter((tool) => !removal.removeIds.has(Number(tool.id)));
  const need = TARGET_TOTAL - keep.length;
  console.log(`[state] current=${tools.length} keep=${keep.length} auditRemove=${removeRows.length} duplicateRemove=${removal.duplicateRemoved.length} need=${need}`);
  ensureDir(REPLACEMENT_WORK);
  writeJSON(path.join(REPLACEMENT_WORK, 'duplicate-url-removed.json'), removal.duplicateRemoved);
  writeJSON(path.join(REPLACEMENT_WORK, 'duplicate-url-kept.json'), removal.duplicateKept);

  const sets = existingSets(tools);
  const replacements = await collectOpenAlexReplacements(need, sets);
  writeJSON(path.join(REPLACEMENT_WORK, 'openalex-replacements.json'), replacements);
  const logoStats = await writeReplacementLogos(replacements);
  for (const file of fs.readdirSync(logoStats.imageDir)) {
    const stem = path.basename(file, path.extname(file));
    imageBySlug.set(stem, path.join(logoStats.imageDir, file));
  }

  const combined = [...keep, ...replacements];
  if (combined.length !== TARGET_TOTAL) throw new Error(`combined count mismatch ${combined.length}`);
  if (fs.existsSync(NEXT_ROOT)) fs.rmSync(NEXT_ROOT, { recursive: true, force: true });
  ensureDir(NEXT_ROOT);
  const report = {
    generated_at: COLLECTED_AT,
    removed_count: removeRows.length,
    duplicate_removed_count: removal.duplicateRemoved.length,
    replacement_count: replacements.length,
    replacement_source: 'OpenAlex Sources API',
    replacement_logo_real: logoStats.real,
    replacement_logo_functional: logoStats.fallback,
    removed_report: path.relative(ROOT, AUDIT_FILE),
  };
  for (let i = 0; i < 10; i += 1) {
    writeBatch(NEXT_ROOT, i + 1, combined.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE), imageBySlug, report);
    console.log(`[batch] ${i + 1}/10 written`);
  }
  const validation = validateRoot(NEXT_ROOT);
  writeJSON(path.join(NEXT_ROOT, 'manifest.json'), {
    generated_at: COLLECTED_AT,
    total: TARGET_TOTAL,
    batch_size: BATCH_SIZE,
    batches: 10,
    removed_count: removeRows.length,
    duplicate_removed_count: removal.duplicateRemoved.length,
    replacement_count: replacements.length,
    replacement_source: 'OpenAlex Sources API',
    replacement_logo_real: logoStats.real,
    replacement_logo_functional: logoStats.fallback,
    validation,
  });
  fs.writeFileSync(path.join(NEXT_ROOT, 'README.txt'), [
    'Scholay academic feature tools consolidated import packs',
    '',
    'Each zip contains exactly 5,000 tools plus matching images.',
    `Removed low-independence entries: ${removeRows.length}`,
    `Added OpenAlex replacements: ${replacements.length}`,
    `Generated at: ${COLLECTED_AT}`,
    '',
  ].join('\n'));
  fs.rmSync(FINAL_ROOT, { recursive: true, force: true });
  fs.renameSync(NEXT_ROOT, FINAL_ROOT);
  console.log(JSON.stringify({ ...validation, removed: removeRows.length, duplicateRemoved: removal.duplicateRemoved.length, replacements: replacements.length, logoStats }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
