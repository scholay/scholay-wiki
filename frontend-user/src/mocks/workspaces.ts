import { HttpResponse } from "msw";
import {
  getMockDatabase,
  nextMockId,
  updateMockDatabase,
  type MockAgentSession,
  type MockPrismFile,
  type MockPrismProject,
  type MockSubmission,
} from "./database";
import {
  registerPrismManuscript,
  registerUploadManuscript,
  snapshotAssetSeed,
} from "./manuscripts";

type UnknownRecord = Record<string, unknown>;
type AgentFeature = "smart-search" | "claw" | "boltslides" | "sci_draw";

interface MockDocStruct {
  structVersion: number;
  targetTemplate: string;
  frontMatter: {
    title: string;
    shortTitle?: string;
    authors?: Array<Record<string, unknown>>;
    affiliations?: Array<Record<string, unknown>>;
    abstract?: string;
    keywords?: string[];
  };
  body: Array<Record<string, unknown>>;
  bibliography?: Record<string, string>;
  assets?: Record<string, unknown>;
}

interface MockSubmissionAsset {
  id: number;
  submissionId: number;
  role: "manuscript" | "attachment";
  category?: string;
  filename: string;
  size: number;
  mime: string;
  sha256?: string;
  textChars?: number;
  createdAt: string;
}

interface MockArtifact {
  id: number;
  path: string;
  name: string;
  kind: "file" | "dir";
  mime: string;
  size: number;
  title: string;
  description: string;
  content: string;
}

const MOCK_NOW = "2026-07-28T08:00:00.000Z";
const encoder = new TextEncoder();

function success(data: unknown, init?: ResponseInit): Response {
  return HttpResponse.json({ code: 0, message: "success", data }, init);
}

function noContent(): Response {
  return new HttpResponse(null, { status: 204 });
}

function apiError(status: number, message: string): Response {
  return HttpResponse.json({ code: status, message, data: null }, { status });
}

function binary(
  content: string | ArrayBuffer,
  contentType: string,
  filename?: string,
  extraHeaders?: Record<string, string>,
): Response {
  const body =
    typeof content === "string" ? encoder.encode(content).buffer : content;
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    ...extraHeaders,
  };
  if (filename) {
    headers["Content-Disposition"] =
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
  return HttpResponse.arrayBuffer(body, { headers });
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

async function readFormData(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

function requestUrl(request: Request): URL {
  return new URL(request.url, "http://scholay.mock");
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function makeTinyPdf(title: string): ArrayBuffer {
  const safeTitle = title.replace(/[()\\]/g, (character) => `\\${character}`);
  const stream = `BT /F1 20 Tf 72 760 Td (${safeTitle}) Tj 0 -34 Td /F1 11 Tf (Scholay design mock preview) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).byteLength);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(pdf).buffer;
}

const illustrationSvg = (label: string): string =>
  `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#0f172a"/><stop offset="1" stop-color="#312e81"/>
    </linearGradient>
  </defs>
  <rect width="960" height="540" rx="28" fill="url(#bg)"/>
  <circle cx="170" cy="270" r="86" fill="#38bdf8" opacity=".85"/>
  <circle cx="480" cy="170" r="68" fill="#a78bfa" opacity=".9"/>
  <circle cx="780" cy="315" r="98" fill="#34d399" opacity=".8"/>
  <path d="M250 255L412 185M542 190L698 285" stroke="#e2e8f0" stroke-width="8" stroke-linecap="round"/>
  <text x="48" y="492" fill="white" font-family="system-ui" font-size="32" font-weight="700">${label}</text>
</svg>`.trim();

const defaultStructs = new Map<number, MockDocStruct>();
const compileRecords = new Map<number, UnknownRecord>();
const prismConversations = new Map<number, Array<Record<string, unknown>>>();
const prismPendingRounds = new Map<
  number,
  { files: Array<Record<string, unknown>>; epoch: string }
>();
const prismTerminology = new Map<number, string>();
const prismRevisions = new Map<number, Array<Record<string, unknown>>>();
const submissionAssets = new Map<number, MockSubmissionAsset[]>();

let compileSequence = 700;
let conversationSequence = 1;
let assetSequence = 900;

function createDocumentStruct(project: MockPrismProject): MockDocStruct {
  return {
    structVersion: 2,
    targetTemplate: "nature-machine-intelligence",
    frontMatter: {
      title: project.title,
      shortTitle: "Trustworthy Research Agents",
      authors: [
        {
          id: "author-1",
          given: "Yu",
          family: "Lin",
          email: "lin.yu@scholay.mock",
          orcid: "0000-0002-1825-0097",
          corresponding: true,
          affRefs: ["aff-1"],
        },
        {
          id: "author-2",
          given: "Ming",
          family: "Zhao",
          affRefs: ["aff-1", "aff-2"],
        },
      ],
      affiliations: [
        {
          id: "aff-1",
          organization: "Example University",
          department: "Human–AI Interaction Lab",
          city: "Shanghai",
          country: "China",
        },
        {
          id: "aff-2",
          organization: "Open Science Institute",
          city: "Singapore",
          country: "Singapore",
        },
      ],
      abstract:
        "Research agents are moving from retrieval assistants to active participants in scientific workflows. We present a design framework that makes their evidence, uncertainty, and actions inspectable and reversible.",
      keywords: [
        "research agents",
        "human–AI collaboration",
        "provenance",
        "scientific workflow",
      ],
    },
    body: [
      { id: "h-intro", type: "heading", level: 1, text: "Introduction" },
      {
        id: "p-intro-1",
        type: "paragraph",
        inlines: [
          {
            t: "text",
            v: "AI research agents increasingly coordinate literature retrieval, analysis, and scientific writing. Yet speed without inspectability can amplify weak evidence and automation bias ",
          },
          { t: "cite", key: "bommasani2022foundation" },
          { t: "text", v: "." },
        ],
      },
      {
        id: "p-intro-2",
        type: "paragraph",
        text: "We ask a product-design question: which interaction mechanisms help researchers remain meaningfully in control while benefiting from agentic automation?",
      },
      { id: "h-method", type: "heading", level: 1, text: "Method" },
      {
        id: "p-method-1",
        type: "paragraph",
        text: "We conducted a mixed-method study with 36 researchers across computer science, biology, and social science. Participants completed literature synthesis and manuscript revision tasks using three interface variants.",
      },
      {
        id: "tbl-study",
        type: "table",
        caption: "Study conditions and measured outcomes",
        rows: [
          ["Condition", "Participants", "Trace visibility", "Undo support"],
          ["Baseline chat", "12", "Low", "No"],
          ["Provenance rail", "12", "High", "No"],
          ["Reversible workspace", "12", "High", "Yes"],
        ],
      },
      { id: "h-results", type: "heading", level: 1, text: "Results" },
      {
        id: "p-result-1",
        type: "paragraph",
        text: "The reversible workspace increased error detection by 31% and reduced unsupported claims by 24% compared with baseline chat.",
      },
      {
        id: "fig-framework",
        type: "figure",
        asset: "assets/trust-framework.svg",
        caption:
          "A three-layer framework for trustworthy research-agent interaction.",
        width: "0.88\\linewidth",
        label: "fig:framework",
      },
      {
        id: "h-principles",
        type: "heading",
        level: 2,
        text: "Design principles",
      },
      {
        id: "list-principles",
        type: "list",
        ordered: false,
        items: [
          [{ t: "bold", v: "Show provenance at the point of use." }],
          [
            {
              t: "bold",
              v: "Make high-impact actions reviewable and reversible.",
            },
          ],
          [{ t: "bold", v: "Expose uncertainty without interrupting flow." }],
        ],
      },
      { id: "h-discussion", type: "heading", level: 1, text: "Discussion" },
      {
        id: "p-discussion",
        type: "paragraph",
        text: "Trustworthy agent experiences should be designed as shared workspaces rather than opaque chat transcripts. The interface must preserve a legible chain from source to synthesis to action.",
      },
    ],
    bibliography: {
      bommasani2022foundation:
        "@article{bommasani2022foundation,title={On the Opportunities and Risks of Foundation Models},author={Bommasani, Rishi and others},year={2022},journal={arXiv}}",
      amershi2019guidelines:
        "@inproceedings{amershi2019guidelines,title={Guidelines for Human-AI Interaction},author={Amershi, Saleema and others},year={2019},booktitle={CHI}}",
    },
    assets: {
      "assets/trust-framework.svg": {
        mime: "image/svg+xml",
        width: 960,
        height: 540,
      },
    },
  };
}

function getDocumentStruct(project: MockPrismProject): MockDocStruct {
  const existing = defaultStructs.get(project.id);
  if (existing) return existing;
  const created = createDocumentStruct(project);
  defaultStructs.set(project.id, created);
  return created;
}

function prismProjectView(project: MockPrismProject): Record<string, unknown> {
  const main =
    project.files.find((file) => file.id === project.mainFileId) ??
    project.files[0];
  return {
    id: project.id,
    user_id: 1001,
    title: project.title || project.name,
    main_file: main?.path ?? "document.md",
    status: project.status || "ready",
    schema_version: stringValue(project.schema_version, "struct"),
    read_only: false,
    created_at: stringValue(project.created_at, project.createdAt),
    updated_at: stringValue(project.updated_at, project.updatedAt),
  };
}

function prismFileView(file: MockPrismFile): Record<string, unknown> {
  const extension = file.path.split(".").pop()?.toLowerCase();
  const fileKind =
    extension === "tex" ||
    extension === "bib" ||
    extension === "sty" ||
    extension === "cls"
      ? extension
      : "asset";
  return {
    id: file.id,
    project_id: file.projectId,
    rel_path: file.path,
    file_kind: fileKind,
    current_version_id: file.id * 10 + 3,
    content_sha256: `mock-sha256-${file.id}`,
    size: encoder.encode(file.content).byteLength,
    created_at: "2026-07-12T08:00:00.000Z",
    updated_at: file.updatedAt,
  };
}

function findPrismProject(id: number): MockPrismProject | undefined {
  return getMockDatabase().prismProjects.find((project) => project.id === id);
}

function findPrismFile(
  project: MockPrismProject,
  fileId: number,
): MockPrismFile | undefined {
  return project.files.find((file) => file.id === fileId);
}

function ensurePrismConversations(
  projectId: number,
): Array<Record<string, unknown>> {
  const existing = prismConversations.get(projectId);
  if (existing) return existing;
  const sessions = [
    {
      sessionId: `prism-${projectId}-design-review`,
      title: "优化摘要与研究贡献",
      messageCount: 8,
      lastAccessedAt: MOCK_NOW,
      createdAt: "2026-07-27T02:00:00.000Z",
    },
    {
      sessionId: `prism-${projectId}-review-response`,
      title: "回应审稿人方法论意见",
      messageCount: 14,
      lastAccessedAt: "2026-07-27T04:30:00.000Z",
      createdAt: "2026-07-25T09:10:00.000Z",
    },
  ];
  prismConversations.set(projectId, sessions);
  return sessions;
}

function prismHistory(projectId: number): Array<Record<string, unknown>> {
  return [
    {
      id: `prism-${projectId}-u1`,
      type: "user",
      content: [
        {
          type: "text",
          text: "请检查摘要是否清楚表达了研究缺口、方法与贡献。",
        },
      ],
      timestamp: "2026-07-27T07:42:00.000Z",
    },
    {
      id: `prism-${projectId}-a1`,
      type: "assistant",
      content: [
        {
          type: "thinking",
          thinking:
            "I should compare the abstract with the study design and reported outcomes.",
        },
        {
          type: "text",
          text: "我先核对摘要与正文中的样本、方法和结果是否一致。",
        },
        {
          type: "tool_use",
          id: `prism-read-${projectId}`,
          name: "Read",
          input: { file_path: "document.md" },
        },
      ],
      timestamp: "2026-07-27T07:42:04.000Z",
    },
    {
      id: `prism-${projectId}-tool`,
      type: "tool_result",
      content: [
        {
          type: "tool_result",
          tool_use_id: `prism-read-${projectId}`,
          content:
            "Read 42 document blocks; study n=36; key deltas 31% and 24%.",
          is_error: false,
        },
      ],
      timestamp: "2026-07-27T07:42:05.000Z",
    },
    {
      id: `prism-${projectId}-a2`,
      type: "assistant",
      content: [
        {
          type: "text",
          text: "摘要的结构已经完整，但“可检查与可逆”这一核心贡献出现得偏晚。我建议把研究缺口提前，并保留 36 位研究者、错误识别提升 31% 与无依据断言降低 24% 三个可核验数字。已生成一版更聚焦的修订，等待你审阅后应用。",
        },
      ],
      timestamp: "2026-07-27T07:42:12.000Z",
      model: "claude-sonnet-4-5",
    },
  ];
}

function getPendingRound(project: MockPrismProject): {
  files: Array<Record<string, unknown>>;
  epoch: string;
} {
  const existing = prismPendingRounds.get(project.id);
  if (existing) return existing;
  const oldStruct = getDocumentStruct(project);
  const newStruct = structuredClone(oldStruct);
  newStruct.frontMatter.abstract =
    "Research agents are becoming active participants in scientific workflows, but opaque automation makes evidence quality and user control difficult to assess. In a mixed-method study with 36 researchers, we compare baseline chat, provenance-aware, and reversible workspace interfaces. The reversible workspace improved error detection by 31% and reduced unsupported claims by 24%. We derive a design framework for inspectable, uncertainty-aware, and reversible research agents.";
  const pending = {
    epoch: `mock-epoch-${project.id}-3`,
    files: [
      {
        file_id: project.mainFileId,
        rel_path: "document.md",
        old_body: oldStruct.frontMatter.abstract ?? "",
        new_body: newStruct.frontMatter.abstract,
        is_new: false,
        old_struct: oldStruct,
        new_struct: newStruct,
      },
    ],
  };
  prismPendingRounds.set(project.id, pending);
  return pending;
}

function defaultSubmissionAssets(submissionId: number): MockSubmissionAsset[] {
  if (submissionId === 302) {
    return [
      {
        id: 3201,
        submissionId,
        role: "manuscript",
        filename: "可信科研工作流智能体交互设计研究.pdf",
        size: 4_862_194,
        mime: "application/pdf",
        sha256: "mock-thesis-sha256",
        textChars: 58_420,
        createdAt: "2026-07-27T03:42:00.000Z",
      },
      {
        id: 3202,
        submissionId,
        role: "attachment",
        category: "figures",
        filename: "研究框架图.png",
        size: 1_284_304,
        mime: "image/png",
        sha256: "mock-thesis-figure-sha256",
        createdAt: "2026-07-27T03:43:00.000Z",
      },
    ];
  }
  if (submissionId !== 301) return [];
  return [
    {
      id: 3101,
      submissionId,
      role: "manuscript",
      filename: "human-ai-scientific-discovery.docx",
      size: 2_846_512,
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sha256: "mock-journal-sha256",
      textChars: 46_871,
      createdAt: "2026-07-18T04:22:00.000Z",
    },
    {
      id: 3102,
      submissionId,
      role: "attachment",
      category: "data",
      filename: "screening-and-coding.xlsx",
      size: 684_122,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sha256: "mock-journal-data-sha256",
      createdAt: "2026-07-18T04:24:00.000Z",
    },
    {
      id: 3103,
      submissionId,
      role: "attachment",
      category: "supplement",
      filename: "supplementary-methods.pdf",
      size: 1_302_054,
      mime: "application/pdf",
      sha256: "mock-journal-supplement-sha256",
      textChars: 11_207,
      createdAt: "2026-07-18T04:25:00.000Z",
    },
  ];
}

function assetsForSubmission(submissionId: number): MockSubmissionAsset[] {
  const existing = submissionAssets.get(submissionId);
  if (existing) return existing;
  // Prism「送审」建轮时新建的 Submission:稿件资产按绑定的版本快照懒播种,
  // 让 wizard 落在 step 2 时"稿件已附带"、无需再上传。
  const snapshot = snapshotAssetSeed(submissionId);
  const seeded = snapshot
    ? [
        {
          id: 3000 + submissionId,
          submissionId,
          role: "manuscript" as const,
          filename: `${snapshot.manuscriptTitle}-v${snapshot.versionNo}.pdf`,
          size: 1_864_000,
          mime: "application/pdf",
          sha256: `mock-snapshot-${submissionId}`,
          textChars: 38_600,
          createdAt: snapshot.createdAt,
        },
      ]
    : defaultSubmissionAssets(submissionId);
  submissionAssets.set(submissionId, seeded);
  return seeded;
}

function submissionView(submission: MockSubmission): Record<string, unknown> {
  const mode = submission.mode;
  const isCompleted = submission.status === "completed";
  const rawJournal = submission.journalTarget as UnknownRecord | undefined;
  const rawSchool = submission.schoolTarget as UnknownRecord | undefined;
  const journalTarget =
    mode === "journal"
      ? {
          journalId: numberValue(rawJournal?.journalId, 10001),
          canonicalName: stringValue(
            rawJournal?.canonicalName,
            stringValue(rawJournal?.name, "Nature Machine Intelligence"),
          ),
          issns: ["2522-5839"],
          aiReason:
            "稿件聚焦科研智能体与人机协作，和该刊关于可信、可解释 AI 系统的选题高度匹配。",
          jcrImpactFactor: numberValue(
            rawJournal?.jcrImpactFactor,
            numberValue(rawJournal?.impactFactor, 23.8),
          ),
          jcrQuartile: stringValue(
            rawJournal?.jcrQuartile,
            stringValue(rawJournal?.quartile, "Q1"),
          ),
          fqbQuartile: "1",
          publisher: stringValue(rawJournal?.publisher, "Springer Nature"),
          country: "United Kingdom",
          hIndex: 95,
          isOA: false,
        }
      : undefined;
  const schoolTarget =
    mode === "thesis"
      ? {
          schoolName: stringValue(
            rawSchool?.schoolName,
            stringValue(rawSchool?.school, "示例大学"),
          ),
          degreeType: stringValue(rawSchool?.degreeType, "phd"),
          disciplineField: stringValue(
            rawSchool?.disciplineField,
            stringValue(rawSchool?.department, "计算机科学与技术"),
          ),
          advisorName: stringValue(rawSchool?.advisorName, "陈教授"),
        }
      : undefined;
  const createdAt = stringValue(submission.created_at, submission.createdAt);
  const updatedAt = stringValue(submission.updated_at, submission.updatedAt);
  const status = stringValue(submission.status, "draft");
  const computeState = stringValue(
    submission.compute_state,
    stringValue(submission.computeState, "idle"),
  );
  const files = assetsForSubmission(submission.id);
  return {
    id: submission.id,
    userId: 1001,
    mode,
    status,
    step: numberValue(submission.step, 1),
    title: submission.title,
    abstract: submission.abstract,
    extraMeta: submission.extraMeta ?? {
      keywords: [
        "research agents",
        "human–AI collaboration",
        "scientific discovery",
      ],
      subjects: ["Artificial Intelligence", "Human-Computer Interaction"],
      manuscriptType: mode === "journal" ? "review" : "research",
    },
    manuscriptAssetId: files.find((asset) => asset.role === "manuscript")?.id,
    journalTarget,
    schoolTarget,
    letterBody:
      submission.letterBody ??
      (mode === "journal"
        ? "Dear Editors,\n\nWe submit this manuscript for consideration. It offers an empirically grounded framework for designing inspectable and reversible research agents.\n\nSincerely,\nYu Lin"
        : "尊敬的学位评审专家：\n\n现提交本博士学位论文。论文围绕可信科研智能体的交互机制、错误恢复与协作边界展开研究，敬请审阅。"),
    agreedAt: status === "draft" ? undefined : "2026-07-18T05:00:00.000Z",
    agentSessionId: stringValue(
      submission.agentSessionId,
      `peer-review-${submission.id}`,
    ),
    computeState,
    computeError: submission.computeError,
    assetsRevision: numberValue(submission.assetsRevision, files.length),
    metaRevision: numberValue(submission.metaRevision, 2),
    letterRevision: numberValue(submission.letterRevision, 1),
    createdAt,
    updatedAt,
    submittedAt:
      submission.submittedAt ??
      (status === "draft" ? undefined : "2026-07-18T05:00:00.000Z"),
    completedAt:
      submission.completedAt ??
      (isCompleted ? "2026-07-18T05:16:00.000Z" : undefined),
  };
}

function reviewReports(submissionId: number): Array<Record<string, unknown>> {
  const commonDimensions = [
    {
      name: "科学性",
      grade: "A-",
      comment: "研究问题清楚，证据链完整，核心结论均可回溯至纳入研究。",
    },
    {
      name: "严谨性",
      grade: "B+",
      comment:
        "检索与编码流程较严谨，但建议补充对灰色文献排除策略的敏感性分析。",
    },
    {
      name: "创新性",
      grade: "A",
      comment: "把科研智能体从“工具性能”转向“协作机制”进行系统归纳，视角新颖。",
    },
    {
      name: "可读性",
      grade: "A-",
      comment: "结构清晰、图表有效；讨论部分仍可进一步压缩重复定义。",
    },
  ];
  const reviewer = (
    id: number,
    role: "alpha" | "beta" | "gamma",
    score: number,
    recommendation: "小修" | "大修",
    expertise: string,
    skillName: string,
  ): Record<string, unknown> => ({
    id,
    submissionId,
    role,
    contentMd: JSON.stringify({
      expertise,
      score,
      recommendation,
      dimensions: commonDimensions,
      line_comments: [],
      macro_comments: [],
      final_summary: "稿件具有明确贡献，完成关键补充后具备发表潜力。",
    }),
    agentDurationSec: 86 + (id % 10),
    agentTokensIn: 18_400,
    agentTokensOut: 3_260,
    createdAt: "2026-07-18T05:10:00.000Z",
    reviewerSkillId: id + 40,
    skillSlug: `reviewer-${role}`,
    skillName,
    score,
    recommendation,
    expertise,
    dimensions: commonDimensions,
    lineComments: [
      {
        location: "§方法 · 检索策略",
        dimension: "严谨性",
        severity: "必改",
        quote: "We searched five major academic databases...",
        issue:
          "尚未说明预印本与灰色文献的处理规则，可能影响系统综述的可复现性。",
        peer_practice:
          "同类高质量综述通常公开完整检索式，并报告灰色文献敏感性分析。",
        suggestion:
          "在补充材料中给出逐库检索式、去重规则和纳排流程，并增加一次敏感性分析。",
      },
      {
        location: "图 3",
        dimension: "可读性",
        severity: "建议",
        quote: "Interaction patterns across workflow stages",
        issue: "图例中“verification”与正文“validation”术语不一致。",
        peer_practice: "关键构念通常在图表和正文中保持同一命名。",
        suggestion: "统一为“verification”，并在首次出现时给出操作性定义。",
      },
    ],
    macroComments: [
      {
        aspect: "理论贡献",
        stance: "积极",
        body: "三层框架把可追溯、可逆和校准不确定性放在同一设计空间中，具有较好的迁移价值。",
      },
      {
        aspect: "外部效度",
        stance: "建议加强",
        body: "样本集中于计算密集型学科，建议更明确讨论对湿实验与田野研究工作流的适用边界。",
      },
    ],
    finalSummaryMd:
      "这是一篇选题及时、组织良好的系统综述。建议补足检索复现材料、统一核心术语，并收紧讨论部分的外推范围。",
  });
  return [
    reviewer(
      4101,
      "alpha",
      88,
      "小修",
      "系统综述方法与开放科学",
      "方法论审稿人",
    ),
    reviewer(
      4102,
      "beta",
      82,
      "大修",
      "人机交互与智能体系统",
      "交互设计审稿人",
    ),
    reviewer(4103, "gamma", 91, "小修", "科研实践与技术治理", "领域专家审稿人"),
    {
      id: 4104,
      submissionId,
      role: "chief",
      contentMd: JSON.stringify({
        score: 87,
        recommendation: "小修",
        ruling_summary: "研究贡献明确，完成可复现性补充后建议录用。",
        ruling_paragraph:
          "三位审稿人一致认可选题重要性与框架价值。当前问题集中于检索流程的可复现细节、术语一致性与外部效度边界，不影响核心结论。",
        reviewer_responses: [],
        must_fix: [
          "公开逐数据库检索式、去重与纳排规则",
          "统一 verification / validation 等核心术语",
          "补充灰色文献处理的敏感性分析",
        ],
        suggestions: [
          "压缩讨论中重复的框架定义",
          "在图 3 中标注三类界面机制的实例",
        ],
        deadline_days: 21,
        summary_for_author: "请围绕可复现性与术语一致性完成一次聚焦修订。",
      }),
      agentDurationSec: 104,
      agentTokensIn: 22_780,
      agentTokensOut: 4_130,
      createdAt: "2026-07-18T05:16:00.000Z",
      score: 87,
      recommendation: "小修",
      rulingSummaryMd: "研究贡献明确，完成可复现性补充后建议录用。",
      rulingParagraphMd:
        "三位审稿人一致认可选题重要性与框架价值。当前问题集中于检索流程的可复现细节、术语一致性与外部效度边界，不影响核心结论。",
      reviewerResponses: [
        {
          reviewer: "审稿人 A",
          judgment: "全部同意",
          summary: "可复现性材料属于录用前必要补充。",
          body: "方法审稿意见具体且可操作，建议作者逐项回应。",
        },
        {
          reviewer: "审稿人 B",
          judgment: "部分同意",
          summary: "接受外部效度担忧，但无需扩大本轮实验。",
          body: "通过收紧结论边界与增加局限性讨论即可解决，无需新增大规模用户研究。",
        },
        {
          reviewer: "审稿人 C",
          judgment: "全部同意",
          summary: "治理讨论增强了稿件的实践价值。",
          body: "建议保留并进一步凝练对责任边界的讨论。",
        },
      ],
      mustFix: [
        "公开逐数据库检索式、去重与纳排规则",
        "统一 verification / validation 等核心术语",
        "补充灰色文献处理的敏感性分析",
      ],
      suggestions: [
        "压缩讨论中重复的框架定义",
        "在图 3 中标注三类界面机制的实例",
      ],
      deadlineDays: 21,
      summaryForAuthor: "请围绕可复现性与术语一致性完成一次聚焦修订。",
    },
  ];
}

function listSubmissionView(
  submission: MockSubmission,
): Record<string, unknown> {
  const detail = submissionView(submission);
  const journal = detail.journalTarget as UnknownRecord | undefined;
  const school = detail.schoolTarget as UnknownRecord | undefined;
  return {
    id: detail.id,
    mode: detail.mode,
    title: detail.title || "未命名投稿",
    status: detail.status,
    decision: detail.status === "completed" ? "小修" : undefined,
    scoreAvg: detail.status === "completed" ? 87 : undefined,
    targetLabel:
      stringValue(journal?.canonicalName) ||
      stringValue(school?.schoolName) ||
      "尚未选择目标",
    submittedAt: detail.submittedAt,
    completedAt: detail.completedAt,
  };
}

function ssePayload(slot: string): string {
  if (slot === "meta") {
    return JSON.stringify({
      title: "Human–AI Collaboration in Scientific Discovery",
      abstract:
        "A systematic review of interaction patterns, evaluation methods, and governance challenges in AI-assisted scientific discovery.",
      keywords: [
        "human–AI collaboration",
        "research agents",
        "scientific discovery",
        "trustworthy AI",
      ],
      subjects: ["Artificial Intelligence", "Human-Computer Interaction"],
      manuscriptType: "review",
    });
  }
  if (slot === "letter") {
    return "Dear Editors,\n\nWe are pleased to submit our systematic review on human–AI collaboration in scientific discovery. The manuscript synthesizes 148 studies and develops an actionable framework for inspectable, reversible, and uncertainty-aware research agents.\n\nSincerely,\nYu Lin";
  }
  const role = slot.split(":")[1] || "alpha";
  const report = reviewReports(301).find((item) => item.role === role);
  return stringValue(report?.contentMd, "{}");
}

function streamSse(slot: string): Response {
  const finalText = ssePayload(slot);
  const firstCut = Math.max(1, Math.floor(finalText.length * 0.42));
  const secondCut = Math.max(firstCut + 1, Math.floor(finalText.length * 0.75));
  const frames = [
    `event: snapshot\ndata: ${JSON.stringify({ phase: "computing", text: "" })}\n\n`,
    `event: status\ndata: ${JSON.stringify({ phase: "computing", note: "正在核对稿件结构与证据链…" })}\n\n`,
    `event: delta\ndata: ${JSON.stringify({ phase: "computing", text: finalText.slice(0, firstCut) })}\n\n`,
    `event: delta\ndata: ${JSON.stringify({ phase: "computing", text: finalText.slice(firstCut, secondCut) })}\n\n`,
    `event: delta\ndata: ${JSON.stringify({ phase: "computing", text: finalText.slice(secondCut) })}\n\n`,
    `event: done\ndata: ${JSON.stringify({ phase: "done", text: finalText })}\n\n`,
  ];
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      frames.forEach((frame, index) => {
        const timer = globalThis.setTimeout(() => {
          controller.enqueue(encoder.encode(frame));
          if (index === frames.length - 1) controller.close();
        }, index * 45);
        timers.push(timer);
      });
    },
    cancel() {
      timers.forEach((timer) => globalThis.clearTimeout(timer));
    },
  });
  return new HttpResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

const featureLabels: Record<AgentFeature, string> = {
  "smart-search": "智能搜论文",
  claw: "智能助手",
  boltslides: "制作 PPT",
  sci_draw: "科研绘图",
};

function normalizeAgentFeature(feature: string): AgentFeature | null {
  if (
    feature === "smart-search" ||
    feature === "claw" ||
    feature === "boltslides" ||
    feature === "sci_draw"
  ) {
    return feature;
  }
  return feature === "sci-draw" ? "sci_draw" : null;
}

function databaseFeature(feature: AgentFeature): string {
  return feature === "sci_draw" ? "sci-draw" : feature;
}

function sessionsForFeature(feature: AgentFeature): MockAgentSession[] {
  const dbFeature = databaseFeature(feature);
  return getMockDatabase()
    .agentSessions.filter(
      (session) => session.feature === dbFeature || session.feature === feature,
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function createAgentSession(
  feature: AgentFeature,
  title = "新对话",
): MockAgentSession {
  const sequence =
    getMockDatabase().agentSessions.filter(
      (session) =>
        session.feature === feature ||
        session.feature === databaseFeature(feature),
    ).length + 1;
  const sessionId = `${feature.replace("_", "-")}-mock-${Date.now().toString(36)}-${sequence}`;
  const created: MockAgentSession = {
    id: sessionId,
    sessionId,
    title,
    feature: databaseFeature(feature),
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
  updateMockDatabase((database) => {
    database.agentSessions.forEach((session) => {
      if (
        session.feature === feature ||
        session.feature === databaseFeature(feature)
      ) {
        session.active = false;
      }
    });
    database.agentSessions.unshift(created);
  });
  return created;
}

function findAgentSession(
  feature: AgentFeature,
  sessionId?: string | null,
): MockAgentSession | undefined {
  const sessions = sessionsForFeature(feature);
  if (sessionId) {
    return sessions.find((session) => session.sessionId === sessionId);
  }
  return sessions.find((session) => session.active) ?? sessions[0];
}

function ensureAgentSession(
  feature: AgentFeature,
  sessionId?: string | null,
): MockAgentSession {
  return findAgentSession(feature, sessionId) ?? createAgentSession(feature);
}

function agentHistory(
  feature: AgentFeature,
  sessionId: string,
): Array<Record<string, unknown>> {
  if (feature === "smart-search") {
    return [
      {
        id: `${sessionId}-u1`,
        type: "user",
        content: [
          {
            type: "text",
            text: "帮我梳理可信科研智能体在 2023–2026 年的研究脉络，并指出关键证据缺口。",
          },
        ],
        timestamp: "2026-07-26T06:00:00.000Z",
      },
      {
        id: `${sessionId}-a1`,
        type: "assistant",
        content: [
          {
            type: "thinking",
            thinking:
              "I should search across HCI, AI agents, and scientific workflow literature.",
          },
          {
            type: "text",
            text: "我会先做跨学科检索，再按“可追溯、可控、可校准”三个维度整理证据。",
          },
          {
            type: "tool_use",
            id: `${sessionId}-search`,
            name: "minicod_search_papers",
            input: {
              query:
                "trustworthy research agents provenance human AI scientific workflow",
              year_from: 2023,
              year_to: 2026,
            },
          },
        ],
        timestamp: "2026-07-26T06:00:04.000Z",
      },
      {
        id: `${sessionId}-tr1`,
        type: "tool_result",
        content: [
          {
            type: "tool_result",
            tool_use_id: `${sessionId}-search`,
            is_error: false,
            content: {
              papers: [
                {
                  id: "W4399901001",
                  title: "Designing Human-AI Partnerships for Scientific Work",
                  authors: ["Mira Patel", "Jonas Reed"],
                  year: 2025,
                  venue: "CHI",
                  cited_by_count: 64,
                  doi: "10.1145/mock.2025.1001",
                  abstract:
                    "A field study of provenance and control mechanisms in agent-supported scientific work.",
                },
                {
                  id: "W4399901002",
                  title: "Provenance-Aware Language Agents",
                  authors: ["A. Chen", "R. Gomez"],
                  year: 2024,
                  venue: "FAccT",
                  cited_by_count: 112,
                  doi: "10.1145/mock.2024.1002",
                  abstract:
                    "Methods for preserving source lineage through multi-step language-agent workflows.",
                },
                {
                  id: "W4399901003",
                  title:
                    "Calibrated Uncertainty in Autonomous Research Assistants",
                  authors: ["L. Ibrahim", "S. Wu"],
                  year: 2026,
                  venue: "Nature Machine Intelligence",
                  cited_by_count: 18,
                  doi: "10.1038/mock-2026-1003",
                  abstract:
                    "Evaluation of uncertainty communication patterns for research assistants.",
                },
              ],
              total: 37,
              source: "OpenAlex + Crossref",
            },
          },
        ],
        timestamp: "2026-07-26T06:00:08.000Z",
      },
      {
        id: `${sessionId}-a2`,
        type: "assistant",
        content: [
          {
            type: "text",
            text: "目前研究形成了三条主线：\n\n1. **来源可追溯**：从“给引用”转向保留跨工具、跨步骤的证据谱系。\n2. **行动可逆**：高影响操作需要审阅门、差异视图和撤销机制。\n3. **不确定性校准**：重点不再只是置信分数，而是让用户知道何时需要复核。\n\n最明显的证据缺口是：多数研究仍是短任务实验，缺少跨数周真实科研项目中的纵向评估；对湿实验、田野研究等非纯数字工作流覆盖也很有限。",
          },
        ],
        timestamp: "2026-07-26T06:00:14.000Z",
        model: "claude-sonnet-4-5",
      },
    ];
  }

  if (feature === "boltslides") {
    return [
      {
        id: `${sessionId}-u1`,
        type: "user",
        content: [
          {
            type: "text",
            text: "把这篇论文整理成一份 10 页组会汇报，风格简洁、重点突出研究发现。",
          },
        ],
        timestamp: "2026-07-26T08:00:00.000Z",
      },
      {
        id: `${sessionId}-a1`,
        type: "assistant",
        content: [
          {
            type: "text",
            text: "我先提炼叙事主线，并把“问题—方法—证据—设计启示”组织成 10 页结构。",
          },
          {
            type: "tool_use",
            id: `${sessionId}-deck`,
            name: "render_slides",
            input: {
              theme: "midnight-research",
              slides: 10,
              aspectRatio: "16:9",
            },
          },
        ],
        timestamp: "2026-07-26T08:00:05.000Z",
      },
      {
        id: `${sessionId}-tr1`,
        type: "tool_result",
        content: [
          {
            type: "tool_result",
            tool_use_id: `${sessionId}-deck`,
            is_error: false,
            content: { rendered: 10, file: "out/trustworthy-agents-deck.html" },
          },
        ],
        timestamp: "2026-07-26T08:00:12.000Z",
      },
      {
        id: `${sessionId}-artifact`,
        type: "artifact",
        content: [
          {
            name: "trustworthy-agents-deck.html",
            path: "out/trustworthy-agents-deck.html",
            kind: "file",
            mime: "text/html",
            size: 28_640,
          },
        ],
        timestamp: "2026-07-26T08:00:13.000Z",
      },
      {
        id: `${sessionId}-a2`,
        type: "assistant",
        content: [
          {
            type: "text",
            text: "演示稿已完成。主线从一个真实的科研决策场景切入，第 4–7 页集中展示实验设计与两个关键结果，最后两页给出产品设计原则和讨论问题。你可以在右侧预览并导出 PPTX 或 PDF。",
          },
        ],
        timestamp: "2026-07-26T08:00:14.000Z",
        model: "claude-sonnet-4-5",
      },
    ];
  }

  if (feature === "sci_draw") {
    return [
      {
        id: `${sessionId}-u1`,
        type: "user",
        content: [
          {
            type: "text",
            text: "画一张适合论文使用的 Transformer 编码器结构图，标出残差连接和多头注意力。",
          },
        ],
        timestamp: "2026-07-26T09:00:00.000Z",
      },
      {
        id: `${sessionId}-a1`,
        type: "assistant",
        content: [
          {
            type: "text",
            text: "我会使用单色主线加一组强调色，确保缩到双栏宽度后标签仍然清晰。",
          },
          {
            type: "tool_use",
            id: `${sessionId}-figure`,
            name: "render_scientific_figure",
            input: {
              layout: "encoder-stack",
              format: "svg",
              journalWidth: "double-column",
            },
          },
        ],
        timestamp: "2026-07-26T09:00:04.000Z",
      },
      {
        id: `${sessionId}-tr1`,
        type: "tool_result",
        content: [
          {
            type: "tool_result",
            tool_use_id: `${sessionId}-figure`,
            is_error: false,
            content: {
              file: "out/transformer-encoder.svg",
              width: 1200,
              height: 760,
            },
          },
        ],
        timestamp: "2026-07-26T09:00:08.000Z",
      },
      {
        id: `${sessionId}-artifact`,
        type: "artifact",
        content: [
          {
            name: "transformer-encoder.svg",
            path: "out/transformer-encoder.svg",
            kind: "file",
            mime: "image/svg+xml",
            size: 12_840,
          },
        ],
        timestamp: "2026-07-26T09:00:09.000Z",
      },
      {
        id: `${sessionId}-a2`,
        type: "assistant",
        content: [
          {
            type: "text",
            text: "结构图已生成：注意力与前馈模块使用同一视觉语法，残差路径以强调色绕行，并为 LayerNorm、Add 与张量形状保留了清晰标签。右侧可直接预览 SVG，也可以下载配方继续修改。",
          },
        ],
        timestamp: "2026-07-26T09:00:10.000Z",
        model: "claude-sonnet-4-5",
      },
    ];
  }

  return [
    {
      id: `${sessionId}-u1`,
      type: "user",
      content: [
        {
          type: "text",
          text: "基于我收藏的文献，帮我整理一份“可信科研智能体”研究综述和下一步研究计划。",
        },
      ],
      timestamp: "2026-07-26T07:00:00.000Z",
    },
    {
      id: `${sessionId}-a1`,
      type: "assistant",
      content: [
        {
          type: "thinking",
          thinking:
            "I need to synthesize the cited collection and separate evidence from recommendations.",
        },
        {
          type: "text",
          text: "我会先核对文献集中的核心结论，再形成证据矩阵和可执行的研究路线。",
        },
        {
          type: "tool_use",
          id: `${sessionId}-read`,
          name: "read_references",
          input: { folder: "可信 AI 与科研工作流", papers: 18 },
        },
      ],
      timestamp: "2026-07-26T07:00:04.000Z",
    },
    {
      id: `${sessionId}-tr1`,
      type: "tool_result",
      content: [
        {
          type: "tool_result",
          tool_use_id: `${sessionId}-read`,
          is_error: false,
          content: {
            read: 18,
            fullText: 12,
            abstractOnly: 6,
            themes: ["provenance", "reversibility", "calibrated uncertainty"],
          },
        },
      ],
      timestamp: "2026-07-26T07:00:08.000Z",
    },
    {
      id: `${sessionId}-artifact-1`,
      type: "artifact",
      content: [
        {
          name: "research-brief.md",
          path: "out/research-brief.md",
          kind: "file",
          mime: "text/markdown",
          size: 8_420,
        },
        {
          name: "evidence-matrix.csv",
          path: "out/evidence-matrix.csv",
          kind: "file",
          mime: "text/csv",
          size: 4_180,
        },
      ],
      timestamp: "2026-07-26T07:00:13.000Z",
    },
    {
      id: `${sessionId}-a2`,
      type: "assistant",
      content: [
        {
          type: "text",
          text: "综述与研究计划已整理完成。现有证据最支持“就地来源追溯”和“高影响操作审阅门”，但长期使用下的信任校准、跨学科差异仍缺少纵向数据。\n\n我建议下一步做一个 6 周的混合方法研究：前两周建立基线，中间三周比较来源轨与可逆工作区，最后一周做访谈和关键事件回放。右侧已经生成研究简报、证据矩阵与研究路线图。",
        },
      ],
      timestamp: "2026-07-26T07:00:14.000Z",
      model: "claude-sonnet-4-5",
    },
  ];
}

const artifactsByFeature: Record<AgentFeature, MockArtifact[]> = {
  claw: [
    {
      id: 8101,
      path: "out/research-brief.md",
      name: "research-brief.md",
      kind: "file",
      mime: "text/markdown",
      size: 8420,
      title: "可信科研智能体 · 研究简报",
      description: "研究脉络、证据缺口与 6 周验证计划",
      content: `# 可信科研智能体：研究简报

## 核心判断

可信科研智能体的产品价值，不只来自更强的自动化能力，而来自让研究者在关键节点保持知情、判断与撤销能力。

## 三条证据主线

1. **来源可追溯**：证据应在结论旁就地呈现，并保留跨工具步骤的来源谱系。
2. **行动可逆**：写入论文、批量筛选和数据变换等高影响操作，需要差异预览、确认门和撤销。
3. **不确定性可行动**：不要只给置信分数，要明确“不确定在哪里、用户接下来应核对什么”。

## 主要缺口

- 缺少跨数周真实科研项目的纵向研究；
- 对湿实验、田野研究等非纯数字工作流覆盖有限；
- 很少比较“看见来源”与“真正能纠错”之间的差异。

## 建议研究

开展 6 周混合方法研究，比较基线聊天、来源轨与可逆工作区三种产品形态。`,
    },
    {
      id: 8102,
      path: "out/evidence-matrix.csv",
      name: "evidence-matrix.csv",
      kind: "file",
      mime: "text/csv",
      size: 4180,
      title: "证据矩阵",
      description: "18 篇核心研究按机制、方法与证据强度编码",
      content:
        "study,year,mechanism,method,key_finding,evidence_strength\nPatel et al.,2025,provenance,field study,In-place provenance improved error detection,strong\nChen et al.,2024,reversibility,controlled experiment,Undo support reduced automation bias,moderate\nIbrahim et al.,2026,uncertainty,mixed methods,Actionable uncertainty outperformed confidence scores,strong\n",
    },
    {
      id: 8103,
      path: "out/research-roadmap.json",
      name: "research-roadmap.json",
      kind: "file",
      mime: "application/json",
      size: 2480,
      title: "6 周研究路线图",
      description: "招募、基线、干预与复盘阶段的结构化计划",
      content: JSON.stringify(
        {
          objective:
            "Evaluate provenance and reversibility mechanisms in authentic research work",
          weeks: [
            {
              week: 1,
              focus: "Recruitment and workflow mapping",
              output: "participant profiles",
            },
            {
              week: 2,
              focus: "Baseline observation",
              output: "critical incidents",
            },
            {
              week: 3,
              focus: "Provenance rail condition",
              output: "decision traces",
            },
            {
              week: 4,
              focus: "Reversible workspace condition",
              output: "undo and review events",
            },
            {
              week: 5,
              focus: "Longitudinal use",
              output: "trust calibration diary",
            },
            {
              week: 6,
              focus: "Interviews and synthesis",
              output: "design recommendations",
            },
          ],
        },
        null,
        2,
      ),
    },
  ],
  "smart-search": [],
  boltslides: [
    {
      id: 8201,
      path: "out/trustworthy-agents-deck.html",
      name: "trustworthy-agents-deck.html",
      kind: "file",
      mime: "text/html",
      size: 28640,
      title: "可信科研智能体 · 组会汇报",
      description: "10 页 16:9 深色研究演示稿",
      content: `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><style>
body{margin:0;background:#08111f;color:#f8fafc;font-family:Inter,system-ui}
.slide{box-sizing:border-box;width:1280px;height:720px;padding:74px 90px;display:flex;flex-direction:column;justify-content:center;background:radial-gradient(circle at 90% 10%,#312e81,#08111f 48%)}
.eyebrow{color:#67e8f9;letter-spacing:.14em;text-transform:uppercase;font-size:18px}.title{font-size:62px;line-height:1.08;max-width:920px}.sub{font-size:26px;color:#cbd5e1;max-width:820px;line-height:1.5}
.metric{display:inline-block;margin-right:28px;margin-top:40px;font-size:42px;color:#a7f3d0}.metric small{display:block;font-size:16px;color:#94a3b8}
</style></head>
<body><section class="slide"><div class="eyebrow">LAB MEETING · 2026</div><h1 class="title">从会回答，到值得共同工作</h1><p class="sub">可信科研智能体的交互机制、实证证据与产品设计原则</p><div><span class="metric">+31%<small>错误识别</small></span><span class="metric">−24%<small>无依据断言</small></span></div></section></body></html>`,
    },
    {
      id: 8202,
      path: "out/speaker-notes.md",
      name: "speaker-notes.md",
      kind: "file",
      mime: "text/markdown",
      size: 6280,
      title: "演讲者备注",
      description: "逐页讲述重点与过渡语",
      content:
        "# 演讲者备注\n\n## 1. 开场\n从一次“引用看似正确、实际无法回溯”的科研任务切入。\n\n## 2. 问题\n强调速度与控制并非二选一，界面机制决定研究者能否保持有效判断。\n\n## 3. 研究设计\n解释三组条件与混合方法数据来源。\n",
    },
  ],
  sci_draw: [
    {
      id: 8301,
      path: "out/transformer-encoder.svg",
      name: "transformer-encoder.svg",
      kind: "file",
      mime: "image/svg+xml",
      size: 12840,
      title: "Transformer 编码器结构图",
      description: "双栏论文尺寸，含多头注意力、残差与 LayerNorm",
      content: illustrationSvg(
        "Transformer Encoder · Multi-Head Attention + Residual",
      ),
    },
    {
      id: 8302,
      path: "out/figure-spec.json",
      name: "figure-spec.json",
      kind: "file",
      mime: "application/json",
      size: 2160,
      title: "可编辑绘图配方",
      description: "结构、配色、标签与导出参数",
      content: JSON.stringify(
        {
          canvas: { width: 1200, height: 760, background: "#ffffff" },
          palette: {
            primary: "#2563eb",
            accent: "#f97316",
            neutral: "#334155",
          },
          modules: [
            "Input Embedding",
            "Positional Encoding",
            "Multi-Head Attention",
            "Add & LayerNorm",
            "Feed Forward",
            "Add & LayerNorm",
          ],
          export: { formats: ["svg", "png"], journalWidth: "double-column" },
        },
        null,
        2,
      ),
    },
  ],
};

function artifactsForFeature(feature: AgentFeature): MockArtifact[] {
  return artifactsByFeature[feature];
}

function findArtifact(
  feature: AgentFeature,
  id: number,
): MockArtifact | undefined {
  return artifactsForFeature(feature).find((artifact) => artifact.id === id);
}

function agentModels(): Array<Record<string, unknown>> {
  return [
    {
      id: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      description: "速度与复杂推理能力均衡，适合日常科研任务",
    },
    {
      id: "gpt-5.2",
      name: "GPT-5.2",
      description: "强推理与长文档理解，适合复杂研究工作流",
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      description: "响应迅速，适合探索、改写和轻量检索",
    },
  ];
}

function userModels(feature: string): Array<Record<string, unknown>> {
  return [
    {
      model_id: "claude-sonnet-4-5",
      display_name: "Claude Sonnet 4.5",
      description: "平衡速度、严谨性与工具调用能力",
      context_window: 200000,
      speed_class: "balanced",
      locked: false,
      min_tier: "",
      is_default: true,
      vision: true,
      flagship: true,
    },
    {
      model_id: "gpt-5.2",
      display_name: "GPT-5.2",
      description: "复杂推理与长文档分析",
      context_window: 256000,
      speed_class: "powerful",
      locked: false,
      min_tier: "pro",
      is_default: false,
      vision: true,
      flagship: true,
    },
    {
      model_id: "gemini-2.5-flash",
      display_name: "Gemini 2.5 Flash",
      description:
        feature === "sci_draw"
          ? "快速理解图像输入与视觉草图"
          : "快速探索与轻量任务",
      context_window: 1000000,
      speed_class: "fast",
      locked: false,
      min_tier: "",
      is_default: false,
      vision: true,
      flagship: false,
    },
  ];
}

async function uploadAttachment(
  request: Request,
  feature: AgentFeature,
  requestedSessionId?: string,
): Promise<Response> {
  const form = await readFormData(request);
  const fileEntry = form?.get("file");
  const file = fileEntry instanceof File ? fileEntry : null;
  const formSessionId = stringValue(form?.get("session_id"));
  const session = ensureAgentSession(
    feature,
    requestedSessionId || formSessionId,
  );
  const filename = file?.name || "research-note.pdf";
  const mimeType = file?.type || "application/pdf";
  const type = mimeType.startsWith("image/") ? "image" : "file";
  return success({
    sessionId: session.sessionId,
    type,
    name: filename,
    mimeType,
    size: file?.size || 482_304,
    path: `/home/bun/sessions/${session.sessionId}/uploads/mock-${filename}`,
  });
}

async function referenceLibrary(
  request: Request,
  feature: AgentFeature,
  requestedSessionId?: string,
): Promise<Response> {
  const body = await readJsonObject(request);
  const session = ensureAgentSession(
    feature,
    requestedSessionId || stringValue(body.session_id),
  );
  const paperIds = Array.isArray(body.paper_ids)
    ? body.paper_ids.filter((id): id is number => typeof id === "number")
    : [];
  const folderIds = Array.isArray(body.folder_ids)
    ? body.folder_ids.filter((id): id is number => typeof id === "number")
    : [];
  const database = getMockDatabase();
  const paperItems = paperIds.map((id) => {
    const paper = database.libraryPapers.find((item) => item.id === id);
    return {
      kind: "paper",
      refId: id,
      title: paper?.title || `文献 #${id}`,
      hasPdf: true,
    };
  });
  const folderItems = folderIds.map((id) => {
    const folder = database.folders.find((item) => item.id === id);
    const paperCount = database.libraryPapers.filter(
      (paper) => paper.folder_id === id,
    ).length;
    return {
      kind: "folder",
      refId: id,
      title: folder?.name || `文献夹 #${id}`,
      paperCount,
      truncated: false,
    };
  });
  const items = [...paperItems, ...folderItems];
  return success({
    sessionId: session.sessionId,
    items,
    paperTotal:
      paperItems.length +
      folderItems.reduce((total, item) => total + item.paperCount, 0),
  });
}

function defaultRevisionItems(
  projectId: number,
): Array<Record<string, unknown>> {
  const existing = prismRevisions.get(projectId);
  if (existing) return existing;
  const items = [
    {
      id: projectId * 100 + 1,
      project_id: projectId,
      seq: 1,
      reviewer: "Reviewer 1",
      quote:
        "The manuscript does not provide enough detail to reproduce the literature search.",
      interpretation:
        "需要补充逐数据库检索式、时间范围、去重与灰色文献处理规则。",
      severity: "major",
      action: "concede_revise",
      anchor: "Method / Search strategy",
      status: "pending",
      response:
        "We thank the reviewer for identifying this omission. We have added the complete search strings and deduplication procedure to Supplementary Table S1.",
    },
    {
      id: projectId * 100 + 2,
      project_id: projectId,
      seq: 2,
      reviewer: "Reviewer 2",
      quote:
        "Please clarify whether validation and verification refer to distinct constructs.",
      interpretation: "全文统一核心术语，并在首次出现处给出操作性定义。",
      severity: "minor",
      action: "concede_revise",
      anchor: "Introduction / paragraph 3",
      status: "applied",
      response:
        "We now use “verification” consistently for source-level checking and reserve “validation” for study-level outcome assessment.",
    },
    {
      id: projectId * 100 + 3,
      project_id: projectId,
      seq: 3,
      reviewer: "Reviewer 2",
      quote:
        "The claimed generality across scientific domains appears stronger than the evidence.",
      interpretation: "不需要新增实验，但应收紧外推表述，并增强局限性讨论。",
      severity: "major",
      action: "partial",
      anchor: "Discussion / Limitations",
      status: "needs_author_input",
      response:
        "We have narrowed the claim to digitally mediated research workflows and explicitly identify wet-lab and field settings as future validation contexts.",
    },
  ];
  prismRevisions.set(projectId, items);
  return items;
}

function conformanceFor(
  project: MockPrismProject,
  struct: MockDocStruct,
): Record<string, unknown> {
  const wordCount = JSON.stringify(struct.body)
    .split(/\s+/)
    .filter(Boolean).length;
  return {
    template: struct.targetTemplate,
    page_limit: 12,
    page_count: 8,
    word_limit: 6000,
    word_count: Math.max(wordCount, 3428),
    missing:
      struct.frontMatter.authors && struct.frontMatter.authors.length > 0
        ? []
        : ["authors"],
    project_id: project.id,
  };
}

function qualityFor(struct: MockDocStruct): Record<string, unknown> {
  const hasFramework = struct.body.some(
    (block) => block.label === "fig:framework",
  );
  return {
    dangling_cites: [],
    undefined_xrefs: hasFramework ? [] : ["fig:framework"],
    missing_front: [],
    long_sentences: 2,
    stub_sections: [],
    todo_count: 0,
    abbrev_issues: ["AI 首次出现时建议同时给出全称 Artificial Intelligence"],
    abstract_num_issues: [],
    term_variants: ["human–AI / human-AI"],
    style_issues: ["百分号前空格在正文中存在两种写法"],
    issue_count: hasFramework ? 0 : 1,
  };
}

async function handlePrismMock(
  request: Request,
  path: string,
  url: URL,
): Promise<Response | undefined> {
  const method = request.method.toUpperCase();

  if (path === "/user/prism/templates" && method === "GET") {
    return success({
      templates: [
        {
          key: "nature-machine-intelligence",
          name: "Nature Machine Intelligence",
          doc_class: "sn-jnl",
        },
        {
          key: "ieee-transactions",
          name: "IEEE Transactions",
          doc_class: "IEEEtran",
        },
        {
          key: "acm-sigconf",
          name: "ACM Conference",
          doc_class: "acmart",
        },
        {
          key: "generic-academic",
          name: "通用学术论文",
          doc_class: "article",
        },
      ],
    });
  }

  if (path === "/user/prism/projects") {
    if (method === "GET") {
      return success({
        projects: getMockDatabase().prismProjects.map(prismProjectView),
      });
    }
    if (method === "POST") {
      const body = await readJsonObject(request);
      const database = getMockDatabase();
      const id = nextMockId(database.prismProjects);
      const fileId =
        Math.max(
          2000,
          ...database.prismProjects.flatMap((project) =>
            project.files.map((file) => file.id),
          ),
        ) + 1;
      const title = stringValue(body.title, "未命名研究");
      const created: MockPrismProject = {
        id,
        name: title,
        title,
        status: "ready",
        mainFileId: fileId,
        main_file_id: fileId,
        schema_version: "struct",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        files: [
          {
            id: fileId,
            projectId: id,
            name: "document.md",
            path: "document.md",
            content: `# ${title}\n\n在此开始撰写研究内容。`,
            isMain: true,
            updatedAt: new Date().toISOString(),
          },
        ],
      };
      updateMockDatabase((mutable) => {
        mutable.prismProjects.unshift(created);
      });
      // 身份自动登记:新建写作项目 → origin=prism 稿件入「写作中」稿件集。
      registerPrismManuscript({ id, title });
      defaultStructs.set(id, createDocumentStruct(created));
      return success({
        project: prismProjectView(created),
        files: created.files.map(prismFileView),
      });
    }
    return undefined;
  }

  const match = /^\/user\/prism\/projects\/(\d+)(\/.*)?$/.exec(path);
  if (!match) return undefined;
  const projectId = Number(match[1]);
  const tail = match[2] ?? "";
  const project = findPrismProject(projectId);
  if (!project) return apiError(404, "写作项目不存在");

  if (tail === "") {
    if (method === "GET") {
      return success({
        project: prismProjectView(project),
        files: project.files.map(prismFileView),
      });
    }
    if (method === "PATCH") {
      const body = await readJsonObject(request);
      const title = stringValue(body.title, project.title);
      updateMockDatabase((database) => {
        const target = database.prismProjects.find(
          (item) => item.id === projectId,
        );
        if (!target) return;
        target.title = title;
        target.name = title;
        target.updatedAt = new Date().toISOString();
        target.updated_at = target.updatedAt;
      });
      const struct = getDocumentStruct(project);
      struct.frontMatter.title = title;
      return success({ project: prismProjectView(project) });
    }
    if (method === "DELETE") {
      updateMockDatabase((database) => {
        database.prismProjects = database.prismProjects.filter(
          (item) => item.id !== projectId,
        );
      });
      defaultStructs.delete(projectId);
      prismConversations.delete(projectId);
      prismPendingRounds.delete(projectId);
      return noContent();
    }
  }

  if (tail === "/files" && method === "POST") {
    const body = await readJsonObject(request);
    const relPath = stringValue(
      body.rel_path,
      `notes-${project.files.length + 1}.tex`,
    );
    const fileId = Math.max(0, ...project.files.map((file) => file.id)) + 1;
    const file: MockPrismFile = {
      id: fileId,
      projectId,
      name: relPath.split("/").pop() || relPath,
      path: relPath,
      content: relPath.endsWith(".bib")
        ? "% Add BibTeX entries here\n"
        : "% New Prism file\n",
      isMain: false,
      updatedAt: new Date().toISOString(),
    };
    updateMockDatabase((database) => {
      database.prismProjects
        .find((item) => item.id === projectId)
        ?.files.push(file);
    });
    return success({ file: prismFileView(file) });
  }

  const fileMatch = /^\/files\/(\d+)(\/.*)?$/.exec(tail);
  if (fileMatch) {
    const fileId = Number(fileMatch[1]);
    const fileTail = fileMatch[2] ?? "";
    const file = findPrismFile(project, fileId);
    if (!file) return apiError(404, "文件不存在");

    if (fileTail === "") {
      if (method === "GET") {
        return success({ file: prismFileView(file), body: file.content });
      }
      if (method === "PUT") {
        const body = await readJsonObject(request);
        const content = stringValue(body.body, file.content);
        updateMockDatabase((database) => {
          const targetProject = database.prismProjects.find(
            (item) => item.id === projectId,
          );
          const targetFile = targetProject?.files.find(
            (item) => item.id === fileId,
          );
          if (!targetFile) return;
          targetFile.content = content;
          targetFile.updatedAt = new Date().toISOString();
          if (targetProject) {
            targetProject.updatedAt = targetFile.updatedAt;
            targetProject.updated_at = targetFile.updatedAt;
          }
        });
        return success({ file: prismFileView(file) });
      }
      if (method === "DELETE") {
        if (file.id === project.mainFileId) {
          return apiError(400, "主文件不能删除");
        }
        updateMockDatabase((database) => {
          const target = database.prismProjects.find(
            (item) => item.id === projectId,
          );
          if (target) {
            target.files = target.files.filter((item) => item.id !== fileId);
          }
        });
        return noContent();
      }
    }

    if (fileTail === "/rename" && method === "POST") {
      const body = await readJsonObject(request);
      const relPath = stringValue(body.rel_path, file.path);
      updateMockDatabase((database) => {
        const target = database.prismProjects
          .find((item) => item.id === projectId)
          ?.files.find((item) => item.id === fileId);
        if (!target) return;
        target.path = relPath;
        target.name = relPath.split("/").pop() || relPath;
        target.updatedAt = new Date().toISOString();
      });
      return success({ file: prismFileView(file) });
    }

    if (fileTail === "/versions" && method === "GET") {
      return success({
        versions: [
          {
            id: fileId * 10 + 3,
            version_no: 3,
            author: "林屿",
            status: "current",
            content_sha256: `mock-sha256-${fileId}-3`,
            created_at: file.updatedAt,
          },
          {
            id: fileId * 10 + 2,
            version_no: 2,
            author: "Prism AI",
            status: "saved",
            content_sha256: `mock-sha256-${fileId}-2`,
            created_at: "2026-07-27T07:42:00.000Z",
          },
          {
            id: fileId * 10 + 1,
            version_no: 1,
            author: "林屿",
            status: "saved",
            content_sha256: `mock-sha256-${fileId}-1`,
            created_at: "2026-07-25T03:18:00.000Z",
          },
        ],
      });
    }

    if (/^\/versions\/\d+\/restore$/.test(fileTail) && method === "POST") {
      updateMockDatabase((database) => {
        const target = database.prismProjects
          .find((item) => item.id === projectId)
          ?.files.find((item) => item.id === fileId);
        if (target) target.updatedAt = new Date().toISOString();
      });
      return success({ restored: true, file: prismFileView(file) });
    }
  }

  if (tail === "/compile" && method === "POST") {
    const body = await readJsonObject(request);
    const compileId = ++compileSequence;
    const compile: UnknownRecord = {
      id: compileId,
      project_id: projectId,
      status: "success",
      engine: stringValue(body.engine, "xelatex"),
      log_excerpt: "Output written on document.pdf (8 pages, 184216 bytes).",
      duration_ms: 1864,
      page_count: 8,
      overfull_count: 1,
      created_at: new Date().toISOString(),
    };
    compileRecords.set(compileId, compile);
    return success({ compile });
  }

  const compileMatch = /^\/compile\/(\d+)$/.exec(tail);
  if (compileMatch && method === "GET") {
    const compileId = Number(compileMatch[1]);
    const compile = compileRecords.get(compileId) ?? {
      id: compileId,
      project_id: projectId,
      status: "success",
      engine: "xelatex",
      log_excerpt: "Output written on document.pdf (8 pages, 184216 bytes).",
      duration_ms: 1864,
      page_count: 8,
      overfull_count: 1,
      created_at: MOCK_NOW,
    };
    return success({ compile });
  }

  if (tail === "/pdf" && method === "GET") {
    return binary(
      makeTinyPdf(project.title),
      "application/pdf",
      url.searchParams.get("download") ? `${project.title}.pdf` : undefined,
    );
  }

  if (tail === "/export/docx" && method === "GET") {
    return binary(
      `Scholay mock DOCX export\n\n${project.title}\n\nThis download is generated entirely in the browser mock layer.`,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      `${project.title}.docx`,
    );
  }

  if (tail === "/cite/search" && method === "GET") {
    const query = (url.searchParams.get("q") || "").toLowerCase();
    const papers = getMockDatabase()
      .libraryPapers.filter(
        (paper) => !query || paper.title.toLowerCase().includes(query),
      )
      .slice(0, 8)
      .map((paper) => ({
        library_paper_id: paper.id,
        cite_key: `${paper.authors?.[0]?.name?.split(" ").pop()?.toLowerCase() || "paper"}${paper.year || 2025}`,
        title: paper.og_title || paper.title,
        authors:
          (paper.og_authors || paper.authors)
            ?.map((author) => author.name)
            .join(", ") || "Unknown authors",
        year: paper.og_year || paper.year || 2025,
        venue: paper.og_venue || paper.venue || "Preprint",
        doi: paper.og_doi || paper.doi || "",
      }));
    return success({ candidates: papers });
  }

  if (tail === "/cite/apply" && method === "POST") {
    const body = await readJsonObject(request);
    const paperId = numberValue(body.library_paper_id);
    const paper = getMockDatabase().libraryPapers.find(
      (item) => item.id === paperId,
    );
    const key = `${paper?.authors?.[0]?.name?.split(" ").pop()?.toLowerCase() || "paper"}${paper?.year || 2025}`;
    const struct = getDocumentStruct(project);
    struct.bibliography ??= {};
    struct.bibliography[key] =
      `@article{${key},title={${paper?.title || "Referenced paper"}},year={${paper?.year || 2025}}}`;
    return success({ cite_key: key });
  }

  if (tail === "/chat" && method === "GET") {
    return success({
      messages: [
        {
          id: 1,
          role: "user",
          text: "请让摘要更聚焦研究贡献。",
          applied_hunks: 0,
          failed_hunks: 0,
          created_at: "2026-07-27T07:42:00.000Z",
        },
        {
          id: 2,
          role: "assistant",
          text: "已生成一版更聚焦的摘要，并保留三个可核验数字。",
          edit_id: 501,
          file_id: project.mainFileId,
          applied_hunks: 1,
          failed_hunks: 0,
          created_at: "2026-07-27T07:42:12.000Z",
        },
      ],
    });
  }

  if (tail === "/struct") {
    if (method === "GET") {
      return success({ struct: getDocumentStruct(project) });
    }
    if (method === "PUT") {
      const body = await readJsonObject(request);
      const candidate = body.struct;
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        return apiError(400, "缺少 struct");
      }
      defaultStructs.set(projectId, candidate as unknown as MockDocStruct);
      updateMockDatabase((database) => {
        const target = database.prismProjects.find(
          (item) => item.id === projectId,
        );
        if (target) {
          target.updatedAt = new Date().toISOString();
          target.updated_at = target.updatedAt;
        }
      });
      return success({ struct: candidate });
    }
  }

  if (tail === "/conformance" && method === "GET") {
    const struct = getDocumentStruct(project);
    return success({ conformance: conformanceFor(project, struct) });
  }

  if (tail === "/writing-profile") {
    if (method === "GET") {
      return success({
        profile: {
          base_slug: "empirical-hci",
          genre: "research-article",
          source: "planner",
          needs_refine: false,
        },
        personas: [
          {
            slug: "empirical-hci",
            name: "实证 HCI 研究者",
            kind: "discipline",
            description:
              "以研究问题、实证证据与设计含义为主线，克制表达因果与普适性。",
            scene: "用户研究、交互系统评估、设计框架论文",
            traits: ["证据优先", "边界清晰", "设计含义"],
            skeleton: ["研究缺口", "研究问题", "方法", "结果", "设计含义"],
            sample:
              "The findings suggest a mechanism-level explanation rather than a universal effect.",
          },
          {
            slug: "nature-brief",
            name: "Nature 简洁体",
            kind: "genre",
            description:
              "短句、高信息密度，开头迅速建立问题的重要性与核心发现。",
            scene: "跨学科高影响力期刊",
            traits: ["结论前置", "信息密度", "跨学科可读"],
            skeleton: ["背景张力", "关键缺口", "主要发现", "广泛意义"],
            sample:
              "Here we show that reversible interfaces materially change how researchers detect and recover from agent errors.",
          },
          {
            slug: "systematic-review",
            name: "系统综述写作",
            kind: "genre",
            description: "强调检索可复现、纳排透明、证据强弱与结论边界。",
            scene: "系统综述、范围综述与证据地图",
            traits: ["可复现", "证据分级", "边界克制"],
            skeleton: ["检索策略", "编码框架", "证据综合", "偏倚", "研究议程"],
            sample:
              "Evidence was strongest for short, digitally mediated tasks and remained limited in longitudinal settings.",
          },
        ],
      });
    }
    if (method === "PUT") {
      const body = await readJsonObject(request);
      return success({
        profile: {
          base_slug: stringValue(body.base_slug, "empirical-hci"),
          genre: stringValue(body.genre, "research-article"),
          source: "user",
          needs_refine: false,
        },
      });
    }
  }

  if (tail === "/writing-profile/plan" && method === "POST") {
    return success({
      profile: {
        base_slug: "empirical-hci",
        genre: "research-article",
        source: "planner",
        needs_refine: false,
      },
    });
  }

  if (tail === "/quality-check" && method === "GET") {
    return success({ quality: qualityFor(getDocumentStruct(project)) });
  }

  if (tail === "/template" && method === "POST") {
    const body = await readJsonObject(request);
    const struct = getDocumentStruct(project);
    struct.targetTemplate = stringValue(body.template, struct.targetTemplate);
    return success({
      struct,
      conformance: conformanceFor(project, struct),
    });
  }

  if (tail === "/assets" && method === "POST") {
    const form = await readFormData(request);
    const fileEntry = form?.get("file");
    const file = fileEntry instanceof File ? fileEntry : null;
    const filename = file?.name || `research-figure-${++assetSequence}.png`;
    const assetPath = `assets/${assetSequence}-${filename}`;
    const struct = getDocumentStruct(project);
    struct.assets ??= {};
    struct.assets[assetPath] = {
      mime: file?.type || "image/png",
      size: file?.size || 184_000,
    };
    struct.body.push({
      id: `figure-${assetSequence}`,
      type: "figure",
      asset: assetPath,
      caption: "Uploaded research figure",
      width: "0.85\\linewidth",
      label: `fig:uploaded-${assetSequence}`,
    });
    return success({ struct });
  }

  if (tail === "/clone-to-struct" && method === "POST") {
    const database = getMockDatabase();
    const id = nextMockId(database.prismProjects);
    let nextFileId =
      Math.max(
        0,
        ...database.prismProjects.flatMap((item) =>
          item.files.map((file) => file.id),
        ),
      ) + 1;
    const files = project.files.map((file) => ({
      ...structuredClone(file),
      id: nextFileId++,
      projectId: id,
      isMain: file.id === project.mainFileId,
    }));
    const mainFile = files.find((file) => file.isMain) ?? files[0];
    const cloned: MockPrismProject = {
      ...structuredClone(project),
      id,
      name: `${project.title}（新版）`,
      title: `${project.title}（新版）`,
      mainFileId: mainFile?.id ?? nextFileId,
      main_file_id: mainFile?.id ?? nextFileId,
      schema_version: "struct",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      files,
    };
    updateMockDatabase((mutable) => {
      mutable.prismProjects.unshift(cloned);
    });
    defaultStructs.set(id, structuredClone(getDocumentStruct(project)));
    return success({ project: prismProjectView(cloned) });
  }

  if (tail === "/round/prepare" && method === "POST") {
    return success({ ok: true, epoch: getPendingRound(project).epoch });
  }

  if (tail === "/round/pending" && method === "GET") {
    return success(getPendingRound(project));
  }

  if (tail === "/round/apply" && method === "POST") {
    const pending = getPendingRound(project);
    const proposed = pending.files[0]?.new_struct;
    if (proposed && typeof proposed === "object" && !Array.isArray(proposed)) {
      defaultStructs.set(projectId, proposed as unknown as MockDocStruct);
    }
    prismPendingRounds.set(projectId, {
      files: [],
      epoch: `mock-epoch-${projectId}-${Date.now().toString(36)}`,
    });
    return success({ applied: pending.files.length });
  }

  if (tail === "/round/reject" && method === "POST") {
    prismPendingRounds.set(projectId, {
      files: [],
      epoch: `mock-epoch-${projectId}-${Date.now().toString(36)}`,
    });
    return success({ ok: true });
  }

  if (tail === "/conversations") {
    if (method === "GET") {
      return success({ sessions: ensurePrismConversations(projectId) });
    }
    if (method === "POST") {
      const sessionId = `prism-${projectId}-conversation-${++conversationSequence}`;
      ensurePrismConversations(projectId).unshift({
        sessionId,
        title: "新对话",
        messageCount: 0,
        lastAccessedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      return success({ sessionId });
    }
  }

  if (tail === "/revision/parse" && method === "POST") {
    const items = defaultRevisionItems(projectId);
    return success({ items });
  }

  if (tail === "/revision" && method === "GET") {
    return success({ items: defaultRevisionItems(projectId) });
  }

  const revisionMatch = /^\/revision\/(\d+)$/.exec(tail);
  if (revisionMatch && method === "PATCH") {
    const itemId = Number(revisionMatch[1]);
    const body = await readJsonObject(request);
    const item = defaultRevisionItems(projectId).find(
      (candidate) => candidate.id === itemId,
    );
    if (!item) return apiError(404, "修改意见不存在");
    Object.assign(item, body);
    return success({ item });
  }

  if (tail === "/revision/letter" && method === "GET") {
    const responses = defaultRevisionItems(projectId)
      .map(
        (item) =>
          `## Comment ${item.seq} — ${item.reviewer}\n\n> ${item.quote}\n\n**Response:** ${item.response}`,
      )
      .join("\n\n");
    return success({
      letter: `# Response to Reviewers\n\nDear Editor and Reviewers,\n\nThank you for the constructive feedback. We have revised the manuscript carefully and summarize every change below.\n\n${responses}`,
    });
  }

  if (tail === "/verify-numbers" && method === "POST") {
    const body = await readJsonObject(request);
    const source = stringValue(body.source);
    const text = stringValue(body.text);
    const values = [...new Set(text.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [])];
    return success({
      checks: values.map((value) => ({
        number: value,
        found: source.includes(value),
      })),
    });
  }

  if (tail === "/terminology") {
    if (method === "GET") {
      return success({
        terminology:
          prismTerminology.get(projectId) ??
          "research agent = 科研智能体\nprovenance = 来源谱系\nverification = 来源级核验\nvalidation = 研究结果层验证\nreversible action = 可逆操作",
      });
    }
    if (method === "PUT") {
      const body = await readJsonObject(request);
      prismTerminology.set(projectId, stringValue(body.terminology));
      return success({ ok: true });
    }
  }

  if (tail === "/workspace/file" && method === "GET") {
    const relPath = url.searchParams.get("path") || "document.md";
    if (relPath === "document.md") {
      return success({
        found: true,
        content: JSON.stringify(getDocumentStruct(project), null, 2),
      });
    }
    const file = project.files.find((candidate) => candidate.path === relPath);
    return success({
      found: !!file,
      content: file?.content ?? "",
    });
  }

  if (tail === "/session/messages" && method === "GET") {
    const messages = prismHistory(projectId);
    return success({
      messages,
      totalTurns: 1,
      hasMore: false,
    });
  }

  if (tail === "/session/context" && method === "GET") {
    return success({
      totalTokens: 18_742,
      maxTokens: 200_000,
      percentage: 9.4,
      model: "claude-sonnet-4-5",
    });
  }

  if (tail === "/ws-ticket" && method === "POST") {
    const requested = url.searchParams.get("session_id");
    const conversation =
      ensurePrismConversations(projectId).find(
        (item) => item.sessionId === requested,
      ) ?? ensurePrismConversations(projectId)[0];
    return success({
      sessionId:
        stringValue(conversation?.sessionId) ||
        `prism-${projectId}-design-review`,
      wsToken: `mock-prism-ws-${projectId}-${Date.now().toString(36)}`,
      expiresInSeconds: 30,
    });
  }

  if (tail === "/upload" && method === "POST") {
    const requested = url.searchParams.get("session_id") || undefined;
    return uploadAttachment(request, "claw", requested);
  }

  if (tail === "/reference" && method === "POST") {
    const requested = url.searchParams.get("session_id") || undefined;
    return referenceLibrary(request, "claw", requested);
  }

  if (tail === "/session/file" && method === "GET") {
    return binary(illustrationSvg("Prism attachment preview"), "image/svg+xml");
  }

  return undefined;
}

async function handlePeerReviewMock(
  request: Request,
  path: string,
  url: URL,
): Promise<Response | undefined> {
  const method = request.method.toUpperCase();

  if (
    path === "/user/peer-review/submissions/latest-draft" &&
    method === "GET"
  ) {
    const requestedMode = url.searchParams.get("mode");
    const draft = getMockDatabase()
      .submissions.filter(
        (submission) =>
          submission.status === "draft" &&
          (!requestedMode || submission.mode === requestedMode) &&
          assetsForSubmission(submission.id).length > 0,
      )
      .sort(
        (a, b) =>
          Date.parse(stringValue(b.updated_at, b.updatedAt)) -
          Date.parse(stringValue(a.updated_at, a.updatedAt)),
      )[0];
    return draft
      ? success(submissionView(draft))
      : apiError(404, "暂无可恢复草稿");
  }

  if (
    path === "/user/peer-review/submissions/resume-or-create" &&
    method === "POST"
  ) {
    const body = await readJsonObject(request);
    const mode =
      stringValue(body.mode, "journal") === "thesis" ? "thesis" : "journal";
    const existing = getMockDatabase()
      .submissions.filter(
        (submission) =>
          submission.mode === mode && submission.status === "draft",
      )
      .sort(
        (a, b) =>
          Date.parse(stringValue(b.updated_at, b.updatedAt)) -
          Date.parse(stringValue(a.updated_at, a.updatedAt)),
      )[0];
    if (existing) return success(submissionView(existing));
    const id = nextMockId(getMockDatabase().submissions);
    const created: MockSubmission = {
      id,
      mode,
      title: "",
      abstract: "",
      status: "draft",
      step: 1,
      computeState: "idle",
      compute_state: "idle",
      assetsRevision: 0,
      metaRevision: 0,
      letterRevision: 0,
      agentSessionId: `peer-review-${id}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    updateMockDatabase((database) => {
      database.submissions.unshift(created);
    });
    submissionAssets.set(id, []);
    return success(submissionView(created));
  }

  if (path === "/user/peer-review/submissions") {
    if (method === "GET") {
      const mode = url.searchParams.get("mode");
      const items = getMockDatabase()
        .submissions.filter((submission) => !mode || submission.mode === mode)
        .sort(
          (a, b) =>
            Date.parse(stringValue(b.updated_at, b.updatedAt)) -
            Date.parse(stringValue(a.updated_at, a.updatedAt)),
        )
        .map(listSubmissionView);
      return success({ items, total: items.length });
    }
    if (method === "POST") {
      const body = await readJsonObject(request);
      const mode =
        stringValue(body.mode, "journal") === "thesis" ? "thesis" : "journal";
      const id = nextMockId(getMockDatabase().submissions);
      const created: MockSubmission = {
        id,
        mode,
        title: "",
        abstract: "",
        status: "draft",
        step: 1,
        computeState: "idle",
        compute_state: "idle",
        assetsRevision: 0,
        metaRevision: 0,
        letterRevision: 0,
        agentSessionId: `peer-review-${id}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      updateMockDatabase((database) => {
        database.submissions.unshift(created);
      });
      submissionAssets.set(id, []);
      return success(submissionView(created));
    }
    return undefined;
  }

  const match = /^\/user\/peer-review\/submissions\/(\d+)(\/.*)?$/.exec(path);
  if (!match) return undefined;
  const submissionId = Number(match[1]);
  const tail = match[2] ?? "";
  const submission = getMockDatabase().submissions.find(
    (item) => item.id === submissionId,
  );
  if (!submission) return apiError(404, "投稿记录不存在");

  if (tail === "") {
    if (method === "GET") return success(submissionView(submission));
    if (method === "PATCH") {
      const body = await readJsonObject(request);
      updateMockDatabase((database) => {
        const target = database.submissions.find(
          (item) => item.id === submissionId,
        );
        if (!target) return;
        Object.assign(target, body);
        target.updatedAt = new Date().toISOString();
        target.updated_at = target.updatedAt;
      });
      return success(submissionView(submission));
    }
    if (method === "DELETE") {
      updateMockDatabase((database) => {
        database.submissions = database.submissions.filter(
          (item) => item.id !== submissionId,
        );
      });
      submissionAssets.delete(submissionId);
      return noContent();
    }
  }

  if (tail === "/submit" && method === "POST") {
    updateMockDatabase((database) => {
      const target = database.submissions.find(
        (item) => item.id === submissionId,
      );
      if (!target) return;
      target.status = "completed";
      target.step = 4;
      target.computeState = "idle";
      target.compute_state = "idle";
      target.submittedAt = new Date().toISOString();
      target.completedAt = new Date().toISOString();
      target.agreedAt = new Date().toISOString();
      target.updatedAt = new Date().toISOString();
      target.updated_at = target.updatedAt;
    });
    return success(submissionView(submission));
  }

  if (tail === "/retry" && method === "POST") {
    updateMockDatabase((database) => {
      const target = database.submissions.find(
        (item) => item.id === submissionId,
      );
      if (!target) return;
      target.status = "completed";
      target.computeState = "idle";
      target.compute_state = "idle";
      target.computeError = undefined;
      target.completedAt = new Date().toISOString();
      target.updatedAt = new Date().toISOString();
      target.updated_at = target.updatedAt;
    });
    return success(submissionView(submission));
  }

  if (tail === "/advance" && method === "POST") {
    const body = await readJsonObject(request);
    const fromStep = Math.min(
      3,
      Math.max(1, numberValue(body.from, submission.step)),
    );
    updateMockDatabase((database) => {
      const target = database.submissions.find(
        (item) => item.id === submissionId,
      );
      if (!target) return;
      target.step = (fromStep + 1) as 1 | 2 | 3 | 4;
      target.computeState = "idle";
      target.compute_state = "idle";
      if (fromStep === 1) {
        target.title ||=
          submission.mode === "journal"
            ? "Human–AI Collaboration in Scientific Discovery"
            : "面向可信科研工作流的智能体交互设计研究";
        target.abstract ||=
          submission.mode === "journal"
            ? "A systematic review of interaction patterns, evaluation methods, and governance challenges in AI-assisted scientific discovery."
            : "研究科研智能体在多阶段知识工作中的可解释交互、错误恢复与协作边界。";
        target.extraMeta = {
          keywords:
            submission.mode === "journal"
              ? [
                  "human–AI collaboration",
                  "research agents",
                  "scientific discovery",
                ]
              : ["科研智能体", "可信交互", "人机协作"],
          subjects:
            submission.mode === "journal"
              ? ["Artificial Intelligence", "Human-Computer Interaction"]
              : ["人机交互", "人工智能"],
          manuscriptType: submission.mode === "journal" ? "review" : "research",
        };
        target.metaRevision = numberValue(target.metaRevision) + 1;
      }
      if (fromStep === 2) {
        target.letterBody =
          submission.mode === "journal"
            ? "Dear Editors,\n\nWe submit our systematic review of human–AI collaboration in scientific discovery. The manuscript synthesizes 148 studies and develops an actionable framework for inspectable and reversible research agents.\n\nSincerely,\nYu Lin"
            : "尊敬的学位评审专家：\n\n本论文围绕可信科研智能体的交互机制展开系统研究，形成了可追溯、可逆和不确定性校准三类设计原则，敬请审阅。";
        target.letterRevision = numberValue(target.letterRevision) + 1;
      }
      target.updatedAt = new Date().toISOString();
      target.updated_at = target.updatedAt;
    });
    return success(submissionView(submission));
  }

  if (tail === "/assets") {
    if (method === "GET") {
      return success({ items: assetsForSubmission(submissionId) });
    }
    if (method === "POST") {
      const form = await readFormData(request);
      const fileEntry = form?.get("file");
      const file = fileEntry instanceof File ? fileEntry : null;
      const role =
        stringValue(form?.get("role"), "attachment") === "manuscript"
          ? "manuscript"
          : "attachment";
      const category = stringValue(form?.get("category")) || undefined;
      const current = assetsForSubmission(submissionId);
      const id = Math.max(
        ++assetSequence,
        1 +
          Math.max(
            0,
            ...[...submissionAssets.values()].flat().map((item) => item.id),
          ),
      );
      const created: MockSubmissionAsset = {
        id,
        submissionId,
        role,
        category,
        filename:
          file?.name ||
          (role === "manuscript" ? "manuscript.pdf" : "attachment.pdf"),
        size: file?.size || 1_248_000,
        mime: file?.type || "application/pdf",
        sha256: `mock-upload-${id}`,
        textChars: role === "manuscript" ? 42_800 : undefined,
        createdAt: new Date().toISOString(),
      };
      if (role === "manuscript") {
        const oldIndex = current.findIndex(
          (item) => item.role === "manuscript",
        );
        if (oldIndex >= 0) current.splice(oldIndex, 1, created);
        else current.unshift(created);
        // 身份自动登记:独立上传主稿 → origin=upload 稿件入「审稿上传」稿件集
        // (已被 Prism 送审轮绑定的投稿在函数内部 no-op)。
        registerUploadManuscript(submission, created.filename);
      } else {
        current.push(created);
      }
      updateMockDatabase((database) => {
        const target = database.submissions.find(
          (item) => item.id === submissionId,
        );
        if (!target) return;
        target.assetsRevision = numberValue(target.assetsRevision) + 1;
        target.updatedAt = new Date().toISOString();
        target.updated_at = target.updatedAt;
      });
      return success(created);
    }
  }

  const assetMatch = /^\/assets\/(\d+)$/.exec(tail);
  if (assetMatch) {
    const assetId = Number(assetMatch[1]);
    const assets = assetsForSubmission(submissionId);
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return apiError(404, "附件不存在");
    if (method === "DELETE") {
      const nextAssets = assets.filter((item) => item.id !== assetId);
      const submissionDeleted =
        submission.status === "draft" && nextAssets.length === 0;
      submissionAssets.set(submissionId, nextAssets);
      if (submissionDeleted) {
        updateMockDatabase((database) => {
          database.submissions = database.submissions.filter(
            (item) => item.id !== submissionId,
          );
        });
      }
      return success({ ok: true, submissionDeleted });
    }
    if (method === "GET") {
      if (asset.mime === "application/pdf") {
        return binary(makeTinyPdf(asset.filename), asset.mime, asset.filename);
      }
      return binary(
        `Mock attachment: ${asset.filename}\nGenerated by the Scholay frontend design backend.`,
        asset.mime,
        asset.filename,
      );
    }
  }

  if (tail === "/reports" && method === "GET") {
    return success({ items: reviewReports(submissionId) });
  }

  const reportMatch = /^\/reports\/(alpha|beta|gamma|chief)$/.exec(tail);
  if (reportMatch && method === "GET") {
    const report = reviewReports(submissionId).find(
      (item) => item.role === reportMatch[1],
    );
    return report ? success(report) : apiError(404, "审稿报告不存在");
  }

  if (tail === "/stream" && method === "GET") {
    return streamSse(url.searchParams.get("slot") || "meta");
  }

  if (tail === "/download" && method === "GET") {
    return binary(
      `Scholay mock submission archive\nSubmission: ${submissionId}\nFiles:\n${assetsForSubmission(
        submissionId,
      )
        .map((asset) => `- ${asset.filename}`)
        .join("\n")}`,
      "application/zip",
      `submission-${submissionId}-files.zip`,
    );
  }

  if (tail === "/journal-recommend" && method === "POST") {
    return success({
      items: [
        {
          journalId: 10001,
          canonicalName: "Nature Machine Intelligence",
          aiReason: "主题与可信科研智能体、人机协作高度匹配。",
          jcrImpactFactor: 23.8,
          jcrQuartile: "Q1",
          publisher: "Springer Nature",
        },
        {
          journalId: 10002,
          canonicalName: "ACM Transactions on Computer-Human Interaction",
          aiReason: "交互设计与纵向用户研究贡献适合该刊。",
          jcrImpactFactor: 7.7,
          jcrQuartile: "Q1",
          publisher: "ACM",
        },
      ],
    });
  }

  if (tail === "/letter-draft" && method === "POST") {
    return success({
      letterBody:
        "Dear Editors,\n\nWe submit our manuscript on trustworthy interaction mechanisms for research agents. The work combines a mixed-method study with an actionable design framework.\n\nSincerely,\nYu Lin",
    });
  }

  return undefined;
}

function agentSessionListItem(
  feature: AgentFeature,
  session: MockAgentSession,
): Record<string, unknown> {
  const messages =
    session.messages.length > 0
      ? session.messages
      : session.title === "新对话"
        ? []
        : agentHistory(feature, session.sessionId);
  return {
    sessionId: session.sessionId,
    title: session.title,
    messageCount: messages.length,
    lastAccessedAt: session.updatedAt,
    createdAt: session.createdAt,
    agentCreatedAt: session.createdAt,
    agentModifiedAt: session.updatedAt,
  };
}

async function handleAgentMock(
  request: Request,
  path: string,
  url: URL,
): Promise<Response | undefined> {
  const method = request.method.toUpperCase();

  if (path === "/user/models" && method === "GET") {
    return success(userModels(url.searchParams.get("feature") || "claw"));
  }

  if (path === "/user/agent-session/resolve" && method === "GET") {
    const sessionId = url.searchParams.get("session_id") || "";
    const session = getMockDatabase().agentSessions.find(
      (item) => item.sessionId === sessionId,
    );
    const normalizedFeature = session
      ? normalizeAgentFeature(session.feature)
      : null;
    return success({
      owned: !!session && !!normalizedFeature,
      feature:
        normalizedFeature === "smart-search" ? "" : (normalizedFeature ?? ""),
    });
  }

  const match =
    /^\/user\/(smart-search|claw|boltslides|sci_draw|sci-draw)(\/.*)?$/.exec(
      path,
    );
  if (!match) return undefined;
  const feature = normalizeAgentFeature(match[1]);
  if (!feature) return undefined;
  const tail = match[2] ?? "";

  if (tail === "/sessions") {
    if (method === "GET") {
      const items = sessionsForFeature(feature).map((session) =>
        agentSessionListItem(feature, session),
      );
      return success({ items, total: items.length });
    }
    if (method === "POST") {
      const created = createAgentSession(feature);
      return success({ sessionId: created.sessionId });
    }
  }

  const sessionCrudMatch = /^\/sessions\/([^/]+)(\/activate)?$/.exec(tail);
  if (sessionCrudMatch) {
    const sessionId = decodeURIComponent(sessionCrudMatch[1]);
    const activate = !!sessionCrudMatch[2];
    const session = findAgentSession(feature, sessionId);
    if (!session) return apiError(404, "会话不存在");
    if (activate && method === "POST") {
      updateMockDatabase((database) => {
        database.agentSessions.forEach((candidate) => {
          if (
            candidate.feature === feature ||
            candidate.feature === databaseFeature(feature)
          ) {
            candidate.active = candidate.sessionId === sessionId;
            if (candidate.active)
              candidate.updatedAt = new Date().toISOString();
          }
        });
      });
      return success({ ok: true });
    }
    if (!activate && method === "PATCH") {
      const body = await readJsonObject(request);
      const title =
        stringValue(body.title, session.title).trim() || session.title;
      updateMockDatabase((database) => {
        const target = database.agentSessions.find(
          (candidate) => candidate.sessionId === sessionId,
        );
        if (!target) return;
        target.title = title;
        target.updatedAt = new Date().toISOString();
      });
      return success({ ok: true });
    }
    if (!activate && method === "DELETE") {
      updateMockDatabase((database) => {
        database.agentSessions = database.agentSessions.filter(
          (candidate) => candidate.sessionId !== sessionId,
        );
        const remaining = database.agentSessions
          .filter(
            (candidate) =>
              candidate.feature === feature ||
              candidate.feature === databaseFeature(feature),
          )
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        if (remaining[0]) remaining[0].active = true;
      });
      return noContent();
    }
  }

  if (tail === "/session" && method === "GET") {
    const session = ensureAgentSession(feature);
    return success({ sessionId: session.sessionId });
  }

  if (tail === "/session/reset" && method === "POST") {
    const current = findAgentSession(feature);
    updateMockDatabase((database) => {
      if (current) {
        database.agentSessions = database.agentSessions.filter(
          (session) => session.sessionId !== current.sessionId,
        );
      }
    });
    const created = createAgentSession(feature);
    return success({ sessionId: created.sessionId });
  }

  if (tail === "/session/messages" && method === "GET") {
    const requested = url.searchParams.get("session_id");
    const session = findAgentSession(feature, requested);
    if (!session) return apiError(404, "会话不存在");
    const messages =
      session.messages.length > 0
        ? session.messages
        : session.title === "新对话"
          ? []
          : agentHistory(feature, session.sessionId);
    return success({
      sessionId: session.sessionId,
      messages,
      totalTurns: messages.filter((message) => message.type === "user").length,
      hasMore: false,
    });
  }

  if (tail === "/session/context" && method === "GET") {
    const requested = url.searchParams.get("session_id");
    const session = findAgentSession(feature, requested);
    if (!session) return apiError(404, "会话不存在");
    const totalTokens =
      feature === "smart-search"
        ? 24_680
        : feature === "boltslides"
          ? 31_240
          : feature === "sci_draw"
            ? 16_920
            : 28_430;
    const maxTokens = 200_000;
    return success({
      sessionId: session.sessionId,
      totalTokens,
      maxTokens,
      percentage: Number(((totalTokens / maxTokens) * 100).toFixed(1)),
      model: "claude-sonnet-4-5",
    });
  }

  if (tail === "/session/ws-ticket" && method === "POST") {
    const session = ensureAgentSession(
      feature,
      url.searchParams.get("session_id"),
    );
    return success({
      sessionId: session.sessionId,
      wsToken: `mock-${feature}-ws-${Date.now().toString(36)}`,
      expiresInSeconds: 30,
    });
  }

  if (tail === "/models" && method === "GET") {
    const models = agentModels();
    return success({ models, total: models.length });
  }

  if (tail === "/upload" && method === "POST") {
    return uploadAttachment(
      request,
      feature,
      url.searchParams.get("session_id") || undefined,
    );
  }

  if (tail === "/reference" && method === "POST") {
    return referenceLibrary(
      request,
      feature,
      url.searchParams.get("session_id") || undefined,
    );
  }

  if (tail === "/session/artifacts" && method === "GET") {
    const requested = url.searchParams.get("session_id");
    if (requested && !findAgentSession(feature, requested)) {
      return apiError(404, "会话不存在");
    }
    const items = artifactsForFeature(feature).map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ content: _content, ...item }) => item,
    );
    return success({ items, total: items.length });
  }

  const artifactIdMatch = /^\/artifact\/(\d+)$/.exec(tail);
  if (artifactIdMatch && method === "GET") {
    const artifact = findArtifact(feature, Number(artifactIdMatch[1]));
    if (!artifact) return apiError(404, "交付物不存在");
    return binary(artifact.content, artifact.mime, artifact.name, {
      "Cache-Control": "private, max-age=300",
    });
  }

  if (tail === "/session/artifact" && method === "GET") {
    const artifactPath = url.searchParams.get("path") || "";
    const artifact = artifactsForFeature(feature).find(
      (candidate) => candidate.path === artifactPath,
    );
    if (!artifact) return apiError(404, "交付物不存在");
    return binary(
      artifact.content,
      artifact.mime,
      url.searchParams.get("download") === "1" ? artifact.name : undefined,
    );
  }

  if (tail === "/session/artifact.zip" && method === "GET") {
    const dir = url.searchParams.get("dir") || "out";
    return binary(
      `Scholay mock artifact archive\nFeature: ${feature}\nDirectory: ${dir}\n`,
      "application/zip",
      `${dir.split("/").pop() || "artifacts"}.zip`,
    );
  }

  if (tail === "/session/file" && method === "GET") {
    const label = `${featureLabels[feature]} · attachment preview`;
    return binary(illustrationSvg(label), "image/svg+xml");
  }

  if (
    tail === "/session/export-pptx" &&
    method === "POST" &&
    feature === "boltslides"
  ) {
    const body = await readJsonObject(request);
    const format = stringValue(body.format, "pptx");
    const extension = format === "pdf" ? "pdf" : "pptx";
    const mime =
      extension === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const content =
      extension === "pdf"
        ? makeTinyPdf("Trustworthy Research Agents — Slide Deck")
        : encoder.encode(
            "Scholay mock PPTX export\n10 slides\nTrustworthy Research Agents",
          ).buffer;
    return binary(content, mime, `trustworthy-research-agents.${extension}`, {
      "X-Deck-Slides": "10",
    });
  }

  return undefined;
}

/**
 * 复杂工作区的统一 HTTP mock 分发器。
 *
 * `path` 是调用方已经移除 `/api/v1` 的 pathname；为方便独立测试，这里也容忍
 * 意外携带该前缀或 query string。未命中的请求返回 null，交回其它 mock 模块处理。
 */
export async function handleWorkspaceMock(
  request: Request,
  path: string,
): Promise<Response | null> {
  const cleanPath =
    path
      .split("?")[0]
      .replace(/^\/api\/v1(?=\/|$)/, "")
      .replace(/\/+$/, "") || "/";
  const url = requestUrl(request);

  if (cleanPath.startsWith("/user/prism/")) {
    return (await handlePrismMock(request, cleanPath, url)) ?? null;
  }
  if (cleanPath.startsWith("/user/peer-review/")) {
    return (await handlePeerReviewMock(request, cleanPath, url)) ?? null;
  }
  if (
    cleanPath === "/user/models" ||
    cleanPath === "/user/agent-session/resolve" ||
    /^\/user\/(smart-search|claw|boltslides|sci_draw|sci-draw)(?:\/|$)/.test(
      cleanPath,
    )
  ) {
    return (await handleAgentMock(request, cleanPath, url)) ?? null;
  }
  return null;
}
