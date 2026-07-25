# W3 轮生命周期加固 · 文件级落地方案

术语沿用调研:round = runTurn 内一次 LLM call;turn = 一条 user_message 到终帧。所有行号已对照当前代码核实(turnLoop.ts / adapter.ts / ws.ts / runTools.ts / hub.go / eventlog_store.go / bridge.go 均已复读确认,与调研资料一致)。

**总原则**:五项全部走机械防线,零 prompt 祈祷。唯一的"文字性"改动(W3-5 的截断纠偏指令)是**确定性触发的合成 tool_result**,只在截断真实发生时注入,不是常驻 prompt——这是它比 prompt 层足够的原因:触发条件由代码判定(stop_reason==="max_tokens" 且有 pending tool_use),模型无法"忘记"。

---

## P0(合计约 30h,建议一个迭代内完成)

### W3-1 空轮裁决:双层防线(agent 源头 + backend 机械兜底)【6h】

对照审计:P0-3 十二个会话 turn 标 complete 但 model=''+usage 全 0,用户消息被吞、前端无任何提示。调研已证明 model='' ⇔ calls=[](turnLoop.ts:392-402),三条路径中 P1(用户早期 stop)是合法的,P2/P3 是事故。

#### 1a. agent 侧(源头改判)— `agent/src/turn/turnLoop.ts`

改 `runTurn`:

- 循环上方(~142 行 `calls` 旁)加两个标记:
```ts
let sawText = false;   // 本 turn 是否发出过任何可见正文
let ranTool = false;   // 本 turn 是否执行过任何工具
```
- 255 行 text_delta 发帧处置位 `sawText = true`;349 行 `runTools` 调用后置 `ranTool = true`。
- finally(366 行 `sendComplete()` 之前)加裁决:
```ts
if (!terminalSent && !signal?.aborted && !sawText && !ranTool) {
  // 空轮:整轮无可见正文、无工具执行、非用户主动停止 → 改判 error 终帧(sendError 置 terminalSent,
  // 下方 sendComplete 自动 no-op;error 帧按现契约携带已发生的 usage/calls,计费不漏)
  sendError("模型没有返回任何内容,本轮未完成,请重试。", "empty_turn");
}
sendComplete();
```

**为什么解决问题**:P2(意外异常越过内层 try)与 P3(上游干净断流零产出)在 finally 处被拦截,终帧从 complete 变成 error——前端 fold 已把 error 当终帧收口并渲染 `TurnErrorNotice`(MessageTurn.tsx:276),**零前端改动**。P1(abort-零call)被 `!signal?.aborted` 豁免,用户 stop 语义不变。

#### 1b. backend 侧(机械兜底 + 不计费 + journal 修正)— `backend/internal/agentbridge/hub.go`

改 `upstreamLoop` 的 `case "message_complete"`(936 行),在 `extractMessageComplete` 成功后、影子日志写入前加裁决:

```go
case "message_complete":
    if usage, calls, sessionTotal, isComplete := extractMessageComplete(data); isComplete {
        // W3-1 空轮裁决:usage 全 0 + 无 calls + 本轮 replayBuf 无任何可见文本 + 非用户 stop
        h.mu.Lock()
        hasText := replayHasVisibleText(h.replayBuf) // 新函数:复用 contentDeltaText 扫 replayBuf
        wasAborted := h.abortedTurn
        tid := h.currentTurnID
        h.mu.Unlock()
        if isZeroUsage(usage) && len(calls) == 0 && !hasText && !wasAborted {
            frame := emptyTurnFrame() // 新合成帧,见下
            h.mu.Lock()
            h.currentTurnID = 0
            h.completedThisTurn = true // endTurn 不再重复 finalize
            h.mu.Unlock()
            if tid != 0 && f.bridge.turns != nil {
                f.bridge.turns.Append(tid, h.sessionID, EvError, frame) // 失败轮终态事件入 journal(修既有缝)
                turns := f.bridge.turns
                safego.Go("agentbridge-turn-emptyfail:"+f.spec.Key, func() {
                    if err := turns.FailTurn(context.Background(), tid); err != nil {
                        slog.Warn("agentbridge: FailTurn(empty) write failed (reaper will reconcile)", "turn_id", tid, "err", err)
                    }
                })
            }
            slog.Warn("agentbridge hub: empty turn adjudicated to failed",
                "feature", f.spec.Key, "session_id", h.sessionID, "turn_id", tid)
            h.endTurn()
            h.broadcastAgent(frame)
            continue // 不广播原 complete 帧、不写 ledger、不走 OnMessageComplete/accrueTurnUsage
        }
        // …原有逻辑不动…
```

配套(同文件底部合成帧区,157 行 `upstreamLostFrame` 旁):
```go
func emptyTurnFrame() []byte {
    b, _ := json.Marshal(map[string]any{
        "type": "error", "code": "empty_turn",
        "message": "模型没有返回任何内容,本轮未完成,也不会计入用量,请重试。", "retryable": true,
    })
    return b
}
func isZeroUsage(u AgentUsage) bool { /* 四字段全 0 */ }
func replayHasVisibleText(buf [][]byte) bool {
    for _, fr := range buf { if t, ok := contentDeltaText(fr); ok && strings.TrimSpace(t) != "" { return true } }
    return false
}
```

**关键点**:
- **不计费**:`continue` 跳过 `buildLedgerRow`(调研已指出它无条件落行,usage 全 0 也写)、`OnMessageComplete`、`accrueTurnUsage`——三条计费/审计路径全部不触发。
- **顺带修既有缝**:同样在 `case "error"`(1004-1033 行)把 `data = sanitizeAgentErrorFrame(data)` **提前到 `h.endTurn()` 之前**,并在净化后、endTurn 前加 `if tid != 0 { f.bridge.turns.Append(tid, h.sessionID, EvError, data) }`——调研确认目前 error 终帧永远进不了 journal(endTurn 先清 tid,通用 tee 跳过),失败轮回放无终态。
- 时序:裁决在 `endTurn` 前读 replayBuf(endTurn 清空它),与调研建议一致。

#### 1c. `backend/internal/agentbridge/ws.go` — 错误文案映射

`agentErrorFriendly`(~596 行)加两条,使 agent 侧 1a 的帧经 `sanitizeAgentErrorFrame` 后保留友好中文:
```go
"empty_turn":           "模型没有返回任何内容,本轮未完成,请重试。",
"model_protocol_error": "模型输出出现协议异常,本轮已终止,请重试或更换模型。", // W3-3 用
```

#### 前端 / 历史回放
- 实时:零改动(error 终帧走既有 fold.ts:147-154 → TurnErrorNotice)。
- 历史:P0 阶段失败轮刷新后只剩用户气泡(现状同);EvError 已开始落 journal,**P1-A 补读侧折叠**后实时/历史同构。

**验证**:① agent 单测:mock client 产空流(无事件直接 done)→ 断言收到 `error{code:empty_turn}` 且无 message_complete;② Go 单测 `replayHasVisibleText`/裁决分支;③ e2e:把 provider 指向"回 200 后立刻 FIN 的 mock SSE"→ 前端出现错误提示、`agent_turns` 该行 status=failed、`llm_token_usage` 与 `agent_billing_ledger` 零新行;④ 回归:正常轮、用户 stop 轮(应仍走 aborted complete)、纯工具轮不受影响。`docker compose build backend` + agent 容器 rebuild + `docker-compose restart scholar_agent`。

**风险与回滚**:误判面已收到最窄(四条件与);若线上误伤,backend 裁决整段用 env `AGENT_EMPTY_TURN_ADJUDICATE=off` 短路(默认 on),agent 侧 guard 独立可留。回滚 = 移除该分支,行为退回现状。

---

### W3-2 轮级硬超时 + 挂死轮运行期回收【7h】

对照审计:P0-3 挂死轮 848s/624s 无轮级超时;调研确认 ping/pong 保活使 60s 读 deadline 永不触发(hub.go:1027-1028 注释自认),运行期无任何 reaper(仅 boot 一次 ReconcileStaleRunning)。

#### 2a. backend 轮级硬超时 — `backend/internal/agentbridge/hub.go`

调研已论证 hub 是唯一同时掌握 inFlight/turnID/agentConn 写口/广播的对象,加点照做:

- struct(93 行 `graceTimer` 旁)加字段:
```go
turnTimer    *time.Timer // 轮级硬超时(h.mu 守护);beginTurn arm,endTurn 停
timedOutTurn bool        // 本轮已被超时强制收口 → 迟到的孤儿 complete 只入账不广播
```
- `beginTurn`(865-876 行)置 `inFlight=true` 后:
```go
h.abortedTurn = false
h.timedOutTurn = false
if d := h.f.spec.TurnTimeoutOrDefault(); d > 0 {
    h.turnTimer = time.AfterFunc(d, h.onTurnTimeout)
}
```
- `endTurn`(879 行)锁内:`if h.turnTimer != nil { h.turnTimer.Stop(); h.turnTimer = nil }`。`shutdown`(771 行锁内)同样停。
- 新方法:
```go
func (h *sessionHub) onTurnTimeout() {
    h.mu.Lock()
    if !h.inFlight || h.closed { h.mu.Unlock(); return }
    tid := h.currentTurnID
    h.timedOutTurn = true
    h.mu.Unlock()
    // ① 让 agent 真正停下(abort 传导到 LLM 流/工具批,释放执行器并发槽 —— 全容器仅 2 槽,挂死即占死)
    stop, _ := json.Marshal(map[string]string{"type": "stop_generation"})
    _ = h.writeAgent(gorillaws.TextMessage, stop)
    // ② 终态入 journal + failed
    frame := turnTimeoutFrame()
    if tid != 0 && h.f.bridge.turns != nil {
        h.f.bridge.turns.Append(tid, h.sessionID, EvError, frame)
    }
    h.endTurn() // tid!=0 && !done → FailTurn(既有路径)
    // ③ 前端可见 + 解锁 busy
    h.broadcastAgent(frame)
    slog.Warn("agentbridge hub: turn hard-timeout fired", "feature", h.f.spec.Key, "session_id", h.sessionID, "turn_id", tid)
}
func turnTimeoutFrame() []byte {
    b, _ := json.Marshal(map[string]any{
        "type": "error", "code": "turn_timeout",
        "message": "本轮处理时间过长已自动停止,已生成的内容保留在上方,请重试或换个问法。", "retryable": true,
    })
    return b
}
```
- 孤儿 complete 防护:`case "message_complete"` 开头读 `h.timedOutTurn`,为 true 时**只走计费入账链路(usage/accrue),跳过广播与 journal complete**(`continue` 前清 `timedOutTurn=false`)——防止超时 error 后又飘来一帧 complete 把前端 fold 顶出一个幽灵轮。
- `backend/internal/agentbridge/spec.go`:`FeatureSpec` 加 `TurnTimeout time.Duration` + `TurnTimeoutOrDefault()`(默认 15min;=0 表示禁用)。claw/prism/smart_search 不用改 spec 即得默认值;peerreview 走 server-side 路(ws_serverside.go 全程不经 hub),天然不受影响。

#### 2b. agent 侧兜底 killer — `agent/src/server/ws.ts`

backend hub 若先死,agent 的挂死 turn 会占死进程级并发槽(`tryAcquireTurn`)。`handleUserMessage`(229-231 行)加:
```ts
const HARD_TURN_MS = Number(process.env.EXECUTOR_TURN_HARD_TIMEOUT_MS || 20 * 60_000); // 比 backend 15min 宽
const hardKiller = HARD_TURN_MS > 0 ? setTimeout(() => {
  log.warn("turn hard-timeout killer fired", { session_id: meta.sessionId });
  abort.abort(); // turnLoop abort 路径:break → finally 终帧 → finally 释放槽
}, HARD_TURN_MS) : undefined;
```
finally(358-364 行)里 `if (hardKiller) clearTimeout(hardKiller);`。

#### 2c. 运行期 reaper(lease 机制补全)— `backend/internal/agentbridge/bridge.go` + `eventlog_store.go` + `backend/cmd/server/bootstrap.go`

lease 列(P3 惰性)不激活,复用现成幂等 SQL 升为 ticker——与调研建议一致,零迁移:

- `bridge.go`(`ReconcileJournalOnBoot` 351 行旁)加:
```go
// StartJournalReaper 运行期周期回收僵尸 running turn(W3-2):FailTurn 异步落库失败 /
// 进程活着但 hub 异常路径漏 finalize 时,不再等到下次发版才被 boot 回收。SQL 幂等,与 boot 版同一写口。
func (b *Bridge) StartJournalReaper(ctx context.Context) {
    if b.log == nil { return }
    safego.Go("agentbridge-journal-reaper", func() {
        t := time.NewTicker(10 * time.Minute)
        defer t.Stop()
        for {
            select {
            case <-ctx.Done(): return
            case <-t.C:
                if err := b.log.ReconcileStaleRunning(ctx); err != nil {
                    slog.Warn("agentbridge: journal reaper failed", "err", err)
                }
            }
        }
    })
}
```
- `eventlog_store.go:116` 阈值 1h → 30min(轮级超时 15min 已保证正常轮绝不超过它;注释同步改)。
- `bootstrap.go`(调 `ReconcileJournalOnBoot` 的 167 行旁)加一行 `agentBridge.StartJournalReaper(ctx)`。
- 顺带:`hub.go:893` 与 `hub.go:801` 的 `_ = turns.FailTurn/AbortTurn` 改为记 `slog.Warn`(调研缺口 1 的吞错点)——reaper 是兜底,但失败要留痕。

#### 前端 / 历史回放
- 实时:`turn_timeout` 是标准 error 终帧,fold 既有分支收口 + 解锁 busy,零改动。
- 历史:EvError 已入 journal(2a),P1-A 后同构。
- 挂死轮不再"无限 StreamingIndicator":15min 上限硬保证;更早的"已等待很久"软提示放 P1-C。

**验证**:① dev 把 claw spec TurnTimeout 设 30s,发一条让模型 `Bash sleep 600` 的消息 → 30s 后前端出现超时提示、composer 解锁、`agent_turns` status=failed、第二个会话能正常开轮(槽已释放);② 单测 onTurnTimeout 的"已 endTurn 后 fire 是 no-op"与"孤儿 complete 只入账不广播";③ 手工 UPDATE 一行 status=running、created_at 提前 40min → 等 ticker → 变 aborted;④ 用户正常 stop / 正常完成轮回归无变化。

**风险与回滚**:15min 对交互三件套足够宽(审计挂死轮 848s=14min 是事故不是正常);超时对长工具轮(如大文献综述)若误伤,per-feature 调 `TurnTimeout` 即可;`TurnTimeout=0`/`EXECUTOR_TURN_HARD_TIMEOUT_MS=0` 双开关即回滚。reaper 只动 status=running 的僵尸行,SQL 与 boot 版完全同一条,风险为零。

---

### W3-3 DSML 协议泄漏熔断【6h】

对照审计:P0-5 七个会话 deepseek 把 `<｜｜DSML｜｜tool_calls>` 原文吐进用户可见正文且 Write 未执行,6/7 在末轮=终稿损坏。调研确认漏点是**两条 lane 的 text_delta 通路无过滤直通**,且 turnLoop.ts:253-256 是两条 lane 汇合后的**唯一咽喉**——在此拦,一处覆盖全部。

#### 3a. 新文件 `agent/src/turn/leakGuard.ts` — 流式滚动扫描器

```ts
// DSML/内部协议标记的流式检测器:delta 分帧会把 marker 切碎,须持 holdback 尾巴跨帧匹配。
// 触发即"熔断":本 content 块余下文本全部吞掉(绝不下发),置 tripped。
const MARKERS = [
  "<｜DSML｜", "<｜｜DSML｜｜", "<|DSML|", "<｜tool▁calls▁begin｜", "<｜tool▁call▁begin｜",
  "<｜tool_calls_begin｜", "<|tool▁calls▁begin|", "<|tool_calls_begin|",
];
const MAX_HOLD = Math.max(...MARKERS.map((m) => m.length)) - 1;

export class ProtocolLeakGuard {
  private tail = "";
  tripped = false;
  passedChars = 0; // 熔断前已放行的干净字符数(重试决策用)

  feed(text: string): string {           // 返回可安全下发的部分;tripped 后恒返 ""
    if (this.tripped) return "";
    const buf = this.tail + text;
    const hit = firstMarkerIndex(buf);   // MARKERS 逐个 indexOf 取最小
    if (hit >= 0) {
      this.tripped = true;
      const clean = buf.slice(0, hit);
      this.tail = "";
      this.passedChars += clean.length;
      return clean;
    }
    // 无完整命中:留可能是 marker 前缀的尾巴(至多 MAX_HOLD,且必须是某 marker 的真前缀)
    const keep = longestMarkerPrefixSuffix(buf, MAX_HOLD);
    this.tail = keep;
    const out = buf.slice(0, buf.length - keep.length);
    this.passedChars += out.length;
    return out;
  }
  flush(): string {                      // 块结束/流结束时放出无害尾巴
    if (this.tripped) return "";
    const t = this.tail; this.tail = ""; this.passedChars += t.length; return t;
  }
}
export function stripProtocolMarkers(text: string): string {
  const i = firstMarkerIndex(text);
  return i >= 0 ? text.slice(0, i) : text; // marker 起一刀切:其后是协议载荷,不是给人看的
}
```

#### 3b. `agent/src/turn/turnLoop.ts` — 接入 + 有界重试

- 每 round(220 行 `assembler` 旁)新建 `const textGuard = new ProtocolLeakGuard(); const thinkGuard = new ProtocolLeakGuard();`;函数级加 `let dsmlRetries = 0;`(上限 env `EXECUTOR_DSML_RETRIES`,默认 1)。
- 253-256 行改为:
```ts
if (d.type === "text_delta" && d.text) {
  const out = textGuard.feed(d.text);
  if (out) { sawText = true; sink.frame({ type: "content_delta", text: out }); }
} else if (d.type === "thinking_delta" && d.thinking) {
  const out = thinkGuard.feed(d.thinking);
  if (out) sink.frame({ type: "thinking", text: out });
}
```
- for-await 结束后、`msg = await stream.finalMessage()` 后:
```ts
const tailT = textGuard.flush(); if (tailT) { sawText = true; sink.frame({ type: "content_delta", text: tailT }); }
const tailK = thinkGuard.flush(); if (tailK) sink.frame({ type: "thinking", text: tailK });
```
- `calls.push(normUsage(...))`(328 行)之后、`messages.push`(331 行)**之前**加裁决:
```ts
if (textGuard.tripped || thinkGuard.tripped) {
  log.warn("DSML protocol leak intercepted", { session_id: input.sessionId, model, round, passed: textGuard.passedChars });
  const hasTool = msg.content.some((b) => b.type === "tool_use");
  // history 消毒:marker 起一刀切,协议残渣绝不回喂下一 round / seed
  msg = { ...msg, content: msg.content.map((b) =>
    b.type === "text" ? { ...b, text: stripProtocolMarkers(b.text) }
    : b.type === "thinking" ? { ...b, thinking: stripProtocolMarkers(b.thinking) } : b) } as Anthropic.Message;
  if (!hasTool && textGuard.passedChars < 200 && dsmlRetries < MAX_DSML_RETRIES) {
    dsmlRetries++;
    continue; // 干净正文几乎为零 → 整 round 作废重打一次(usage 已入账;不 push 污染内容)
  }
  if (!hasTool && msg.content.every((b) => b.type !== "text" || !b.text.trim())) {
    sendError("模型输出出现协议异常,本轮已终止,请重试或更换模型。", "model_protocol_error");
    break;
  }
  // 已有可观正文 → 保留净化后内容正常收轮(用户拿到干净部分,协议尾巴被剪)
}
messages.push({ role: "assistant", content: msg.content });
```

**为什么解决问题**:硬保证"绝不下发"由 feed/holdback 在**发帧前**完成——7 个泄漏会话的形态(marker 作为 delta.content 进来、`toolByOAIdx` 空、判 end_turn)全部命中此路径;<200 字符规则精确覆盖"末轮整块是 DSML"的 6/7 场景(重试一次通常即恢复,deepseek 该故障非确定性);journal tee 的是过滤后帧 → **历史回放天然干净、实时/历史同构无需额外处理**。

#### 3c. backend 事后雷达(P1-B,见下)

**验证**:① leakGuard 单测:marker 完整 / 被切成 3 帧 / 全角半角混合 / 正文含孤立 `<` 的 holdback-flush 正确性;② adapter 注入测试:mock SSE 在 delta.content 里吐 `<｜｜DSML｜｜tool_calls>{...}` → 断言 content_delta 帧序列无 marker、发生一次重试、重试后正常收轮;③ e2e 后 `SELECT ... FROM agent_turn_events WHERE payload LIKE '%DSML%'` 零行;④ 正常轮吞吐回归(guard 是 O(N) indexOf,视觉无感)。

**风险与回滚**:误伤面 = 用户正文里真的在讨论 deepseek 特殊 token(极小众,且只截讨论文本不炸轮);`EXECUTOR_DSML_RETRIES=0` 关重试,MARKERS 收窄即降敏;整体回滚 = 移除 feed 包装还原直通。

---

### W3-4 tool_result / MCP 单条 payload 上限【3h】

对照审计:spam 论文单条 abstract 6.7 万字符直接打崩一轮。机制:巨型 tool_result → 回喂下一 round 全量请求 → 撞中转"~100KB+ 请求随机掐断"(adapter.ts:154 注释实测)与 token 墙;同时该帧原样广播给前端、tee 进 journal。

#### 4a. 新文件 `agent/src/turn/resultCap.ts`

```ts
const PER_BLOCK_MAX = Number(process.env.EXECUTOR_TOOL_RESULT_BLOCK_MAX || 20_000);  // 单 text 块
const TOTAL_MAX     = Number(process.env.EXECUTOR_TOOL_RESULT_TOTAL_MAX || 60_000);  // 单 tool_result 合计
export function capToolResult(content: unknown): unknown {
  if (PER_BLOCK_MAX <= 0) return content; // 0 = 关闭
  if (typeof content === "string") return capText(content, Math.min(PER_BLOCK_MAX, TOTAL_MAX));
  if (!Array.isArray(content)) return content;
  let budget = TOTAL_MAX;
  const out: unknown[] = [];
  for (let i = 0; i < content.length; i++) {
    const b = content[i] as { type?: string; text?: string };
    if (b?.type !== "text" || typeof b.text !== "string") { out.push(b); continue; }
    if (budget <= 0) {
      out.push({ type: "text", text: `[检索结果过大,后续 ${content.length - i} 个结果块已省略]` });
      break;
    }
    const capped = capText(b.text, Math.min(PER_BLOCK_MAX, budget));
    budget -= capped.length;
    out.push(capped === b.text ? b : { type: "text", text: capped });
  }
  return out;
}
function capText(t: string, max: number): string {
  return t.length <= max ? t : t.slice(0, max) + `\n\n[内容过长已截断:原始 ${t.length} 字符,以上为前 ${max} 字符]`;
}
```

#### 4b. `agent/src/turn/runTools.ts` — 唯一咽喉接入

`runOne` 里 MCP 与 builtin 两条取回 content 后(77-79 行之间,`sink.frame` 之前)统一:
```ts
content = capToolResult(content);
```
`errResult`(87-91 行)同样上限:`text: msg.slice(0, 2000)`(上游错误体可能巨大,也是 P1-12 泄漏放大器)。

**为什么解决问题**:此处是 MCP(minicod spam)与 builtin 的合流点,截断同时作用于三个下游——回喂 messages(下一 round 请求体)、`sink.frame tool_result`(前端帧与 journal tee)——一处改动三处受益。截断带显式标注,模型知道数据被截、不会把截断当完整(顺带压 P0-1 的"以为读全了"面)。

**历史回放**:帧在截断后才发出/落库,实时与历史看到同一份截断内容,同构无缝。

**验证**:单测 67k 字符块 → 截断+标注;e2e 检索命中 spam 论文 → tool_result 帧 ≤60KB、下一 round 正常、轮完成;`EXECUTOR_TOOL_RESULT_BLOCK_MAX=0` 行为退回现状。

**风险与回滚**:极长合法结果(如全文 PDF 转文本)被截——20k/60k 字符(约 1.5 万 token)对 metadata 检索场景绰绰有余,真要全文应走 Read 分页;env 双旋钮可调可关。

---

### W3-5 "长思考→写大文件"崩溃点针对性加固【8h】

对照审计与调研 §3 的三条真实机制逐条堵:

#### 5a. 干净断流不再伪装 end_turn — `agent/src/openai/adapter.ts`

机制 1:长 thinking 耗尽中转空闲窗 → FIN 关流(无错误无 [DONE])→ `mapStopReason(null)="end_turn"` → 空轮标 complete。这是 P0-3 最大来源。

改 `OpenAIFakeStream` 收尾段(346-372 行):
```ts
// W3-5a:上游从未发 finish_reason 且本 call 零产出 → 这是"中转掐流",不是正常结束。
// 伪装 end_turn 会制造「空回答 + complete」(P0-3 主路径);改为如实抛错 → turnLoop 统一 error 终帧。
if (finish === null && toolByOAIdx.size === 0 && !textBuf) {
  this.err = new Error("upstream stream ended without finish_reason (connection cut by relay)");
  throw this.err;
}
```
tool args 截断(356-359 行)同理不再吞成 `input={}`:
```ts
try { input = st.args ? JSON.parse(st.args) : {}; } catch {
  // args 被掐成半截 JSON:执行必失败且症状漂移(Write 缺参 → 道歉轮 → 幻影交付)。如实失败。
  this.err = new Error(`tool arguments truncated by upstream: ${st.name}`);
  throw this.err;
}
```
(有正文但 finish=null 的变体保留现状+log.warn:正文已流给用户,救内容优先。)

#### 5b. 流空闲超时 — `agent/src/openai/adapter.ts`

挂死轮 848s/624s 的另一形态:TCP 活着但字节停了。`reader.read()`(282 行)包空闲超时:
```ts
const IDLE_MS = Number(process.env.EXECUTOR_STREAM_IDLE_TIMEOUT_MS || 120_000);
// while(true) 内:
const { done, value } = await readWithIdleTimeout(reader, IDLE_MS); // Promise.race + setTimeout;超时 throw
```
长思考持续产 reasoning 字节,120s 无任何字节必是死流——比 backend 15min 硬闸早 13 分钟把用户放出来。(Anthropic lane 有 SDK 默认 10min timeout,不动。)

#### 5c. max_tokens 撞顶自恢复 — `agent/src/turn/turnLoop.ts`

机制 2:thinking+大 Write content 吃光 64000 完成窗 → stop_reason=max_tokens → 只 log.warn 就 break → 工具未执行、用户无感知(21-22 行注释自认病灶)。改 333-342 行:

```ts
if (msg.stop_reason !== "tool_use") {
  if (msg.stop_reason === "max_tokens") {
    const tus = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (tus.length > 0 && maxTokRecoveries < 1) {
      // 被截断的 tool_use 必须回 tool_result(协议要求),借此注入确定性纠偏指令后再走一轮:
      maxTokRecoveries++;
      log.warn("max_tokens with pending tool_use: injecting chunked-write recovery", { session_id: input.sessionId });
      const results = tus.map((tu) => truncatedToolResult(tu.id, sink)); // is_error:"输出因长度上限被截断,
      // 该工具调用未执行。请把内容拆成多次较小的 Write / Edit 分段写入,先写框架再逐段补全。"
      messages.push({ role: "user", content: results });
      continue;
    }
    // 无工具可救 / 已救过:如实告知截断(前端 system_notification 通道已有 context_compacted 先例)
    sink.frame({ type: "system_notification", kind: "output_truncated", level: "warning",
      message: "本轮输出达到长度上限,内容可能不完整;可让我分段继续。" });
    log.warn("turn hit max_tokens (output truncated)", { ... });
  }
  break;
}
```
`truncatedToolResult` 复用 runTools.ts 的 `errResult` 形态(export 或内联)。**为什么这里 prompt 文本是对的**:它不是常驻祈祷,而是 stop_reason 机械判定后的定向注入——模型下一轮 100% 看到,且带着 is_error tool_result 的强信号;前端同步看到该工具"未成功"chip,诚实呈现。

#### 前端 / 历史回放
- `system_notification{kind:"output_truncated"}`:通道已存在(context_compacted);检查 `frontend-user/src/features/claw/components/chat/fold.ts` 的 system_notification case 是否按 kind 白名单——若是,加一个 kind(半小时);smart-search/prism fold 同查。未识别 kind 被忽略也无害(降级为无提示,不劣于现状)。
- 恢复轮注入的合成 tool_result 走既有 tool_result 帧 → journal/前端与普通工具轮同构,回放无特例。

**验证**:① adapter 单测:SSE 无 finish_reason 空流 → throw(而非 end_turn);args 半截 JSON → throw;② `EXECUTOR_MAX_TOKENS=1000` + 让模型写 3000 字文件 → 观察注入恢复轮、模型分段重写成功 or 截断提示出现;③ mock 停字节 130s → idle timeout error 帧;④ 半月后复盘 P0-3 形态轮数归零(配合 W3-1 的 journal failed 状态可直接 SQL 统计)。

**风险与回滚**:5a 把以前"静默空成功"变成显式失败——用户看到错误比看到空白好,但错误率指标会"上升"(实为显影),上线前跟运营打招呼;各 env(`EXECUTOR_STREAM_IDLE_TIMEOUT_MS=0` 等)可逐项关。5c 恢复轮多耗一次 call 的 token,有 `maxTokRecoveries<1` 硬界。

---

## P1(合计约 12h)

### P1-A 失败轮错误持久化:实时/历史 fold 同构补齐【6h】
- backend:`eventlog_store.go` 读侧 `FoldToMessages`(202 行起)加 EvError → 折出 `{type:"error", message}` entry(消息用帧内已净化文案)。
- 前端:`shared/lib/agent-history.ts:186-295` 加 `case 'error'` → 置 `turn.errorMessage`+complete(与实时 fold.ts:147-154 同语义);`features/claw/api/types.ts:100` ClawHistoryEntry union 加 arm;smart-search / prism 各自 history 消费处同步(调研 §2 第 8 点列的文件面)。
- 验证:制造一个 empty_turn / turn_timeout 失败轮 → 刷新页面,错误提示仍在(现状会消失);`tsc -b && vite build`。
- 这是"实时 fold 与历史 fold 同构"铁律的收口:W3-1/2/3 的合成 error 帧已入 journal,本项让读侧追平。

### P1-B DSML 事后雷达 — `backend/internal/agentbridge/eventlog_validate.go`【1.5h】
`compareSession`(107 行拼出双侧全文处)对 jText/dText 加 MARKERS 子串扫描,命中走既有 `journalValidateMismatch` 计数 + `slog.Error("dsml marker found in transcript")`。定位:纯审计雷达,验证 W3-3 源头过滤零漏网(生产开 `AGENT_JOURNAL_VALIDATE=on` 观察一周)。不做拦截(调研已论证此层拦不住 live)。

### P1-C 长等待可感知【4h】
对照审计"52% 轮思考字数>正文、等待不可见"+挂死轮期间前端无限转圈:
- `features/claw/hooks/useClawConversation.ts`:参照 `STOP_FALLBACK_MS` 模式加 busy 持续时长信号(本轮最后一帧时间戳,任何帧刷新);≥120s 时置 `longWait: true`。
- `shared/components/chat/StreamingIndicator.tsx`:接 `longWait` 追加文案"仍在处理,较复杂的任务可能需要几分钟;可随时点停止"。顺带把 `fold.ts:127-133` 丢弃的 status 帧 `elapsed` 填进 `TurnPlaceholder.elapsedSeconds`(类型已预留,调研 §3"最短路径"),渲染"已运行 X 秒"。
- 纯展示层,无新帧、无回放问题(历史轮无计时,组件已按 undefined 降级)。

---

## 排期与依赖

| 项 | 层 | 工时 | 依赖 |
|---|---|---|---|
| P0 W3-1a/1c agent 空轮 guard + 文案映射 | agent+backend | 2h | 无 |
| P0 W3-1b backend 裁决 + EvError 落 journal | backend | 4h | 无 |
| P0 W3-2a/2b 轮级硬超时(hub timer + agent killer) | backend+agent | 5h | 无 |
| P0 W3-2c reaper ticker + 吞错留痕 | backend | 2h | 无 |
| P0 W3-3 DSML leakGuard + 重试 | agent | 6h | 无 |
| P0 W3-4 payload cap | agent | 3h | 无 |
| P0 W3-5 adapter 三修 + max_tokens 恢复 | agent | 8h | 建议在 W3-1 之后(空轮显影依赖它兜底) |
| P1-A 错误持久化同构 | backend+前端 | 6h | W3-1b(EvError 已落库) |
| P1-B DSML 雷达 | backend | 1.5h | W3-3 |
| P1-C 长等待可感知 | 前端 | 4h | 无 |

**统一验证口径**:backend `docker compose build backend`;agent 改动 `docker-compose up -d --build agent`(prompt/代码均需 restart scholar_agent);前端 `tsc -b && vite build`。上线一周后用 journal 复盘 SQL:`SELECT status, COUNT(*) FROM agent_turns WHERE created_at > ? GROUP BY status` 对照审计基线(12 空轮/91 会话),预期 model=''+complete 组合归零、failed 可解释可见。

**总回滚面**:所有新机械层各带独立开关(`AGENT_EMPTY_TURN_ADJUDICATE` / `FeatureSpec.TurnTimeout=0` / `EXECUTOR_TURN_HARD_TIMEOUT_MS=0` / `EXECUTOR_DSML_RETRIES` / `EXECUTOR_TOOL_RESULT_BLOCK_MAX=0` / `EXECUTOR_STREAM_IDLE_TIMEOUT_MS=0`),默认全开;关掉即逐项退回现状,互不耦合。唯一共享改动是 hub.go message_complete/error 两个 case 的重排,回滚靠 git revert 单 commit(建议 W3-1b 与 W3-2a 分 commit 提交)。