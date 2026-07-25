# 科研绘图 feature 落地规划（方案，不含代码）· v2 仿 boltslides 集成

> 本文是 [REPORT.md](REPORT.md)（总调研）+ [MEDICAL.md](MEDICAL.md)（医学专项）的落地规划。
> **v2 修订（2026-07-21）**：集成形态改为**仿 boltslides（制作PPT）**——后端独立 feature + **前端作为智能助手(claw)页内的一个 mode**，复用 boltslides 已铺好的「claw 内多 feature」地基，不再做独立会话页。
> 范围：**自己生成原创矢量（SVG/TikZ）+ 确定性数据渲染，不做授权图标库拼装**。原则：复用地基、最小新建、合规在生成时硬闸。

---

## 〇、一句话与范围

**做一个挂在 agentbridge 上的 `sci_draw` 独立 feature，UI 以「科研绘图」模板卡的形式并入智能助手页（完全仿 boltslides 的集成方式），把「一句话/一份数据 → 可交付、可编辑、内容忠实的科研矢量图」跑通；医学不单独成线，靠路由器 + 合规硬闸吸收。**

**在范围内（做）**：
1. **确定性渲染 L1**：数据图/统计图（matplotlib/plotly 代码执行）、分子（RDKit）、（P3）蛋白 3D/通路/解剖。产物=从真实数字/坐标渲的原创矢量，零版权、正确性最好。
2. **生成原创矢量 L2**：流程/机制/概念示意——agent 自己写 SVG/TikZ/mermaid，通用画风、零依赖。
3. **合规硬闸 + 交付 + 计费 + 可编辑**。

**不在范围内（不做）**：
- ❌ 不拼装/再分发任何第三方版权图标库——生成我们自己的原创矢量即可。
- ❌ 不做写实精细解剖/手术插画的自由生成（LLM 手写 SVG 画有机形态很烂）——降级示意级，或 P3 用开放几何源（BodyParts3D）确定性渲染。
- ❌ 不生成或修改病理/放射/显微/凝胶 blot 等**原始一手证据图**（出版社硬红线，入口即拒）。
- ❌ 不做独立导航项 / 独立会话页——**UI 就是 claw 页内的一个 feature-mode**（避开跨 feature import 铁律，仿 boltslides）。
- ❌ 不做拖拽式重前端画布编辑器——只做「双击元素→属性对话框」轻编辑。

**IP 铁律**（系统提示级）：生成**通用科学画风**原创矢量（画风/思路不受版权保护，安全）；**禁模仿任何指定受版权作品**（某张 Netter 图版、某个具体 BioRender 图标 = 衍生作品风险）；不拟真特定商用器械品牌。

---

## 一、集成方式：仿 boltslides 做成智能助手内的一个 mode（本次修订核心）

boltslides（制作PPT）已经趟出并铺好了「**后端独立 feature + 前端并入 claw 页多 feature**」的完整范式（2026-07-21 重构成「统一对话 + 模板卡 + 合并历史」的现行形态）。sci_draw 照抄这条路，**大部分地基是现成的**。

### 1.1 后端：独立 feature（与 claw/boltslides 同型，各自 session 池）

照 boltslides 一比一复制结构：
- `internal/scidraw/{spec,handler,artifact}.go` + `internal/prompts/sci_draw.go`，镜像 `agentbridge.FeatureSpec`。
- `bootstrap.go`：`sciDrawSpec := scidraw.BuildSpec()` → `sciDrawFeature := agentBridge.For(sciDrawSpec)` → `scidraw.NewHandler(sciDrawFeature, agentartifact.NewRepository(db))`；`SetUsageRecorder` / `SetVIPChecker` / 进 `VIPCheckerWired()` fail-fast 断言图（漏接配额启动即崩，防白嫖）。
- `routes_user.go`：挂一整套与 boltslides **同型**的 `/sci_draw/*` 路由（session GET/reset/messages/context/artifacts、artifact/:id 下载、session/artifact 实时回退、ws-ticket、sessions CRUD/activate、models、ws）。产物端点照 claw/boltslides `artifact*.go` 抄。
- **独立 session 池**（`feature_key='sci_draw'`），与 claw 会话模型解耦。

### 1.2 前端：并入 claw 页，不新增导航（现行「模板卡 + 合并历史」形态）

boltslides 2026-07-21 已把「顶部 `对话/制作PPT` tab」下线，改成下面这套——sci_draw 直接**加一项**即可：
- **模板卡**（`components/chat/TemplateCards.tsx`）：新对话空态下 composer 下方的扑克扇里，**加一张「科研绘图」卡**（可配 framer-motion 循环示意动画，仿 PPT 卡）。选卡=切到 `sci_draw` feature 起空白新对话。「即将推出更多」占位卡照旧。
- **合并会话历史**（`components/sidebar/UnifiedSessionList.tsx`）：claw + boltslides + **sci_draw** 三 feature 会话合并一份、按 `lastAccessedAt` 倒序，sci_draw 行带一个小图标（如 `Image`/`PenTool`，仿 PPT 的 `Presentation` 小图标）。点某条→切到它所属 feature 并激活；重命名/删除按行 feature 路由。
- **页层驱动**（`pages/ClawPage.tsx`）：已持 `feature + seed + nonce`、workspace `key=${feature}:${nonce}` remount——**把 `sci_draw` 加进 feature 枚举**即可，seed/nonce 机制照用。
- **克隆 hook**（`hooks/useSciDrawConversation.ts`）：从 `useClawConversation` 机械 sed（~15 行：4 import + 3 字面 'claw' + 4 queryKey 根 + `opts.initialSessionId` 已是可选参数，向后兼容）。
- **session/socket**（`api/sci-draw-session.ts`）：走 shared `makeAgentSessionApi({feature:'sci_draw', basePath})` + `makeAgentSocketHook`。blocked-msg/pendingInitialModel 按全局唯一 sessionId 键共用；新对话默认模型偏好用 sci_draw 自己的 localStorage 命名空间。
- **产物预览**：复用 `ClawArtifactPanel`/`ClawArtifactPreview`（**SVG/PNG/PDF 已原生分派**，`basePath` 已参数化）。
- **附件**：sci_draw **需要**上传（数据文件 / 参考图）→ `ChatComposer` 的 `enableAttachments=true`（与 PPT 相反）。**但 `ChatComposer` 上传端点历史硬编码 `/claw/upload`**（boltslides 靠 `enableAttachments=false` 绕开）——sci_draw 开附件须**把上传端点按 `basePath` 参数化**并加 `/sci_draw/upload`（这条是 `composer-unify` 记忆里点名的 P0 窟窿，本 feature 必须补）。
- **枚举补项**：`ModelFeatureKey` / `FeatureChannel` 前端 union `+= 'sci_draw'`。

### 1.3 目录与产物工具：区分「固定操作用工具、任意代码进 jail」

boltslides 用 `AllowBash=false` + 一个 **BuildDeck 执行器工具**（进程内、**非 bwrap jail**，故能访问 jail 外 `/opt` 的 symlink；固定命令 `npm run build:deck`）。这条经验对 sci_draw 要**分两种情况**用，别照单全收：

- **固定渲染操作 → 仿 BuildDeck 做成专用非-jail 工具**：如 L2 的 SVG→PNG 光栅化、导出。**固定操作**，非-jail 安全。
  - 但注意：**P0 的 L2 甚至不需要工具**——agent 直接用 `Write` 写 `.svg` 进 `out/`，被收割，前端 DOMPurify 内联渲染即可显示（SVG 不必先光栅化）。光栅化只在 P2 的视觉回灌 + 可选导出时才需要。
- **任意绘图代码（L1 matplotlib）→ 必须进 bwrap jail 跑，不能仿 BuildDeck 放进程内**：BuildDeck 能非-jail 是因为它跑**固定命令**；L1 是**任意 LLM 生成的 python**，非-jail 跑任意代码是安全降级。故 L1 走 **`AllowBash=true`（jailed，断网+cwd jail）**，matplotlib 系统级 apt 装进镜像后在 jail 内可见（不同于 `/opt` symlink 需特殊处理）。这与总报告一致，claw 已用 `AllowBash=true` 走通同一条 jail 路。

**⚠️ 照抄 boltslides 的三个「加工具必同步」硬坑**：
1. **后端权限闸**（`agentbridge/ws.go` 的 `permissionAllowed`）是**硬编码工具白名单**——任何新执行器工具（如光栅化工具）**必须同步在此放行**，否则真实 WS 轮次里 `permission denied`、工具 DOA（只在首轮真实生成暴露，执行器 API 直连烟雾测测不到）。
2. **`agent.Executor` 接口**（`internal/agent/executor.go`）——给 `*Client` 加新方法后必须同步加到 Executor 接口，否则 handler 调不到（编译错）。
3. **执行器工作区易失**：会话 cwd 临时、重启/TTL 即清，产物耐久在 MinIO。**凡「读执行器 cwd 里 agent 早先产物」的二次操作（导出/再编辑），须先从 MinIO 回灌进 cwd 再做**。

### 1.4 会话耐久（现在默认就对，一个坑被前人填了）

`agent-session-durability-journal-2026-07`：durable 事件日志（`agent_turns`/`agent_turn_events`）**已改成默认真源**（写恒开 + 读默认折叠），不再由 env 名单决定——根因正是 boltslides 当年漏进 executor 名单导致重建后历史读空。**含义**：sci_draw 新 feature 自动获得耐久历史，**不用再操心 env 名单**（这个坑已被前人填平）。

---

## 二、总体架构（三车道 + 横切合规）

```
用户请求（自然语言 / 上传数据 / 上传参考图）——入口在智能助手页「科研绘图」模板卡
        │
        ▼  医学/通用 图类型路由器（输入① 子类  输入② 目标期刊/用途）
    ┌───┼───────────────┐
 (d)硬闸  L1 确定性渲染      L2 生成原创矢量
 入口即拒  ├数据/统计图(matplotlib/plotly, AllowBash jail)
 +PHI     ├分子(RDKit)              agent 写 SVG/TikZ/mermaid
          └(P3)蛋白Mol*/通路Reactome/解剖BodyParts3D
        └───┬───────────────┘
            ▼ 校验（双层）：确定性执行器在前 →(P2)VLM critic 回灌
            ▼ 可编辑中间表示（(P2)场景图 JSON / 可再编辑 SVG）
            ▼ 交付：写 ./out/ → claw artifact-harvest → MinIO → ClawArtifactPreview
            ▼ 合规层（横切）：披露元数据 + 期刊政策矩阵 + 免责声明
```

**四块复用地基**：agentbridge（feature 桥接）、claw artifact-harvest→MinIO（交付）、**boltslides 已铺的 claw 内多 feature 前端地基**（ConversationWorkspace/UnifiedSidebar/TemplateCards/克隆 hook/basePath 串线）、计费三层。

---

## 三、关键前置与技术决策

> ⭐ = 上线前必须先拍板/先落实的硬前置。

**决策 1 ⭐ 容器绘图运行时（P1 硬阻断）。** `agent/Dockerfile` 已确认：有 python3，**无 matplotlib/numpy/pandas/plotly，无 texlive，无 rdkit**；运行期断网 bwrap jail 不能 pip/apt。→ 确定性依赖**构建期烧进镜像**（apt `python3-matplotlib python3-numpy python3-pandas`，rdkit 用 `python3-rdkit`/构建期 pip，须在阿里云/npmmirror 镜像下验证可 fetch，见 `prod-apt-mirror-clash-fakeip`）。**先例=boltslides 补 node + 预置 /opt/bolt-slides**，照抄「构建期预置 + 运行期零安装」。**L2 生成 SVG 不需要任何新运行时**，故 P0 先跑 L2，P1 再补 L1 运行时。

**决策 2 ⭐ 会话归属（已定，照 boltslides 做）。** `sci_draw` 走 **user-level 多会话**（对齐 claw/smart_search/boltslides）。**必做**：迁移 `0034` 三处 `NOT IN (...)` 排除名单**加 `'sci_draw'`** + 新增 `00XX_agent_sessions_scidraw_multi.sql`（照 `0070`/`0076` 守卫式 MODIFY 修既有库）。**不加则 CreateNewSession 撞 1062 + 0034 去重 DELETE 每次重放把多会话行删到剩一行**（`smart-search-multisession`/boltslides 原样坑）。编号取当前最大+1。

**决策 3 TikZ 编译。** 本容器无 LaTeX；需 TikZ 时**复用 prism 的独立 `prism_tex`（network_none）沙箱**，不在 `scholar_agent` 另起 texlive。多数示意图用 SVG，TikZ 仅「要进 LaTeX 论文」时用。

**决策 4 视觉自校验回灌原语（P2 新建）。** 现有 `agent/src/render/math.ts` 的 `@resvg/resvg-wasm` 只 SVG→PNG 返 base64，**不落 out/、不回灌视觉**；上传视觉通道只读传入附件、拒 SVG。→ P2 新建 session-bound 原语：把 out/ 图光栅化落文件 + 作为 image block 回注上下文，才能做「render→看→改」。这就是仿 BuildDeck 的固定操作专用工具（非-jail 安全）。

**决策 5 模型目录绑定。** 加 `PurposeChatDefaultSciDraw`（modelcatalog 常量集 + `ListUserModels` switch）+ `usagestat.FeatureSciDraw` + 种子绑定迁移（仿 0063），否则无 per-feature 模型/用户选择器（静默回落全局默认）。

**决策 6 ⭐ MinIO 依赖。** storage 关闭时 live 回退拒 SVG/PDF/PPTX → 绘图实质依赖生产 MinIO 开启，P0 前置确认。

---

## 四、合规与安全设计（横切，P0 就要有）

> 结论：**合规必须在生成时强制**（Frontiers 大鼠图过了评审 3 天后才撤）。合规层是 P0 地基。

1. **(d) 入口硬闸（非可覆盖）**：路由器分类阶段拒绝「合成或修改原始组织学/病理/放射/显微/凝胶blot」，不进任何生成管线。
2. **PHI 去标识 linter**：涉患者数据/上传图的路径，剥 DICOM/EXIF 元数据 + 查图上 PHI 文本；**绝不依赖遮眼**（ICMJE：遮眼「inadequate」）。
3. **披露元数据自动生成器**：每图带「AI 工具+版本+用法」元数据，一键注入 caption/Methods。
4. **期刊政策矩阵**：导出时选规则集——Elsevier 三分类（示意允许+披露）/ Nature·Science·Cell（生成式图像通盖禁→关 L2 生成车道）/ RSNA·JAMA·NEJM·Lancet（披露或禁）。**顶刊时整条 L2 关闭，只留 L1 确定性。**
5. **IP 护栏（系统提示级）**：通用画风原创矢量；禁模仿指定受版权作品；不拟真特定商用器械品牌。
6. **产物定位**：UI 明示「可编辑草稿、人类须核验」，不宣传「一键投稿终稿」；援引出版政策只用已核实逐字来源（Elsevier/ICMJE/Springer Nature）。

**落地形态**：期刊政策矩阵先做后端静态配置（仿 `internal/prompts`），admin 可编辑留后期；(d) 闸 + PHI linter + 披露生成器做成 `internal/scidraw` 内独立小模块，被路由器前置调用。

---

## 五、分期路线图

> 每期独立交付价值。P0 刻意选「零新容器依赖」的 L2 车道先跑通全链路 + 合规地基。

### P0 · 集成骨架 + 合规 + 生成原创 SVG MVP（无需重建镜像）
- **前置（硬）**：确认 MinIO（决策 6）；落决策 2 的 0034 排除 + 新多会话迁移。
- **范围**：`sci_draw` 后端 feature 骨架（§1.1）+ 前端并入 claw 页（§1.2：模板卡 + 合并历史 + ClawPage feature 枚举 + 克隆 hook + session api + 附件端点参数化）+ 合规层（(d) 闸/PHI/披露/期刊矩阵）+ **L2 生成 SVG**（agent 写 SVG 进 out/，前端内联预览）+ 计费三层自动。
- **复用**：agentbridge、claw 交付、**boltslides 已铺的 claw 多 feature 地基**、`ClawArtifactPreview`、计费三层、resvg。**零新容器运行时；P0 无需新执行器工具**（只用已白名单的 Read/Write/Edit/Glob/Grep）。
- **新建**：`internal/scidraw/{spec,handler,artifact}` + `prompts/sci_draw` + `router`（分类+期刊门控）+ `compliance`（PHI/披露/矩阵）；bootstrap/routes 挂载；模型绑定迁移 + 多会话迁移；前端模板卡 + 克隆 hook + `sci-draw-session.ts` + UnifiedSessionList 图标 + ChatComposer 上传端点参数化 + union 补项；绘图 skill 目录。
- **验收**：①点「科研绘图」卡起会话 → agent 写 SVG → out/→MinIO → 前端内联预览端到端通；②合并历史里 sci_draw 会话正确显示/切换/重命名/删除；③配额扣减 + `llm_token_usage` 账本可见；④(d) 闸拒掉「改病理图」；⑤披露元数据附 caption；⑥期刊选 Nature 时 L2 关闭。

### P1 · 确定性渲染车道（重建镜像，正确性最高价值）
- **前置（硬，决策 1）**：镜像构建期烧入 matplotlib+numpy+pandas+rdkit，**断网 jail 内实测**能渲 PNG/SVG/PDF。
- **范围**：**L1**——数据图 + **临床/统计图（KM/森林/ROC/漏斗，医学最高频最高 ROI）** 走 matplotlib/plotly（`AllowBash=true` jail）；2D 分子走 RDKit。单层执行器校验（跑→捕获 traceback→repair）。
- **复用**：P0 全部；claw 的 `AllowBash` jail 路径（Bash 已在权限闸白名单）。
- **新建**：L1 渲染 skill/模板（含医学统计图模板库）；执行器 repair 循环；Dockerfile 运行时层。
- **验收**：本地语料 N≥30（覆盖各图型 + KM/森林/ROC + 3–5 脏数据）；①执行成功率 ≥90%（run-error ≤10%，后续收紧）；②模型只选数据列/参数不发明数字（抽验）；③预览无误。

### P2 · 校验闭环 + 可编辑中间表示
- **范围**：第二层 VLM critic（决策 4 视觉回灌原语，**这是新执行器工具→必须进权限闸白名单 + Executor 接口**）；场景图 JSON + 前端「双击元素→属性对话框→写回」轻编辑。
- **复用**：resvg、attachments 视觉通道机制、prism `MathEditorDialog` round-trip 范式、prism `Figure` 原子节点扩展点、DOMPurify SVG、`ZoomableSvg`。
- **新建**：session-bound 光栅化+回灌原语；结构化 grounded 批评提示 + 迭代上限 ~3 + last-good + 指标闸门；场景图 schema + SVG 渲染层 + 属性编辑对话框。
- **验收**：先定义语义忠实评分（轴标签/图例/数据点数量 vs 输入规格逐项一致率）+ 无障碍检查（CVD 色盲模拟/字号对比）；P2 相对 P1 忠实率统计可测提升 + 无「越改越差」回归；场景图双击改文本/颜色/位置 round-trip 无损。

### P3 · 外部确定性源 + 3D + prism 深整合 + 可选导出（按需）
- **范围**：通路（Reactome REST exporter / WikiPathways，**后端 HTTP client 调公共 API，仿 minicod，须可用性/限速兜底+缓存**，避开 KEGG 商用许可）；蛋白 3D（Mol\* headless，**重型容器化或独立渲染 sidecar，非平凡**；PyMOL 作可选批量高保真）；解剖示意（BodyParts3D/Anatomography 确定性视角 API，**CC-BY-SA 上线前需法务审查**）；绘图产物一键插入 prism LaTeX（TikZ 复用 prism_tex）；**可选图→PDF/PPTX 导出**（若做，照抄 boltslides 的 `export-pptx` 管线，含**超时四层放开**、`--force-device-scale-factor=1` 体积坑、从 MinIO 回灌 cwd）。
- **验收**：通路/分子/蛋白零幻觉；绘图直插 prism 编译通过；（若导出）每次正确计费、体积在执行器 20MB raw 上限内。

**医学如何被吸收（不单独成线）**：临床统计图→P1；2D 分子→P1；机制/流程示意→P0/P2 生成矢量；通路/蛋白/解剖→P3 确定性源；病理/影像原图→P0 (d) 硬闸拒绝。

---

## 六、规划级模块与文件清单（按期，不写代码）

**后端（Go）**
- P0：`internal/scidraw/{spec,handler,artifact}.go`（照 boltslides 结构）、`router.go`（分类+期刊门控+(d)闸）、`compliance.go`（PHI/披露/矩阵静态数据）、`internal/prompts/sci_draw.go`（含 IP 铁律）；`bootstrap.go`（BuildSpec/For/NewHandler/SetUsageRecorder/SetVIPChecker/VIPCheckerWired）；`routes_user.go` 一整套 `/sci_draw/*`（同 boltslides 型）+ ws；`routes.go` handler 字段。
- P1：L1 执行器 repair。
- P2：光栅化/回灌执行器工具（→ `agentbridge/ws.go permissionAllowed` 白名单 + `agent/executor.go` Executor 接口）。
- P3：`pathway.go`（Reactome/WikiPathways client + 缓存 + 熔断）、`anatomy.go`（BodyParts3D）、prism↔scidraw 桥、可选 `ExportFigure` client（仿 ExportDeckPptx，超时四层）。

**Agent 容器（`agent/`）**
- P0：绘图 skill 目录（`agent-skills/sci-draw-*`，教写通用画风 SVG + IP 约束 + 写 out/ 约定）；`SessionOptions.AddDirs` 指向它。
- P1：`Dockerfile` 加运行时层（matplotlib/numpy/pandas/rdkit，阿里云/npmmirror 验证 fetch）；L1 渲染 skill（含医学统计图模板）。
- P2：`src/render/` 新增 session-bound SVG→PNG 落 out/ + 视觉回灌（改造 resvg 用法）；`tools/registry.ts` 注册该工具。
- P3：Mol\* headless（容器层或 sidecar）；可选 `deckpptx.ts` 同款图导出。

**迁移（`docker/mysql/migrations/`，编号取当前最大+1）**
- P0：模型目录 `PurposeChatDefaultSciDraw` 种子绑定（仿 0063）；**`0034` 排除名单加 `'sci_draw'` + 新 `00XX_agent_sessions_scidraw_multi.sql`（照 0076 守卫式 MODIFY）**。
- P2（可选）：场景图存储表（优先复用 prism struct 模式，确需再建）。
- 说明：交付复用 `agent_artifacts`（`feature_key='sci_draw'`）、会话复用 `agent_sessions`——**无需新交付/会话表**。

**前端（`frontend-user/src/features/claw/`——并入现有 claw feature 目录，不新建 feature 目录）**
- P0：`hooks/useSciDrawConversation.ts`（克隆自 useClawConversation）；`api/sci-draw-session.ts`（makeAgentSessionApi）；`components/chat/TemplateCards.tsx` 加科研绘图卡；`components/sidebar/UnifiedSessionList.tsx` 加 sci_draw 图标+路由；`pages/ClawPage.tsx` feature 枚举加 sci_draw；`ChatComposer` 上传端点按 basePath 参数化（开 `enableAttachments`）；`ModelFeatureKey`/`FeatureChannel` union 补项。
- P2：可编辑图 UI（双击属性对话框，扩展 prism `Figure` 节点 / `MathEditorDialog` 范式）。

---

## 七、验收与度量（贯穿）
- **本地评测语料**：P0 建 N≥30 图请求语料（覆盖三车道 + 一批「该被 (d) 拒」的负样本），随迭代扩充。
- **P0 关口**：卡→会话→交付预览通 + 合并历史正确 + 配额账本准 + (d) 闸真拒 + 披露真附 + 顶刊门控真关。
- **P1 关口**：执行成功率 ≥90%（本地口径）+ 不发明数字。
- **P2 关口**：语义忠实率相对 P1 统计可测提升 + 无回归 + round-trip 无损。
- **合规回归**：每次改路由/提示跑 (d) 负样本集，确保不放行。
- **构建验证铁律**（boltslides 血泪）：`docker compose build backend` 别信 `tail` 的 exit（`${PIPESTATUS[0]}` 经管道读假 0）——grep `go build|ERROR|\.go:` + 看 `docker images` 时间戳；交付前 tsc -b + vite build。

---

## 八、风险与缓解
1. **解剖质量天花板**：LLM 手写 SVG 画精细解剖很烂 → 已砍出范围，降级示意 / P3 用 BodyParts3D 几何；UI 不承诺写实解剖。
2. **代码执行爆量**：修图迭代烧 token（参照 peerreview 缓存 miss 全量重跑、claw 编译死循环）→ BudgetProvider 自节流 + 透支带 + 迭代上限 ~3；背景/元调用走 `SkipQuota` 逃生口。
3. **沙箱隔离**：后端权限门管不住 shell，靠容器 bwrap（断网+cwd jail）→ 生产必须验证生效。
4. **合规执行**：生成时闸不靠评审 → (d) 闸 + 期刊矩阵是 P0 硬性 + 负样本回归常态化。
5. **MinIO 依赖 / 工作区易失**：绘图依赖 MinIO；二次操作（P3 导出/再编辑）须从 MinIO 回灌 cwd。
6. **加工具三同步**：新执行器工具必须同步进 `permissionAllowed` 白名单 + `Executor` 接口（否则真实轮次 DOA / 编译错）——只在首轮真实生成暴露，烟雾测测不到。
7. **多会话唯一索引**：决策 2 的 0034 排除 + 新迁移必须先落，否则会话被静默清。
8. **P3 外部源可用性**：Reactome 是外部 API，须缓存+熔断+兜底；KEGG 避开。

---

## 九、待你拍板的决策点（各附推荐）
1. **P0 首个产出车道** → 推荐 **L2 生成 SVG 先行**（零容器依赖、能同时验合规闸 + 验证 claw-mode 集成）；若更想先要「数据图」，把决策 1 容器重建提到 P0。
2. **可编辑中间表示做不做** → 推荐 **P2 再做**（P0/P1 先「重新生成即编辑」），避免过早引入场景图复杂度。
3. **医学 3D/通路排期** → 推荐 **压到 P3**（Mol\* 容器化非平凡、Reactome 外部依赖），P1 先吃高 ROI 临床统计图。
4. **是否要图导出（PDF/PPTX）** → 推荐 **P3 按需**；SVG/PNG/PDF 已由 claw 管线原生交付，导出仅在「打包多图/特定格式」才需，届时照抄 boltslides export 管线（含超时四层坑）。

> 会话归属已定（user-level 多会话 + 0034 排除 + 新迁移，照 boltslides），不再是待决项。

---

## 十、建议起步顺序（P0 内部）
1. 拍板决策 1/6（容器、MinIO）；会话归属已定。
2. 后端：`internal/scidraw` 骨架（spec/handler/artifact/router/compliance/prompt）+ bootstrap + `/sci_draw/*` 路由 + 模型绑定迁移 + **0034 排除 + 新多会话迁移**。
3. 合规层（(d) 闸 + PHI linter + 披露 + 期刊矩阵）+ 负样本语料。
4. 前端：ClawPage feature 枚举 + 克隆 hook + `sci-draw-session.ts` + 模板卡 + UnifiedSessionList 图标 + ChatComposer 上传端点参数化。
5. L2 生成 SVG skill + 交付预览打通。
6. P0 验收关口全绿 → 进 P1 重建镜像补确定性车道。

> 全程复用 boltslides 已铺的 claw 多 feature 地基 + agentbridge/claw 交付/计费；医学不是单独工程，是「路由器 + 合规闸 + 各车道」的自然结果。
