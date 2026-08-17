import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidElement } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import { adminRoutes } from "../src/features/admin/routes";
import {
  authMobileRoutes,
  authRoutes,
  wechatCallbackRoutes,
} from "../src/features/auth/routes";
import { browserRoutes } from "../src/features/browser/routes";
import { citationRoutes } from "../src/features/citation/routes";
import {
  clawEmbedRoutes,
  clawMobileRoutes,
  clawRoutes,
} from "../src/features/claw/routes";
import { helpRoutes } from "../src/features/help/routes";
import { journalsRoutes } from "../src/features/journals/routes";
import { landingRoutes } from "../src/features/landing/routes";
import {
  adminLegacyRedirectRoutes,
  legacyRedirectRoutes,
} from "../src/features/legacy-redirects/routes";
import {
  libraryMobileRoutes,
  libraryRoutes,
  shareReceiveRoutes,
} from "../src/features/library/routes";
import { mobileRoutes } from "../src/features/mobile/routes";
import { newsRoutes } from "../src/features/news/routes";
import { peerReviewRoutes } from "../src/features/peer-review/routes";
import { prismRoutes } from "../src/features/prism/routes";
import { searchRoutes } from "../src/features/search/routes";
import {
  settingsMobileRoutes,
  settingsRoutes,
} from "../src/features/settings/routes";
import { skillsRoutes } from "../src/features/skills/routes";
import { toolsMobileRoutes, toolsRoutes } from "../src/features/tools/routes";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_WIKI_REPO_ROOT = path.resolve(scriptDirectory, "../..");

export interface WikiBaselineCounts {
  readonly renderedRoutes: number;
  readonly redirectRoutes: number;
  readonly backendModules: number;
  readonly agentFeatures: number;
  readonly agentSkills: number;
  readonly miniProgramPages: number;
  readonly migrations: number;
  readonly coldStartTools: number;
}

export interface WikiBaselineScan extends WikiBaselineCounts {
  readonly renderedRoutePaths: readonly string[];
  readonly redirectRoutePaths: readonly string[];
  readonly backendModuleNames: readonly string[];
  readonly agentFeatureNames: readonly string[];
  readonly agentSkillPaths: readonly string[];
  readonly miniProgramPagePaths: readonly string[];
  readonly migrationPaths: readonly string[];
}

interface RouteGroup {
  readonly prefix: string;
  readonly routes: readonly RouteObject[];
  readonly forceRedirect?: boolean;
}

/**
 * app/router.tsx 的唯一职责是把这些 feature route arrays 拼到三个壳层。
 * Wiki 自身路由按基线定义排除；壳层只提供布局，不额外算作页面。
 */
const PRODUCT_ROUTE_GROUPS: readonly RouteGroup[] = [
  { prefix: "", routes: adminLegacyRedirectRoutes, forceRedirect: true },
  { prefix: "", routes: legacyRedirectRoutes, forceRedirect: true },
  { prefix: "", routes: adminRoutes },
  { prefix: "", routes: landingRoutes },
  { prefix: "", routes: helpRoutes },
  { prefix: "", routes: shareReceiveRoutes },
  { prefix: "", routes: clawEmbedRoutes },
  { prefix: "", routes: wechatCallbackRoutes },
  { prefix: "/m", routes: mobileRoutes },
  { prefix: "/m", routes: toolsMobileRoutes },
  { prefix: "/m", routes: clawMobileRoutes },
  { prefix: "/m", routes: libraryMobileRoutes },
  { prefix: "/m", routes: settingsMobileRoutes },
  { prefix: "/m", routes: authMobileRoutes },
  { prefix: "", routes: searchRoutes },
  { prefix: "", routes: journalsRoutes },
  { prefix: "", routes: libraryRoutes },
  { prefix: "", routes: browserRoutes },
  { prefix: "", routes: toolsRoutes },
  { prefix: "", routes: citationRoutes },
  { prefix: "", routes: peerReviewRoutes },
  { prefix: "", routes: prismRoutes },
  { prefix: "", routes: clawRoutes },
  { prefix: "", routes: skillsRoutes },
  { prefix: "", routes: newsRoutes },
  { prefix: "", routes: authRoutes },
  { prefix: "", routes: settingsRoutes },
] as const;

const APP_SHELL_LEAF_ROUTES: readonly RouteObject[] = [
  { index: true, element: "HomePage" },
  { path: "*", element: "NotFoundPage" },
];

function joinRoutePath(parentPath: string, childPath: string | undefined) {
  if (!childPath) return parentPath || "/";
  if (childPath.startsWith("/")) return normalizeRoutePath(childPath);
  return normalizeRoutePath(`${parentPath}/${childPath}`);
}

function normalizeRoutePath(value: string) {
  const normalized = value.replace(/\/{2,}/g, "/");
  if (!normalized || normalized === "/") return "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function isNavigateElement(route: RouteObject) {
  return isValidElement(route.element) && route.element.type === Navigate;
}

function isRedirectLeaf(route: RouteObject, forceRedirect: boolean) {
  if (forceRedirect || isNavigateElement(route)) return true;
  const hasRenderable = Boolean(route.element || route.Component || route.lazy);
  return !hasRenderable && typeof route.loader === "function";
}

function collectLeafRoutes(
  routes: readonly RouteObject[],
  parentPath: string,
  rendered: Set<string>,
  redirects: Set<string>,
  forceRedirect = false,
) {
  for (const route of routes) {
    const routePath = route.index
      ? parentPath || "/"
      : joinRoutePath(parentPath, route.path);
    if (route.children?.length) {
      collectLeafRoutes(
        route.children,
        routePath,
        rendered,
        redirects,
        forceRedirect,
      );
      continue;
    }
    const target = normalizeRoutePath(routePath);
    if (isRedirectLeaf(route, forceRedirect)) redirects.add(target);
    else rendered.add(target);
  }
}

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(target) : [target];
  });
}

function listDirectories(directory: string) {
  return readdirSync(directory)
    .filter((name) => statSync(path.join(directory, name)).isDirectory())
    .sort();
}

function relativePaths(repoRoot: string, paths: readonly string[]) {
  return paths.map((entry) => path.relative(repoRoot, entry)).sort();
}

function readAgentFeatures(repoRoot: string) {
  const envExample = readFileSync(path.join(repoRoot, ".env.example"), "utf8");
  const value = envExample.match(/^AGENT_EXECUTOR_FEATURES=(.+)$/m)?.[1];
  if (!value) {
    throw new Error(
      ".env.example 缺少 AGENT_EXECUTOR_FEATURES，无法扫描 Agent feature",
    );
  }
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].sort();
}

function readJsonArray(filePath: string, label: string): unknown[] {
  const value = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!Array.isArray(value))
    throw new Error(`${label} 必须是 JSON 数组：${filePath}`);
  return value;
}

export function scanWikiBaseline(
  repoRoot = DEFAULT_WIKI_REPO_ROOT,
): WikiBaselineScan {
  const renderedRoutePaths = new Set<string>();
  const redirectRoutePaths = new Set<string>();

  for (const group of PRODUCT_ROUTE_GROUPS) {
    collectLeafRoutes(
      group.routes,
      group.prefix,
      renderedRoutePaths,
      redirectRoutePaths,
      group.forceRedirect,
    );
  }
  collectLeafRoutes(
    APP_SHELL_LEAF_ROUTES,
    "",
    renderedRoutePaths,
    redirectRoutePaths,
  );

  // 同一路径若由嵌套 index 明确重定向（例如 /settings），按 redirect 归类。
  for (const routePath of redirectRoutePaths)
    renderedRoutePaths.delete(routePath);

  const backendModuleNames = listDirectories(
    path.join(repoRoot, "backend/internal"),
  );
  const agentFeatureNames = readAgentFeatures(repoRoot);
  const agentSkillPaths = relativePaths(
    repoRoot,
    walkFiles(path.join(repoRoot, "agent-skills")).filter(
      (file) => path.basename(file) === "SKILL.md",
    ),
  );
  const appConfig = JSON.parse(
    readFileSync(path.join(repoRoot, "miniprogram/app.json"), "utf8"),
  ) as { pages?: unknown };
  if (!Array.isArray(appConfig.pages)) {
    throw new Error("miniprogram/app.json 的 pages 必须是数组");
  }
  const miniProgramPagePaths = appConfig.pages.map(String).sort();
  const migrationPaths = relativePaths(
    repoRoot,
    readdirSync(path.join(repoRoot, "docker/mysql/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .map((name) => path.join(repoRoot, "docker/mysql/migrations", name)),
  );
  const coldStartTools = readJsonArray(
    path.join(repoRoot, "feature-tools-coldstart/feature-tools.json"),
    "feature-tools-coldstart/feature-tools.json",
  );

  const sortedRenderedRoutes = [...renderedRoutePaths].sort();
  const sortedRedirectRoutes = [...redirectRoutePaths].sort();
  return {
    renderedRoutes: sortedRenderedRoutes.length,
    redirectRoutes: sortedRedirectRoutes.length,
    backendModules: backendModuleNames.length,
    agentFeatures: agentFeatureNames.length,
    agentSkills: agentSkillPaths.length,
    miniProgramPages: miniProgramPagePaths.length,
    migrations: migrationPaths.length,
    coldStartTools: coldStartTools.length,
    renderedRoutePaths: sortedRenderedRoutes,
    redirectRoutePaths: sortedRedirectRoutes,
    backendModuleNames,
    agentFeatureNames,
    agentSkillPaths,
    miniProgramPagePaths,
    migrationPaths,
  };
}

export function resolveGitCommit(repoRoot: string, ref: string) {
  return execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

export function gitCommitDate(repoRoot: string, commit: string) {
  return execFileSync("git", ["show", "-s", "--format=%cs", commit], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

export function defaultProductRef(
  repoRoot: string,
  candidates: readonly string[] = ["mock2", "origin/mock2"],
) {
  for (const candidate of candidates) {
    try {
      resolveGitCommit(repoRoot, candidate);
      return candidate;
    } catch {
      // CI 的单分支 checkout 可能没有 mock2 ref；调用方会复用 coverage.ts 已记录的产品提交。
    }
  }
  return undefined;
}

export function assertWikiBaselineInputs(repoRoot = DEFAULT_WIKI_REPO_ROOT) {
  for (const requiredPath of [
    ".env.example",
    "backend/internal",
    "agent-skills",
    "miniprogram/app.json",
    "docker/mysql/migrations",
    "feature-tools-coldstart/feature-tools.json",
  ]) {
    if (!existsSync(path.join(repoRoot, requiredPath))) {
      throw new Error(`缺少 Wiki 基线扫描输入：${requiredPath}`);
    }
  }
}
