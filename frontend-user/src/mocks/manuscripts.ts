import { HttpResponse } from "msw";
import {
  getMockDatabase,
  nextMockId,
  updateMockDatabase,
  type MockManuscript,
  type MockManuscriptVersion,
  type MockReviewRound,
  type MockSubmission,
} from "./database";

/**
 * 稿件 / 稿件集 mock 后端 —— 写 ↔ 审 ↔ 改循环的身份与编排层。
 *
 * 端点(挂在 /user 下):
 *   GET   /user/manuscript-collections            稿件集列表(含条目数)
 *   GET   /user/manuscripts?collection=&project=&submission=   稿件列表 / 反查
 *   GET   /user/manuscripts/:id                   稿件详情(版本 + 审稿轮)
 *   PATCH /user/manuscripts/:id                   移动到集合
 *   POST  /user/manuscripts/:id/versions          落版本快照(送审铆点)
 *   POST  /user/manuscripts/:id/review-rounds     建审稿轮(自动建 Submission,稿件已附带)
 *
 * 关键设计:审稿轮的 status/decision 不落库,从绑定的 Submission 实时推导 ——
 * wizard 里投递 / 重试 / 删草稿之后,稿件侧视图天然同步,无需回写钩子。
 */

type UnknownRecord = Record<string, unknown>;

function success(data: unknown): Response {
  return HttpResponse.json({ code: 0, message: "success", data });
}

function apiError(status: number, message: string): Response {
  return HttpResponse.json({ code: status, message, data: null }, { status });
}

async function readJsonObject(request: Request): Promise<UnknownRecord> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as UnknownRecord)
      : {};
  } catch {
    return {};
  }
}

// ─── 视图推导 ────────────────────────────────────────────────────────────

export type RoundStatus = "draft" | "in_review" | "completed" | "failed";

/** 主审 mock 报告的固定决议(与 reviewReports 的 chief recommendation 保持一致)。 */
const MOCK_CHIEF_DECISION = "小修";

function findSubmission(submissionId: number): MockSubmission | undefined {
  return getMockDatabase().submissions.find((s) => s.id === submissionId);
}

function roundStatus(submission: MockSubmission | undefined): RoundStatus | null {
  if (!submission) return null; // 工单被删 → 轮视图里剔除
  const status = String(submission.status ?? "draft");
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "draft") return "draft";
  return "in_review";
}

function roundsForManuscript(manuscriptId: number): MockReviewRound[] {
  return getMockDatabase()
    .reviewRounds.filter((round) => round.manuscriptId === manuscriptId)
    .sort((a, b) => a.roundNo - b.roundNo);
}

function versionsForManuscript(manuscriptId: number): MockManuscriptVersion[] {
  return getMockDatabase()
    .manuscriptVersions.filter((v) => v.manuscriptId === manuscriptId)
    .sort((a, b) => a.versionNo - b.versionNo);
}

function roundView(round: MockReviewRound): UnknownRecord | null {
  const submission = findSubmission(round.submissionId);
  const status = roundStatus(submission);
  if (!status) return null;
  return {
    id: round.id,
    roundNo: round.roundNo,
    versionNo: round.versionNo,
    submissionId: round.submissionId,
    submissionMode: submission?.mode === "thesis" ? "thesis" : "journal",
    status,
    decision: status === "completed" ? MOCK_CHIEF_DECISION : undefined,
    createdAt: round.createdAt,
    completedAt:
      status === "completed"
        ? (submission?.completedAt as string | undefined)
        : undefined,
  };
}

function manuscriptStage(manuscriptId: number): "writing" | "in_review" | "decided" {
  const statuses = roundsForManuscript(manuscriptId)
    .map((round) => roundStatus(findSubmission(round.submissionId)))
    .filter((status): status is RoundStatus => status !== null);
  if (statuses.some((s) => s === "draft" || s === "in_review")) {
    return "in_review";
  }
  if (statuses.some((s) => s === "completed")) return "decided";
  return "writing";
}

function manuscriptView(manuscript: MockManuscript): UnknownRecord {
  const versions = versionsForManuscript(manuscript.id);
  const roundViews = roundsForManuscript(manuscript.id)
    .map(roundView)
    .filter((view): view is UnknownRecord => view !== null);
  const decided = [...roundViews]
    .reverse()
    .find((view) => view.status === "completed");
  return {
    id: manuscript.id,
    collectionId: manuscript.collectionId,
    title: manuscript.title,
    origin: manuscript.origin,
    prismProjectId: manuscript.prismProjectId,
    stage: manuscriptStage(manuscript.id),
    latestDecision: decided?.decision,
    versionCount: versions.length,
    roundCount: roundViews.length,
    createdAt: manuscript.createdAt,
    updatedAt: manuscript.updatedAt,
  };
}

function versionView(version: MockManuscriptVersion): UnknownRecord {
  return {
    id: version.id,
    versionNo: version.versionNo,
    source: version.source,
    label: version.label,
    summary: version.summary,
    createdAt: version.createdAt,
  };
}

// ─── 身份自动登记(workspaces.ts 在既有端点里调用)──────────────────────

/** 新建 Prism 项目 → 自动登记 origin=prism 稿件进「写作中」。 */
export function registerPrismManuscript(project: {
  id: number;
  title: string;
}): void {
  const database = getMockDatabase();
  if (database.manuscripts.some((m) => m.prismProjectId === project.id)) return;
  const now = new Date().toISOString();
  updateMockDatabase((mutable) => {
    mutable.manuscripts.unshift({
      id: nextMockId(mutable.manuscripts),
      collectionId: "m-writing",
      title: project.title || "未命名研究",
      origin: "prism",
      prismProjectId: project.id,
      createdAt: now,
      updatedAt: now,
    });
  });
}

/**
 * 审稿 wizard 独立上传主稿 → 自动登记 origin=upload 稿件进「审稿上传」
 * (v1 版本 + 第 1 轮绑定该 Submission)。已被某个稿件的轮绑定的投稿(如
 * Prism 送审建出来的)不重复登记。
 */
export function registerUploadManuscript(
  submission: MockSubmission,
  filename: string,
): void {
  const database = getMockDatabase();
  if (database.reviewRounds.some((r) => r.submissionId === submission.id)) {
    return;
  }
  const now = new Date().toISOString();
  const title =
    (typeof submission.title === "string" && submission.title.trim()) ||
    filename.replace(/\.[a-z0-9]+$/i, "") ||
    "上传稿件";
  updateMockDatabase((mutable) => {
    const manuscriptId = nextMockId(mutable.manuscripts);
    mutable.manuscripts.unshift({
      id: manuscriptId,
      collectionId: "m-review",
      title,
      origin: "upload",
      createdAt: now,
      updatedAt: now,
    });
    mutable.manuscriptVersions.push({
      id: nextMockId(mutable.manuscriptVersions),
      manuscriptId,
      versionNo: 1,
      source: "upload",
      label: "上传原稿 v1",
      createdAt: now,
    });
    mutable.reviewRounds.push({
      id: nextMockId(mutable.reviewRounds),
      manuscriptId,
      roundNo: 1,
      versionNo: 1,
      submissionId: submission.id,
      createdAt: now,
    });
  });
}

/**
 * 送审建轮时新建的 Submission 需要"稿件已附带"—— workspaces.ts 的
 * assetsForSubmission 懒播种时调用这里,按绑定的版本快照生成 manuscript 资产。
 */
export function snapshotAssetSeed(submissionId: number): {
  manuscriptTitle: string;
  versionNo: number;
  createdAt: string;
} | null {
  const database = getMockDatabase();
  const round = database.reviewRounds.find(
    (r) => r.submissionId === submissionId,
  );
  if (!round) return null;
  const manuscript = database.manuscripts.find(
    (m) => m.id === round.manuscriptId,
  );
  if (!manuscript || manuscript.origin !== "prism") return null;
  return {
    manuscriptTitle: manuscript.title,
    versionNo: round.versionNo,
    createdAt: round.createdAt,
  };
}

// ─── 端点 ───────────────────────────────────────────────────────────────

export async function handleManuscriptMock(
  request: Request,
  path: string,
): Promise<Response | null> {
  const method = request.method.toUpperCase();
  const url = new URL(request.url, "http://scholay.mock");
  const cleanPath =
    path
      .split("?")[0]
      .replace(/^\/api\/v1(?=\/|$)/, "")
      .replace(/\/+$/, "") || "/";

  if (cleanPath === "/user/manuscript-collections" && method === "GET") {
    const database = getMockDatabase();
    return success({
      items: database.manuscriptCollections.map((collection) => ({
        ...collection,
        itemCount: database.manuscripts.filter(
          (m) => m.collectionId === collection.id,
        ).length,
      })),
    });
  }

  if (cleanPath === "/user/manuscripts" && method === "GET") {
    const collection = url.searchParams.get("collection");
    const project = Number(url.searchParams.get("project") || 0);
    const submission = Number(url.searchParams.get("submission") || 0);
    const database = getMockDatabase();
    let items = database.manuscripts;
    if (collection) {
      items = items.filter((m) => m.collectionId === collection);
    }
    if (project > 0) {
      items = items.filter((m) => m.prismProjectId === project);
    }
    if (submission > 0) {
      const ids = new Set(
        database.reviewRounds
          .filter((r) => r.submissionId === submission)
          .map((r) => r.manuscriptId),
      );
      items = items.filter((m) => ids.has(m.id));
    }
    return success({
      items: [...items]
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map(manuscriptView),
    });
  }

  const match = /^\/user\/manuscripts\/(\d+)(\/.*)?$/.exec(cleanPath);
  if (!match) return null;
  const manuscriptId = Number(match[1]);
  const tail = match[2] ?? "";
  const manuscript = getMockDatabase().manuscripts.find(
    (m) => m.id === manuscriptId,
  );
  if (!manuscript) return apiError(404, "稿件不存在");

  if (tail === "" && method === "GET") {
    return success({
      manuscript: manuscriptView(manuscript),
      versions: versionsForManuscript(manuscriptId).map(versionView),
      rounds: roundsForManuscript(manuscriptId)
        .map(roundView)
        .filter((view) => view !== null),
    });
  }

  if (tail === "" && method === "PATCH") {
    const body = await readJsonObject(request);
    const collectionId =
      typeof body.collectionId === "string" ? body.collectionId : "";
    if (
      collectionId &&
      !getMockDatabase().manuscriptCollections.some(
        (c) => c.id === collectionId,
      )
    ) {
      return apiError(400, "目标稿件集不存在");
    }
    updateMockDatabase((mutable) => {
      const target = mutable.manuscripts.find((m) => m.id === manuscriptId);
      if (!target) return;
      if (collectionId) target.collectionId = collectionId;
      if (typeof body.title === "string" && body.title.trim()) {
        target.title = body.title.trim();
      }
      target.updatedAt = new Date().toISOString();
    });
    return success({ manuscript: manuscriptView(manuscript) });
  }

  if (tail === "/versions" && method === "POST") {
    const body = await readJsonObject(request);
    const now = new Date().toISOString();
    let created: MockManuscriptVersion | undefined;
    updateMockDatabase((mutable) => {
      const versions = mutable.manuscriptVersions.filter(
        (v) => v.manuscriptId === manuscriptId,
      );
      const versionNo = Math.max(0, ...versions.map((v) => v.versionNo)) + 1;
      const source =
        manuscript.origin === "prism" ? "prism-snapshot" : "upload";
      created = {
        id: nextMockId(mutable.manuscriptVersions),
        manuscriptId,
        versionNo,
        source,
        label:
          (typeof body.label === "string" && body.label.trim()) ||
          (source === "prism-snapshot"
            ? `送审 v${versionNo}`
            : `上传稿 v${versionNo}`),
        summary:
          typeof body.summary === "string" && body.summary.trim()
            ? body.summary.trim()
            : undefined,
        createdAt: now,
      };
      mutable.manuscriptVersions.push(created);
      const target = mutable.manuscripts.find((m) => m.id === manuscriptId);
      if (target) target.updatedAt = now;
    });
    return created ? success({ version: versionView(created) }) : apiError(500, "版本创建失败");
  }

  if (tail === "/review-rounds" && method === "POST") {
    const body = await readJsonObject(request);
    const now = new Date().toISOString();
    const versions = versionsForManuscript(manuscriptId);
    const requestedVersion = Number(body.versionNo ?? 0);
    let versionNo =
      requestedVersion > 0 &&
      versions.some((v) => v.versionNo === requestedVersion)
        ? requestedVersion
        : (versions.at(-1)?.versionNo ?? 0);

    let createdRound: MockReviewRound | undefined;
    let submissionId = 0;
    updateMockDatabase((mutable) => {
      // 没有任何版本时自动落一个快照(送审必须钉在版本上)。
      if (versionNo === 0) {
        versionNo = 1;
        mutable.manuscriptVersions.push({
          id: nextMockId(mutable.manuscriptVersions),
          manuscriptId,
          versionNo,
          source: manuscript.origin === "prism" ? "prism-snapshot" : "upload",
          label: `送审 v${versionNo}`,
          createdAt: now,
        });
      }
      // 复用现有审稿工单模型:自动建一条 draft Submission,step=2(稿件已附带,跳过上传步)。
      submissionId = nextMockId(mutable.submissions);
      mutable.submissions.unshift({
        id: submissionId,
        mode: "journal",
        title: manuscript.title,
        abstract: "",
        status: "draft",
        step: 2,
        computeState: "idle",
        compute_state: "idle",
        assetsRevision: 1,
        metaRevision: 0,
        letterRevision: 0,
        agentSessionId: `peer-review-${submissionId}`,
        createdAt: now,
        updatedAt: now,
        created_at: now,
        updated_at: now,
      });
      const rounds = mutable.reviewRounds.filter(
        (r) => r.manuscriptId === manuscriptId,
      );
      createdRound = {
        id: nextMockId(mutable.reviewRounds),
        manuscriptId,
        roundNo: Math.max(0, ...rounds.map((r) => r.roundNo)) + 1,
        versionNo,
        submissionId,
        createdAt: now,
      };
      mutable.reviewRounds.push(createdRound);
      const target = mutable.manuscripts.find((m) => m.id === manuscriptId);
      if (target) target.updatedAt = now;
    });
    if (!createdRound) return apiError(500, "审稿轮创建失败");
    return success({ round: roundView(createdRound), submissionId });
  }

  return null;
}
