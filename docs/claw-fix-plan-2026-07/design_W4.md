# W4 落地方案:模型路由 / 语言锁定 / ASCII 机械防线 / 决策话术(P1-7、P1-8、P1-11)

---

## 子域 1:flash 默认策略重估(P1-8)

### 两案对比与拍板

| | 案 A:默认切回 pro,flash 保留可选 + 后续 per-tier 默认 | 案 B:flash 保默认 + 加强约束 |
|---|---|---|
| 对审计证据的响应 | 直接消除触发源:语言错配 12 轮中 11 轮是 flash、ASCII 复发与 07-15 15:30 切 flash 强相关(`agent_model_bindings.updated_at=2026-07-15 15:30:24`) | 约束=本方案子域 2/3 的纠偏轮,只能事后补救,每次纠偏还多烧一轮 token |
| 成本 | pro 单价高,但纠偏轮/返工轮减少可部分对冲;free 档成本压力用 P1 的 per-tier 机制解决 | 便宜,但付费用户持续吃质量回归(审计 P1-9 已出现付费用户投诉) |
| 实施成本 | **零代码**(admin 改绑定),5 分钟,可秒回滚 | 零操作,但把子域 2/3 从"兜底"抬成"主防线",prompt 层对 flash 已被证明失效(ASCII 正面模板规则复发) |

**拍板:案 A。** 两案并非互斥——子域 2/3 的机械防线无论如何都要建(pro 也会偶发漂移),但防线是兜底不是主路。执行顺序:P0 先切回 pro;P1 落 per-tier 默认机制;防线上线并观测 1~2 周后,若成本压力大,仅把 **free 档**默认绑回 flash(此时 flash 已有语言/ASCII 机械防线兜着)。

### P0-1:chat_default 绑定切回 pro(零代码,0.5h)

- **改什么**:admin API 三次调用(不要直改 SQL——`SetBinding` 走 `modelcatalog/service.go:546+`,会 invalidate 30s 缓存并触发 RepushAsync):
  ```
  PUT /api/v1/admin/model-bindings/chat_default.claw          {"model_id":"deepseek-v4-pro"}
  PUT /api/v1/admin/model-bindings/chat_default.smart_search  {"model_id":"deepseek-v4-pro"}
  PUT /api/v1/admin/model-bindings/chat_default.prism         {"model_id":"deepseek-v4-pro"}
  ```
  同时核查 `chat_default.boltslides` / `chat_default.sci_draw` 现值,若也是 flash 一并切。
- **生效面**:仅影响无 `pinned_model` 的会话下次 WS 建连(`hub.go:454-456` unpin 语义);用户显式 pin 了 flash 的老会话不动(尊重显式选择)。flash 保持 `user_selectable=1` 不动。
- **为什么解决问题**:P1-7/P1-8 的回归时间线与 07-15 切 flash 完全吻合;默认模型覆盖绝大多数轮次(pin 是少数),切回即把主流量移出问题模型。
- **验证**:`GET /api/v1/admin/model-bindings` 看 effective;新开 claw 会话发一条消息后查 `agent_turns.model` 分布:`SELECT model, COUNT(*) FROM agent_turns WHERE created_at > NOW() - INTERVAL 1 DAY GROUP BY 1`——次日 flash 占比应只剩显式 pin 的会话。
- **风险/回滚**:成本上升(可量化:`docker logs scholar_backend | grep agent_usage` 对比切换前后);回滚=同一 PUT 改回 flash。

### P1-1:per-tier 默认模型(free 档覆盖绑定,5~6h)

`min_tier` 只能表达"高档才解锁",表达不了"仅免费档用 flash"——需要新缝。按调研资料的建议做 tier 感知解析,但**只加 `.free` 后缀**(真实需求就是"低档默认便宜模型",`.pro/.max` 后缀无需求,少 10 行 admin 噪音):

- **`backend/internal/modelcatalog/model.go`**:Purpose 闭集加 5 个常量并追加进 `AllPurposes`:
  ```go
  PurposeChatDefaultClawFree = "chat_default.claw.free" // 免费档默认覆盖(未绑定=跟随主绑定)
  // smart_search / prism / boltslides / sci_draw 同理
  ```
- **`backend/internal/modelcatalog/service.go`**:新方法(与 `ValidateUserModel` 共用 `s.userTier`):
  ```go
  // ResolveChatDefault feature 默认对话模型(tier 感知):free 档先查 .free 覆盖绑定,
  // 未绑定/指向无效模型 → 回落主绑定(不直落 system.main,避免绕过主绑定)。
  func (s *Service) ResolveChatDefault(featureKey string, userID uint) string {
      if tierRank(s.userTier(userID)) == 0 {
          snap := s.load()
          if id, ok := snap.bindings["chat_default."+featureKey+".free"]; ok {
              if _, exists := snap.byModel[id]; exists { return id }
              slog.Warn("modelcatalog: .free 覆盖指向不存在的模型,回落主绑定", ...)
          }
      }
      return s.Resolve("chat_default." + featureKey)
  }
  ```
  `ListForUser`(service.go:361)的 `def := s.Resolve("chat_default."+featureKey)` 改为 `def := s.ResolveChatDefault(featureKey, userID)`——否则 free 用户选择器的 IsDefault 徽标指错。
  `BindingViews`(service.go:390-409)对 `.free` 后缀且 `bound==""` 的行:`Effective=主绑定值, Fallback=false`(未覆盖是正常态,不标红)。
- **`backend/internal/agentbridge/bridge.go:104`** `ModelCatalog` 接口加 `ResolveChatDefault(featureKey string, userID uint) string`。
- **`backend/internal/agentbridge/hub.go`**:加 helper 收口,替换全部 6 处调用点(全部有 `h.userID` 在手):
  ```go
  func (h *sessionHub) resolveChatDefault() string {
      return h.f.bridge.catalog.ResolveChatDefault(h.f.spec.Key, h.userID)
  }
  ```
  替换:`hub.go:426`(sendInitialModel)、`:485`(unpin)、`:491`(老 tier 帧)、`:499`(非法 modelId 降级)、`:1347`(预算 weight 反折算)。
- **`backend/internal/agentbridge/bridge.go:926`**(水位窗口):`cat.Resolve("chat_default."+f.spec.Key)` → `cat.ResolveChatDefault(f.spec.Key, userID)`(该函数已有 userID 参数)。
- **迁移**:不需要——`agent_model_bindings.purpose` 是 varchar 主键,新 purpose 行由 admin 按需 UPSERT;闭集渲染在代码层。
- **前端**:若 admin 绑定页直接渲染后端 `BindingViews` 列表则零改动;若有 purpose→中文名映射表,补 5 行「XX(免费档覆盖)」。
- **为什么这样改**:7 个调用点(6 处 hub/bridge + ListForUser)必须同口径,否则预算反折算/水位窗口/默认徽标按错模型——用单一接口方法 + hub helper 收口。
- **验证**:`docker compose build backend`;grep 验收 `grep -rn 'Resolve(h.chatDefaultPurpose\|Resolve("chat_default' backend/` 应零命中(chatDefaultPurpose 函数可删);绑 `chat_default.claw.free=flash` 后,free 账号 `GET /api/v1/user/models?feature=claw` 的 is_default=flash、pro 账号=pro;两种账号各发一条消息查 `agent_turns.model`。
- **风险/回滚**:回滚=不绑任何 `.free` 行(行为与现状逐字节一致,`ResolveChatDefault` 退化为 `Resolve`);代码可保留。

---

## 子域 2:语言锁定(P1-7,含 1dca5f82 老挝语案例)

**优先级定义(写死进机制与条文)**:当条消息内显式语言指令 > 当条消息语言 > 记忆偏好(仅当条消息信号弱时) > 平台默认中文。例外:代码/命令/术语/文献标题/直接引语永远保持原文;当条消息无有效语言信号(纯公式/纯链接/"ok")时退回记忆偏好与静态默认。

三层改动,L1 是核心机械层:

### P0-2a(L1):按当条消息动态锁定——新文件 `agent/src/turn/lang.ts` + `turnLoop.ts` 注入(3h)

- **`agent/src/turn/lang.ts`**(新,纯函数,可单测):
  ```ts
  export type LangTag = "zh"|"en"|"ja"|"ko"|"ru"|"ar"|"th"|"lo"|"und";
  export function stripNoise(t: string): string {
    return t.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ")
            .replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/https?:\/\/\S+/g, " ")
            .replace(/@"[^"]+"/g, " ");
  }
  export function detectLang(raw: string): LangTag {
    // 取剥噪后**尾部 2000 字符**:规避首条消息的 in-band systemPrompt 前缀
    // (ws.go injectSystemPromptIntoFirstUserMessage 回落路径是中文规则文本拼在最前)与附件标记。
    const t = stripNoise(raw).slice(-2000);
    // 逐 code point 分桶:han/kana/hangul/thai/lao/cyr/arab/latin
    // 判序(关键:汉字绝对数优先,防"粘长英文材料+中文短指令"误判 en):
    // letters<12 → und;kana≥4 → ja;hangul/letters>0.3 → ko;
    // han≥20 或 han/letters≥0.2 → zh;lao、thai、cyr、arab 占比>0.3 → 各自;
    // latin/letters>0.85 且 han<5 → en;否则 und。
  }
  export const langName: Record<LangTag,string> = { zh:"中文", en:"English", ja:"日本語", ... };
  export function langDirective(tag: LangTag): string {
    if (tag === "und") return "";
    return `【本轮语言】用户本条消息使用「${langName[tag]}」。本轮你的思考过程与回复一律使用「${langName[tag]}」` +
      `——当条消息的语言优先于长期记忆中的语言偏好;仅当用户在本条消息中明确要求使用其它语言时,按其要求切换。` +
      `代码、命令、专业术语、文献标题与直接引语保持原文。`;
  }
  ```
- **`agent/src/turn/turnLoop.ts:125-138`**:在 budgetDisclosure 拼接处扩展——先对最后一条 user 消息**原文**(append disclosure 之前)取文本跑 `detectLang`,把 `langDirective` 与 disclosure 一起 append 到该 user 消息尾部(同一拼接逻辑,语言行在前、预算行在后)。
- **为什么这样解决 P1-7**:静态 langLine 把"跟随记忆偏好"与"跟随消息语言"并列且无优先级,1dca5f82 正是记忆偏好压过了当条中文消息;动态行每轮**具名**声明"本条是中文、优先于记忆偏好",从并列变成排序。走 user 消息尾部而非 system(与 budgetDisclosure 同机制):历史里冻结不回改、system 跨轮 byte 稳定,**不打破 prompt cache**——这是当初 langLine 做成静态串的约束,本方案不违反它。"und"不注入=弱信号时保留记忆偏好通道(例外成立)。
- **验证**:`lang.ts` bun 单测覆盖:纯中文/纯英文/中文+英文术语混排/粘 3000 词英文+7 字中文指令(应 und)/老挝语/纯代码(und)/"Let我先检索"式混排(zh);联调看 usage 的 cache_read_tokens 仍随轮增长(cache 未破)。
- **风险/回滚**:误判最坏后果=注入一条错误语言指令,但"消息内显式要求可覆盖"逃生门写在指令里;判序偏保守(und 兜底)。回滚:`langDirective` 恒返 ""(一行)+ rebuild agent。

### P0-2b(L3a):langLine 文本修订——`agent/src/turn/turnLoop.ts:62-64`(0.2h)

静态串仍静态,只改内容(逐字):

> 语言:默认使用中文 —— 你的思考过程与最终回复都用中文书写。**优先级:用户当条消息中的明确语言要求 > 用户当条消息本身的语言 > 长期记忆中的语言偏好 > 默认中文。** 记忆里的语言偏好只在当条消息看不出语言倾向时才使用,绝不能压过用户当条消息的语言。代码、命令、专业术语、文献标题与直接引语保持原文,不翻译。

### P1-2(L2):轮末输出语言纠偏 guard——`agent/src/turn/turnLoop.ts:333-342` 缝(3h)

- **改什么**:在 `stop_reason !== "tool_use"` 分支、`break` 前(assistant 消息已于 :331 push 进 messages):
  ```ts
  if (LANG_GUARD && expected === "zh" && !windingDown && !askWoundDown && langFix === 0
      && !explicitLangRequest(lastUserText)) {          // regex: 英文|英语|English|日语|翻译成|in English|用.{0,3}(英|日|韩|法|德|俄) 等
    const vis = stripNoise(textBlocksOf(msg.content).join("\n"));
    if (vis.length > 300 && cjkRatio(vis) < 0.10) {
      langFix = 1;
      log.info("lang_guard: output language mismatch, corrective round", { session_id, model });
      messages.push({ role: "user", content:
        "【系统语言纠偏】你上一段回复使用的语言与用户本条消息的语言(中文)不一致。" +
        "请立即用中文重新完整给出上一段回复的全部内容(代码、术语、文献标题保持原文)," +
        "不要调用任何工具,不要解释原因,不要道歉。" });
      continue;
    }
  }
  ```
  env 开关 `EXECUTOR_LANG_GUARD`(默认 1)。第一期只对 expected=zh 启用(误报面最小)。
- **为什么**:L1 是 prompt 指令,flash 仍可能不听(审计:被喂了规则照样犯);此层是机械事实校验——整份老挝语交付的 CJK 占比≈0,必中;而"合法英文交付"(用户中文消息里明确要英文摘要)被 explicitLangRequest 正则豁免。有界 1 次,不会死循环。
- **验证**:mock 上游回一段老挝语文本,断言产生纠偏轮;正常中英混排学术回复(CJK 30%+)不触发;`docker logs scholar_agent | grep lang_guard` 可统计触发率(按 model 分组,直接量化 P1-7 修复效果)。
- **风险/回滚**:内容已流式给用户,用户会看到"错语言段落+纠偏后段落"两遍——可接受(比整份老挝语交付强);纠偏轮 token 计入用户额度(小额,已知取舍)。回滚:env 置 0 重启 agent。

### P1-4(L3b):断根——记忆抽取不再误记语言偏好,`backend/internal/usermemory/service.go:178-184`(1.5h)

- **改什么**:`extractionSystemPrompt` 规则区追加第 7 条(逐字):
  ```
  7. **语言偏好只记用户明确声明过的**(如「以后都用英文回复我」)。用户某次上传/处理/翻译了某种
     语言的材料,不代表 ta 偏好用该语言交流——这类一律不记;已有记忆里若存在仅凭任务材料推断出的
     语言偏好,趁本次合并删除。
  ```
- **为什么**:1dca5f82 的根因是错误的语言偏好进了 `user_memory_blocks`(一次性任务内容被当成长期偏好),L1/L2 治标,此条从抽取侧断新增。**修正(审计 [24])**:"合并覆盖"只能剔除**非**块内唯一内容的误记项(输出不含它的 preferences 全文经 Upsert 覆盖);若某块唯一内容就是该误记语言偏好,抽取链路**不删块**(空串/省略一律跳过,不把删块权交给便宜模型),无法自愈存量——存量须靠下面的一次性运维扫描 + 手动删除清理。
- **配套排查**(一次性运维):`SELECT user_id, label, value FROM user_memory_blocks WHERE value REGEXP '语|language|English|英文|ພາສາ|Lao|老挝'` 人工复核可疑行,经 `/api/v1/user/memory` 口径清理。
- **验证**:`docker compose build backend`;构造"用户让 AI 翻译一段老挝语"的 transcript 跑抽取,断言 preferences 不出现语言项。
- **风险/回滚**:无行为风险(纯 prompt 收紧);回滚 revert。

---

## 子域 3:ASCII 字符画机械防线(P1-8)

**拍板:输出后处理检测 + 有界纠偏轮(executor 侧),不再指望 prompt。** 理由:① 正面模板已是现状(`agent-skills/claw-add/CLAUDE.md` 铁律 1-5,正面+否定俱全),审计证明对 flash 无效——prompt 层已到顶;② 不做"自动转 mermaid":字符画拓扑解析是 OCR 级难题,错转比不转糟;③ 不做前端隐藏/告警:无法区分合法内容(代码注释分节线、用户粘贴的终端输出),误伤面大。让**产出方自己重画**是唯一保真路径。

### P1-3:render guard——检测函数 + 纠偏轮(4.5h)

- **`agent/src/turn/lang.ts`(或同目录 `postcheck.ts`)加检测函数**:
  ```ts
  export function hasBoxArt(markdown: string): boolean {
    // 1) 剔除带真编程语言标注的 fenced block(python/ts/go/java/c/cpp/rust/sql/bash/json/yaml/…)
    //    ——真代码里的 ── 注释分隔线不误伤;裸 ``` / ```text 块保留检测(flash 惯把字符画塞裸代码块)。
    // 2) 逐行判 violation:
    //    a. 行内 U+2500–U+257F ∪ U+2580–U+259F(box-drawing/block elements)字符数 ≥ 3;或
    //    b. 行长 ≥ 10 且整行 ∈ [\s|+\-_=~/\\<>^v.·*oO()\[\]](纯符号行;markdown 表格行含文字不会中)
    // 3) 任意 10 行窗口内 violation 行 ≥ 3 → true(单行 --- 分隔线、单行箭头不触发)。
  }
  ```
- **`agent/src/turn/turnLoop.ts:333-342` 缝**(与 P1-2 同缝同机制,`asciiFix` 独立计 1 次,env 开关 `EXECUTOR_RENDER_GUARD` 默认 1):
  ```ts
  if (RENDER_GUARD && !windingDown && !askWoundDown && asciiFix === 0
      && hasBoxArt(textBlocksOf(msg.content).join("\n"))) {
    asciiFix = 1;
    log.info("render_guard: box-drawing art detected", { session_id, model });
    messages.push({ role: "user", content:
      "【系统渲染纠偏】你上一段回复用字符画(制表符/画框字符/等宽符号拼图)表达了图或结构," +
      "本界面无法正确显示字符画。请立即只重发这部分内容:流程/结构/架构图改用 mermaid 代码块" +
      "(如 flowchart TD),行列对比改用标准 Markdown 表格;其余已正确的内容不要重复,不要调用任何工具。" });
    continue;
  }
  ```
- **prompt 辅助(一行,正反馈绑定)**:`agent-skills/claw-add/CLAUDE.md` 铁律 3 末尾追加:
  > (系统会机械检测字符画,一旦检出会当轮要求你重画为 Mermaid——第一次就直接用 Mermaid,省一轮。)
- **为什么解决 P1-8**:检测是确定性的字符统计,不依赖模型自觉;违规必然进入纠偏轮,终稿总以 mermaid/表格形态收尾;`render_guard` 日志按 model 分组可持续量化 flash vs pro 触发率,为"free 档是否绑回 flash"提供数据。
- **验证**:单测喂审计里的真实字符画样本 + 合法样本(GFM 表格、mermaid 块、Go 代码含 `──` 分节注释、KaTeX、markdown `---`)断言零误报;flash 上跑复现 prompt(「用 ASCII 框图画 transformer 结构」),观察先字符画→纠偏→mermaid 重发。
- **风险/回滚**:误触发代价=一次多余纠偏轮(非破坏性,模型会答"上段是代码非字符画");纠偏轮 token 计入用户额度(同 P1-2)。回滚:env 置 0 重启 agent。

---

## 子域 4:决策咨询"一锤定音"话术约束(P1-11)

**纯 prompt 层,且这里 prompt 层足够**:P1-11 是话术姿态问题,没有可机械校验的事实锚点("180°反转"是跨多轮语义判断,代码层需 LLM 裁判,成本与误报不可控;危害路径是话术而非数据)。机械成分只有一条:条文必须放**常驻层**(claw.go / CLAUDE.md),不放按需 guides(不保证在场——这正是调研指出的缝)。叠加子域 1 默认回 pro(6 次反转发生在 flash 期)双保险。吸取 ASCII 教训,每条否定式都配正面替代模板。

### P0-3a:`backend/internal/prompts/claw.go` 「# 边界」节(:124 与 :125 之间)插入(逐字条文):

```
- **建议是建议, 不是判决**: 涉及用户现实中的重要决策 (选题方向 / 投稿期刊 / 换导师 / 签约付费等),
  禁止使用"一锤定音 / 就此锁死 / 不必再犹豫 / 这是唯一正确选择"之类的绝对化收束; 给出倾向时,
  必须同时给出该倾向成立的前提条件与主要反方理由 (正确形态: "当前证据下我更倾向 A, 前提是 X;
  如果 Y 成立则 B 更优")。禁止催促用户在特定时限内完成不可逆的现实动作 (如"今天就去找导师表态 /
  马上提交 / 立刻付费")——行动时点由用户自己定, 你至多说"下次和导师讨论时可以带上这份对比"。
- **改口必须显式**: 若你现在的建议与本会话早前给出的建议不同, 必须开头就说明"我之前建议 X,
  基于〈新出现的依据〉现在改为建议 Y", 并讲清是什么信息变了; 禁止把每次新建议都包装成全新的
  最终结论、假装从未给过相反建议。同一会话内立场已变更过的, 再次变更前先向用户复述此前的
  推荐轨迹并说明摇摆原因。
```

### P0-3b:`agent-skills/claw-add/guides/topic-selection/SKILL.md` 红线区(:51-53 附近)追加(逐字):

```
- 选题建议**永不使用**"一锤定音 / 锁死 / 就这么定了"式收束: 每轮给出的是「当前证据下的排序」,
  并明说还有哪些新证据会推翻这个排序。
- 不催促用户"今天 / 本周内就去找导师定下来"; 把行动时点留给用户, 你只提供可带去讨论的材料。
- 本会话中已调整过一次推荐方向的, 再次调整必须先复述推荐轨迹 (先推 A、后改 B), 再解释本次
  变化依据; 禁止呈现为全新结论。
```

- **为什么**:条文逐字点名封禁审计里的两个具体形态("一锤定音"包装、催当天找导师),并给出替代话术;放 claw.go 保证不依赖模型主动调 Skill(topic-selection 是按需层,不在场时 claw.go 兜底)。
- **验证**:用审计会话的选题咨询脚本(多轮追问诱导反转)在 pro/flash 各跑一遍,检查反转轮是否有显式改口+轨迹复述;一周后经 admin 会话监控抽查 transcript,grep「一锤定音|锁死|就这么定|今天就去」命中率对比。
- **部署**:claw.go → `docker compose build backend` + up;SKILL.md 正文改动 Skill 工具现读立即生效;**对存量活会话生效需 `docker-compose restart scholar_agent`**(seed_history 重灌 appendSystemPrompt)。
- **风险/回滚**:表达变谨慎、决断感下降(刻意为之);回滚 revert 文案。

---

## 排期与工作量汇总

| 期 | 项 | 内容 | 主要文件 | 工作量 |
|---|---|---|---|---|
| **P0(当天)** | P0-1 | chat_default×3(+核查 2)切回 pro(零代码 admin 操作) | agent_model_bindings(数据) | 0.5h |
| | P0-2a/2b | 动态语言行注入 + langLine 优先级修订 | agent/src/turn/lang.ts(新)、agent/src/turn/turnLoop.ts | 3h |
| | P0-3 | 决策话术条文(常驻+按需两层) | backend/internal/prompts/claw.go、agent-skills/claw-add/guides/topic-selection/SKILL.md | 1h |
| **P1(本周)** | P1-1 | per-tier 默认(`chat_default.<key>.free` 覆盖绑定) | modelcatalog/model.go、service.go、agentbridge/bridge.go、hub.go(6+1 调用点) | 5~6h |
| | P1-2 | 输出语言纠偏 guard(有界 1 次,env 开关) | agent/src/turn/turnLoop.ts:333-342、lang.ts | 3h |
| | P1-3 | ASCII render guard(检测+纠偏轮,env 开关)+ CLAUDE.md 一行 | agent/src/turn/turnLoop.ts、lang.ts/postcheck.ts、agent-skills/claw-add/CLAUDE.md | 4.5h |
| | P1-4 | 记忆抽取语言偏好断根 + 存量排查 SQL | backend/internal/usermemory/service.go:178-184 | 1.5h |

**部署顺序与铁律对照**:agent 侧改动(P0-2、P1-2、P1-3)= `docker-compose up -d --build agent`(scholar_agent);backend 改动(P0-3a、P1-1、P1-4)= `docker compose build backend` 验证后 up;skill/CLAUDE.md 改动生效需 restart scholar_agent(loader LRU 缓存);无 DB 迁移。P0-1 与其余项完全解耦,先行独立上线。

**成功度量(两周后复盘)**:① `agent_turns.model` 中 flash 占比降至仅显式 pin;② `lang_guard`/`render_guard` 日志触发率按 model 分组(预期 flash >> pro,为 free 档绑回 flash 的决策供数);③ 抽样 transcript 语言错配轮=0、字符画终稿=0、绝对化收束话术命中率显著下降。