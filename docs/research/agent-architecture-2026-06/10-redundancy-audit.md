> 维度文档 · CLI→Web 冗余审计(可达性对抗式验证)· 2026-06-14
> 触发:在 P0 + 记忆 + C3/C14/C2/C13 优化落地后,审计「桌面 CLI 改 Web」残留的冗余设计。
> 方法:5 个扫描器找候选 → 5 个对抗式复核器逐条验可达性(默认存疑即「有用」)。

# CLI→Web 冗余审计:真冗余 vs 看着像冗余其实有用

## 0. 判定准则(你的问题的核心)

**「有用」就不算冗余。** 一个设计即使看着重复/像桌面遗留,只要满足任一条就**不是**冗余:
1. **Web 流可达**(有调用方 / 路由可触发);
2. **服务一个目的**:纵深防御 / 可调试性 / 优雅降级 / 为未来留的接缝。

只有「**Web 流根本走不到 + 无任何调用方 + 不服务上述任一目的**」才是真冗余(死重)。

**审计的总结论**:优化之后,**真正的死重很少、且高度集中**;绝大多数「看着像冗余」的东西落在两类「有用」:
- **(A) 与 vendored CLI fork 不可分**:删它 = 改上游 fork、毁掉 cli.tsx/main.tsx 的导入图、增加 rebase 成本,而运行时收益≈0,且风险早已被 `feature()`-gate + `--disallowed-tools` 中和。
- **(B) 纵深防御 / 调试 / 降级 / 未来接缝**:按你的准则就是「有用」。

---

## 1. 真冗余(死重,可安全清理)

| # | 项 | 位置 | 为何是真冗余(证据) | 处理 |
|---|---|---|---|---|
| R1 | `localRecoveryCli.ts`(独立 readline REPL 应急 CLI) | `agent/src/localRecoveryCli.ts` + `bin/claude-haha:25-27` | 零导入方;唯一引用是 `bin/claude-haha` 里守在 `CLAUDE_CODE_FORCE_RECOVERY_CLI=1` 之后的 exec,而**该 env 全仓零赋值**(Dockerfile/compose/buildChildEnv 都不设)。Web 流恒走 `cli.tsx --print`,永不触达。 | 可删(连同那段 env 分支)。属 vendored agent,删后需 rebuild agent 镜像。 |
| R2 | `agentbridge.NewDBUsageRecorder`(把每轮 usage 落 DB 的 OnMessageComplete 钩子) | `backend/internal/agentbridge/hooks.go` | C19 后**无任何调用方**;且与现行 per-call 记账口径冲突——一旦接线就**双计**(这正是它不被接的原因)。「保留便于回退」是负资产:回退是结构性切换(先关 per-call),不是反注释一行。 | 删。顺手修 `bridge.go:55` 已漂移的注释。 |
| R3 | `agentbridge.ChainOnMessageComplete`(串联多个 OnMessageComplete) | `backend/internal/agentbridge/hooks.go` | 无调用方(与 R2 配套)。将来真要串联一行即可重写,不必留空壳。 | 删(与 R2 一起)。 |
| R4 | `(*Bridge).recordServerSideUsage`(server-side chat 落账本方法) | `backend/internal/agentbridge/ws_serverside.go` | 无调用方;注释自述「per-call 已覆盖故不调」。同 R2,「便于回退」是负资产。 | 删。`recordAgentTokens` 主路(internal_handler 回调)不受影响。 |

> R2/R3/R4 都是我们自己代码、低风险;R1 在 vendored agent 但已对抗式验证安全。

## 2. Borderline(可选简化,留着也无害)

| # | 项 | 判断 | 建议 |
|---|---|---|---|
| B1 | `FeatureSpec.AutoApprovePermission` 字段 + `EffectivePermissionMode()` 兼容回落 | 四个 feature 已全迁 `PermissionMode`,**无写入方**,技术上可删;但它是**导出公共字段**(删=API break),且 C14 刚做完属刻意短过渡 | 短期留;若删须同步清 `claw/spec.go` 那条已漂移的 `AutoApprovePermission=true` 注释 |
| B2 | `teamWatcher.start()` / `cronScheduler.start()` —— server 每次启动**无条件**起的两个桌面后台轮询(60s tick,cronScheduler 能 spawn `cli.tsx --print` 子进程) | 无输入文件时空转,不算严格冗余;但关掉能**消除两个空转 timer + 一个潜在的未沙箱化 cli.tsx spawn 面** | 把两个 `start()` 各自 gate 在其工具 feature flag 之后(或非 localhost/Web 模式跳过)。这是本审计里**最值得做的真清理** |

## 3. 看着像冗余、其实有用(不是冗余 —— 不要动)

> 这一节直接回答你的「但如何有用的就不算冗余」。下列都**像**桌面遗留/重复,但各有用途。

**(A) 与 vendored CLI fork 不可分(删=改上游、毁导入图、增 rebase 成本、运行时零收益):**
- 桌面交互骨架:`main.tsx` / `replLauncher.tsx` / `dialogLaunchers.tsx` / `interactiveHelpers.tsx` / `history.ts` / `ink.ts`(被全仓 ~431 文件静态依赖的 Ink barrel,含 headless 也加载的 tools UI 模块)。Web 运行时不执行,但都是 `main.tsx` 静态 import 的完整 CLI 必需件,**非孤立死码**。
- 桌面专属模块:`src/{bridge,buddy,coordinator,proactive,remote,ssh,voice,vim,daemon,assistant}`。`feature()`-gated 在 Web 不可达,但删它要改 vendored fork。
- `src/tools/` 里被禁用工具的实现目录(RemoteTrigger/Monitor/PushNotification/Send*/SubscribePR/ScheduleCron/Team*/PowerShell/Snip/CtxInspect…):lazy-require 根本不加载 + denylist 硬移除,已完全惰性。
- ~80 个 builtin slash 命令(server 只特判 `/clear`):其余 feature-gated、`--print` 下 no-op、不暴露给前端。删 vendored 命令表高风险。

**(B) 纵深防御 / 调试 / 降级 / 未来接缝:**
- **`DEFAULT_DISALLOWED_TOOLS` 全表** = 单一、不依赖 env 的安全网(**纵深防御**):任何 feature flag 翻转 / 上游 rebase 改了默认,deny 规则仍**硬移除**该工具。代价仅几个 argv 字符串。**绝不可**裁成「只列已注册的」——那会在配置漂移时**静默重新放出**工具。其中有「真在干活」的子集(EnterWorktree/AskUserQuestion/Brief/TaskStop/plan-mode 等已注册工具,deny 实际移除它们)。
- agent API 路由(providers 多 CRUD/presets/official/test、settings 分层、models、agents CRUD、teams/scheduled-tasks/computer-use/diagnostics/plugins…):vendored 上游桌面管理面,**internal 网 + Bearer** 已封死外部触达,删=改 fork、零收益;部分是**调试/未来接缝**。
- backend `UpsertSkill` 推 per-feature agent yaml 到 `~/.claude/agents`:**未来切 agentType 模式的接缝 + agent 容器后台看 prompt 的可调试性**;代价仅启动一次性 3 feature 幂等 upsert。(这是唯一真正可商榷的简化点:若确认永不切 agentType,可删。)
- `NewSlogUsageRecorder`:三 WS feature **唯一在用**的 usage 钩子(`docker logs | grep agent_usage` 来源),刻意只 slog 不落库以避开 per-call 双计。
- auto 模式下 `permission_request` 仍 `writeFront` 给前端:「所有帧统一转发」的自然结果,同一行服务 passthrough 的 HITL + 观测/调试;特判反增复杂度。
- `WeightedRandomPicker`:只是 picker 文档里「预留」字样,**无可删代码**(可删那句注释)。
- 两个 `skill.go`(`agent.UpsertAgent` vs `agentbridge.UpsertSkill`):client 层 vs 桥接层的**正常分层**(让 agentbridge 不依赖 circuitbreaker)。
- `admin_monitor.go`:admin 后台可达的真实会话监控功能(**运维可调试性**)。

**(C) 状态/存储 —— 无同信息双写,各司其职:**
- `jsonl`(transcript 真值)/ `agent_sessions`(DB 映射)/ `user_memory_blocks`(per-user 记忆)/ `llm_token_usage`(带 user_id 计费账本)/ `session-meta`(disallowedTools/addDirs,resume 携带)/ `liveTurnBuffers`(断线 grace 重放)/ `prompt_injected`(注入性能缓存,有回落兜底)—— **彼此职责不同,不是冗余双写**。
- title 两套(agent `session_title` vs prism `autoname.go`):prism 复用 agent 标题必然退化成同名垃圾,DB-as-truth feature 的正当例外。

## 4. ⚠️ 一个「冗余」之外、但值得记的认知风险

agent 容器**自带的桌面记忆设施**(`src/memdir/` / `context.ts:getUserContext` / `CLAUDE.md` 注入)在当前 Web 流里是**「代码路径活、但读到空」**——因为我们已用 DB 的 `user_memory_blocks` + 首条 in-band 前缀**接管**了 per-user 记忆。它**不是**该从 vendored agent 删的冗余(是 CLI 完整性 + 未来接管接缝),但**真风险是认知混淆**:有人可能以为 agent 自带记忆在生效。
**建议**:在 CLAUDE.md / agent 文档注明「**agent 自带记忆设施在 Web 流不生效(读到空);per-user 记忆真源 = `user_memory_blocks` + 首条 in-band 前缀**」。

---

## 5. 结论(回答「优化后还有冗余吗?」)

- **有,但很少且集中。** 真死重 = R1–R4(1 个 vendored CLI 应急入口 + 3 个后端弃用函数)+ 2 个可选简化(B1 弃用字段、B2 空转轮询 gate)。
- **大头不是冗余。** 「桌面 CLI 改 Web」留下的一大片「看着像冗余」的东西,要么**与 vendored fork 不可分**(删的代价 ≫ 收益,且已被 gate+denylist 中和),要么**服务纵深防御/调试/降级/未来接缝**——按你的准则就是「有用」。
- **最该做的清理**:R2/R3/R4(后端弃用函数,我们自己的代码、零风险)+ B2(gate 掉两个空转后台轮询)。R1 次之(需 rebuild agent)。B1 等 C14 过渡期过再说。
- **不要做的**:为「看着干净」去裁 vendored CLI 的桌面模块/工具表/命令表/API 路由,或把 `DEFAULT_DISALLOWED_TOOLS` 裁成「只列已注册」——前者增 rebase 债、后者破纵深防御。需要压镜像体积时,用**构建期排除**而非删源码。
