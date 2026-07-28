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
    ],
    agentSessions: ["smart-search", "claw", "boltslides", "sci-draw"].map(
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

export function getMockDatabase(): MockDatabase {
  if (cache) return cache;
  try {
    const saved = localStorage.getItem(MOCK_STORAGE.database);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isMockDatabase(parsed)) {
        cache = parsed;
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
