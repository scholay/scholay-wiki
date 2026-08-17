import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MOCK_SURFACE_COVERAGE } from "../src/features/wiki/embeds/mock-surface-coverage";
import {
  DEFAULT_WIKI_REPO_ROOT,
  assertWikiBaselineInputs,
  defaultProductRef,
  gitCommitDate,
  resolveGitCommit,
  scanWikiBaseline,
} from "./wiki-baseline-lib";

const START_MARKER = "/* wiki-baseline:generated:start */";
const END_MARKER = "/* wiki-baseline:generated:end */";
const MOCK_START_MARKER = "/* wiki-mock-baseline:generated:start */";
const MOCK_END_MARKER = "/* wiki-mock-baseline:generated:end */";
const coveragePath = path.join(
  DEFAULT_WIKI_REPO_ROOT,
  "frontend-user/src/features/wiki/coverage.ts",
);

interface CliOptions {
  check: boolean;
  productRef?: string;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") options.check = true;
    else if (arg === "--product-ref") {
      options.productRef = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--product-ref=")) {
      options.productRef = arg.slice("--product-ref=".length);
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return options;
}

interface ProductIdentity {
  commit: string;
  verifiedOn: string;
  label: string;
}

function storedProductIdentity(source: string): ProductIdentity {
  const generated = source.slice(
    source.indexOf(START_MARKER),
    source.indexOf(END_MARKER),
  );
  const commit = generated.match(/\bcommit:\s*"([0-9a-f]{40})"/)?.[1];
  const verifiedOn = generated.match(
    /\bverifiedOn:\s*"(\d{4}-\d{2}-\d{2})"/,
  )?.[1];
  if (!commit || !verifiedOn) {
    throw new Error(
      "coverage.ts 的生成区缺少可复用 product commit / verifiedOn",
    );
  }
  return { commit, verifiedOn, label: "coverage.ts 已记录产品提交" };
}

function resolveProductIdentity(
  currentSource: string,
  explicitRef: string | undefined,
): ProductIdentity {
  const discoveredRef =
    process.env.WIKI_BASELINE_SKIP_REF_DISCOVERY === "1"
      ? undefined
      : defaultProductRef(DEFAULT_WIKI_REPO_ROOT);
  const productRef = explicitRef ?? discoveredRef;
  if (!productRef) return storedProductIdentity(currentSource);
  const commit = resolveGitCommit(DEFAULT_WIKI_REPO_ROOT, productRef);
  return {
    commit,
    verifiedOn: gitCommitDate(DEFAULT_WIKI_REPO_ROOT, commit),
    label: `product ref ${productRef}`,
  };
}

function renderBaselineBlock(identity: ProductIdentity) {
  const scan = scanWikiBaseline(DEFAULT_WIKI_REPO_ROOT);
  const { commit } = identity;
  const packageJson = JSON.parse(
    readFileSync(
      path.join(DEFAULT_WIKI_REPO_ROOT, "frontend-user/package.json"),
      "utf8",
    ),
  ) as { version: string };

  const auditBlock = `${START_MARKER}
export const WIKI_AUDIT_BASELINE = {
  commit: ${JSON.stringify(commit)},
  shortCommit: ${JSON.stringify(commit.slice(0, 8))},
  version: ${JSON.stringify(packageJson.version)},
  verifiedOn: ${JSON.stringify(identity.verifiedOn)},
  renderedRoutes: ${scan.renderedRoutes},
  redirectRoutes: ${scan.redirectRoutes},
  backendModules: ${scan.backendModules},
  agentFeatures: ${scan.agentFeatures},
  agentSkills: ${scan.agentSkills},
  miniProgramPages: ${scan.miniProgramPages},
  migrations: ${scan.migrations},
  coldStartTools: ${scan.coldStartTools},
} as const;
${END_MARKER}`;

  const visible = MOCK_SURFACE_COVERAGE.filter(
    (entry) => entry.disposition !== "excluded",
  );
  const migratedOrCorrected = MOCK_SURFACE_COVERAGE.filter(
    (entry) => entry.disposition === "fixture",
  ).length;
  const existing = MOCK_SURFACE_COVERAGE.filter(
    (entry) => entry.disposition === "covered",
  ).length;
  const excluded = MOCK_SURFACE_COVERAGE.filter(
    (entry) => entry.disposition === "excluded",
  ).length;
  const registeredFixtures = new Set(
    MOCK_SURFACE_COVERAGE.flatMap((entry) => entry.fixtureIds),
  ).size;
  const mockBlock = `${MOCK_START_MARKER}
export const WIKI_MOCK_SURFACE_BASELINE = {
  visible: ${visible.length},
  migratedOrCorrected: ${migratedOrCorrected},
  existing: ${existing},
  excluded: ${excluded},
  registeredFixtures: ${registeredFixtures},
} as const;
${MOCK_END_MARKER}`;

  return {
    auditBlock,
    mockBlock,
    mock: {
      visible: visible.length,
      migratedOrCorrected,
      existing,
      excluded,
      registeredFixtures,
    },
    scan,
    commit,
    identityLabel: identity.label,
    version: packageJson.version,
  };
}

function replaceGeneratedBlock(
  source: string,
  generatedBlock: string,
  startMarker: string,
  endMarker: string,
) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < start) {
    throw new Error(`coverage.ts 缺少 ${startMarker} / ${endMarker} 标记`);
  }
  return `${source.slice(0, start)}${generatedBlock}${source.slice(
    end + endMarker.length,
  )}`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  assertWikiBaselineInputs(DEFAULT_WIKI_REPO_ROOT);
  const current = readFileSync(coveragePath, "utf8");
  const identity = resolveProductIdentity(current, options.productRef);
  const generated = renderBaselineBlock(identity);
  const withAudit = replaceGeneratedBlock(
    current,
    generated.auditBlock,
    START_MARKER,
    END_MARKER,
  );
  const next = replaceGeneratedBlock(
    withAudit,
    generated.mockBlock,
    MOCK_START_MARKER,
    MOCK_END_MARKER,
  );
  const summary = [
    `${generated.scan.renderedRoutes} rendered routes`,
    `${generated.scan.redirectRoutes} redirects`,
    `${generated.scan.backendModules} backend modules`,
    `${generated.scan.agentFeatures} agent features`,
    `${generated.scan.agentSkills} skills`,
    `${generated.scan.miniProgramPages} mini pages`,
    `${generated.scan.migrations} migrations`,
    `${generated.scan.coldStartTools} cold-start tools`,
    `${generated.mock.visible} visible mock surfaces`,
    `${generated.mock.registeredFixtures} fixtures`,
  ].join(", ");

  if (options.check) {
    if (next !== current) {
      console.error(
        `Wiki 基线已漂移（${generated.identityLabel} @ ${generated.commit.slice(0, 8)}）：${summary}`,
      );
      console.error(
        "请运行 npm run generate:wiki-baseline 并审阅 coverage.ts。 ",
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `Wiki 基线一致（${generated.version} / ${generated.commit.slice(0, 8)}）：${summary}`,
    );
    return;
  }

  if (next !== current) writeFileSync(coveragePath, next);
  console.log(
    `已生成 Wiki 基线（${generated.version} / ${generated.commit.slice(0, 8)}）：${summary}`,
  );
}

main();
