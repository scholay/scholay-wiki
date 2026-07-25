// ============================================================================
// Scholay 制作PPT (boltslides) — 成果交付(agent 产出 → web 用户可下载/预览)
//
// 与 claw 的成果交付同型(照 internal/claw/artifact*.go 抄,delivery.go 明说这是起点),
// 但**简化**:制作PPT 的产物永远是 ./out/ 下的**单个自包含 HTML**(BuildDeck 工具编译产出),
// 故去掉目录→zip、manifest.json、图片光栅回写等 claw 特有分支,只保留:
//   ① 收割 ./out 顶层文件 → MinIO(agent_artifacts 元数据,按 sha256 去重);
//   ② 按 id 从 MinIO 取字节(attachment + nosniff,同源 XSS 防护);
//   ③ storage 未启用时的实时回退(文本回读,前端 srcDoc 预览 deck)。
//
// 安全沿用 claw:UserAuthMiddleware 鉴权 → OwnsSession 校验归属 → artifactRelPath 只放行
// out/<basename> → 一律 nosniff + 下载即 attachment(html 不在门户源执行,杜绝偷 cookie 的同源 XSS;
// 前端预览走沙箱 srcDoc iframe,不依赖同源)。
// ============================================================================

package boltslides

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentartifact"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/storage"
)

// artifactDir 是会话 cwd 内约定的「交付目录」。BuildDeck 把编译好的单文件 HTML 写进 ./out/。
const artifactDir = "out"

const (
	artifactListTimeout = 10 * time.Second
	fileFetchTimeout    = 15 * time.Second
	// maxArtifactBytes — 单个产物回取上限(与 BuildDeck 的 12MB 交付上限、claw 一致)。
	maxArtifactBytes = 12 * 1024 * 1024
)

// ArtifactDTO — 一个可交付产物的元信息。ID/Mime/Size 仅在「已落 MinIO」路径有值:
// 前端见 ID>0 走 GET /boltslides/artifact/:id(MinIO,真实 mime,html 可 srcDoc 预览);
// ID=0 是 storage 未启用时的实时回退,前端回落 path 直读(文本)。
type ArtifactDTO struct {
	ID          uint64 `json:"id,omitempty"`
	Path        string `json:"path"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Mime        string `json:"mime,omitempty"`
	Size        int64  `json:"size,omitempty"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
}

// artifactRelPath 校验并规整前端传来的产物相对路径:只允许 out/<basename>。非法返回 ("","")。
func artifactRelPath(raw string) (rel, name string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", ""
	}
	clean := path.Clean(raw)
	if path.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", ""
	}
	dir, base := path.Split(clean)
	dir = strings.Trim(dir, "/")
	if dir != artifactDir || base == "" || base == "." || base == ".." {
		return "", ""
	}
	return artifactDir + "/" + base, base
}

// shouldListArtifact 判定 out/ 下一个文件项是否应作为可下载产物列出:排除 dotfile / 空名。
// 另排除 .pptx/.pdf —— 这是「导出」的一次性产物,直接流回浏览器下载,**不作为持久成果留存/展示**
// (成果只有单文件 HTML deck)。否则每次导出都会往产物列表堆一个 .pptx/.pdf。
func shouldListArtifact(name string) bool {
	if name == "" || strings.HasPrefix(name, ".") {
		return false
	}
	lower := strings.ToLower(name)
	if strings.HasSuffix(lower, ".pptx") || strings.HasSuffix(lower, ".pdf") {
		return false
	}
	return true
}

// agentClientErrIs4xxOrMissing — agent 4xx / 会话不存在:客户端原因,当「无产物/找不到」处理,不当 502。
func agentClientErrIs4xxOrMissing(err error) bool {
	var hErr *agent.HTTPError
	return errors.Is(err, agent.ErrSessionNotFound) ||
		(errors.As(err, &hErr) && hErr.StatusCode >= 400 && hErr.StatusCode < 500)
}

// fileSig = "<size>:<mtimeMs>" —— agent tree 的轻量签名,做收割变更检测(没变就不重读字节)。
func fileSig(size, mtimeMs int64) string {
	return strconv.FormatInt(size, 10) + ":" + strconv.FormatInt(mtimeMs, 10)
}

// GetSessionArtifacts — GET /boltslides/session/artifacts?session_id=<id>
func (h *Handler) GetSessionArtifacts(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID := strings.TrimSpace(c.Query("session_id"))
	if sessionID == "" {
		utils.BadRequest(c, "missing session_id")
		return
	}
	owns, err := h.feature.OwnsSession(userID, sessionID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "会话校验失败,请稍后重试", err)
		return
	}
	if !owns {
		utils.Error(c, 4404, "会话不存在或不属于你")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), artifactListTimeout)
	defer cancel()

	// storage 未启用 / 无 repo → 实时回读回退(文本,无 id,前端走 path 直读)。
	if h.artifactRepo == nil || !storage.IsEnabled() {
		h.listArtifactsLive(c, ctx, sessionID)
		return
	}

	// 正常路径:on-list 收割 ./out → MinIO,再从 DB 出 DTO(带 id,前端走 /artifact/:id 预览/下载)。
	if err := h.harvestSession(ctx, userID, sessionID); err != nil {
		if agentClientErrIs4xxOrMissing(err) {
			utils.Success(c, gin.H{"items": []ArtifactDTO{}, "total": 0})
			return
		}
		slog.Warn("boltslides artifacts: harvest failed, serving stale rows", "session", sessionID, "err", err)
	}
	rows, lerr := h.artifactRepo.ListBySession(sessionID)
	if lerr != nil {
		utils.InternalError(c, codeAgentUnreachable, "无法加载产物列表,请稍后重试", lerr)
		return
	}
	items := make([]ArtifactDTO, 0, len(rows))
	for _, r := range rows {
		items = append(items, ArtifactDTO{
			ID: r.ID, Path: r.RelPath, Name: r.Filename, Kind: r.Kind,
			Mime: r.Mime, Size: r.SizeBytes, Title: r.Title, Description: r.Description,
		})
	}
	utils.Success(c, gin.H{"items": items, "total": len(items)})
}

// listArtifactsLive 是 storage 未启用时的实时回读回退(列 ./out 顶层文件)。
func (h *Handler) listArtifactsLive(c *gin.Context, ctx context.Context, sessionID string) {
	tree, err := h.feature.AgentClient().ListWorkspaceFiles(ctx, sessionID, artifactDir)
	if err != nil {
		if agentClientErrIs4xxOrMissing(err) {
			utils.Success(c, gin.H{"items": []ArtifactDTO{}, "total": 0})
			return
		}
		utils.InternalError(c, codeAgentUnreachable, "无法加载产物列表,请稍后重试", err)
		return
	}
	items := make([]ArtifactDTO, 0, len(tree.Entries))
	if tree.State == "ok" {
		for _, e := range tree.Entries {
			if e.IsDirectory || !shouldListArtifact(e.Name) {
				continue
			}
			items = append(items, ArtifactDTO{Path: artifactDir + "/" + e.Name, Name: e.Name, Kind: "file"})
		}
	}
	utils.Success(c, gin.H{"items": items, "total": len(items)})
}

// DownloadArtifactByID — GET /boltslides/artifact/:id
// 从 MinIO 取字节按真实 mime 回写,一律 attachment + nosniff(同源 XSS 防护)。
func (h *Handler) DownloadArtifactByID(c *gin.Context) {
	userID := c.GetUint("user_id")
	if h.artifactRepo == nil || !storage.IsEnabled() {
		utils.Error(c, 4404, "产物不可用")
		return
	}
	id, perr := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if perr != nil || id == 0 {
		utils.BadRequest(c, "invalid id")
		return
	}
	row, err := h.artifactRepo.GetByID(id)
	if err != nil {
		if errors.Is(err, agentartifact.ErrNotFound) {
			utils.Error(c, 4404, "产物不存在")
			return
		}
		utils.InternalError(c, codeAgentUnreachable, "加载产物失败,请稍后重试", err)
		return
	}
	if row.OwnerID != uint64(userID) {
		utils.Error(c, 4404, "产物不存在或不属于你") // 防枚举:越权也回 404
		return
	}
	if row.FeatureKey != FeatureKey {
		// 跨 feature 越权:本人 sci_draw/claw 的产物 id 不能从 boltslides 路由取(反之亦然)。回 404 防枚举。
		utils.Error(c, 4404, "产物不存在或不属于你")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), artifactListTimeout)
	defer cancel()
	obj, info, err := storage.GetObject(ctx, storage.AgentArtifactsBucket(), row.StorageKey)
	if err != nil {
		utils.Error(c, 4404, "产物已失效")
		return
	}
	defer obj.Close()

	mime := row.Mime
	if mime == "" {
		mime = "application/octet-stream"
	}
	size := row.SizeBytes
	if info != nil && info.Size > 0 {
		size = info.Size
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+url.QueryEscape(row.Filename))
	c.DataFromReader(http.StatusOK, size, mime, obj, nil)
}

// DownloadSessionArtifact — GET /boltslides/session/artifact?session_id=<id>&path=out/<name>[&download=1]
// storage 未启用时的实时回退:单文件 HTML deck 按 text/plain 回写(前端 srcDoc 预览)。一律 nosniff。
func (h *Handler) DownloadSessionArtifact(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID := strings.TrimSpace(c.Query("session_id"))
	rel, name := artifactRelPath(c.Query("path"))
	if sessionID == "" || rel == "" {
		utils.BadRequest(c, "missing or invalid session_id/path")
		return
	}
	owns, err := h.feature.OwnsSession(userID, sessionID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "会话校验失败,请稍后重试", err)
		return
	}
	if !owns {
		utils.Error(c, 4404, "会话不存在或不属于你")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), fileFetchTimeout)
	defer cancel()
	wf, err := h.feature.AgentClient().ReadWorkspaceFileFull(ctx, sessionID, rel)
	if err != nil {
		if agentClientErrIs4xxOrMissing(err) {
			utils.Error(c, 4404, "文件不存在或不属于你")
			return
		}
		utils.InternalError(c, codeAgentUnreachable, "文件读取失败,请稍后重试", err)
		return
	}
	if wf.State != "ok" {
		utils.Error(c, 4404, "文件不存在")
		return
	}
	if wf.Size > maxArtifactBytes {
		utils.Error(c, 4404, "文件过大")
		return
	}
	if wf.PreviewType != "text" {
		utils.Error(c, 4404, "暂不支持下载该类型文件")
		return
	}
	c.Header("X-Content-Type-Options", "nosniff")
	if c.Query("download") == "1" {
		c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+url.QueryEscape(name))
	}
	// 文本一律 text/plain 回写(防 html 同源执行);前端预览读这个再放进沙箱 srcDoc 渲染。
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(wf.Content))
}

// ─── 收割落 MinIO ───────────────────────────────────────────────────────────

// harvestSession 收割会话 ./out 顶层文件 → MinIO + 元数据。单文件 deck,无目录/manifest 分支。
// upsert-only:executor 工作区是临时的,耐久真源在 MinIO+DB,故绝不按 live 工作区删已持久化产物。
func (h *Handler) harvestSession(ctx context.Context, ownerID uint, sessionID string) error {
	tree, err := h.feature.AgentClient().ListWorkspaceFiles(ctx, sessionID, artifactDir)
	if err != nil {
		return err
	}
	if tree == nil || tree.State != "ok" {
		return nil // ./out 不存在(还没构建 / 临时工作区已清):保留已持久化产物
	}
	for _, e := range tree.Entries {
		if e.IsDirectory || !shouldListArtifact(e.Name) {
			continue
		}
		// 大小上限:超限文件不收割(否则 ReadWorkspaceFileRaw 把整块读进后端内存)。deck 单文件 ≤12MB
		// 是 BuildDeck 的交付契约,越界的多半是异常产物。跳过 + warn(前端列表里不出现)。
		if e.Size > maxArtifactBytes {
			slog.Warn("boltslides harvest: skip oversized artifact", "session", sessionID, "name", e.Name, "size", e.Size, "cap", maxArtifactBytes)
			continue
		}
		relPath := artifactDir + "/" + e.Name
		h.harvestFile(ctx, ownerID, sessionID, relPath, e.Name, fileSig(e.Size, e.MTimeMs))
	}
	return nil
}

// harvestFile 收割单文件(二进制安全)。sig 命中已有行且已落 MinIO → 跳过昂贵的字节重读。
func (h *Handler) harvestFile(ctx context.Context, ownerID uint, sessionID, relPath, name, sig string) {
	anchor := agentartifact.DedupAnchorFor(sessionID, relPath)
	existing, _ := h.artifactRepo.GetByDedup(anchor)
	if existing != nil && existing.Kind == "file" && sig != "" && existing.SourceSig == sig && existing.StorageKey != "" {
		return
	}
	raw, err := h.feature.AgentClient().ReadWorkspaceFileRaw(ctx, sessionID, relPath)
	if err != nil || raw == nil || raw.State != "ok" {
		return
	}
	h.upsertArtifact(ctx, ownerID, sessionID, relPath, name, raw.MimeType, raw.Bytes, sig, existing)
}

// upsertArtifact 内容变更才上传 MinIO(按 sha256 去重),元信息每次 upsert。
func (h *Handler) upsertArtifact(ctx context.Context, ownerID uint, sessionID, relPath, name, mime string, data []byte, sig string, existing *agentartifact.Artifact) {
	anchor := agentartifact.DedupAnchorFor(sessionID, relPath)
	sum := sha256.Sum256(data)
	sha := hex.EncodeToString(sum[:])
	key := artifactStorageKey(ownerID, sessionID, relPath)
	if existing == nil || existing.ContentSHA256 != sha || existing.StorageKey == "" {
		if _, err := storage.PutObject(ctx, storage.AgentArtifactsBucket(), key,
			bytes.NewReader(data), int64(len(data)), storage.PutOptions{ContentType: mime}); err != nil {
			slog.Error("boltslides harvest: put object failed", "session", sessionID, "path", relPath, "err", err)
			return
		}
	}
	if err := h.artifactRepo.Upsert(&agentartifact.Artifact{
		OwnerKind:     "user",
		OwnerID:       uint64(ownerID),
		FeatureKey:    FeatureKey,
		SessionID:     sessionID,
		RelPath:       relPath,
		Filename:      name,
		Mime:          mime,
		SizeBytes:     int64(len(data)),
		ContentSHA256: sha,
		SourceSig:     sig,
		StorageKey:    key,
		DedupAnchor:   anchor,
		Kind:          "file",
	}); err != nil {
		slog.Error("boltslides harvest: upsert row failed", "session", sessionID, "path", relPath, "err", err)
	}
}

// cleanupArtifacts 删某会话全部交付物(行 + MinIO)。会话 reset/delete 用。
func (h *Handler) cleanupArtifacts(ctx context.Context, sessionID string) {
	if sessionID == "" || h.artifactRepo == nil || !storage.IsEnabled() {
		return
	}
	keys, err := h.artifactRepo.DeleteBySession(sessionID)
	if err != nil {
		slog.Error("boltslides artifact cleanup: delete rows failed", "session", sessionID, "err", err)
		return
	}
	if len(keys) == 0 {
		return
	}
	_ = storage.DeleteObjects(ctx, storage.AgentArtifactsBucket(), keys, func(key string, err error) {
		slog.Error("boltslides artifact: delete object failed", "key", key, "err", err)
	})
}

// artifactStorageKey 拼 MinIO 对象 key:boltslides/<ownerID>/<sessionID>/<relpath>。
func artifactStorageKey(ownerID uint, sessionID, relPath string) string {
	return FeatureKey + "/" + strconv.FormatUint(uint64(ownerID), 10) + "/" + sessionID + "/" + relPath
}
