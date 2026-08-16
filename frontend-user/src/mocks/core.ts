import { HttpResponse } from "msw";
import type {
  AnalysisDimension,
  RemoteStagingArea,
  RemoteStagingPaper,
  UserLibraryPaper,
} from "@/shared/api/types";
import {
  getMockDatabase,
  nextMockId,
  persistMockDatabase,
  updateMockDatabase,
} from "./database";
import { mockPapers } from "./fixtures";
import {
  applyMockPersona,
  getMockPersona,
  profileForPersona,
  setMockPersona,
} from "./personas";
import { getMockBilling, setMockBilling } from "./billing-state";

const ok = <T>(data: T, init?: ResponseInit) =>
  HttpResponse.json({ code: 0, message: "success", data }, init);

const emptyOk = () => ok({ ok: true });

async function bodyAsRecord(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const value: unknown = await request.clone().json();
      return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await request.clone().formData();
      return Object.fromEntries(form.entries());
    } catch {
      return {};
    }
  }
  return {};
}

function unauthorized() {
  return HttpResponse.json(
    { code: 401, message: "Mock 访客身份尚未登录", data: null },
    { status: 401 },
  );
}

function hasMockSession(): boolean {
  return getMockPersona() !== "visitor";
}

const dimensions: AnalysisDimension[] = [
  {
    id: 1,
    dimensionKey: "research_question",
    name: "研究问题",
    description: "概括论文试图回答的核心问题与研究缺口",
    sortOrder: 1,
    isActive: true,
    isHidden: false,
  },
  {
    id: 2,
    dimensionKey: "method",
    name: "方法设计",
    description: "提取研究方法、数据、实验设置和关键假设",
    sortOrder: 2,
    isActive: true,
    isHidden: false,
  },
  {
    id: 3,
    dimensionKey: "evidence",
    name: "关键证据",
    description: "总结主要实验结果、效应方向和证据强度",
    sortOrder: 3,
    isActive: true,
    isHidden: false,
  },
  {
    id: 4,
    dimensionKey: "limitation",
    name: "局限性",
    description: "识别作者陈述或可推断的限制与外推边界",
    sortOrder: 4,
    isActive: true,
    isHidden: false,
  },
];

const uploadJobs = new Map<
  string,
  {
    filename: string;
    title: string;
    abstract: string;
    sha256: string;
  }
>();

const messages = [
  {
    id: 1,
    message_id: 701,
    title: "审稿报告已生成",
    content:
      "《Human–AI Collaboration in Scientific Discovery》的四份模拟审稿意见已就绪。",
    category: "system",
    link_url: "/peer-review/records/301",
    link_text: "查看报告",
    is_read: false,
    read_at: null,
    created_at: "2026-07-28T05:20:00.000Z",
  },
  {
    id: 2,
    message_id: 702,
    title: "本周用量摘要",
    content: "本周期已使用 37% 的 AI 额度，距离自动重置还有 4 天。",
    category: "transaction",
    link_url: "/settings/membership",
    link_text: "查看用量",
    is_read: false,
    read_at: null,
    created_at: "2026-07-27T01:00:00.000Z",
  },
  {
    id: 3,
    message_id: 703,
    title: "功能更新：检索矩阵支持自定义维度",
    content: "你现在可以新增、排序和隐藏分析维度，并保留每篇论文的分析缓存。",
    category: "promotion",
    link_url: "/search",
    link_text: "立即体验",
    is_read: true,
    read_at: "2026-07-26T11:10:00.000Z",
    created_at: "2026-07-26T08:00:00.000Z",
  },
];

const installedSkills = [
  {
    skillId: 11,
    slug: "systematic-review",
    name: "系统综述助手",
    tagline: "从检索式到 PRISMA 筛选记录",
    guideName: "u1001-systematic-review",
    source: "market",
    enabled: true,
    available: true,
  },
  {
    skillId: 12,
    slug: "academic-rebuttal",
    name: "审稿回复教练",
    tagline: "逐条组织审稿意见与回复证据",
    guideName: "u1001-academic-rebuttal",
    source: "self",
    enabled: false,
    available: true,
  },
];

const modelCatalog = [
  {
    model_id: "scholay-fast",
    display_name: "Scholay Fast",
    description: "低延迟，适合检索、整理与轻量改写",
    context_window: 128000,
    speed_class: "fast",
    locked: false,
    min_tier: "",
    is_default: false,
    vision: true,
    flagship: false,
  },
  {
    model_id: "scholay-reasoner",
    display_name: "Scholay Reasoner",
    description: "复杂推理与长文献分析的平衡选择",
    context_window: 200000,
    speed_class: "balanced",
    locked: false,
    min_tier: "pro",
    is_default: true,
    vision: true,
    flagship: true,
  },
  {
    model_id: "scholay-max",
    display_name: "Scholay Max",
    description: "最高质量的多步骤科研任务模型",
    context_window: 1000000,
    speed_class: "powerful",
    locked: true,
    min_tier: "max",
    is_default: false,
    vision: true,
    flagship: true,
  },
];

function libraryList(url: URL) {
  const database = getMockDatabase();
  const folder = url.searchParams.get("folder");
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.max(1, Number(url.searchParams.get("page_size") ?? 20));
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";
  let items = [...database.libraryPapers];
  if (folder && folder !== "root") {
    items = items.filter((paper) => paper.folder_id === Number(folder));
  } else if (folder === "root") {
    items = [];
  }
  if (query) {
    items = items.filter((paper) =>
      [paper.title, paper.abstract, paper.venue, paper.doi]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query)),
    );
  }
  items.sort((a, b) =>
    order === "asc"
      ? a.created_at.localeCompare(b.created_at)
      : b.created_at.localeCompare(a.created_at),
  );
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length };
}

function syncFolderCounts() {
  const database = getMockDatabase();
  for (const folder of database.folders) {
    folder.paper_count = database.libraryPapers.filter(
      (paper) => paper.folder_id === folder.id,
    ).length;
  }
  persistMockDatabase();
}

function userBillingOverview() {
  // 会员档位 / 经费 / 刷新券由 Mock 面板的 BILLING 区自由组合(billing-state.ts),
  // 供「经费不足提醒充值」等条件化场景演示。
  const billing = getMockBilling();
  const paid = billing.tier !== "free";
  return {
    tier: billing.tier,
    ...(paid ? { cycle: "yearly", expires_at: "2027-03-18T00:00:00.000Z" } : {}),
    token: {
      used: 0,
      ceiling: 0,
      percent: 37,
      unlimited: false,
      consumed_today: 0,
      window_days: 7,
      window_started_at: "2026-08-16T00:00:00.000Z",
      window_reset_at: "2026-08-23T00:00:00.000Z",
    },
    credit: billing.credit
      ? {
          temp: 168,
          perm: 520,
          total: 688,
          credit_autopay: billing.autopay,
          lots: [
            {
              amount: 168,
              expires_at: "2026-09-01T00:00:00.000Z",
              source: "yearly_bonus",
            },
          ],
        }
      : { temp: 0, perm: 0, total: 0, credit_autopay: billing.autopay, lots: [] },
    reset_passes: billing.passes ? 2 : 0,
    reset_pass_next_expiry: billing.passes ? "2026-09-01T00:00:00.000Z" : null,
  };
}

export async function handleCoreMock(
  request: Request,
  path: string,
): Promise<Response | undefined> {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  if (method === "GET" && path === "/mock-assets/paper.pdf") {
    return new HttpResponse(MOCK_PDF, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="scholay-mock-paper.pdf"',
      },
    });
  }

  // ── 鉴权与用户档案 ──────────────────────────────────────────────────────
  if (
    method === "POST" &&
    /^\/user\/(?:login|login-phone|login-with-code|login-phone-with-code|register|register-phone|google\/id-token-login|wechat\/callback)$/.test(
      path,
    )
  ) {
    const body = await bodyAsRecord(request);
    const credential = String(body.email ?? body.phone ?? "");
    const persona = credential.toLowerCase().includes("admin")
      ? "admin"
      : "researcher";
    const definition = applyMockPersona(persona);
    // 注册 / 扫码·Google 一键 → 视为新用户;纯密码/验证码登录 → 老用户
    const isNewUser =
      /\/(?:register|register-phone|google\/id-token-login|wechat\/callback)$/.test(
        path,
      );
    return ok({
      token: definition.token,
      user: profileForPersona(persona),
      is_new_user: isNewUser,
    });
  }
  if (method === "GET" && path === "/user/invitation/overview") {
    if (!hasMockSession()) return unauthorized();
    const persona = getMockPersona();
    const profile = profileForPersona(persona);
    const promoCode =
      persona === "admin"
        ? "ADM0001"
        : persona === "operations"
          ? "OPS1002"
          : "LYU1001";
    let bound: string | null = null;
    try {
      bound = sessionStorage.getItem("scholay.mock.invite_bound");
    } catch {
      bound = null;
    }
    return ok({
      promo_code: promoCode,
      promo_link: `/?invite=${promoCode}`,
      registered_count: persona === "researcher" ? 12 : 3,
      verified_count: persona === "researcher" ? 5 : 1,
      reward_total: persona === "researcher" ? 480 : 60,
      bound_upline_code: bound,
      // 顺带回一点档案方便调试
      user_id: profile?.id ?? 0,
    });
  }
  if (method === "POST" && path === "/user/invitation/bind") {
    if (!hasMockSession()) return unauthorized();
    const body = await bodyAsRecord(request);
    const code = String(body.invitation_code ?? "").trim().toUpperCase();
    const allowed = ["SCHOLAY2026", "WELCOME", "INVITE-DEMO"];
    if (!allowed.includes(code)) {
      return HttpResponse.json(
        { code: 400, message: "邀请码无效或已失效", data: null },
        { status: 400 },
      );
    }
    try {
      const existing = sessionStorage.getItem("scholay.mock.invite_bound");
      if (existing) {
        return HttpResponse.json(
          { code: 400, message: "已绑定过上级邀请码，不可重复绑定", data: null },
          { status: 400 },
        );
      }
      sessionStorage.setItem("scholay.mock.invite_bound", code);
    } catch {
      // 隐私模式仍允许本次成功响应
    }
    return emptyOk();
  }
  if (
    method === "POST" &&
    /^\/user\/(?:send-code|send-phone-code|reset-password|reset-password-phone)$/.test(
      path,
    )
  ) {
    return emptyOk();
  }
  if (method === "POST" && path === "/user/logout") {
    setMockPersona("visitor");
    return emptyOk();
  }
  if (method === "GET" && path === "/user/profile") {
    const profile = profileForPersona();
    return profile ? ok(profile) : unauthorized();
  }
  if (method === "PUT" && path === "/user/profile") {
    if (!hasMockSession()) return unauthorized();
    const body = await bodyAsRecord(request);
    return ok({
      ...profileForPersona(),
      ...body,
      updated_at: new Date().toISOString(),
    });
  }
  if (
    method === "POST" &&
    /^\/user\/(?:bind-|unbind-|change-password|bind-email|bind-phone)/.test(
      path,
    )
  ) {
    return emptyOk();
  }
  if (
    method === "GET" &&
    /^\/user\/(?:github|google|apple|microsoft|orcid|discourse)\/login-url$/.test(
      path,
    )
  ) {
    const provider = path.split("/")[2];
    if (provider === "discourse") {
      return ok({
        url: "/discourse/callback?sso=bW9ja19zc29fcGF5bG9hZA%3D%3D&sig=mock-signature",
      });
    }
    return ok({
      url: `/${provider}/callback?code=mock-code&state=mock-state`,
    });
  }
  if (
    method === "GET" &&
    /^\/user\/(?:github|google|apple|microsoft|orcid|discourse)\/callback$/.test(
      path,
    )
  ) {
    const definition = applyMockPersona("researcher");
    return ok({
      token: definition.token,
      user: profileForPersona("researcher"),
      // Mock:第三方 callback 一律按新用户,方便演示首次邀请码提醒
      is_new_user: true,
    });
  }
  if (method === "GET" && path === "/user/apple/bind-url") {
    return ok({ url: "/settings/connections?mockBound=apple" });
  }
  if (method === "GET" && path === "/user/wechat/qrcode-config") {
    return ok({
      app_id: "mock-wechat-app",
      scope: "snsapi_login",
      redirect_uri: "/wechat/callback",
      state: "mock-wechat-state",
    });
  }
  if (method === "GET" && path === "/user/oauth/pending-merge") {
    return ok({
      provider: "github",
      providerEmail: "lin.yu@scholay.mock",
      existingEmail: "lin.yu@scholay.mock",
    });
  }
  if (
    method === "POST" &&
    /^\/user\/oauth\/(?:confirm|cancel)-merge$/.test(path)
  ) {
    const definition = applyMockPersona("researcher");
    return ok({
      token: definition.token,
      user: profileForPersona("researcher"),
      // cancel-merge = 新建独立账号 → 新用户;confirm-merge = 绑到已有号
      is_new_user: path.endsWith("cancel-merge"),
    });
  }

  // ── 文献集与分享 ────────────────────────────────────────────────────────
  if (path.startsWith("/user/library") && !hasMockSession())
    return unauthorized();

  if (method === "GET" && path === "/user/library/folders") {
    const database = getMockDatabase();
    syncFolderCounts();
    return ok({
      folders: database.folders,
      total_count: database.libraryPapers.length,
      root_count: 0,
    });
  }
  if (method === "POST" && path === "/user/library/folders") {
    const body = await bodyAsRecord(request);
    const database = updateMockDatabase((draft) => {
      draft.folders.push({
        id: nextMockId(draft.folders),
        user_id: 1001,
        name: String(body.name || `新建文件夹 ${draft.folders.length + 1}`),
        position: draft.folders.length,
        is_default: false,
        paper_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
    return ok(database.folders.at(-1), { status: 201 });
  }
  const folderMatch = path.match(/^\/user\/library\/folders\/(\d+)$/);
  if (folderMatch && method === "PATCH") {
    const body = await bodyAsRecord(request);
    const id = Number(folderMatch[1]);
    let updated = getMockDatabase().folders.find((folder) => folder.id === id);
    updateMockDatabase((draft) => {
      const folder = draft.folders.find((item) => item.id === id);
      if (!folder || folder.is_default) return;
      folder.name = String(body.name ?? folder.name);
      folder.updated_at = new Date().toISOString();
      updated = folder;
    });
    return ok(updated);
  }
  if (folderMatch && method === "DELETE") {
    const id = Number(folderMatch[1]);
    updateMockDatabase((draft) => {
      const fallback =
        draft.folders.find((folder) => folder.is_default)?.id ?? 1;
      draft.folders = draft.folders.filter(
        (folder) => folder.id !== id || folder.is_default,
      );
      for (const paper of draft.libraryPapers) {
        if (paper.folder_id === id) paper.folder_id = fallback;
      }
    });
    syncFolderCounts();
    return emptyOk();
  }
  if (method === "GET" && path === "/user/library") {
    return ok(libraryList(url));
  }
  if (method === "POST" && path === "/user/library/check") {
    const body = await bodyAsRecord(request);
    const ids = Array.isArray(body.paper_ids) ? body.paper_ids.map(String) : [];
    const source = String(body.source ?? "stc");
    const saved = Object.fromEntries(
      ids.map((id) => [
        id,
        getMockDatabase().libraryPapers.some(
          (paper) => paper.source === source && paper.source_paper_id === id,
        ),
      ]),
    );
    return ok({ saved });
  }
  if (method === "POST" && path === "/user/library") {
    const body = await bodyAsRecord(request);
    const database = getMockDatabase();
    const sourceId = String(body.source_paper_id ?? "");
    const source = String(body.source ?? "stc") as UserLibraryPaper["source"];
    const existing = database.libraryPapers.find(
      (paper) => paper.source === source && paper.source_paper_id === sourceId,
    );
    if (existing) return ok({ ...existing, already_existed: true });
    let created: UserLibraryPaper | undefined;
    updateMockDatabase((draft) => {
      const folderId =
        typeof body.folder_id === "number"
          ? body.folder_id
          : (draft.folders.find((folder) => folder.is_default)?.id ?? 1);
      created = {
        id: nextMockId(draft.libraryPapers),
        folder_id: folderId,
        source,
        source_paper_id: sourceId,
        title: String(body.title ?? "未命名论文"),
        authors: Array.isArray(body.authors)
          ? (body.authors as UserLibraryPaper["authors"])
          : [],
        abstract: typeof body.abstract === "string" ? body.abstract : undefined,
        year: typeof body.year === "number" ? body.year : undefined,
        venue: typeof body.venue === "string" ? body.venue : undefined,
        doi: typeof body.doi === "string" ? body.doi : undefined,
        pdf_url: typeof body.pdf_url === "string" ? body.pdf_url : undefined,
        citation_count:
          typeof body.citation_count === "number"
            ? body.citation_count
            : undefined,
        link_state: "linked",
        origin: "search",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      draft.libraryPapers.unshift(created);
    });
    syncFolderCounts();
    return ok(created, { status: 201 });
  }
  const byUpstream = path.match(
    /^\/user\/library\/by-upstream\/([^/]+)\/(.+)$/,
  );
  if (byUpstream && method === "GET") {
    const [, source, rawId] = byUpstream;
    const id = decodeURIComponent(rawId);
    return ok(
      getMockDatabase().libraryPapers.find(
        (paper) => paper.source === source && paper.source_paper_id === id,
      ) ?? null,
    );
  }
  const favoriteDelete = path.match(/^\/user\/library\/([^/]+)\/(.+)$/);
  if (
    favoriteDelete &&
    method === "DELETE" &&
    !["folders", "papers", "shares"].includes(favoriteDelete[1])
  ) {
    const [, source, rawId] = favoriteDelete;
    const id = decodeURIComponent(rawId);
    updateMockDatabase((draft) => {
      draft.libraryPapers = draft.libraryPapers.filter(
        (paper) => !(paper.source === source && paper.source_paper_id === id),
      );
    });
    syncFolderCounts();
    return emptyOk();
  }
  const libraryPaper = path.match(
    /^\/user\/library\/papers\/(\d+)(?:\/(folder|pdf|unlink|relink|relink-search))?$/,
  );
  if (libraryPaper) {
    const id = Number(libraryPaper[1]);
    const action = libraryPaper[2];
    const database = getMockDatabase();
    const paper = database.libraryPapers.find((item) => item.id === id);
    if (!paper) {
      return HttpResponse.json(
        { code: 404, message: "文献不存在" },
        { status: 404 },
      );
    }
    if (action === "pdf" && method === "GET") {
      return new HttpResponse(MOCK_PDF, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${paper.pdf_original_filename ?? "mock-paper.pdf"}"`,
        },
      });
    }
    if (action === "pdf" && method === "POST") {
      paper.pdf_original_filename = "uploaded-design-paper.pdf";
      paper.pdf_size = 148_320;
      paper.pdf_mime = "application/pdf";
      paper.pdf_uploaded_at = new Date().toISOString();
      persistMockDatabase();
      return ok(paper);
    }
    if (action === "pdf" && method === "DELETE") {
      paper.pdf_original_filename = undefined;
      paper.pdf_size = undefined;
      paper.pdf_mime = undefined;
      paper.pdf_uploaded_at = null;
      persistMockDatabase();
      return emptyOk();
    }
    if (action === "folder" && method === "PATCH") {
      const body = await bodyAsRecord(request);
      paper.folder_id = Number(body.folder_id);
      paper.updated_at = new Date().toISOString();
      persistMockDatabase();
      syncFolderCounts();
      return ok(paper);
    }
    if (!action && method === "PATCH") {
      Object.assign(paper, await bodyAsRecord(request), {
        updated_at: new Date().toISOString(),
      });
      persistMockDatabase();
      return ok(paper);
    }
    if (action === "relink-search" && method === "POST") {
      const body = await bodyAsRecord(request);
      const usedTitle = String(body.title ?? paper.og_title ?? paper.title);
      const hits = mockPapers.slice(0, 5).map((candidate) => ({
        source: candidate.source ?? "stc",
        source_paper_id: candidate.paperId,
        title: candidate.title,
        abstract: candidate.abstract,
        year: candidate.year,
        venue: candidate.venue,
        doi: candidate.externalIds?.DOI,
        citation_count: candidate.citationCount,
        pdf_url: candidate.openAccessPdf?.url,
        authors: candidate.authors,
        match_type: "search",
        match_score: candidate.paperId === mockPapers[0]?.paperId ? 0.96 : 0.84,
        already_saved: database.libraryPapers.some(
          (saved) =>
            saved.id !== id &&
            saved.source === candidate.source &&
            saved.source_paper_id === candidate.paperId,
        ),
      }));
      return ok({ used_title: usedTitle, hits });
    }
    if (action === "relink" && method === "POST") {
      const body = await bodyAsRecord(request);
      const link =
        typeof body.link === "object" && body.link !== null
          ? (body.link as Record<string, unknown>)
          : body;
      const source = String(link.source ?? "stc") as UserLibraryPaper["source"];
      const sourcePaperId = String(
        link.source_paper_id ?? paper.source_paper_id,
      );
      const existing = database.libraryPapers.find(
        (candidate) =>
          candidate.id !== paper.id &&
          candidate.source === source &&
          candidate.source_paper_id === sourcePaperId,
      );
      if (existing) {
        Object.assign(existing, {
          pdf_original_filename:
            paper.pdf_original_filename ?? existing.pdf_original_filename,
          pdf_size: paper.pdf_size ?? existing.pdf_size,
          pdf_sha256: paper.pdf_sha256 ?? existing.pdf_sha256,
          pdf_mime: paper.pdf_mime ?? existing.pdf_mime,
          pdf_uploaded_at: paper.pdf_uploaded_at ?? existing.pdf_uploaded_at,
          og_title: paper.og_title ?? existing.og_title,
          og_abstract: paper.og_abstract ?? existing.og_abstract,
          og_authors: paper.og_authors ?? existing.og_authors,
          og_year: paper.og_year ?? existing.og_year,
          og_venue: paper.og_venue ?? existing.og_venue,
          og_doi: paper.og_doi ?? existing.og_doi,
          updated_at: new Date().toISOString(),
        });
        database.libraryPapers = database.libraryPapers.filter(
          (candidate) => candidate.id !== paper.id,
        );
        persistMockDatabase();
        syncFolderCounts();
        return ok({ paper: existing, merged: true });
      }
      paper.source = source;
      paper.source_paper_id = sourcePaperId;
      paper.title = String(link.title ?? paper.title);
      paper.abstract =
        typeof link.abstract === "string" ? link.abstract : paper.abstract;
      paper.year = typeof link.year === "number" ? link.year : paper.year;
      paper.venue = typeof link.venue === "string" ? link.venue : paper.venue;
      paper.doi = typeof link.doi === "string" ? link.doi : paper.doi;
      paper.citation_count =
        typeof link.citation_count === "number"
          ? link.citation_count
          : paper.citation_count;
      paper.pdf_url =
        typeof link.pdf_url === "string" ? link.pdf_url : paper.pdf_url;
      if (Array.isArray(link.authors)) {
        paper.authors = link.authors as UserLibraryPaper["authors"];
      }
      paper.link_state = "linked";
      paper.updated_at = new Date().toISOString();
      persistMockDatabase();
      return ok({ paper, merged: false });
    }
    if (action === "unlink" && method === "DELETE") {
      paper.source = "local";
      paper.link_state = "free";
      persistMockDatabase();
      return ok(paper);
    }
  }
  if (method === "POST" && path === "/user/library/papers/batch/move") {
    const body = await bodyAsRecord(request);
    const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    updateMockDatabase((draft) => {
      for (const paper of draft.libraryPapers) {
        if (ids.includes(paper.id)) paper.folder_id = Number(body.folder_id);
      }
    });
    syncFolderCounts();
    return ok({ affected: ids.length });
  }
  if (method === "POST" && path === "/user/library/papers/batch/delete") {
    const body = await bodyAsRecord(request);
    const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    updateMockDatabase((draft) => {
      draft.libraryPapers = draft.libraryPapers.filter(
        (paper) => !ids.includes(paper.id),
      );
    });
    syncFolderCounts();
    return ok({ affected: ids.length });
  }
  if (method === "POST" && path === "/user/library/papers/upload-and-resolve") {
    const body = await bodyAsRecord(request);
    const file = body.file;
    const filename =
      typeof File !== "undefined" && file instanceof File
        ? file.name
        : "trustworthy-research-agent.pdf";
    const jobId = `mock-upload-${Date.now().toString(36)}`;
    const title = filename
      .replace(/\.pdf$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    const resolvedTitle =
      title || "Designing Trustworthy Research Agents for Scientific Work";
    const abstract =
      "This mock manuscript studies provenance, reversible actions, and calibrated uncertainty in AI-assisted research workflows.";
    const sha256 = "mock-sha256-7e91b437dca24465";
    uploadJobs.set(jobId, {
      filename,
      title: resolvedTitle,
      abstract,
      sha256,
    });
    const hits = mockPapers.slice(0, 3).map((paper, index) => ({
      source: paper.source ?? "stc",
      source_paper_id: paper.paperId,
      title: paper.title,
      abstract: paper.abstract,
      year: paper.year,
      venue: paper.venue,
      doi: paper.externalIds?.DOI,
      citation_count: paper.citationCount,
      pdf_url: paper.openAccessPdf?.url,
      authors: paper.authors,
      match_type: index === 0 ? "title_match" : "search",
      match_score: index === 0 ? 0.94 : 0.8 - index * 0.06,
      already_saved: getMockDatabase().libraryPapers.some(
        (saved) =>
          saved.source === paper.source &&
          saved.source_paper_id === paper.paperId,
      ),
    }));
    const events = [
      [
        "parsed",
        {
          title: resolvedTitle,
          abstract,
          sha256,
          has_text: true,
          extracted_doi: "10.5555/scholay.mock.2026",
          authors: ["Yu Lin", "Fei-Fei Li"],
          year: 2026,
          venue: "Journal of Human-AI Research",
        },
      ],
      ["searched", { papers: hits }],
      ["ready", { job_id: jobId }],
    ]
      .map(
        ([event, payload]) =>
          `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
      )
      .join("");
    return new HttpResponse(events, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }
  if (method === "POST" && path === "/user/library/papers/confirm-upload-job") {
    const body = await bodyAsRecord(request);
    const jobId = String(body.job_id ?? "");
    const job =
      uploadJobs.get(jobId) ??
      ({
        filename: "trustworthy-research-agent.pdf",
        title: "Designing Trustworthy Research Agents",
        abstract: "A browser-local design fixture for the PDF import workflow.",
        sha256: "mock-sha256-fallback",
      } as const);
    const link =
      typeof body.link === "object" && body.link !== null
        ? (body.link as Record<string, unknown>)
        : null;
    const source = String(
      link?.source ?? "local",
    ) as UserLibraryPaper["source"];
    const sourcePaperId = String(
      link?.source_paper_id ?? `local-${jobId || Date.now()}`,
    );
    const database = getMockDatabase();
    const existing = link
      ? database.libraryPapers.find(
          (paper) =>
            paper.source === source && paper.source_paper_id === sourcePaperId,
        )
      : undefined;
    if (existing) {
      Object.assign(existing, {
        pdf_original_filename: job.filename,
        pdf_size: 428_160,
        pdf_sha256: job.sha256,
        pdf_mime: "application/pdf",
        pdf_uploaded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      persistMockDatabase();
      uploadJobs.delete(jobId);
      return ok({ paper: existing, merged: true });
    }

    const now = new Date().toISOString();
    const created: UserLibraryPaper = {
      id: nextMockId(database.libraryPapers),
      folder_id:
        typeof body.folder_id === "number"
          ? body.folder_id
          : (database.folders.find((folder) => folder.is_default)?.id ?? 1),
      source,
      source_paper_id: sourcePaperId,
      title: String(link?.title ?? ""),
      abstract: typeof link?.abstract === "string" ? link.abstract : undefined,
      authors: Array.isArray(link?.authors)
        ? (link.authors as UserLibraryPaper["authors"])
        : [],
      year: typeof link?.year === "number" ? link.year : undefined,
      venue: typeof link?.venue === "string" ? link.venue : undefined,
      doi: typeof link?.doi === "string" ? link.doi : undefined,
      citation_count:
        typeof link?.citation_count === "number"
          ? link.citation_count
          : undefined,
      pdf_url: typeof link?.pdf_url === "string" ? link.pdf_url : undefined,
      pdf_original_filename: job.filename,
      pdf_size: 428_160,
      pdf_sha256: job.sha256,
      pdf_mime: "application/pdf",
      pdf_uploaded_at: now,
      og_title: link ? undefined : job.title,
      og_abstract: link ? undefined : job.abstract,
      og_authors: link
        ? undefined
        : [
            { authorId: "mock-upload-author", name: "Yu Lin" },
            { authorId: "mock-upload-coauthor", name: "Fei-Fei Li" },
          ],
      og_year: link ? undefined : 2026,
      og_venue: link ? undefined : "Journal of Human-AI Research",
      og_doi: link ? undefined : "10.5555/scholay.mock.2026",
      link_state: link ? "linked" : "free",
      origin: "upload",
      created_at: now,
      updated_at: now,
    };
    updateMockDatabase((draft) => {
      draft.libraryPapers.unshift(created);
    });
    syncFolderCounts();
    uploadJobs.delete(jobId);
    return ok({ paper: created, merged: false });
  }
  if (method === "GET" && path === "/user/library/shares") {
    return ok({
      shares: [
        {
          id: 1,
          token: "mock-reading-list",
          kind: "collection",
          entity_type: "folder",
          title: "重点阅读",
          subtitle: "可信 AI 与基础模型",
          paper_count: 3,
          extract_code: "2026",
          expires_at: null,
          allow_save: true,
          status: "active",
          view_count: 28,
          save_count: 6,
          created_at: "2026-07-24T08:00:00.000Z",
        },
      ],
    });
  }
  if (method === "POST" && path === "/user/library/shares") {
    const body = await bodyAsRecord(request);
    const token = `mock-${Date.now().toString(36)}`;
    return ok({
      id: Date.now(),
      token,
      path: `/s/${token}`,
      kind: body.kind ?? "collection",
      title: body.title ?? "我的 Scholay 分享",
      paper_count: body.kind === "single" ? 1 : 3,
      extract_code: body.with_code === false ? "" : "2026",
      expires_at: null,
      allow_save: body.allow_save !== false,
      papers: mockPapers.slice(0, 3),
    });
  }
  if (method === "GET" && /^\/user\/library\/shares\/\d+\/access$/.test(path)) {
    return ok({
      view_count: 28,
      save_count: 6,
      records: [
        {
          id: 1,
          viewer_label: "匿名访客",
          action: "view",
          item_count: 3,
          created_at: "2026-07-28T03:20:00.000Z",
        },
      ],
    });
  }
  if (method === "DELETE" && /^\/user\/library\/shares\/\d+$/.test(path))
    return emptyOk();
  if (method === "GET" && /^\/public\/share\/[^/]+$/.test(path)) {
    const needCode = url.searchParams.get("code") !== "2026";
    return ok({
      need_code: needCode,
      token: path.split("/").at(-1),
      kind: "collection",
      entity_type: "folder",
      title: "重点阅读",
      subtitle: "可信 AI 与基础模型",
      paper_count: 3,
      allow_save: true,
      author_count: 6,
      sharer: "林屿",
      papers: needCode ? mockPapers.slice(0, 1) : mockPapers.slice(0, 3),
    });
  }
  if (
    method === "POST" &&
    /^\/user\/library\/shares\/[^/]+\/save$/.test(path)
  ) {
    return ok({
      added: 3,
      skipped: 0,
      total: 3,
      folder_id: 1,
      folder_name: "重点阅读",
    });
  }

  // ── 检索暂存区与分析矩阵 ────────────────────────────────────────────────
  if (path.startsWith("/user/staging-areas") && !hasMockSession())
    return unauthorized();
  if (method === "GET" && path === "/user/staging-areas") {
    return ok({ areas: getMockDatabase().stagingAreas });
  }
  if (method === "POST" && path === "/user/staging-areas") {
    const body = await bodyAsRecord(request);
    let created: RemoteStagingArea | undefined;
    updateMockDatabase((draft) => {
      created = {
        id: nextMockId(draft.stagingAreas),
        user_id: 1001,
        name: String(body.name || `暂存区 ${draft.stagingAreas.length + 1}`),
        position: draft.stagingAreas.length,
        papers: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      draft.stagingAreas.push(created);
    });
    return ok(created, { status: 201 });
  }
  const reorderStaging = path.match(
    /^\/user\/staging-areas\/(\d+)\/papers\/reorder$/,
  );
  if (reorderStaging && method === "PATCH") {
    const areaId = Number(reorderStaging[1]);
    const area = getMockDatabase().stagingAreas.find(
      (item) => item.id === areaId,
    );
    if (!area)
      return HttpResponse.json(
        { code: 404, message: "暂存区不存在" },
        { status: 404 },
      );
    const body = await bodyAsRecord(request);
    const paperIds = Array.isArray(body.paper_ids)
      ? body.paper_ids.map((id) => String(id))
      : [];
    const current = area.papers ?? [];
    if (
      paperIds.length !== current.length ||
      paperIds.some(
        (id) => !current.some((paper) => paper.source_paper_id === id),
      )
    ) {
      return HttpResponse.json(
        { code: 400, message: "paper_ids 与区内论文不一致" },
        { status: 400 },
      );
    }
    const byId = new Map(
      current.map((paper) => [paper.source_paper_id, paper]),
    );
    area.papers = paperIds.map((id, index) => ({
      ...byId.get(id)!,
      position: index,
    }));
    persistMockDatabase();
    return ok({ reordered: true });
  }
  const staging = path.match(
    /^\/user\/staging-areas\/(\d+)(?:\/papers(?:\/([^/]+)\/(.+))?)?$/,
  );
  if (staging) {
    const areaId = Number(staging[1]);
    const area = getMockDatabase().stagingAreas.find(
      (item) => item.id === areaId,
    );
    if (!area)
      return HttpResponse.json(
        { code: 404, message: "暂存区不存在" },
        { status: 404 },
      );
    if (!path.includes("/papers") && method === "PATCH") {
      const body = await bodyAsRecord(request);
      area.name = String(body.name ?? area.name);
      area.updated_at = new Date().toISOString();
      persistMockDatabase();
      return ok(area);
    }
    if (!path.includes("/papers") && method === "DELETE") {
      updateMockDatabase((draft) => {
        draft.stagingAreas = draft.stagingAreas.filter(
          (item) => item.id !== areaId,
        );
      });
      return emptyOk();
    }
    if (path.endsWith("/papers") && method === "POST") {
      const body = await bodyAsRecord(request);
      const created: RemoteStagingPaper = {
        id: Math.max(0, ...(area.papers ?? []).map((paper) => paper.id)) + 1,
        area_id: areaId,
        source: String(body.source ?? "stc") as RemoteStagingPaper["source"],
        source_paper_id: String(body.source_paper_id ?? ""),
        title: String(body.title ?? "未命名论文"),
        authors: Array.isArray(body.authors)
          ? (body.authors as RemoteStagingPaper["authors"])
          : [],
        year: typeof body.year === "number" ? body.year : undefined,
        venue: typeof body.venue === "string" ? body.venue : undefined,
        abstract: typeof body.abstract === "string" ? body.abstract : undefined,
        citation_count:
          typeof body.citation_count === "number"
            ? body.citation_count
            : undefined,
        is_open_access: body.is_open_access === true,
        position: area.papers?.length ?? 0,
        created_at: new Date().toISOString(),
      };
      area.papers = [...(area.papers ?? []), created];
      persistMockDatabase();
      return ok(created);
    }
    if (path.endsWith("/papers") && method === "DELETE") {
      area.papers = [];
      persistMockDatabase();
      return emptyOk();
    }
    if (staging[2] && staging[3] && method === "DELETE") {
      const source = staging[2];
      const paperId = decodeURIComponent(staging[3]);
      area.papers = (area.papers ?? []).filter(
        (paper) =>
          !(paper.source === source && paper.source_paper_id === paperId),
      );
      persistMockDatabase();
      return emptyOk();
    }
  }
  if (method === "POST" && path === "/user/staging-areas/migrate") {
    return ok({ areas: getMockDatabase().stagingAreas, merged: 2, skipped: 0 });
  }
  if (method === "GET" && path === "/analysis/dimensions") {
    return ok({
      dimensions,
      total: dimensions.length,
      isCustom: false,
      maxDimensions: 15,
      customCount: 0,
    });
  }
  if (method === "GET" && path === "/analysis/dimensions/settings") {
    return ok({
      dimensions: dimensions.map((dimension) => ({
        ...dimension,
        isSystem: true,
        isCustomized: false,
      })),
      total: dimensions.length,
      maxDimensions: 15,
    });
  }
  if (method === "POST" && path === "/analysis/papers/batch") {
    const body = await bodyAsRecord(request);
    const papers = Array.isArray(body.papers)
      ? (body.papers as Array<Record<string, unknown>>)
      : [];
    return ok({
      results: papers.map((paper) => ({
        paperId: String(paper.paperId ?? ""),
        success: true,
        from_cache: false,
        data: {
          research_question:
            "如何在提升模型能力的同时，保持结果可验证并控制外推风险？",
          method: "结合大规模预训练、对照实验与多数据集消融分析。",
          evidence:
            "核心指标在多个基准上稳定提升，且消融结果支持主要设计选择。",
          limitation:
            "数据覆盖与真实部署环境仍有限，长期人机协作影响有待验证。",
        },
        dimensions: dimensions.map((dimension) => ({
          key: dimension.dimensionKey,
          name: dimension.name,
          value:
            dimension.dimensionKey === "method"
              ? "大规模预训练 + 对照实验 + 消融分析"
              : dimension.dimensionKey === "evidence"
                ? "跨数据集结果一致，主要效应方向稳定"
                : dimension.dimensionKey === "limitation"
                  ? "外部有效性与长期影响仍需验证"
                  : "能力提升如何兼顾可靠性与可追溯性",
        })),
      })),
    });
  }
  if (
    path.startsWith("/analysis/dimensions") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(method)
  ) {
    const body = await bodyAsRecord(request);
    return ok({
      id: Number(path.split("/").at(-1)) || dimensions.length + 1,
      dimensionKey: body.dimensionKey ?? "custom_dimension",
      name: body.name ?? "自定义维度",
      description: body.description ?? "用于产品设计调试的自定义分析维度",
      sortOrder: body.sortOrder ?? dimensions.length + 1,
      isActive: true,
      isHidden: body.visible === false,
      isSystem: false,
      isCustomized: true,
    });
  }

  // ── 会员、支付、模型与连接 ─────────────────────────────────────────────
  if (method === "GET" && path === "/billing/plans") {
    return ok({
      free_daily_tokens: 14,
      free_window_tokens: 100,
      window_days: 7,
      reset_cost_credits: 12,
      recharge_rate: 100,
      min_recharge_cents: 1000,
      popular_plan: "pro",
      enabled: true,
      test_payment: true,
      subscription_year_days: 365,
      payment_methods: { alipay: true, wechat: false },
      plans: [
        {
          tier: "free",
          price_cents: 0,
          original_cents: 0,
          multiplier: 1,
          grant_credits: 0,
          year_price_cents: 0,
          year_original_cents: 0,
          year_grant_credits: 0,
        },
        {
          tier: "pro",
          price_cents: 3900,
          original_cents: 5900,
          multiplier: 4,
          grant_credits: 50,
          year_price_cents: 32800,
          year_original_cents: 46800,
          year_grant_credits: 1200,
        },
        {
          tier: "max",
          price_cents: 9900,
          original_cents: 12900,
          multiplier: 12,
          grant_credits: 200,
          year_price_cents: 88800,
          year_original_cents: 118800,
          year_grant_credits: 3600,
        },
      ],
    });
  }
  if (path.startsWith("/user/billing") && !hasMockSession())
    return unauthorized();
  if (method === "GET" && path === "/user/billing/overview")
    return ok(userBillingOverview());
  if (method === "GET" && path === "/user/billing/orders") {
    return ok({
      items: [
        {
          id: 1,
          order_no: "MOCK20260718001",
          order_type: "subscription",
          plan_code: "pro_yearly",
          plan_name: "Pro 年度会员",
          billing_cycle: "yearly",
          amount: 468,
          final_amount: 328,
          credits_granted: 1200,
          status: "paid",
          payment_method: "alipay",
          created_at: "2026-07-18T08:00:00.000Z",
          payment_time: "2026-07-18T08:02:00.000Z",
        },
      ],
    });
  }
  if (method === "GET" && path === "/user/billing/transactions") {
    return ok({
      items: [
        {
          id: 1,
          type: "grant_subscription",
          amount: 100,
          temp_after: 168,
          perm_after: 520,
          ref_type: "order",
          ref_id: "MOCK20260718001",
          note: "年度会员科研经费",
          created_at: "2026-07-18T08:02:00.000Z",
        },
        {
          id: 2,
          type: "reset_consume",
          amount: -12,
          temp_after: 168,
          perm_after: 520,
          ref_type: "quota_reset",
          ref_id: "mock-reset",
          note: "手动重置 AI 额度",
          created_at: "2026-07-25T09:20:00.000Z",
        },
      ],
      total: 2,
    });
  }
  if (method === "GET" && path === "/user/billing/usage-calendar") {
    return ok({
      days: Array.from({ length: 28 }, (_, index) => ({
        date: `2026-07-${String(index + 1).padStart(2, "0")}`,
        cost: ((index * 37) % 91) + 5,
      })),
      daily_ceiling: 100,
    });
  }
  if (method === "GET" && path === "/user/billing/subscribe/quote") {
    const tier = url.searchParams.get("tier") === "max" ? "max" : "pro";
    const cycle =
      url.searchParams.get("cycle") === "yearly" ? "yearly" : "monthly";
    const amount =
      tier === "max"
        ? cycle === "yearly"
          ? 888
          : 99
        : cycle === "yearly"
          ? 328
          : 39;
    return ok({
      tier,
      cycle,
      action: "upgrade",
      amount_cents: amount * 100,
      original_cents: Math.round(amount * 1.35) * 100,
      final_amount: amount,
      current_tier: "pro",
    });
  }
  if (method === "POST" && path === "/user/redeem-code/preview") {
    return ok({
      grant_kind: "credit",
      grant_credits: 100,
      credit_kind: "perm",
      note: "产品设计演示兑换码",
      valid_until: null,
      uses_left: 99,
    });
  }
  if (method === "POST" && path === "/user/redeem-code") {
    return ok({ kind: "credit", credits: 100, credit_kind: "perm" });
  }
  if (method === "POST" && path === "/user/billing/reset") {
    return ok({ used: 0, ceiling: 0, balance: userBillingOverview().credit });
  }
  if (method === "PUT" && path === "/user/billing/autopay") {
    // 「用经费继续」开关落到 mock 计费状态,overview 下次返回即反映。
    const body = await bodyAsRecord(request);
    setMockBilling({ autopay: Boolean(body.enabled) });
    return emptyOk();
  }
  if (
    method === "POST" &&
    /^\/user\/billing\/(?:recharge|subscribe)$/.test(path)
  ) {
    const body = await bodyAsRecord(request);
    return ok({
      order_no: `MOCK${Date.now()}`,
      order_type: path.endsWith("recharge") ? "recharge" : "subscription",
      plan_code: body.plan ?? "pro",
      plan_name: body.plan === "max" ? "Max 会员" : "Pro 会员",
      billing_cycle: body.cycle ?? "monthly",
      amount: 39,
      final_amount: 39,
      credits_granted: 50,
      status: "pending",
    });
  }
  if (method === "POST" && path === "/user/billing/test-pay")
    return ok(userBillingOverview());
  if (method === "POST" && path === "/user/payment/alipay/create") {
    const body = await bodyAsRecord(request);
    return ok({
      payment_url: "/settings/membership?mockPayment=success",
      order_no: body.order_no ?? `MOCK${Date.now()}`,
    });
  }
  if (method === "GET" && path === "/user/models") return ok(modelCatalog);
  if (method === "GET" && path === "/user/connections") {
    return ok({
      login_methods_count: 3,
      connections: [
        {
          provider: "email",
          bound: true,
          display_name: "lin.yu@scholay.mock",
          created_at: "2025-03-18T08:30:00.000Z",
        },
        {
          provider: "github",
          bound: true,
          display_name: "linyu-research",
          created_at: "2026-01-12T04:20:00.000Z",
        },
        { provider: "orcid", bound: false },
        { provider: "wechat", bound: false },
      ],
    });
  }

  const journalSubmission = path.match(
    /^\/user\/journals\/(\d+)\/submission\/(guideline|latex)$/,
  );
  if (method === "GET" && journalSubmission) {
    const journalId = journalSubmission[1];
    const kind = journalSubmission[2];
    const name = url.searchParams.get("name") || `journal-${journalId}`;
    if (kind === "guideline") {
      return HttpResponse.text(
        `# ${name} 投稿须知（Mock）\n\n- 文章类型：Research Article\n- 摘要：不超过 250 词\n- 正文：建议 8,000 词以内\n- 图表：请提供可编辑源文件\n- 数据与代码：需附可用性声明\n`,
        {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="journal-${journalId}-guideline.md"`,
          },
        },
      );
    }
    return new HttpResponse(
      "Scholay Mock LaTeX template archive\nmain.tex\nreferences.bib\nfigures/README.md\n",
      {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="journal-${journalId}-latex.zip"`,
        },
      },
    );
  }

  // ── Skills 用户态 ───────────────────────────────────────────────────────
  if (method === "GET" && path === "/user/skill-installs") {
    return ok({ list: installedSkills, maxEnabled: 5 });
  }
  if (method === "GET" && path === "/user/skills") {
    return ok({
      list: [
        {
          id: 12,
          slug: "academic-rebuttal",
          name: "审稿回复教练",
          tagline: "逐条组织审稿意见与回复证据",
          category: "writing",
          visibility: "private",
          moderationStatus: "draft",
          moderationNote: "",
          status: "active",
          installCount: 0,
          version: 2,
          updatedAt: "2026-07-27T06:00:00.000Z",
        },
      ],
    });
  }
  if (
    path.startsWith("/user/skills") ||
    path.startsWith("/user/skill-installs")
  ) {
    if (path.startsWith("/user/skills/market/")) return undefined;
    if (method === "POST" && path === "/user/skills") {
      return ok({ id: 99, slug: "my-new-skill" }, { status: 201 });
    }
    return emptyOk();
  }

  // ── 通知、埋点与通用轻量接口 ───────────────────────────────────────────
  if (method === "GET" && path === "/user/messages/unread-count") {
    const read = new Set(getMockDatabase().readMessageIds);
    return ok({
      count: messages.filter(
        (message) => !message.is_read && !read.has(message.id),
      ).length,
    });
  }
  if (method === "GET" && path === "/user/messages") {
    const read = new Set(getMockDatabase().readMessageIds);
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("page_size") ?? 20);
    const list = messages.map((message) => ({
      ...message,
      is_read: message.is_read || read.has(message.id),
    }));
    return ok({ list, total: list.length, page, page_size: pageSize });
  }
  const messageMatch = path.match(/^\/user\/messages\/(\d+)(?:\/read)?$/);
  if (messageMatch && method === "PUT") {
    updateMockDatabase((draft) => {
      const id = Number(messageMatch[1]);
      if (!draft.readMessageIds.includes(id)) draft.readMessageIds.push(id);
    });
    return emptyOk();
  }
  if (method === "PUT" && path === "/user/messages/read-all") {
    updateMockDatabase((draft) => {
      draft.readMessageIds = messages.map((message) => message.id);
    });
    return emptyOk();
  }
  if (messageMatch && method === "DELETE") return emptyOk();
  if (method === "POST" && path === "/user/ws-ticket") {
    return ok({ wsToken: "mock-notification-ticket" });
  }
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
    /^\/(?:public\/seo\/expose|public\/usage|public\/hot-content|client-errors|log\/client-error|usage)/.test(
      path,
    )
  ) {
    return emptyOk();
  }

  return undefined;
}

// 极小但可被 PDF.js 识别的单页 PDF。纯字符串放在 bundle 内，Mock 不依赖任何外部文件服务。
const MOCK_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 98>>stream
BT /F1 20 Tf 72 720 Td (Scholay Mock Paper) Tj 0 -32 Td /F1 11 Tf (Offline design fixture) Tj ET
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000311 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
459
%%EOF`;
