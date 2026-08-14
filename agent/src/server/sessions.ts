// 极小 per-session meta(详细设计 §2.1 journal/sessionMeta)。无 transcript 真源 —— 那在后端 journal。
// 这里只承载:workDir + 工具策略 + appendSystemPrompt + 会话内 messages[](内存续接,跨重启无状态)。

import { mkdir, rm, writeFile, readFile, cp, symlink, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { safeSessionDir, validSessionId } from "../sandbox/confine.ts";
import { log } from "../obs/log.ts";
import { localISO } from "../tools/clock.ts";

const SESSIONS_ROOT = process.env.SESSIONS_ROOT || "/tmp/executor-sessions";

// 🔴 会话累计 token 的落盘目录(2026-08-02 计费审计 P0-5)。
//
// 为什么必须落盘:cumUsage 此前只活在内存。轮终帧一旦丢失(上游断连 / hub grace 拆连 / backend 重启),
// backend 不入账,唯一的补救是「下一轮 session_total 差额补回」;但 IDLE_TTL(默认 30min)一到
// meta 被淘汰、cumUsage 归零,backend 看到累计回退就把水位 re-base 到 0(bridge.go accrueTurnUsage),
// 那批已经烧掉的 token 从此追不回来。复现方式稳定得可以当操作手册:
// 发一个重任务 → 10 秒后关标签页 → 隔天回来继续,循环即可白嫖。
// 落盘后淘汰再水化能接着原累计走,backend 既有的 "(reconciled)" 差额补记机制自动把缺口补上。
//
// 为什么不放会话 workDir 里:那是模型可读可写的目录。把计费水位放进去 = 模型可以自己把它改小。
// 单独一个根目录,不在任何 addDirs 里,jail 外。
const USAGE_ROOT = process.env.EXECUTOR_USAGE_ROOT || "/tmp/executor-usage";

// envNum:安全解析数值 env —— 非数字(如误配 "30d")回落默认值,绝不让 NaN 溜进比较逻辑
// (审查发现:NaN 会让 GC 的三道保护比较全部恒 false → 首个 tick 删光所有未连接会话目录)。
export function envNum(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

// 用户市场 skill 的一份物化输入(backend 规范化后经 CreateSession/seed_history 内联下发)。
export interface SessionSkillInput {
  name: string; // 命名空间化 guide 名(u<authorId>-<slug>),须匹配 SKILL_NAME_RE
  skillMd: string; // 规范化后的 SKILL.md 正文(不可信用户内容,只走 guides 按需层)
}

// guide 目录名白名单(对齐 registry.ts SKILL_NAME_RE / loader.ts)。防路径穿越 / 撞名 shadow。
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_SESSION_SKILLS = 5; // 护 loader MENU_CAP_CHARS;与 backend MaxEnabledPerSession 对齐
const MAX_SKILL_MD_BYTES = 20_000; // 与 backend 8000 字符上限对齐留余量,防超大注入

// skillsDirFor:会话 skill 物化目录 = <workDir>.skills(cwd 之外的兄弟目录,防模型自改写 / 被成果收割)。
function skillsDirFor(workDir: string): string {
  return workDir + ".skills";
}

// materializeSessionSkills:把 backend 下发的用户 skill 写成 <workDir>.skills/guides/<name>/SKILL.md
// (只读语义:目录在 cwd 外,文件工具的 confine 只服务 cwd,模型碰不到)。返回 skills 目录路径(有内容时)
// 供推进 addDirs;无有效 skill 返回 null。**只走 guides 按需菜单**,绝不写 CLAUDE.md/.claude/skills(常驻注入位)。
export async function materializeSessionSkills(
  workDir: string,
  skills: SessionSkillInput[] | undefined,
): Promise<string | null> {
  const dir = skillsDirFor(workDir);
  const guidesDir = join(dir, "guides");
  // 清后写:每次物化 = 当前启用集的**全量替换**。executor 重启后 backend 用「当前」启用集重 seed,
  // 若只增不清,旧集 / 已 disable / 已 takedown 的 skill 副本会在磁盘 guides/ 累积、仍被 Skill 工具加载
  // (5 份上限名存实亡)。先清空 guides/ 再逐份写,杜绝跨重启残留。SESSIONS_ROOT 无 volume,
  // restart: unless-stopped 会保留可写层,故这一步必须在物化前无条件执行(含 skills 为空时清尽旧集)。
  await rm(guidesDir, { recursive: true, force: true });
  if (!skills || skills.length === 0) return null;
  let written = 0;
  for (const sk of skills) {
    if (written >= MAX_SESSION_SKILLS) break;
    const name = String(sk?.name ?? "").trim();
    if (!SKILL_NAME_RE.test(name)) {
      log.warn("skip session skill: invalid name", { name });
      continue; // 拒非法名(防 ../ 穿越 / 撞一方 skill)
    }
    const body = String(sk?.skillMd ?? "");
    if (!body.trim()) continue;
    const capped = body.length > MAX_SKILL_MD_BYTES ? body.slice(0, MAX_SKILL_MD_BYTES) : body;
    try {
      const guideDir = join(dir, "guides", name);
      await mkdir(guideDir, { recursive: true });
      await writeFile(join(guideDir, "SKILL.md"), capped, "utf8");
      written++;
    } catch (e) {
      log.warn("materialize session skill failed", { name, err: String((e as Error)?.message ?? e) });
    }
  }
  if (written === 0) return null;
  log.info("session skills materialized", { dir, count: written });
  return dir;
}

export interface SessionMeta {
  sessionId: string;
  workDir: string;
  disallowedTools: string[];
  // MCP 正向白名单(去前缀的原始工具名);控制面按 feature 下发,空 = 不限制。见 featurePolicy。
  allowedMcpTools: string[];
  honestyGuard: boolean; // 诚实性核验 guard(per-feature;claw 先开)
  honestyChecks?: { citations?: boolean; delivery?: boolean; fullread?: boolean }; // 按位开关(prism 预备件)
  addDirs: string[];
  appendSystemPrompt?: string;
  title?: string;
  messages: Anthropic.MessageParam[]; // 会话内 history(内存);耐久真源在后端事件溯源 journal
  lastUsage?: { input_tokens: number; output_tokens: number; model: string };
  // 会话累计 token(in-band 计费用):每轮把 message_complete.usage 累加进来,作为 session_total 发给
  // Go 计费链(accrueTurnUsage 用 per-session 水位去重 + 处理重连 reset)。executor 重启即归零 →
  // 后端水位检测到回退会 re-base,不会双计。
  cumUsage: { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; model: string };
  createdAt: string;
  lastActiveAt: number; // 最近活动时刻(ms;建会话/收 user_message/WS 连接时刷新)——内存淘汰用

  // 压缩缓存(P2 memoize):同一被压缩边界不重复摘要 + 不破坏上游前缀缓存。
  compactCache?: import("../turn/compact.ts").CompactCache;
}

export interface CreateOpts {
  sessionId?: string;
  workDir?: string;
  disallowedTools?: string[];
  allowedMcpTools?: string[]; // MCP 正向白名单(去前缀原始名);控制面下发,空 = 不限制
  honestyGuard?: boolean; // 诚实性核验 guard 旗标(2026-07 审计 P0-1/P0-2/P1-6;缺省 false)
  honestyChecks?: { citations?: boolean; delivery?: boolean; fullread?: boolean }; // 核验维度按位开关
  addDirs?: string[];
  appendSystemPrompt?: string;
  // 用户市场 skill(内联内容):executor 物化到 <workDir>.skills/guides/ 并并入 addDirs。
  skills?: SessionSkillInput[];
  // 脚手架预置(目前仅 "bolt-slides":制作PPT feature)。把镜像预装的模板铺进可写 cwd,
  // node_modules 用 symlink 指回只读的 /opt 预装依赖。见 seedTemplate。
  templateKind?: string;
}

// 镜像预装的脚手架根(Dockerfile: COPY bolt-slides-template /opt/bolt-slides + npm ci)。
const BOLT_SLIDES_TEMPLATE_DIR = process.env.BOLT_SLIDES_TEMPLATE_DIR || "/opt/bolt-slides";
// 铺设时跳过的目录/文件(node_modules 走 symlink;构建产物/缓存不铺)。
const TEMPLATE_SKIP = new Set(["node_modules", "dist", "dist-single", ".git", ".bolt", ".vite-cache", ".npm-cache"]);

// seedTemplate:把预装脚手架的**源码**铺进会话可写 cwd,并把 node_modules 软链到镜像里只读的预装依赖。
// 幂等:重建/重连同一 workDir 再次铺设时覆盖源码、symlink 已存在则跳过。
// 只在执行器进程内跑(非 bwrap;可访问 /opt),供 BuildDeck 工具随后 `npm run build:deck`。
async function seedTemplate(workDir: string, kind: string): Promise<void> {
  if (kind !== "bolt-slides") {
    log.warn("seedTemplate: unknown templateKind, skipped", { kind });
    return;
  }
  const root = BOLT_SLIDES_TEMPLATE_DIR;
  const rootReal = root.endsWith("/") ? root.slice(0, -1) : root;
  const src = await stat(rootReal).catch(() => null);
  if (!src || !src.isDirectory()) {
    log.error("seedTemplate: template dir missing", { root: rootReal });
    return; // 缺模板不致命:BuildDeck 会因无 vite.config 明确报错
  }
  // 拷源码(排除 node_modules / 构建产物 / vcs)。cp 递归 + filter:目录被过滤则整棵跳过。
  await cp(rootReal, workDir, {
    recursive: true,
    filter: (s) => {
      const rel = s === rootReal ? "" : s.slice(rootReal.length + 1);
      if (!rel) return true;
      const top = rel.split("/")[0];
      return !TEMPLATE_SKIP.has(top);
    },
  });
  // node_modules → 只读预装依赖(省 inode;vite 构建只读它,缓存另落 .vite-cache 见 singlefile config)。
  const nm = join(workDir, "node_modules");
  const nmExists = await stat(nm).catch(() => null);
  if (!nmExists) {
    try {
      await symlink(join(rootReal, "node_modules"), nm, "dir");
    } catch (e) {
      log.warn("seedTemplate: node_modules symlink failed", { err: String((e as Error)?.message ?? e) });
    }
  }
  // 持久化模板种类到侧车标记(GC 保留),供 BuildDeck 在 workdir 被回收后自愈重铺。
  await writeFile(templateMarkerPath(workDir), kind, "utf8").catch(() => {});
  log.info("template seeded", { workDir, kind });
}

const sessions = new Map<string, SessionMeta>();

// templateMarkerPath:会话模板种类的持久侧车(<workDir>.template,内容 = templateKind)。
// 磁盘 GC 会删 workdir 但**保留**该标记 —— 它是「此会话是 PPT 工作区」的唯一跨重建信号,
// 供 BuildDeck 自愈重铺;显式删会话时才随之删除。
function templateMarkerPath(workDir: string): string {
  return workDir + ".template";
}

// ensureBoltSlidesScaffold:BuildDeck 的脚手架自愈入口(审查发现):templateKind 只在
// CreateSession 时铺设一次,workdir 被磁盘 GC 回收 / dev 容器重建后,重连会话经
// getOrCreateEphemeral 重建的是**空目录**,BuildDeck 因缺 vite.config 永久失效且模型无法
// 自救(boltslides 无 Bash、文件工具够不到 /opt)。BuildDeck 发现脚手架缺失时调这里:
// 仅当侧车标记确认该会话曾是 bolt-slides 工作区才重铺(幂等),避免其它 feature 会话被误种。
export async function ensureBoltSlidesScaffold(workDir: string): Promise<boolean> {
  const kind = await readFile(templateMarkerPath(workDir), "utf8").then((s) => s.trim()).catch(() => "");
  if (kind !== "bolt-slides") return false;
  await seedTemplate(workDir, "bolt-slides");
  return true;
}

// allowBash 由 denylist 推导:Bash 不在 denylist 即允许(claw 画像)。
export function allowBashFor(meta: SessionMeta): boolean {
  return !meta.disallowedTools.includes("Bash");
}

export async function createSession(opts: CreateOpts): Promise<SessionMeta> {
  const sid = opts.sessionId || crypto.randomUUID();
  if (!validSessionId(sid)) throw new Error("invalid sessionId"); // H4:挡 ../ 等穿越
  // H4:默认 workDir 经 safeSessionDir 断言为 SESSIONS_ROOT 子目录(opts.workDir 来自 Go 控制面,可信)。
  const workDir = opts.workDir || safeSessionDir(SESSIONS_ROOT, sid);
  await mkdir(workDir, { recursive: true });
  // 脚手架预置(制作PPT):把镜像预装模板铺进可写 cwd,供 BuildDeck 构建单文件演示稿。
  if (opts.templateKind) {
    try {
      await seedTemplate(workDir, opts.templateKind);
    } catch (e) {
      log.error("seedTemplate failed", { kind: opts.templateKind, err: String((e as Error)?.message ?? e) });
    }
  }
  const addDirs = [...(opts.addDirs || [])];
  // 用户市场 skill:物化到 <workDir>.skills/guides/ 并并入 addDirs(guides 按需层)。
  const skillsDir = await materializeSessionSkills(workDir, opts.skills);
  if (skillsDir && !addDirs.includes(skillsDir)) addDirs.push(skillsDir);
  const meta: SessionMeta = {
    sessionId: sid,
    workDir,
    disallowedTools: opts.disallowedTools || [],
    allowedMcpTools: opts.allowedMcpTools || [],
    honestyGuard: opts.honestyGuard === true,
    honestyChecks: opts.honestyChecks,
    addDirs,
    appendSystemPrompt: opts.appendSystemPrompt,
    messages: [],
    // 水化上次落盘的累计(审计 P0-5):内存淘汰后重连时接着原累计走,backend 的水位不会 re-base 到 0,
    // 那些丢了终帧的轮由既有的 "(reconciled)" 差额补记机制补上。全新会话读不到文件 → 全 0,行为不变。
    cumUsage: (await loadCumUsage(sid)) ?? {
      input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, model: "",
    },
    createdAt: localISO(),
    lastActiveAt: Date.now(),
  };
  sessions.set(sid, meta);
  touchWorkdirMarker(sid); // 建会话即落活跃标记,防新建即被 GC 误判(目录 mtime 兜底之外的显式信号)
  return meta;
}

export function getSession(sid: string): SessionMeta | null {
  return sessions.get(sid) ?? null;
}

// ─── 会话累计 token 的落盘 / 水化(审计 P0-5)────────────────────────────────
//
// 只落 cumUsage 这一个字段:它是 backend 计费水位的唯一锚点,丢了就永久漏记;
// messages 等其它字段的耐久真源在 backend 的事件溯源 journal,不归这里管。

type CumUsage = SessionMeta["cumUsage"];

function usagePathFor(sid: string): string {
  return join(USAGE_ROOT, `${sid}.json`);
}

/** persistCumUsage 每轮终帧后落盘(fire-and-forget)。失败只留痕 —— 落盘失败最坏退回旧行为。 */
export function persistCumUsage(sid: string, cum: CumUsage): void {
  if (!validSessionId(sid)) return;
  void (async () => {
    try {
      await mkdir(USAGE_ROOT, { recursive: true });
      await writeFile(usagePathFor(sid), JSON.stringify(cum), "utf8");
    } catch (e) {
      log.warn("persist cumUsage failed (billing watermark may re-base on eviction)", {
        session_id: sid, err: String((e as Error)?.message ?? e),
      });
    }
  })();
}

/** loadCumUsage 建 meta 时水化。文件不存在 / 坏了 → 返回 null,按全 0 起算(即旧行为)。 */
async function loadCumUsage(sid: string): Promise<CumUsage | null> {
  try {
    const raw = await readFile(usagePathFor(sid), "utf8");
    const v = JSON.parse(raw) as Partial<CumUsage>;
    const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
    return {
      input_tokens: n(v.input_tokens),
      output_tokens: n(v.output_tokens),
      cache_read_tokens: n(v.cache_read_tokens),
      cache_creation_tokens: n(v.cache_creation_tokens),
      model: typeof v.model === "string" ? v.model : "",
    };
  } catch {
    return null;
  }
}

function dropCumUsage(sid: string): void {
  if (!validSessionId(sid)) return;
  void rm(usagePathFor(sid), { force: true }).catch(() => {});
}

// 建 meta 的在途单飞表(sid → 正在建的 Promise)。见 getOrCreateEphemeral 注释。
const creatingEphemeral = new Map<string, Promise<SessionMeta>>();

// getOrCreateEphemeral:WS 连到未经 CreateSession 的 session(直连/迁移期/内存淘汰后重连)→ 建保守默认 meta。
// **单飞**(2026-07 线上审计 §2.3「重连上下文竞态」):本函数第一步 `sessions.get` 到 createSession 里
// `sessions.set` 之间隔着 await(mkdir / 物化 skills),同一 sid 的并发调用(seed_history 与 user_message
// 两帧背靠背到达,或再叠加 HTTP workspace op)会各自 miss、各建一份 meta —— 后写入 Map 的覆盖前者,
// 于是 seed 把历史灌进 A、本轮却跑在空的 B 上,模型明面失忆。用在途 Promise 表让并发调用共享同一份。
export async function getOrCreateEphemeral(sid: string): Promise<SessionMeta> {
  const existing = sessions.get(sid);
  if (existing) return existing;
  const inflight = creatingEphemeral.get(sid);
  if (inflight) return inflight;
  const p = createSession({ sessionId: sid }).finally(() => {
    if (creatingEphemeral.get(sid) === p) creatingEphemeral.delete(sid);
  });
  creatingEphemeral.set(sid, p);
  return p;
}

// ── 上下文水合(resume)门 ─────────────────────────────────────────────────────
// 2026-07 线上审计 §2.3「重连上下文竞态」(线上确证 1 例)。机制:ws 断开 → 5min idle sweep 淘汰
// 内存 meta → 前端重连并**立刻补发**那条未 ack 的消息 → backend 建新 hub 时先写 seed_history
// (journal 折叠的 87 条历史),user_message 紧随其后。两帧在 executor 侧都进 async 的 onMessage:
// Bun 按到达序**派发**、却不串行**等待**,于是 seed_history 的处理链(建 meta / 物化 skills 全要 await)
// 还没把历史写回 meta.messages,user_message 的链已经跑到 `meta.messages.push(...)`:
//   ① seed 的「meta.messages.length === 0 才灌」守卫随即失效 → 87 条历史被整段丢弃;
//   ② 两条链还可能各建一份 meta(见上面的单飞修复)。
// 后果就是线上那句「不过目前我这边没有看到之前的对话上下文」,模型还试图用 Glob/Bash 自己去磁盘
// 找上下文被 guard 拒。修法是结构性的、不加兜底:seed_history 帧一到达就**同步**登记「水合在途」,
// user_message 必须等它落地才进轮。等待有明确超时与失败语义(超时 = 拒绝该轮并告诉用户,
// 绝不带空上下文硬答)。没有 seed_history 的连接(peerreview server-side 从不 seed)零登记 →
// 立即放行,行为与今天完全一致。
const hydrating = new Map<string, { pending: number; promise: Promise<void>; resolve: () => void }>();

/** beginHydration:seed_history 帧到达时**同步**登记(必须在该帧处理的任何 await 之前调)。 */
export function beginHydration(sid: string): void {
  const cur = hydrating.get(sid);
  if (cur) {
    cur.pending++; // hub 重 seed(seed fail-closed 重试)可能连发两帧,计数到零才放行
    return;
  }
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  hydrating.set(sid, { pending: 1, promise, resolve });
}

/** endHydration:seed_history 处理结束时调(成功/抛错都要调),放行等待中的 user_message。 */
export function endHydration(sid: string): void {
  const cur = hydrating.get(sid);
  if (!cur) return;
  cur.pending--;
  if (cur.pending > 0) return;
  hydrating.delete(sid);
  cur.resolve();
}

/**
 * awaitHydration:该会话有在途 seed_history 时等它落地。
 * 返回 true = 可以进轮;false = 超时,调用方**必须**拒绝本轮(不允许带空上下文继续答)。
 */
export async function awaitHydration(sid: string, timeoutMs: number): Promise<boolean> {
  const cur = hydrating.get(sid);
  if (!cur) return true; // 无在途 seed(绝大多数轮 / peerreview server-side)→ 零等待
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ok = await Promise.race([
    cur.promise.then(() => true),
    new Promise<boolean>((r) => {
      timer = setTimeout(() => r(false), Math.max(1000, timeoutMs));
    }),
  ]);
  if (timer) clearTimeout(timer);
  if (!ok) {
    log.error("session resume (seed_history) timed out; refusing turn instead of answering with empty context", {
      session_id: sid,
      timeout_ms: timeoutMs,
    });
  }
  return ok;
}

export async function deleteSession(sid: string): Promise<boolean> {
  if (!validSessionId(sid)) return false; // H4:挡 ../ 等穿越(下面按约定路径删磁盘目录)
  const m = sessions.get(sid);
  if (m) sessions.delete(sid);
  // 兜底(评审 2026-07 性能审计 P0):executor 重启后内存 Map 清空,但 workspace 目录仍在宿主 bind-mount 上。
  // 旧逻辑 Map miss 直接 return false → backend 收 404 后照删 DB 行 → workspace 成永久孤儿(且卡死 backend GC)。
  // 改为 Map miss 时回退按约定路径 safeSessionDir(SESSIONS_ROOT, sid) 删目录,让删除对重启幂等。
  const workDir = m?.workDir || safeSessionDir(SESSIONS_ROOT, sid);
  lastMarkerTouch.delete(sid);
  dropCumUsage(sid); // 会话真的删了才清计费水位文件(内存淘汰不清 —— 那正是它存在的理由)
  try {
    await rm(workDir, { recursive: true, force: true });
    // 一并清理 per-session skill 物化目录(<workDir>.skills)、GC 活跃标记(.active)与模板标记(.template)。
    await rm(skillsDirFor(workDir), { recursive: true, force: true });
    await rm(workDir + ".active", { force: true });
    await rm(templateMarkerPath(workDir), { force: true });
  } catch {
    /* best-effort */
  }
  return true;
}

export function listSessions(ids?: string[]): SessionMeta[] {
  const all = [...sessions.values()];
  if (ids && ids.length) return all.filter((s) => ids.includes(s.sessionId));
  return all;
}

// ── 会话内存生命周期(性能审计 P0)────────────────────────────────────────────────
// 问题:sessions Map 只增不减 —— 每个连过的会话连同完整内存 history(含 base64 图)常驻,进程内存只涨不跌。
// 淘汰策略(纯内存,不碰磁盘):
//   ① 空闲 TTL:lastActiveAt 超过 IDLE_TTL 且【无活跃 WS 订阅者】的会话 → 驱逐内存 meta。
//   ② MAX_SESSIONS 硬帽:超帽按 lastActiveAt 升序 LRU 挤出最久未用(同样要求无活跃 WS)。
// 安全性:耐久真源在 backend journal;被驱逐会话重连时,backend 在首条 user_message 前经 seed_history
// 把 journal 折叠的 history 回灌到(重新创建的空)meta(见 ws.ts seed_history + hub.go seedHistoryFromJournal),
// 故驱逐纯内存无损。驱逐【绝不删 workDir】—— 磁盘回收归 backend 侧 GC。

const IDLE_TTL_MS = Math.max(60_000, Number(process.env.EXECUTOR_SESSION_IDLE_TTL_MS || 30 * 60_000));
const MAX_SESSIONS = Math.max(16, Number(process.env.EXECUTOR_MAX_SESSIONS || 200));
const SWEEP_EVERY_MS = 5 * 60_000;

const activeWs = new Map<string, number>(); // sid → 活跃 WS 订阅者数(>0 = 有连接在用,不淘汰)

/** WS 连接打开:活跃计数 +1 并刷新活动时刻。 */
export function sessionWsOpened(sid: string): void {
  activeWs.set(sid, (activeWs.get(sid) ?? 0) + 1);
  markSessionActive(sid);
}

/** WS 连接关闭:活跃计数 -1(归零即删)。 */
export function sessionWsClosed(sid: string): void {
  const n = (activeWs.get(sid) ?? 0) - 1;
  if (n > 0) activeWs.set(sid, n);
  else activeWs.delete(sid);
}

function hasActiveWs(sid: string): boolean {
  return (activeWs.get(sid) ?? 0) > 0;
}

/** 刷新会话最近活动时刻(收到 user_message / WS 连接时调)。 */
export function markSessionActive(sid: string): void {
  const m = sessions.get(sid);
  if (m) {
    m.lastActiveAt = Date.now();
    touchWorkdirMarker(sid);
  }
}

// ── 会话 workdir 磁盘 GC(2026-07 文件上传调研落地)────────────────────────────
// 上面的内存淘汰「绝不删 workDir」,而 backend 侧也从来没有周期性磁盘 GC —— prod 把
// sessions 根 bind-mount 到宿主后,上传/引用文献/产物跨请求无界累积(性能审计 P0)。
// 这里补上唯一的磁盘回收:超过 TTL(默认 30 天,业界区间 7-30d,Anthropic code-execution
// 容器为 30 天硬过期)不活跃的会话目录整体删除(含 .skills 兄弟目录)。
// 安全性:对话耐久真源在 backend journal(agent_turns/turn_events),删目录不丢聊天记录;
// 丢的是旧会话的上传文件 / 产物文件(与 dev 环境容器重建后的现状一致,前端对缺文件已有
// 404 兜底)。活跃信号 = <workDir>.active 侧车文件 mtime(user_message/WS 活动时 touch,
// 1h 节流)∨ 目录自身 mtime,取较新者。EXECUTOR_WORKDIR_TTL_DAYS=0 关闭。
const WORKDIR_TTL_MS = Math.max(0, envNum("EXECUTOR_WORKDIR_TTL_DAYS", 30)) * 24 * 3600_000;
const WORKDIR_GC_EVERY_MS = 6 * 3600_000; // GC 全盘扫描的最小间隔(挂在 5min sweeper 上节流)
let lastWorkdirGcAt = 0;

// 活跃标记放 cwd **外**的兄弟文件(与 .skills 同策略):不污染 workspace 树 / 不被成果收割 /
// 不计入会话磁盘配额。
function activityMarkerPath(workDir: string): string {
  return workDir + ".active";
}

const lastMarkerTouch = new Map<string, number>();
function touchWorkdirMarker(sid: string): void {
  const m = sessions.get(sid);
  if (!m) return;
  const now = Date.now();
  if (now - (lastMarkerTouch.get(sid) ?? 0) < 3600_000) return; // 1h 节流,防高频 IO
  lastMarkerTouch.set(sid, now);
  void writeFile(activityMarkerPath(m.workDir), "").catch(() => {});
}

// export 仅为单测直调(生产入口是 startSessionSweeper 的周期回调)。
export async function sweepStaleWorkdirs(): Promise<void> {
  if (WORKDIR_TTL_MS <= 0) return;
  const now = Date.now();
  if (now - lastWorkdirGcAt < WORKDIR_GC_EVERY_MS) return;
  lastWorkdirGcAt = now;
  let entries;
  try {
    entries = await readdir(SESSIONS_ROOT, { withFileTypes: true });
  } catch {
    return;
  }
  let removed = 0;
  for (const e of entries) {
    if (!e.isDirectory()) {
      // 孤儿 .active 标记(主目录已被显式删除/历史版本遗留)→ 直接清
      if (e.name.endsWith(".active")) {
        const dirName = e.name.slice(0, -".active".length);
        if (!entries.some((x) => x.isDirectory() && x.name === dirName)) {
          void rm(join(SESSIONS_ROOT, e.name), { force: true }).catch(() => {});
        }
      }
      continue;
    }
    const name = e.name;
    if (name.endsWith(".skills")) continue; // 随主目录一起删,不单独判
    if (!validSessionId(name)) continue; // 非会话命名的目录(运维/挂载杂物)绝不动
    if (hasActiveWs(name)) continue; // 有活跃 WS 连接的会话绝不动
    const mem = sessions.get(name);
    if (mem && now - mem.lastActiveAt <= WORKDIR_TTL_MS) continue;
    const dir = join(SESSIONS_ROOT, name);
    let activity = 0;
    try {
      activity = (await stat(activityMarkerPath(dir))).mtimeMs;
    } catch {
      /* 无标记(老目录)→ 退回目录 mtime */
    }
    try {
      const s = await stat(dir);
      activity = Math.max(activity, s.mtimeMs);
    } catch {
      continue; // racing delete
    }
    if (now - activity <= WORKDIR_TTL_MS) continue;
    // rm 前复查(TOCTOU 收窄):stat 与 rm 之间该会话可能恰好重连/重建。
    if (hasActiveWs(name)) continue;
    const memNow = sessions.get(name);
    if (memNow && Date.now() - memNow.lastActiveAt <= WORKDIR_TTL_MS) continue;
    try {
      await rm(dir, { recursive: true, force: true });
      await rm(dir + ".skills", { recursive: true, force: true });
      await rm(activityMarkerPath(dir), { force: true });
      // 计费水位文件随会话目录一起回收(审计 P0-5:内存淘汰**不**清它,只有会话真的过期/被删才清 ——
      // 否则它就失去了「淘汰后还能接着累计」这个唯一存在理由)。
      dropCumUsage(name);
      sessions.delete(name);
      lastMarkerTouch.delete(name);
      removed++;
    } catch {
      /* best-effort */
    }
  }
  if (removed > 0) {
    log.info("workdir GC: removed stale session dirs", { removed, ttlDays: WORKDIR_TTL_MS / 86_400_000 });
  }
}

function sweepIdleSessions(): void {
  const now = Date.now();
  let evicted = 0;
  // ① 空闲 TTL
  for (const [sid, m] of sessions) {
    if (hasActiveWs(sid)) continue;
    if (now - m.lastActiveAt > IDLE_TTL_MS) {
      sessions.delete(sid);
      evicted++;
    }
  }
  // ② 硬帽 LRU:仍超帽则按 lastActiveAt 升序挤出最久未用(无活跃 WS 者)
  if (sessions.size > MAX_SESSIONS) {
    const evictable = [...sessions.entries()]
      .filter(([sid]) => !hasActiveWs(sid))
      .sort((a, b) => a[1].lastActiveAt - b[1].lastActiveAt);
    let over = sessions.size - MAX_SESSIONS;
    for (const [sid] of evictable) {
      if (over <= 0) break;
      sessions.delete(sid);
      evicted++;
      over--;
    }
  }
  if (evicted > 0) {
    log.info("session sweep: evicted idle in-memory metas", { evicted, remaining: sessions.size });
  }
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

/** 启动会话内存淘汰 + workdir 磁盘 GC 的周期扫描(进程启动时调一次)。 */
export function startSessionSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    sweepIdleSessions();
    void sweepStaleWorkdirs(); // 内部自带 6h 节流;异步 best-effort,不阻塞内存淘汰
  }, SWEEP_EVERY_MS);
}

export function setTitle(sid: string, title: string): boolean {
  const m = sessions.get(sid);
  if (!m) return false;
  m.title = title;
  return true;
}

// sessionFlatMessages:把会话内 Anthropic messages 摊成 daemon 扁平形(每 block 一条 typed message),
// 供 GetSessionMessages(主要消费者=记忆抽取的 transcript)。耐久真源仍是后端 journal;这是内存尽力视图。
export function sessionFlatMessages(meta: SessionMeta): {
  messages: Array<{ type: string; content: unknown }>;
  totalTurns: number;
} {
  const out: Array<{ type: string; content: unknown }> = [];
  let userTurns = 0;
  for (const m of meta.messages) {
    const blocks = Array.isArray(m.content)
      ? (m.content as unknown as Array<Record<string, unknown>>)
      : [{ type: "text", text: String(m.content) }];
    if (m.role === "user") {
      const textBlocks = blocks.filter((b) => b.type !== "tool_result");
      const toolResults = blocks.filter((b) => b.type === "tool_result");
      if (textBlocks.length) {
        out.push({ type: "user", content: textBlocks });
        userTurns++;
      }
      for (const tr of toolResults) out.push({ type: "tool_result", content: [tr] });
    } else {
      for (const b of blocks) {
        if (b.type === "tool_use") out.push({ type: "tool_use", content: [b] });
        else out.push({ type: "assistant", content: [b] });
      }
    }
  }
  return { messages: out, totalTurns: userTurns };
}
