# W5 落地方案:错误分级(双轨制)+ 前端脱敏兜底 + 等待体验 + 挂死轮 UI

## 0. 总体设计:三道防线 + 一条 prompt 条文

| 防线 | 层 | 性质 | 解决 |
|---|---|---|---|
| 1. 工具错误双轨制 | agent 工具层(`ToolResult.userMessage` 新字段) | 机械·源头 | P1-12 的主修:工具卡默认展示的是运维原文 |
| 2. 关键词脱敏兜底 | 前端 `ToolPayloadFold` 唯一渲染缝 | 机械·兜底 | agent 层漏网 + 旧历史事件 + MCP 透传错误 |
| 3. 等待/挂死 UI | `StreamingIndicator` / `ThinkingFold` / stall 看门狗 | 机械·体验 | 52% 思考>正文不可见、848s/624s 挂死轮无提示 |
| 4. prompt 条文 | agent 系统级 appendSystemPrompt | prompt | 模型把报错**复述进正文**(工具卡脱敏够不到正文;正文关键词打码误伤率高,只能靠 prompt) |

**拆分层选择:agent 工具层,tool_result 帧加 `userMessage` 字段**,理由(对照调研):
- 只有工具实现知道失败类别(沙箱 gate / pandoc / 超时),能给出准确的用户文案;backend hub 对帧语义刻意黑盒(hub.go:810-826 原样扇出),在 hub 改写引入协议耦合,且它不知道 `bash disabled: ...` 意味着什么;
- 帧从 `runTools.ts:80` → ws.ts:257 `safeSend` → Go hub 原样转发,**backend 实时链路零改动**;journal tee 存的是整帧 payload(eventlog_batcher),`userMessage` 自动持久化,历史回放只需 `FoldToMessages` 一行透传;
- **回喂模型的 content 一个字不动**(runTools.ts:81 返回值不变)——模型仍拿全量修复指引(Read 的 ReadDocument hint、ExportDocument 的降级指引都是自愈刚需),用户轨道只加不改。

---

## P0(合计约 13.5h)

### P0-A 工具错误双轨制(agent + backend 一行,约 4h)

#### A1. `agent/src/tools/registry.ts` — ToolResult 加 userMessage,关键 fail 点补文案(2h)

改 `ToolResult`(registry.ts:23-26)与 `fail`(registry.ts:39-41):

```ts
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
  /** 面向用户的一句话摘要(中文、脱敏,不含 env/容器路径/运维指引)。缺省时 runTools 按工具名兜底。 */
  userMessage?: string;
}
function fail(text: string, userMessage?: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true, ...(userMessage ? { userMessage } : {}) };
}
```

逐点补第二参(对照审计证据):

| 位置 | 现文案(给模型,保留) | 新增 userMessage(给用户) |
|---|---|---|
| registry.ts:284 Bash gate(P0-4 主泄漏源,47/65 失败) | `"bash disabled: " + gate.reason` | `"命令执行环境暂不可用,本步骤已跳过。"` |
| registry.ts:322 Bash 非零退出 | `"exit N\n" + body` | `"命令执行未成功,AI 会尝试其它方式。"` |
| registry.ts:324 Bash 异常 | 原文 | 同上 |
| registry.ts:427 导出沙箱 fail-closed(4/4 失败、半月 0 docx) | `"导出沙箱不可用,已按 secure-by-default 拒绝(…)"`(此串经 res.err 进 registry.ts:623)| 在 ExportDocument 两个 fail 点(:619-621、:623)给 `"文档导出暂时不可用,请稍后重试或直接复制正文内容。"`(P0-4 修复后自然消失) |
| registry.ts:618-621 PDF 无引擎 | 原文 | `"暂不支持导出 PDF,已建议 AI 改用 Word(docx)格式。"` |
| registry.ts:97 Read 二进制 | 原文(hint 教走 ReadDocument,**不再教走 Bash**——顺带核对该文案无 Bash 指引) | `"该文件需要转换后阅读,AI 正在换用文档读取方式。"` |
| registry.ts:488/491 ReadDocument 失败/无文本层 | 原文 | `"文档内容提取未成功(可能是扫描件)。"` |
| registry.ts:626 空产物、:635 异常 | 原文 | `"文档导出未成功,AI 会重试或改用其它格式。"` |

**为什么能解决 P1-12**:审计的 25 会话泄漏全部经「工具错误卡片展开」路径;该路径唯一渲染源是 `tool.result` 原文。双轨后前端 error 态默认渲染 `userMessage`,原文降级为脱敏后的「技术详情」折叠(见 B2)。

#### A2. `agent/src/turn/runTools.ts` — 帧透传 + 按工具名兜底(1h)

```ts
// runOne 中(:80 前):
if (isError && !userMessage) userMessage = genericToolUserMessage(tu.name);
sink.frame({ type: "tool_result", toolUseId: tu.id, content, isError, ...(userMessage ? { userMessage } : {}) });

// errResult(:87-91)加第三参,三个调用点分别给:
// "aborted" → "已停止";"permission denied"/"tool not permitted" → "该操作未获授权,已跳过";
// "unknown tool" → "该操作暂不可用"。

function genericToolUserMessage(name: string): string {
  if (name.startsWith("mcp__minicod__")) return "文献检索暂时失败,AI 会调整检索方式重试。";
  if (name === "Bash") return "命令执行未成功。";
  if (name === "Read" || name === "ReadDocument" || name === "Grep" || name === "Glob") return "读取内容未成功。";
  if (name === "Write" || name === "Edit") return "写入内容未成功。";
  if (name === "ExportDocument") return "文档导出未成功。";
  return "该步骤未成功,AI 会尝试其它方式。";
}
```

MCP 错误(minicodClient.ts:116 熔断快失败等)天然经此兜底覆盖,无需动 `mcp/mcpTools.ts`。注意 catch 分支(:82-84)走 errResult 也要带兜底。ws.ts:257 `safeSend(ws, f)` 整帧透传,**agent 出帧口零改动**。

#### A3. `backend/internal/agentbridge/eventlog_store.go` — 历史回放透传(0.5h)

`FoldToMessages` 的 `case EvToolResult`(:281-306):payload 里已含整帧,解析 struct 加一个字段并塞进 block:

```go
UserMessage string `json:"userMessage"`
// ...
if f.UserMessage != "" { blk["user_message"] = f.UserMessage }
```

旧事件 payload 无此字段 → 零值跳过,**天然向后兼容**。验证:`docker compose build backend`。

#### 验证(A 整体)
- 本地(macOS 无 bwrap,自探必失败)起 agent,claw 里让模型跑 Bash → 浏览器 WS 帧断言 `tool_result` 含 `userMessage:"命令执行环境暂不可用…"` 且 `content[0].text` 仍是 `bash disabled: ...` 全量;
- 刷新页面走历史回放,GET history 的 `tool_result` entry content block 含 `user_message`;
- agent 有测试则 `cd agent && bun test`;改完 `docker-compose up -d --build agent`(调研注:探测进程级缓存,必须重建)。

**风险/回滚**:纯增字段,旧前端忽略未知字段无感;回滚 = revert + 重建 agent。唯一注意:`userMessage` 绝不回喂模型(runTools 返回值不含它),不改变模型行为面。

### P0-B 前端脱敏兜底 + 渲染适配(约 5h)

#### B1. 新文件 `frontend-user/src/shared/lib/friendly-tool-error.ts`(2h,含 vitest)

```ts
/** 运维关键词分类 → 用户文案(命中即整体替换摘要);对照 2026-07 审计 P1-12 真实泄漏样本。 */
const CLASSIFIERS: Array<{ re: RegExp; summary: string }> = [
  { re: /bwrap|bubblewrap|seccomp|apparmor|sandbox|secure-by-default|unshare|Failed to make .* slave|沙箱/i,
    summary: '执行环境暂不可用,该步骤已跳过。' },
  { re: /bash disabled|command not found|\bexit \d+|spawn .*ENOENT/i, summary: '命令执行未成功。' },
  { re: /pandoc|pdftotext|pdf.?engine|导出/i, summary: '文档转换未成功。' },
  { re: /permission denied|not permitted/i, summary: '该操作未获授权,已跳过。' },
  { re: /timeout|timed out|ETIMEDOUT|超时/i, summary: '该步骤等待超时。' },
  { re: /circuit|breaker|熔断|ECONNREFUSED|fetch failed|network/i, summary: '上游服务暂时不可用。' },
];
export function friendlyToolError(toolName: string, raw: string): string { /* 依次匹配,miss → 按工具名兜底(同 A2 表)*/ }

/** 兜底打码:即使摘要没接管、用户点开「技术详情」,原文也先过这里。 */
export function sanitizeOpsText(s: string): string {
  return s
    .replace(/\/(?:home|workspace|app|root|srv|mnt|data|opt|etc|proc|sys)\/[^\s`"')）]+/g, '[内部路径]')
    .replace(/\b(EXECUTOR|SANDBOX|MINICOD|NODE_ENV|BOLT_SLIDES)[A-Z0-9_]*\b(\s*=\s*\S+)?/g, '[内部配置]')
    .replace(/\b[A-Z][A-Z0-9]{2,}(_[A-Z0-9]+){1,}\b/g, '[内部配置]')          // 泛化 SCREAMING_SNAKE env 名
    .replace(/\bbwrap\b|\bbubblewrap\b|\bseccomp\b|\bapparmor\b/gi, '[沙箱]')
    .replace(/^\s*at .+\(.+:\d+:\d+\)$/gm, '')                                 // JS 堆栈行
    ;
}
```

带 vitest(`friendly-tool-error.test.ts`),fixture 直接用审计真实泄漏样本:`"bash disabled: bwrap 自探失败: Failed to make / slave"`、`"导出沙箱不可用,已按 secure-by-default 拒绝(EXECUTOR_ALLOW_UNSANDBOXED_BASH…)"`、含 `/home/bun/sessions/...` 的报错,断言输出不含 `bwrap|EXECUTOR|/home/`。

#### B2. `shared/components/chat/ToolCallBlock.tsx` — 唯一渲染缝改造(1h)

调研已确认最薄缝 = `ToolPayloadFold`(:195-229),`kind==='error'`(:178 传入)。改 error 路径:

```tsx
{tool.result !== undefined ? (
  failed ? (
    <ToolErrorFold tool={tool} />          // 新子组件,同文件内
  ) : (
    <ToolPayloadFold label="结果" value={tool.result} kind="output" />
  )
) : null}

function ToolErrorFold({ tool }: { tool: ToolBlock }) {
  const raw = formatPayload(maskToolSource(tool.result));
  const summary = tool.userMessage || friendlyToolError(tool.toolName, raw);
  const [showDetail, setShowDetail] = useState(false);
  return (
    <div className="min-w-0">
      <div className="rounded-sm px-2 py-1.5 text-xs bg-warning-soft border border-brand-amber/20 text-subtle">
        {summary}
        <button className="ml-2 text-faint hover:text-subtle" onClick={() => setShowDetail(v => !v)}>
          {showDetail ? '收起详情' : '技术详情'}
        </button>
      </div>
      {showDetail && <pre className="…同现有 error pre 样式">{sanitizeOpsText(raw)}</pre>}
    </div>
  );
}
```

关键点:**「技术详情」也必过 `sanitizeOpsText`** —— 双轨 + 兜底叠加,agent 层全漏(旧历史事件)也不裸奔。claw / smart-search / prism 共用此组件,一处改三处生效;`renderResultPreview` 旁路只走成功路径(调研 §1),不受影响。

#### B3. 类型与三条 fold 透传 + 历史回放(1.5h)

1. `shared/types/chat.ts` `ToolBlock`(:24-48)加 `userMessage?: string;`
2. `features/claw/api/types.ts:55` tool_result 帧 arm 加 `userMessage?: string`(smart-search / prism 若各持 union 同步加);
3. 三处 fold 的 `case 'tool_result'` 各加一行 `block.userMessage = msg.userMessage;`
   - `features/claw/components/chat/fold.ts:110-117`
   - `features/search/components/smart-search/types.ts:128`
   - `features/prism/components/chat/fold.ts:69`
4. `shared/lib/agent-history.ts` `attachToolResult`(:177-184)加:
   ```ts
   if (typeof block.user_message === 'string') tb.userMessage = block.user_message;
   ```

**历史回放降级(硬要求)**:旧事件无 `user_message` → `tb.userMessage === undefined` → B2 的 `friendlyToolError` 前端兜底接管,渲染仍是友好摘要 + 脱敏详情,**不出现空白或裸奔**。

#### B4. `shared/components/chat/TurnErrorNotice.tsx` — message 过兜底(0.5h)

渲染前 `sanitizeOpsText(message)`。backend 已有 `sanitizeAgentErrorFrame`(ws.go:618-637),这是双保险,防新增错误码文案携带内部细节。

#### 验证(B 整体)
`cd frontend-user && npx tsc -b && npx vite build` + `vitest run`;手工:打开一个审计里有 Bash 失败的旧会话(如 P0-4 时段),工具卡展开应显示「命令执行环境暂不可用…」摘要,技术详情内无 bwrap/EXECUTOR/容器路径。

**风险/回滚**:`sanitizeOpsText` 的泛化 SCREAMING_SNAKE 正则可能误伤合法学术缩写(如统计量 `ANOVA_F`)——仅作用于 error 详情折叠(默认收起),影响面极小;误伤严重可摘掉泛化行只留显式前缀。回滚 = revert,组件改动无状态迁移。

### P0-C 挂死轮前端提示 + 重试(约 4.5h)

#### C1. `features/claw/hooks/useClawConversation.ts` — 轮内无进展看门狗(1h)

调研确认盲区:连接级 45s 看门狗被 pong 永远喂活(useAgentSocket.ts:309),「送达后挂死」无任何 UI。加轮内 stall 信号:

```ts
const STALL_WARN_MS = 90_000;
const [stalled, setStalled] = useState(false);
// 只认「内容帧」——pong/connected/user_ack 不算进展(否则 25s 心跳永远重置,永不触发,重蹈连接级看门狗覆辙)
const contentFrameSeqRef = useRef(0);
// 在现有消费 socket.messages 的路径里:末元素若非 pong/connected/user_ack → contentFrameSeqRef.current++
useEffect(() => {
  if (!busy) { setStalled(false); return; }
  setStalled(false);
  const t = window.setTimeout(() => setStalled(true), STALL_WARN_MS);
  return () => window.clearTimeout(t);
}, [busy, contentFrameSeq]);  // contentFrameSeq = 上面 ref 落到 state 的单调计数
```

返回值暴露 `stalled`。注意:长 Bash(最长 300s)执行期本就无新帧,90s 触发是**预期的软提示**而非误报——文案按此设计(见 C2),不做任何自动杀轮(杀轮是 W3 backend 轮级硬超时的职责)。

#### C2. 新组件 `shared/components/chat/StallNotice.tsx` + 挂载(1.5h)

```tsx
export function StallNotice({ onStop, onDismiss }: { onStop: () => void; onDismiss: () => void }) {
  return (
    <div className="rounded-md border border-brand-amber/30 bg-warning-soft px-3 py-2.5 text-xs">
      <p className="font-medium text-foreground">这一轮已较长时间没有新进展</p>
      <p className="text-muted-foreground">复杂任务可能仍在执行;如不想继续等待,可停止本轮后重新发送。</p>
      <div className="mt-1.5 flex gap-2">
        <Button size="sm" variant="outline" onClick={onStop}>停止本轮</Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>继续等待</Button>
      </div>
    </div>
  );
}
```

挂载:`features/claw/components/chat/ConversationWorkspace.tsx`(:282-299 错误横幅同一区域)`{stalled && busy && <StallNotice onStop={handleStop} onDismiss={dismissStall} />}`;`dismissStall` = setStalled(false) 并重挂 90s 计时。移动端 MobileClawPage 同点挂载。

**对照审计**:848s/624s 挂死轮期间前端无限转圈「正在执行命令…」、用户消息被吞无任何出口——此提示给出逃生口(handleStop 已加固为永远有效,useClawConversation.ts:503-521)。

#### C3. 失败轮「重试」动作(2h)

1. `shared/types/chat.ts` `Turn` 加 `errorCode?: string;`
2. `features/claw/components/chat/fold.ts:147-154` error case 加 `current.errorCode = msg.code;`(smart-search / prism fold 同步);
3. `shared/components/chat/TurnErrorNotice.tsx` 加可选 `onRetry?: () => void`,有则渲染「重试」按钮;
4. `MessageTurn.tsx:276` 传入:仅当该轮是**最后一轮**、`turn.errorCode` ∈ 可重试集(`upstream_lost` / `agent_unavailable` / `connection_interrupted` / `busy` / `turn_timeout`,最后者对接 W3 的轮级硬超时帧)且父层给了 `onRetryTurn`;
5. `useClawConversation.ts` 暴露 `handleRetryTurn`:守卫 `!busy`;若 `lastSubmitRef.current?.text === turn.userText` 则带附件/引用重发,否则仅重发 `turn.userText`(复用现有 handleSubmit 全链路:懒新建、ack 看门狗、配额拦截都自然生效)。

**错误码→文案映射**:在 `friendly-tool-error.ts` 加 `friendlyTurnError(code, message)`:`turn_timeout` →「本轮处理超时,已自动停止,可点击重试。」;未知 code 用 backend 下发的 message(已净化)。TurnErrorNotice 优先映射文案。

**历史回放降级**:调研 §2-7 确认 error 轮现状不入 history → 回放无 `errorCode` → 无重试按钮,纯降级不报错(error entry 持久化属 W3 范围,W5 的 fold case 写法已为其预留:后端将来折出 error entry 时此处只需加 history case)。

#### 验证(C 整体)
临时把 `STALL_WARN_MS` 调 10s,发一条让模型 `Bash sleep 60` 的消息 → 10s 后出现 StallNotice,点「停止本轮」正常收口;`docker pause scholar_agent` 触发 upstream_lost → 错误轮出现「重试」按钮,点击后原文重发成新轮。`tsc -b && vite build`。

**风险/回滚**:重试不恢复附件语义(附件文件已在会话 cwd,重发纯文本时模型仍可 @ 到)——可接受;stalled 状态误报仅是软提示无破坏动作。回滚 = revert。

---

## P1(合计约 4.5h)

### P1-D 等待体验强化(约 4h)

#### D1. `features/claw/components/chat/fold.ts:127-133` — 不再丢弃 status.elapsed(0.5h)

```ts
case 'status':
  current.placeholder = {
    ...(current.placeholder ?? {}),
    state: msg.state, verb: msg.verb,
    elapsedSeconds: typeof msg.elapsed === 'number' ? msg.elapsed : current.placeholder?.elapsedSeconds,
  };
```

调研 §3 已确认这是最短路径:`TurnPlaceholder.elapsedSeconds`(chat.ts:66-67)类型已预留、从未填充。smart-search / prism fold 同步。

#### D2. `shared/components/chat/StreamingIndicator.tsx` — 等待计时 + 长等待轮换文案(1.5h)

```tsx
export function StreamingIndicator({ turn }: StreamingIndicatorProps) {
  // 本地计时:组件仅在等待期挂载,mount 即等待起点;placeholder.elapsedSeconds(D1)优先。
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => { const t = setInterval(() => setTick(v => v + 1), 1000); return () => clearInterval(t); }, []);
  const localSec = Math.floor((Date.now() - startRef.current) / 1000);
  const sec = turn.placeholder?.elapsedSeconds ?? localSec;
  const text = streamingText(turn);
  return (
    <div className="…现有胶囊样式">
      <Sparkles … />
      {sec >= 20
        ? <CyclingHint hints={[text, '复杂任务处理中,通常需要几分钟', '仍在推进,可随时停止']} className="…" />
        : <span className="…">{text}</span>}
      {sec >= 5 && <span className="text-2xs text-faint shrink-0">{formatWait(sec)}</span>}
      <span className="chat-thinking-dots shrink-0" />
    </div>
  );
}
```

`CyclingHint` 是现成组件(调研 §3:claw 未用,可直接接)。**为什么解决问题**:审计「等待不可见」的体感 = 静态胶囊无任何时间推进感;计时 + 轮换文案是零后端成本的最大改善。注意 MessageTurn 是 memo,但流式轮引用每帧都变,indicator 正常重渲染;计时器自驱动 tick 覆盖无帧间隙。

#### D3. `shared/components/chat/ThinkingFold.tsx` — 思考中实时计时(1h)

现状只有**完成后**显示「已思考 N 秒」(:48-57)。加流式中的实时秒数:

```tsx
const [liveSec, setLiveSec] = useState(0);
useEffect(() => {
  if (!isActive) return;
  const t = setInterval(() => {
    if (startRef.current) setLiveSec(Math.floor((Date.now() - startRef.current) / 1000));
  }, 1000);
  return () => clearInterval(t);
}, [isActive]);
// header 文案(:97-108):
{isActive ? <>思考中{liveSec >= 3 && ` · ${liveSec} 秒`}<span className="chat-thinking-dots ml-0.5" /></> : …}
```

52% 轮思考>正文的会话里,思考期是最长的等待段;实时秒数 + 现有的流式展开滚动跟随一起,把「黑盒等待」变成「可见推进」。历史回放 isActive 恒 false,现有降级(「思考过程」)不动。

#### D4. `shared/components/chat/ToolCallBlock.tsx` — 长工具运行计时(1h)

pending 态(:147 spinner 处)同款本地计时,`>=8s` 时 spinner 旁加 `<span className="text-2xs text-faint">已运行 {sec}s</span>`(计时器仅 pending 时挂,拿到 result 卸载)。覆盖 Bash / ExportDocument / BuildDeck 这类长工具的执行段——正是审计挂死轮的临界区,让用户在 StallNotice 出现前就有进度感。

#### 验证(D 整体)
`tsc -b && vite build`;手工发一条触发长思考的消息(deepseek 长推理),观察:思考头实时计秒、indicator 5s 后出现计时、20s 后文案轮换;历史回放无计时、无报错。

**风险/回滚**:每秒 setState 仅发生在「当前流式轮」的 1-3 个组件上,长会话历史轮全被 memo 跳过(MessageTurn.tsx:97-99),无性能风险;回滚 = revert。

### P1-E prompt 条文(0.5h)

**为什么必须有这一条**:防线 1/2 保证用户在**工具卡**里看不到运维原文,但模型收到全量错误后会把 `bwrap`、`EXECUTOR_SANDBOX_MODE` **复述进正文**(审计 P1-12 部分样本即此形态)、并虚构补救(P1-13「用 Word 打开 .md 自动保留格式」)。正文层关键词打码误伤率高(`stripContainerPaths` 刻意只处理无歧义路径),故正文只能 prompt 治理。

**位置**:`agent/src/turn/turnLoop.ts` 系统级 appendSystemPrompt 组装处(与 langLine 同级,系统级注入不可被会话 prompt 覆盖;一处覆盖 claw/smart-search/prism)。**条文(中文原文)**:

> 【工具报错处理铁律】工具执行失败时,错误文本(含路径、环境变量、沙箱/运维词汇、修复指引)只供你内部调整策略,严禁向用户复述错误原文或任何内部环境细节。向用户只说三件事:哪一步没有成功、对本次结果的影响、你接下来改用什么办法(或需要用户提供什么)。严禁向用户虚构不存在的补救方法(例如声称"用 Word 直接打开 .md 会自动保留格式"——这是错误的);不确定的补救办法就不要说。

改完 `docker-compose restart scholar_agent`(铁律:改 agent prompt 需重启)。验证:构造 Bash 失败,检查正文只描述影响与替代方案,不含 bwrap/env 词。回滚:删该段重启。

---

## 排期汇总

| 项 | 内容 | 工时 | 依赖 |
|---|---|---|---|
| P0-A | agent 双轨(registry/runTools)+ backend FoldToMessages 一行 | 4h | 无 |
| P0-B | friendly-tool-error.ts + ToolCallBlock 改造 + 三 fold/历史透传 | 5h | A 可并行(B 兜底独立生效) |
| P0-C | stall 看门狗 + StallNotice + errorCode/重试 | 4.5h | 无;`turn_timeout` 文案对接 W3 |
| P1-D | status.elapsed 透传 + 三组件计时/轮换文案 | 4h | 无 |
| P1-E | prompt 条文 + restart agent | 0.5h | 无 |

部署顺序建议:B(前端兜底,立即止血旧历史泄漏)→ A(源头双轨)→ C → D → E。B 先上的意义:**即使 A 未发布,前端对已知运维关键词的打码已覆盖全部存量会话的历史回放**——这正是「即使 agent 层漏了,前端兜底」的验收标准。