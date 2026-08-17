// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { handleAdminMock } from "./admin";
import { handleCoreMock } from "./core";
import { resetMockDatabase } from "./database";
import { handlePublicMock } from "./public";
import { handleWorkspaceMock } from "./workspaces";

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost/api/v1${path}`, init);
}

async function payload(response: Response | null | undefined) {
  expect(response).toBeTruthy();
  expect(response?.status).toBeLessThan(400);
  return (await response?.json()) as Record<string, unknown>;
}

describe("browser mock backend", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMockDatabase();
  });

  it("serves authenticated core data", async () => {
    const body = await payload(
      await handleCoreMock(request("/user/profile"), "/user/profile"),
    );

    expect(body.code).toBe(0);
    expect(body.data).toMatchObject({
      email: "lin.yu@scholay.mock",
      username: "林屿",
    });
  });

  it("serves public search results", async () => {
    const body = await payload(
      await handlePublicMock(
        request("/public/papers/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "trustworthy AI", page: 1 }),
        }),
        "/public/papers/search",
      ),
    );

    const data = body.data as { data: { data: unknown[]; total: number } };
    expect(data.data.total).toBeGreaterThan(0);
    expect(data.data.data.length).toBeGreaterThan(0);
  });

  it("persists workspace mutations", async () => {
    const createBody = await payload(
      await handleWorkspaceMock(
        request("/user/prism/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "设计验收项目" }),
        }),
        "/user/prism/projects",
      ),
    );
    expect(createBody.code).toBe(0);

    const listBody = await payload(
      await handleWorkspaceMock(
        request("/user/prism/projects"),
        "/user/prism/projects",
      ),
    );
    const data = listBody.data as { projects: Array<{ title: string }> };
    expect(
      data.projects.some((project) => project.title === "设计验收项目"),
    ).toBe(true);
  });

  it("streams PDF resolution and confirms the imported paper", async () => {
    const stream = await handleCoreMock(
      request("/user/library/papers/upload-and-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      "/user/library/papers/upload-and-resolve",
    );
    expect(stream?.headers.get("content-type")).toContain("text/event-stream");
    const eventBody = await stream?.text();
    expect(eventBody).toContain("event: parsed");
    expect(eventBody).toContain("event: searched");
    expect(eventBody).toContain("event: ready");
    const jobId = eventBody?.match(/"job_id":"([^"]+)"/)?.[1];
    expect(jobId).toBeTruthy();

    const confirm = await payload(
      await handleCoreMock(
        request("/user/library/papers/confirm-upload-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId, decision: "free" }),
        }),
        "/user/library/papers/confirm-upload-job",
      ),
    );
    const result = confirm.data as {
      paper: { origin: string; link_state: string };
      merged: boolean;
    };
    expect(result.paper).toMatchObject({
      origin: "upload",
      link_state: "free",
    });
    expect(result.merged).toBe(false);
  });

  it("serves local PDF and journal download assets", async () => {
    const pdf = await handleCoreMock(
      request("/mock-assets/paper.pdf"),
      "/mock-assets/paper.pdf",
    );
    expect(pdf?.headers.get("content-type")).toBe("application/pdf");
    expect(await pdf?.text()).toContain("%PDF-1.4");

    const guideline = await handleCoreMock(
      request("/user/journals/10001/submission/guideline"),
      "/user/journals/10001/submission/guideline",
    );
    expect(guideline?.headers.get("content-type")).toContain("text/markdown");
    expect(await guideline?.text()).toContain("投稿须知");
  });

  it("keeps OAuth callbacks inside the SPA", async () => {
    const loginUrl = await payload(
      await handleCoreMock(
        request("/user/apple/login-url"),
        "/user/apple/login-url",
      ),
    );
    expect(loginUrl.data).toMatchObject({
      url: "/apple/callback?code=mock-code&state=mock-state",
    });

    const callback = await payload(
      await handleCoreMock(
        request("/user/apple/callback?code=mock-code&state=mock-state"),
        "/user/apple/callback",
      ),
    );
    expect(callback.data).toMatchObject({
      token: "mock-token-researcher",
    });
  });

  it("matches skill detail and feedback contracts", async () => {
    const skill = await payload(
      await handlePublicMock(
        request("/user/skills/market/501"),
        "/user/skills/market/501",
      ),
    );
    expect(skill.data).toMatchObject({
      id: 501,
      moderationStatus: "approved",
      skillMd: expect.any(String),
    });

    const feedback = await payload(
      await handlePublicMock(
        request("/public/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "designer@scholay.mock",
            category: "feature",
            content: "希望增加一个可比较不同设计方案的工作区。",
          }),
        }),
        "/public/feedback",
      ),
    );
    expect(feedback.data).toMatchObject({
      status: "pending",
      receipt: { reference: expect.stringMatching(/^FB-/) },
    });
  });

  it("serves the admin dashboard", async () => {
    const body = await payload(
      await handleAdminMock(
        request("/admin/dashboard/statistics"),
        "/admin/dashboard/statistics",
      ),
    );

    expect(body.code).toBe(0);
    expect(body.data).toMatchObject({
      total_users: expect.any(Number),
      revenue_30d: expect.any(Number),
    });
  });

  it("serves admin binary previews", async () => {
    const sessionFile = await handleAdminMock(
      request(
        "/admin/agent-sessions/mock-smart_search-0001/file?filename=notes.md",
      ),
      "/admin/agent-sessions/mock-smart_search-0001/file",
    );
    expect(sessionFile?.headers.get("content-type")).toContain("text/markdown");
    expect(await sessionFile?.text()).toContain("Mock");

    const manuscript = await handleAdminMock(
      request("/admin/peer-review/submissions/1/assets/11"),
      "/admin/peer-review/submissions/1/assets/11",
    );
    expect(manuscript?.headers.get("content-type")).toBe("application/pdf");
    expect(await manuscript?.text()).toContain("%PDF-");
  });
});
