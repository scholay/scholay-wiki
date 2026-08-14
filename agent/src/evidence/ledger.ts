// 证据账本(2026-08 证据账本 P0 / 终稿 §一根因 · §五 P0-b)。
//
// ── 为什么存在 ────────────────────────────────────────────────────────────────
// 根因一句话:**证据的生命周期比对话短**。检索到的题录唯一活在 `meta.messages`(全栈最易失的
// 介质),会话闲置 30 分钟或容器重启即重灌,而 shadowTurn.ts:50 的
// `blocks.filter(b => b.type === "text")` 把 100% 的 tool_use/tool_result 丢弃且零标记 ——
// 证据没了,但模型宣称这些证据存在的那段散文被完整保留,然后要求它继续写。
// 生产判别力全部集中在这一个维度:本纪元内有工具调用 → DOI 接地率 98%;失忆纪元 → 43%。
//
// 账本把证据从 30 分钟的内存搬到 30 天的会话 cwd(实测 894 个会话目录存活;某会话 13 个 PDF
// 跨 14 天 / 6 次驱逐完好),并给它一个**模型无法铸造**的短句柄 E<n>。
//
// ── 三条硬约束(违反即回到病灶)────────────────────────────────────────────────
// 1. 追加式,永不重写 ledger.jsonl / queries.jsonl。审计不变量;也让并发追加天然安全。
// 2. `E<n>.md` **只对被引用过的记录懒物化**。workspace.ts 的 assertSessionQuota 每次写入跑
//    dirUsage **全目录递归**,且 EXECUTOR_SESSION_FILE_MAX_COUNT=2000 —— 每条题录都落一个文件
//    会同时逼近文件数帽并让每轮写入变贵。未被取用的记录只活在 ledger.jsonl 的**行**里
//    (单文件追加,零文件数增长)。这是实现硬约束,不是可选优化。
// 3. `source` 只落对外品牌名(Graph / Discovery / Medicine),绝不落上游真名
//    ([[data-source-alias-hard-rule]])。账本内容会被模型原样转述给用户。
//
// ── 它**不是**什么 ───────────────────────────────────────────────────────────
// 不是 guard。这里没有任何"事后检查/纠偏注入/内容判断"—— ingest 只把工具真的返回过的东西
// 记下来,resolve/阶段闸属于后续阶段。终稿 §四②:guard 降级为可观测是本方案的前提。

import { mkdir, readFile, writeFile, appendFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { MCP_PREFIX, maskUpstreamBrands } from "../mcp/mcpTools.ts";
import { log } from "../obs/log.ts";
import { EVIDENCE_DIR } from "./paths.ts";
import { appendPassagesUnlocked } from "./passages.ts";
import {
  brandOfSource,
  evidenceKey,
  normalizeDoi,
  normalizePaper,
  parsePapersFromToolResult,
  parsePassagesFromToolResult,
  totalUpstreamOf,
  type ParsedPaper,
} from "./parse.ts";
import { annotateToolResult, renderDigest, renderIndexMd, renderRecordMd } from "./render.ts";

// ── 契约(跨代理固定,签名不得改)──────────────────────────────────────────────

export interface ReadMark {
  turn: number;
  tool: string;
  chars: number;
}

export interface EvidenceRecord {
  /** "E17",会话内单调分配。**模型没有任何工具能铸造它** —— 这是它区别于 DOI 的全部价值。 */
  id: string;
  /** 去重身份键:doi:<doi> > src:<source>:<id> > t:<sha1(norm(title)+year)>。不进模型可见文本。 */
  key: string;
  origin: "retrieval" | "user_upload" | "library_ref" | "user_text";
  first_seen: { turn: number; q?: string; tool: string; ts?: string };
  /** 对外品牌名(Graph/Discovery/Medicine)。**绝不落上游真名**。 */
  source?: string;
  doi?: string;
  title?: string;
  authors?: string[];
  year?: number;
  venue?: string;
  has_fulltext: boolean;
  fulltext_path?: string | null;
  read_marks: ReadMark[];
  // ── 以下为附加可选字段(不改既有签名):EvidenceGet 要能把"完整题录"还回去,
  //    而摘要正文若不在 ingest 时留存,懒物化的 E<n>.md 到取用时已无处可取。
  url?: string;
  upstream_id?: string;
  /** 存档摘要,入账时截到 ABSTRACT_STORE_CAP。 */
  abstract?: string;
  /** 上游摘要原始长度(> abstract.length 即表示被截,渲染层会显式标注)。 */
  abstract_chars?: number;
}

export interface QueryRecord {
  /** 会话内的检索序号 q1/q2/…(first_seen.q 指回它)。 */
  q: string;
  turn: number;
  tool: string;
  args: unknown;
  /** 上游命中总数 —— 覆盖度自检的**分母**(送达 16 ≠ 这个方向只有 16 篇)。 */
  total_upstream?: number;
  delivered: number;
  new_ids: string[];
  dup_ids: string[];
  ts?: string;
}

// ── 存储布局 ─────────────────────────────────────────────────────────────────

// 目录名从 evidence/paths.ts 取,**不在这里另写一份字面量**:sandbox/confine.ts 的保留区拒写与
// sandbox/bwrap.ts 的 jail 只读覆盖都按它设闸,两份字面量一旦漂移,闸就守着一个空目录而账本裸奔
// —— 且没有任何红灯(本仓库最典型的失效形态)。
const DIR = EVIDENCE_DIR;
const LEDGER = "ledger.jsonl";
const QUERIES = "queries.jsonl";
const INDEX = "INDEX.md";

/** 摘要存档上限。上游 sanitizeMinicod 已把列表内摘要压到 2000;这里再收一档控 jsonl 行宽。 */
const ABSTRACT_STORE_CAP = Number(process.env.EVIDENCE_ABSTRACT_STORE_CAP || 1200);
/** 单次 ingest 最多入账多少条(防病态大结果把账本撑爆)。 */
const INGEST_MAX_PAPERS = Number(process.env.EVIDENCE_INGEST_MAX_PAPERS || 200);
/** 作者名存档上限。 */
const AUTHORS_STORE_MAX = 12;
/** E<n>.md 懒物化的文件数上限(见文件头硬约束 2)。到帽后 EvidenceGet 仍正常返回内容,只是不落文件。 */
const MATERIALIZE_MAX_FILES = Number(process.env.EVIDENCE_MATERIALIZE_MAX_FILES || 300);

function dirOf(workDir: string): string {
  return join(workDir, DIR);
}

// ── 单会话串行锁 ──────────────────────────────────────────────────────────────
// 🔴 runTools.ts:37 是 `Promise.all` 并行批 —— 同一轮多个检索工具会并发进 ingest。
//    ledger.jsonl 的追加可容忍乱序,但 **id 分配(读 max → +1)与 INDEX.md 覆盖写必须串行**,
//    否则两个并发批会分到同一个 E<n>(账本自我矛盾)或 INDEX 互相覆盖丢行。
//    单进程内存锁足够:一个会话的 workDir 只由这一个执行器进程写。
const locks = new Map<string, Promise<void>>();

function withLock<T>(workDir: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(workDir) ?? Promise.resolve();
  const run = prev.then(fn, fn); // 前一个失败也要放行下一个,否则一次异常永久锁死该会话
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  locks.set(workDir, tail);
  // 链尾还是自己时才删,避免把后来者的链删掉;不删则 Map 随会话数无界增长。
  void tail.then(() => {
    if (locks.get(workDir) === tail) locks.delete(workDir);
  });
  return run;
}

// ── 读 ───────────────────────────────────────────────────────────────────────

async function readLines(path: string): Promise<unknown[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return []; // 不存在 = 空账本(存量会话的正常状态,不是错误)
  }
  const out: unknown[] = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s));
    } catch {
      // 半行(容器被杀在写入中途)只丢这一行,不毁整本账 —— 这正是选 jsonl 的理由。
      log.warn("evidence: skipping malformed ledger line", { path, len: s.length });
    }
  }
  return out;
}

/**
 * 读回全部题录。append-only 文件里有两种行:题录本身 与 `{op:"read_mark"}` 增量,
 * 后者 fold 进对应记录的 read_marks(**永远不回写原行**)。
 */
export async function loadLedger(workDir: string): Promise<EvidenceRecord[]> {
  const rows = await readLines(join(dirOf(workDir), LEDGER));
  const out: EvidenceRecord[] = [];
  const byId = new Map<string, EvidenceRecord>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (r.op === "read_mark") {
      const rec = byId.get(String(r.id ?? ""));
      const mark = r.mark as ReadMark | undefined;
      if (rec && mark && typeof mark.turn === "number") rec.read_marks.push(mark);
      continue;
    }
    // op:"fulltext" —— 本会话**拿到了这条题录的正文**(段落已落 passages.jsonl,或读过全文文件)。
    // 🔴 语义边界:has_fulltext = 「手上**有**正文」,read_marks = 「模型**读过**」。两者刻意分开,
    //    render.ts 的三档(仅题录 / 有全文未读 / 已读全文)才真的有三档 ——
    //    若把 has_fulltext 直接由 read_marks 派生,中间那档永远不可能出现,等于把三档做成两档。
    if (r.op === "fulltext") {
      const rec = byId.get(String(r.id ?? ""));
      if (rec) {
        rec.has_fulltext = true;
        if (typeof r.path === "string" && r.path) rec.fulltext_path = r.path;
      }
      continue;
    }
    if (typeof r.id !== "string" || typeof r.key !== "string") continue;
    const rec = row as unknown as EvidenceRecord;
    if (!Array.isArray(rec.read_marks)) rec.read_marks = [];
    out.push(rec);
    byId.set(rec.id, rec);
  }
  return out;
}

export async function loadQueries(workDir: string): Promise<QueryRecord[]> {
  const rows = await readLines(join(dirOf(workDir), QUERIES));
  return rows.filter((r): r is QueryRecord => !!r && typeof r === "object" && typeof (r as QueryRecord).q === "string");
}

/** id 归一:接受 `E7` / `e7` / `7` / `[[E7]]` / `E7,` —— 模型的形态漂移不该变成"未入账"。 */
export function normalizeId(raw: string): string {
  const m = String(raw).match(/(\d+)/);
  return m ? "E" + m[1] : "";
}

export async function getByIds(workDir: string, ids: string[]): Promise<EvidenceRecord[]> {
  const want = new Set(ids.map(normalizeId).filter(Boolean));
  if (want.size === 0) return [];
  const all = await loadLedger(workDir);
  return all.filter((r) => want.has(r.id));
}

/** 每轮注入用的摘要。空账本 → "" (调用方什么都不注入)。 */
export async function buildDigest(workDir: string): Promise<string> {
  const [records, queries] = await Promise.all([loadLedger(workDir), loadQueries(workDir)]);
  return renderDigest(records, queries);
}

export async function stats(
  workDir: string,
): Promise<{ total: number; byOrigin: Record<string, number>; queries: number }> {
  const [records, queries] = await Promise.all([loadLedger(workDir), loadQueries(workDir)]);
  const byOrigin: Record<string, number> = {};
  for (const r of records) byOrigin[r.origin] = (byOrigin[r.origin] ?? 0) + 1;
  return { total: records.length, byOrigin, queries: queries.length };
}

// ── 写 ───────────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function idNum(id: string): number {
  const n = Number.parseInt(id.replace(/^E/i, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function cap(s: string | undefined, n: number): string | undefined {
  if (!s) return undefined;
  return s.length > n ? s.slice(0, n) : s;
}

/** 题录 → 账本记录。所有模型可见的文本字段都过一次上游真名遮蔽层。 */
function toRecord(
  p: ParsedPaper,
  id: string,
  key: string,
  origin: EvidenceRecord["origin"],
  ctx: { turn: number; tool: string; q?: string },
): EvidenceRecord {
  const abstract = cap(p.abstract, ABSTRACT_STORE_CAP);
  const rec: EvidenceRecord = {
    id,
    key,
    origin,
    first_seen: { turn: ctx.turn, tool: ctx.tool, ts: nowIso(), ...(ctx.q ? { q: ctx.q } : {}) },
    // 品牌遮蔽:源码 → 对外品牌名。命中不到就**不写**这个字段(绝不回落成原码)。
    ...(brandOfSource(p.sourceCode) ? { source: brandOfSource(p.sourceCode) } : {}),
    ...(p.doi ? { doi: normalizeDoi(p.doi) } : {}),
    title: maskUpstreamBrands(cap(p.title, 400) ?? ""),
    ...(p.authors && p.authors.length ? { authors: p.authors.slice(0, AUTHORS_STORE_MAX) } : {}),
    ...(p.year ? { year: p.year } : {}),
    ...(p.venue ? { venue: maskUpstreamBrands(cap(p.venue, 200)!) } : {}),
    // has_fulltext = **会话内是否有可读全文**,不是"上游标了 OA"。检索入账恒 false ——
    // 「检索到」与「读过原文」必须机械分开,这正是 31 条效应量凭空出现的那条缝。
    has_fulltext: false,
    fulltext_path: null,
    read_marks: [],
    ...(p.url ? { url: p.url } : {}),
    ...(p.paperId ? { upstream_id: p.paperId } : {}),
    ...(abstract ? { abstract: maskUpstreamBrands(abstract), abstract_chars: p.abstract?.length } : {}),
  };
  return rec;
}

async function appendJsonl(workDir: string, file: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  await mkdir(dirOf(workDir), { recursive: true });
  await appendFile(join(dirOf(workDir), file), rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

/**
 * 把一批题录入账(幂等,按 key 去重)。调用方必须已持锁(内部不加锁,避免与 ingest 的锁自死)。
 */
async function ingestPapersUnlocked(
  workDir: string,
  papers: ParsedPaper[],
  origin: EvidenceRecord["origin"],
  ctx: { turn: number; tool: string; q?: string },
): Promise<{ newIds: string[]; dupIds: string[]; ledgerTotal: number; keyToId: Map<string, string> }> {
  const existing = await loadLedger(workDir);
  const byKey = new Map<string, string>();
  let maxId = 0;
  for (const r of existing) {
    byKey.set(r.key, r.id);
    maxId = Math.max(maxId, idNum(r.id));
  }
  const newIds: string[] = [];
  const dupIds: string[] = [];
  const fresh: EvidenceRecord[] = [];

  for (const p of papers.slice(0, INGEST_MAX_PAPERS)) {
    const key = evidenceKey(p);
    const hit = byKey.get(key);
    if (hit) {
      if (!dupIds.includes(hit)) dupIds.push(hit);
      continue;
    }
    const id = "E" + ++maxId;
    fresh.push(toRecord(p, id, key, origin, ctx));
    byKey.set(key, id);
    newIds.push(id);
  }

  if (fresh.length > 0) await appendJsonl(workDir, LEDGER, fresh);
  // keyToId 带出去:段落要挂到 E 编号上,而 key→id 的映射只有这里最全(存量 + 本批新增)。
  // 在外面重算一次等于再读一遍全量账本,且可能与本批的分配结果不一致。
  return { newIds, dupIds, ledgerTotal: existing.length + fresh.length, keyToId: byKey };
}

/**
 * 非检索来源的入账口(user_upload / library_ref / user_text)。**唯一写入口**:
 * 谁要往账本里加东西都走这里,绝不要再写第二个 writer(终稿 §六否决项 13:各写各的台账)。
 *
 * `origin` 的产品意义:它直接回答用户高频那句「你引用的是我文献库里的还是你自己检索的」,
 * 并**堵死用户回声洗白** —— 用户把编造的 DOI 粘回对话,入账时 origin="user_text",
 * 可用,但它不算检索接地。今天的 guard 把这两类混为一谈。
 */
export async function ingestPapers(
  workDir: string,
  papers: ParsedPaper[],
  origin: EvidenceRecord["origin"],
  ctx: { turn: number; tool: string; q?: string },
): Promise<{ newIds: string[]; dupIds: string[]; ledgerTotal: number }> {
  if (papers.length === 0) return { newIds: [], dupIds: [], ledgerTotal: 0 };
  return withLock(workDir, async () => {
    const r = await ingestPapersUnlocked(workDir, papers, origin, ctx);
    await writeIndex(workDir);
    return r;
  });
}

/** INDEX.md 覆盖写(单文件,零文件数增长)。失败只 warn —— 它是视图,账本真源已经落盘。 */
async function writeIndex(workDir: string): Promise<void> {
  try {
    const [records, queries] = await Promise.all([loadLedger(workDir), loadQueries(workDir)]);
    if (records.length === 0) return;
    await mkdir(dirOf(workDir), { recursive: true });
    await writeFile(join(dirOf(workDir), INDEX), renderIndexMd(records, queries), "utf8");
  } catch (e) {
    log.warn("evidence: INDEX.md render failed", { err: String((e as Error)?.message ?? e) });
  }
}

// 检索类工具:args 里带查询词的才记一行检索流水(get_paper / get_journal 这类**解引用**不算一次
// "检索",否则「本会话检索 N 次」会被解引用灌水,而那个数字正是要拿去当覆盖度事实用的)。
// 刻意不含 `name`:get_journal({name}) 之类是解引用,不是检索。`title` 保留(match_paper 用它检索)。
const QUERY_ARG_KEYS = ["query", "q", "keywords", "text", "title"];

function hasQueryArg(args: unknown): boolean {
  if (!args || typeof args !== "object") return false;
  const a = args as Record<string, unknown>;
  return QUERY_ARG_KEYS.some((k) => typeof a[k] === "string" && (a[k] as string).trim() !== "");
}

/**
 * 咽喉点入账:从一条 tool_result 抽题录入账(幂等,按 key 去重),返回本次新增/重复。
 *
 * 🔴 调用位置必须在 **capToolResult 之前**(runTools.ts:runOne)。sanitizeMinicod 已把 20 条砍到 16、
 *    cap 还会再砍一刀 —— **账本必须比上下文富,这是它存在的意义**。
 * 🔴 只对检索类 MCP 工具生效:Read/Bash/Write 的结果不是题录,乱抽只会往账本里灌噪声。
 *    非 MCP 工具直接返回空 QueryRecord(零 I/O、零副作用),故本函数在任何调用点都可安全调用。
 */
export async function ingest(
  workDir: string,
  turn: number,
  toolName: string,
  args: unknown,
  result: unknown,
): Promise<QueryRecord> {
  const empty: QueryRecord = { q: "", turn, tool: toolName, args, delivered: 0, new_ids: [], dup_ids: [] };
  if (!toolName.startsWith(MCP_PREFIX)) return empty;

  const papers = parsePapersFromToolResult(result);
  const queryish = hasQueryArg(args);
  if (papers.length === 0 && !queryish) return empty; // 非检索形态且零题录 → 不写任何东西

  return withLock(workDir, async () => {
    const queries = await loadQueries(workDir);
    // turn 单调化:执行器无状态,turn 由 messages 里的 user 条数推出,而 window/compact 会裁历史 →
    // 推出的值可能回退。账本的顺序真源是 id(追加序),turn 只作展示,故这里只保证它不倒退。
    const lastTurn = queries.length > 0 ? (queries[queries.length - 1]!.turn ?? 0) : 0;
    const t = Math.max(turn, lastTurn);
    const q = "q" + (queries.length + 1);
    const shortTool = toolName.slice(MCP_PREFIX.length);

    const { newIds, dupIds, ledgerTotal, keyToId } = await ingestPapersUnlocked(workDir, papers, "retrieval", {
      turn: t,
      tool: toolName,
      q,
    });

    // ── chunk 级接地(Phase 0):把 snippet 正文落进 passages.jsonl ──────────────
    // 这批数据上游本来就在返回、已被 sanitizeMinicod cap 过,此前被我们自己丢掉。
    // 🔴 绑定必须保守:只有 evidenceKey 能对上已入账题录的段落才留,对不上一律丢 ——
    //    给一条论文挂上别人的段落,比没有段落更糟(这条基座正是要消灭这类错误)。
    // 失败不影响入账主路径:段落是增益,不是前置。
    try {
      const parsed = parsePassagesFromToolResult(result);
      const rows = parsed
        .map((p) => {
          const eid = keyToId.get(p.key);
          return eid ? { eid, text: p.text, ...(p.section ? { section: p.section } : {}), turn: t, ts: nowIso() } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      const wrote = await appendPassagesUnlocked(workDir, rows);
      if (wrote > 0) {
        // 极小的 op 行:让 has_fulltext 在 loadLedger 折叠时**零额外 I/O** 地翻真。
        // 不把段落本身写进 ledger.jsonl —— 那会让每次 ingest 的全量读线性变贵(见 passages.ts 文件头)。
        const flipped = [...new Set(rows.map((r) => r.eid))];
        await appendJsonl(workDir, LEDGER, flipped.map((id) => ({ op: "fulltext", id })));
      }
    } catch (e) {
      log.warn("evidence_passages_failed", { session: workDir.split("/").pop() ?? "", err: String((e as Error)?.message ?? e) });
    }

    const row: QueryRecord = {
      q,
      turn: t,
      tool: shortTool,
      args,
      ...(totalUpstreamOf(result) !== undefined ? { total_upstream: totalUpstreamOf(result) } : {}),
      delivered: papers.length,
      new_ids: newIds,
      dup_ids: dupIds,
      ts: nowIso(),
    };
    await appendJsonl(workDir, QUERIES, [row]);
    await writeIndex(workDir);
    log.info("evidence_ingest", {
      session: workDir.split("/").pop() ?? "",
      tool: shortTool,
      turn: t,
      delivered: papers.length,
      new: newIds.length,
      dup: dupIds.length,
      ledger_total: ledgerTotal,
    });
    return row;
  });
}

/**
 * 把刚入账的 evidence_id 回写进这条 tool_result(逐条 `evidence_id` + 根上 `_evidence` 汇总)。
 *
 * 只吃 ingest() 的返回值 + 一次 getByIds 反查 key —— **不留任何模块级便签**:
 * runTools 的 MCP 批是 `Promise.all` 并行,便签会被邻居工具覆盖(这条 race 真实存在,别改回去)。
 * fail-closed:任何异常/零命中一律返回原 content,账本绝不能让检索结果变坏。
 */
export async function annotate(workDir: string, content: unknown, q: QueryRecord): Promise<unknown> {
  try {
    const want = new Set([...q.new_ids, ...q.dup_ids]);
    if (want.size === 0) return content;
    const all = await loadLedger(workDir); // 一次读,同时拿 key→id 与 ledger_total
    const byKey = new Map(all.filter((r) => want.has(r.id)).map((r) => [r.key, r.id]));
    if (byKey.size === 0) return content;
    const total = all.length;
    return annotateToolResult(
      content,
      byKey,
      (raw) => {
        const p = normalizePaper(raw);
        return p ? evidenceKey(p) : null;
      },
      { query_id: q.q, new: q.new_ids.length, dup: q.dup_ids.length, ledger_total: total },
    );
  } catch {
    return content;
  }
}

/**
 * 把一次文件读取反查成 E 编号。**保守到宁可漏,不可错**。
 *
 * 🔴 为什么保守:绑错比不绑更糟 —— 给一条题录挂上**别人的**全文,恰恰制造了这条基座要消灭的
 *    那类错误(模型据此写出的数字看起来有出处,实际张冠李戴,比明显编造更难发现)。
 *    所以只认能唯一确定的形态,认不出就返回 null,**静默跳过**(不报错、不猜)。
 *
 * 今天**只有一条**可靠绑定:懒物化的 `evidence/E<n>.md`(materialize 写的,命名即身份)。
 * 故本函数是纯同步的字符串判定,零 I/O —— Read 是高频且 parallelSafe 的工具,
 * 不该为反查在每次调用上付一次全量账本读。
 *
 * ⚠️ 规格里提到的另一条强绑定 `references/paper-<id>.md` **今天建不起来**,刻意不实现:
 *    那个 id 是 backend 文献集的库内主键,账本不认识它;更根本的是 `ingestPapers`
 *    (非检索来源的唯一入账口)**全仓零调用方** —— `origin="library_ref"` / `"user_upload"`
 *    的证据**从来没进过账本**。在那条链接上之前,任何 basename 猜测都是在制造错绑。
 *    等它接上后,这里加第二条:用 `fulltext_path` **精确相等**匹配(不是 basename 模糊匹配),
 *    且多条命中一律判为有歧义、不绑。
 */
export function resolveEidForPath(workDir: string, absOrRel: string): string | null {
  const root = dirOf(workDir);
  const abs = absOrRel.startsWith("/") ? absOrRel : join(workDir, absOrRel);
  if (!abs.startsWith(root + "/")) return null;
  const m = abs.slice(root.length + 1).match(/^(E\d+)\.md$/);
  return m ? m[1]! : null;
}

/**
 * 追加一条"读过原文"标记(append-only,不改原行)。
 * **唯一写入口** —— 谁要记"读过"都走这里,不许有人去原地改 ledger.jsonl。
 * 调用点:tools/registry.ts 的 Read / ReadDocument 成功之后(经 resolveEidForPath 反查)。
 */
export async function markRead(workDir: string, id: string, mark: ReadMark): Promise<boolean> {
  const norm = normalizeId(id);
  if (!norm) return false;
  return withLock(workDir, async () => {
    const all = await loadLedger(workDir);
    if (!all.some((r) => r.id === norm)) return false;
    await appendJsonl(workDir, LEDGER, [{ op: "read_mark", id: norm, mark }]);
    await writeIndex(workDir);
    return true;
  });
}

/**
 * 懒物化:只对**被取用过**的记录写 `evidence/E<n>.md`(见文件头硬约束 2)。
 * 已存在则跳过;到文件数帽后不再写(内容仍经 EvidenceGet 正常返回,不影响可用性)。
 * 返回本次实际存在的相对路径,供工具告诉模型"它也在文件里,可以再 Read"。
 */
export async function materialize(workDir: string, records: EvidenceRecord[]): Promise<string[]> {
  if (records.length === 0) return [];
  return withLock(workDir, async () => {
    const out: string[] = [];
    let existing: Set<string>;
    try {
      existing = new Set((await readdir(dirOf(workDir))).filter((f) => /^E\d+\.md$/.test(f)));
    } catch {
      existing = new Set();
    }
    for (const r of records) {
      const name = `${r.id}.md`;
      const rel = `${DIR}/${name}`;
      if (existing.has(name)) {
        out.push(rel);
        continue;
      }
      if (existing.size >= MATERIALIZE_MAX_FILES) continue; // 到帽:不落文件,内容仍照常返回
      try {
        await mkdir(dirOf(workDir), { recursive: true });
        await writeFile(join(dirOf(workDir), name), renderRecordMd(r), "utf8");
        existing.add(name);
        out.push(rel);
      } catch (e) {
        log.warn("evidence: materialize failed", { id: r.id, err: String((e as Error)?.message ?? e) });
      }
    }
    return out;
  });
}
