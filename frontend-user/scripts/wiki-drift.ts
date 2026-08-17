import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WIKI_ARTICLES } from "../src/features/wiki/content";
import {
  MOCK_SURFACE_COVERAGE,
  type MockSurfaceCoverageEntry,
} from "../src/features/wiki/embeds/mock-surface-coverage";
import type { WikiArticle } from "../src/features/wiki/types";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../..");

export interface WikiDriftArticleHit {
  readonly slug: string;
  readonly title: string;
  readonly changedSources: readonly string[];
}

export interface WikiDriftFixtureHit {
  readonly key: string;
  readonly disposition: MockSurfaceCoverageEntry["disposition"];
  readonly fixtureIds: readonly string[];
  readonly changedSources: readonly string[];
  readonly verifiedAt?: string;
  readonly stale: boolean;
}

export interface WikiDriftReport {
  readonly range: string;
  readonly targetDate: string;
  readonly changedPaths: readonly string[];
  readonly articleHits: readonly WikiDriftArticleHit[];
  readonly fixtureHits: readonly WikiDriftFixtureHit[];
  readonly unmatchedPaths: readonly string[];
}

export function sourceDeclarationMatchesPath(
  declaration: string,
  changedPath: string,
) {
  const source = declaration.replace(/^\.\//, "").replace(/\/$/, "");
  const changed = changedPath.replace(/^\.\//, "").replace(/\/$/, "");
  return (
    source === changed ||
    changed.startsWith(`${source}/`) ||
    source.startsWith(`${changed}/`)
  );
}

export function fixtureVerificationIsStale(
  verifiedAt: string | undefined,
  targetDate: string,
) {
  if (!verifiedAt) return false;
  return verifiedAt < targetDate;
}

function parseChangedPaths(output: string) {
  const paths = new Set<string>();
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    const [status, ...names] = line.split("\t");
    if (!status || names.length === 0) continue;
    // Rename/copy 同时保留旧、新路径，确保两侧 source declaration 都能命中。
    for (const name of names) if (name) paths.add(name);
  }
  return [...paths].sort();
}

function changedDeclarations(
  declarations: readonly string[],
  changedPaths: readonly string[],
) {
  return declarations.filter((declaration) =>
    changedPaths.some((changedPath) =>
      sourceDeclarationMatchesPath(declaration, changedPath),
    ),
  );
}

export function buildWikiDriftReport(
  range: string,
  targetDate: string,
  changedPaths: readonly string[],
  articles: readonly WikiArticle[] = WIKI_ARTICLES,
  coverage: readonly MockSurfaceCoverageEntry[] = MOCK_SURFACE_COVERAGE,
): WikiDriftReport {
  const matchedPaths = new Set<string>();
  const markMatched = (sources: readonly string[]) => {
    for (const changedPath of changedPaths) {
      if (
        sources.some((source) =>
          sourceDeclarationMatchesPath(source, changedPath),
        )
      ) {
        matchedPaths.add(changedPath);
      }
    }
  };

  const articleHits = articles
    .map((article) => {
      const sources = changedDeclarations(article.sourcePaths, changedPaths);
      if (sources.length === 0) return undefined;
      markMatched(sources);
      return {
        slug: article.slug,
        title: article.title,
        changedSources: sources,
      } satisfies WikiDriftArticleHit;
    })
    .filter((hit): hit is WikiDriftArticleHit => Boolean(hit))
    .sort((left, right) => left.slug.localeCompare(right.slug));

  const fixtureHits = coverage
    .map((entry) => {
      const sources = changedDeclarations(entry.mockSourcePaths, changedPaths);
      if (sources.length === 0) return undefined;
      markMatched(sources);
      const verifiedAt =
        entry.disposition === "excluded" ? undefined : entry.verifiedAt;
      return {
        key: entry.key,
        disposition: entry.disposition,
        fixtureIds: entry.fixtureIds,
        changedSources: sources,
        verifiedAt,
        stale:
          entry.disposition === "excluded"
            ? false
            : fixtureVerificationIsStale(verifiedAt, targetDate),
      } satisfies WikiDriftFixtureHit;
    })
    .filter((hit): hit is WikiDriftFixtureHit => Boolean(hit))
    .sort((left, right) => left.key.localeCompare(right.key));

  return {
    range,
    targetDate,
    changedPaths: [...changedPaths].sort(),
    articleHits,
    fixtureHits,
    unmatchedPaths: changedPaths
      .filter((changedPath) => !matchedPaths.has(changedPath))
      .sort(),
  };
}

function targetRefFromRange(range: string) {
  const match = range.match(/^(.+?)\.\.\.?(.+)$/);
  if (!match?.[2]) {
    throw new Error("请传入 git range，例如 mock2~1..mock2");
  }
  return match[2];
}

function gitOutput(args: readonly string[]) {
  return execFileSync("git", [...args], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function readReport(range: string) {
  gitOutput(["rev-parse", "--verify", `${targetRefFromRange(range)}^{commit}`]);
  const targetDate = gitOutput([
    "show",
    "-s",
    "--format=%cs",
    targetRefFromRange(range),
  ]);
  const changedPaths = parseChangedPaths(
    gitOutput(["diff", "--name-status", "-M", range, "--"]),
  );
  return buildWikiDriftReport(range, targetDate, changedPaths);
}

function printReport(report: WikiDriftReport) {
  console.log(
    `Wiki drift ${report.range}（目标日期 ${report.targetDate}，${report.changedPaths.length} 个变更路径）`,
  );
  console.log(`\n需复核词条（${report.articleHits.length}）`);
  if (report.articleHits.length === 0) console.log("- 无 sourcePaths 命中");
  for (const hit of report.articleHits) {
    console.log(`- ${hit.slug}｜${hit.title}`);
    for (const source of hit.changedSources) console.log(`  - ${source}`);
  }

  console.log(`\n需复核 fixture（${report.fixtureHits.length}）`);
  if (report.fixtureHits.length === 0) console.log("- 无 mockSourcePaths 命中");
  for (const hit of report.fixtureHits) {
    const state =
      hit.disposition === "excluded"
        ? "排除项需复核"
        : hit.stale
          ? `过期（上次核对 ${hit.verifiedAt}）`
          : `已核到目标日（${hit.verifiedAt}）`;
    const fixtures =
      hit.fixtureIds.length > 0
        ? `；fixture: ${hit.fixtureIds.join(", ")}`
        : "";
    console.log(`- ${hit.key}｜${state}${fixtures}`);
    for (const source of hit.changedSources) console.log(`  - ${source}`);
  }

  console.log(
    `\n未被 Wiki 声明命中的变更路径（${report.unmatchedPaths.length}）`,
  );
  if (report.unmatchedPaths.length === 0) console.log("- 无");
  else
    console.log(
      "- 使用 --json 查看完整列表（普通输出不展开，避免淹没复核清单）",
    );
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const positional = args.filter((arg) => arg !== "--json");
  if (positional.length !== 1) {
    throw new Error("用法：npm run wiki:drift -- <old>..<new> [--json]");
  }
  const report = readReport(positional[0]);
  if (json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
}

main();
