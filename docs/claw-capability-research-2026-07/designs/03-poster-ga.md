# 学术海报+图文摘要(Poster & Graphical Abstract) — 落地设计

> verdict: adjust

## 核实结论
【已实读代码,非臆断】

重叠度:
1. 全库无海报/GA 功能(prism/peerreview/library/smartsearch 均无;grep 到的"海报"命中皆为 content/blog JSON,无关)。海报车道属空白,值得做。
2. GA 车道与现有「科研绘图 sci_draw」figures 管线高度重叠(~70%)。sci_draw 已实现 GA 核心:agent 输出无坐标配方 JSON → 前端 compose.ts(elkjs 布局 + bioicons 图标 icon-pack.bioicons.ts 已内联大量 CC0 学术图标 + 流程箭头 edges 支持 activate/inhibit/transport)组装分层 SVG,配方 JSON 即"逐元素可编辑",已导出 SVG。GA 真实增量仅:换单页摘要/流程带版式(非细胞隔室图)+ 按刊尺寸位图导出 + Elsevier/Cell 规范。→ 应作 sci_draw 增量,非新建渲染器。
3. 海报"复用 pptxNative 管线"偏乐观:agent/src/render/pptxNative.ts 硬编码 DECK169(13.333×7.5in)+1280×720 参考系,bolt-slides 是多页 16:9 视口引擎(Deck.tsx 按 window.innerWidth 测量)。海报是单张 A0/A1 大画布,需新脚手架+可变 pptx 版面+新参考系;pptxgenjs 的 box→shape/table/chart 机器可复用,属"改造"非"复用"。
4. 差异点"引用逐条核查"真且低成本:citation-audit guide 已用 minicod(get_paper_by_doi/match_paper/search_papers)逐条查证,直接复用。KaTeX(render/math.ts)、学术主题、bolt-slides Cite/References/Figure 组件均现成。

容器可行性:
- Dockerfile 已装 chromium(print-to-PDF 出 A0/A1 打印级 PDF)、pptxgenjs(自定义 layout 上限 56in,A0 在内)、weasyprint、matplotlib/rdkit/pandas、node/npm、elkjs(前端)。MVP 无需新重包。唯一小缺口:GA TIFF 需 ImageMagick(未装),但 PNG 高分辨率经 chromium scale-factor 可出,TIFF 非 MVP。
- 沙箱不挡(bwrap.ts):SVG 走 Write(如 sci_draw L2);pptx/pdf 导出在执行器进程内 bwrap 外(如 BuildDeck/export-pptx);数据图 matplotlib 在 jail 内已 smoke-test 通过。
- 前端预览全覆盖(artifact-format.ts):SVG/fig.json/PDF/HTML 均可预览,pptx 仅下载(与现有 boltslides 一致)。
- 集成范式清晰:照 boltslides/scidraw 加 agentbridge feature(spec.go+handler+routes+usagestat Feature 常量+WS+TemplateCards.tsx 加卡+skill+脚手架)。

合规:生成式图像禁令用矢量组装规避,与 sci_draw IP 铁律/Nature 红线一致,是真卖点;两个新 prompt 必须继承 sci_draw 的 (d) 红线(禁合成病理/组织学/显微/放射/gel blot 一手证据图),海报/GA 更易诱导贴患者照片/真 blot;无 AIGC 检测灰产风险。

调整后边界见 adjusted_scope。

## 调整后边界
照做,但调整两点边界:

1. 海报车道 = 真正的新建 MVP,先行。作为独立 agentbridge feature(FeatureKey=poster,仿 boltslides/scidraw)。但把"复用 pptxNative"改为"改造":需预算 (a) 海报专用脚手架(单张 A0/A1 大画布,非 16:9 多页 deck);(b) 可变 pptx 版面(pptxgenjs defineLayout 传海报尺寸,替换硬编码 DECK169)+ 新的 px→inch 参考系;(c) 打印级 PDF 走 chromium print-to-PDF + CSS @page 设精确纸张尺寸/DPI。MVP:IMRaD 版式 + 3 学术主题 + pptx-native/PDF 导出 + 引用逐条经 citation-audit/minicod 核查。

2. GA 车道 = 不作从零新建的"姊妹车道",而是 sci_draw 的版式扩展。在现有 figures 配方 JSON + compose.ts 渲染器上加一种新 layout kind(GA 摘要/流程带面板)+ 按刊尺寸位图(PNG)导出 + Elsevier/Cell 规范文案。复用 bioicons 图标、edges 箭头、elkjs 布局、SVG 导出、"配方即可编辑"机制,避免两套图渲染器并存。列为二期,#BetterPoster 版式同期。

3. 两个 prompt 必须继承 sci_draw 的 (d) 证据图/PHI 红线(禁合成病理/组织学/显微/放射/gel blot),并写入生成式图像禁令合规文案。

4. 差异化卖点"引用逐条 minicod 核查""矢量组装(非生成式图像)"保留 —— 前者复用 citation-audit + minicod MCP,成本低且直击竞品幻觉 DOI 硬伤,是强 wedge。

---

# claw 新重能力落地设计:学术海报 + 图文摘要(Poster & Graphical Abstract)

**形态定调**:海报车道 = 独立 agentbridge feature(`FeatureKey=poster`,仿 boltslides/scidraw 全套 pattern,先行 MVP);GA 车道 = sci_draw 的版式扩展(figures 配方 JSON + compose.ts 加新 layout kind,二期),**不新建第二套图渲染器**。

---

## 1. 用户故事与交付物形态

**典型输入** → 纯文本描述研究(或粘贴摘要/结论)+ 目标会议/期刊 + 尺寸偏好;**典型输出** → 单张 A0/A1 海报 HTML(会话产物卡 + 右侧 iframe 预览)→ 一键导出**可编辑 pptx**(单页海报尺寸版面)与**打印级 PDF**(精确纸张尺寸)。引用逐条经 minicod 核查,附核查结果说明。

三个场景:
1. **研究生赶会议海报**:粘贴论文摘要 + "CSCO 会议,A0 竖版" → agent 追问(AskUserQuestion)配色/是否 #BetterPoster → 产出 IMRaD 版式海报,Methods 流程图用 mermaid/SVG、数据图用 matplotlib 车道复用、参考文献 8 条全部 minicod 验真 → 导出 pptx 微调后打印。
2. **医生投稿 GA**(二期):"给这篇 Cell 子刊投稿做图文摘要:机制是 X 抑制 Y 通路" → sci_draw 内走 GA layout kind → 前端 compose.ts 渲出横带三面板流程图(bioicons 图标 + inhibit 箭头)→ 按 Elsevier 规格(531×1328px 等)导出 PNG。
3. **课题组学术活动海报**:"实验室开放日海报,含研究方向 3 块 + 二维码占位" → 自由版式主题 → PDF 打印。

## 2. 交互设计

- **入口**:`/claw` 空态 `TemplateCards.tsx` 加第三张模板卡「学术海报」(与 制作PPT/科研绘图 并列扇形),点卡切 `PosterModeWorkspace`;深链 `/claw/:sessionId` 经 `/user/agent-session/resolve` 反查(可见 feature 列表加 `poster`)。
- **会话流程**:首轮 AskUserQuestion 收敛 4 要素(尺寸 A0/A1/横竖、版式 IMRaD/#BetterPoster、主题 3 选 1、有无真实数据/参考文献)→ 生成 → 产物卡出现即 `autoOpenLatestArtifact` 打开右侧预览 → 对话迭代改版("标题再大""换蓝色主题")。
- **产物预览与导出**:海报 HTML 走现有 srcDoc 沙箱 iframe 预览(缩放适配视口,CSS transform scale);html 卡片挂「导出 PDF / 可编辑 PPTX」按钮(仿 boltslides `useExportBoltslidesDeck`,blob 直流回浏览器不落 MinIO)。引用核查结果以 markdown 产物 `citations-report.md` 同步落 `./out`。

## 3. agent 侧

**skills 新目录** `agent-skills/poster-add/poster/SKILL.md`(常驻,`AddDirs=["/poster-add"]`,docker-compose 挂 `./agent-skills/poster-add:/poster-add/.claude/skills:ro`):
- 三硬规则(照 bolt-slides 风格):别碰脚手架引擎目录 / 真实输入创作不换皮 demo / 引用必须逐条 minicod 验真后才可写入 References 区。
- 版式目录:IMRaD 四栏、#BetterPoster(大中央结论区)、自由版式;主题只改 tokens.css。
- 科研要素:KaTeX 公式、数据图(嵌 matplotlib SVG data URI)、mermaid 流程、bioicons。
- **红线继承 sci_draw (d)**:禁合成病理/组织学/显微/放射/gel blot 等一手证据图;禁生成式图像;用户要求贴患者照片/真 blot 时明确拒绝并解释期刊 AIGC 合规。
- 交付契约:单文件 ≤12MB、图片 data URI 内联、DoD 自检清单(溢出检查/字号最小 24pt 等)。

**脚手架**:新 `agent/poster-template/`(Vite + 单文件构建,复刻 bolt-slides 的 `vite.config.singlefile.ts` + `classicScriptForSandbox` 插件),差异:单张大画布(CSS 定宽 mm 单位 + `@page { size: 841mm 1189mm; margin: 0 }`)、无翻页引擎、导出模型自曝 `<script id="__poster_export">` JSON(box/text/image ops,px 坐标 + 画布总尺寸)。Dockerfile 加 `COPY poster-template /opt/poster && npm ci`(层放 L3 之后,防 OOM 单独小层)。

**新自定义工具**(registry.ts):
- `BuildPoster`:复制 BuildDeck 实现,自守卫改为 cwd 须有 poster 版 `vite.config.singlefile.ts` + 标记文件(如 `.poster-template`),执行器进程内跑(不进 bwrap,理由同 BuildDeck:/opt symlink)。
- **导出改造**(核心预算点):`agent/src/render/` 新增 `posterPptx.ts` —— pptxgenjs `defineLayout({ name:'POSTER', width, height })` 按导出模型自报画布尺寸换算(A0=33.1×46.8in,<56in 上限 OK),替换硬编码 DECK169;px→inch 参考系从 1280×720 改为「画布 px 总宽 ÷ 目标 inch 宽」动态比例。PDF 走 chromium `printToPDF` + `@page` 精确纸张(`--host-resolver-rules=MAP * ~NOTFOUND` 封外联照抄)。HTTP 端点 `/api/sessions/:id/export-poster`。

**featurePolicy / 权限墙**:`agentbridge/ws.go` `permissionAllowed` 显式加 `BuildPoster` case(default-deny,漏加 DOA);MCP 白名单新建 `posterAllowedMcpTools`(spec.go 内):`search_papers / match_paper / get_paper_by_doi / batch_papers` 等 citation-audit 所需 ~10 个,不放 bulk/export。

**Dockerfile 新增**:仅 poster-template 层;无新 apt 包(chromium/pptxgenjs/字体全现成)。

## 4. backend 侧

**新 feature**(不走 claw mode——需要独立脚手架 TemplateKind、独立工具闸门、独立配额口径,与 boltslides 同理):
- `backend/internal/poster/spec.go`:`Key="poster"`、`InjectPromptOnFirstMsg=true`、`PermissionAuto`、**`AllowBash=true`**(数据图要跑 matplotlib,与 boltslides 的 false 不同)、`DisallowedTools` 禁 WebFetch/WebSearch/Task/ExportDocument/NotebookEdit、保留 AskUserQuestion;`SessionOptions.TemplateKind="poster"` + `AddDirs`;`StandardHooks`(vip `CheckDailyQuotaOverdraft` + usagestat)+ `BudgetProvider` + `VIPCheckerWired()` 启动断言。
- `handler.go`:委托 FeatureBridge 全套 + `ExportPoster`(归属校验 → `PutWorkspaceFile` 回灌 html → 调 agent 导出 → 字节直流,照 boltslides `ExportPptx` 抄)。
- `artifact.go`:照 boltslides 简化版抄(sha256 去重 / FeatureKey+OwnerID 越权 404 / nosniff+attachment / `shouldListArtifact` 排除 .pptx/.pdf)。
- `prompts/poster.go`:~50 行身份/工作流/红线,手艺全在 skill。
- 接线:`bootstrap.go` 三行 + `routes_user.go` 15 REST + 1 WS(`/user/poster/*`)+ resolve 可见列表加 key + compose `AGENT_EXECUTOR_FEATURES` 加 `poster`。

**迁移** `0081_agent_sessions_poster_multi.sql`(幂等):把 `poster` 加入 0034 `user_feature_anchor` 生成列排除集(放开多会话,**否则一人锁死一会话**,照 0076/0077 抄);`INSERT IGNORE` modelcatalog 加 `chat_default.poster`(+`.free`)能力绑定;usagestat 加 `FeaturePoster` 常量(Go 侧)。无新业务表。

## 5. frontend 侧

- `api/poster-session.ts`:照 sci-draw-session.ts 对称克隆,`makeAgentSessionApi` 工厂,BASE `/user/poster`,queryKey 根 `poster`;+`useExportPoster`(blob 下载 + Content-Disposition 解析 + 6min 超时,抄 boltslides)。
- `hooks/usePosterConversation.ts`:从 `useSciDrawConversation` 机械克隆(继承全部已修看门狗/resync/懒新建浮点)。
- `pages/ClawPage.tsx`:`POSTER_CFG: WorkspaceConfig`(`autoOpenLatestArtifact=true`、`enableAttachments=false` P0、`artifactBasePath='/user/poster'`)+ `PosterModeWorkspace` 自包含组件;`TemplateCards.tsx` 加卡;`lib/feature-meta.ts` 加图标(UnifiedSidebar 徽标单一真源)。
- 预览:**复用** `ClawArtifactPreview`(html srcDoc 沙箱),仅加海报场景导出按钮组;`api/artifacts.ts` 已按 basePath 参数化,加一个实例即可。

**GA 二期前端**:`figure-spec.ts` 加 `layout: 'ga-band'` kind(横带 N 面板 + 面板间大箭头)→ `compose.ts` 新布局分支(面板内仍走 elkjs)→ `export.ts` 加按刊 preset 的 PNG 导出(SVG → canvas,`devicePixelRatio` 放大到 Elsevier 531×1328/Cell 规格)→ GA 规范文案进 `figures/SKILL.md` 增补节。GA 不动后端、不动路由。

## 6. 风险与坑(逐条对策)

1. **0034 anchor 唯一索引**:漏迁移 → poster 永远单会话且新建报 duplicate;0081 必须先行,验收时建 2 个会话验证。
2. **FeatureKey 越权**:artifact.go 取件必须校验 `FeatureKey=="poster"`,跨 feature 一律 404(照抄即防)。
3. **`permissionAllowed` 漏加 BuildPoster** → 工具调用卡死等待批准,冒烟必测。
4. **skill 的 `allowed-tools` 不生效**:minicod 工具供给以 spec.go `AllowedMcpTools` 白名单为真源,SKILL.md frontmatter 只是文档。
5. **改 prompt/skill 须 `docker-compose restart scholar_agent`**(挂载 ro,但 skill 加载有会话缓存;prompt 是 backend 注入,改 Go 须 rebuild backend)。
6. **pptx 尺寸上限**:pptxgenjs 56in,A0 竖版 46.8in 安全;但 PowerPoint 打开超大版面时字号观感变化,导出模型 pt 字号须按物理尺寸换算而非沿用 1280 参考系——这是"改造非复用"的核心测试点。
7. **A0 HTML 预览性能**:大画布 + data URI 大图在 srcDoc iframe 里可能卡,预览用 CSS scale 缩放而非渲染缩略图;12MB 上限前置拦截照 BuildDeck。
8. **bwrap**:BuildPoster 刻意在 jail 外(同 BuildDeck);matplotlib 在 jail 内已验证,无新 bind 需求。
9. **红线诱导面变大**:海报天然诱导贴患者照片/真 blot,prompt + skill 双写拒绝话术,附件 P0 直接关闭(enableAttachments=false)兜底。

## 7. MVP 切法

- **P0(2-3 天,最小闭环)**:poster feature 全链路(spec/handler/artifact/迁移 0081/路由/模板卡/克隆 hook)+ poster-template 脚手架 + BuildPoster + IMRaD 版式 ×3 主题 + HTML 预览 + **PDF 导出**(chromium print,先做,风险低)+ 引用 minicod 核查写入 skill 工作流。验收:新用户从模板卡进入 → 描述研究 → 3 轮内出 A0 海报 → PDF 尺寸用 pdfinfo 验证 = 841×1189mm ± 1mm;伪造 DOI 输入被核查拦截;多会话/深链/配额超额 `quota_exceeded` 全通。
- **P1(+1 周)**:pptx-native 可编辑导出(posterPptx.ts 可变版面 + 新参考系)+ #BetterPoster 版式 + 附件开放(上传自己的图表 PNG 嵌入)+ 会议规格 preset(常见 A0/A1/36×48in)。验收:导出 pptx 在 PowerPoint 打开为单页正确物理尺寸、文本框可编辑、公式为裁剪图。
- **P2(GA 车道,+1 周)**:sci_draw 加 `ga-band` layout kind + 按刊 PNG 导出 + Elsevier/Cell 规范文案 + figures/SKILL.md 增补。验收:一句机制描述 → 内联渲出 GA → 导出 PNG 精确 531×1328px;配方 JSON 可继续对话逐元素改。

## 8. 成本与配额

单次会话估算:首轮生成(skill 常驻 ~8K + prompt + 脚手架文件读写 + BuildPoster 日志回喂)约 **60-120K token**;引用核查每条 1-2 次 MCP 调用(工具结果小);迭代改版每轮 20-50K;典型完整会话 **150-300K token**,与 boltslides 同量级、低于重度 claw 会话。接入方式:`StandardHooks` → `vip.CheckDailyQuotaOverdraft`(SS#2 有界透支 max(15%,20万))+ `BudgetProvider` 单轮预算 + `NewSlogUsageRecorder` 审计(`grep agent_usage`),与三个现有 feature 完全同构,零新计费代码;modelcatalog 绑 `chat_default.poster` 使免费/付费档模型路由即刻生效。并发上仍在 1.5G/2 槽约束内:BuildPoster(vite)与 chromium 导出是峰值点,与 BuildDeck 同曲线,已被现网验证可承载。
