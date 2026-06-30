#!/usr/bin/env node
// Build Scholay academic feature-tool packs up to 10,000 entries.
//
// Sources:
// - re3data: research data repository registry
// - bio.tools: bioinformatics software/database registry
//
// The script continues from existing feature-tools-academic-1000* packs and
// writes one import-ready zip per 1,000 tools.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const TARGET_TOTAL = Number(process.env.ACADEMIC_TARGET_TOTAL || 10000);
const BATCH_SIZE = Number(process.env.ACADEMIC_BATCH_SIZE || 1000);
const TARGET_NEW = Number(process.env.ACADEMIC_TARGET_NEW || 0);
const MAX_IMAGE_BYTES = Number(process.env.ACADEMIC_LOGO_MAX_BYTES || 80 * 1024);
const FETCH_TIMEOUT_MS = Number(process.env.ACADEMIC_FETCH_TIMEOUT_MS || 12000);
const LOGO_TIMEOUT_MS = Number(process.env.ACADEMIC_LOGO_TIMEOUT_MS || 6000);
const BIO_PAGE_CONCURRENCY = Number(process.env.ACADEMIC_BIOTOOLS_PAGE_CONCURRENCY || 10);
const DETAIL_CONCURRENCY = Number(process.env.ACADEMIC_DETAIL_CONCURRENCY || 14);
const LOGO_CONCURRENCY = Number(process.env.ACADEMIC_LOGO_CONCURRENCY || 28);
const LOGO_MODE = process.env.ACADEMIC_LOGO_MODE || 'real-first'; // real-first | functional
const CACHE_DIR = path.resolve(process.env.ACADEMIC_CACHE_DIR || '.feature-tools-academic-10k-cache');
const COLLECTED_AT = new Date().toISOString();
const TOPIC_BASE = 944000000;
const USER_AGENT = 'ScholayAcademicToolCollector/1.0 (+https://scholay.app)';
const WIKIDATA_PAGE_SIZE = Number(process.env.ACADEMIC_WIKIDATA_PAGE_SIZE || 1000);
const DOAJ_MAX_PAGES = Number(process.env.ACADEMIC_DOAJ_MAX_PAGES || 10);

const ROOT = process.cwd();

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

const CHINESE_TAGS = new Map([
  ['Bioinformatics', '生物信息'],
  ['Genomics', '基因组学'],
  ['Proteomics', '蛋白质组'],
  ['Metabolomics', '代谢组'],
  ['Transcriptomics', '转录组'],
  ['Data visualisation', '数据可视化'],
  ['Data visualization', '数据可视化'],
  ['Sequence analysis', '序列分析'],
  ['Sequence alignment', '序列比对'],
  ['Phylogenetics', '系统发育'],
  ['Protein structure analysis', '蛋白结构'],
  ['Structural biology', '结构生物学'],
  ['Systems biology', '系统生物学'],
  ['Machine learning', '机器学习'],
  ['Statistics and probability', '统计分析'],
  ['Image analysis', '图像分析'],
  ['Medical informatics', '医学信息'],
  ['Cheminformatics', '化学信息'],
  ['Workflows', '工作流'],
  ['Workflow', '工作流'],
  ['Database portal', '数据库门户'],
  ['Web application', '在线应用'],
  ['Command-line tool', '命令行工具'],
  ['Desktop application', '桌面软件'],
  ['Web API', 'API 服务'],
  ['Workbench', '工作台'],
  ['Suite', '套件'],
  ['Analysis', '分析'],
  ['Visualisation', '可视化'],
  ['Visualization', '可视化'],
  ['2 Life Sciences', '生命科学'],
  ['21 Biology', '生物学'],
  ['22 Medicine', '医学'],
  ['3 Natural Sciences', '自然科学'],
  ['31 Chemistry', '化学'],
  ['32 Physics', '物理'],
  ['34 Geosciences', '地球科学'],
  ['4 Engineering Sciences', '工程科学'],
  ['5 Social Sciences', '社会科学'],
  ['1 Humanities and Social Sciences', '人文社科'],
]);

const GENERIC_CODE_HOSTS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'sourceforge.net',
  'pypi.org',
  'cran.r-project.org',
  'bioconductor.org',
  'npmjs.com',
]);

const PACKAGE_REGISTRY_HOSTS = new Set([
  'pypi.org',
  'cran.r-project.org',
  'bioconductor.org',
  'anaconda.org',
  'npmjs.com',
  'rubygems.org',
  'packagist.org',
  'metacpan.org',
  'mvnrepository.com',
  'packages.debian.org',
]);

const DATA_RECORD_HOSTS = [
  'data.bs.ch',
  'zenodo.org',
  'figshare.com',
  'datadryad.org',
  'dataverse.harvard.edu',
  'data.gouv.fr',
  'data.4tu.nl',
  'icpsr.umich.edu',
  'openicpsr.org',
  'osf.io',
  'borealisdata.ca',
  'madata.bib.uni-mannheim.de',
  'data.mendeley.com',
  'sciencebase.gov',
  'easy.dans.knaw.nl',
  'opendata.swiss',
  'rotterdamopendata.nl',
];

const PUBLISHER_CONTENT_HOSTS = [
  'sciencedirect.com',
  'nature.com',
  'link.springer.com',
  'academic.oup.com',
  'journals.plos.org',
  'frontiersin.org',
  'journals.lww.com',
  'onlinelibrary.wiley.com',
  'tandfonline.com',
  'mdpi.com',
  'degruyter.com',
  'ingentaconnect.com',
  'biomedcentral.com',
];

const PLATFORM_ITEM_HOSTS = [
  'mathworks.com',
  'mediawiki.org',
  'colab.research.google.com',
  'support.10xgenomics.com',
  'wiki.cyverse.org',
  'arxiv.org',
];

const WIKIDATA_ROOTS = [
  { qid: 'Q1789476', label: 'bibliographic database', category: 'lit-manage-pdf', strict: false },
  { qid: 'Q4117139', label: 'biological database', category: 'bio-life', strict: false },
  { qid: 'Q2881060', label: 'chemical database', category: 'chem-materials', strict: false },
  { qid: 'Q212805', label: 'digital library', category: 'lit-manage-pdf', strict: false },
  { qid: 'Q5227240', label: 'data library', category: 'general-utility', strict: false },
  { qid: 'Q45787211', label: 'preprint server', category: 'lit-manage-pdf', strict: false },
  { qid: 'Q1403556', label: 'reference management software', category: 'lit-manage-pdf', strict: false },
  { qid: 'Q95001953', label: 'research software', category: 'general-utility', strict: false },
  { qid: 'Q13199995', label: 'statistical package', category: 'stats-econometrics', strict: false },
  { qid: 'Q1639024', label: 'mathematical software', category: 'math-numerical', strict: false },
  { qid: 'Q64769132', label: 'bioinformatics software', category: 'bio-life', strict: false },
  { qid: 'Q29156727', label: 'cheminformatics software', category: 'chem-materials', strict: false },
  { qid: 'Q1235234', label: 'document repository', category: 'lit-manage-pdf', strict: false },
  { qid: 'Q1224984', label: 'digital archive', category: 'lit-manage-pdf', strict: false },
  { qid: 'Q1438053', label: 'research infrastructure', category: 'general-utility', strict: false },
  { qid: 'Q593744', label: 'knowledge base', category: 'general-utility', strict: true },
  { qid: 'Q856638', label: 'library catalog', category: 'lit-manage-pdf', strict: false },
  { qid: 'Q7094076', label: 'online database', category: 'general-utility', strict: true },
  { qid: 'Q8513', label: 'database', category: 'general-utility', strict: true },
  { qid: 'Q1172284', label: 'data set', category: 'general-utility', strict: true },
  { qid: 'Q186165', label: 'web portal', category: 'general-utility', strict: true },
  { qid: 'Q1130645', label: 'open-source software', category: 'general-utility', strict: true },
  { qid: 'Q166142', label: 'application software', category: 'general-utility', strict: true },
  { qid: 'Q40056', label: 'computer program', category: 'general-utility', strict: true },
  { qid: 'Q7397', label: 'software', category: 'general-utility', strict: true },
];

const ACADEMIC_TEXT_RE = /\b(research|academic|science|scientific|university|college|institute|library|archive|repository|database|data portal|dataset|catalogue|catalog|bibliograph|citation|journal|publication|paper|preprint|thesis|dissertation|manuscript|ontology|taxonomy|species|biodiversity|ecology|genom|gene|protein|sequence|bioinform|biolog|medical|clinical|medicine|health|disease|drug|pharma|neuro|chem|molecule|crystal|material|spectr|physics|astronom|math|statistic|econom|geolog|earth|climate|ocean|gis|map|linguistic|history|humanities|museum|education|learning|laboratory|analysis|visuali[sz]ation|software|tool|workflow)\b|科研|学术|大学|图书馆|档案|数据库|数据集|论文|期刊|预印本|医学|生物|化学|物理|数学|统计|工程|地理|教育/iu;
const NON_ACADEMIC_TEXT_RE = /\b(recipe|restaurant|hotel|shopping|retail|coupon|casino|dating|porn|celebrity|football|basketball|baseball|soccer|rugby|cricket|hockey|video game|board game|anime|manga|fan wiki|lyrics|discography|film database|movie database|television database|roller coaster|theme park)\b/i;
const DOAJ_QUERIES = [
  'medicine',
  'biology',
  'chemistry',
  'engineering',
  'computer science',
  'education',
  'economics',
  'statistics',
  'mathematics',
  'physics',
  'earth science',
  'environment',
  'agriculture',
  'psychology',
  'sociology',
  'history',
  'linguistics',
  'law',
  'public health',
  'materials',
  'neuroscience',
  'geography',
  'library science',
  'humanities',
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function xmlText(block, tag) {
  const re = new RegExp(`<(?:[a-z0-9]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tag}>`, 'i');
  const m = String(block || '').match(re);
  return m ? stripTags(m[1]) : '';
}

function xmlTexts(block, tag) {
  const re = new RegExp(`<(?:[a-z0-9]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(String(block || '')))) out.push(stripTags(m[1]));
  return out;
}

function slugify(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean))];
}

function truncate(s, max = 180) {
  const clean = String(s || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

function cleanURL(url) {
  const s = String(url || '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  try {
    const u = new URL(s);
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}

function canonicalURL(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    let p = u.pathname.replace(/\/+$/, '');
    if (p === '') p = '/';
    return `${u.protocol}//${u.hostname.toLowerCase()}${p}`;
  } catch {
    return '';
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function pathPartsOf(url) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part).toLowerCase());
  } catch {
    return [];
  }
}

function matchesHost(host, values) {
  return values.some((value) => host === value || host.endsWith(`.${value}`));
}

function pathContains(url, parts) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return parts.some((part) => pathname.includes(part));
  } catch {
    return false;
  }
}

function canonicalProjectURL(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const parts = u.pathname.split('/').filter(Boolean);
    const lower = parts.map((p) => p.toLowerCase());
    if ((host === 'github.com' || host === 'bitbucket.org') && parts.length >= 2) {
      return `${u.protocol}//${u.hostname}/${parts[0]}/${parts[1]}`;
    }
    if (host === 'gitlab.com' || host.includes('gitlab') || lower.includes('-') || lower.includes('wikis')) {
      const marker = lower.findIndex((p) => ['-', 'wikis', 'wiki', 'releases', 'tree', 'blob', 'src'].includes(p));
      const rootParts = marker >= 0 ? parts.slice(0, marker) : parts;
      return rootParts.length ? `${u.protocol}//${u.hostname}/${rootParts.join('/')}` : '';
    }
    if (host === 'sourceforge.net') {
      if (parts[0] === 'projects' && parts[1]) return `${u.protocol}//${u.hostname}/projects/${parts[1]}/`;
      if (parts[0] === 'p' && parts[1]) return `${u.protocol}//${u.hostname}/projects/${parts[1]}/`;
    }
    if (host === 'code.google.com') {
      if (parts[0] === 'archive' && parts[1] === 'p' && parts[2]) return `${u.protocol}//${u.hostname}/archive/p/${parts[2]}`;
      if (parts[0] === 'p' && parts[1]) return `${u.protocol}//${u.hostname}/archive/p/${parts[1]}`;
    }
  } catch {
    return '';
  }
  return '';
}

function looksLikePackageAggregate(candidate) {
  const text = `${candidate.name || ''} ${candidate.description || ''}`.toLowerCase();
  return /包库|package collection|packages for|package registry|software suite|toolkit|platform/.test(text);
}

function reviewCandidateIndependence(candidate) {
  const homepage = cleanURL(candidate.homepage);
  if (!homepage) return { reject: 'missing-url' };
  const host = hostOf(homepage);
  const parts = pathPartsOf(homepage);

  if (PACKAGE_REGISTRY_HOSTS.has(host) && !looksLikePackageAggregate(candidate)) {
    return { reject: 'package-registry-item' };
  }

  if (host === 'github.com') {
    if (parts.length === 2) return { homepage };
    const sub = parts[2] || '';
    if ((sub === 'tree' && parts.length === 4) || ['wiki', 'releases', 'issues'].includes(sub)) {
      const canonical = canonicalProjectURL(homepage);
      return canonical ? { homepage: canonical, note: 'canonicalized-repository-url' } : { reject: 'repository-subpage' };
    }
    if (['tree', 'blob', 'src', 'raw'].includes(sub)) return { reject: 'repository-internal-path' };
    const canonical = canonicalProjectURL(homepage);
    return canonical ? { homepage: canonical, note: 'canonicalized-repository-url' } : { reject: 'repository-subpage' };
  }

  if (host === 'gitlab.com' || host.includes('gitlab') || parts.includes('wikis')) {
    const marker = parts.findIndex((p) => ['-', 'wikis', 'wiki', 'releases', 'tree', 'blob', 'src'].includes(p));
    if (marker >= 0) {
      const canonical = canonicalProjectURL(homepage);
      return canonical ? { homepage: canonical, note: 'canonicalized-repository-url' } : { reject: 'repository-subpage' };
    }
    return { homepage };
  }

  if (host === 'bitbucket.org') {
    if (parts.length === 2) return { homepage };
    const sub = parts[2] || '';
    if (['downloads', 'wiki', 'branches'].includes(sub)) {
      const canonical = canonicalProjectURL(homepage);
      return canonical ? { homepage: canonical, note: 'canonicalized-repository-url' } : { reject: 'repository-subpage' };
    }
    return { reject: 'repository-internal-path' };
  }

  if (host === 'sourceforge.net') {
    if (parts[0] === 'projects' && parts.length <= 2) return { homepage };
    if ((parts[0] === 'projects' && parts[2] === 'files') || parts[0] === 'p') {
      const canonical = canonicalProjectURL(homepage);
      return canonical ? { homepage: canonical, note: 'canonicalized-repository-url' } : { reject: 'sourceforge-subpage' };
    }
  }

  if (host === 'code.google.com') {
    const canonical = canonicalProjectURL(homepage);
    if (canonical) return { homepage: canonical, note: 'canonicalized-repository-url' };
  }

  if (host === 'harbor.eucaim.cancerimage.eu' || pathContains(homepage, ['/repositories/'])) {
    return { reject: 'container-registry-item' };
  }

  if (matchesHost(host, DATA_RECORD_HOSTS)) return { reject: 'data-record-item' };

  if (matchesHost(host, PLATFORM_ITEM_HOSTS)) {
    if (host.includes('mathworks.com') && pathContains(homepage, ['/matlabcentral/fileexchange/'])) {
      return { reject: 'platform-fileexchange-item' };
    }
    if (host === 'arxiv.org') return { reject: 'paper-page' };
    if (host === 'colab.research.google.com') return { reject: 'notebook-page' };
    return { reject: 'platform-feature-page' };
  }

  if (matchesHost(host, PUBLISHER_CONTENT_HOSTS) && pathContains(homepage, ['/article', '/articles', '/content', '/doi', '/abs', '/pdf', '/full'])) {
    return { reject: 'publisher-content-page' };
  }

  if (pathContains(homepage, ['/dataset/', '/datasets/', '/record/', '/records/', '/article/', '/articles/', '/stash/dataset/', '/explore/dataset/', '/resource/'])) {
    return { reject: 'record-or-article-path' };
  }

  if (pathContains(homepage, ['/download', '/downloads', '/docs', '/documentation', '/manual', '/help', '/support', '/wiki'])) {
    return { reject: 'documentation-or-download-page' };
  }

  const name = String(candidate.name || '');
  if (/\b(dataset|data from|supplementary|appendix|questionnaire|survey answers|workshop sample)\b/i.test(name)) {
    return { reject: 'dataset-like-name' };
  }
  if (/\b(tutorial|tutorials|example|examples|support package)\b/i.test(name) || /\b(plugin|add-on|addon|extension|script)\b/i.test(name)) {
    return { reject: 'subtool-like-name' };
  }

  return { homepage };
}

function tagLabel(term) {
  const t = String(term || '').trim();
  return CHINESE_TAGS.get(t) || t.replace(/^(\d+\s*)/, '').trim();
}

function categoryOfRe3data(subjects, name, description) {
  const text = `${subjects.join(' ')} ${name} ${description}`.toLowerCase();
  if (/medicine|medical|health|clinical|neuroscience|brain|pharmac|disease|patient/.test(text)) return 'medical-reference';
  if (/biology|life sciences|bioinformatics|genomics|proteomics|biodiversity|ecology|agriculture|plant|animal/.test(text)) return 'bio-life';
  if (/chemistry|chemical|materials|crystal|spectr|molecule/.test(text)) return 'chem-materials';
  if (/mathematics|statistics|economics|social sciences|survey|census|demograph|econometric/.test(text)) return 'stats-econometrics';
  if (/geosciences|earth|climate|ocean|map|spatial|geograph|remote sensing|gis/.test(text)) return 'viz-plotting';
  if (/engineering|computer science|robot|simulation|energy|aerospace|mechanic/.test(text)) return 'engineering-cad';
  if (/humanities|history|linguistics|language|library|archive|manuscript|cultural/.test(text)) return 'lit-manage-pdf';
  return 'general-utility';
}

function categoryOfBiotools(topics, types, name, description) {
  const text = `${topics.join(' ')} ${types.join(' ')} ${name} ${description}`.toLowerCase();
  if (/cheminformatics|chemistry|drug discovery|molecule|compound|ligand/.test(text)) return 'chem-materials';
  if (/medical|clinical|variant|disease|drug|pharmac|cancer|patient|diagnos/.test(text)) return 'medical-reference';
  if (/visuali[sz]ation|image|imaging|plot|graph|network/.test(text)) return 'viz-plotting';
  if (/statistics|machine learning|data mining|benchmark|classification|regression/.test(text)) return 'stats-econometrics';
  return 'bio-life';
}

function categoryOfWikidata(root, classLabel, name, description) {
  const text = `${root.label} ${classLabel} ${name} ${description}`.toLowerCase();
  if (/bibliographic|citation|journal|publication|preprint|library|archive|repository|catalog|manuscript|thesis|dissertation|humanities|history|linguistic/.test(text)) return 'lit-manage-pdf';
  if (/bio|genom|gene|protein|sequence|species|taxonomy|biodiversity|ecology|enzyme|plant|animal/.test(text)) return 'bio-life';
  if (/medical|clinical|medicine|health|disease|drug|pharma|neuro|patient|cancer/.test(text)) return 'medical-reference';
  if (/chem|molecule|compound|crystal|material|spectr|ligand/.test(text)) return 'chem-materials';
  if (/statistic|econom|survey|census|demograph|social science/.test(text)) return 'stats-econometrics';
  if (/math|numeric|algebra|geometry|calculus/.test(text)) return 'math-numerical';
  if (/map|gis|geo|earth|climate|ocean|visuali[sz]|image|plot|graph/.test(text)) return 'viz-plotting';
  if (/engineering|simulation|cad|eda|finite element|fluid|robot/.test(text)) return 'engineering-cad';
  return root.category || 'general-utility';
}

function categoryOfDoaj(subjects, keywords, title) {
  const text = `${subjects.join(' ')} ${keywords.join(' ')} ${title}`.toLowerCase();
  if (/medicine|medical|clinical|health|pathology|nursing|pharma|disease|surgery|public health/.test(text)) return 'medical-reference';
  if (/biology|life science|bio|genetic|ecology|agriculture|plant|animal|environment/.test(text)) return 'bio-life';
  if (/chemistry|chemical|materials|molecule|pharmaceutical/.test(text)) return 'chem-materials';
  if (/statistics|economics|finance|management|business|social science|education|psychology|sociology|policy/.test(text)) return 'stats-econometrics';
  if (/engineering|technology|computer science|informatics|electrical|mechanical|civil/.test(text)) return 'engineering-cad';
  if (/mathematics|physics|astronomy/.test(text)) return 'math-numerical';
  if (/geography|geology|earth|climate|ocean|gis|cartography/.test(text)) return 'viz-plotting';
  return 'journal-metrics';
}

function priceFromBiotools(item) {
  const cost = String(item.cost || '').toLowerCase();
  const license = String(item.license || '').toLowerCase();
  if (/free of charge|freeware|open access|open source|apache|mit|bsd|gpl|lgpl|cc-by|public domain/.test(`${cost} ${license}`)) return 'free';
  if (/commercial|paid|subscription|proprietary/.test(`${cost} ${license}`)) return 'paid';
  return 'unknown';
}

function isOpenSourceLicense(license) {
  return /apache|mit|bsd|gpl|lgpl|agpl|mpl|eclipse|cecill|artistic|open source|public domain/i.test(String(license || ''));
}

function accessFromToolTypes(types, homepage) {
  const text = types.join(' ').toLowerCase();
  const host = hostOf(homepage);
  if (/web application|web api|database portal|bioinformatics portal/.test(text)) return 'website';
  if (/desktop application|command-line tool|script|suite|workbench|workflow/.test(text)) return 'download';
  if (GENERIC_CODE_HOSTS.has(host)) return 'download';
  return 'website';
}

function platformsFor(access) {
  if (access === 'website') return ['web'];
  if (access === 'download') return ['windows', 'mac', 'linux', 'cross'];
  return ['web', 'windows', 'mac', 'linux'];
}

function toolKind(access, source) {
  if (source === 're3data') return '研究数据仓库';
  if (source === 'doaj') return '开放获取期刊';
  if (access === 'website') return '在线工具';
  if (access === 'download') return '科研软件';
  return '科研工具';
}

function sourceResourceLabel(source, sourceUrl) {
  const host = hostOf(sourceUrl);
  if (source === 're3data' || host === 're3data.org') return 're3data 条目';
  if (source === 'bio.tools' || host === 'bio.tools') return 'bio.tools 条目';
  if (source === 'doaj' || host === 'doaj.org') return 'DOAJ 条目';
  if (source === 'wikidata' || host === 'wikidata.org') return 'Wikidata 条目';
  return '来源条目';
}

function shouldRejectBiotools(item) {
  const name = cleanName(item.name);
  const homepage = cleanURL(item.homepage);
  const description = String(item.description || '').trim();
  if (!name || !homepage || description.length < 70) return true;
  if (item.confidence_flag && item.confidence_flag !== 'tool') return true;
  const host = hostOf(homepage);
  const types = (item.toolType || []).map((t) => String(t).toLowerCase());
  const onlyLibraryish = types.length > 0 && types.every((t) => /(library|script|plugin)/.test(t));
  if (onlyLibraryish && GENERIC_CODE_HOSTS.has(host)) return true;
  if (types.includes('library') && GENERIC_CODE_HOSTS.has(host)) return true;
  if (/\b(r package|python package|bioconductor package|cran package|npm package)\b/i.test(description)) return true;
  return false;
}

function shouldRejectWikidata(candidate, root) {
  const name = cleanName(candidate.name);
  const homepage = cleanURL(candidate.homepage);
  const description = String(candidate.description || '').trim();
  if (!name || !homepage || shouldRejectName(name)) return true;
  if (/^Q\d+$/.test(name)) return true;
  const host = hostOf(homepage);
  if (/^(facebook|instagram|x|twitter|youtube|linkedin|tiktok)\.com$/.test(host)) return true;
  const topicalText = `${name} ${description}`;
  const text = `${topicalText} ${(candidate.tags || []).join(' ')}`;
  if (NON_ACADEMIC_TEXT_RE.test(text)) return true;
  if (root.strict && !ACADEMIC_TEXT_RE.test(topicalText)) return true;
  if (!root.strict && description.length < 12 && !ACADEMIC_TEXT_RE.test(text)) return true;
  return false;
}

function shouldRejectName(name) {
  const n = String(name || '').trim();
  if (n.length < 2 || n.length > 180) return true;
  if (/^(test|demo|example|untitled)$/i.test(n)) return true;
  return false;
}

async function fetchText(url, opts = {}) {
  const signal = AbortSignal.timeout(opts.timeout || FETCH_TIMEOUT_MS);
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: opts.accept || '*/*' },
    redirect: 'follow',
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function fetchJSON(url, opts = {}) {
  const signal = AbortSignal.timeout(opts.timeout || FETCH_TIMEOUT_MS);
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    redirect: 'follow',
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function fetchBytes(url, opts = {}) {
  const signal = AbortSignal.timeout(opts.timeout || LOGO_TIMEOUT_MS);
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = String(res.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_IMAGE_BYTES) throw new Error(`image too large: ${len}`);
  const ab = await res.arrayBuffer();
  const bytes = Buffer.from(ab);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error(`image too large: ${bytes.length}`);
  return { bytes, contentType };
}

function cachePath(name) {
  ensureDir(CACHE_DIR);
  return path.join(CACHE_DIR, name);
}

async function cachedText(name, url, opts = {}) {
  const file = cachePath(name);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const text = await fetchText(url, opts);
  fs.writeFileSync(file, text);
  return text;
}

async function cachedJSON(name, url, opts = {}) {
  const file = cachePath(name);
  if (fs.existsSync(file)) return readJSON(file);
  const json = await fetchJSON(url, opts);
  writeJSON(file, json);
  return json;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (err) {
        out[i] = { error: String(err && err.message ? err.message : err) };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

function existingAcademicDirs() {
  const rootDirs = fs.readdirSync(ROOT)
    .filter((name) => {
      if (name === 'feature-tools-academic-1000') return true;
      return /^feature-tools-academic-1000-batch-\d+$/.test(name);
    });
  const consolidatedRoot = path.resolve('feature-tools-academic-5000');
  const consolidatedDirs = fs.existsSync(consolidatedRoot)
    ? fs.readdirSync(consolidatedRoot)
      .filter((name) => /^feature-tools-academic-5000-batch-\d+$/.test(name))
      .map((name) => path.join('feature-tools-academic-5000', name))
    : [];
  return [...rootDirs, ...consolidatedDirs].sort((a, b) => batchNumberFromDir(a) - batchNumberFromDir(b));
}

function batchNumberFromDir(dir) {
  if (dir === 'feature-tools-academic-1000') return 1;
  const m = dir.match(/batch-(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function loadExistingState() {
  const slugs = new Set();
  const urls = new Set();
  const files = [];
  let academicCount = 0;
  const addFile = (file, countAcademic) => {
    if (!fs.existsSync(file)) return;
    const items = readJSON(file);
    files.push(file);
    if (countAcademic) academicCount += items.length;
    for (const item of items) {
      if (item.slug) slugs.add(String(item.slug));
      const cu = canonicalURL(item.official_url || item.source_url || '');
      if (cu) urls.add(cu);
    }
  };
  addFile(path.resolve('feature-tools-coldstart/feature-tools.json'), false);
  for (const dir of existingAcademicDirs()) {
    addFile(path.resolve(dir, 'feature-tools.json'), true);
  }
  return { slugs, urls, files, academicCount };
}

async function collectRe3data(maxNeeded) {
  if (maxNeeded <= 0) return [];
  console.log(`[re3data] fetching repository list`);
  const listXML = await cachedText('re3data-list.xml', 'https://www.re3data.org/api/beta/repositories?query=&page=1', {
    accept: 'application/xml,text/xml',
    timeout: 30000,
  });
  const blocks = [...listXML.matchAll(/<repository>([\s\S]*?)<\/repository>/gi)].map((m) => m[1]);
  const basics = blocks.map((block) => ({
    id: xmlText(block, 'id'),
    name: cleanName(xmlText(block, 'name')),
  })).filter((x) => x.id && x.name);
  console.log(`[re3data] list items=${basics.length}`);

  const selectedBasics = basics.slice(0, Math.min(basics.length, maxNeeded + 900));
  const details = await mapLimit(selectedBasics, DETAIL_CONCURRENCY, async (basic, i) => {
    if ((i + 1) % 250 === 0) console.log(`[re3data] details ${i + 1}/${selectedBasics.length}`);
    const file = `re3data-${basic.id}.xml`;
    const xml = await cachedText(file, `https://www.re3data.org/api/beta/repository/${basic.id}`, {
      accept: 'application/xml,text/xml',
      timeout: 20000,
    });
    const name = cleanName(xmlText(xml, 'repositoryName') || basic.name);
    const aliases = uniq(xmlTexts(xml, 'additionalName')).filter((v) => v !== name).slice(0, 5);
    const homepage = cleanURL(xmlText(xml, 'repositoryURL'));
    const description = truncate(xmlText(xml, 'description'), 320);
    const subjects = uniq(xmlTexts(xml, 'subject')).slice(0, 12);
    const types = uniq(xmlTexts(xml, 'type')).slice(0, 4);
    const languages = uniq(xmlTexts(xml, 'repositoryLanguage')).slice(0, 5);
    const start = Number(xmlText(xml, 'startDate').match(/\d{4}/)?.[0] || 0) || null;
    const category = categoryOfRe3data(subjects, name, description);
    const tags = uniq(['研究数据仓库', '数据集', ...subjects.map(tagLabel), ...types.map(tagLabel)]).slice(0, 6);
    return {
      source: 're3data',
      sourceId: basic.id,
      sourceUrl: `https://www.re3data.org/repository/${basic.id}`,
      name,
      aliases,
      homepage,
      description,
      category,
      tags,
      priceType: 'free',
      isOpenSource: false,
      accessType: 'website',
      platforms: ['web'],
      languages: languages.length ? languages : ['multi'],
      foundedYear: start,
      dataSources: [`https://www.re3data.org/repository/${basic.id}`, `https://www.re3data.org/api/beta/repository/${basic.id}`],
    };
  });

  return details.filter((x) => !x.error && x.homepage && x.description && !shouldRejectName(x.name)).slice(0, maxNeeded);
}

async function collectBiotools(maxNeeded) {
  if (maxNeeded <= 0) return [];
  const out = [];
  let page = 1;
  let totalPages = 700;
  console.log(`[bio.tools] collecting up to ${maxNeeded}`);

  while (out.length < maxNeeded && page <= totalPages) {
    const pages = Array.from({ length: BIO_PAGE_CONCURRENCY }, (_, i) => page + i).filter((p) => p <= totalPages);
    const results = await Promise.all(pages.map(async (p) => {
      try {
        return await cachedJSON(`biotools-page-${p}.json`, `https://bio.tools/api/tool/?format=json&page=${p}`, { timeout: 25000 });
      } catch (err) {
        console.warn(`[bio.tools] page ${p} failed: ${err.message}`);
        return null;
      }
    }));
    for (const json of results) {
      if (!json) continue;
      if (json.count) totalPages = Math.ceil(Number(json.count) / 50);
      for (const item of json.list || []) {
        if (shouldRejectBiotools(item)) continue;
        const name = cleanName(item.name);
        if (shouldRejectName(name)) continue;
        const homepage = cleanURL(item.homepage);
        const description = truncate(item.description, 320);
        const topics = uniq((item.topic || []).map((t) => t.term)).slice(0, 10);
        const types = uniq(item.toolType || []).slice(0, 8);
        const category = categoryOfBiotools(topics, types, name, description);
        const accessType = accessFromToolTypes(types, homepage);
        const languageTerms = uniq((item.language || []).map((x) => x.term || x)).slice(0, 8);
        const tags = uniq([...topics.map(tagLabel), ...types.map(tagLabel)]).slice(0, 6);
        out.push({
          source: 'bio.tools',
          sourceId: item.biotoolsID || item.biotoolsCURIE || slugify(name),
          sourceUrl: item.biotoolsID ? `https://bio.tools/${encodeURIComponent(item.biotoolsID)}` : 'https://bio.tools/',
          name,
          aliases: uniq([item.biotoolsCURIE, ...(item.otherID || []).map((x) => x.value || x)]).slice(0, 5),
          homepage,
          description,
          category,
          tags: tags.length ? tags : ['生物信息', '科研软件'],
          priceType: priceFromBiotools(item),
          isOpenSource: isOpenSourceLicense(item.license),
          accessType,
          platforms: platformsFor(accessType),
          languages: languageTerms.length ? languageTerms : ['multi'],
          foundedYear: null,
          dataSources: uniq([item.biotoolsID ? `https://bio.tools/${encodeURIComponent(item.biotoolsID)}` : '', homepage]),
          license: item.license || '',
          version: Array.isArray(item.version) ? item.version[0] || '' : '',
        });
        if (out.length >= maxNeeded) break;
      }
      if (out.length >= maxNeeded) break;
    }
    console.log(`[bio.tools] pages ${page}-${pages.at(-1)} collected=${out.length}`);
    page += BIO_PAGE_CONCURRENCY;
  }
  return out.slice(0, maxNeeded);
}

async function collectWikidata(maxNeeded) {
  if (maxNeeded <= 0) return [];
  const out = [];
  console.log(`[wikidata] collecting up to ${maxNeeded}`);
  for (const root of WIKIDATA_ROOTS) {
    if (out.length >= maxNeeded) break;
    let offset = 0;
    let emptyPages = 0;
    while (out.length < maxNeeded && emptyPages < 1) {
      const query = `SELECT DISTINCT ?item ?itemLabel ?itemDescription ?website ?classLabel WHERE {
  ?item wdt:P31 ?class; wdt:P856 ?website.
  ?class wdt:P279* wd:${root.qid}.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,zh". }
} LIMIT ${WIKIDATA_PAGE_SIZE} OFFSET ${offset}`;
      const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query);
      let json;
      try {
        json = await cachedJSON(`wikidata-${root.qid}-${offset}.json`, url, { timeout: 45000 });
      } catch (err) {
        console.warn(`[wikidata] ${root.qid} offset=${offset} failed: ${err.message}`);
        break;
      }
      const rows = json?.results?.bindings || [];
      if (!rows.length) {
        emptyPages += 1;
        break;
      }
      for (const b of rows) {
        const item = b.item?.value || '';
        const qid = item.match(/Q\d+$/)?.[0] || '';
        const name = cleanName(b.itemLabel?.value || qid);
        const homepage = cleanURL(b.website?.value || '');
        const description = truncate(b.itemDescription?.value || '', 300);
        const classLabel = cleanName(b.classLabel?.value || root.label);
        const category = categoryOfWikidata(root, classLabel, name, description);
        const tags = uniq([tagLabel(root.label), tagLabel(classLabel), CATEGORY[category]?.label]).slice(0, 6);
        const candidate = {
          source: 'wikidata',
          sourceId: qid,
          sourceUrl: item,
          name,
          aliases: [],
          homepage,
          description: description || `${name} 相关的学术资源或科研工具`,
          category,
          tags,
          priceType: 'unknown',
          isOpenSource: false,
          accessType: 'website',
          platforms: ['web'],
          languages: ['multi'],
          foundedYear: null,
          dataSources: uniq([item, homepage]),
          wikidataRoot: root.label,
        };
        if (!shouldRejectWikidata(candidate, root)) out.push(candidate);
        if (out.length >= maxNeeded) break;
      }
      offset += WIKIDATA_PAGE_SIZE;
      console.log(`[wikidata] ${root.qid} ${root.label} offset=${offset} collected=${out.length}`);
      if (rows.length < WIKIDATA_PAGE_SIZE) break;
    }
  }
  return out.slice(0, maxNeeded);
}

async function collectDoaj(maxNeeded) {
  if (maxNeeded <= 0) return [];
  const out = [];
  const pageSize = 100;
  console.log(`[doaj] collecting up to ${maxNeeded}`);
  const seenDoaj = new Set();
  for (const query of DOAJ_QUERIES) {
    if (out.length >= maxNeeded) break;
    let page = 1;
    let totalPages = 10;
    while (out.length < maxNeeded && page <= totalPages && page <= DOAJ_MAX_PAGES) {
      let json;
      try {
        json = await cachedJSON(`doaj-${slugify(query)}-${page}.json`, `https://doaj.org/api/search/journals/${encodeURIComponent(query)}?pageSize=${pageSize}&page=${page}`, { timeout: 25000 });
      } catch (err) {
        console.warn(`[doaj] query=${query} page=${page} failed: ${err.message}`);
        break;
      }
      const total = Number(json.total || 0);
      if (total > 0) totalPages = Math.min(DOAJ_MAX_PAGES, Math.ceil(total / pageSize));
      for (const row of json.results || []) {
        const bib = row.bibjson || {};
        const name = cleanName(bib.title || '');
        const refs = bib.ref || {};
        const homepage = cleanURL(refs.journal || refs.aims_scope || refs.author_instructions || '');
        if (!name || !homepage || shouldRejectName(name)) continue;
        const dedupeKey = row.id || `${name} ${homepage}`;
        if (seenDoaj.has(dedupeKey)) continue;
        seenDoaj.add(dedupeKey);
        const subjects = uniq((bib.subject || []).map((s) => s.term || s.code || '').filter(Boolean)).slice(0, 8);
        const keywords = uniq(bib.keywords || []).slice(0, 8);
        const category = categoryOfDoaj(subjects, keywords, name);
        const issn = bib.eissn || bib.pissn || (Array.isArray(bib.issn) ? bib.issn[0] : '');
        const doajUrl = issn ? `https://doaj.org/toc/${encodeURIComponent(issn)}` : 'https://doaj.org/';
        const focus = uniq(['开放获取期刊', '投稿入口', ...subjects.map(tagLabel), ...keywords.map(tagLabel)]).slice(0, 6);
        out.push({
          source: 'doaj',
          sourceId: row.id || issn || slugify(name),
          sourceUrl: doajUrl,
          name,
          aliases: uniq([issn, bib.eissn, bib.pissn]).slice(0, 4),
          homepage,
          description: `${name} 是 DOAJ 收录的开放获取学术期刊，可用于论文阅读、期刊筛选、投稿前核对和开放获取政策确认。`,
          category,
          tags: focus,
          priceType: 'free',
          isOpenSource: false,
          accessType: 'website',
          platforms: ['web'],
          languages: uniq(bib.language || ['multi']).slice(0, 6),
          foundedYear: null,
          dataSources: uniq([doajUrl, homepage, refs.author_instructions, refs.aims_scope]),
        });
        if (out.length >= maxNeeded) break;
      }
      if (page === totalPages || page % 5 === 0 || out.length >= maxNeeded) console.log(`[doaj] query=${query} page=${page}/${totalPages} collected=${out.length}`);
      page += 1;
    }
  }
  return out.slice(0, maxNeeded);
}

function normalizeCandidate(candidate, state, seen) {
  const review = reviewCandidateIndependence(candidate);
  if (review.reject) return { reject: review.reject };
  const homepage = cleanURL(review.homepage);
  if (!homepage) return { reject: 'missing-url' };
  const cu = canonicalURL(homepage);
  if (cu && (state.urls.has(cu) || seen.urls.has(cu))) return { reject: 'duplicate-url' };
  const baseSlug = slugify(candidate.name) || slugify(candidate.sourceId) || `tool-${state.slugs.size + seen.slugs.size + 1}`;
  let slug = baseSlug;
  let suffix = 2;
  while (state.slugs.has(slug) || seen.slugs.has(slug)) {
    slug = `${baseSlug}-${suffix++}`;
  }
  const description = truncate(candidate.description, 300);
  if (!description || description.length < 40) return { reject: 'weak-description' };
  seen.slugs.add(slug);
  if (cu) seen.urls.add(cu);
  return { ...candidate, slug, homepage, description, canonicalizationNote: review.note || '' };
}

function makeTool(candidate, id, batchNumber) {
  const cat = CATEGORY[candidate.category] || CATEGORY['general-utility'];
  const accessType = candidate.accessType || 'website';
  const tags = uniq(candidate.tags || []).slice(0, 6);
  const task = CATEGORY_TASK[candidate.category] || CATEGORY_TASK['general-utility'];
  const kind = toolKind(accessType, candidate.source);
  const focus = tags.length ? tags.join('、') : cat.label;
  const tagline = truncate(candidate.description, 120);
  const description = `${candidate.name} 是一个面向「${cat.label}」的${kind}，适合用于${task}。公开资料显示，它重点覆盖「${focus}」等方向；使用前建议确认官网文档、访问条件、许可证/价格、引用方式和数据使用条款，再将结果纳入论文、报告、课程、数据分析或实验记录。`;

  return {
    id,
    slug: candidate.slug,
    source: {
      topic_id: id,
      url: candidate.sourceUrl || candidate.homepage,
      category_id: cat.sourceCategoryId,
      created_at: COLLECTED_AT,
    },
    source_topic_id: id,
    source_url: candidate.sourceUrl || candidate.homepage,
    source_category_id: cat.sourceCategoryId,
    name: candidate.name,
    name_en: candidate.name,
    aliases: candidate.aliases || [],
    logo: '',
    tagline,
    description_md: description,
    category: candidate.category,
    category_label: cat.label,
    tags,
    price_type: candidate.priceType || 'unknown',
    is_open_source: Boolean(candidate.isOpenSource),
    languages: candidate.languages || ['multi'],
    platforms: candidate.platforms || platformsFor(accessType),
    access_type: accessType,
    official_url: candidate.homepage,
    access: {
      type: accessType,
      official_url: candidate.homepage,
      resources: [
        { label: '官网/工具入口', url: candidate.homepage },
        ...(candidate.sourceUrl ? [{ label: sourceResourceLabel(candidate.source, candidate.sourceUrl), url: candidate.sourceUrl }] : []),
      ],
      download: {
        provider: accessType === 'website' ? 'website' : 'official',
        url: accessType === 'website' ? '' : candidate.homepage,
        extract_code: '',
        filename: '',
        gated: false,
      },
    },
    spec: {
      core_use: tagline,
      audience: '研究生、科研人员、教师、实验室成员、数据分析人员及相关学科用户',
      scenarios: [
        `${cat.label}相关的学习、研究、教学或项目任务`,
        '论文、课题、课程作业、数据分析或实验流程中的工具选型',
        '团队协作、方法复现、数据归档或结果展示中的辅助工具',
      ],
      workflow: [
        '打开官网或文档，确认访问方式、适用范围和引用要求',
        '用示例数据或小样本验证输入、输出和操作流程',
        '记录版本、参数、数据来源、许可证和使用日期',
        '将结果导出并纳入论文、报告、代码仓库、数据管理计划或实验记录',
      ],
      key_features: tags,
      input_formats: ['按官网文档准备数据、文本、文献、实验记录、序列、图像、模型或项目文件'],
      output: ['检索结果、数据集、分析报告、图表、引用信息、模型结果、工作流记录或导出文件'],
      version: candidate.version || '',
    },
    faq: [
      {
        q: `${candidate.name} 适合做什么？`,
        a: `它适合围绕${focus}开展资料检索、数据处理、分析验证、写作整理或结果展示。`,
      },
      {
        q: '使用前需要确认哪些信息？',
        a: '请优先查看官网中的访问方式、价格或许可证、数据隐私说明、文档示例、引用方式以及是否需要机构账号。',
      },
      {
        q: '如何放进科研工作流？',
        a: '建议先用小样本或官方示例验证效果，再记录版本、参数、数据来源和导出结果，方便论文写作、课程汇报或团队复现。',
      },
    ],
    disclaimer: '功能、价格、许可证、平台支持和可访问性可能变化，请以官网最新说明为准。',
    use_cases: [
      {
        icon: '',
        title: '快速评估',
        desc: `判断它是否适合当前的${cat.label}任务。`,
      },
      {
        icon: '',
        title: '研究使用',
        desc: `围绕${focus}完成检索、分析、管理或展示。`,
      },
      {
        icon: '',
        title: '成果沉淀',
        desc: '保存版本、参数、引用信息和导出结果，便于复现和写作。',
      },
    ],
    vendor: {
      name: '',
      country: '',
      founded: candidate.foundedYear || null,
      homepage: candidate.homepage,
      desc: '',
    },
    founded_year: candidate.foundedYear || null,
    country: '',
    pricing: [],
    free_trial: '',
    alternatives: [],
    similar_tool_ids: [],
    tutorials: [],
    stats: null,
    reviews: [],
    featured: false,
    status: 'published',
    sort_weight: Math.max(10, 100 - batchNumber),
    view_count: 0,
    favorite_count: 0,
    created_at: COLLECTED_AT,
    updated_at: COLLECTED_AT,
    data_quality: {
      enriched: true,
      needs_review: false,
      needs_enrich: [],
      sources: uniq([...(candidate.dataSources || []), candidate.sourceUrl, candidate.homepage]),
    },
  };
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

function absolutize(base, href) {
  if (!href) return '';
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
    const url = absolutize(base, decodeEntities(href));
    if (url) links.push({ url, score: rel.includes('apple') ? 90 : rel.includes('shortcut') ? 70 : 80, sizes });
  }
  links.sort((a, b) => {
    const as = Number(String(a.sizes).match(/\d+/)?.[0] || 0);
    const bs = Number(String(b.sizes).match(/\d+/)?.[0] || 0);
    return (b.score + bs / 10) - (a.score + as / 10);
  });
  return links.map((x) => x.url);
}

async function discoverLogo(homepage) {
  const host = hostOf(homepage);
  if (GENERIC_CODE_HOSTS.has(host)) return null;
  const urls = [];
  try {
    const html = await fetchText(homepage, { timeout: LOGO_TIMEOUT_MS, accept: 'text/html,application/xhtml+xml' });
    urls.push(...parseIconLinks(html.slice(0, 260000), homepage));
  } catch {
    // fall through to conventional favicon paths
  }
  try {
    const u = new URL(homepage);
    urls.push(`${u.origin}/favicon.ico`, `${u.origin}/favicon.png`, `${u.origin}/apple-touch-icon.png`);
  } catch {
    return null;
  }
  for (const url of uniq(urls).slice(0, 6)) {
    try {
      const img = await fetchBytes(url, { timeout: LOGO_TIMEOUT_MS });
      if (img.contentType.includes('svg')) {
        const text = img.bytes.toString('utf8').slice(0, 2000).toLowerCase();
        if (text.includes('<script') || text.includes('onload=')) continue;
      }
      return { ...img, url };
    } catch {
      // next candidate
    }
  }
  return null;
}

function functionalLogo(tool) {
  const cat = CATEGORY[tool.category] || CATEGORY['general-utility'];
  const hue = cat.hue;
  const bg1 = `hsl(${hue} 72% 43%)`;
  const bg2 = `hsl(${(hue + 42) % 360} 70% 54%)`;
  const fg = '#ffffff';
  const glyph = glyphForCategory(tool.category);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${escapeXML(tool.name)} logo"><defs><linearGradient id="g" x1="12" y1="10" x2="84" y2="86" gradientUnits="userSpaceOnUse"><stop stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs><rect width="96" height="96" rx="20" fill="url(#g)"/><g fill="none" stroke="${fg}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".96">${glyph}</g></svg>`;
  return Buffer.from(svg);
}

function escapeXML(s) {
  return String(s || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}

function glyphForCategory(category) {
  switch (category) {
    case 'bio-life':
      return '<path d="M35 22c18 10 34 20 26 52"/><path d="M61 22c-18 10-34 20-26 52"/><path d="M36 34h24M32 48h32M36 62h24"/>';
    case 'medical-reference':
      return '<path d="M48 24v48M24 48h48"/><path d="M31 27h34a7 7 0 0 1 7 7v28a7 7 0 0 1-7 7H31a7 7 0 0 1-7-7V34a7 7 0 0 1 7-7z" opacity=".72"/>';
    case 'chem-materials':
      return '<circle cx="31" cy="35" r="8"/><circle cx="65" cy="35" r="8"/><circle cx="48" cy="65" r="8"/><path d="M39 39l18 21M57 39 39 60"/>';
    case 'stats-econometrics':
      return '<path d="M24 70h48"/><path d="M31 62V46M48 62V30M65 62V39"/>';
    case 'viz-plotting':
      return '<path d="M24 68c13-24 21-32 32-20 7 8 11 6 16-13"/><circle cx="24" cy="68" r="4"/><circle cx="56" cy="48" r="4"/><circle cx="72" cy="35" r="4"/>';
    case 'engineering-cad':
      return '<path d="M28 68 48 24l20 44H28z"/><path d="M38 53h20"/><path d="M48 24v44"/>';
    case 'lit-manage-pdf':
      return '<path d="M30 25h29l9 9v37H30z"/><path d="M59 25v12h12"/><path d="M39 48h18M39 60h22"/>';
    case 'writing-latex':
      return '<path d="M28 68 43 28l10 24 7-16 8 32"/><path d="M36 55h24"/>';
    case 'math-numerical':
      return '<path d="M27 33h42M27 63h42"/><path d="M35 24l26 48"/>';
    default:
      return '<path d="M26 31h44M26 48h44M26 65h44"/><path d="M34 24v48M62 24v48"/>';
  }
}

async function writeLogosForBatch(tools, imgDir, report) {
  ensureDir(imgDir);
  let done = 0;
  await mapLimit(tools, LOGO_CONCURRENCY, async (tool) => {
    done += 1;
    if (done % 200 === 0) console.log(`[logos] ${done}/${tools.length}`);
    if (LOGO_MODE === 'real-first') {
      const real = await discoverLogo(tool.official_url);
      if (real) {
        const ext = iconExt(real.contentType, real.url);
        const file = path.join(imgDir, `${tool.slug}${ext}`);
        fs.writeFileSync(file, real.bytes);
        report.logos.push({ slug: tool.slug, type: `real${ext}`, source: real.url, bytes: real.bytes.length });
        return;
      }
    }
    const svg = functionalLogo(tool);
    fs.writeFileSync(path.join(imgDir, `${tool.slug}.svg`), svg);
    report.logos.push({ slug: tool.slug, type: 'functional-svg', source: '', bytes: svg.length });
  });
}

function validateBatch(dir, tools) {
  const imgDir = path.join(dir, 'images');
  const images = fs.readdirSync(imgDir).filter((f) => !f.startsWith('.'));
  const stems = new Set(images.map((f) => path.basename(f, path.extname(f))));
  const missing = tools.filter((t) => !stems.has(t.slug)).map((t) => t.slug);
  const maxImageBytes = images.reduce((m, f) => Math.max(m, fs.statSync(path.join(imgDir, f)).size), 0);
  const extCounts = {};
  for (const f of images) {
    const ext = path.extname(f).toLowerCase();
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  }
  if (missing.length) throw new Error(`${dir}: missing images for ${missing.slice(0, 5).join(', ')}`);
  if (maxImageBytes > MAX_IMAGE_BYTES) throw new Error(`${dir}: image exceeds cap: ${maxImageBytes}`);
  return { imageCount: images.length, maxImageBytes, extCounts };
}

function zipBatch(dir, zipName) {
  const zipPath = path.join(dir, zipName);
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  const result = spawnSync('zip', ['-qr', zipName, 'feature-tools.json', 'images', 'README.txt', '_crawl-report.json'], {
    cwd: dir,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`zip failed for ${dir}`);
  return zipPath;
}

function nextBatchNumber() {
  const nums = existingAcademicDirs().map(batchNumberFromDir);
  return Math.max(0, ...nums) + 1;
}

async function build() {
  ensureDir(CACHE_DIR);
  const state = loadExistingState();
  const need = TARGET_NEW > 0 ? TARGET_NEW : Math.max(0, TARGET_TOTAL - state.academicCount);
  console.log(`[state] academicCount=${state.academicCount} target=${TARGET_TOTAL} need=${need}`);
  if (need <= 0) {
    console.log('[state] target already satisfied');
    return;
  }

  const seen = { slugs: new Set(), urls: new Set() };
  const re3dataQuota = Math.min(3500, Math.ceil(need * 0.44));
  const re3data = await collectRe3data(re3dataQuota + 500);
  const normalized = [];
  const skipped = {};
  for (const c of re3data) {
    const n = normalizeCandidate(c, state, seen);
    if (n.reject) skipped[n.reject] = (skipped[n.reject] || 0) + 1;
    else normalized.push(n);
    if (normalized.length >= re3dataQuota) break;
  }
  console.log(`[normalize] after re3data=${normalized.length} skipped=${JSON.stringify(skipped)}`);

  const remaining = need - normalized.length;
  const continuedRunBoost = state.academicCount >= 10000 ? 15000 : 800;
  const biotools = await collectBiotools(Math.ceil(remaining * 4.5) + continuedRunBoost);
  for (const c of biotools) {
    const n = normalizeCandidate(c, state, seen);
    if (n.reject) skipped[n.reject] = (skipped[n.reject] || 0) + 1;
    else normalized.push(n);
    if (normalized.length >= need) break;
  }

  if (normalized.length < need) {
    const wikidataNeeded = need - normalized.length;
    const wikidata = await collectWikidata(Math.ceil(wikidataNeeded * 5) + 9000);
    for (const c of wikidata) {
      const n = normalizeCandidate(c, state, seen);
      if (n.reject) skipped[n.reject] = (skipped[n.reject] || 0) + 1;
      else normalized.push(n);
      if (normalized.length >= need) break;
    }
  }

  if (normalized.length < need) {
    const doajNeeded = need - normalized.length;
    const doaj = await collectDoaj(Math.ceil(doajNeeded * 3) + 3000);
    for (const c of doaj) {
      const n = normalizeCandidate(c, state, seen);
      if (n.reject) skipped[n.reject] = (skipped[n.reject] || 0) + 1;
      else normalized.push(n);
      if (normalized.length >= need) break;
    }
  }

  if (normalized.length < need) {
    throw new Error(`Not enough candidates: need=${need}, normalized=${normalized.length}`);
  }

  const startBatch = nextBatchNumber();
  const totalBatches = Math.ceil(need / BATCH_SIZE);
  console.log(`[build] startBatch=${startBatch} totalBatches=${totalBatches} candidates=${normalized.length}`);

  for (let i = 0; i < totalBatches; i += 1) {
    const batchNumber = startBatch + i;
    const batchCandidates = normalized.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    if (!batchCandidates.length) continue;
    const outDir = path.resolve(`feature-tools-academic-1000-batch-${batchNumber}`);
    if (fs.existsSync(outDir)) throw new Error(`${outDir} already exists; remove it or continue from the next batch`);
    const imgDir = path.join(outDir, 'images');
    ensureDir(imgDir);
    const tools = batchCandidates.map((candidate, j) => makeTool(candidate, TOPIC_BASE + (batchNumber * BATCH_SIZE) + j + 1, batchNumber));
    writeJSON(path.join(outDir, 'feature-tools.json'), tools);
    const report = {
      generated_at: COLLECTED_AT,
      batch: batchNumber,
      sources: ['https://www.re3data.org/api/beta/repositories', 'https://bio.tools/api/tool/', 'https://query.wikidata.org/', 'https://doaj.org/api/'],
      input: {
        target_total: TARGET_TOTAL,
        previous_academic_count: state.academicCount,
        batch_size: BATCH_SIZE,
        candidates_for_this_batch: batchCandidates.length,
      },
      output: {
        directory: path.basename(outDir),
        json: `${path.basename(outDir)}/feature-tools.json`,
      },
      skipped_summary: skipped,
      logos: [],
    };
    console.log(`[batch ${batchNumber}] writing ${tools.length} tools`);
    await writeLogosForBatch(tools, imgDir, report);
    const validation = validateBatch(outDir, tools);
    report.output.images = validation.imageCount;
    report.output.image_exts = validation.extCounts;
    report.output.max_image_bytes = validation.maxImageBytes;
    const realLogos = report.logos.filter((x) => x.type.startsWith('real')).length;
    report.output.real_logos = realLogos;
    report.output.functional_logos = report.logos.length - realLogos;
    writeJSON(path.join(outDir, '_crawl-report.json'), report);
    fs.writeFileSync(path.join(outDir, 'README.txt'), [
      `Scholay academic feature tools batch ${batchNumber}`,
      '',
      `Import zip: feature-tools-academic-1000-batch-${batchNumber}.zip`,
      'Structure: feature-tools.json + images/<slug>.(png/svg/ico/jpg/webp)',
      'Sources: re3data, bio.tools, Wikidata Query Service, and DOAJ.',
      `Generated at: ${COLLECTED_AT}`,
      '',
    ].join('\n'));
    const zipPath = zipBatch(outDir, `feature-tools-academic-1000-batch-${batchNumber}.zip`);
    report.output.zip = `${path.basename(outDir)}/${path.basename(zipPath)}`;
    writeJSON(path.join(outDir, '_crawl-report.json'), report);
    console.log(`[batch ${batchNumber}] done images=${validation.imageCount} real=${realLogos} zip=${zipPath}`);
  }

  const finalState = loadExistingState();
  console.log(`[done] academicCount=${finalState.academicCount}`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
