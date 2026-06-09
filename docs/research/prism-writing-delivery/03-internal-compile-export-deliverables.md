# Prism 编译 / PDF / 导出 与「非文档交付物」(人工补写)

> 本篇由人工读代码补写(workflow 该 stream 未返回结构化输出)。聚焦:用户最终能从 Prism **拿到/带走**什么。

## Summary

Prism 有一条**完整、强隔离**的 LaTeX→PDF 编译管线,产物落 MinIO(`scholar-prism` 桶)、按内容哈希缓存、前端 react-pdf 内联预览。但从「交付物」视角看:**编译 PDF 只能在线预览、不能下载(无 `Content-Disposition`)**;**没有 docx/zip/bib 等可带走的导出**;**没有编译错误自动修复回路**(`extractCompileError` 已能抠出带行号的错误摘要,但从不自动回喂给 agent 起一轮修复);**agent 不能生成图表/数据**(Bash 被禁)。`venue_template_key` 列已存在于 project 模型,但未接线(comingSoon)。

---

## 1. 编译管线(锁定架构 D3:watcher + 共享卷,彻底断网)

- 入口:`POST /projects/:id/compile {engine?}` → `Handler.Compile` → `Service.StartCompile`([handler.go:255](backend/internal/prism/handler.go#L255), [service.go:247](backend/internal/prism/service.go#L247))。
- **异步**:HTTP 写超时 30s < 编译可能 60s,故 `StartCompile` 立即建 `queued` 记录 + 起后台 goroutine,前端轮询 `GET /compile/:compileId`([handler.go:274](backend/internal/prism/handler.go))。
- **沙箱交互**([texclient.go](backend/internal/prism/texclient.go)):后端与 `scholar_prism_tex` **只经共享卷 `./data/prism-work`** 通信——`mkdir <cid>/` 写项目文件(逐路径 `safeRel` 校验防 `../`)→ 原子写 `.request`(main+engine)→ 轮询 `status.json`(95s 上限)→ 读 pdf/log/error → `RemoveAll` 清理。
- **沙箱加固**(docker-compose `prism-tex`):`network_mode: none` + `read_only: true` + `cap_drop` + `security_opt`([docker-compose.yml:364-375](docker-compose.yml#L364))。**这是安全命门,任何改动都不能碰它。**
- 引擎:`pdflatex` | `xelatex`([model.go:43](backend/internal/prism/model.go#L43))。

## 2. 产物存储 + 预览(可看,不可带走)

- 成功:PDF/log `PutObject` 进 MinIO `scholar-prism` 桶,记 `pdf_object_key`/`log_object_key`(均 `json:"-"` 不外泄)([service.go:309/345](backend/internal/prism/service.go#L345), [model.go:112](backend/internal/prism/model.go#L112))。
- **内容哈希缓存**:`FindCachedCompile(projectID, cacheKey)` 命中则跳过重编译([service.go:278](backend/internal/prism/service.go#L278))——同样内容不重复烧编译。
- 取 PDF:`GET /projects/:id/pdf` → `OpenLatestPDF` 流式回最近成功 PDF([handler.go:296](backend/internal/prism/handler.go#L296))。
  - ⚠️ **只设 `Content-Type: application/pdf` + `Cache-Control: no-store`,无 `Content-Disposition`** → 浏览器**内联预览**(react-pdf),**不是下载**。这是「交付物」第一个缺口:用户带不走 PDF。

## 3. 编译错误处理(有摘要,无自动修复回路)

- `extractCompileError(log)` → `(summary, excerpt)`:从完整 latexmk 日志抠出友好错误摘要 + **带行号的上下文片段**([compile_error.go:29](backend/internal/prism/compile_error.go#L29),有单测 `compile_error_test.go`)。存 `error_summary`。
- ⚠️ **没有自动修复回路**:grep `ws_round.go`/`edit.go` 里**没有**把 `ErrorSummary`/编译错误回喂给 agent 的逻辑。用户必须手动把错误贴给 agent 或再开一轮。Cursor/Overleaf-AI 的「编译失败→agent 自动读错误→修」回路缺失(综合设计建议 #3:回路要的料 `extractCompileError` 已就绪,只差 loop)。

## 4. \cite RAG(防幻觉,已做)

- [cite.go](backend/internal/prism/cite.go):`\cite` 走个人文献库 RAG,`ErrCiteNotInLibrary` 兜底——只引库里真实存在的文献,防 agent 编造 bib key。

## 5. 缺的「交付物」(从本视角看的核心改进点)

| 缺口 | 现状 | 建议 |
|---|---|---|
| **PDF 下载** | 只内联预览(无 attachment) | `GetPDF` 加 `?download=1` → `Content-Disposition: attachment`(最小改) |
| **导出 docx** | 无 | LaTeX→docx 走 pandoc(agent 容器已装 pandoc)做一个后端导出步骤,给合著者/期刊 |
| **项目 .zip** | 无 | 从 DB 真源用 Go `archive/zip` 打包(Overleaf 可导入) |
| **图表/数据生成** | Bash 被禁,agent 不能画图/算数据 | 在 **agent 容器**(egress-only,非 network_none 的 prism_tex 沙箱)放开 Bash + matplotlib/numpy/pandas,出 `figures/*.pdf` 再 `\includegraphics`(claw 已在该容器安全跑 Bash) |
| **venue 模板** | `venue_template_key` 列已存在但未接线 | 接线:按 venue 套用模板/样式 |
| **编译自动修复** | `extractCompileError` 就绪,无 loop | 2-3 轮自动修复回路(同错两次即停 + 配额计) |

## Relevance to Prism(交付视角)

Prism 把「文档交付」(round/apply 进 IDE)做得很好,但「**带得走的交付物**」(下载 PDF / docx / zip / 图)几乎为零——而学术用户最终要把 PDF 投稿、把 docx 给导师、把项目导入 Overleaf。这恰是与 claw「成果交付」同构的机会:claw 让 agent 产出**可下载**产物;Prism 也该让最终文档**可带走**,并让 agent 能**生成图表/数据**(当前结构性禁掉了)。安全边界明确:放开 Bash 只在 **agent 容器**,**绝不碰 network_none 的 prism_tex 编译沙箱**。

## Sources
- backend/internal/prism/texclient.go(沙箱交互全文)
- backend/internal/prism/handler.go:255-319(Compile/GetCompile/GetPDF)
- backend/internal/prism/service.go:246-360(StartCompile/缓存/PutObject/OpenLatestPDF)
- backend/internal/prism/model.go:43-152(Compile/VenueTemplateKey/引擎)
- backend/internal/prism/compile_error.go(extractCompileError)
- docker-compose.yml:364-375(prism-tex network_mode:none + read_only + cap_drop)
