// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { resetMockDatabase } from "./database";
import { handleManuscriptMock } from "./manuscripts";
import { handleWorkspaceMock } from "./workspaces";

/**
 * 稿件 / 稿件集共享架构的端到端冒烟:直接驱动 mock handler 走完
 * 写(Prism)→送审(版本快照+审稿轮)→审(Submission)→判决→回写反查 的全循环,
 * 以及独立上传主稿的 origin=upload 自动登记路径。
 */

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost/api/v1${path}`, init);
}

function jsonInit(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function payload(response: Response | null | undefined) {
  expect(response).toBeTruthy();
  expect(response?.status).toBeLessThan(400);
  return (await response?.json()) as Record<string, unknown>;
}

async function manuscriptCall(path: string, init?: RequestInit) {
  return payload(await handleManuscriptMock(request(path, init), path));
}

async function workspaceCall(path: string, init?: RequestInit) {
  return payload(await handleWorkspaceMock(request(path, init), path));
}

describe("manuscript identity layer", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMockDatabase();
  });

  it("serves seeded collections and the prism-origin manuscript", async () => {
    const collections = await manuscriptCall("/user/manuscript-collections");
    const items = (collections.data as { items: Array<Record<string, unknown>> })
      .items;
    const writing = items.find((c) => c.id === "m-writing");
    const review = items.find((c) => c.id === "m-review");
    expect(writing?.itemCount).toBeGreaterThan(0);
    expect(review?.itemCount).toBeGreaterThan(0);

    const detail = await manuscriptCall("/user/manuscripts/401");
    const data = detail.data as {
      manuscript: Record<string, unknown>;
      versions: unknown[];
      rounds: Array<Record<string, unknown>>;
    };
    expect(data.manuscript).toMatchObject({
      origin: "prism",
      prismProjectId: 201,
      stage: "decided",
      latestDecision: "小修",
    });
    expect(data.versions.length).toBeGreaterThanOrEqual(2);
    // 种子第 1 轮绑定已完成的 Submission 301,状态由工单实时推导。
    expect(data.rounds[0]).toMatchObject({
      submissionId: 301,
      status: "completed",
      decision: "小修",
    });
  });

  it("walks the full write → review → decide → back-reference loop", async () => {
    // 1. 新建 Prism 项目 → 自动登记 origin=prism 稿件进「写作中」。
    const createProject = await workspaceCall(
      "/user/prism/projects",
      jsonInit({ title: "循环冒烟项目" }),
    );
    const projectId = (createProject.data as { project: { id: number } })
      .project.id;

    const byProject = await manuscriptCall(
      `/user/manuscripts?project=${projectId}`,
    );
    const registered = (
      byProject.data as { items: Array<Record<string, unknown>> }
    ).items;
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({
      origin: "prism",
      collectionId: "m-writing",
      stage: "writing",
    });
    const manuscriptId = registered[0].id as number;

    // 2. 送审:落版本快照 + 建审稿轮(自动建 step=2 的 draft Submission)。
    const versionRes = await manuscriptCall(
      `/user/manuscripts/${manuscriptId}/versions`,
      jsonInit({ label: "送审 v1" }),
    );
    const versionNo = (versionRes.data as { version: { versionNo: number } })
      .version.versionNo;
    expect(versionNo).toBe(1);

    const roundRes = await manuscriptCall(
      `/user/manuscripts/${manuscriptId}/review-rounds`,
      jsonInit({ versionNo }),
    );
    const roundData = roundRes.data as {
      round: Record<string, unknown>;
      submissionId: number;
    };
    expect(roundData.round).toMatchObject({ status: "draft", versionNo: 1 });
    const submissionId = roundData.submissionId;
    expect(submissionId).toBeGreaterThan(0);

    // 3. wizard 落点:工单 step=2,稿件资产已按版本快照附带(跳过上传步)。
    const submission = await workspaceCall(
      `/user/peer-review/submissions/${submissionId}`,
    );
    expect(submission.data).toMatchObject({ step: 2, status: "draft" });

    const assets = await workspaceCall(
      `/user/peer-review/submissions/${submissionId}/assets`,
    );
    const assetItems = (
      assets.data as { items: Array<Record<string, unknown>> }
    ).items;
    expect(assetItems).toHaveLength(1);
    expect(assetItems[0]).toMatchObject({ role: "manuscript" });
    expect(String(assetItems[0].filename)).toContain("-v1.pdf");

    // 4. 稿件 stage 随工单实时推导:draft 轮 → in_review。
    const inReview = await manuscriptCall(`/user/manuscripts/${manuscriptId}`);
    expect((inReview.data as { manuscript: { stage: string } }).manuscript.stage)
      .toBe("in_review");

    // 5. 投递完成(mock submit 即刻出报告)→ 稿件判决态,无需任何回写钩子。
    await workspaceCall(
      `/user/peer-review/submissions/${submissionId}/submit`,
      jsonInit({}),
    );
    const decided = await manuscriptCall(`/user/manuscripts/${manuscriptId}`);
    expect(
      (decided.data as { manuscript: Record<string, unknown> }).manuscript,
    ).toMatchObject({ stage: "decided", latestDecision: "小修" });

    // 6. 审→写回流的身份反查:报告页凭 submissionId 找回稿件与写作项目。
    const bySubmission = await manuscriptCall(
      `/user/manuscripts?submission=${submissionId}`,
    );
    const found = (
      bySubmission.data as { items: Array<Record<string, unknown>> }
    ).items;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: manuscriptId,
      prismProjectId: projectId,
    });
  });

  it("registers an upload-origin manuscript when the wizard uploads a main file", async () => {
    const createSubmission = await workspaceCall(
      "/user/peer-review/submissions",
      jsonInit({ mode: "journal" }),
    );
    const submissionId = (createSubmission.data as { id: number }).id;

    // 手工拼 multipart:jsdom 的 FormData/File 与 node 原生 Request(undici)
    // 混用会让 request.formData() 永久挂起,原始字节流两边都认。
    const boundary = "----manuscript-cycle-boundary";
    const multipartBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="独立上传示例稿.pdf"',
      "Content-Type: application/pdf",
      "",
      "%PDF-1.4 mock",
      `--${boundary}`,
      'Content-Disposition: form-data; name="role"',
      "",
      "manuscript",
      `--${boundary}--`,
      "",
    ].join("\r\n");
    await workspaceCall(`/user/peer-review/submissions/${submissionId}/assets`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    const bySubmission = await manuscriptCall(
      `/user/manuscripts?submission=${submissionId}`,
    );
    const items = (
      bySubmission.data as { items: Array<Record<string, unknown>> }
    ).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      origin: "upload",
      collectionId: "m-review",
      stage: "in_review",
      versionCount: 1,
      roundCount: 1,
    });
    // 标题取自上传文件名;测试环境里 undici 解析出的 File 不是 jsdom File 的
    // 实例,handler 的 instanceof 判定会落到默认文件名 —— 只断言非空。
    expect(String(items[0].title).length).toBeGreaterThan(0);
  });
});
