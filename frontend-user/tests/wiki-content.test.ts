import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WIKI_ARTICLE_BY_SLUG,
  WIKI_ARTICLES,
  WIKI_CATEGORIES,
} from '../src/features/wiki/content';

const repoRoot = path.resolve(process.cwd(), '..');

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(target) : [target];
  });
}

function wikiCorpus(): string {
  return WIKI_ARTICLES.flatMap((article) => [
    article.slug,
    article.title,
    article.summary,
    article.category,
    article.kind,
    article.status,
    ...article.audience,
    ...(article.aliases ?? []),
    ...article.sourcePaths,
    ...article.sections.flatMap((section) => [section.id, section.title, section.markdown]),
  ]).join('\n').toLocaleLowerCase('zh-CN');
}

describe('Scholay Wiki 内容契约', () => {
  it('词条 slug、标题与章节标识唯一', () => {
    expect(new Set(WIKI_ARTICLES.map((article) => article.slug)).size).toBe(WIKI_ARTICLES.length);
    expect(new Set(WIKI_ARTICLES.map((article) => article.title)).size).toBe(WIKI_ARTICLES.length);

    for (const article of WIKI_ARTICLES) {
      expect(article.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(new Set(article.sections.map((section) => section.id)).size).toBe(article.sections.length);
    }
  });

  it('不存在无正文或无来源的占位词条', () => {
    expect(WIKI_ARTICLES.length).toBeGreaterThanOrEqual(100);
    for (const article of WIKI_ARTICLES) {
      expect(article.summary.trim().length, article.slug).toBeGreaterThan(20);
      expect(article.sections.length, article.slug).toBeGreaterThan(0);
      expect(article.sourcePaths.length, article.slug).toBeGreaterThan(0);
      for (const section of article.sections) {
        expect(section.title.trim().length, `${article.slug}/${section.id}`).toBeGreaterThan(0);
        expect(section.markdown.trim().length, `${article.slug}/${section.id}`).toBeGreaterThan(40);
      }
    }
  });

  it('所有来源路径都存在于当前代码基线', () => {
    for (const article of WIKI_ARTICLES) {
      for (const sourcePath of article.sourcePaths) {
        expect(existsSync(path.resolve(repoRoot, sourcePath)), `${article.slug}: ${sourcePath}`).toBe(true);
      }
    }
  });

  it('所有相关词条都能解析', () => {
    for (const article of WIKI_ARTICLES) {
      for (const related of article.related ?? []) {
        expect(WIKI_ARTICLE_BY_SLUG.has(related), `${article.slug} -> ${related}`).toBe(true);
      }
    }
  });

  it('每个顶层分类至少有一个已核对词条', () => {
    for (const category of WIKI_CATEGORIES) {
      expect(
        WIKI_ARTICLES.some((article) => article.category === category.slug),
        category.slug,
      ).toBe(true);
    }
  });

  it('覆盖全部 56 个后端一级业务模块', () => {
    const internalRoot = path.join(repoRoot, 'backend/internal');
    const modules = readdirSync(internalRoot)
      .filter((name) => statSync(path.join(internalRoot, name)).isDirectory())
      .sort();
    const corpus = wikiCorpus();

    expect(modules).toHaveLength(56);
    for (const module of modules) {
      expect(corpus, `backend/internal/${module}`).toContain(`backend/internal/${module}`);
    }
  });

  it('覆盖小程序全部页面与 Agent 全部 feature', () => {
    const appConfig = JSON.parse(
      readFileSync(path.join(repoRoot, 'miniprogram/app.json'), 'utf8'),
    ) as { pages: string[] };
    const corpus = wikiCorpus();

    expect(appConfig.pages).toHaveLength(15);
    for (const page of appConfig.pages) {
      expect(corpus, page).toContain(page.toLowerCase());
    }

    for (const feature of [
      'smart_search',
      'claw',
      'prism',
      'peerreview',
      'boltslides',
      'sci_draw',
      'stat_lab',
    ]) {
      expect(corpus, feature).toContain(feature);
    }
  });

  it('Agent 的 109 个技能名称全部可检索', () => {
    const skillFiles = walkFiles(path.join(repoRoot, 'agent-skills'))
      .filter((file) => path.basename(file) === 'SKILL.md')
      .sort();
    const corpus = wikiCorpus();

    expect(skillFiles).toHaveLength(109);
    for (const skillFile of skillFiles) {
      const skillName = path.basename(path.dirname(skillFile)).toLowerCase();
      expect(corpus, path.relative(repoRoot, skillFile)).toContain(skillName);
    }
  });

  it('迁移与功能广场数据计数和当前基线一致', () => {
    const migrations = readdirSync(path.join(repoRoot, 'docker/mysql/migrations'))
      .filter((name) => name.endsWith('.sql'));
    const tools = JSON.parse(
      readFileSync(path.join(repoRoot, 'feature-tools-coldstart/feature-tools.json'), 'utf8'),
    ) as unknown[];

    expect(migrations).toHaveLength(128);
    expect(tools).toHaveLength(201);
    expect(wikiCorpus()).toContain('chemcad52cracked');
  });

  it('每个非 Wiki 路由的懒加载页面都有词条直接引用', () => {
    const routeFiles = [
      path.join(repoRoot, 'frontend-user/src/app/router.tsx'),
      ...walkFiles(path.join(repoRoot, 'frontend-user/src/features'))
        .filter((file) => file.endsWith('/routes.tsx') && !file.includes('/features/wiki/')),
    ];
    const targets = new Set<string>();

    for (const routeFile of routeFiles) {
      const source = readFileSync(routeFile, 'utf8');
      for (const match of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const specifier = match[1];
        const unresolved = specifier.startsWith('@/')
          ? path.join(repoRoot, 'frontend-user/src', specifier.slice(2))
          : path.resolve(path.dirname(routeFile), specifier);
        const resolved = [
          unresolved,
          `${unresolved}.tsx`,
          `${unresolved}.ts`,
          path.join(unresolved, 'index.tsx'),
          path.join(unresolved, 'index.ts'),
        ].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
        if (resolved) targets.add(path.relative(repoRoot, resolved));
      }
    }

    const citedSources = new Set(WIKI_ARTICLES.flatMap((article) => article.sourcePaths));
    expect(targets).toHaveLength(110);
    for (const target of targets) {
      expect(citedSources.has(target), target).toBe(true);
    }
  });
});
