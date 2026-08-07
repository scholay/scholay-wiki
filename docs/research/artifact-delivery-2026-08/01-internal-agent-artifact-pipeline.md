# agent 容器侧「模型写文件 → 产物帧」全链路取证

> 调研日期:2026-08-07 · 范围:`agent/` 容器内的产物检测/搬运/发帧链路(下游 backend/前端只做交叉验证,不做穷举)
> 方法:逐文件通读 `agent/src/turn/artifacts.ts` · `artifacts.test.ts` · `turnLoop.ts` · `deliveryGate.ts(+test)` ·
> `tools/registry.ts` · `turn/runTools.ts` · `turn/compact.ts` · `turn/types.ts` · `turn/leakGuard.ts` ·
> `server/workspace.ts` · `server/http.ts` · `sandbox/{confine,reserved,bwrap,profile}.ts` · `policy/featurePolicy.ts` ·
> `render/deckpptx.ts`;交叉验证 `backend/internal/claw/artifact{,_harvest}.go` · `backend/internal/prompts/*.go` ·
> `frontend-user/src/features/claw/components/chat/{fold,MessageTurn,TurnArtifacts}.tsx` · `shared/lib/strip-container-paths.ts`。
> 铁律:本文每条结论都带 `file:line`,均为实读。未实读的一律标注为推断。

---

## 〇 一句话结论

**产物链路有两条彼此独立、口径不同的真源**:

| | 谁产出 | 覆盖面 | 用户看到什么 |
|---|---|---|---|
| **A. `artifact` 帧**(轮级) | `emitArtifacts` 的 out/-diff + 越界扫描 + 搬运 | 只在「正常收轮」才发;有 20 帧上限、扩展名白名单、扫描预算、目录黑名单 | 对话流里那一轮下方的「生成的文件」卡 |
| **B. `ListWorkspaceFiles("out")` 收割**(会话级) | backend `harvestSession`,与帧完全无关 | out/ 顶层**物理存在**的一切 | 右侧产物面板,upsert-only、**从不删除** |

用户三条痛点各自落在不同的位置:

- **「文件输出在用户端看不到」** = A 有 8 类结构性漏点(§2),而 B 只覆盖 `out/` 顶层 —— 落在会话根/子目录且扩展名不在白名单里的文件,**两条通道同时看不到,永久丢失**。
- **「编辑文件容易出错、修改不到」** = 两个机制叠加:① `Edit` 是「首次出现的字面替换、无 read-before-edit 契约」;② `compact.describeToolCall` 把 `Write` 的 `content` 整个丢出历史,只留 `file_path` ⇒ 长会话里模型对自己写过什么只剩文件名(§4.3)。
- **「agent 说文件输出到 out 目录」** = 三条泄漏源:① `sci_draw`/`stat_lab`/`boltslides` 的 system prompt **没有** claw 那条「绝不暴露内部路径」铁律,且 `sci_draw` 自己反复教裸 `out/`;② 工具回执原文含 `out/xxx`,前端 ToolCallBlock 可展开直显;③ 前端出口清洗 `stripContainerPaths` **刻意不处理裸 `out/`**,而系统自己教的正是裸 `out/`(§5)。

---

## 一 完整时序:模型调 Write → 前端拿到卡片

```
                      ┌────────────────────── agent 容器(执行器) ──────────────────────┐

 T0  runTurn 入口
     turnLoop.ts:178-183   outBaseline = await snapshotOut(workDir)
                           ├─ snapshotOut(artifacts.ts:98-125)
                           │   ├─ readdir(out/) 顶层:文件 → {size,mtimeMs}; 一级子目录 → dirSig 聚合
                           │   │   · 点开头条目跳过 (artifacts.ts:108)
                           │   │   · stat 失败静默 skip (artifacts.ts:114-119)   ← 静默漏点
                           │   └─ scanRootDeliverables(artifacts.ts:128-172)
                           │       · 深度≤6、文件≤400、目录≤2000 (artifacts.ts:39-42)
                           │       · 点开头跳过 / DEEP_SKIP_DIRS 任意层整棵跳过 (146)
                           │       · 只收 DELIVERABLE_EXTS = md|docx|xlsx|pptx|pdf|csv|html|svg (24,149)
                           │       · 根目录 ROOT_SKIP_FILES 排除 (38,150)
                           └─ 抛错 → outBaseline = null(整轮既不发帧也不过闸,静默)turnLoop.ts:181-182

 T1  for (round…)  流式请求上游 → sink.frame(content_delta / thinking / tool_use_complete)

 T2  模型发 tool_use{name:"Write", input:{file_path, content}}
     runTools.ts:26-56   parallelSafe 分流(Write/Edit/Bash/ExportDocument/BuildDeck 都是 false → 串行)
     runTools.ts:61      featurePolicy.toolPermitted 二道墙
     runTools.ts:65-84   sink.requestPermission → 控制面裁决(阻塞)
     registry.ts:205-214 writeTool.run:
                           confinePath(workDir, file_path, forWrite=true)   sandbox/confine.ts:82-109
                             · /work 别名入站翻译 (confine.ts:30-38)
                             · canonical(realpath) 越界断言 (confine.ts:89-93)
                             · 保留区 evidence/ analysis/ 拒写 (confine.ts:98-103, reserved.ts:39)
                             · 末段 symlink 拒 (confine.ts:105-106)
                           mkdir(dirname) + writeFile  ← 落盘。**没有任何 out/ 强制**
     runTools.ts:130-139 capToolResult → sink.frame({type:"tool_result", …})

 T3  (可选)ExportDocument / BuildDeck / StatReport 这类「构建型」工具
     · registry.ts:726  outRel = `out/${base}.${fmtKey}`   ← 只有这几个工具硬编码落 out/
     · registry.ts:862  outRel = `out/${base}.html`
     · registry.ts:716-722 / 887-894  [[E<n>]] resolve 闸:展不开就**不生成文件**(硬失败)

 T4  模型 end_turn(或 SubmitAnswer 当场收轮 turnLoop.ts:924-938)→ break
     ── finally 块(turnLoop.ts:940-1025)──────────────────────────────────────
     ① 空轮改判 turnLoop.ts:944-951 → sendError("empty_turn")
     ② if (!terminalSent && outBaseline)  turnLoop.ts:954-959
            emitArtifacts(workDir, outBaseline, sink):
              a. current = await snapshotOut()                       artifacts.ts:341
              b. all = diffOut(baseline, current)                    artifacts.ts:342 / 183-207
                   · 未变判据:size 相等 **且** mtimeMs 相等          artifacts.ts:187
                   · 同轮 X.docx + X.docx.md → 压掉 .md              artifacts.ts:198-206
              c. capped = all.slice(0, 20)                           artifacts.ts:345  ← 截断在搬运之前
              d. decls = relocateStrays(...)                         artifacts.ts:349 / 225-289
                   · 剔除保留区条目 (242-243)
                   · mkdir(out/) 失败 → 丢掉全部越界条目,静默 (247-251)
                   · taken 由 current 的全部 out/ 键播种 (253)
                   · 同名 → 加 -2/-3…(最多 -49) (269-279)
                   · copyFile 失败 → `continue`,**零日志丢弃** (280-284)
              e. gate = runDeliveryGate(workDir)                     artifacts.ts:363
                   · bwrap jail 内 `python3 -P -m statkit numcheck`  deliveryGate.ts:80-101
                   · observe(默认)只记日志;enforce 才 rename 进 analysis/quarantine/  :139-166
                   · enforce 时在 out/ 写「⚠️交付闸拦截说明.md」      :181-213  ← 在 current 快照之后,**不发帧**
              f. shipped = decls 去掉被隔离项                        artifacts.ts:368-371
              g. resolveCitations(shipped)                           artifacts.ts:377 / 310-337
                   · 就地展开 [[E<n>]],改写 d.size;>8MB 跳过 (313)
              h. for (d of shipped) sink.frame({type:"artifact", name, path, kind, mime, size})  artifacts.ts:378-380
        else if (outBaseline)   turnLoop.ts:960-978
            **只跑闸、不发帧**(异常终止轮)
     ③ research_state 帧   turnLoop.ts:988-1013
     ④ pendingError → sink.frame({type:"error"})   turnLoop.ts:1017-1023
     ⑤ sendComplete() → message_complete           turnLoop.ts:1024 / 378-402

                      └────────────────────────────────────────────────────────────────┘
                                                │ WS 中性帧
 T5  backend agentbridge hub
     hub.go:2086-2088  classifyJournalEv: "artifact" → EvArtifact,入 journal(重连回放用)
     广播给前端(广播在 tee 之前)

 T6  frontend
     fold.ts:142-150      case 'artifact' → 挂到 current turn 的 turn.artifacts[](同轮同 path 去重)
     makeAgentConversationHook.ts:359-372
                          message_complete **或** error → invalidateQueries([feature,'artifacts'])
     ↓ 触发 GET /api/v1/user/<feature>/session/artifacts
     backend claw/artifact.go:174+  GetSessionArtifacts → harvestSession
     artifact_harvest.go:34-61      ListWorkspaceFiles(sessionID, "out") → 逐条 upsert 到 MinIO + agent_artifacts
                                    **upsert-only,永不按 live 工作区删**(:28-33)
     MessageTurn.tsx:72-86 mergeTurnArtifacts:
                          turn.artifacts 是**权威**;按 path 关联 DTO;DTO 没有就用帧字段合成一张卡
     TurnArtifacts.tsx    渲染「生成的文件」绿框卡(下载 / 预览)
```

**三个关键的顺序不变量**(都有测试钉住):

1. `artifact` 帧必须在 `message_complete` 之前 —— 前端 fold 靠「完成帧一到就切下一轮」把产物绑到当前轮(`turnLoop.ts:952-953`)。
2. 交付闸必须在 `relocateStrays` **之后** —— 否则模型最常见的落点(会话根)在闸跑的时候还不在 `out/` 里,numcheck 只扫 `out/` ⇒ 交付当轮 100% 免检(`artifacts.ts:351-362`,不变量测试 `artifacts.test.ts:238-258`)。
3. 异常终止轮也要过闸(`turnLoop.ts:960-978`,不变量测试 `artifacts.test.ts:270-287`)。

---

## 二 「文件写了但用户永远看不到」全清单

按「彻底丢失(A+B 都看不到)」→「只丢卡片(B 还在)」排序。

### 2.1 彻底丢失(帧没有 + `out/` 里也没有 ⇒ backend 收割也拿不到)

#### (1) 扩展名不在 `DELIVERABLE_EXTS` 白名单里的越界文件 —— 最大的一类
- **判据**:`artifacts.ts:24` `DELIVERABLE_EXTS = {.md .docx .xlsx .pptx .pdf .csv .html .svg}`;`artifacts.ts:149` `if (!DELIVERABLE_EXTS.has(extname(e.name).toLowerCase())) continue;`
- **不在白名单**:`.png .jpg .jpeg .webp .gif .txt .json .zip .py .tex .bib .ipynb .r .sql .yaml .xml .docx以外的一切`
- **触发**:模型用 Bash 跑 `matplotlib` 时 `plt.savefig('fig.png')`(相对 cwd,不带 `out/`)、写 `data.json`、写 `analysis.py`、打包 `result.zip`。
- **后果**:根扫描收不到 → 不进 diff → 不发帧 → `relocateStrays` 也搬不了 → `out/` 里没有 → backend `ListWorkspaceFiles("out")` 看不到。**文件在盘上,用户两条通道都拿不到,直到会话 GC。**
- **注意不对称**:`out/` 顶层扫描**没有**扩展名过滤(`artifacts.ts:113` 只判 `e.isFile()`),所以同一个 `fig.png` 写进 `out/` 就完全正常。这条不对称本身就是缺陷面。

#### (2) 一轮超过 20 个变更条目 —— 截断刻意排在搬运之前
- **判据**:`artifacts.ts:46` `ARTIFACT_MAX_FRAMES = 20`;`artifacts.ts:345` `const capped = all.slice(0, ARTIFACT_MAX_FRAMES);`,`:349` 才 `relocateStrays(workDir, capped, current)`
- **注释自陈**:「截断在 relocateStrays **之前**做,复制次数一并受限」(`artifacts.ts:43-45`)
- **后果**:第 21 个及以后的**越界**条目既不发帧、也**不被复制进 `out/`** ⇒ backend 收割不到 ⇒ 永久丢失。回归测试 `artifacts.test.ts:141-149` 明确断言 `readdir(out/).length === 20`(写了 25 个,只搬了 20 个)。
- **顺序**:`diffOut` 遍历 `current` Map 的插入序 = out/ 原生在前、根扫描在后(`artifacts.ts:107-123`),所以被砍掉的总是越界物,正好是最脆弱的那一半。
- **触发现实性**:sci_draw 批量出图、stat_lab 一次导出多张表、claw「帮我把这 30 篇拆成 30 个 md」。

#### (3) 根扫描预算耗尽 —— 按 readdir 顺序先到先得
- **判据**:`artifacts.ts:39-42` `ROOT_SCAN_MAX_DEPTH=6 / MAX_FILES=400 / MAX_DIRS=2000`;`:132` `if (depth > … || fileBudget <= 0 || dirBudget <= 0) return;`
- **有日志**:`artifacts.ts:163-171` `log.warn("artifact root scan budget exhausted", …)` —— 这是少数几条不静默的。
- **后果**:预算耗尽点由 readdir 顺序决定,**基线快照与当轮快照的截断点可能不同** ⇒ 既可能永久漏掉真产物,也可能把「基线里被砍掉、当轮里进来了」的旧文件误报成新产物(每轮重复发卡)。
- **boltslides 特别注意**:`node_modules` 是指向 `/opt/bolt-slides/node_modules` 的 symlink,`readdir(withFileTypes)` 下 `isDirectory()` 与 `isFile()` 都为 false ⇒ 整个分支被跳过(不是靠 DEEP_SKIP_DIRS 挡的)。这是巧合而非设计。

#### (4) 目录名撞上 `DEEP_SKIP_DIRS`(任意层整棵跳过)
- **判据**:`artifacts.ts:27` `ROOT_SKIP_DIRS = {out, uploads, references, node_modules, dist, dist-single, src, public}`;`:32-35` `DEEP_SKIP_DIRS = ROOT_SKIP_DIRS\{out} ∪ {__pycache__, venv, .venv, env, site-packages, target, build, vendor, tmp, cache, .cache}`;`:146` `if (DEEP_SKIP_DIRS.has(e.name)) continue;`
- **风险名单**:`src/`(用户让 agent 写代码工程)、`public/`、`build/`、`target/`、`vendor/`、`tmp/`、`cache/`、`env/`、`dist/` —— 这些**在任意层级**都被整棵跳过。
- **触发**:「帮我搭一个最小可复现工程」→ 产物写进 `src/`、`build/` ⇒ 永久不可见。
- **`references/` 与 `uploads/`**:被排除是对的(附件与引用物料),但**用户让 agent「整理我上传的文献」并把结果写回 `references/` 时同样丢失**。

#### (5) 根目录文件名撞上 `ROOT_SKIP_FILES`
- **判据**:`artifacts.ts:38` `ROOT_SKIP_FILES = {document.md, references.bib, terminology.md, index.html, README.md, CONTRIBUTING.md}`;`:150` `if (depth === 0 && ROOT_SKIP_FILES.has(e.name)) continue;`
- **触发**:用户说「给我写一份 README」「做个 index.html 落地页」「导出参考文献 references.bib」→ 模型顺手写到根 ⇒ **零帧、零搬运、零收割**。这三个是完全合法的用户诉求,当前被 prism/boltslides 的工作文件名单误伤。

#### (6) 点开头的文件/目录
- **判据**:`artifacts.ts:108`(out/ 顶层)与 `:142`(根扫描,**目录也跳**)。
- **触发**:`.output/`、`.reports/`、`.env.example`、模型自己起的 `.draft.md`。后端收割侧也排除(`claw/artifact.go:151-156`),口径一致,但同样意味着「点开头 = 永久不可见」。

#### (7) `stat()` 失败静默 skip —— 零日志
- **判据**:`artifacts.ts:114-119`(out/ 顶层)与 `:151-157`(根扫描),两处都是 `catch { /* skip */ }`。
- **后果**:**当轮快照**里漏掉 ⇒ 该文件本轮不发帧、越界物不被搬运;**基线快照**里漏掉 ⇒ 一个上一轮就存在的文件被误判为「本轮新增」并重复发卡。两侧都零日志,不可观测。
- **可触发性**:并发删除、容器磁盘 GC(会话 workdir 30 天 GC)、NFS/bind-mount 抖动。低频但真实。

#### (8) `copyFile` / `mkdir(out/)` 失败静默丢弃 —— 零日志
- **判据**:`artifacts.ts:280-284`
  ```ts
  try { await copyFile(join(workDir, d.path), join(outAbs, name)); }
  catch { continue; }  // 复制失败(文件已被删/权限)→ 丢弃该声明,不给用户死链接
  ```
  以及 `artifacts.ts:247-251` `mkdir(outAbs)` 失败 → `return deliverable.filter(d => d.path.startsWith("out/"))`,**同样零日志**。
- **对比**:同一函数里「改名」与「覆盖」两条**都有** `log.warn`(`:276`、`:278`),唯独真正的丢弃路径没有 —— 这正是本仓反复吃亏的「静默失败」形态。
- **可触发性**:会话磁盘配额(`workspace.ts:22-24` `SESSION_DISK_MAX_BYTES=1GB / SESSION_FILE_MAX_COUNT=2000`)—— 注意 `relocateStrays` 的 `copyFile` **不过** `assertSessionQuota`,所以配额不是这里的直接原因;真实原因是 ENOSPC / 源文件被同轮 Bash 删掉 / 权限。

#### (9) `outBaseline === null` ⇒ 整轮既不发帧也不过闸
- **判据**:`turnLoop.ts:179-183` `try { outBaseline = await snapshotOut(…) } catch { outBaseline = null }`,之后 `:954` 与 `:960` 两个分支都要求 `outBaseline` 真值。
- **实现上很难触发**(`snapshotOut` 内部把 readdir/stat 都 catch 了),但一旦触发就是**全静默**:没有任何日志说明这一轮的产物链路被整体跳过。列在此处是因为它是一条「零观测的全失效开关」。

### 2.2 只丢对话流里的卡片(右侧产物面板仍有 —— B 通道兜住)

#### (10) 异常终止轮:`emitArtifacts` 完全不跑 【最高频】
- **判据**:`turnLoop.ts:954` `if (!terminalSent && outBaseline)`;而 `sendError` 在 `:420-424` 立刻 `terminalSent = true`。
- **调用点**(全部走 else 分支,只跑闸不发帧):
  - `round_cap` — `turnLoop.ts:444`
  - `step_incomplete`(Run 引擎分页)— `:438`
  - `budget`(单轮 token 硬闸)— `:455`
  - `empty_turn` — `:950`
  - 上游/瞬态失败与 DSML 相关的其它 `sendError` 调用点(注释自陈「六个 sendError 调用点」,`turnLoop.ts:963-964`)
- **后果**:模型辛苦写了 20 轮、第 24 轮撞 `round_cap` ⇒ **对话流里那一轮下面一张卡都没有**,用户看到的是一句「系统正忙」。文件其实在 `out/` 里,靠右侧面板(error 帧同样 invalidate,`makeAgentConversationHook.ts:363-368`)才可能被发现 —— 但用户根本不知道要去看。
- **这几乎肯定就是用户反馈「进行文件输出在用户端看不到」的头号来源**:长任务恰恰最容易撞轮上限,而长任务恰恰最需要交付。

#### (11) 交付闸 enforce 隔离后的「拦截说明」不发帧
- **判据**:`deliveryGate.ts:181-213` 在 `out/` 写 `⚠️交付闸拦截说明.md`,但这发生在 `emitArtifacts` 已经取过 `current` 快照之后(`artifacts.ts:341` vs `:363`)⇒ 不在 `decls` 里 ⇒ 无帧。
- **后果**:enforce 档下用户在对话流里看到的是「报告卡凭空消失」,解释文件只在右侧面板。deliveryGate 的注释明确说这份说明是为了「用户在本该出现报告的位置看到解释」(`:171-176`)—— **而它恰恰不出现在那个位置**。
- 当前默认是 observe(`deliveryGate.ts:80`,需 `STATKIT_NUMCHECK_ENFORCE=1`),所以线上暂不发作;但这是一条已经写好、开关一开就错的路径。

#### (12) `out/manifest.json` 会被发成一张卡
- **判据**:`artifacts.ts:107-121` out/ 顶层扫描**不排除 manifest.json**(只排除点开头);backend `claw/artifact.go:151-156` `shouldListArtifact` 才排除它;前端 `MessageTurn.tsx:80-83` 找不到 DTO 时**用帧字段合成一张卡**。
- **后果**:模型按 claw prompt(`prompts/claw.go:135-137`)写 manifest 时,那一轮会多出一张名为 `manifest.json` 的卡片,而它是纯内部元数据。三层口径不一致(agent 发 / backend 不列 / 前端 fallback 合成)。

#### (13) 12MB–20MB 的产物:有卡但下不动
- **判据**:agent 侧 `emitArtifacts` **不做体积检查**(只有 BuildDeck 自己在 `registry.ts:879-883` 预检 12MB);backend `claw/artifact.go:54` `maxArtifactBytes = 12MB`(下载路径 `:362` 判定),agent `workspace.ts:11` `RAW_CAP = 20MB`。
- **后果**:>12MB → 帧发出、卡显示、点下载报错;>20MB → `ReadWorkspaceFileRaw` 回 `too_large`,`artifact_harvest.go:79-82` 静默 `return`,DTO 永远建不出来,卡片仍在(前端 fallback 合成)。**都是「看得到拿不到」的死按钮。**

#### (14) HTTP 导出端点在 turn 之外写 `out/`
- **判据**:`server/http.ts:299-335` `POST /api/sessions/:id/export-pptx` → `deckpptx.ts:155-179 / 185-204 / 212-245` 写 `out/<base>.{pptx,pdf}`。这条路径**不在任何 turn 里**,永远不产生 `artifact` 帧。
- boltslides 侧刻意排除了它(`backend/internal/boltslides/artifact.go:82-91` `shouldListArtifact` 额外排除 `.pptx/.pdf`),字节直接流回浏览器(`boltslides/handler.go:324-339`)—— 设计上自洽,但**文件永久留在会话 `out/` 里占配额且任何界面都看不到**。
- 注意 `boltslides/handler.go:267-269` 的注释仍写着「产物在下次 GetSessionArtifacts 收割时作为可下载 .pptx 出现」,与 `:324` 的注释矛盾 —— 文档漂移,以代码为准。

#### (15) 非 claw/boltslides/sci_draw/stat_lab 的 feature 根本没有产物面板
- **判据**:`frontend-user/src/features/claw/api/artifacts.ts:47` `ArtifactBasePath = '/user/claw' | '/user/boltslides' | '/user/sci_draw' | '/user/stat_lab'`;`backend/cmd/server/routes_user.go:332/361/380/399` 只有这四条 `session/artifacts` 路由。
- **后果**:prism / peerreview / smart_search 若写 `out/`,B 通道整条不存在;A 通道的帧是否被渲染取决于各自的 MessageTurn(prism 用自己的 `PrismMessageTurn.tsx`)。这条标 info —— 未实测那三个 feature 是否真写 out/。

---

## 三 `mtime + size` 判据会不会漏

判据在 `artifacts.ts:187`:

```ts
if (prev && prev.size === cur.size && prev.mtimeMs === cur.mtimeMs) continue; // 未变
```

### 3.1 「同一轮内容被改回原样」—— **不会漏,反而会误报**
每次 `writeFile` 都更新 mtime。写 A→写回原内容,mtime 相对基线**已经变了** ⇒ 判为「变更」⇒ 照常发卡。所以这个场景是**假阳性**(内容没变也发一张卡),不是漏报。

同类假阳性的常态化来源:
- sci_draw B 车道每轮重跑 python 脚本重新 savefig ⇒ 同一个 svg 每轮都发一张新卡;
- prism/boltslides 每轮重物化工作区文件;
- 基线快照与当轮快照的扫描预算截断点不同(§2.1(3))。

### 3.2 「秒内两次写同 size」—— 取决于文件系统时间戳精度,生产环境风险低
- `stat().mtimeMs` 在 Linux ext4/overlayfs 上有纳秒精度(`mtim.tv_nsec`),两次写不可能落到同一个 `mtimeMs` 浮点值。
- 生产挂载是 `./data/agent-sessions:/home/bun/sessions`(`docker-compose.yml:453`),宿主是 Linux ⇒ ns 精度。
- **真正需要同时满足的条件**:① 文件系统 mtime 粒度 ≥ 1s(macOS Docker Desktop 的某些共享驱动、部分 CIFS/NFS);② 同一文件在**基线快照的那一秒之内**被改写;③ 改写后 size 一字节不差。
- ③ 在 `Edit` 等长替换(改一个数字、改一个中文词)下很常见,但 ② 要求 LLM 一次往返在 1 秒内完成 —— 实际不可能。**结论:低风险,但这是一条「靠环境侥幸」的不变式,没有任何测试或断言保护它。**

### 3.3 真正会漏的两条(不是 mtime 的锅)
1. **`stat` 失败静默 skip**(§2.1(7))—— 快照里压根没有这个键,连比较都不会发生。
2. **目录 `dirSig` 聚合**(`artifacts.ts:68-94`):`size` 求和 + `mtimeMs` 取 max,`walk` 里 `readdir` 失败直接 `return`(`:73-76`)、`stat` 失败 `skip`(`:86-88`)。一个不可读的子目录会让整个签名少算它的贡献 ⇒ 该子目录内的任何变化都不体现在签名里。可达性低但机制是真的。
3. **删除永不上报**:`diffOut` 只遍历 `current`(`:184`)。模型删掉 `out/x.md` 不产生任何帧;而 backend 收割是 upsert-only(`artifact_harvest.go:28-33`),旧行也不删 ⇒ **一个已被删除的产物会永久留在右侧面板并且仍可下载**。这是「用户看到自己以为已删掉的旧版本」的机制。

---

## 四 「out/ 单一真源 + relocateStrays 复制」的代价

### 4.1 设计意图(原文)
```
// 为什么不直接上抛越界路径:backend 的产物链路(claw/artifact.go `artifactRelPath` 只认
// `out/<basename>`、`artifact_harvest.go` 只 list `out/`)是 out/ 单一真源 —— 上抛别处的路径
// 会给用户一张点了 404 的卡,比原来「没有卡」更糟。
```
—— `artifacts.ts:210-215`。下游约束属实:`backend/internal/claw/artifact.go:124-138` 的 `artifactRelPath` 只放行 `out/<basename>`。

### 4.2 🔴 核心代价:**模型编辑的路径 ≠ 用户下载的路径**

这是本次调研最重要的一条,直接对应用户说的「修改不到」和「INDEX-3.md 这类」。

**前提**:`deliveryGate.ts` 与 `artifacts.test.ts:229-231` 的注释都自陈 —— **「模型最常见的落点是会话根(`Write("MBI分析结果.docx")`)」**。也就是说「越界写入」不是边缘情况,是**主路径**。

**推演**(全部可从代码逐行推出):

| 轮 | 模型动作 | `relocateStrays` 行为(`artifacts.ts:264-287`) | `out/` 状态 | 用户看到 |
|---|---|---|---|---|
| N | `Write("报告.md", v1)` | stray → `occupied("报告.md")`=false → copy | `out/报告.md`(v1) | 卡 `报告.md` ✔ |
| N+1 | 用户「改第三节」<br>`Edit("报告.md", …)` **改的是会话根那份** | stray → `taken` 由 `current` 的全部 out/ 键播种(`:253`)含 `out/报告.md` → `occupied`=true → 改名 `报告-2.md` → copy | `out/报告.md`(v1)<br>`out/报告-2.md`(v2) | 卡 `报告-2.md`;<br>**旧卡 `报告.md` 仍在右侧面板、仍可下载、内容是 v1** |
| N+2 | 再改一次 | `报告-3.md` | 三份 | 三张卡 |

**结论**:
- 用户在第 N 轮下载的那份(`out/报告.md`)**永远不会被更新** —— 模型改的是 `<cwd>/报告.md`,用户拿的是 `<cwd>/out/报告.md`,两个 inode。
- backend 收割 **upsert-only,从不按 live 工作区删**(`artifact_harvest.go:28-33`),所以 `报告.md / 报告-2.md / 报告-3.md` 会**同时并永久**留在右侧产物面板。
- `-2/-3` 后缀最多加到 `-49`(`artifacts.ts:273` `i < 50`),之后 `log.warn("artifact relocate overwrites existing out/ file")` 并**覆盖**(`:274-276`)。
- 这条路径与 2026-08-02 实测的 `evidence/INDEX.md → out/INDEX-3.md、INDEX-4.md` 是**同一个机制**(`artifacts.ts:230-235`)—— 那次只是把「保留区」这一个源头堵上了,机制本身原封不动。

**注意反例**:如果模型**直接写 `out/报告.md`**(claw prompt 教的方式),`Edit("out/报告.md")` 走 `artifacts.ts:265-268` 的 passthrough 分支,路径不变、无副本、backend 按 `size:mtime` sig 更新同一行(`artifact_harvest.go:63-82`)—— 完全正常。**所以这条缺陷的严重度 = 模型不按 prompt 写 out/ 的频率**,而 deliveryGate 的注释已经承认那是最常见的情况。

### 4.3 「编辑改不到」的第二条独立机制:工具契约 + 上下文压缩

- **`Edit` 只替换第一次出现**:`registry.ts:235-238`
  ```ts
  const idx = cur.indexOf(oldS);
  if (idx < 0) return fail("edit failed: old_string not found");
  const next = cur.slice(0, idx) + String(input.new_string) + cur.slice(idx + oldS.length);
  ```
  没有 `replace_all`、没有 `expected_replacements`、没有唯一性校验、**没有 read-before-edit 契约**(对比 Claude Code 自身的 Edit 要求先 Read)。模型想改第 2 处出现,静默改掉第 1 处 —— 用户视角就是「改错地方了」。
- **模型对自己写过什么会失忆**:`compact.ts:38-41` 的 `TOOL_ARG_KEYS` 只保 `file_path/path/query/…`,`Write` 的 `content`(整篇文档)**不在名单里** ⇒ `describeToolCall`(`:53-74`)把一次 Write 折成 `file_path="报告.md"` 一行;`reduceForWindow`(`:316-355`)第一层就裁掉早于最近 keepTurns 的 tool_result 正文。长会话压缩后,模型手里只有文件名,`old_string` 只能靠记忆猜 ⇒ `edit failed: old_string not found`。
- **失败面向用户**:`runTools.ts:160-163` 的兜底摘要是「写入内容未成功。」—— 用户看到的就是一句无信息量的失败。

### 4.4 其它已确认的副作用

- **ExportDocument 每次都多送一张草稿卡**:模型 `Write("report.md")` 再 `ExportDocument(source_path="report.md", target_format="docx")`(`registry.ts:713-776`)⇒ 同轮 diff 里既有 `out/report.docx` 又有越界的 `report.md`(`.md` 在 `DELIVERABLE_EXTS` 里)。`diffOut` 的中间态降噪(`:198-206`)只压 `X.docx.md` 这种形态,**压不掉 `report.md` vs `report.docx`** ⇒ 用户拿到两张卡:成品 + 草稿。再改一轮就是 `report-2.md`。
- **保留区排除是对的但只是补丁**:`artifacts.ts:242-243` `deliverable = decls.filter(d => !inReservedLexical(d.path))`。2026-08-05 的修复注释(`:236-241`)记录了上一版「过滤条件写对了但过滤结果没被用在复制循环里」的经典事故 —— 说明这段逻辑的耦合面很脆。
- **`relocateStrays` 只搬不删**:原件永远留在会话根。于是 §4.2 的双份是**结构性**的,不是竞态。
- **交付闸的隔离可被自己撤销**:`deliveryGate.ts:149-166` 把 `out/x.docx` rename 进 `analysis/quarantine/`,但**会话根的原件没动**;下一轮模型 `Write` 一下原件,`relocateStrays` 就把它再抄回 `out/`(此时 `occupied("x.docx")`=false,连后缀都不加)。闸会再次拦下,形成乒乓 —— 不是绕过,但每轮都白跑一次 statkit。标 info。

---

## 五 系统提示词 / 工具 description 里怎么跟模型描述 `out/`(原文)

### 5.1 claw system prompt —— 唯一带「绝不暴露路径」铁律的一份
`backend/internal/prompts/claw.go:107-138`(逐字):

```
# 你如何把成果交给用户 (重要 —— 与上面"附件协议"对称)
你在为一个**通过网页聊天界面**访问 Scholay 的远程用户服务, 不是本地终端。务必牢记:
- 你的当前工作目录是一块**私有、临时的草稿盘**(会话结束即清空): 用它读写、组织
  中间文件都很好, 但用户**看不到、打不开**它, 也不会自动收到里面的东西。
- 真正能交给用户的有两条路:
  1. **聊天回复正文** —— 解释、结论、较短的结果直接写在回复里 (规范 Markdown)。
  2. **交付文件** —— 当你产出一份用户应当能【下载 / 留存】的成品 (整理好的综述、
     对比表、数据文件 csv、整理稿等), 就把它**写进 ./out/ 子目录**。凡是写进 ./out/
     的文件都会作为**可下载产物**呈现给用户。
- 因此: 长篇 / 结构化 / 适合留存的成品 → 写进 ./out/; 同时把关键内容 / 结论也在回复正文里
  给出, 别让用户为了看结果非下载不可。支持的交付类型很广: 文本类(md / txt / csv / json /
  代码等)、图片、以及 PDF / Excel(xlsx)/ Word(docx)/ 压缩包等二进制 —— 都能下载, 多数还能在线预览。
- **【铁律 · 绝不暴露内部路径】** 用户看到的是聊天界面, **没有**文件管理器、没有"文件面板"、
  没有"IDE"、没有"左侧目录"、看不到任何路径。写进 ./out/ 的文件会**自动作为下载/预览卡片**出现在
  你这条回复正下方 —— 这是唯一的交付方式, 你**不需要、也绝不可以**在正文里:
  · 提及任何文件系统路径 / 目录名(不写 "./out/"、不写 "已保存到 xxx.svg"、不写绝对路径、
    不写 "根目录 / 工作目录 / 当前目录");
  · 提及 "文件面板 / 文件树 / IDE / 左侧 / 同步到 …" 等**你这个运行环境**的内部概念(用户界面里没有这些)。
  正确说法是**只说成果本身**: "已为你生成《锂电池综述》, 可在下方查看或下载" / "对比表已生成, 见下方卡片"。
  错误说法(禁止): "文件已保存到 ./out/report.md" / "已同步到根目录" / "在左侧文件面板查看"。
- **【铁律 · 先写后说】** 只有当文件已经真的写进交付区 (./out/), 才允许说「已生成 / 可下载 /
  见下方卡片」。宣称必须发生在写入之后。写入失败就如实说「导出失败」并把内容放正文,
  绝不编造补救办法 (「用 Word 直接打开 .md 会自动保留格式」这类说法是错误的, 禁止)。
- **多个独立成品就各写各的扁平文件**: 直接放在 ./out/ 根下(如 ./out/综述.md、./out/对比表.csv),
  每个文件都会成为**一张独立的下载 / 预览卡片**, 用户各取所需。**只有**当多个文件确实是一个
  **必须打包在一起的层级化整体**(例如带子目录的项目、配套的图 + 数据集)时, 才放进一个子目录
  ./out/<名字>/(整目录会作为**一个 zip** 一起下载)。不要为了"打包"把本可独立交付的文件硬塞进
  子目录; 也不要建多层深目录。
- (可选, 推荐) 想让下载卡片有更友好的标题/说明, 就在 ./out/manifest.json 里写一份清单:
  {"artifacts":[{"file":"review.md","title":"锂电池固态电解质综述","description":"近三年对比"}]}
  —— 后端据此给对应产物配标题; 不写也行 (默认用文件名)。manifest.json 自身不会作为产物列出。
- ./out/ 之外的工作目录文件一律视为**草稿**, 不会交付; 不需要给用户的中间产物别放 ./out/。
```

### 5.2 sci_draw system prompt —— 反复教裸 `out/`,且**没有**任何禁提路径的铁律
`backend/internal/prompts/sci_draw.go`(节选,逐字):

- `:18` `用户用自然语言描述一张图,你生成一份**原创的、通用科学画风**的图,写进工作目录的 ./out/ 交付。`
- `:27` `- 严格照 figures 技能的配方 schema;写到 out/<名字>.fig.json(**不是 .svg、不写坐标**)。`
- `:39` `   B 路径:写 python 脚本到 out/<名字>.py,用 Bash 跑 python3 渲染成 out/<名字>.svg;报 traceback 就改脚本再跑到成功。`
- `:40` `   C 路径:按 molecules 技能用 RDKit 从用户给的 SMILES 渲染 out/<名字>.svg。`
- `:63-64`
  ```
  - **路径铁律(务必照做)**:产物一律写到**相对路径 out/<名字>**下(A 车道用 out/<名字>.fig.json,B/C 用 out/<名字>.svg,相对当前会话工作目录)。
    **绝不要**写成绝对路径 /out/...(斜杠开头是绝对路径,会越界写入失败)、也不必加 ./ 前缀。文件工具的 path 直接给 out/xxx 即可。
  ```
  ⚠️ 最后这句 **「也不必加 ./ 前缀」** 是把模型主动训练成写裸 `out/xxx` —— 而前端的出口清洗 `stripContainerPaths` **恰恰只清 `./out/` 不清裸 `out/`**(见 §5.5)。

`grep "暴露\|铁律"` 全文确认:sci_draw.go 里**没有**「绝不暴露内部路径」这条。

### 5.3 stat_lab / boltslides —— 各自独立的 prompt,同样没有该铁律
- 四个 feature 各挂各的静态 prompt:`internal/claw/spec.go:178`、`internal/scidraw/spec.go:133`、`internal/statlab/spec.go:153`、`internal/boltslides/spec.go:130`,全部 `agentbridge.NewStaticPicker(…, prompts.XxxSystemPrompt)` —— **claw 的那段不会被复用到别的 feature**。
- `prompts/stat_lab.go` 全文 100 行,**只字未提交付目录**(唯一的 `out/` 出现在 `:22` 的 Go 注释里,不进 prompt)。模型对交付落点的全部认知来自 skill 与工具 description。
- `prompts/bolt_slides.go:48` 只有一句 `别贴文件路径/技术细节。`

### 5.4 工具 description / 回执原文(这些都会进模型上下文,且回执会进 UI)

| 位置 | 原文 |
|---|---|
| `registry.ts:198` Write.description | `Write (create or overwrite) a UTF-8 text file within the session working directory. To deliver a file to the user, write it under ./out/ .` |
| `registry.ts:219` Edit.description | `Replace the first occurrence of old_string with new_string in a file (exact match).` ——**只字未提交付目录,也未提 read-before-edit** |
| `registry.ts:248` Glob.description | `List files matching a glob pattern within the session working directory.` |
| `registry.ts:338` Bash.description | `Run a shell command in the session working directory. Only available when allowBash is set (claw).` |
| `registry.ts:691-695` ExportDocument.description | `Convert a source file (Markdown, HTML, or plain text) in the session working directory into a deliverable document. target_format: docx \| pptx \| odt \| rtf \| epub \| html (pdf requires a PDF engine; falls back with a message if unavailable). **The output is written under ./out/ (the user-delivery directory)** and its relative path is returned. Use this to produce downloadable files for the user — do NOT shell out to pandoc.` |
| `registry.ts:831-836` BuildDeck.description | `Build the current bolt-slides presentation into ONE self-contained HTML file delivered to the user. … **It compiles the Vite/React deck and writes a single inlined .html into ./out/ (the user's download/preview area)** — you do NOT run npm/vite yourself; this tool does it. …` |
| `registry.ts:1554-1562` StatReport.description | `Render the deliverables from a result bundle produced by StatRun: a Word three-line table (.docx), a Markdown Results/Methods section, and a standalone reproduction script (analysis.py). ALL numbers come from the bundle — you must NOT retype or reformat them yourself. …` |
| **成功回执** `registry.ts:776` | `` exported ${outRel} (${st.size} bytes) — delivered to the user's download area.`` → 实际字符串形如 `exported out/报告.docx (48213 bytes) — delivered to the user's download area.` |
| **成功回执** `registry.ts:898` | `` Deck built and delivered: ${outRel} (${st.size} bytes). The user can now preview it in the panel and download it. …`` → `Deck built and delivered: out/deck.html (…)` |
| **失败回执(Bash 沙箱闸)** `registry.ts:357` | `你仍可用 Read/Write/Edit/ReadDocument 完成不依赖 shell 的部分,并把已完成内容写入 out/ 供用户下载。` |
| **失败回执(导出闸)** `registry.ts:513-516` | `导出功能暂时不可用(执行环境维护中)。请先确认完整内容已用 Write 落盘为 out/<名称>.md, 再如实告知用户:『文档导出暂时维护中,我已把完整内容保存为 Markdown 文件,可直接下载查看;导出恢复后可再生成 docx/pdf。』…` |

⚠️ 注意最后两条:它们是**在最容易被模型原样复述给用户的时刻**(工具失败、要向用户解释)注入的,且用的是**裸 `out/`**。`turnLoop.ts:145-149` 的 `toolFailLine` 只禁止「复述错误原文与内部环境细节」,没有明确点名路径。

### 5.5 前端出口清洗的缺口(把上面这些串起来)
`frontend-user/src/shared/lib/strip-container-paths.ts:9-11`(逐字注释):
```
 * **刻意极度保守**:只处理**无歧义**的容器内部路径 —— 显式 `./out/` 交付目录前缀、以及容器绝对
 * 根(/home、/workspace…)。不碰裸 `out/`(可能是 checkout/ layout/ 的一部分)、不碰普通 prose、
 * 不碰 URL。宁可漏清洗,不可误伤正文。仅 claw 使用(prism 的文件树/路径是合法用户概念,不清洗)。
```
正则:`:15` `const REL_OUT = /`?\.\/out\/([^\s`)）]+)`?/g;`

**闭环**:系统自己(sci_draw prompt `:64`「也不必加 ./ 前缀」+ 全部工具回执)训练模型写**裸 `out/`** → 清洗器**只清 `./out/`** → 裸 `out/` 原样怼到用户脸上。这就是「会话中经常出现 agent 说文件输出到 out 目录下」的直接机制。

另外,工具回执本身也在 UI 里可展开:`ToolCallBlock.tsx:202-217`(展开区渲染 input + result 两段折叠),`:241` 只对**错误预览**走 `maskToolSource` + `stripContainerPaths`(`:230`)—— 成功回执的 `out/xxx` 走的是默认 `CollapsibleJSON`,不经清洗。

---

## 六 给新架构的硬约束(从取证里直接读出来的)

1. **「帧」与「收割」必须合一,否则永远有第三种状态。** 今天 A/B 两条通道的覆盖面不同(帧有 20 上限/扩展名白名单/黑名单目录;收割只看 out/ 顶层物理存在),任何一条改动都会制造新的不一致。`deliveryGate` 的整段设计(`deliveryGate.ts:3-9`)就是被这个二元性逼出来的:「压帧是假闸,必须动盘上的文件」。
2. **不要靠「扫描 + 启发式识别」判定什么是产物。** 当前 4 个黑白名单(`DELIVERABLE_EXTS` / `ROOT_SKIP_DIRS` / `DEEP_SKIP_DIRS` / `ROOT_SKIP_FILES`)+ 3 个预算 + 1 个帧上限,每一条都是一个静默丢失面。**产物应当由工具调用显式声明**(例如一个 `Deliver(path, title, description)` 工具或 Write 的 `deliver: true` 参数),让「什么是给用户的」成为一等公民而不是事后猜。
3. **交付物必须有稳定身份(id),不能用路径当主键。** 当前 dedup anchor = `sessionID + relPath`(`artifact_harvest.go:63`),于是「改名 = 新产物」「重命名躲后缀 = 新产物」「删除 = 永不消失」。有 id 之后,「同一份文件的第 2 版」才能替换第 1 版的卡,`-2/-3` 后缀问题自动消失。
4. **模型看到的路径与用户拿到的东西必须是同一个对象。** 只要还存在「复制进 out/」这一步,§4.2 的分叉就无法根除。可选解法:落盘时就 confine 到交付区(Write 带 `deliver` 时直接写 out/)、或用硬链接/inode 级绑定、或让 relocate 变成 **move + 在原位留 symlink**(模型后续 Edit 打到同一个 inode)。
5. **产物的存在与否不能取决于「本轮结不结得成」。** `turnLoop.ts:954` 那个 `!terminalSent` 守卫必须去掉 —— 异常轮才是最需要把已产出内容交给用户的时候。
6. **`out/` 这个名字不该出现在模型的任何输入里。** 只要它在 description/prompt/回执里,就会以某个概率出现在正文里,而出口清洗永远是打地鼠。正解是让模型调一个**没有路径概念**的交付动作。
7. **`Edit` 需要 read-before-edit 契约 + 唯一性校验**,并且压缩层必须为「被编辑过的交付文件」保留可寻址的存根(现在 `compact.ts:38-41` 连 `content` 键都不在保留名单里)。

---

## 附:本次实读文件清单

`agent/src/turn/artifacts.ts` · `artifacts.test.ts` · `turnLoop.ts`(1-240 / 340-460 / 780-1060) · `deliveryGate.ts` · `deliveryGate.test.ts` · `runTools.ts` · `compact.ts`(25-99) · `types.ts` · `leakGuard.ts` ·
`agent/src/tools/registry.ts`(1-420 / 470-940 / 1440-1638) · `agent/src/server/workspace.ts` · `agent/src/server/http.ts` · `agent/src/sandbox/{confine,reserved,bwrap,profile}.ts` · `agent/src/policy/featurePolicy.ts` · `agent/src/render/deckpptx.ts` · `agent/stat-kit/statkit/paths.py` ·
`backend/internal/claw/artifact.go`(部分) · `artifact_harvest.go` · `backend/internal/boltslides/{artifact,handler}.go`(部分) · `backend/internal/agentbridge/hub.go:2060-2100` · `backend/internal/prompts/{claw,sci_draw,stat_lab,bolt_slides}.go` ·
`frontend-user/src/features/claw/components/chat/{fold.ts,MessageTurn.tsx,TurnArtifacts.tsx}` · `src/features/claw/api/artifacts.ts` · `src/features/claw/hooks/makeAgentConversationHook.ts` · `src/shared/lib/strip-container-paths.ts` · `src/shared/components/chat/{ToolCallBlock.tsx,tool-semantics.ts}`
