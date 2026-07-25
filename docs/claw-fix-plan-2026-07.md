# Claw 智能助手修复落地计划(2026-07-23)

依据:2026-07 线上半月审计(91 会话 / 304 轮全量细读 + 对抗核实,9 项 CONFIRMED / 5 项 PARTIAL)。
方案产出:7 个代码调研代理 + 6 个分域设计代理;所有文件级锚点已抽验对齐当前工作树;
**两项关键事实已在线上实测验证**(见下)。六份分域详细方案见文末索引。

---

## 一、已实测验证的两个事实(方案的地基)

### 1. bwrap 沙箱解锁的最小组合(线上一次性容器实测,2026-07-23)

| 测试 | 配置 | 结果 |
|---|---|---|
| B | 现状(docker-default AppArmor + sysctl=1) | ✗ `Failed to make / slave`(复现线上) |
| A | `apparmor=unconfined` + sysctl=1 | ✗ `setting up uid map: Permission denied`(unprivileged_userns 桩 profile 拦截) |
| C | docker-default + sysctl=0 | ✗ 仍 `Failed to make / slave`(docker-default 无 mount 规则) |
| **D/E/F/G** | **`apparmor=unconfined` + sysctl=0** | **✓ 真实自探命令通过;真实 jail 参数通过;jail 内 pandoc 3.1.11.1 跑通** |

结论:**两层拦截必须同时解除**,缺一不可。不需要 `systempaths=unmasked`(真实 jail 刻意不挂 /proc,bwrap.ts:77-82)。
测试后 sysctl 已还原为 1,等待正式实施。

### 2. flash 回归的开关位置(线上 DB 实查)

`agent_model_bindings` 表 `chat_default.claw = deepseek-v4-flash`(updated_at 2026-07-18 03:12,
与质量回归起点完全吻合)。切回 = admin API 一次 PUT(经 `modelcatalog SetBinding`,带缓存失效 + RepushAsync,
不要直改 SQL)。代价:pro 计费权重 3.0 vs flash 1.0,**成本约 ×3,需老板拍板**。

---

## 二、执行波次

### 第 0 波 · 当天,近零代码,最高杠杆

**W0-1 沙箱解锁(修复 P0-4:Bash 47/65 失败、导出 4/4 失败、半月 0 个 docx/pdf)**
1. 新增 `scripts/enable-bwrap-host.sh`(入库留痕):
   ```bash
   echo "kernel.apparmor_restrict_unprivileged_userns = 0" > /etc/sysctl.d/99-scholar-agent-userns.conf
   sysctl --system
   ```
2. `docker-compose.prod.yml`(及 dev compose 对齐)agent 服务 `security_opt` 追加一行 `- apparmor=unconfined`
   (保留 no-new-privileges + 自定义 seccomp;加注释说明两层拦截与配套 sysctl)。
3. `docker compose up -d agent`(security_opt 变更必须**重建**,restart 无效;探测结果进程级缓存)。
4. 按 W1 方案 P0-5 验证清单逐项打勾:`sandbox_mode: bwrap` 日志、sci-draw 自检通过、
   jail 内 `ls /proc` 不存在、`env` 无密钥、真实会话 Bash/导出跑通。

安全论证:摘掉的 docker-default AppArmor 与现有 cap_drop ALL + no-new-privileges + 自定义 seccomp 高度重叠;
bwrap 内层 jail(tmpfs 根 + 唯一可写 cwd + clearenv)本身就是更强的隔离。P2 可选做自定义 AppArmor
profile(abi 4.0 + userns/mount 规则)把 AppArmor 加回来,但 abi 4.0 会把 network/io_uring 变为受调解
(Bun 依赖 io_uring),风险大于收益,不做 P0。

**W0-2 PDF 引擎(半月 0 个 pdf 的另一半根因:`EXECUTOR_PDF_ENGINE` 从未配置)**
- `agent/Dockerfile` 加 weasyprint 层;compose 加 `EXECUTOR_PDF_ENGINE=weasyprint`。
- 理由:纯本地渲染(jail net:none 兼容)、走 fontconfig(/etc/fonts 已 bind,中文不豆腐)、无 TeX 体积。

**W0-3 默认模型切回 pro(修复 P1-7/P1-8 语言漂移 + ASCII 复发的主触发源)** —— **需拍板(成本×3)**
```
PUT /api/v1/admin/model-bindings/chat_default.claw          {"model_id":"deepseek-v4-pro"}
PUT /api/v1/admin/model-bindings/chat_default.smart_search  {"model_id":"deepseek-v4-pro"}
PUT /api/v1/admin/model-bindings/chat_default.prism         {"model_id":"deepseek-v4-pro"}
```
仅影响未显式 pin 的会话;flash 保持可选。观测两周后若成本压力大,落 P1 的
`chat_default.<key>.free` per-tier 覆盖机制(W4 方案 P1-1,免费档回 flash,此时机械防线已兜底)。
次日验证:`SELECT model, COUNT(*) FROM agent_turns WHERE created_at > NOW() - INTERVAL 1 DAY GROUP BY 1`。

**W0-4 导出冒烟自检**(W1 P0-3):`bwrap.ts` 加 `smokeTestExport()`(docx+pdf 在真实 jail 内 pandoc 产出,
启动日志自证),`index.ts` 接线。复制 sci-draw smoke 模式——那次事故证明"裸 exec 全绿、jail 内挂掉"只有这样才暴露。

### 第 1 波 · 本周,机械防线(P0 代码)

#### 集成裁决(三处跨方案冲突,以此为准)

**裁决 1:tool_result 双轨字段统一为 `userMessage`。**
W1 P1-1 的 `userHint` 与 W5 P0-A 的 `userMessage` 是同一机制的两次设计,合并:
- `ToolResult` 加 `userMessage?: string`(registry.ts:23);`fail(text, userMessage?)`;
- `content[].text` = 给模型的全量指引(含 W1 P0-4 的失败点带内指令文案);
- `userMessage` = 给用户的脱敏摘要;runTools 兜底 `genericToolUserMessage(name)`;
- 帧透传(runTools.ts:80)+ FoldToMessages 透传(eventlog_store.go:281-306 加一行)+
  前端 ToolErrorFold 优先渲染(W5 P0-B);回喂模型的 messages 不带该字段。

**裁决 2:turnLoop 终轮 guard 链统一为一个集成点。**
W2 P0-B(诚实性)、W4 P1-2(语言)、W4 P1-3(ASCII)、W3-5c(max_tokens 恢复)全部落在
`stop_reason !== "tool_use"` 分支 break 前——必须做成**一条有序 guard 链**,而不是四段独立 if:
```
顺序:max_tokens 恢复(协议要求,优先)→ 诚实性核验 → 语言纠偏 → ASCII 纠偏
预算:每 turn 纠偏轮总数 ≤ 2(maxCorrectiveRounds),每个 guard 各自最多 1 次;
共同豁免:windingDown / askWoundDown / signal.aborted / round 到顶;
统一日志前缀 guard:<name>,按 model 分组统计触发率。
```
实现顺序:先落 W3-5c 与诚实性(P0),语言/ASCII guard 随后(P1,W0-3 切回 pro 后触发率会先降)。

**裁决 3:payload 上限双层保留,顺序固定。**
minicod 结构化清洗(W6 P0-1,minicodClient.ts:136)在前——懂 JSON 形状,能剔 spam、标低相关、注入
CNKI 披露;runTools 通用字符上限(W3-4,resultCap)在后——兜住所有工具(含 builtin)的极端体积。
两者阈值注释互相指认。

#### 改动清单(文件级,详见分域方案)

**W3 轮生命周期(方案全文:design_W3)**
- 空轮裁决:agent 侧 turnLoop finally `sawText/ranTool` 判空 → `sendError("…", "empty_turn")`;
  backend hub.go:936 message_complete 处 usage 全 0 + 无可见文本 + 非 abort → 改判 failed、发 error 帧、
  **不写 ledger 不计费**;顺带修 case "error"(hub.go:1004)终帧不入 journal 的既有缝。
- 轮级硬超时:hub beginTurn 挂 15min timer(FeatureSpec.TurnTimeout 可调)→ stop_generation +
  FailTurn + error 帧;agent 侧 20min 兜底 killer(占死并发槽防护;全容器仅 2 槽)。
- 运行期 reaper:`ReconcileStaleRunning` 从 boot-only 升为 10min ticker(bridge.go),阈值 1h→30min。
- DSML 熔断:新 `leakGuard.ts` 流式滚动扫描(holdback 跨帧匹配)接入 turnLoop 两条 delta 通路;
  熔断后 history 消毒 + 干净正文 <200 字符时有界重试 1 次;journal 存过滤后帧,回放天然干净。
- adapter.ts 三修:无 finish_reason 空流不再伪装 end_turn(P0-3 最大来源);tool args 半截 JSON 如实抛错;
  流空闲 120s 超时。
- max_tokens 撞顶自恢复:pending tool_use 回 is_error tool_result + 分段写指令,再走一轮(≤1 次)。

**W2 诚实性防线(方案全文:design_W2)**
- 新 `verifyClaims.ts`:DOI 抽取 vs 全会话 user 侧语料(tool_result + 用户材料,排除 assistant 自证);
  交付宣称 regex vs 本轮 artifacts(diffOut)+ 会话 out/ 写入史;通读宣称 vs Read 调用史 + 截断/乱码标记。
- turnLoop 终轮接线(guard 链之一):核验不过 → 注入纠偏指令 continue(轮内闭环,"验证或更正"二选一,
  误报自愈);终帧带 claim_audit 元数据;env 急停阀 `EXECUTOR_HONESTY_GUARD=off`。
- per-feature 旗标 `honestyGuard`(spec→client→http→ws 全链路),claw 先开,prism 两周后评估。
- 预算披露文案封口(turnLoop.ts:40-50):"配额"改"内部执行参数 · 严禁向用户转述"+ 唯一许可收尾话术。
- claw.go 加「诚实性铁律」节 + 「先写后说」铁律(常驻层,不依赖按需 skill 在场)。
- Read 乱码横幅(registry.ts):>10% 替换符/控制符 → 前置警示标记(同时是核验器的机械锚点)。
- eventlog_validate parity 豁免纠偏消息(CORRECTIVE_MARKER 前缀)。

**W5 错误分级与等待体验(方案全文:design_W5)**
- 双轨制落地(裁决 1);Bash 闸 / 导出闸 / PDF 降级等 9 个失败点逐一配 userMessage +
  模型侧带内指令(gate.reason 内部真因只进日志——同时修 P1-12 泄漏源头)。
- 前端 `friendly-tool-error.ts`(分类映射 + sanitizeOpsText 打码)+ ToolErrorFold(摘要默认、
  技术详情也过打码)——旧历史事件零字段时前端兜底接管,**先上前端即可止血全部存量会话**。
- StallNotice:90s 无内容帧软提示(pong 不算进展)+ 停止/继续按钮;失败轮「重试」按钮(errorCode 白名单)。
- 等待可感知:status.elapsed 透传(fold.ts:127 现在丢弃)、StreamingIndicator 计时 + CyclingHint 轮换、
  ThinkingFold 实时秒数、长工具"已运行 Xs"。对应审计"52% 轮思考字数>正文,等待不可见"。
- prompt 条文(turnLoop appendSystemPrompt 系统级):工具报错只供内部,向用户只说"哪步没成/影响/替代"。

**W6 检索质量(方案全文:design_W6)**
- agent 侧 `sanitizeMinicod.ts`(裁决 3 前层):abstract 逐篇 2000/单篇 8000 上限、spam 标题剔除、
  控制符/JATS 标签清洗、总量 50KB、低相关标注(query 词零重叠)、**中文 query 机械注入 coverage_note**
  (「不含 CNKI/万方…严禁声称已检索中文数据库」——与工具结果同帧,直怼 2d853f50 虚构 CNKI 统计)。
- backend `ConvertPaper/ConvertPapers` 清洗(先于 Redis 缓存与 hot_papers 落库,同修 SEO 面)。
- **假品牌名撤销**:claw.go:46-54 / smart_search.go:26-40 的 Graph/Discovery/Medicine 映射整段替换为
  Semantic Scholar / OpenAlex / PubMed 真名 + 覆盖边界诚实条款 + 相关性核对第 8 条;
  同步清扫两个 SKILL.md 与前端 data-source-brand.ts。
- 陈旧"Output too large 落盘"契约删除(防的是不存在的机制)。

### 第 2 波 · 下周(P1)

- W4 P1-1 per-tier 默认模型(`chat_default.<key>.free`,7 个调用点收口 ResolveChatDefault)。
- W4 P1-2/P1-3 语言 guard + ASCII guard(进 guard 链;先看 W0-3 切 pro 后的残余触发率)。
- W4 P1-4 记忆抽取语言偏好断根(usermemory extractionSystemPrompt 第 7 条 + 存量排查 SQL)
  ——1dca5f82 老挝语案例的根因。
- W3 P1-A 失败轮错误持久化(EvError 读侧折叠,实时/历史 fold 同构收口)。
- W2 P1-a 诚实性事后雷达(eventlog_validate,量化漏报率);P1-b 前端 claim_audit 轻标注。
- W6 P1-5/6/7 sources_queried 透明化、空集 auto 换源、零重叠沉底;P1-8 前端真名对齐。
- W5 P1-D 等待体验四组件;W1 P1-2 全局失败话术兜底条文。
- 时区债:确认 completed_at 全链路 Local(07-18 已加固,补一条监控 SQL 看 >8h 异常轮归零)。

---

## 三、验收口径(对照审计基线复测)

上线两周后用同一套审计脚本复测,目标:
| 审计基线(07-08~23) | 目标 |
|---|---|
| Bash 失败 47/65,导出 4/4 失败,0 个 docx/pdf | Bash 成功率 >95%,docx/pdf 正常产出 |
| 空轮 12 会话(complete + usage 全 0) | `model='' AND status='complete'` 组合归零(SQL 可查) |
| 挂死轮 848s/624s 无回收 | 任何轮 ≤15min 硬终止且前端可见 |
| DSML 泄漏 7 会话 | `agent_turn_events WHERE payload LIKE '%DSML%'` 零新增 |
| 编造 DOI(55 会话) | 诱导场景 10 轮零逃逸(纠偏轮兜住);honesty guard 触发率周报 |
| 语言错配 12 轮 / ASCII 11 轮 | 抽样归零;lang/render guard 按 model 触发率对比 |
| 运维报错泄漏 25 会话 | 工具卡摘要无 bwrap/EXECUTOR/容器路径(含旧会话回放) |
| success 仅 13/91 | 下一次半月审计 success 率显著抬升 |

## 四、回滚总表

| 机制 | 开关 | 方式 |
|---|---|---|
| 沙箱解锁 | — | 删 compose 行 + 删 sysctl 文件 + 重建容器 |
| 默认模型 | — | admin PUT 改回 flash |
| 诚实性核验 | `EXECUTOR_HONESTY_GUARD=off` / spec 旗标 | env 重启 / rebuild backend |
| 空轮裁决 | `AGENT_EMPTY_TURN_ADJUDICATE=off` | env |
| 轮硬超时 | `TurnTimeout=0` / `EXECUTOR_TURN_HARD_TIMEOUT_MS=0` | spec / env |
| DSML 熔断重试 | `EXECUTOR_DSML_RETRIES=0` | env |
| payload 上限 | `EXECUTOR_TOOL_RESULT_BLOCK_MAX=0` | env |
| 流空闲超时 | `EXECUTOR_STREAM_IDLE_TIMEOUT_MS=0` | env |
| 语言/ASCII guard | `EXECUTOR_LANG_GUARD=0` / `EXECUTOR_RENDER_GUARD=0` | env |
| 双轨/前端脱敏 | 纯增量字段 | revert |

## 五、部署铁律备忘

- agent 代码/prompt/skill 改动:`docker compose up -d --build agent`(探测与 skill 缓存进程级;restart 只对 prompt 够)。
- backend:`docker compose build backend` 先过编译;前端:`tsc -b && vite build`。
- security_opt 变更必须重建容器,restart 无效。
- guard 链只在 claw 先开(honestyGuard 旗标),prism/smart_search 观测后跟进;peerreview server-side 路天然不受影响。

## 六、分域方案索引(全文)

六份设计全文在 `docs/claw-fix-plan-2026-07/design_W1~W6.md`,已按本计划裁决整合;实现时以本文件的
集成裁决为准,细节(伪代码/行号/单测用例)查阅对应分域文件。审查阶段(6 个对抗审查代理)因当日
会话额度未跑完,已由主线逐锚点抽验替代:所有承重文件/行号/机制均已核实存在且语义相符。
