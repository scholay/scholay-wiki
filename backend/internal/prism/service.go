// ============================================================================
// prism.Service —— 项目/文件 CRUD + 编译编排。
//
// 编译异步:HTTP 写超时 30s < 编译可能 60s,故 StartCompile 立即建 queued 记录 + 起后台
// goroutine(自带超时 ctx),前端轮询 GetCompile。内容哈希命中缓存则免起沙箱。
// 文件真源在 DB(锁定架构 D1);编译时从 DB 物化 current 版本喂给沙箱。
// ============================================================================

package prism

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/storage"

	"github.com/minio/minio-go/v7"
)

// defaultProjectTitle 新建项目的占位标题;自动命名只在标题仍为此值时生效(永不覆盖用户/已命名)。
const defaultProjectTitle = "未命名项目"

type Service struct {
	repo      *Repository
	tex       *TexClient
	bucket    string
	feature   *agentbridge.FeatureBridge // 提供 ServerSideChatStreaming
	agent     agent.Executor             // 直接建/管「每项目」agent 会话(存 prism_projects.agent_session_id)
	sessionMu sync.Map                   // map[projectID]*sync.Mutex —— 串行化「每项目会话」的取/建,防并发双建(review F2)
	// roundEpochs(V3-4.4-1)map[projectID uint]string —— 每项目当前轮次世代号(基线 sha):
	// prepare/reject/apply-成功 时刷新;apply 校验不符即拒。内存态(单实例铁律),重启后 fail-open。
	roundEpochs sync.Map
}

// 注:项目自动起名已移到 agent 容器(见 autoname.go / handleAgentTitle),prism 不再依赖 ai.Service。
func NewService(repo *Repository, tex *TexClient, bucket string, feature *agentbridge.FeatureBridge, agentClient agent.Executor) *Service {
	return &Service{repo: repo, tex: tex, bucket: bucket, feature: feature, agent: agentClient}
}

// 新项目脚手架(对齐 OpenAI Prism 的 article 起始模板)。
const scaffoldMainTex = `\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}

% Core packages
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{hyperref}

\title{Untitled}
\author{Author Name}
\date{\today}

\begin{document}
\maketitle

\section{Introduction}

\end{document}
`

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// ─── 项目 / 文件 ──────────────────────────────────────────────────────────

// CreateProject 建项目 + 种入 main.tex 脚手架(文件 + current 版本)。
func (s *Service) CreateProject(userID uint, title string) (*Project, []File, error) {
	if strings.TrimSpace(title) == "" {
		title = defaultProjectTitle
	}
	// 已全量 cutover:新项目一律新版结构体轨(种默认结构体 + 首投影成 main.tex,用户感知不到文件)。
	p := &Project{UserID: userID, Title: title, MainFile: "main.tex", Status: "active", SchemaVersion: SchemaStruct}
	if err := s.repo.CreateProject(p); err != nil {
		return nil, nil, err
	}
	// Phase 2:种默认写作画像(venue 弱信号 → 多落 builtin+needs_refine,交 planner/用户后续精修)。
	// 失败不阻断建项目:注入侧 SessionProfileBlock 对 NULL 也会回落确定性默认。
	if wp := marshalProfile(deterministicWritingProfile(p.VenueTemplateKey)); wp != "" {
		if err := s.repo.SetWritingProfile(p.ID, wp); err != nil {
			slog.Warn("prism: set default writing profile failed", "project_id", p.ID, "err", err)
		}
	}
	if err := s.initStructProject(p.ID); err != nil {
		return nil, nil, err
	}
	files, err := s.repo.ListFiles(p.ID)
	return p, files, err
}

func (s *Service) GetProject(id, userID uint) (*Project, error) {
	return s.repo.GetProject(id, userID)
}

// RenameProject 改项目标题(空→兜底"未命名项目")。proj 由 handler 传入(已校验归属)。
func (s *Service) RenameProject(proj *Project, title string) (*Project, error) {
	t := strings.TrimSpace(title)
	if t == "" {
		t = defaultProjectTitle
	}
	if err := s.repo.UpdateProjectTitle(proj.ID, t); err != nil {
		return nil, err
	}
	proj.Title = t
	return proj, nil
}

// DeleteProject 删项目:先清 MinIO 编译产物 + agent 会话(best-effort),再事务删 DB 全部子表。
func (s *Service) DeleteProject(ctx context.Context, proj *Project) error {
	if keys, err := s.repo.CompileObjectKeys(proj.ID); err == nil && len(keys) > 0 {
		_ = storage.DeleteObjects(ctx, s.bucket, keys, func(k string, e error) {
			slog.Warn("prism: delete project object failed", "key", k, "err", e)
		})
	}
	if proj.AgentSessionID != nil && *proj.AgentSessionID != "" {
		s.deleteSessionBestEffort(*proj.AgentSessionID) // 释放 agent 端会话,不留孤儿
		if s.feature != nil {
			_ = s.feature.UnbindOwnerSession("project", uint64(proj.ID)) // 清统一归属表映射
		}
	}
	return s.repo.DeleteProjectCascade(proj.ID)
}

func (s *Service) ListProjects(userID uint) ([]Project, error) {
	return s.repo.ListProjects(userID)
}

func (s *Service) ListFiles(projectID uint) ([]File, error) {
	return s.repo.ListFiles(projectID)
}

// GetFileBody 取文件 current 版本正文。
func (s *Service) GetFileBody(projectID, fileID uint) (*File, string, error) {
	f, err := s.repo.GetFileInProject(projectID, fileID)
	if err != nil || f == nil {
		return nil, "", err
	}
	if f.CurrentVersionID == nil {
		return f, "", nil
	}
	v, err := s.repo.GetVersion(*f.CurrentVersionID)
	if err != nil {
		return f, "", err
	}
	return f, v.Body, nil
}

// SaveFile 用户手动保存 → 追加 current 版本(author=user)。
func (s *Service) SaveFile(projectID, fileID uint, body string) (*FileVersion, error) {
	f, err := s.repo.GetFileInProject(projectID, fileID)
	if err != nil || f == nil {
		return nil, err
	}
	ver, err := s.repo.AppendCurrentVersion(fileID, body, sha256Hex(body), AuthorUser, nil)
	if err != nil {
		return nil, err
	}
	_ = s.repo.TouchProject(projectID)
	return ver, nil
}

// ─── 编译 ────────────────────────────────────────────────────────────────

// needsXeLaTeX 判断项目是否必须用 xelatex 编译:任一 .tex 正文含 CJK 字符,或已加载
// ctex/xeCJK/CJK 宏包(这类包在 pdflatex 下本身会报错)。pdflatex 无法处理 UTF-8 CJK,
// 正是「! LaTeX Error: Unicode character 大 (U+5927) not set up」的根因 → 自动切 xelatex。
func needsXeLaTeX(files map[string]string) bool {
	for _, body := range files {
		if containsCJK(body) || loadsCJKPackage(body) {
			return true
		}
	}
	return false
}

func containsCJK(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hiragana, r) ||
			unicode.Is(unicode.Katakana, r) || unicode.Is(unicode.Hangul, r) {
			return true
		}
	}
	return false
}

// loadsCJKPackage 粗判文档是否加载了中文支持包(只用于「向上」强制 xelatex,误判也只是多用 xelatex,安全)。
func loadsCJKPackage(s string) bool {
	return strings.Contains(s, "ctex") || strings.Contains(s, "xeCJK") ||
		strings.Contains(s, "CJKutf8") || strings.Contains(s, "{CJK}") || strings.Contains(s, "{CJK*}")
}

// gatherCurrent 物化项目全部 current 文本文件 → map[relPath]body + 内容哈希。
func (s *Service) gatherCurrent(projectID uint) (map[string]string, string, error) {
	files, err := s.repo.ListFiles(projectID)
	if err != nil {
		return nil, "", err
	}
	// 收集所有 current 文本文件的版本 id,一次批量取(消 N×单查)。
	verIDs := make([]uint, 0, len(files))
	for _, f := range files {
		// Phase 0 只处理文本文件;asset(二进制)走 MinIO,后续阶段接。
		if f.FileKind == KindAsset || f.CurrentVersionID == nil {
			continue
		}
		verIDs = append(verIDs, *f.CurrentVersionID)
	}
	vers, err := s.repo.GetVersionsByIDs(verIDs)
	if err != nil {
		return nil, "", err
	}
	out := make(map[string]string, len(verIDs))
	for _, f := range files {
		if f.FileKind == KindAsset || f.CurrentVersionID == nil {
			continue
		}
		v := vers[*f.CurrentVersionID]
		if v == nil {
			return nil, "", fmt.Errorf("prism: current version %d missing for file %s", *f.CurrentVersionID, f.RelPath)
		}
		out[f.RelPath] = v.Body
	}
	// 内容哈希 = sha256(按路径排序后的 path\x00body 串接),作缓存键。
	keys := make([]string, 0, len(out))
	for k := range out {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var sb strings.Builder
	for _, k := range keys {
		sb.WriteString(k)
		sb.WriteByte(0)
		sb.WriteString(out[k])
		sb.WriteByte('\n')
	}
	return out, sha256Hex(sb.String()), nil
}

// gatherAssets 取项目全部二进制资产(KindAsset,图片等)字节 —— 从 MinIO 拉,连同 relPath 给沙箱 stage。
// 返回 (relPath→字节, 资产内容哈希);哈希折进编译缓存键,图片换了不吃旧缓存。取不到的资产 best-effort 跳过。
func (s *Service) gatherAssets(ctx context.Context, projectID uint) (map[string][]byte, string, error) {
	files, err := s.repo.ListFiles(projectID)
	if err != nil {
		return nil, "", err
	}
	out := make(map[string][]byte)
	shas := make([]string, 0)
	for _, f := range files {
		if f.FileKind != KindAsset || f.MinioObjectKey == nil || *f.MinioObjectKey == "" {
			continue
		}
		rc, _, err := storage.GetObject(ctx, s.bucket, *f.MinioObjectKey)
		if err != nil {
			slog.Warn("prism: asset fetch failed, skipping", "rel", f.RelPath, "err", err)
			continue
		}
		data, rerr := io.ReadAll(rc)
		rc.Close()
		if rerr != nil {
			continue
		}
		out[f.RelPath] = data
		shas = append(shas, f.RelPath+":"+f.ContentSHA256)
	}
	sort.Strings(shas)
	return out, sha256Hex(strings.Join(shas, "\n")), nil
}

// StartCompile 立即建 queued 记录并起后台编译,返回该记录(前端轮询 GetCompile)。
func (s *Service) StartCompile(projectID uint, mainFile, engine string) (*Compile, error) {
	if engine != EngineXeLaTeX {
		engine = EnginePDFLaTeX
	}
	c := &Compile{ProjectID: projectID, Status: CompileQueued, Engine: engine}
	if err := s.repo.CreateCompile(c); err != nil {
		return nil, err
	}
	compileID := c.ID
	safego.Go("prism-compile", func() {
		s.runCompile(compileID, projectID, mainFile, engine)
	})
	return c, nil
}

// runCompile 后台执行:缓存命中→直接复用;否则物化→沙箱编译→PDF/log 传 MinIO→更新记录。
func (s *Service) runCompile(compileID, projectID uint, mainFile, engine string) {
	files, hash, err := s.gatherCurrent(projectID)
	if err != nil {
		s.failCompile(compileID, "内部错误,无法读取项目文件", err)
		return
	}

	// CJK 自动选引擎:含中文/已加载 ctex → 强制 xelatex(pdflatex 处理不了 UTF-8 CJK)。
	// engine 由内容确定 → 仍幂等;缓存键带上 engine,避免同内容不同引擎产物串用。
	if engine != EngineXeLaTeX && needsXeLaTeX(files) {
		engine = EngineXeLaTeX
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Second)
	defer cancel()
	// 二进制资产(struct figure 引用的图片 / 手工上传)—— 从 MinIO 取字节,连同文本一起喂沙箱。
	assets, assetHash, _ := s.gatherAssets(ctx, projectID)
	cacheKey := sha256Hex(hash + "|" + engine + "|" + assetHash)

	// 缓存命中(同内容+同引擎 1h 内编过且成功)→ 复用 PDF,免起沙箱。
	if cached, _ := s.repo.FindCachedCompile(projectID, cacheKey, time.Now()); cached != nil && cached.PdfObjectKey != nil {
		_ = s.repo.UpdateCompile(compileID, map[string]any{
			"status": CompileSuccess, "content_hash": cacheKey, "engine": engine,
			"pdf_object_key": *cached.PdfObjectKey, "log_object_key": cached.LogObjectKey,
			"duration_ms": 0, "expires_at": time.Now().Add(time.Hour),
			"page_count": cached.PageCount, "overfull_count": cached.OverfullCount,
		})
		return
	}

	_ = s.repo.UpdateCompile(compileID, map[string]any{"status": CompileRunning, "content_hash": cacheKey, "engine": engine})

	res, err := s.tex.Compile(ctx, files, assets, mainFile, engine)
	if err != nil {
		s.failCompile(compileID, "编译服务异常,请稍后重试", err)
		return
	}

	// 上传 log(无论成败,便于排错)+ PDF(成功时)。
	base := fmt.Sprintf("prism/%d/%d/%s", projectID, compileID, cacheKey)
	logKey := base + ".log"
	_ = s.putObject(ctx, logKey, []byte(res.Log), "text/plain; charset=utf-8")

	if res.Status == CompileSuccess && len(res.PDF) > 0 {
		pdfKey := base + ".pdf"
		if err := s.putObject(ctx, pdfKey, res.PDF, "application/pdf"); err != nil {
			s.failCompile(compileID, "保存编译产物失败,请稍后重试", err)
			return
		}
		pages, overfull := parseCompileStats(res.Log)
		_ = s.repo.UpdateCompile(compileID, map[string]any{
			"status": CompileSuccess, "pdf_object_key": pdfKey, "log_object_key": logKey,
			"duration_ms": res.DurationMs, "expires_at": time.Now().Add(time.Hour),
			"page_count": pages, "overfull_count": overfull,
		})
		return
	}

	// 失败:优先从完整 log 抠带行号的错误块。
	//   summary(带「第 N 行」)给 UI 红条;excerpt(! 错误 + l.NNN + 源码)给 AI 精准定位修复。
	//   log 里没有 "! " 块 → 回落容器友好摘要 → 再回落通用文案。
	summary, excerpt := extractCompileError(res.Log)
	// 容器 error.txt 兜底:容器里 `cut -c` 按字节截断可能切坏 UTF-8(半个中文)→ ToValidUTF8 丢弃非法尾字节,
	// 避免乱码流到红条/AI(extractCompileError 的输出本身按 rune 截断,是 rune 安全的;这里只兜容器兜底)。
	containerSummary := strings.ToValidUTF8(strings.TrimSpace(res.ErrorSummary), "")
	if summary == "" {
		summary = containerSummary
	}
	if excerpt == "" {
		excerpt = containerSummary
	}
	if summary == "" {
		summary = "编译失败,请检查 LaTeX 语法"
	}
	if excerpt == "" {
		excerpt = summary
	}
	_ = s.repo.UpdateCompile(compileID, map[string]any{
		"status": CompileError, "log_object_key": logKey,
		"log_excerpt": excerpt, "error_summary": summary, "duration_ms": res.DurationMs,
	})
}

func (s *Service) failCompile(compileID uint, friendly string, err error) {
	slog.Error("prism compile failed", "compile_id", compileID, "err", err)
	_ = s.repo.UpdateCompile(compileID, map[string]any{
		"status": CompileError, "error_summary": friendly, "log_excerpt": friendly,
	})
}

func (s *Service) putObject(ctx context.Context, key string, body []byte, contentType string) error {
	_, err := storage.PutObject(ctx, s.bucket, key, bytes.NewReader(body), int64(len(body)),
		storage.PutOptions{ContentType: contentType})
	return err
}

// ── 编译产物 GC(评审 #7)─────────────────────────────────────────────────
// prism_compiles 行与 pdf/log MinIO 对象此前永不回收 → 无界膨胀。这里定期回收「早于 retention 且非各项目
// 最新一条」的编译:每项目最新一条永久保留(/pdf 恒可取),其余历史堆积按 batch 删对象 + 删行。
const (
	compileGCRetention = 48 * time.Hour // 保留窗口:更早的历史编译可回收
	compileGCBatch     = 500            // 单批处理条数
	compileGCMaxBatch  = 40             // 单轮最多批数(2 万条封顶),防启动时一次扫太久
)

// StartBackgroundGC 启动编译产物 GC 后台任务:启动先回收一次历史积压,之后每 24h 一次。
// 由 bootstrap 在 NewService 之后调用(prism 自持后台任务,和既有 prism-compile safego 一致)。
func (s *Service) StartBackgroundGC() {
	safego.Go("prism-compile-gc", func() {
		gc := func() {
			if n, err := s.gcCompiles(time.Now()); err != nil {
				slog.Warn("prism compile gc failed", "err", err)
			} else if n > 0 {
				slog.Info("prism compile gc done", "deleted", n)
			}
		}
		gc()
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			gc()
		}
	})
}

// gcCompiles 回收早于 retention 且非各项目最新的编译行 + 其 MinIO 产物;返回删除的行数。
func (s *Service) gcCompiles(now time.Time) (int, error) {
	cutoff := now.Add(-compileGCRetention)
	total := 0
	for batch := 0; batch < compileGCMaxBatch; batch++ {
		rows, err := s.repo.ListStaleCompiles(cutoff, compileGCBatch)
		if err != nil {
			return total, err
		}
		if len(rows) == 0 {
			break
		}
		// 先删 MinIO 产物(best-effort;DeleteObjects 对不存在的键不报错),再删行。产物是可再生的编译输出,
		// 偶发删失败最多留下小体积孤儿(无 prism 专用 reaper),不影响正确性。
		keys := make([]string, 0, len(rows)*2)
		ids := make([]uint, 0, len(rows))
		for _, c := range rows {
			ids = append(ids, c.ID)
			if c.PdfObjectKey != nil && *c.PdfObjectKey != "" {
				keys = append(keys, *c.PdfObjectKey)
			}
			if c.LogObjectKey != nil && *c.LogObjectKey != "" {
				keys = append(keys, *c.LogObjectKey)
			}
		}
		if len(keys) > 0 {
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			_ = storage.DeleteObjects(ctx, s.bucket, keys, func(k string, e error) {
				slog.Warn("prism gc: object delete failed", "key", k, "err", e)
			})
			cancel()
		}
		n, err := s.repo.DeleteCompilesByIDs(ids)
		if err != nil {
			return total, err
		}
		total += int(n)
		if len(rows) < compileGCBatch {
			break
		}
	}
	return total, nil
}

// reOutputPages 从 TeX 日志抠页数:"Output written on main.pdf (12 pages, 34567 bytes)."
var reOutputPages = regexp.MustCompile(`Output written on [^ ]+ \((\d+) page`)

// parseCompileStats 从成功编译日志解析页数 + Overfull hbox 数(投稿合规:页限/溢出)。
func parseCompileStats(log string) (pages, overfull int) {
	if m := reOutputPages.FindStringSubmatch(log); len(m) > 1 {
		pages, _ = strconv.Atoi(m[1])
	}
	overfull = strings.Count(log, "Overfull \\hbox")
	return
}

func (s *Service) GetCompile(projectID, id uint) (*Compile, error) {
	return s.repo.GetCompileInProject(projectID, id)
}

// OpenLatestPDF 取项目最近成功编译的 PDF 流(handler 转发给浏览器 react-pdf)。
func (s *Service) OpenLatestPDF(ctx context.Context, projectID uint) (io.ReadCloser, *minio.ObjectInfo, error) {
	c, err := s.repo.LatestSuccessCompile(projectID)
	if err != nil {
		return nil, nil, err
	}
	if c == nil || c.PdfObjectKey == nil {
		return nil, nil, nil
	}
	return storage.GetObject(ctx, s.bucket, *c.PdfObjectKey)
}
