import type {
  RemoteStagingArea,
  UserLibraryFolderItem,
  UserLibraryPaper,
} from "@/shared/api/types";
import { MOCK_STORAGE } from "./config";
import { mockFolders, mockLibraryPapers, mockStagingAreas } from "./fixtures";

export interface MockSubmission {
  id: number;
  mode: "journal" | "thesis";
  title: string;
  abstract: string;
  status: string;
  step: number;
  computeState: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface MockPrismFile {
  id: number;
  projectId: number;
  name: string;
  path: string;
  content: string;
  isMain: boolean;
  updatedAt: string;
}

export interface MockPrismProject {
  id: number;
  name: string;
  title: string;
  status: string;
  mainFileId: number;
  createdAt: string;
  updatedAt: string;
  files: MockPrismFile[];
  [key: string]: unknown;
}

/**
 * 稿件 / 稿件集共享资源层(写 ↔ 审 ↔ 改循环的身份与编排层)。
 *
 * - Manuscript(稿件)是跨 feature 的统一身份:origin=prism 时 1:1 挂一个写作项目,
 *   origin=upload 时只有审稿轮、没有写作工程(非对称能力)。
 * - ManuscriptVersion(版本快照)是送审的铆点。
 * - ReviewRound(审稿轮)把某个版本与一个 Submission 绑定;轮的 status/decision
 *   不落库,由 mock handler 从绑定的 Submission 实时推导,天然不会失同步。
 */
export interface MockManuscriptCollection {
  id: string;
  name: string;
  description?: string;
  kind: "writing" | "review" | "custom";
  isDefault?: boolean;
  createdAt: string;
}

export interface MockManuscript {
  id: number;
  collectionId: string;
  title: string;
  origin: "prism" | "upload";
  /** origin=prism 时 1:1 指向写作项目 */
  prismProjectId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MockManuscriptVersion {
  id: number;
  manuscriptId: number;
  versionNo: number;
  source: "prism-snapshot" | "upload";
  label: string;
  summary?: string;
  createdAt: string;
}

export interface MockReviewRound {
  id: number;
  manuscriptId: number;
  roundNo: number;
  versionNo: number;
  submissionId: number;
  createdAt: string;
}

export interface MockAgentSession {
  id: string;
  sessionId: string;
  title: string;
  feature: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  messages: Array<Record<string, unknown>>;
}

export interface MockDatabase {
  version: 1;
  folders: UserLibraryFolderItem[];
  libraryPapers: UserLibraryPaper[];
  stagingAreas: RemoteStagingArea[];
  submissions: MockSubmission[];
  prismProjects: MockPrismProject[];
  manuscriptCollections: MockManuscriptCollection[];
  manuscripts: MockManuscript[];
  manuscriptVersions: MockManuscriptVersion[];
  reviewRounds: MockReviewRound[];
  agentSessions: MockAgentSession[];
  readMessageIds: number[];
}

const now = "2026-07-28T08:00:00.000Z";

function createSeed(): MockDatabase {
  return {
    version: 1,
    folders: structuredClone(mockFolders),
    libraryPapers: structuredClone(mockLibraryPapers),
    stagingAreas: structuredClone(mockStagingAreas),
    submissions: [
      {
        id: 301,
        mode: "journal",
        title: "Human–AI Collaboration in Scientific Discovery",
        abstract:
          "We present a systematic review of interaction patterns, evaluation methods, and governance challenges in AI-assisted scientific discovery.",
        status: "completed",
        step: 4,
        computeState: "idle",
        compute_state: "idle",
        journalTarget: {
          name: "Nature Machine Intelligence",
          publisher: "Springer Nature",
          impactFactor: 23.8,
          quartile: "Q1",
        },
        letterBody:
          "Dear Editors,\\n\\nWe submit our systematic review on human–AI collaboration in scientific discovery for your consideration.",
        extraMeta: {
          keywords: [
            "human–AI collaboration",
            "scientific discovery",
            "systematic review",
          ],
          subjects: ["Artificial Intelligence", "Human-Computer Interaction"],
          manuscriptType: "review",
        },
        createdAt: "2026-07-18T04:20:00.000Z",
        updatedAt: now,
        created_at: "2026-07-18T04:20:00.000Z",
        updated_at: now,
      },
      {
        id: 302,
        mode: "thesis",
        title: "面向可信科研工作流的智能体交互设计研究",
        abstract:
          "研究科研智能体在多阶段知识工作中的可解释交互、错误恢复与协作边界。",
        status: "draft",
        step: 2,
        computeState: "idle",
        compute_state: "idle",
        schoolTarget: {
          school: "示例大学",
          degree: "博士",
          department: "计算机学院",
        },
        extraMeta: {
          keywords: ["科研智能体", "可信交互", "人机协作"],
          subjects: ["人机交互"],
          manuscriptType: "research",
        },
        createdAt: "2026-07-27T03:40:00.000Z",
        updatedAt: now,
        created_at: "2026-07-27T03:40:00.000Z",
        updated_at: now,
      },
    ],
    prismProjects: [
      {
        id: 201,
        name: "可信科研智能体论文",
        title: "可信科研智能体论文",
        status: "ready",
        mainFileId: 2001,
        main_file_id: 2001,
        template: "academic-paper",
        createdAt: "2026-07-12T08:00:00.000Z",
        updatedAt: now,
        created_at: "2026-07-12T08:00:00.000Z",
        updated_at: now,
        files: [
          {
            id: 2001,
            projectId: 201,
            name: "main.tex",
            path: "main.tex",
            isMain: true,
            updatedAt: now,
            content: String.raw`\documentclass{article}
\usepackage{booktabs}
\title{Designing Trustworthy Research Agents}
\author{Yu Lin}
\begin{document}
\maketitle
\begin{abstract}
We study interaction patterns that make research agents transparent, recoverable, and accountable.
\end{abstract}
\section{Introduction}
Research agents increasingly participate in literature review, analysis, and scientific writing.
\section{Design Principles}
We propose provenance, reversible action, and calibrated uncertainty as core principles.
\end{document}`,
          },
          {
            id: 2002,
            projectId: 201,
            name: "references.bib",
            path: "references.bib",
            isMain: false,
            updatedAt: now,
            content:
              "@article{bommasani2022foundation,\\n  title={On the Opportunities and Risks of Foundation Models},\\n  year={2022}\\n}",
          },
        ],
      },
      {
        id: 202,
        name: "NSFC 面上申请书",
        title: "NSFC 面上申请书",
        status: "draft",
        mainFileId: 2003,
        main_file_id: 2003,
        template: "nsfc-proposal",
        createdAt: "2026-07-22T09:00:00.000Z",
        updatedAt: now,
        created_at: "2026-07-22T09:00:00.000Z",
        updated_at: now,
        files: [
          {
            id: 2003,
            projectId: 202,
            name: "proposal.tex",
            path: "proposal.tex",
            isMain: true,
            updatedAt: now,
            content: String.raw`\documentclass{article}
\title{面向可信科研智能体的可检验交互机制}
\author{林屿}
\begin{document}
\maketitle
\begin{abstract}
本项目研究科研智能体在文献综合、实验记录与文稿修订中的可追溯、可回退与不确定度标定问题,拟形成可复用的交互原则与评估协议。
\end{abstract}
\section{立项依据}
现有科研助手多以对话补全为主,过程不可检查,出错后难以定位责任边界。
\section{研究内容}
围绕来源标注、可逆操作与不确定度提示三条原则,设计并评估一套写作—审稿闭环交互。
\section{研究方案}
采用混合方法:先做研究者工作流访谈,再在受控任务上对比三种界面变体。
\end{document}`,
          },
        ],
      },
    ],
    manuscriptCollections: [
      {
        id: "m-writing",
        name: "写作中",
        description: "站内智能写作产生的稿件",
        kind: "writing",
        isDefault: true,
        createdAt: "2026-07-12T08:00:00.000Z",
      },
      {
        id: "m-review",
        name: "审稿上传",
        description: "上传参与智能审稿的稿件",
        kind: "review",
        createdAt: "2026-07-12T08:00:00.000Z",
      },
    ],
    // 稿件 401 ↔ Prism 项目 201:两个版本,第 1 轮送审 = 已完成的 Submission 301。
    // 稿件 402 ↔ Prism 项目 202:纯写作中,还没送审。
    // 稿件 403 = 审稿页直接上传的稿(Submission 302),只有审的路。
    manuscripts: [
      {
        id: 401,
        collectionId: "m-writing",
        title: "可信科研智能体论文",
        origin: "prism",
        prismProjectId: 201,
        createdAt: "2026-07-12T08:00:00.000Z",
        updatedAt: now,
      },
      {
        id: 402,
        collectionId: "m-writing",
        title: "NSFC 面上申请书",
        origin: "prism",
        prismProjectId: 202,
        createdAt: "2026-07-22T09:00:00.000Z",
        updatedAt: now,
      },
      {
        id: 403,
        collectionId: "m-review",
        title: "面向可信科研工作流的智能体交互设计研究",
        origin: "upload",
        createdAt: "2026-07-27T03:40:00.000Z",
        updatedAt: now,
      },
    ],
    manuscriptVersions: [
      {
        id: 501,
        manuscriptId: 401,
        versionNo: 1,
        source: "prism-snapshot",
        label: "初稿快照 v1",
        summary: "完成引言与设计原则两章的初稿",
        createdAt: "2026-07-15T10:00:00.000Z",
      },
      {
        id: 502,
        manuscriptId: 401,
        versionNo: 2,
        source: "prism-snapshot",
        label: "送审 v2",
        summary: "补充混合方法研究与设计框架后送审",
        createdAt: "2026-07-18T04:20:00.000Z",
      },
      {
        id: 503,
        manuscriptId: 403,
        versionNo: 1,
        source: "upload",
        label: "上传原稿 v1",
        createdAt: "2026-07-27T03:42:00.000Z",
      },
    ],
    reviewRounds: [
      {
        id: 601,
        manuscriptId: 401,
        roundNo: 1,
        versionNo: 2,
        submissionId: 301,
        createdAt: "2026-07-18T04:20:00.000Z",
      },
      {
        id: 602,
        manuscriptId: 403,
        roundNo: 1,
        versionNo: 1,
        submissionId: 302,
        createdAt: "2026-07-27T03:42:00.000Z",
      },
    ],
    agentSessions: [
      ...(["smart-search", "claw", "boltslides", "sci-draw"] as const).map(
        (feature, index) => ({
          id: `${feature}-session-1`,
          sessionId: `${feature}-session-1`,
          title:
            feature === "smart-search"
              ? "可信 AI 研究脉络"
              : feature === "claw"
                ? "论文综述与研究计划"
                : feature === "boltslides"
                  ? "组会汇报演示稿"
                  : "Transformer 结构图",
          feature,
          active: true,
          createdAt: "2026-07-26T06:00:00.000Z",
          updatedAt: new Date(Date.parse(now) - index * 3_600_000).toISOString(),
          messages: [],
        }),
      ),
      {
        id: "claw-session-2",
        sessionId: "claw-session-2",
        title: "开题报告提纲",
        feature: "claw",
        active: false,
        createdAt: "2026-07-24T09:00:00.000Z",
        updatedAt: new Date(Date.parse(now) - 5 * 3_600_000).toISOString(),
        messages: [],
      },
      {
        id: "smart-search-session-2",
        sessionId: "smart-search-session-2",
        title: "对比实验设计",
        feature: "smart-search",
        active: false,
        createdAt: "2026-07-23T11:00:00.000Z",
        updatedAt: new Date(Date.parse(now) - 8 * 3_600_000).toISOString(),
        messages: [],
      },
    ],
    readMessageIds: [],
  };
}

let cache: MockDatabase | null = null;

function isMockDatabase(value: unknown): value is MockDatabase {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    (value as { version?: unknown }).version === 1
  );
}

function ensureSeedExtras(database: MockDatabase): boolean {
  const seed = createSeed();
  let changed = false;
  const appendMissing = <T, K extends keyof T>(
    current: T[],
    extras: T[],
    key: K,
  ) => {
    for (const item of extras) {
      if (!current.some((row) => row[key] === item[key])) {
        current.push(structuredClone(item));
        changed = true;
      }
    }
  };
  // 旧版本 localStorage 里的库没有稿件四表 —— 先补空数组再补种子行。
  database.manuscriptCollections ??= [];
  database.manuscripts ??= [];
  database.manuscriptVersions ??= [];
  database.reviewRounds ??= [];
  appendMissing(database.prismProjects, seed.prismProjects, "id");
  appendMissing(database.submissions, seed.submissions, "id");
  appendMissing(
    database.manuscriptCollections,
    seed.manuscriptCollections,
    "id",
  );
  appendMissing(database.manuscripts, seed.manuscripts, "id");
  appendMissing(database.manuscriptVersions, seed.manuscriptVersions, "id");
  appendMissing(database.reviewRounds, seed.reviewRounds, "id");
  appendMissing(database.folders, seed.folders, "id");
  appendMissing(database.stagingAreas, seed.stagingAreas, "id");
  appendMissing(database.agentSessions, seed.agentSessions, "sessionId");
  return changed;
}

export function getMockDatabase(): MockDatabase {
  if (cache) return cache;
  try {
    const saved = localStorage.getItem(MOCK_STORAGE.database);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isMockDatabase(parsed)) {
        cache = parsed;
        if (ensureSeedExtras(cache)) persistMockDatabase();
        return cache;
      }
    }
  } catch {
    // 解析失败时回落到确定性 seed。
  }
  cache = createSeed();
  persistMockDatabase();
  return cache;
}

export function persistMockDatabase(): void {
  if (!cache) return;
  try {
    localStorage.setItem(MOCK_STORAGE.database, JSON.stringify(cache));
  } catch {
    // storage 不可用时继续使用内存状态。
  }
}

export function updateMockDatabase(
  mutator: (database: MockDatabase) => void,
): MockDatabase {
  const database = getMockDatabase();
  mutator(database);
  persistMockDatabase();
  return database;
}

export function resetMockDatabase(): MockDatabase {
  cache = createSeed();
  persistMockDatabase();
  return cache;
}

export function nextMockId(records: Array<{ id: number }>): number {
  return Math.max(0, ...records.map((record) => record.id)) + 1;
}
