# 智能助手文件上传处理 · 调研报告(2026-07)

> 调研范围:①本项目 agent 文件上传/读取链路现状(代码逐行核查);②开源 agent 与业界产品的文件处理方式(官方文档+源码,均带出处)。
> 调研方式:9 路并行子代理(5 路代码 + 4 路 Web)+ 完整性批评家 + 4 路补漏。调研日期 2026-07-23/24。

---

## TL;DR

1. **「文件读不了」不是一个 bug,是一张能力矩阵**:docx/PDF 其实全 feature 都能读(走 `ReadDocument` 工具);**xlsx 只有 claw 能读**(靠 Bash+openpyxl 自救);**pptx 和 legacy 格式(doc/xls/ppt)任何 feature 都读不了**——但上传白名单照收,报错文案还向用户承诺「可上传 Office 文档 (docx/xlsx/pptx)」,形成体验断层。
2. **提示词系统性落后于工具**:2026-07-15 新增的 `ReadDocument` 工具,system prompt(attachLine)和 claw 附件协议都不知道它的存在——前者教模型「用 Bash 转」(无 Bash 的 feature 字面上被教「直接放弃」),后者宣称「Read 能读 PDF」(错,自研 Read 拒一切二进制)。
3. **大小限制清晰(5MB 图/30MB 文件/50MB 硬顶三层),数量限制形同虚设**:每条消息 10 个附件只有前端在挡;后端、agent 层均无数量/会话累计/磁盘配额——prod 会话目录 bind mount 无界增长(既有性能审计 P0)。
4. **业界(Anthropic 官方/OpenHands/Gemini CLI/Open WebUI 等)全部收敛到同一个范式**:文本直读+截断;图片(±PDF)原生多模态;**Office 二进制绝不让模型直读——预装转换工具链(pandoc/markitdown/openpyxl)+ skill 教模型自己转**。我们的架构与之同构,缺的只是补齐工具链和提示词。
5. **最短修复路径**:Dockerfile 烧入 `markitdown`(MIT)或升级 pandoc ≥3.8.3(实测容器 3.1.11.1;Debian trixie apt 永远装不出 ≥3.8.3,须加一层上游官方二进制)→ `ReadDocument` 扩展支持 xlsx/pptx(白名单正则与转换器两层都要改)→ 重写 attachLine/claw 附件协议 → legacy doc/xls/ppt 在上传口拒收并引导「另存为新格式」。
6. **补漏还挖出两个上传端点之外的敞口**:引用文献路径绕过 30MB 帽(单请求理论可灌 ~3GB 进会话 cwd);peerreview 对数百页稿件做 400K 字符静默截断后**向模型谎称是全文**——半盲审而不自知。

---

## 一、现状:文件从上传到被读的完整链路

### 1.1 链路(方案 B,2026-05 定稿)

```
前端 Composer(选中即传,串行)
  → POST /api/v1/user/<feature>/upload  (multipart, session_id)
  → backend internal/agentattach/upload.go  校验类型/大小(claw、smart_search、prism 三 feature 共用一份)
  → internal/agent/client.go PushSessionFile
  → agent 容器 POST /api/sessions/:id/files → 落盘会话 cwd  ~/sessions/<id>/<uuid>-<name>
  → 前端把 path 放进 user_message.attachments[].path (WS 帧)
  → backend hub foldUserAttachments 把 path 折成消息首部 @"绝对路径" 标记 (agentbridge/ws.go:433-472)
  → agent 自研执行器:图片→base64 直嵌 vision;其它→模型用 Read / ReadDocument / Bash 读
```

⚠️ **一个必须纠正的历史认知**:当前 agent 是自研 clean-room 执行器(raw `@anthropic-ai/sdk`,`agent/Dockerfile:1-2`),**不是 Claude Code CLI**。老记忆里的 `materializeAttachments`、「Claude Code Read 原生读 PDF」均已不成立:

- **Read**(`agent/src/tools/registry.ts:90-149`):只读 UTF-8 文本,上限 256KB;前 8KB 含 NUL 即判二进制**直接报错**(不会乱码入上下文),并按扩展名给「改用 ReadDocument」的导流 hint;另有乱码横幅 GARBLED_BANNER 防模型假装读过(verifyClaims 锚点)。
- **ReadDocument**(registry.ts:492-547,2026-07-15 新增):固定 argv、无 shell、不需要 Bash 权限,**全 feature 开放**。`.pdf`→pdftotext(-layout,支持 first_pages);`.docx/.odt/.rtf/.epub/.html/.md/.tex`→`pandoc --sandbox -t plain`。输出硬截 40 万字符 + 转换器 stdout 8MB OOM 闸 + 60s 超时。**不支持 `.xlsx/.xls/.pptx/.ppt/.doc/.ods/.odp`**(registry.ts:519-527)。扫描版 PDF 无文字层 → 明确报「OCR is not available」。
- **图片**:不走 Read。`buildUserContentWithImages`(`agent/src/server/attachments.ts:40-71`)从 cwd 读出 base64 内嵌为 image 块(单图 ≤6MB,media_type 白名单 jpeg/png/gif/webp);vision 请求最多随发最近 3 张历史图(`EXECUTOR_MAX_LIVE_IMAGES=3`);读失败/超限/坏图**静默跳过**。
- **Bash**:仅 claw `AllowBash=true`(`claw/spec.go:191`);smart_search/prism/boltslides 禁;生产 bwrap 沙箱自探失败时 fail-closed 拒 Bash(registry.ts:301-315)。

### 1.2 类型 × feature 可读性矩阵(核心结论)

上传白名单(`backend/internal/agentattach/upload.go:180-199`):图片 / PDF / 纯文本系(27 扩展名+text/* mime)/ Office 系(docx/doc/xlsx/xls/pptx/ppt/odt/ods/odp/rtf);**SVG 显式拒收**(防历史回放同源 XSS);其余拒绝。

| 文件类型 | 上传口 | claw(有 Bash) | smart_search / prism(无 Bash) | 读取路径 |
|---|---|---|---|---|
| 纯文本/代码/csv/md/json… | ✅ 收 | ✅ | ✅ | Read(256KB 截断) |
| 图片 png/jpg/webp/gif | ✅ 收 | ✅ | ✅ | base64 直嵌 vision(≤6MB、最近 3 张) |
| 图片 **bmp** | ✅ 收 | ⚠️ 嵌入白名单无 bmp → 静默跳过 | 同左 | 断层:收了嵌不进 |
| PDF(文字层) | ✅ 收 | ✅ | ✅ | ReadDocument→pdftotext |
| PDF(扫描版) | ✅ 收 | ❌ 无 OCR | ❌ | 明确报错「OCR is not available」 |
| docx / odt / rtf | ✅ 收 | ✅ | ✅ | ReadDocument→pandoc |
| **xlsx** | ✅ 收 | ⚠️ 仅靠 Bash+python3-openpyxl 自救(data-figures skill 教了) | ❌ **死路** | ReadDocument 不支持 |
| **pptx** | ✅ 收 | ❌ **无任何路径** | ❌ | python-pptx 未装;容器 pandoc 3.1.11.1 不能读 pptx(3.8.3 才支持) |
| **doc / xls / ppt(legacy)** | ✅ 收 | ❌ | ❌ | 无 LibreOffice/antiword/catdoc |
| ods / odp | ✅ 收 | ❌(openpyxl 不读 ods) | ❌ | ReadDocument 仅支持 .odt |
| svg | ❌ 拒(安全) | — | — | 前端 accept 的 image/* 却能选中 → 必失败 |
| zip 及其它 | ❌ 拒 | — | — | 上传口即拒,到不了模型 |

> boltslides(制作PPT)与 sci_draw 前端整体关闭附件(`enableAttachments:false`),无上传通道。
> peerreview 独立链路(MinIO→Submit 时推 cwd),是**唯一提示词正确对齐工具**的 feature(service.go:473-475 明示「文档类用 ReadDocument」);另注意其会话事实上未禁 Bash(scoringSessionDeny 不含 Bash,与 spec.go:214 注释漂移)。

### 1.3 大小 / 数量限制全表(哪层挡、挡多少)

| 维度 | 前端 | nginx | backend | agent 容器 |
|---|---|---|---|---|
| 图片单文件 | 5MB(toast 拦) | — | 5MB(`MaxImageBytes`) | 嵌入时 ≤6MB(超限静默跳过) |
| 其它单文件 | 30MB(toast 拦) | — | 30MB(`MaxFileBytes`) | **零校验**(Bun 默认 128MB 请求体兜底) |
| 请求体硬顶 | — | `client_max_body_size 50m` | `UploadLimitMiddleware(50MB)` + 全局 multipart 50MB | — |
| 单条消息附件数 | **10(唯一防线)** | — | ❌ 无 | ❌ 无(foldUserAttachments 不限长) |
| 单会话累计文件数/磁盘 | ❌ | — | ❌ | ❌(cwd 无配额;prod bind mount `./data/agent-sessions` 无界,仅显式删会话才 rm -rf —— 既有性能审计 P0) |
| 进上下文口径 | — | — | — | Read 256KB;ReadDocument 40 万字符;Bash stdout 回喂 60K 字符;PDF 可 first_pages 限页 |

其它并存口径(不一致):prism figure 资产 8MB 仅 .png/.jpg/.jpeg/.pdf(独立实现,未挂 UploadLimitMiddleware);peerreview 稿件 50MB/附件 30MB(第二套实现);feedback 图 10MB。图片上限存在 **5/6/8/10MB 四个口径**。

### 1.3b 上传端点之外的入湖路径(补漏盘点——限制矩阵原本不完整)

会话 cwd 的写入不止 upload 一条路。`PushSessionFile`(client.go:253)与 `PutWorkspaceFile`(client.go:464)**本身零校验**,agent 落盘端同样不看大小,唯一物理兜底是 Bun 默认 128MB/请求:

| 入湖路径 | 单文件帽 | 数量帽 | 评估 |
|---|---|---|---|
| agentattach upload(claw/ss/prism) | 5/30MB ✅ | 仅前端 10/条 | 唯一有全套限制的路 |
| **引用文献 reference.go** | **❌ 零检查**(reference.go:231-237;上游仅文献集上传端 50MiB 帽) | 单请求 30/60 篇;**跨请求无帽** | **最大敞口**:单请求理论 ~3GB 直灌 cwd;50MiB PDF 远超 30MB 语义帽 |
| peerreview pushAssetsToSession | 推送时零检查,界在上传端(稿件 50MB/.pdf.docx;附件 30MB×≤10,**附件无扩展名白名单**) | 每投稿 ≤350MB 有界 | 附件收 xlsx/pptx 但审稿会话读不了 |
| prism materializeProject | 单文件无帽(用户侧受全局 10MB JSON 体限;agent 自产大文件 ?full=1 回读**无帽**后每轮原样写回) | 新文件 50/轮、cwd 2000 条目 | 自产文件可滚雪球 |
| boltslides deck 回灌 | 实际 ≤20MB(agent RAW_CAP) | — | 有界 |

会话磁盘总体:无 TTL、无配额,只有显式删会话才 rm -rf;「引用文献 + 多轮上传」跨请求累加是磁盘无界 P0 的主敞口。

### 1.4 具体问题清单(按优先级)

**P0 — 能力与承诺断层**
1. 上传白名单收 Office 全家 + 报错文案承诺「可上传 Office 文档 (docx/xlsx/pptx)」(upload.go:199),但 xlsx 仅 claw、pptx/legacy 全灭。用户传 pptx:上传成功 → 模型两跳皆败(Read hint 误导指向不支持它的 ReadDocument)→ 只能口头道歉。
2. 提示词漂移:`attachLine`(turnLoop.ts:90-95)不知道 ReadDocument,仍教「PDF/Office 用 Bash 转」——对无 Bash 的 smart_search/prism 字面上教模型直接放弃(其实 ReadDocument 明明能读 pdf/docx);`claw.go:93-100` 宣称「PDF→Read 能解析」「图片→Read 后能看到」双双失实,图片条还与 attachLine「绝不要对图片路径调 Read」**同一 system 内互相矛盾**;3 份 library-reference SKILL.md 的「PDF 你能原生解析」同样过时。

**P1 — 限制体系漏洞**
3. 附件数量仅前端挡;后端/agent 无 per-message、per-session 数量与磁盘配额;prod 会话磁盘无界增长。**引用文献路径完全绕过大小帽**(单 PDF 零检查、跨请求累计无帽,见 1.3b)。
4. Dockerfile:11 注释「pptx 走 pandoc」错误——实测 pandoc 3.1.11.1 `--list-input-formats` 无 pptx/xlsx(输出格式才有 pptx,**把 writer 误当 reader**);pandoc 读 pptx/xlsx 是 3.8.3(2025-12)才有的能力,且 Debian trixie apt 最高就是 3.1.11.1,**升级只能装上游官方二进制**。ReadDocument 的扩展名正则(registry.ts:519)也没放行 pptx/xlsx——**双层都堵,只改任何一层都不够**。
5. xlsx/pptx 的 Read 报错 hint 是假引导(指向不支持它们的 ReadDocument),两跳皆败后无第三跳(除 claw)。
6. **peerreview 大稿件静默半盲审**:全文抽取硬截 400K 字符(≈前 100-160 页),超出部分丢弃,但注入 prompt 的 preamble 对模型**谎称是「全文」且禁止再读**,truncated 标志在审稿调用点被忽略(service.go:1693-1698)。另:400K 字符对中文稿 ≈200K+ tokens,可能直接超模型 128K 上下文;50MB 稿件推送与 10s roundTripTimeout(client.go:35)存在竞态。

**P2 — 一致性/打磨**
6. 类型校验零内容嗅探(纯扩展名+浏览器自报 MIME);前端 accept 与后端白名单人工同步已漂移(后端收 .rs/.java/.sql/.odp 前端没列;前端 image/* 放 SVG 后端必拒);前端对拖拽/粘贴入口完全无类型预校验,类型错误要等一次 RTT 才报错。
7. chunked 超限文案误报「≤30 MB」实为 50MB reader 触发(upload.go:161);bmp 收了嵌不进(静默);图片嵌入失败静默,模型无从区分「坏图」与「没图」。
8. 图片上限 4 个口径;3 套上传实现(agentattach/prism 资产/peerreview)并存。
9. peerreview 事实未禁 Bash,与 spec 注释漂移(安全面,顺带记录)。

---

## 二、业界如何处理(全部带出处,详见各节)

### 2.1 Anthropic 官方栈(同栈,最可抄)

- **Read 不读 Office 是官方立场**:Claude Code Read 仅支持文本/图片/PDF(>10 页强制 pages 参数)/ipynb;读 docx 直接报「cannot read binary files」(issue #35911);「加原生 Office 工具」的请求被 **closed as not planned**(issue #19310)。
- **官方范式 = 落盘 + 预装开源工具链 + skills**:[anthropics/skills](https://github.com/anthropics/skills) 的 docx/xlsx/pptx/pdf 四技能就是 claude.ai「Create files」的生产实现——读取用 `pandoc -t markdown`(docx)、`markitdown`(xlsx/pptx 预览)、openpyxl/pandas(xlsx 精读)、pypdf/pdfplumber(pdf);编辑走 unzip→改 OOXML→zip;验收用 LibreOffice headless 转 PDF→pdftoppm 出图回看。**注意 license:这四个 skill 是 source-available 非开源(禁衍生/分发),可借鉴 pattern 但不能整目录照搬**;底层工具链全开源。
- **claude.ai 产品口径**:单文件 500MB、每对话 20 个文件;**xlsx 必须开启 code execution 才能传**(即官方产品也是沙箱转换而非模型直读)。API document block:32MB/请求、PDF 600 页(<1M 上下文时 100 页);「docx/xlsx 不支持 document block,必须先转文本或 PDF」是 API 文档原文。
- **二进制进上下文守则**(Claude Code v2.1.69):MCP 返回的二进制一律解码落盘存路径,绝不 base64 进上下文。

### 2.2 开源编码/通用 agent(共性三分流)

| 文件类别 | 业界一致做法 | 例子 |
|---|---|---|
| 文本 | 直读 + 三重截断(大小/行数/行长) | Gemini CLI 20MB+2000 行+单行 2000 字符;OpenHands 10MB;OpenManus 16K 字符 |
| 模型原生多模态 | base64 inline;图片人人支持,PDF/音视频仅模型 API 支持者敢直塞 | Gemini image/pdf/audio/video 全塞;Codex 仅图片且先缩到 2048px;aider 把 PDF 当图 |
| 其它二进制(Office) | **工具层显式拒读(报错文案写给模型看)+ 沙箱预装解析库让 agent 自己跑代码转文本** | OpenHands 报错逼 agent 用 bash;Gemini 路由到 safe-docx 扩展;Manus 沙箱预装工具链 |

细节:OpenHands 上传层默认**完全不限**(`file_uploads_max_file_size_mb=0`,补限制的 issue 被关 not planned),限制做在读取工具层(file_editor 10MB + binaryornot 内容嗅探)——**「上传落盘便宜,进上下文才贵」**是普遍理念。Gemini CLI 的 `detectFileType` 七分类(text/image/pdf/audio/video/binary/svg,扩展名→MIME 库→isbinaryfile 嗅探三级判定)是最完整的类型分流实现。Codex CLI 压根没有 Read 工具(shell 即读文件)。

### 2.3 开源聊天平台(最接近我们产品形态)

| 平台 | 抽取方式 | 单文件默认 | 数量默认 | 类型校验 |
|---|---|---|---|---|
| Open WebUI | langchain loaders 按扩展名分派(docx2txt/UnstructuredExcel→pandas 降级/python-pptx 降级/PyPDF),可切 Tika/Docling 等 8 种引擎 | 不限(admin 可设) | 不限(仅前端拦) | 扩展名 |
| LibreChat | 多通道:RAG API(pgvector)/ **Code Interpreter(原始文件推沙箱,与我们最像)**/ OCR / 文本 | 512MB | 10/请求 | MIME 正则 |
| Dify | 内置 ETL 或 Unstructured | **15MB** | **5/次** | 扩展名 |
| LobeChat | 纯 TS 进程内解析:docx→mammoth、xlsx→SheetJS、pptx→officeparser、pdf→pdfjs | 未定默认 | — | 扩展名 |

共识:①**没有任何平台让 LLM 直读 Office 二进制**,全部先抽文本;②限制配置结构可抄 LibreChat 的 `fileLimit/fileSizeLimit/totalSizeLimit/supportedMimeTypes` 按 endpoint 分层 + `fileTokenLimit`;③Dify 经典坑 = 应用层限额必须与 nginx `client_max_body_size` 同步(我们 5411 已同步,保持);④扩展名校验比 MIME 主流(浏览器 MIME 不可靠),Open WebUI 还纠正被误标 MIME 的文本文件。

### 2.4 转换工具选型对比

| 方案 | 格式覆盖 | 体积 | 质量 | 许可证 | 装进 agent 容器? |
|---|---|---|---|---|---|
| **markitdown**(微软) | docx/xlsx/pptx/pdf/图片/音频/ZIP,一键转 md | pip 百 MB 级(pandas 为大头),无权重 | Office 好;PDF 仅文本层无 OCR | MIT | ✅ 首选 |
| **pandoc ≥3.8.3** | 读 docx + **pptx/xlsx(2025-12 新增)** | 单二进制 ~102MB | docx→md 最保真;pptx/xlsx reader 尚新 | GPLv2+(exec 调用不传染) | ✅ 推荐(需升级,apt 版 3.1 不行) |
| 轻量库组合 python-docx/openpyxl/python-pptx/pdfplumber | 各一库 | 几十 MB | 脚本化精读最灵活 | MIT/BSD | ✅ 必装(精读层) |
| docling(IBM) | PDF 版面/表格最强(97.9%)+ OCR | **torch+1-2GB 权重**;Office 部分底层就是上面那些轻量库 | PDF 最强但 CPU 3.1s/页 | MIT | ⚠️ 仅扫描件刚需时 |
| unstructured OSS | 30+ 格式 | **镜像 ~5.7GB**(含 LibreOffice) | 中 | Apache-2.0 | ❌ 太重 |
| Apache Tika | 1000+ 类型 | 165-332MB + Java 侧车 | 纯文本,结构弱 | Apache-2.0 | ❌ 架构不匹配 |

---

## 三、建议方案(分三档,未实施,仅调研结论)

### A 档 · 纯提示词/文案修复(零依赖变更,立即可做)

1. **重写 attachLine**(turnLoop.ts:90-95):补 ReadDocument 及其支持范围(pdf/docx/odt/rtf/epub/html + first_pages);xlsx → 有 Bash 的会话教 python3+openpyxl,无 Bash 教如实告知;pptx/legacy → 如实告知暂不支持。改后需 restart scholar_agent(记忆铁律:改 prompt 必须重启)。
2. **改写 claw.go 附件协议**(claw.go:93-100):删掉「Read 能读 PDF/图片」失实条目,对齐 ReadDocument;消除与 attachLine 的图片矛盾。
3. **精准化 Read 报错 hint**(registry.ts:110-117):xlsx/pptx/doc 不再泛化指向 ReadDocument;按扩展名给对的下一步(或明说不支持)。
4. 修 3 份 library-reference SKILL.md 的「PDF 你能原生解析」;修 chunked 超限「≤30MB」误导文案。

### B 档 · 补齐解析能力(照抄 Anthropic 官方配方,推荐主路线)

5. **Dockerfile 烧入**:`markitdown`(含 [xlsx][pptx][docx] extras;镜像期 pip 装,与 matplotlib/rdkit 同策略)± 官方二进制升级 pandoc ≥3.8.3。python-pptx 也可经 pip 补上(apt 定位失败的替代)。
6. **ReadDocument 扩展 xlsx/pptx**:路由到 markitdown(xlsx 按 sheet 出表、pptx 按 slide 分节)——这一步让**无 Bash 的 smart_search/prism 也能读**,消除结构性缺口;沿用现有 40 万字符/8MB/60s 三闸。
7. **legacy doc/xls/ppt 与 ods/odp:上传口拒收**,文案引导「请另存为 docx/xlsx/pptx 后再传」(业界同样不管 legacy;装 LibreOffice 太重不值)。同时把 bmp 从上传白名单去掉或补进嵌入白名单。
8. 可选:写一个 `office-docs` guide skill(借鉴 anthropics/skills 的 pattern 自写,勿照搬其文本),教 claw「大 xlsx 禁全文转换、用 openpyxl 定位 sheet/区域」——用读取纪律替代生硬的上传大小收紧。
9. 扫描版 PDF:短期维持明确报错;若产品需要再评估 tesseract(或 docling)。

### C 档 · 限制体系治理

10. **前后端白名单单一真源**:后端 `GET /upload-config` 下发(或代码生成共享常量),前端 accept 从它生成;accept 显式排除 SVG。
11. **后端补数量/累计配额**:per-message ≤10(与前端对齐)、per-session 累计文件数(如 100)与磁盘(如 500MB)配额——在 agentattach 层统一挡。
12. **会话 cwd 磁盘 GC**:接既有 P0——按会话最后活跃时间做后台清理(backend 是会话真源,可安全 GC)。
13. 统一图片上限口径(建议全线 5MB,agent 嵌入兜底 6MB 保留);三套上传实现长期可收敛到 agentattach。

### 产品口径参考(定限额时用)

- claude.ai:500MB/文件、20 文件/对话;API:32MB/请求、PDF 100-600 页;Dify:15MB/5 个(最严);LibreChat:512MB/10 个(最宽);主流中间值 **20-50MB、5-10 个/次**。
- 我们现行 30MB/10 个在业界合理区间,**无需调大**;真正要治理的是「会话累计无上限」与「收了读不了」。

---

## 四、落地记录(2026-07-24 实施,全部完成并验收)

上面 A/B/C 三档 + 补漏 P1 已全部落地。变更清单:

**能力补齐(B 档)**
- [agent/Dockerfile](../agent/Dockerfile):vendor 上游 pandoc 3.10.1 到 `/usr/local/bin`(双架构 tarball 入库 `agent/vendor/pandoc/`,离线可复现;apt 3.1 保留作依赖),构建期断言 pptx/xlsx reader 存在。
- [registry.ts](../agent/src/tools/registry.ts):ReadDocument/extractDocHead 支持 `.pptx`(pandoc 3.10)与 `.xlsx`;**xlsx 实测选型改走 python3+openpyxl 转换脚本** [xlsx2text.py](../agent/src/tools/xlsx2text.py) —— 验收时发现 pandoc 3.10 的 xlsx reader 读不了 openpyxl 系文件(绝对 Target rels 报 `Entry not found`)且丢表头、整数渲成 1.0;openpyxl 兼容所有生成器且值保真(每 sheet 一节、TSV 行)。Read 二进制报错 hint 按扩展名四档精准化;legacy(doc/xls/ppt/ods/odp)明确报「不支持,建议另存为」不再假引导。
- [upload.go](../backend/internal/agentattach/upload.go):白名单改「收=能读」——legacy 五格式与 bmp 上传口拒收(引导另存为/转格式),isOffice 收窄为 docx/xlsx/pptx/odt/rtf;chunked 超限文案修正。

**提示词对齐(A 档)**
- attachLine([turnLoop.ts](../agent/src/turn/turnLoop.ts))与 claw 附件协议([claw.go](../backend/internal/prompts/claw.go))重写:教 ReadDocument 真实支持矩阵,消除「Read 能读 PDF」失实与图片条自相矛盾;5 处 SKILL.md 过时断言修正(3×library-reference、paper-explain、data-figures)。

**限制治理(C 档)**
- agent 咽喉点配额([workspace.ts](../agent/src/server/workspace.ts)):单文件 64MB / 会话累计 1GB / 2000 文件(env 可调),覆盖 upload、引用文献、peerreview 推稿、prism 物化**全部入湖路径**;413/`quota_exceeded` 全链路映射(agent http→Go client `ErrSessionQuotaExceeded`→用户文案「会话文件空间已满」);覆盖写扣减目标占用防死锁。
- 会话磁盘 GC([sessions.ts](../agent/src/server/sessions.ts)):TTL 30 天(`EXECUTOR_WORKDIR_TTL_DAYS`,0=关)不活跃即整目录回收(含 .skills/.active 侧车),`.active` 标记 1h 节流 touch,6h 扫描节流,活跃 WS 绝不删;聊天记录真源在 backend journal 不受影响。
- PushSessionFile 专用 120s 超时(原共用 10s,50MB 稿件会被掐断);reference.go 引用 PDF >50MiB 跳过 + 推送失败降级不断批;foldUserAttachments 服务端 10 个数量帽。
- 前端 [useComposerAttachments.ts](../frontend-user/src/shared/hooks/useComposerAttachments.ts):accept 枚举化(去 image/*,SVG/BMP/legacy 选不中)、`classifyFile` 预校验与后端同构(拖拽/粘贴即时拦截,文案同款)、图片判定 mime+扩展名双通道(消除 5/30MB 档位错配)。

**peerreview(补漏 P1)**
- 截断诚实化:preamble 与 commonContext 双处按 `truncated` 如实告知「前段抽取」,truncated 标志不再被忽略;新增 CJK 感知 token 预算钳制(`estimateTokens`/`capManuscriptForContext`,预算 9 万 token,防中文长稿超上下文)。
- 附件 legacy 拒收;评分/方法论会话 denylist 补 Bash 三件套(对齐 spec 注释意图,prompt 本就严禁 Bash)。

**验收证据(本地 docker 全栈实测)**
- 单测:agent 58/58(新增配额 4 + GC 2);backend `go test ./internal/{agentattach,agentbridge,peerreview}` 绿;前端 tsc -b 绿;三镜像构建成功。
- 容器内:pandoc 3.10.1 生效;`xlsx2text.py` 对 openpyxl 生成的多 sheet 中文 xlsx 输出完整保真;pandoc 读 pptx 正常;ExportDocument 写方向(docx/pptx/weasyprint pdf)无回归。
- API 矩阵:txt/pdf/docx/xlsx/pptx 上传 200;.doc/.svg/.bmp/31MB/越权会话 全部 400 且文案精准;65MB 直推 agent → 413 `quota_exceeded`;extract-head 对 xlsx/pptx 返回正确文本。
- **黄金端到端**:真实 WS 一轮(deepseek-v4-flash),上传 xlsx → `@"path"` 折叠进 user_message → 模型调 ReadDocument 拿到 `=== Sheet: Sheet === a\t1` → 又用 Bash+openpyxl 在 bwrap jail 内精读 → 最终回答与文件真实内容逐项一致(journal `agent_turn_events` 全程可查)。
- 改动经 7 维对抗性审查 workflow(每发现 2 名怀疑者验证)复核。

**对抗性审查复核(7 维审查 + 逐发现双怀疑者验证)后又修 13 处**:
- [high] legacy 拒收改「仅扩展名」——Windows 装 Excel/WPS 后 `.csv` 带 `application/vnd.ms-excel`、`.docx` 带 `application/msword`,按 mime 拒会误杀合法文件(legacy mime 只在扩展名不认识时兜底拒);已回归实测 csv+ms-excel mime → 200。
- isImage 收窄到 vision mime 白名单:tiff/heic/avif 等上传口拒收并给转格式指引(此前会静默变「幻影图片」);`image/jpg` 归一为 `image/jpeg`。
- GC 加固:TTL env 非数字(如误配 "30d")时 NaN 会让三道保护恒失效、首个 tick 删光所有目录——加 `envNum` 安全解析(配额三 env 同修);GC 只动合法 session-id 命名目录;rm 前复查活跃态(TOCTOU 收窄);deleteSession 清理 `.active`/`.template` 侧车与节流表。
- boltslides 自愈:`<workDir>.template` 侧车持久化模板种类(GC 保留),BuildDeck 发现脚手架缺失时凭它幂等重铺——修复「GC/容器重建后老 PPT 会话永久失去构建能力」。
- smart_search 系统提示词原文**硬禁 Read**、与附件/引用功能直接对撞——改为「附件与 references/ 可用 Read/ReadDocument,其余禁令不变」。
- 执行器根本没有 WebFetch 工具,4 处 SKILL.md 却教模型「可用 WebFetch 抓 pdf_url」——全部改为如实说明不可抓取;frontmatter allowed-tools 同步。
- peerreview `isCJKRune` 补 Hangul 音节区与 CJK 扩展 B(韩文稿件 token 此前低估约 4 倍)。
- 前端:OOXML mime 兜底从 `includes('officedocument')` 收紧为与后端一致的精确白名单(dotx/xltx 不再前端放行后端拒);图片 mime 同款 vision 白名单;`targetSessionRef` 在会话 prop 变化(含变回 null=新对话)时重置——修「新对话上传落进旧会话 cwd」。
- Read 二进制泛化分支的用户提示不再虚假承诺「正在换用文档读取方式」;ReadDocument 截断提示补 xlsx/docx 的出路指引。

**遗留说明**:扫描版 PDF 仍明确报「OCR 不可用」(按报告决策暂不装 tesseract);prism 资产 8MB/feedback 10MB 独立口径为刻意保留(非 vision 通道);GC 会让 30 天不活跃会话的旧附件/产物文件 404(业界一致,聊天文本不丢);配额 check-then-write 并发窗口内可轻微超帽(软性安全帽,接受);⚠️ **`agent/vendor/pandoc/` 两个 tarball(~70MB)必须随仓库提交**,否则服务器 checkout 构建会因缺 vendor 失败(生产网络拉不动 GitHub,故刻意入库)。

## 五、附带修复:数据源别名铁律回退(2026-07-24,与本次上传大修同批 WIP)

排查上传链路时发现同一批未提交改动里的「W6 P1-8 真名化」违反了商务硬约束——**对外绝不暴露上游数据源真名**
(Semantic Scholar / OpenAlex / PubMed),一律用 Graph / Discovery / Medicine。用户拍板回退,已全部改回。

该政策原有专门迁移背书(`docker/mysql/migrations/archive/0069_feature_prompts_brand_cleanup.sql`,
理由:真名写进 prompt「会让 LLM 回复用户时不小心带出来」),W6 为了「中文覆盖边界诚实披露」整体反转了它。
回退时**保留了披露诚实性**,只是改成不点名写法:「本平台检索源(Graph/Discovery/Medicine)均为国际英文学术库,
不含知网/万方…」。

一轮 6 路穷尽审计(每条发现再经复核)确认并修复 9 处泄漏,其中三处是我第一遍人工排查漏掉的:
1. **`shared/lib/source.ts` 的 `SOURCE_META`** —— 全站唯一真相,SourceBadge(6 处调用)与搜索侧栏 Tooltip 都取它,
   hover 任意论文来源角标即露真名;letter 也被从 G/D/M 改成 S/O/P(真名首字母)。
2. **`agent/src/mcp/mcpTools.ts`** —— 上游 MCP 的 tool description / input_schema 里有成段「`semantic` = Semantic
   Scholar (best citation graph)…」散文(实测上游包内 **101 处**真名),原样进模型上下文,模型解释换源时会逐句转述。
   已在唯一透传口加 `maskUpstreamBrands()` 出口遮蔽 → 实测 101 → 0。**坑**:正则必须大小写敏感(品牌 CamelCase、
   enum 小写),否则连 enum 值一起改掉 → 模型发 `source:"Medicine"` → 上游 400,全部检索报废;另显式跳过
   `enum`/`const`/`default` 键。
3. **`shared/lib/mask-tool-source.ts`** —— 这一层的职责本就是遮蔽工具详情里的 `source:"olx"`,W6 把映射目标改成真名,
   等于把遮罩改成了曝光器。
   
另修:`handler_ssr.go` noscript 正文的「OpenAlex h-index」→「h-index」(同文件 desc 分支早已是中性写法);
`AuthorHero.tsx` 直接渲染内部 code(`STC`/`OLX`/`PMD`)改走品牌映射。

**回归护栏**(此前一处都没有,所以才会被悄悄反转):新增 `source-brand-invariant.test.ts`(9 项)与
`mcpTools.test.ts`(5 项),把「展示层输出恒 ∈ {Graph, Discovery, Medicine, Journal}」和「遮蔽生效且 enum 存活」
钉成断言。

**边界(用户 2026-07-24 拍板「SEO 页面暂时不管」)**:SEO/营销/指标出处标注面的真名**刻意保留**——
`handler_ssr.go` 的 meta description/keywords、`SearchPage.tsx`/`JournalSearchPage.tsx`/`landings.ts` 的 keywords、
博客 slug `semantic-scholar-vs-google-scholar`,以及 `JournalMetricsGroups.tsx` 中与 JCR/SCImago/CCF 并列的
"OpenAlex" 指标分组标题。约束只适用于 **AI 对话与产品 UI**。

**实测验收**:直接追问模型「你在哪些学术数据库检索的」→ 正文真名 0 处、只答 Graph/Discovery/Medicine;
生产镜像上游 MCP 包 148 处真名 → 遮蔽后 0 且 enum 存活;真实 WS 帧 `{"source":"openalex"}` 经 ToolCallBlock
渲染为 `{"source":"Discovery"}`。agent 63/63、前端 69/69 全绿。

## 附:关键代码位置速查

| 关注点 | 位置 |
|---|---|
| 上传校验(共享) | `backend/internal/agentattach/upload.go`(类型 :180-199,大小 :53-54) |
| @"path" 折入 | `backend/internal/agentbridge/ws.go:433-472` foldUserAttachments |
| 附件系统提示词 | `agent/src/turn/turnLoop.ts:90-95` attachLine |
| claw 附件协议 | `backend/internal/prompts/claw.go:93-100` |
| Read / ReadDocument | `agent/src/tools/registry.ts:90-149` / `:492-547` |
| 图片直嵌 | `agent/src/server/attachments.ts:40-71` |
| Bash 权限 | `backend/internal/claw/spec.go:191`(唯一 true);沙箱 fail-closed registry.ts:301-315 |
| agent 落盘 | `agent/src/server/workspace.ts:159-169`(零校验) |
| 前端限制真源 | `frontend-user/src/shared/hooks/useComposerAttachments.ts:18-25` |
| 磁盘持久化 | `docker-compose.prod.yml:364`(bind mount 无 GC) |
