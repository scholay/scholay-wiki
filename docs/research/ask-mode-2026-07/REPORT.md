# Ask 交互提问模式 — 技术调研报告

> 2026-07-22 · 调研方法:5 路并行深读(agent 容器 / agentbridge / 前端 / 横切面 / 业界)共 60 子代理,
> 产出 88 条结论,其中 54 条承重结论逐条对抗复核(35 确认 / 19 部分修正 / 1 未跑完),
> 关键缝隙(permission 回路、并发槽、wind-down)另经主线人工二次核读。

---

## 0. 一页结论

**要补的能力**:agent 在需要用户拍板时,不再只输出一段"请问你想要哪种?"的纯文本,而是发出
**结构化问题卡片**(1-4 题、每题 2-4 个选项、支持多选、永远允许自由输入),用户点选即回传,
agent 接着干活 —— 即 Claude Code `AskUserQuestion` 的同款体验。

**拍板建议:方案 B「工具形态 + 优雅终轮 + 回答=新 user_message」**,而不是照抄 Claude Code 的
「turn 内阻塞等待」:

- 问题以内建工具 `AskUserQuestion` 的 `tool_use` 形态发出(前端据此渲染卡片);
- 工具**不阻塞**,立即返回"问题已呈现给用户"的 tool_result,随后复用现成的 wind-down 机器
  (去工具 + 收尾指令)让模型优雅结束本轮;
- 用户点选后,前端把答案组装成一条**普通 user_message** 发出,开启新一轮。

**为什么不选阻塞式(方案 A)**——四条本仓库的硬证据:

| # | 硬约束 | 证据 |
|---|--------|------|
| 1 | 整个 agent 容器只有 **2 个并发 turn 槽**(1.5G 内存标定),阻塞等答案 = 占槽;两个用户同时挂起提问即饿死全容器六个 feature | `agent/src/server/admission.ts:14` |
| 2 | 等待态挂在**连接对象**上(`ws.data.pending`),WS 重建即丢;且最后一个 tab 离开 3 分钟后 hubGracePeriod 优雅关闭会杀掉等待 | `agent/src/server/ws.ts:262-279`、`hub.go:664-686` |
| 3 | stop 信号**不打断**阻塞中的等待 Promise(未接 AbortSignal),用户点停止要空等超时 | `agent/src/server/ws.ts:262-279`、`turnLoop.ts:155` |
| 4 | turn 挂起期间 busy 锁生效:Composer 全程置灰、任何 user_message 被 executor(`error{code:busy}`)与 hub(轮锁)双层拒掉;小程序等独立客户端会卡"回答中" | `agent/src/server/ws.ts:225-228`、`hub.go` beginTurn |

而方案 B 的每一步都踩在现成设施上:tool_use 自动落 journal(历史/刷新/admin 监控免费同构)、
回答走 user_message 自动获得 user_echo 多端扇出、终轮后无任何挂起状态(天然耐断连、耐小程序
旧版本)、超时栈 / nginx / 并发槽 / busy 锁全部**零改动**。

**改动量级**:agent 容器 1 个新工具 + turnLoop 一处收尾闸;backend 2 处放行 + 3 处 feature 开关;
前端 1 个卡片组件 + 各 fold 按 toolName 分支;提示词层正面模板。预计 P0 一周内可落地。

---

## 1. 业界对标:两大范式已收敛

### 1.1 范式矩阵

| 产品/规范 | 范式 | 形态 | 关键设计 |
|-----------|------|------|----------|
| **Claude Code** `AskUserQuestion` | A 阻塞式 tool call | 1-4 题 × 2-4 选项卡片 | header≤12 字符、multiSelect、UI 永远附加 Other 自由输入、可选 preview 副视图;答案经 `updatedInput.answers`(题目文本→选中 label)回注,turn 不断 |
| **MCP elicitation**(2025-06-18 规范) | A(协议标准化) | `elicitation/create` + 扁平 schema 表单 | 刻意只允许扁平 object + 原始类型(string/number/boolean/enum);**accept / decline / cancel 三态**语义分离;2025-11-25 又加 URL mode(敏感凭据禁走表单) |
| **Gemini CLI** `ask_user`(PR #17411) | A | 1-4 题,题带显式 `type: choice\|text\|yesno` | header≤16 字符;multiSelect 自动加"All the above";答案按题目下标 JSON 回注;允许 dismiss |
| **Cline/Roo** `ask_followup_question` | A | 每次只问 **1** 题 + 2-4 个完整答案建议 | 建议必须是"无占位符的完整答案"(可点选可编辑);Roo 独有:可配置超时(默认 60s)自动选第一项 —— 无人值守不卡死的成熟方案 |
| **Manus**(泄露 prompt) | A | 双工具分离 | `message_notify_user`(非阻塞进度)与 `message_ask_user`(阻塞必答)分开;规则:"reserve ask for only essential needs" |
| **ChatGPT 深度研究** | B 终轮式 | 纯聊天消息问 2-5 个澄清问题 | 前置 clarifier 模型;无结构化控件;答完给可编辑研究计划再开跑 |
| **Devin 2.1** | B | 信心分门控 | 自评 🟢🟡🔴,非绿才主动问 —— "该不该问"由置信度决定而非流程 |
| **Cursor Plan Mode** | B | 计划阶段聊天内澄清 | agent 模式默认不主动问(社区有功能请求佐证) |
| **OpenAI Agents SDK** | C 中断+序列化 | `needsApproval` → `interruptions[]` → `RunState` 序列化进 DB → 恢复续跑 | **无挂起连接**,官方明确支持跨小时/天的审批 —— 对 Web 断连场景参考价值最高 |

### 1.2 对我们最有用的五条业界经验

1. **Claude Code 的 schema 就是事实标准**,直接采用可少走弯路:`questions[1-4]`,每题
   `{question, header(≤12字), options[2-4]{label, description}, multiSelect}`;推荐项放第一位、
   label 末尾加"(推荐)";UI 层永远附加自由输入,回注时用用户原文而非字面 "Other"。
2. **防过度提问全靠 prompt 措辞**(各家一致),Claude Code 原文:"仅当被一个真正属于用户的
   决策阻塞、且无法从请求/代码/合理默认值解决时才用";并明令**禁止**用它问"计划可以吗/要继续吗"。
3. **阻塞式的断连难题连 Claude Code 自己都要靠 defer + 持久化 session 兜**(进程退出、之后从
   持久化会话恢复)——官方承认长离线下"挂起 Promise"不可依赖;其 SDK 非交互场景还暴露过
   "空答案自动完成"的 bug(#30983)。这佐证了我们不照抄阻塞式的判断。
4. **MCP elicitation 的三态**(accept / decline / cancel)值得借鉴:"明确拒绝回答"与"关掉卡片
   没回答"是两种语义,模型应区别对待。
5. **Roo 的超时自动选第一项**(可配置,用户开始交互即取消倒计时)是 A 范式下无人值守的
   成熟兜底;我们选 B 后该问题自然消失,但 server-side(审稿)场景仍需同思路的 denylist 兜底。

---

## 2. 现状解剖:我们的栈已经有八成地基

### 2.1 现成的"轮内阻塞等外部裁决"血缘模板

harness 已有完整的 `permission_request → permission_response` 回路,这是 Ask 最近的血缘:

- **executor 侧**:`runTools.ts:49-57` 每个工具执行前 `await sink.requestPermission(...)` 真阻塞;
  `ws.ts:262-279` 把 resolve 存进 per-连接 `ws.data.pending` Map,120s 超时默认拒
  (`EXECUTOR_PERMISSION_TIMEOUT_MS`);`ws.ts:93-101` 收 `permission_response` 兑现。
- **backend 侧**:两个裁决点 —— 交互路径 `hub.go:835-847`(PermissionAuto 下 `decidePermission`
  自动裁决回写,帧仍广播前端并落 journal `EvPermissionRequest`);server-side 路径
  `ws_serverside.go:256-265`(无条件 auto,不经 hub)。
- **模式开关已预留**:`spec.go:100-107` 定义 `PermissionAuto | PermissionPassthrough`;
  生产 6 个 feature 全是 Auto,仅 claw 有 `CLAW_PERMISSION_PASSTHROUGH=1` 环境开关(已接线,
  即自研版 canUseTool 人审通道,生产未启用)。

### 2.2 关键机制地图(与 Ask 设计直接相关)

| 机制 | 现状 | 对 Ask 的含义 |
|------|------|----------------|
| WS 帧目录 | agent→client 17 种 / client→agent 8 种,**无 schema、未知帧静默丢弃**(`ws.ts:86-202` switch default return) | 新帧类型对旧客户端天然无害;但也意味着忘加 case = 静默丢失 |
| 浏览器→agent 帧闸 | 黑名单制:只拦 `seed_history`/`extract_memory` + 注入面字段(`ws.go:522-555`) | 新控制帧零改动可通;但 user_message 在 inFlight 时被双层 busy 锁拒 |
| durable 真源 | 双白名单:`classifyJournalEv`(`hub.go:1343-1368`,决定入 `agent_turn_events`)+ `FoldToMessages`(`eventlog_store.go:202-328`,决定重建历史);**tool_use/tool_result 两处都已在名单**(EvToolUse/EvToolResult) | 问题若以 tool_use 形态落地,**journal/历史回放/admin 监控全部免费**;若发明新帧型则两张白名单+前端回放三处都要加 |
| fold 同构铁律 | 3 份实时 fold(claw 的一份同时服务 claw/sci-draw/boltslides 三模式;prism;smart-search)+ shared 唯一回放 `replayHistoryAsTurns`(`agent-history.ts:129-298`),产出同一 `Turn[]` 模型;另有第 4 消费方 admin `AdminTranscriptView.tsx:288` | 工具形态 = fold 已有 tool_use 通用处理,只需渲染层按 toolName 分支;新帧形态 = 每份 fold + 回放 + 类型全要加 case |
| 多端同步 | agent 帧经 sessionHub 广播所有 tab;user_message 有 `user_echo` 回声扇出;**控制帧(permission_response 类)无回声、不落 journal** | 回答走 user_message = 多端收敛免费;走控制帧 = 要自己补 answer_echo + journal 写点 |
| busy 锁 | executor `inFlight` 即回 `error{code:busy}`(`ws.ts:225-228`)+ hub beginTurn 轮锁 | turn 不结束,用户就没法打字 —— 阻塞式下 Composer 全程置灰 |
| 并发槽 | **全容器 2 个 turn 槽**,满即拒不排队(`admission.ts:14`) | 阻塞等待 = 占槽,这是方案 A 的死刑证据 |
| 超时栈 | nginx WS 86400s(仅 smart-search/prism/claw 三路由,boltslides/sci_draw 落 60s 通用超时靠 25s ping 双源续命)· hub↔agent 60s 读 deadline+25s ping · 前端 10min · turn 无 wall-clock(纯 token 口径,等待不烧预算) | 方案 B 下终轮即散,全部零改动;若未来给 boltslides/sci_draw 加 Ask 需同步扩 nginx regex(`user.conf:49`) |
| wind-down 机器 | 预算越线后"去全部工具 + 注入收尾指令"让模型自己优雅收尾(`turnLoop.ts:47,105,172-187`) | **提问后强制收轮直接复用这套机器** |
| 权限墙 | `permissionAllowed` default **deny**(`ws.go:282,340-342`) | 新工具不加放行 case = 全线 DOA,必改 |
| server-side | peerreview 走 `ws_serverside.go` 自扮 WS 客户端,读循环 switch 无 default 静默丢未知帧,30min BackgroundJob ctx | 模型在无人值守场景提问必须系统性禁止(denylist),纯文本反问靠任务式 prompt 兜 |
| 无状态 turn | messages[] 由 backend 喂,executor 不自持久化(`types.ts:1-5`);内建工具拿不到 EventSink(`registry.ts:14-21` ToolCtx 仅 workDir/allowBash/net/addDirs) | Ask 工具需要 turnLoop/runTools 层特判(有 permission 先例),不能做成普通 builtin 的 run() |
| 交互卡片先例 | quota blocked 卡(本地回调)、prism ChangesetCard(HTTP)、ModelSelector(`set_runtime_config` 点选→WS→agent,后端校验重组) | "chat 内点选→回传"的 UI pattern 成熟;`MessageTurn` 按 toolName 分支渲染是 smart-search 已有做法(`AssistantTurn.tsx:100-125`),**不要用** ToolCallBlock 的 `renderResultPreview` 插槽(双重门控:有 result 才渲染 + 默认收起,待答态根本不显示) |
| 客户端矩阵 | 移动端 Web 与桌面共用同一份 MessageTurn/Composer(页面级 props 接线两处);**小程序是独立复刻的客户端**(自有 socket/fold/busy 两态机) | Web 一份实现覆盖桌面+移动;小程序单独排期,B 方案下旧版小程序优雅降级(问题显示为工具块+文本,用户可直接打字回答) |

### 2.3 全栈现状:没有任何 ask/elicitation/plan-mode 设施

agent 是 clean-room 自研 harness,直接用 raw `@anthropic-ai/sdk ^0.80.0`(非 claude-agent-sdk,
`package.json:6` 明示),没有 SDK 自带的 AskUserQuestion/canUseTool 可借用;全栈 grep
`ask.?user|elicit|plan.?mode` 零命中。一切自建 —— 但如上表所示,构件齐全。

---

## 3. 三方案对比与拍板

| 维度 | A 阻塞式 tool call(Claude Code 同款) | **B 工具形态+终轮+回答=user_message(推荐)** | C OpenAI 式序列化中断 |
|------|------|------|------|
| 上下文连续性 | ★ 最好(答案=tool_result,turn 不断) | 好(问题 tool_use + "已呈现" tool_result + 答案 user_message 全在 history,模型无缝接上) | 好 |
| 并发槽占用 | **占槽直到回答**(致命,全容器 2 槽) | 零(终轮即还槽) | 零 |
| 断连/刷新/隔天回来 | 要自建会话级 pending + 恢复(CC 官方都靠 defer+持久化) | 免费(无挂起状态;卡片从 journal 回放) | 免费但要新建整套 RunState 序列化 |
| 多端同步 | 要自补 answer_echo 回声帧 | 免费(user_echo 已有) | 要自建 |
| busy 锁/Composer | 全程置灰,用户不能打字;要改 busy 语义放行"打字即自由回答" | Composer 正常可用,打字=自由回答天然成立 | 正常 |
| stop 交互 | 要把 AbortSignal 接进等待 Promise | 无特殊处理(turn 已结束) | 无 |
| 超时策略 | 必须设计(120s 太短;无限等又撞 3min hubGracePeriod) | 不存在此问题 | 不存在 |
| journal/历史/admin | tool_use/result 免费;pending 态恢复要额外做 | **全部免费** | 全新表结构 |
| 小程序旧版 | 卡"回答中"直到发版 | 优雅降级(工具块+文本,可打字回答) | — |
| server-side 兜底 | 要自动应答逻辑 | denylist 即可(即使漏禁,工具返回后正常终轮,不挂死) | — |
| 计费/配额 | 免费(轮内) | 回答开新轮=正常 token 消耗,现有 vip 日额度天然覆盖,无需豁免逻辑 | — |
| 改动量 | 大(等待生命周期管理是本质复杂度) | **小(全踩现成设施)** | 最大 |

**拍板:B。** 三路代码深读的 openQuestions 独立收敛到同一判断("B 与现有耐久/busy-lock/journal
架构阻抗小得多"、"建议与并发槽=2 一起权衡")。A 范式在 CLI 单用户场景(Claude Code、Gemini CLI)
是对的,因为那里没有多租户并发槽、没有断连、进程就是会话;我们是多租户 Web + WS 桥接 + 独立
小程序客户端,B 的"零挂起状态"价值压倒 A 的"轮内连续性"——且 B 通过 history 仍保留了足够的
上下文连续性(这正是 ChatGPT/Devin 的站位)。

---

## 4. 推荐方案详设

### 4.1 端到端时序

```
模型:调用 AskUserQuestion{questions:[...]}
  │
executor(turnLoop/runTools 特判):
  ① 正常发 tool_use_complete 帧(前端据此渲染问题卡片)
  ② 工具立即返回 tool_result:"问题已呈现给用户,等待其回答;请立即简短收尾结束本轮"
  ③ 置 askFired 标志 → 下一 round 复用 wind-down:tools=[] + 收尾指令
  ④ 模型输出一句自然收尾("选好告诉我~")→ end_turn → message_complete
  │        (tool_use/tool_result 已自动落 journal:EvToolUse/EvToolResult)
  │
前端:
  ⑤ fold 出的 ToolBlock(name=AskUserQuestion)由 MessageTurn 按 toolName 分支
     渲染成 QuestionCard(读 block.input.questions)
  ⑥ 可作答判定:卡片属于最后一轮 && 其后无任何 user 消息 → 可交互;否则只读展示已答态
  ⑦ 用户点选(或点"自己说"自由输入)→ 组装成可读的 user_message 文本发送(普通发送链路)
  │        (user_echo 自动扇出其他端;其他端按⑥规则自动变只读)
  │
backend:answer 就是普通 user_message —— BeginTurn/journal/配额/记忆链路零特判
  │
模型:新一轮,history 里看到 问题(tool_use)→"已呈现"(tool_result)→ 用户答案,继续干活
```

### 4.2 工具 schema(采用 Claude Code 事实标准,首期砍 preview)

```jsonc
{
  "name": "AskUserQuestion",
  "input_schema": {
    "questions": [ // 1-4 题
      {
        "question": "完整问题文本(中文,以问号结尾)",
        "header": "≤12 字符短标签(如「部署方式」)",
        "multiSelect": false,
        "options": [ // 2-4 个
          { "label": "选项文本(1-8 词;推荐项放第一位并标「(推荐)」)",
            "description": "该选项的含义/代价说明" }
        ]
      }
    ]
  }
}
```

答案回传格式(前端组装、人类可读、模型好解析,不需要新协议):

```
关于「部署方式」:我选择 Docker 单机(推荐)
关于「数据库」:我选择 MySQL、Redis        ← multiSelect 逗号连接
关于「域名」:自定义回答 —— 先用 IP 直连,域名下周再说   ← 自由输入用用户原文
```

### 4.3 改动清单(file:line 级)

**agent 容器(核心)**
| 位置 | 改动 |
|------|------|
| `agent/src/tools/registry.ts:818` | 注册 `AskUserQuestion`(schema 如上;`run()` 本体是哑的,真正逻辑在下两行) |
| `agent/src/turn/runTools.ts` | `runOne` 对 `AskUserQuestion` 特判:跳过沙箱执行,直接产出"已呈现"tool_result(参考 permission 特判的位置);同轮并发工具照常执行 |
| `agent/src/turn/turnLoop.ts:172-187` | 增加 `askFired` 闸:本轮出现过 AskUserQuestion → 下一 round 走 wind-down 同款(tools=[] + 收尾指令),防模型问完不收手继续跑 24 轮 |
| `agent/src/server/shadowTurn.ts:96-98` | shadow sink 对 ask 无需改(工具不阻塞),但可加注释标记 |

**backend(放行 + 开关)**
| 位置 | 改动 |
|------|------|
| `backend/internal/agentbridge/ws.go:282-342` | `permissionAllowed` 加 `AskUserQuestion` 放行 case(default deny,不加即 DOA) |
| `backend/internal/peerreview/service.go:1833` | `scoringSessionDeny` 加 `AskUserQuestion` |
| `backend/internal/peerreview/service.go:609` | 方法论会话**现在就没传 DisallowedTools(存量缺口)**,补传并含 AskUserQuestion |
| `backend/internal/boltslides/spec.go:112`、`scidraw/spec.go:115` | 显式决策:首期建议也加入 deny(见 §5 分期),否则会随权限放行静默放开 |
| 提示词层 | `internal/prompts/claw.go` 等 + turnLoop 静态行:正面模板(见 4.4) |

**前端(一份实现覆盖桌面+移动 Web)**
| 位置 | 改动 |
|------|------|
| `shared/components/chat/` 新增 `QuestionCard.tsx` | 读 `block.input.questions` 渲染;单选/多选/自由输入;已答态只读展示 |
| `MessageTurn` 调用点(桌面 `ConversationWorkspace.tsx:301` / 移动 `MobileClawPage.tsx:234`) | 按 `toolName === 'AskUserQuestion'` 分支渲染 QuestionCard 为 ToolCallBlock 兄弟节点(照抄 smart-search `AssistantTurn.tsx:100-125` 模式);回调接线两处各一份(移动端不复用 Workspace 外壳,已知分叉点) |
| 各实时 fold | **零改动**(tool_use 通用链路已覆盖);回放 `agent-history.ts` 同理零改动 |
| 可作答判定 | 纯前端规则:卡片在最后一轮且其后无 user 消息;user_echo 到达自动翻只读 —— 无需新状态同步协议 |
| prism | busy 是独立状态机(`usePrismChat.ts:661` roundState),QuestionCard 接入时单独接线 |

**小程序(独立排期,可后置)**
- 旧版本优雅降级:未知工具块 + 模型收尾文本("请从以上选项中选择…"),用户直接打字回答,链路完全可用;
- 新版本再实现原生卡片(独立 fold/组件复刻,参考 `miniprogram/pages/claw/` 现有模式)。

### 4.4 提示词层(本仓库铁律:正面模板,不写否定式禁令)

三层注入点已定型(hub 首条前缀 / turnLoop 每轮 system 组装点 `turnLoop.ts:103-104` /
addDirs skill),建议:

1. **通用一行**进 turnLoop 静态行(保 prompt cache):"当你被一个只有用户能拍板的决策卡住
   (需求二选一、偏好、风险取舍)时,用 AskUserQuestion 工具出结构化选项让用户点选,
   然后简短收尾等待回答。"
2. **per-feature 正面模板**进 `internal/prompts/*.go`:给 2-3 个"好问题"完整示例
   (什么时机、题干怎么写、选项怎么给、推荐项标注),仿 claw-add topic-selection SKILL
   已有的"先问清约束"先例。
3. **反过度提问**采用 Claude Code 措辞:"仅当无法从请求、上下文、合理默认值解决时才问;
   有常规默认值的选择,选默认值并在回复中说明即可,不要问。"
4. server-side(peerreview)prompt 已是任务式,叠加 denylist 双保险后,纯文本反问的残余
   风险由 JSON 有界重试链路自然兜住(反问不是合法 JSON → 重试)。

---

## 5. 分期落地

**P0(核心闭环,claw 单 feature 先行)**
- agent:工具注册 + runTools 特判 + askFired 收尾闸
- backend:permissionAllowed 放行 + peerreview 双处 deny(含 609 存量缺口)+ boltslides/scidraw 暂 deny
- 前端:QuestionCard + MessageTurn 分支 + 可作答规则(桌面+移动 Web)
- 提示词:claw 正面模板 + turnLoop 通用行
- 验证:提问→点选→续答全链路;刷新/换端后卡片回放与只读态;admin 会话监控可见

**P1(铺开与打磨)**
- smart-search / prism 接入(prism 注意独立 busy 状态机接线)
- multiSelect、"自己说"自由输入的 UX 细化;已答态在卡片上高亮所选项
- 决策记录:用户点"忽略此问题"(MCP 三态里的 decline/cancel 区分)→ 发送"(用户跳过了该问题,请按你的最佳判断继续)"

**P2(生态)**
- 小程序原生卡片
- boltslides / sci_draw 纳入(同批扩 nginx WS 长超时 regex,`user.conf:49`)
- 若未来某 feature 确需轮内阻塞(如高危操作人审),再启用已预留的 PermissionPassthrough 轴,
  彼时并发槽需同步扩容(`EXECUTOR_MAX_CONCURRENT_TURNS` + compose 内存)

---

## 6. 风险与开放问题(需产品拍板)

1. **模型问完不收手**:askFired 闸挡住工具,但模型仍可能长篇大论。收尾指令措辞需实测调优
   (wind-down 已有成功先例)。
2. **用户不点卡片、直接打字**:B 方案下天然合法(就是普通消息),模型能从 history 对上;
   卡片按规则翻只读。无需处理,但 UX 上可在卡片加"直接输入也可以"提示。
3. **连续追问体验**:B 是"一问一轮",模型每轮都要重新读 history 接上下文 —— 现架构本就是
   无状态 messages[],无额外成本;但产品上应引导模型**一次问全**(schema 支持 1-4 题正是为此)。
4. **配额观感**:回答会开新轮、烧 token(vip 日额度 token 口径,天然覆盖,无按条计数问题)。
   若未来引入按条计数,需给 answer 豁免。
5. **提问频率**:防打扰靠 prompt(业界一致结论)。建议上线后经 admin 会话监控抽样"提问轮占比",
   数据驱动调措辞。
6. **未复核残留**:54 条承重结论有 1 条(policy-ops 最后一条)因子代理限额未跑完对抗复核,
   内容是"ask 帧透传/journal 白名单现成"——该结论已被其他 3 条已确认结论交叉覆盖,风险极低。

---

## 7. 主要证据索引

- 阻塞回路:`agent/src/turn/runTools.ts:49-57` · `agent/src/server/ws.ts:54,93-101,262-279,388-394`
- 权限裁决:`backend/internal/agentbridge/hub.go:835-847` · `ws.go:224-342` · `ws_serverside.go:256-265` · `spec.go:100-107`
- 并发槽:`agent/src/server/admission.ts:14`(MAX_CONCURRENT_TURNS=2)
- wind-down 先例:`agent/src/turn/turnLoop.ts:47,105,172-187`
- journal 双白名单:`hub.go:1343-1368`(classifyJournalEv)· `eventlog_store.go:202-328`(FoldToMessages)
- fold 同构:`frontend-user/src/shared/lib/agent-history.ts:129-298` + 3 份实时 fold + `AdminTranscriptView.tsx:288`
- busy 双锁:`agent/src/server/ws.ts:225-228` · hub beginTurn
- 帧闸:`backend/internal/agentbridge/ws.go:522-555`(browserFrameForwardable)
- 业界:Claude Code user-input 文档 · MCP elicitation 2025-06-18/2025-11-25 · Gemini CLI PR#17411 · Roo followupAutoApproveTimeoutMs · OpenAI Agents SDK HITL · Manus 泄露 prompt · Devin 2.1 博客
