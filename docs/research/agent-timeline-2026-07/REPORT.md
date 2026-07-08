# Agent 时间线幻觉调研报告(2026-07)

> **落地状态(2026-07-08):第三节方案已全部实施并端到端验证通过。**
> 实现与报告的差异:① 额外新增了 `TodayDate` 内建工具(agent/src/tools/clock.ts + registry.ts),模型可主动查当前日期/时刻;② P0 的日期格式化没用 Intl,而是 clock.ts 手动固定 UTC+8(零环境依赖);③ 多修了一个报告没预见的卡点——backend `agentbridge/ws.go permissionAllowed` 是默认拒绝制,新 builtin 工具必须加白名单放行,否则被静默 deny。
> 验证:shadow /api/turn 实测模型调 TodayDate 答出正确日期;事故场景(Dong et al. 2026)改判「可能」并主动检索核实;cache_read_tokens 正常(天粒度未破缓存);容器 `date` 已显示 +08。

> 触发事件:AI 审稿输出「Dong et al. (2026) —— 年份不可能。2026 年尚未到来」,而今天就是 2026-07-08。
> 结论先行:**四个 agent feature(智能助手/智能文献搜索/智能审稿/智能写作)的模型上下文里没有任何一处包含当前日期**,模型只能按训练截止时间(≈2025 初)推断"现在是哪一年"——幻觉是结构性必然,不是偶发。
> 调研方式:4 路代码审计(每路各过一道对抗验证复核,文件:行号均经二次核实)+ 4 路外部调研(Anthropic/OpenAI/框架生态/学术研究)。

---

## 一、代码审计:为什么必然出现「2026 年尚未到来」

### 1.1 全链路零日期注入(四路审计一致确认)

agent 容器发给 Anthropic API 的 system 参数只有一个组装点:

```
agent/src/turn/turnLoop.ts:44-45
system = [input.appendSystemPrompt, skillCtx].filter(...).join("\n\n") || undefined
```

- `appendSystemPrompt` = backend `agentbridge/bridge.go:896 buildSystemPromptPayload`(规则正文 + 用户长期记忆),无日期;
- `skillCtx` = addDirs 挂载目录的 CLAUDE.md + SKILL.md 静态文本(`agent/src/skills/loader.ts:63`),无日期;
- **没有任何 base prompt**(自研 clean-room turn-loop,没有 Claude Code CLI 那种自动 env 块);
- 全 `agent/src` 的 `new Date()` 仅 5 处,全部是日志/健康检查/会话元数据,零处进入 system/messages/tool_result;
- backend 六模块(agentbridge/prompts/smartsearch/claw/prism/peerreview)grep `time.Now().Format` 进 prompt:零命中。

### 1.2 各 feature 的具体处境

| Feature | system 内容 | 日期来源 | 风险特征 |
|---|---|---|---|
| **peerreview 智能审稿** | **undefined(完全空)** | 无 | **事故现场**。Picker=nil + InjectPromptOnFirstMsg=false(spec.go:52-53),2026-07 起 AddDirs 也移除(service.go:560-565),prompt 全部 in-band user_message。`buildCommonContext`(service.go:1919)明确指示「mcp__minicod__get_paper — 核对参考文献的真实信息 (年份/期刊/摘要)」(:1966)——**要求核查年份却不给当前日期**,模型按训练先验判 2026 年文献"不可能"完全符合预期 |
| **smart_search 智能文献搜索** | 静态 const(prompts/smart_search.go:12) | 无(DisallowedTools 硬禁 Bash) | **更隐蔽的同根 bug**:prompt 要求把「近 3 年」换算成 year_from/year_to(:41、:86)——无年份锚点时按 ≈2025 推算,检索区间系统性偏移一年、漏掉 2026 新文,用户完全无感知。且 DefaultTier=haiku,便宜档更依赖显式锚点 |
| **claw 智能助手** | 静态 const(prompts/claw.go:12) | 理论上有(唯一 AllowBash=true,可跑 `date`)但无任何提示词驱动 | 引用年份最密集:paper-<id>.md/INDEX.md 都打年份(references.go:276/:347),prompt 要求「[作者 et al., 年份]」格式输出——看得见论文年份、不知道今年是哪年。每用户一条长寿会话,日期陈旧风险最大 |
| **prism 智能写作** | agentNativeProtocol const(prism/edit.go:142) | 无 | **建会话绕过 buildCreateOptions**(edit.go:62 直接 CreateSession)——若只在 backend 建会话路径注日期会漏掉 prism。写作场景的时效判断(「近五年进展」、cover letter 落款日期)完全无提示词覆盖 |

### 1.3 三个次生问题

1. **agent 容器实际运行在 UTC**(经 `docker exec scholar_agent date` 实测):docker-compose.yml:362-364 只挂了 3 个 skill 目录、没挂 `/etc/localtime`;`TZ=":/etc/localtime"` 指向容器内不存在的文件;oven/bun:1-slim 无 tzdata。**「时区只在 docker 层」铁律在 agent 容器上恰好失守**——裸调 `new Date()` 格式化 = UTC,北京时间每天 0:00-8:00 日期会差一天。
2. **usermemory 抽取无绝对日期规则**(usermemory/service.go:167-186):抽取 prompt 既没有当前日期可供换算,也没有「相对时间必须写成绝对年月」的规则;合并滚动语义下「最近在做 X」类记忆会无限期陈旧,并被持续注入三个 feature + peerreview 方法论轮。
3. **MCP 工具 schema 暗示旧年份**:@minicod/mcp-server 的 year_from/year_to 描述示例是 2017-2023 静态例子(papers.js:52/:57)——在无锚点环境里进一步强化"现在≈2023-2025"的先验。

### 1.4 prompt 下发路径备忘(注入方案要覆盖的全部通道)

1. 建会话系统级:`buildCreateOptions`(bridge.go:917)→ `AppendSystemPrompt` → agent 存 SessionMeta(**粘滞**:ws.ts:95 仅 meta 为空时回填);
2. hub 重连 seed_history 重推(hub.go:300-311);
3. in-band 首条消息前缀兜底(hub.go:860 → ws.go:194 buildInjectionPrefix)——**注入的内容会固化进会话历史 jsonl,永不更新**;
4. peerreview 的 ServerSideChat(ws_serverside.go:166-172,原样 user_message,不经任何注入);
5. prism 自建会话(edit.go:62,不经 buildCreateOptions)。

→ **唯一每轮新鲜、四 feature 全覆盖的咽喉是 agent 容器 turnLoop.ts:45**。

---

## 二、外部调研:业界如何处理时间线问题

### 2.1 Anthropic(claude.ai / Claude Code)——最完整的公开范式

- **日期放全 prompt 第 2 句**:`"The current date is {{currentDateTime}}."`(官方发布:platform.claude.com/docs/en/release-notes/system-prompts)。官方明说:「claude.ai 用 system prompt 在每次对话开始时提供当前日期等最新信息;**这些不适用于 API——API 用户需自行注入**」。
- **双锚点 + 时间旅行者框架**:同时给 current date 和 reliable knowledge cutoff,并用一句话连接:*"It answers the way a highly informed individual in Jan 2026 would if talking to someone from {{currentDateTime}}"*——让模型自洽接受「对话时间晚于知识时间」,而不是自行怀疑日期。
- **三不原则(治「2026 尚未到来」的直接药方)**:对截止后事件 *"never claims or implies they are unverified or rumors or that they only allegedly happened or that they are inaccurate, since Claude can't know either way"*——显式禁止把「训练数据里没有」推断为「没发生/是假的」。
- **有检索工具时升级为强制动作**:二元事件(选举/死亡/现任职位)*"must ALWAYS search at least once"*;同时 *"Don't mention any knowledge cutoff... unnecessary and annoying"*(防免责声明刷屏)。
- **使用点二次注入**:Claude Code 除 env 块外,在 WebSearch 工具描述里再写一次日期 + *"You MUST use this year"* + 正反例(React docs 2026 not 2025)。
- **cutoff 刻意早报**:告诉模型的 reliable cutoff 比真实 training cutoff 早数月,制造不确定性缓冲区。
- **反面实证**:Claude Code issue #11728——env 块有正确日期,模型仍把 30+ 处日期写成训练截止年份。**注入日期是必要非充分条件**,锚定效应需要使用点强指令对抗。

### 2.2 OpenAI / 其他产品

- **ChatGPT 2023-2026 格式恒定**:头部成对 `Knowledge cutoff: YYYY-MM` + `Current date: YYYY-MM-DD`(cutoff 到月、日期到天、绝不到时刻)。GPT-5.5 版加了 IANA 时区行、强制搜索令(*"If you remotely think it is possible a fact might have changed after [cutoff], you MUST search online"*)、「temporally stable」判断指引、把现任官员/头衔类内部知识标记为 untrusted。
- **Perplexity**:注入含星期+当地时间+时区的完整时间戳,同时 *"NEVER refer to your knowledge cutoff"*(与 ChatGPT 相反的产品选择)。
- **Cursor / 旧版 Copilot**:不注日期(编码场景不敏感,刻意省 token)——佐证「按产品形态取舍」,但学术平台显然属于时间敏感型。
- **Manus**:prompt 不注日期,靠沙箱 `date` 命令自取——通用执行型 agent 的路线,不适合本项目(smart_search/prism 无 Bash)。

### 2.3 Prompt caching 与动态日期(工程约束)

- Anthropic 缓存是**严格前缀匹配**(tools→system→messages),断点前一个字节变化即令其后全部失效;官方文档明确以「timestamp 放错位置」为反例。
- 真实事故:nanobot issue #981——分钟级时间戳进 system prompt,每次调用全 miss,成本 ~10x;修复 = 时间挪到 user message 前缀 + 显式断点,省 ~90% 输入成本。
- **天粒度日期放 system 每天最多失效一次**(缓存 TTL 本来只有 5min/1h),近乎无害——Claude Code 即如此。**铁律:只注日期、绝不注时分秒**。
- 回归监控指标:`usage.cache_read_input_tokens` 连续为 0 = 存在 silent invalidator。

### 2.4 学术研究:残留失效模式(注入日期后仍要防的)

1. **模型有"内部时钟"且锚定训练分布**(arXiv 2407.04108:激活探针区分 cutoff 前后事件达 90%)——日期注入是在对抗一个真实存在的内部表征,不是填补空白。
2. **容忍窗口效应**(seuros.com "LLMs gaslight their own tools"):工具返回 2153 年时模型汇报会静默改成 2024;**离训练数据近的年份(2026)会被接受,远的会被"纠正"**——注入时应声明「系统提供的日期是权威真源」。
3. **给了日期,日期运算仍会错**(calendar blindspot):星期映射、相对日期计算不可靠——需要算术时给工具,别让模型心算。
4. **引用核查场景的共识对策**(refchecker / CiteCheck 模式):**存在性裁决必须检索接地**——LLM 只做元数据比对,「这篇不存在」的判断只能来自 live 数据库(Crossref/OpenAlex/…)查询;**年份晚于知识截止不构成文献不存在的证据,检索不到时输出 unverifiable 而非 fabricated**。这同时防两个方向:合法新文献被误杀(本次事故)+ 捏造引用漏检(NeurIPS 2025 约 53 篇录用论文含捏造引用,反向问题同样真实)。
5. **prompted cutoff 不可靠**(EMNLP 2025 "Can Prompts Rewind Time"):让模型"假装回到过去"挡不住知识泄漏——反过来说,让模型"接受现在是未来"同样需要行为准则辅助,单靠一行日期不稳。
6. **日期注入是可失败依赖**:模板变量渲染失败会注出 "undefined"(本次调研的 workflow 自己就复现了一次)——措辞要保证日期缺失时模型不至于静默回落到训练年代。

---

## 三、建议方案(按优先级,未实施)

### P0 · 单点根治:turnLoop.ts:45 注入 dateLine(覆盖全部 4 feature)

在 system 数组头部加一行,**每轮现算、天粒度、显式时区**:

```ts
// agent/src/turn/turnLoop.ts — system 组装处
const dateLine = `今天是 ${new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", dateStyle: "full",
}).format(new Date())}。这是系统提供的权威当前日期,即使与你的训练知识冲突也以它为准。你的训练知识截止时间早于今天;在你知识截止之后、今天之前发生的事(包括新发表的文献)你不知道但确实可能存在,不要以训练知识推断"现在是哪一年",也不要仅因年份晚于你的认知就断言某事物不存在。`
const system = [dateLine, input.appendSystemPrompt, skillCtx].filter(...)
```

为什么是这里而不是 backend:
- peerreview 不走 appendSystemPrompt(backend 注入必漏);prism 建会话绕过 buildCreateOptions(也漏);
- agent 端 meta.appendSystemPrompt 粘滞(ws.ts:95),建会话烙的日期随长寿会话(claw 每用户一条)过期;
- in-band 兜底前缀会固化进 jsonl 历史,跨天后与新日期自相矛盾;
- turnLoop 每轮现拼 → 跨天自动更新;天粒度 → 每会话每天最多一次 cache miss(可接受)。

**必须显式 `timeZone: "Asia/Shanghai"`**(或给 agent 容器补挂 `/etc/localtime` + tzdata):容器实测运行在 UTC,裸调 = 北京时间每天前 8 小时日期错一天。

### P1 · peerreview 专项行为准则(正中事故现场)

`buildCommonContext`(service.go:1920,`【稿件元信息】`之前)与 `buildMethodologyPrompt`(service.go:493)加(按项目铁律直接 `time.Now().Format`,backend 容器时区正确):

```
【当前日期】今天是 2026年07月08日。核查参考文献年份时以此为准:
- 年份 ≤ 当前年份+1 的引用(含 in press / online first / 预印本)属正常,不构成造假信号;
- 引用年份晚于你的训练知识截止 ≠ 该文献不存在;存在性只能用 mcp__minicod__get_paper 检索裁决;
- 检索不到时结论写「无法核实」,而非「伪造/不存在」;
- 年份超过当前年份 2 年以上仍是可疑信号,应指出。
```

保留 rv-integrity 引用真伪核验的价值(真·未来 3-5 年年份仍是造假信号),只是把「不可能」的判断标准从训练先验换成注入日期 + 检索裁决。

### P2 · smart_search:年份算术挂锚

prompt(prompts/smart_search.go)把「近 3 年」类换算显式绑定到 system 日期:「换算 year_from/year_to 时以 system 提供的当前日期为准」。这是静默检索质量缺陷,优先级不低于审稿幻觉。

### P3 · usermemory:相对时间绝对化

抽取 prompt(usermemory/service.go:167)注入当前日期 + 新规则「相对时间(最近/上周/今年)必须换算为绝对年月写入记忆」。

### P4 · 基础设施:agent 容器时区对齐

docker-compose.yml 给 agent 服务补 `- /etc/localtime:/etc/localtime:ro`(与其他服务对齐,恢复「时区只在 docker 层」铁律),P0 代码仍保留显式 timeZone 作双保险。

### 明确不做

- ❌ 日期写进 Go const / SKILL.md(静态载体带不了动态值);
- ❌ 注入时分秒(每轮破 KV-cache,违背「静态分级+首轮锁定」铁律);
- ❌ 依赖 claw 跑 `date` 自发现或 MCP time server 作为主方案(smart_search/prism 无 Bash;模型可能不调;还有"不信工具"失效模式)——静态天粒度注入为主,工具为可选补充;
- ❌ backend 层作为唯一注入点(三条下发路径 + 两个绕行 feature,覆盖不全且陈旧)。

### 上线后验证

1. 复现原场景:提交含 2026 年参考文献的稿件审稿,确认不再判「年份不可能」;
2. smart_search 问「近 3 年 transformer 综述」,抓 MCP 调用参数确认 year_from=2024(而非 2023);
3. 监控 `docker logs scholar_backend | grep agent_usage` 的 cache_read tokens 无异常归零;
4. 北京时间 0:00-8:00 窗口内验证注入日期正确(时区回归)。

---

## 附:调研材料

- 审计与验证明细:workflow `wf_e99e3080-f51` journal(12 agent,~1.39M tokens)
- 关键外部来源:
  - Anthropic 官方 system prompts 发布页:platform.claude.com/docs/en/release-notes/system-prompts
  - Agent SDK 动态段与缓存:code.claude.com/docs/en/agent-sdk/modifying-system-prompts
  - Prompt caching 语义:platform.claude.com/docs/en/build-with-claude/prompt-caching
  - 缓存事故实证:github.com/HKUDS/nanobot/issues/981
  - 日期注入仍被锚定覆盖:github.com/anthropics/claude-code/issues/11728
  - 模型改写工具时间:seuros.com/blog/llms-gaslight-their-own-tools/
  - 内部日期表征:arxiv.org/abs/2407.04108;prompted cutoff 失效:arxiv.org/abs/2510.02340
  - 引用核查接地:github.com/markrussinovich/refchecker
