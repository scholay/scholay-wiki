// ============================================================================
// Scholay 智能助手 — 引用用户文献集 (与上传文件同走"方案 B": 把资料落进会话 cwd)
//
// 用户在输入框「引用文献」选择文献集里的论文 / 整个文件夹后:
//   1. 解析 paper_ids + folder_ids → 属于该用户的论文行(文件夹展开,每个 ≤30 篇,总 ≤60)
//   2. 物化进 agent 会话 cwd 的 references/ 目录:
//        references/paper-<id>.md   每篇的 metadata(og 覆盖 online 的有效字段 + 摘要)
//        references/<file>.pdf      用户为该篇上传过的 PDF(从 MinIO 取流 push 进去)
//        references/INDEX.md        清单(单篇 + 文件夹分组,带相对链接)
//   3. 返回 chip 展示元数据(标题 / 文件夹名+篇数)给前端,前端在下一条 user_message
//      末尾附「引用文献」块指向 ./references/,配套 library-reference skill 教 agent 怎么用。
//
// 与上传一致:session_id 为空 = 新建会话并返回(前端 adopt);非空则校验归属。
// ============================================================================

package claw

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/library"
)

const (
	maxFolderRefPapers = 30 // 单个文件夹引用最多纳入篇数(防上下文/成本爆炸)
	maxTotalRefPapers  = 60 // 一次引用请求物化的论文总上限(单篇 + 所有文件夹合计)
	referenceTimeout   = 90 * time.Second
)

// Referencer 持有 FeatureBridge(开会话 + push 文件)+ library.Reader(读文献集)。
type Referencer struct {
	feature *agentbridge.FeatureBridge
	lib     *library.Reader
}

func NewReferencer(feature *agentbridge.FeatureBridge, lib *library.Reader) *Referencer {
	return &Referencer{feature: feature, lib: lib}
}

// ReferenceRequest — 前端 POST /claw/reference 请求体。
type ReferenceRequest struct {
	SessionID string   `json:"session_id"`
	PaperIDs  []uint64 `json:"paper_ids"`  // 文献集行 ID(单篇引用)
	FolderIDs []uint64 `json:"folder_ids"` // 文件夹 ID(整夹引用)
}

// ReferenceItemDTO — 一个引用项的 chip 展示元数据。
type ReferenceItemDTO struct {
	Kind       string `json:"kind"`                 // "paper" | "folder"
	RefID      uint64 `json:"refId"`                // 论文行 ID 或文件夹 ID
	Title      string `json:"title"`                // 论文标题 / 文件夹名
	PaperCount int    `json:"paperCount,omitempty"` // 文件夹:实际纳入篇数
	Truncated  bool   `json:"truncated,omitempty"`  // 文件夹:超过上限被截断
	HasPDF     bool   `json:"hasPdf,omitempty"`     // 单篇:是否带用户 PDF 全文
}

// ReferenceResultDTO — 返给前端。
type ReferenceResultDTO struct {
	SessionID  string             `json:"sessionId"`
	Items      []ReferenceItemDTO `json:"items"`
	PaperTotal int                `json:"paperTotal"` // 实际物化的论文数(去重)
}

// HandleReference 是 gin handler 业务体(不管 HTTP 码,留给 Handler 包装)。
func (rf *Referencer) HandleReference(c *gin.Context, userID uint) (*ReferenceResultDTO, error) {
	var req ReferenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		return nil, fmt.Errorf("请求格式错误")
	}
	if len(req.PaperIDs) == 0 && len(req.FolderIDs) == 0 {
		return nil, fmt.Errorf("未选择任何文献或文件夹")
	}

	// 会话解析:同 upload —— 有则校验归属,无则新建并返回让前端 adopt。
	sessionID := strings.TrimSpace(req.SessionID)
	var err error
	if sessionID != "" {
		owns, oerr := rf.feature.OwnsSession(userID, sessionID)
		if oerr != nil {
			return nil, fmt.Errorf("会话校验失败: %w", oerr)
		}
		if !owns {
			return nil, fmt.Errorf("无权访问该会话")
		}
	} else {
		sessionID, err = rf.feature.CreateNewSession(c.Request.Context(), userID)
		if err != nil {
			return nil, fmt.Errorf("会话不可用: %w", err)
		}
	}

	uid := uint64(userID)
	items := make([]ReferenceItemDTO, 0, len(req.PaperIDs)+len(req.FolderIDs))
	materialized := map[uint64]bool{} // 跨单篇/文件夹去重物化
	budget := maxTotalRefPapers

	ctx, cancel := context.WithTimeout(c.Request.Context(), referenceTimeout)
	defer cancel()

	// ── 单篇引用 ──────────────────────────────────────────────
	singles := make([]library.UserLibraryPaper, 0, len(req.PaperIDs)) // 实际物化的单篇(INDEX 用)
	if len(req.PaperIDs) > 0 && budget > 0 {
		ids := req.PaperIDs
		if len(ids) > budget {
			ids = ids[:budget]
		}
		papers, perr := rf.lib.PapersByIDs(uid, ids)
		if perr != nil {
			return nil, fmt.Errorf("读取文献失败: %w", perr)
		}
		byID := indexByID(papers)
		for _, id := range ids { // 保持前端选择顺序
			p, ok := byID[id]
			if !ok {
				continue // 越权 / 不存在 → 静默跳过
			}
			hasPDF, fresh := rf.materializePaper(ctx, sessionID, p, materialized)
			if fresh { // 重复勾选同一篇只物化一次:预算/清单都只算一次
				budget--
				singles = append(singles, p)
			}
			items = append(items, ReferenceItemDTO{
				Kind: "paper", RefID: p.ID, Title: effectiveTitle(p), HasPDF: hasPDF,
			})
		}
	}

	// ── 文件夹引用(每个 ≤30,受总预算约束)──────────────────────
	var idxFolders []indexFolder
	for _, fid := range req.FolderIDs {
		if budget <= 0 {
			break
		}
		folder, ferr := rf.lib.FolderByID(uid, fid)
		if ferr != nil || folder == nil {
			continue // 越权 / 不存在 → 跳过
		}
		limit := maxFolderRefPapers
		if limit > budget {
			limit = budget
		}
		papers, total, lerr := rf.lib.FolderPapers(uid, fid, limit)
		if lerr != nil {
			return nil, fmt.Errorf("读取文件夹失败: %w", lerr)
		}
		for i := range papers {
			if _, fresh := rf.materializePaper(ctx, sessionID, papers[i], materialized); fresh {
				budget-- // 已被单篇/前面文件夹物化过的不重复扣预算
			}
		}
		idxFolders = append(idxFolders, indexFolder{name: folder.Name, papers: papers, total: total})
		items = append(items, ReferenceItemDTO{
			Kind:       "folder",
			RefID:      folder.ID,
			Title:      folder.Name,
			PaperCount: len(papers),
			Truncated:  total > int64(len(papers)),
		})
	}

	if len(materialized) == 0 {
		return nil, fmt.Errorf("所选文献不可用或为空")
	}

	// ── 写 INDEX.md(单篇 + 文件夹分组)─────────────────────────
	// 单篇只列物化循环里实际处理过的行(而非重查完整 req.PaperIDs):超预算被
	// 截断的篇目没有对应 paper-<id>.md,列进清单会让 agent 按清单 Read 扑空。
	index := renderIndex(singles, idxFolders)
	if werr := rf.feature.AgentClient().PutWorkspaceFile(ctx, sessionID, "references/INDEX.md", []byte(index)); werr != nil {
		return nil, fmt.Errorf("写引用清单失败: %w", werr)
	}

	return &ReferenceResultDTO{
		SessionID:  sessionID,
		Items:      items,
		PaperTotal: len(materialized),
	}, nil
}

// materializePaper 物化一篇:写 references/paper-<id>.md;有用户 PDF 则 push 进 cwd 并在 meta 里记路径。
// 去重(同一篇被单篇 + 文件夹同时引用时只写一次)。返回 (是否带用户 PDF, 是否本次新物化);
// fresh=false 表示此前已物化过,调用方不应重复扣预算 / 重复列清单。
func (rf *Referencer) materializePaper(ctx context.Context, sessionID string, p library.UserLibraryPaper, done map[uint64]bool) (hasPDF bool, fresh bool) {
	hasPDF = p.PdfObjectKey != "" && p.PdfUploadedAt != nil
	if done[p.ID] {
		return hasPDF, false
	}
	done[p.ID] = true

	pdfPath := ""
	if rc, err := rf.lib.OpenPDF(ctx, &p); err == nil && rc != nil {
		defer rc.Close()
		fname := fmt.Sprintf("ref-%d.pdf", p.ID)
		if pushed, perr := rf.feature.AgentClient().PushSessionFile(ctx, sessionID, fname, rc); perr == nil && pushed != nil {
			pdfPath = pushed.Path
		}
	}

	meta := renderPaperMeta(p, pdfPath)
	rel := fmt.Sprintf("references/paper-%d.md", p.ID)
	if err := rf.feature.AgentClient().PutWorkspaceFile(ctx, sessionID, rel, []byte(meta)); err != nil {
		// 单篇写失败不阻断整批(INDEX 仍会引到它,Read 时缺失而已);记一下即可。
		// 这里返回但已标记 done,避免重复尝试;仍算 fresh(占用了一次物化尝试)。
		slog.Warn("claw reference: 写论文 metadata 失败", "session_id", sessionID, "paper_id", p.ID, "error", err)
		return hasPDF, true
	}
	return hasPDF, true
}

// ─── 渲染 helpers ─────────────────────────────────────────────────────────

type refAuthor struct {
	Name string `json:"name"`
}

func authorNames(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}
	var arr []refAuthor
	if json.Unmarshal(raw, &arr) != nil {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, a := range arr {
		if s := strings.TrimSpace(a.Name); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func pickStr(og, online string) string {
	if s := strings.TrimSpace(og); s != "" {
		return s
	}
	return strings.TrimSpace(online)
}

func effectiveTitle(p library.UserLibraryPaper) string {
	t := pickStr(p.OGTitle, p.Title)
	if t == "" {
		t = "(无标题)"
	}
	return t
}

func effectiveAuthors(p library.UserLibraryPaper) []string {
	if n := authorNames(p.OGAuthorsJSON); len(n) > 0 {
		return n
	}
	return authorNames(p.AuthorsJSON)
}

func effectiveYear(p library.UserLibraryPaper) string {
	if p.OGYear != nil && *p.OGYear != 0 {
		return fmt.Sprintf("%d", *p.OGYear)
	}
	if p.Year != nil && *p.Year != 0 {
		return fmt.Sprintf("%d", *p.Year)
	}
	return ""
}

// renderPaperMeta —— 单篇 metadata markdown(有效字段 = og 覆盖 online)。
func renderPaperMeta(p library.UserLibraryPaper, pdfPath string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n", effectiveTitle(p))
	if authors := effectiveAuthors(p); len(authors) > 0 {
		fmt.Fprintf(&b, "- 作者: %s\n", strings.Join(authors, ", "))
	}
	if y := effectiveYear(p); y != "" {
		fmt.Fprintf(&b, "- 年份: %s\n", y)
	}
	if v := pickStr(p.OGVenue, p.Venue); v != "" {
		fmt.Fprintf(&b, "- 期刊/会议: %s\n", v)
	}
	if d := pickStr(p.OGDOI, p.DOI); d != "" {
		fmt.Fprintf(&b, "- DOI: %s\n", d)
	}
	if p.CitationCount > 0 {
		fmt.Fprintf(&b, "- 被引: %d\n", p.CitationCount)
	}
	fmt.Fprintf(&b, "- 来源: %s (%s)\n", p.Source, p.LinkState)
	if pdfPath != "" {
		fmt.Fprintf(&b, "- 用户上传 PDF: %s  (用 Read 读全文)\n", pdfPath)
	}
	if strings.TrimSpace(p.PdfURL) != "" {
		fmt.Fprintf(&b, "- OA 开放获取 PDF: %s  (如需正文可用 WebFetch)\n", strings.TrimSpace(p.PdfURL))
	}
	if ab := pickStr(p.OGAbstract, p.Abstract); ab != "" {
		fmt.Fprintf(&b, "\n## 摘要\n%s\n", ab)
	}
	return b.String()
}

type indexFolder struct {
	name   string
	papers []library.UserLibraryPaper
	total  int64
}

func renderIndex(singles []library.UserLibraryPaper, folders []indexFolder) string {
	var b strings.Builder
	b.WriteString("# 已引用文献清单\n\n")
	b.WriteString("> 用户从其文献集引用了以下文献。每篇的 metadata 在本目录下 `paper-<id>.md`;\n")
	b.WriteString("> 标了「用户上传 PDF」的可用 Read 读全文。请基于这些资料回答与引用,不要臆造内容。\n\n")
	if len(singles) > 0 {
		b.WriteString("## 单篇引用\n")
		for _, p := range singles {
			writeIndexLine(&b, p)
		}
		b.WriteString("\n")
	}
	for _, f := range folders {
		cap := ""
		if f.total > int64(len(f.papers)) {
			cap = fmt.Sprintf("(共 %d 篇,纳入最近 %d 篇)", f.total, len(f.papers))
		} else {
			cap = fmt.Sprintf("(%d 篇)", len(f.papers))
		}
		fmt.Fprintf(&b, "## 文件夹「%s」%s\n", f.name, cap)
		for _, p := range f.papers {
			writeIndexLine(&b, p)
		}
		b.WriteString("\n")
	}
	return b.String()
}

func writeIndexLine(b *strings.Builder, p library.UserLibraryPaper) {
	meta := fmt.Sprintf("paper-%d.md", p.ID)
	authors := ""
	if a := effectiveAuthors(p); len(a) > 0 {
		authors = a[0]
		if len(a) > 1 {
			authors += " 等"
		}
	}
	pdf := ""
	if p.PdfObjectKey != "" && p.PdfUploadedAt != nil {
		pdf = " [含PDF全文]"
	}
	fmt.Fprintf(b, "- [%s](%s) — %s %s%s\n", effectiveTitle(p), meta, authors, effectiveYear(p), pdf)
}

// ─── 小工具 ───────────────────────────────────────────────────────────────

func indexByID(ps []library.UserLibraryPaper) map[uint64]library.UserLibraryPaper {
	m := make(map[uint64]library.UserLibraryPaper, len(ps))
	for _, p := range ps {
		m[p.ID] = p
	}
	return m
}
