#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const PACK_ROOT = path.resolve(process.env.ACADEMIC_PACK_ROOT || path.join(ROOT, 'feature-tools-academic-5000'));
const AUDIT_ROOT = path.resolve(process.env.ACADEMIC_AUDIT_ROOT || path.join(ROOT, 'feature-tools-academic-audit'));
const FIX = process.argv.includes('--fix');
const ZIP = process.argv.includes('--zip');

const CATEGORY_TASK = {
  '统计 & 计量分析': '统计建模、计量分析、数据清洗和结果解释',
  '化学 · 材料 · 光谱': '化学数据查询、材料信息整理、分子与光谱分析',
  '生物信息 & 生命科学': '生物信息分析、组学数据处理、序列检索和实验结果整理',
  '数学 & 数值计算': '数学计算、数值分析、算法验证和科研教学',
  '绘图 · 可视化 · 数字化': '数据可视化、图表制作、空间数据处理和结果展示',
  '工程 · 仿真 · CAD/EDA': '工程建模、仿真分析、CAD/EDA 和计算流程管理',
  '文献管理 & 阅读/PDF': '文献检索、论文阅读、资料归档和引用整理',
  '学术写作 · LaTeX · 查重': '论文写作、LaTeX 排版、可重复报告和投稿准备',
  '期刊评价 & 投稿': '期刊筛选、投稿信息核对、引文指标和科研影响力分析',
  '医药参考 & 考试': '医学资料查询、临床研究参考、生物医学数据整理和循证资料检索',
  '通用工具 · 效率 · 系统': '科研数据管理、开放科学、团队协作和日常研究效率提升',
};

const CODE_HOSTS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'sourceforge.net',
]);

const PACKAGE_HOSTS = new Set([
  'pypi.org',
  'cran.r-project.org',
  'bioconductor.org',
  'npmjs.com',
  'anaconda.org',
  'rubygems.org',
  'packagist.org',
  'metacpan.org',
  'mvnrepository.com',
]);

const DATA_HOSTS = new Set([
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
]);

const SOURCE_LABELS = [
  [/(\.|^)bio\.tools$/i, 'bio.tools 条目'],
  [/(\.|^)re3data\.org$/i, 're3data 条目'],
  [/(\.|^)wikidata\.org$/i, 'Wikidata 条目'],
  [/(\.|^)doaj\.org$/i, 'DOAJ 条目'],
];

const GENERIC_TAGS = new Set([
  '科研软件',
  '在线应用',
  '数据库门户',
  'Web application',
  'Database portal',
  '命令行工具',
  'Web API',
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
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

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    u.hash = '';
    u.search = '';
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch {
    return String(url || '');
  }
}

function uniq(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value) continue;
    const key = String(value).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function slugTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/%[0-9a-f]{2}/gi, ' ')
    .replace(/[_./-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !['the', 'and', 'for', 'with', 'tool', 'tools', 'software', 'package', 'code'].includes(token));
}

function compact(value) {
  return slugTokens(value).join('');
}

function closeName(name, project) {
  const n = compact(name);
  const p = compact(project);
  if (!n || !p) return false;
  if (n.includes(p) || p.includes(n)) return true;
  const nt = new Set(slugTokens(name));
  const pt = new Set(slugTokens(project));
  const hit = [...pt].filter((token) => nt.has(token)).length;
  return hit > 0 && hit / Math.max(pt.size, 1) >= 0.5;
}

function githubInfo(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'github.com') return null;
    const seg = u.pathname.split('/').filter(Boolean);
    if (seg.length < 2) return null;
    return {
      owner: seg[0],
      repo: seg[1].replace(/\.git$/i, ''),
      seg,
      canonical: `https://github.com/${seg[0]}/${seg[1].replace(/\.git$/i, '')}`,
    };
  } catch {
    return null;
  }
}

function gitlabLikeInfo(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const seg = u.pathname.split('/').filter(Boolean);
    const cut = seg.indexOf('-');
    if (!host.includes('git') && cut < 0) return null;
    if (cut < 1) return null;
    const repoPath = seg.slice(0, cut);
    return {
      host,
      repo: repoPath.at(-1) || '',
      seg,
      canonical: `${u.protocol}//${u.hostname}/${repoPath.join('/')}`,
    };
  } catch {
    return null;
  }
}

function sourceforgeInfo(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'sourceforge.net') return null;
    const seg = u.pathname.split('/').filter(Boolean);
    if (seg[0] === 'projects' && seg[1]) {
      return { project: seg[1], seg, canonical: `https://sourceforge.net/projects/${seg[1]}/` };
    }
    if (seg[0] === 'p' && seg[1]) {
      return { project: seg[1], seg, canonical: `https://sourceforge.net/projects/${seg[1]}/` };
    }
    return { project: '', seg, canonical: 'https://sourceforge.net/' };
  } catch {
    return null;
  }
}

function isPackagePage(url) {
  const host = hostOf(url);
  const p = pathOf(url).toLowerCase();
  if (host === 'pypi.org') return /^\/project\/[^/]+/.test(p);
  if (host === 'cran.r-project.org') return /\/web\/packages\/[^/]+/.test(p) || /\/package=/.test(String(url).toLowerCase());
  if (host === 'bioconductor.org') return /\/packages\/.*\/html\/[^/]+\.html/.test(p);
  if (host === 'npmjs.com') return /^\/package\/[^/]+/.test(p);
  if (host === 'anaconda.org') return p.split('/').filter(Boolean).length >= 2;
  if (['rubygems.org', 'packagist.org', 'metacpan.org', 'mvnrepository.com'].includes(host)) return p.split('/').filter(Boolean).length >= 1;
  return false;
}

function isDataRecordPage(url) {
  const host = hostOf(url);
  const p = pathOf(url).toLowerCase();
  if (!DATA_HOSTS.has(host) && !host.endsWith('.figshare.com')) return false;
  if (p === '' || p === '/') return false;
  if (host === 'osf.io' && /^\/preprints\/?[^/]*\/?$/.test(p)) return false;
  if (/\/(record|records|articles|datasets?|dataset\.xhtml|stash\/dataset|catalog\/item|studies|openicpsr\/project|explore\/dataset)\b/.test(p)) return true;
  if (host === 'figshare.com' && /^\/articles\//.test(p)) return true;
  if (host.endsWith('.figshare.com') && /^\/articles\//.test(p)) return true;
  if (host === 'zenodo.org' && /^\/communities\//.test(p)) return 'review';
  if (host === 'osf.io' && /^\/[a-z0-9]{4,8}\/?$/.test(p)) return true;
  return false;
}

function looksLikeSingleDataset(tool) {
  const name = String(tool.name || '');
  if (/\b(data\s*set|dataset|replication package|supplementary data|data and code)\b/i.test(name)) return true;
  if (/^data for\b/i.test(name)) return true;
  return false;
}

function looksLikePaperCode(tool) {
  const name = String(tool.name || '');
  return /\b(machine learning code to|code to|source code for|analysis scripts? for|scripts? to|notebook to|replication code|software and data for)\b/i.test(name);
}

function sourceName(tool) {
  const sourceUrl = tool.source_url || tool.source?.url || '';
  const sourceHost = hostOf(sourceUrl);
  if (sourceHost === 'bio.tools') return 'bio.tools';
  if (sourceHost === 're3data.org') return 're3data';
  if (sourceHost === 'doaj.org') return 'doaj';
  if (sourceHost === 'wikidata.org') return 'wikidata';
  if (sourceHost === 'openalex.org') return 'openalex';
  if ((tool.data_quality?.sources || []).some((u) => hostOf(u) === 'wikidata.org')) return 'wikidata';
  if (typeof tool.source === 'string') return tool.source;
  return 'other';
}

function classifyIndependence(tool) {
  const url = tool.official_url || tool.access?.official_url || tool.source_url || tool.source?.url || '';
  const host = hostOf(url);
  const p = pathOf(url).toLowerCase();
  const reasons = [];
  let decision = 'keep';
  let suggested_url = '';

  const dataRecord = isDataRecordPage(url);
  if (dataRecord === true) {
    return { decision: 'remove', reasons: ['single_data_record_page'], suggested_url };
  }
  if (dataRecord === 'review') {
    decision = 'review';
    reasons.push('repository_community_page');
  }

  if (isPackagePage(url)) {
    return { decision: 'remove', reasons: ['single_package_registry_page'], suggested_url };
  }

  if (looksLikeSingleDataset(tool) && !['re3data'].includes(sourceName(tool))) {
    return { decision: 'remove', reasons: ['single_dataset_resource'], suggested_url };
  }

  if (looksLikePaperCode(tool)) {
    return { decision: 'remove', reasons: ['paper_code_or_notebook_not_tool'], suggested_url };
  }

  const gh = githubInfo(url);
  if (gh && gh.seg.length > 2) {
    suggested_url = gh.canonical;
    const section = gh.seg[2].toLowerCase();
    const subPathName = gh.seg.slice(3).join(' ');
    if (['wiki', 'tree', 'blob'].includes(section) && !closeName(tool.name, gh.repo)) {
      return {
        decision: closeName(tool.name, subPathName) ? 'remove' : 'review',
        reasons: ['repository_subpage_not_project'],
        suggested_url,
      };
    }
    return { decision: 'canonicalize', reasons: ['repository_url_points_to_subpage'], suggested_url };
  }

  const gl = gitlabLikeInfo(url);
  if (gl) {
    suggested_url = gl.canonical;
    if (!closeName(tool.name, gl.repo)) {
      return { decision: 'review', reasons: ['git_repository_subpage_name_mismatch'], suggested_url };
    }
    return { decision: 'canonicalize', reasons: ['git_repository_url_points_to_subpage'], suggested_url };
  }

  const sf = sourceforgeInfo(url);
  if (sf) {
    if (!sf.project) {
      return { decision: 'review', reasons: ['generic_hosting_platform'], suggested_url: '' };
    }
    suggested_url = sf.canonical;
    if (normalizeUrl(url) !== normalizeUrl(suggested_url)) {
      return { decision: 'canonicalize', reasons: ['sourceforge_project_url_can_be_canonicalized'], suggested_url };
    }
  }

  if (host === 'mathworks.com' && /\/matlabcentral\/fileexchange\//.test(p)) {
    return { decision: 'remove', reasons: ['marketplace_or_plugin_item'], suggested_url };
  }

  if (host === 'arxiv.org' && /^\/(abs|pdf)\//.test(p)) {
    return { decision: 'remove', reasons: ['single_article_or_preprint_page'], suggested_url: 'https://arxiv.org/' };
  }

  if (host === 'doaj.org' && /^\/doaj\b/.test(p)) {
    return { decision: 'remove', reasons: ['search_or_directory_query_page'], suggested_url: 'https://doaj.org/' };
  }

  if (/\/(docs?|documentation|manual|help|download|downloads|wiki)(\/|$)/.test(p) && !CODE_HOSTS.has(host)) {
    decision = decision === 'keep' ? 'review' : decision;
    reasons.push('documentation_or_download_page');
  }

  if (PACKAGE_HOSTS.has(host) && p !== '' && p !== '/') {
    decision = decision === 'keep' ? 'review' : decision;
    reasons.push('package_or_registry_path');
  }

  return { decision, reasons, suggested_url };
}

function labelForUrl(url) {
  const host = hostOf(url);
  const p = pathOf(url);
  if (host === 'openalex.org' && /^\/S\d+/i.test(p)) return 'OpenAlex 条目';
  for (const [pattern, label] of SOURCE_LABELS) {
    if (pattern.test(host)) return label;
  }
  if (CODE_HOSTS.has(host)) return '代码仓库/项目页';
  if (PACKAGE_HOSTS.has(host)) return '软件包页面';
  if (DATA_HOSTS.has(host) || host.endsWith('.figshare.com')) return '数据仓库/资源入口';
  return '官网/工具入口';
}

function expectedResources(tool) {
  const official = tool.official_url || tool.access?.official_url || '';
  const canonicalResourceUrl = (url) => {
    if (!url) return url;
    const gh = githubInfo(url);
    if (gh && normalizeUrl(gh.canonical) === normalizeUrl(official)) return official;
    const gl = gitlabLikeInfo(url);
    if (gl && normalizeUrl(gl.canonical) === normalizeUrl(official)) return official;
    const sf = sourceforgeInfo(url);
    if (sf?.project && normalizeUrl(sf.canonical) === normalizeUrl(official)) return official;
    return url;
  };
  const urls = uniq([
    tool.official_url,
    tool.access?.official_url,
    ...(tool.access?.resources || []).map((r) => r.url),
    tool.source_url,
  ].map(canonicalResourceUrl));
  return urls.map((url) => ({ label: labelForUrl(url), url }));
}

function resourceLabelsNeedFix(tool) {
  const resources = tool.access?.resources || [];
  return resources.some((resource) => resource.label !== labelForUrl(resource.url));
}

function isCodeProject(tool) {
  const url = tool.official_url || tool.access?.official_url || '';
  const host = hostOf(url);
  return CODE_HOSTS.has(host) && !isPackagePage(url);
}

function badTagline(tool) {
  const value = String(tool.tagline || '').trim();
  if (value.length < 12) return true;
  if (/[.。…]{3,}$/.test(value) || /…$/.test(value)) return true;
  if (/^(n\/a|none|null|no description|not available)$/i.test(value)) return true;
  return false;
}

function focusTags(tool, fallbackCount = 3) {
  const category = tool.category_label || '学术研究';
  const raw = Array.isArray(tool.tags) ? tool.tags : [];
  const tags = raw.filter((tag) => tag && tag !== category && !GENERIC_TAGS.has(tag)).slice(0, fallbackCount);
  return tags.length ? tags : raw.filter(Boolean).slice(0, fallbackCount);
}

function isDoajJournal(tool) {
  return sourceName(tool) === 'doaj' || hostOf(tool.source_url || '') === 'doaj.org';
}

function isDataRepository(tool) {
  return sourceName(tool) === 're3data' || DATA_HOSTS.has(hostOf(tool.official_url || ''));
}

function inferKind(tool) {
  if (isPackagePage(tool.official_url || '')) return '软件包页面';
  if (isDoajJournal(tool)) return '开放获取期刊网站';
  if (isDataRepository(tool)) return '研究数据仓库或数据平台';
  if (isCodeProject(tool) || tool.access_type === 'download' || tool.access?.type === 'download') return '科研软件项目';
  if ((tool.category_label || '').includes('期刊')) return '期刊检索与投稿信息资源';
  return '在线科研资源';
}

function enrichTags(tool) {
  const tags = Array.isArray(tool.tags) ? [...tool.tags] : [];
  if (isDoajJournal(tool)) tags.push('开放获取期刊', '投稿信息', '论文访问');
  else if (isDataRepository(tool)) tags.push('数据仓库', '数据引用', '数据复用');
  else if (isCodeProject(tool)) tags.push('科研软件', '代码仓库', '软件文档');
  else tags.push('学术资源', '研究工具');
  if (tool.category_label) tags.push(tool.category_label);
  return uniq(tags).slice(0, 6);
}

function fallbackTagline(tool) {
  const category = tool.category_label || '学术研究';
  const task = CATEGORY_TASK[category] || '科研学习、数据处理和成果整理';
  const focus = focusTags(tool).join('、') || category;
  if (isDoajJournal(tool)) return `开放获取期刊主页，可用于论文浏览、投稿信息核对和引用追踪`;
  if (isDataRepository(tool)) return `研究数据仓库入口，可用于数据发现、引用、下载和复用`;
  if (isCodeProject(tool) || tool.access_type === 'download' || tool.access?.type === 'download') {
    return `面向${category}的科研软件项目，可用于${focus}相关的${task}`;
  }
  return `面向${category}的学术网站/工具入口，可用于${task}`;
}

function buildDescription(tool) {
  const category = tool.category_label || '学术研究';
  const kind = inferKind(tool);
  const task = CATEGORY_TASK[category] || '科研学习、数据处理和成果整理';
  const tags = focusTags(tool, 4);
  const focus = tags.length ? tags.join('、') : category;
  return `${tool.name} 是一个面向「${category}」的${kind}，适合用于${task}。它重点覆盖「${focus}」等方向；使用前建议通过官网或项目页确认文档、版本、访问条件、许可证/价格、引用方式和数据使用条款，再将结果纳入论文、报告、课程、数据分析、实验记录或团队复现流程。`;
}

function textIssues(tool) {
  const issues = [];
  const tags = Array.isArray(tool.tags) ? tool.tags : [];
  const features = Array.isArray(tool.spec?.key_features) ? tool.spec.key_features : [];
  if (resourceLabelsNeedFix(tool)) issues.push('resource_label_mismatch');
  if (badTagline(tool)) issues.push('short_or_incomplete_tagline');
  if (tags.length < 2) issues.push('few_tags');
  if (features.length < 2) issues.push('few_key_features');
  if (isCodeProject(tool) && (tool.access_type === 'website' || tool.access?.type === 'website')) issues.push('code_repo_marked_as_website');
  if (isPackagePage(tool.official_url || '')) issues.push('single_package_registry_text');
  if (/在线工具|在线科研资源/.test(tool.description_md || '') && isCodeProject(tool)) issues.push('code_repo_described_as_online_resource');
  return issues;
}

function applyCanonicalUrl(tool, nextUrl) {
  const oldUrls = uniq([tool.official_url, tool.access?.official_url]);
  tool.official_url = nextUrl;
  if (tool.access) tool.access.official_url = nextUrl;
  if (Array.isArray(tool.access?.resources)) {
    for (const resource of tool.access.resources) {
      if (oldUrls.includes(resource.url)) resource.url = nextUrl;
    }
  }
  if (tool.vendor) tool.vendor.homepage = nextUrl;
  if (tool.source && oldUrls.includes(tool.source.url)) tool.source.url = nextUrl;
  if (oldUrls.includes(tool.source_url)) tool.source_url = nextUrl;
  if (tool.access?.download && oldUrls.includes(tool.access.download.url)) {
    tool.access.download.url = nextUrl;
  }
  if (tool.data_quality) {
    tool.data_quality.sources = uniq([...(tool.data_quality.sources || []), nextUrl]);
  }
}

function applySafeFixes(tool, review) {
  const changed = [];

  if (review.decision === 'canonicalize' && review.suggested_url) {
    applyCanonicalUrl(tool, review.suggested_url);
    changed.push('canonicalized_url');
  }

  if (!tool.access) tool.access = {};
  tool.access.official_url = tool.official_url || tool.access.official_url || tool.source_url || tool.source?.url || '';
  tool.access.resources = expectedResources(tool);
  changed.push('normalized_resource_labels');

  if (isCodeProject(tool)) {
    if (tool.access_type !== 'download') changed.push('code_repo_access_type');
    tool.access_type = 'download';
    tool.access.type = 'download';
    tool.platforms = uniq([...(tool.platforms || []), 'windows', 'mac', 'linux', 'cross']);
    tool.access.download = {
      provider: 'official',
      url: tool.official_url,
      extract_code: '',
      filename: '',
      gated: false,
    };
  }

  const needsTagFix = !Array.isArray(tool.tags) || tool.tags.length < 2 || !Array.isArray(tool.spec?.key_features) || tool.spec.key_features.length < 2;
  if (needsTagFix) {
    tool.tags = enrichTags(tool);
    if (!tool.spec) tool.spec = {};
    tool.spec.key_features = tool.tags;
    changed.push('enriched_tags');
  }

  if (badTagline(tool)) {
    tool.tagline = fallbackTagline(tool);
    if (!tool.spec) tool.spec = {};
    tool.spec.core_use = tool.tagline;
    changed.push('rewrote_tagline');
  }

  if (textIssues(tool).some((issue) => ['code_repo_described_as_online_resource', 'short_or_incomplete_tagline', 'few_tags', 'few_key_features'].includes(issue))) {
    tool.description_md = buildDescription(tool);
    changed.push('rewrote_description');
  }

  if (tool.spec && Array.isArray(tool.tags) && (!Array.isArray(tool.spec.key_features) || tool.spec.key_features.length < 2)) {
    tool.spec.key_features = tool.tags;
  }

  return uniq(changed);
}

function csvValue(value) {
  const s = Array.isArray(value) ? value.join(';') : String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, keys) {
  return [
    keys.join(','),
    ...rows.map((row) => keys.map((key) => csvValue(row[key])).join(',')),
  ].join('\n');
}

function auditAll() {
  fs.mkdirSync(AUDIT_ROOT, { recursive: true });
  const batchDirs = fs.readdirSync(PACK_ROOT)
    .filter((name) => /^feature-tools-academic-(?:5000|1000)-batch-\d+$/.test(name))
    .sort();

  const independence = [];
  const text = [];
  const sourceCounts = {};
  const decisionCounts = {};
  const textIssueCounts = {};
  const fixCounts = {};
  let total = 0;

  for (const dir of batchDirs) {
    const jsonPath = path.join(PACK_ROOT, dir, 'feature-tools.json');
    const tools = readJson(jsonPath);
    let dirty = false;

    tools.forEach((tool, index) => {
      total += 1;
      const source = sourceName(tool);
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      const beforeReview = classifyIndependence(tool);
      let fixes = [];
      if (FIX) {
        fixes = applySafeFixes(tool, beforeReview);
        if (fixes.length) dirty = true;
        for (const fix of fixes) fixCounts[fix] = (fixCounts[fix] || 0) + 1;
      }
      const review = classifyIndependence(tool);
      decisionCounts[review.decision] = (decisionCounts[review.decision] || 0) + 1;
      const tIssues = textIssues(tool);
      for (const issue of tIssues) textIssueCounts[issue] = (textIssueCounts[issue] || 0) + 1;

      const base = {
        dir,
        index,
        id: tool.id,
        slug: tool.slug,
        name: tool.name,
        source,
        category_label: tool.category_label,
        host: hostOf(tool.official_url || tool.access?.official_url || tool.source_url || tool.source?.url || ''),
        url: tool.official_url || tool.access?.official_url || tool.source_url || tool.source?.url || '',
      };

      if (review.decision !== 'keep') {
        independence.push({
          ...base,
          decision: review.decision,
          reasons: review.reasons,
          suggested_url: review.suggested_url,
        });
      }

      if (tIssues.length) {
        text.push({
          ...base,
          text_issues: tIssues,
          tagline_len: String(tool.tagline || '').length,
          description_len: String(tool.description_md || '').length,
          tag_count: Array.isArray(tool.tags) ? tool.tags.length : 0,
        });
      }
    });

    if (FIX && dirty) {
      writeJson(jsonPath, tools);
      if (ZIP) {
        const zipName = `${dir}.zip`;
        const zipPath = path.join(PACK_ROOT, zipName);
        const result = spawnSync('zip', ['-qr', zipPath, 'feature-tools.json', 'images', '_merge-report.json', 'README.txt'], {
          cwd: path.join(PACK_ROOT, dir),
          stdio: 'pipe',
        });
        if (result.status !== 0) {
          throw new Error(`zip failed for ${dir}: ${result.stderr.toString()}`);
        }
      }
    }
  }

  const summary = {
    total,
    fixed: FIX,
    zipped: ZIP,
    source_counts: sourceCounts,
    independence_decisions: decisionCounts,
    independence_issue_count: independence.length,
    text_issue_counts: textIssueCounts,
    text_issue_count: text.length,
    safe_fix_counts: fixCounts,
    generated_at: new Date().toISOString(),
  };

  writeJson(path.join(AUDIT_ROOT, '5000-reviewed-summary.json'), summary);
  writeJson(path.join(AUDIT_ROOT, '5000-reviewed-independence.json'), independence);
  writeJson(path.join(AUDIT_ROOT, '5000-reviewed-text-issues.json'), text);

  const independenceKeys = ['dir', 'index', 'id', 'slug', 'name', 'source', 'category_label', 'host', 'url', 'decision', 'reasons', 'suggested_url'];
  fs.writeFileSync(path.join(AUDIT_ROOT, '5000-reviewed-independence.csv'), `${toCsv(independence, independenceKeys)}\n`);
  const textKeys = ['dir', 'index', 'id', 'slug', 'name', 'source', 'category_label', 'host', 'url', 'text_issues', 'tagline_len', 'description_len', 'tag_count'];
  fs.writeFileSync(path.join(AUDIT_ROOT, '5000-reviewed-text-issues.csv'), `${toCsv(text, textKeys)}\n`);

  console.log(JSON.stringify(summary, null, 2));
}

auditAll();
