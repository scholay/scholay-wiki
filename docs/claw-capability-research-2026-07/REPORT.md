# 智能助手(claw)下一批重能力调研报告

> 2026-07-24 · 多 agent 调研(4 路代码摸底 + 6 路联网调研 + 汇总打分 + 逐候选代码核实 + 4 份落地设计,共 19 个子代理)
> 目录:本文件 = 结论与路线;[designs/](designs/) = 4 份工程可执行落地方案;[APPENDIX-research.md](APPENDIX-research.md) = 六路调研原始报告(含全部来源 URL)

---

## TL;DR

在「制作PPT、科研绘图」之后,claw 下一批重能力按优先级:

| 顺位 | 能力 | 形态 | 总分 | 一句话理由 |
|---|---|---|---|---|
| **1** | **统计分析工作台**(stat_lab) | claw 重模式 | 88 | 痛点最密+频率最高+agent 契合度满分;付费天花板 5000-5万/篇(统计代做市场);两个现成 guide 合体升级,冷启动最低 |
| **2** | **系统综述/Meta 分析工作台**(sys_review) | claw 重模式 | 82 | 差异化全场第一:市场无一家打通全链,minicod 真引用天然免疫 GPT 系 56% 假引用;医生(平台核心画像)晋升刚需 |
| **3** | **学术海报+图文摘要**(poster) | claw 重模式(PPT 姊妹车道) | 75 | 落地成本最低:排版/公式/引用/导出管线全现成;BioRender $35/月+许可争议留出空档;矢量组装合规绕开生成图像红线 |
| **4** | **国自然基金标书工作台**(nsfc_grant) | claw 重模式(季节性) | 69 | 痛点极重(116 PI 工时/份、万元级辅导市场、2026 改版)+全场最干净的空白;但年 1-2 次强季节性,建议 12-3 月申报季前上 |

不立新模式但建议做的:**组会汇报场景化**(70 分,做成制作PPT 的 upload-paper 入口+组会/开题/答辩叙事模板,串 paper-explain);**深度调研报告**(65 分,做成 smart-search 的 docx 导出增强);**组图拼版/三线表**(64 分,科研绘图第四车道 + 统计工作台交付物)。

明确不做:期刊封面图(生成式图像红线正中靶心)、降重/降 AIGC(灰产定性,伤品牌)、video abstract(低频+无 ffmpeg)、投稿格式化(归 prism,已有 submission-pack lens)、ELN 实验记录(形态不匹配)。

---

## 1. 调研方法

- **代码摸底 ×4**:boltslides / sci_draw 两个重模式的端到端落地 pattern(可复用件清单)、agent 容器能力与硬约束全景(Dockerfile 依赖、bwrap 沙箱、minicod 工具面、前端预览覆盖)、平台功能边界地图(prism 31 lens / peerreview / smart-search / library / 6 个 claw guides 各管什么)。
- **联网调研 ×6**:国际痛点(Nature/Science 调查、r/PhD 原声)、中文痛点(知乎/小红书/丁香园/科学网 + 灰产定价)、国际竞品 15 家、国内竞品 20+ 家、可视化交付物 6 方向、数据分析/统计赛道。
- **汇总打分**:31 个原始候选去重成 8 个方向,六维打分(痛点强度 20 / 频率×受众 20 / agent 架构契合度 20 / 差异化 15 / 落地成本 15 / 商业价值 10)。「agent 契合度」维度刻意惩罚纯 prompt 就能做好的方向——那些通用聊天已满足,不构成 claw 的护城河。
- **逐候选核实**:shortlist 4 个各派一个带代码库的核查 agent 实读代码(而非臆断),裁决 go/adjust/drop——结果 3 个 adjust、1 个 go,修正了若干「方案想当然」(详见各设计文档的核实结论节)。

## 2. 痛点全景:关键证据

**时间都去哪了**:PI 42% 时间耗在行政/文书,94% 的 PI 把「减负」列为最高诉求;NSF 经典统计:查找+消化资料占科研时间 51%。对 759 个研究项目的调查:统计分析被称为「论文发表的最大拦路虎」。

**统计(顺位 1 的证据)**:统计焦虑影响 ~80% 研究生;49.5% 博士生称从未得到统计帮助(而 97% 导师自称给了);约 50% 医学论文含统计错误;医咖会系「课题数据分析 5000-50000 元/篇」、meta 辅导 2.1 万/人、科室包年 5-15 万——付费天花板全场最高。竞品 SPSSAU/SPSSPRO 是「点选工具」不产论文交付物,MSTATA 是黑箱,DeepSeek/Julius 不可复现——「上传数据→对话问诊→真跑代码→三线表 docx+出版级图+双语 Methods/Results+可复现脚本」无人做成 agent 产品。

**系统综述(顺位 2)**:系统评价平均 12.5 个月,标题/摘要筛选每条 ~36 秒×数千条;GPT-4o 参考文献 56% 或假或错(带 DOI 的假引用 64% 指向真实但无关的论文);「DeepSeek 乱编文献坑惨大学生」上热搜——恰是 minicod 真文献库的天然广告。竞品各管一段(Covidence $339/篇只筛、Elicit 不做统计、RevMan 只统计),业界共识「无单一工具打通全链」;claw 是唯一同时握有真文献 API + 沙箱脚本 + xlsx/SVG/docx 交付的形态。

**海报/GA(顺位 3)**:每会议一张人手一份、模板化极强(IMRaD/#BetterPoster 定式);竞品三大通病「导出碎成图片/编造 DOI/模板脸」恰被 claw 管线逐条补上(pptx-native 可编辑导出 + minicod 引用验真 + 主题 token);BioRender $35/月+许可争议;PosterGen 等 2025 论文密集出现证明技术路线可行($0.0045/张)。

**国自然(顺位 4)**:一份标书 116 PI 工时;标书辅导机构横评成软文产业、1v1 万元级;2026 改版三段式让老经验失效;「AI 标书工具」全在商业招投标赛道,科研标书是干净空白。合规是硬线:科技部规范明确申报材料不得用生成式 AI 直接生成→产品必须是「结构化辅导+文献工作台+评审预演」,不代写正文。

**中文用户特有语境**(全部方向的底色):医生晋升与 SCI 硬挂钩(69.74% 医师科研压力大、日均科研仅 1.47h)→ 医学人群是付费主力;「双重查重」(重复率+AIGC 率)是新痛点但属灰产雷区不碰;润色 0.5-0.6 元/词的市场归 prism 已有 lens 覆盖。

## 3. 竞品格局速览

- **红海勿入**:Chat with PDF(NotebookLM 免费碾压)、通用语义检索(秘塔/知网/直答免费轰炸,smart-search 已在位)、纯润色(Paperpal 150 万用户;prism 已覆盖)、论文初稿代写/降重(口碑+合规双输)、通用 DeepResearch(大厂免费)。
- **付费已验证**:系统综述工具按篇 $339/年(机构买单)、统计 SPSSAU 9.8 元/天起(免费 100 行卡脖子)、交付物打包 229-630 元套餐、科研视觉订阅 $72-420/年。结论:**科研用户愿意为「直接能用的交付物」和「按次解卡」付费**,与 token/额度体系兼容。
- **结构性判断**:竞品绝大多数是「LLM+检索 API」轻架构,**没有代码执行沙箱**;FutureHouse「文献 agent+数据分析 agent」= Edison $250M 估值叙事,与 claw 底座同构。四个 shortlist 全部选在「必须真跑代码+产真文件+查真文献」的交叉点上,正是这个护城河的变现位。
- **竞品血泪反面清单**:credit 黑箱计费(SciSpace 之死)、引用不可核验(Jenni 之踵)→ 我们的对策:每条结论挂可回溯 DOI、计费可预估。

## 4. 八方向打分矩阵

| 方向 | 形态 | 痛点/20 | 频率/20 | 契合/20 | 差异/15 | 成本/15 | 商业/10 | 总分 |
|---|---|---|---|---|---|---|---|---|
| 统计分析工作台 | claw 重模式 | 19 | 18 | 20 | 12 | 10 | 9 | **88** |
| 系统综述/Meta 工作台 | claw 重模式 | 18 | 14 | 19 | 14 | 8 | 9 | **82** |
| 海报+图文摘要 | claw 重模式 | 13 | 12 | 17 | 13 | 13 | 7 | **75** |
| 组会汇报场景化 | 制作PPT 增强 | 13 | 18 | 13 | 8 | 13 | 5 | 70 |
| 国自然标书工作台 | claw 重模式 | 17 | 8 | 15 | 13 | 8 | 8 | **69** |
| 投稿前体检+返修工场 | 拆两半(claw 重 guide + prism 增强) | 15 | 13 | 12 | 10 | 9 | 7 | 66 |
| 深度调研/开题 | smart-search 增强 | 15 | 14 | 12 | 8 | 10 | 6 | 65 |
| 组图拼版/三线表 | 科研绘图第四车道 | 11 | 13 | 15 | 9 | 12 | 4 | 64 |

组会汇报 70 分高于国自然 69 分但不占 shortlist 席位:其形态裁决是「制作PPT 加 upload-paper 入口+叙事模板」,增量属既有模式深耕,不立新重模式。

## 5. Shortlist 落地方案摘要(全文见 designs/)

四个方案共享同一集成范式(scidraw 全模块仅 ~780 行 Go 的先例):`internal/<feature>/{spec,handler,artifact}.go` thin wrapper + `agent-skills/<feature>-add/` 技能目录 + TemplateCards 模板卡 + `makeAgentSessionApi` 前端工厂克隆。共同的已知坑:0034 anchor 迁移先行、SetVIPChecker 必接(有启动断言)、自定义工具须加 `permissionAllowed` case、skill 的 allowed-tools frontmatter 不生效(真源是 spec 的 AllowedMcpTools)、改 prompt/skill 须 restart scholar_agent。

### 5.1 统计分析工作台([designs/01-stat-lab.md](designs/01-stat-lab.md),verdict=adjust)
- **闭环**:上传 csv/xlsx(≤30MB,实测上限非 50MB)→ AskUserQuestion 问诊研究设计 → 方法学守门(前提检验强制/多重校正/选错拦截)→ 沙箱真跑 → `table1.docx` 三线表 + matplotlib 出版级图 + 中英双语 Methods/Results + 可复现 `analysis.py`。
- **核实修正**:scipy 1.15.3 其实已在镜像(guide 文档与现实的落差是 statsmodels 缺失);MVP 只需 apt 加 `python3-statsmodels` + `python3-sklearn`;pingouin/factor_analyzer/lifelines/semopy 全是 pip-only 与 apt-only 约定冲突→MVP 砍掉,用 statsmodels+numpy 手写替代(Cronbach α 十行手算、EFA 用 statsmodels.multivariate.factor、生存分析 P2 用 statsmodels.duration);.sav 支持需镜像+agentattach 白名单+前端 accept 三处同步,放 P1。
- **红线**:PHI 脱敏提醒 + 明确拒绝 p-hacking(「调显著/只报显著」),教学式陪跑不做代做承诺。
- **成本**:单会话 8-20 万 token 入 / 1-3 万出,claw 普通会话的 2-3 倍。P0 约 2-3 天。

### 5.2 系统综述/Meta 分析工作台([designs/02-sys-review.md](designs/02-sys-review.md),verdict=adjust)
- **闭环(MVP 五件套)**:PICO 对话 → 检索式 → 三源(stc/olx/pmd)抓取 → Python 去重 → 筛选台账 xlsx(AI 只建议+理由,裁决权留用户)→ PICO 提取表 xlsx → PRISMA 2020 流程图 SVG;成文移交 prism(wl-lit-synthesis + pw-systematic-review 已就位)。meta 统计(森林图/漏斗图/I²)P2。
- **核实修正(最重要的一条)**:大批量检索若靠模型逐轮调 MCP 会撞 24 工具轮/30s 超时/token 预算三重墙——**MVP 必须含 executor 级自定义工具 FetchCorpus**(仿 BuildDeck 范式):executor 侧直连 minicod bulk REST,结果直落会话 cwd JSONL 不过模型上下文,模型只拿「落盘 N 条」摘要。这是全链路成本可控的关键。
- **成本**:完整流程 50-100 万 token(初筛是大头:600 条÷80/批≈8 轮);corpus 上限先钉 2000 条/次(1.5G 内存帽)。
- **依赖**:P0 零新增;建议顺手烧入 scipy/statsmodels 层,同时偿还 data-figures/methods-stats guide「声称有但镜像未装」的既有债。

### 5.3 学术海报+图文摘要([designs/03-poster-ga.md](designs/03-poster-ga.md),verdict=adjust)
- **闭环**:描述研究/贴摘要 + 会议规格 → AskUserQuestion 收敛尺寸/版式/主题 → A0/A1 海报 HTML 预览 → 导出打印级 PDF(P0)+ 可编辑 pptx(P1);引用逐条 minicod 验真并出 `citations-report.md`(直击竞品幻觉 DOI 硬伤)。
- **核实修正**:「复用 pptxNative」过于乐观——它硬编码 16:9 DECK169 参考系,海报是单张 A0 大画布,需新 `poster-template` 脚手架 + `posterPptx.ts` 可变版面(pptxgenjs defineLayout,A0=33.1×46.8in < 56in 上限)——属「改造」预算点。**GA 车道不新建渲染器**:与 sci_draw figures 管线 70% 重叠,做成 sci_draw 的 `ga-band` layout kind + 按刊 PNG 导出(Elsevier 531×1328px 等),二期。
- **红线**:继承 sci_draw (d) 红线(禁合成病理/blot 等一手证据图)——海报天然诱导贴患者照片,P0 直接关附件兜底;矢量组装=合规卖点写进产品文案。

### 5.4 国自然基金标书工作台([designs/04-nsfc-grant.md](designs/04-nsfc-grant.md),verdict=go)
- **闭环**:AskUserQuestion 收集学科口子/申请类型 → ①立项依据文献工作台(主张↔真实引用逐条绑定,✅/⚠️/❌ 核查表 docx,复用 citation-audit+library-reference)→ ②技术路线图(会话内 mermaid 迭代→定稿 SVG,AddDirs 直接挂 sci-draw-skills 复用)→ ③2026 三段式骨架 docx + 形审自检清单 + AI 使用声明模板 → P2 模拟函评(迁移 peerreview persona 架构,四维:科学问题属性/创新性/可行性/研究基础)。
- **核实结论**:唯一 go——原 scope 画的边界与代码现状完全吻合;MVP 零新增镜像依赖(pandoc/weasyprint/中文字体全现成,国自然模板 docx 放 skill 目录 `--reference-doc` 引用,零镜像改动)。「不代写正文」从产品定位升格为合规硬线(科技部 2023 规范)+prompt 铁律;「2026 三段式」是产品假设,立项后须对照当年申报指南核实,骨架/清单放 skill 文本层便于年年热更新。
- **成本**:立项依据检索重(80-200 万 token/会话),建议 admin 侧绑较高模型档+单轮预算略高于 claw。

## 6. 建议节奏

1. **先上统计分析工作台**(P0 2-3 天):分数最高、冷启动最低、与年度任何时点都相关;Dockerfile 补 statsmodels 层是它和系统综述的共同前置,一次做完。
2. **随后系统综述工作台**(P0 2-3 天 + FetchCorpus 工具):与统计共享容器统计能力,医学人群连击;FetchCorpus 是唯一新架构件,单独排期。
3. **海报作为快赢插队项**(P0 2-3 天):会议季爆发型,与前两者错峰;GA 二期并入 sci_draw。
4. **国自然按申报季倒排**:12-3 月前上线 P0(文献工作台+骨架清单),申报季后做模拟函评(淡季功能)。
5. 顺手项:组会汇报模板卡(制作PPT 增强)、smart-search 深研 docx 导出、科研绘图组图拼版车道——不占重模式研发主线。

四个重模式全部落 `/claw` 页 TemplateCards 扇形(与制作PPT/科研绘图并列),UnifiedSidebar 徽标 + `/claw/:sessionId` 深链 resolve 全部照抄现有范式;配额统一走 StandardHooks→vip 日额度,零新计费代码。
