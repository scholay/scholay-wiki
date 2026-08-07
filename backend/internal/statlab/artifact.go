// ============================================================================
// Scholay 数据分析 (statlab) — 成果交付(引擎产出 → web 用户可下载/预览)
//
// 与 claw/boltslides 的成果交付同型(照 internal/claw/artifact*.go 抄):
//   ① 收割 ./out 顶层文件 → MinIO(agent_artifacts 元数据,按 sha256 去重);
//   ② 按 id 从 MinIO 取字节(attachment + nosniff,同源 XSS 防护);
//   ③ storage 未启用时的实时回退(文本回读,前端预览 md/py)。
//
// P0 产物是 ./out/ 下的三线表 docx、Results/Methods md、可复现 analysis.py。前端 artifact-format.ts 已全覆盖,
// 不必先光栅化。安全沿用 claw/boltslides:UserAuthMiddleware → OwnsSession → artifactRelPath 只放行
// out/<basename> → 一律 nosniff + 下载即 attachment(杜绝偷 cookie 的同源 XSS)。
// ============================================================================

package statlab

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

// artifactDir 是会话 cwd 内约定的「交付目录」。引擎的 report verb 把交付物写进 ./out/。
// ⚠️ `analysis/`(bundle)**刻意不在**交付目录里 —— 它是引擎独占保留区,不是给用户下载的东西。
const artifactDir = "out"

const (
	artifactListTimeout = 10 * time.Second
	fileFetchTimeout    = 15 * time.Second
	// maxArtifactBytes — 单个产物回取上限(docx 三线表几十 KB;为后续图表/大表留余量)。
	maxArtifactBytes = 16 * 1024 * 1024
)

// ArtifactDTO — 一个可交付产物的元信息。ID/Mime/Size 仅在「已落 MinIO」路径有值:
// 前端见 ID>0 走 GET /stat_lab/artifact/:id(MinIO,真实 mime);ID=0 是 storage 未启用时的
// 实时回退,前端回落 path 直读(md/py 文本)。
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
func shouldListArtifact(name string) bool {
	// manifest.json 是清单不是交付物 —— 漏排它,用户列表里会多一张 manifest.json 卡片。
	// (2026-08-07 A9:此前三份镜像都漏了这一条,只有 claw 排了。)
	return name != "" && !strings.HasPrefix(name, ".") && !agentartifact.IsManifest(name)
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

// GetSessionArtifacts — GET /stat_lab/session/artifacts?session_id=<id>
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

	// storage 未启用 / 无 repo → 实时回读回退(文本产物,无 id,前端走 path 直读)。
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
		slog.Warn("statlab artifacts: harvest failed, serving stale rows", "session", sessionID, "err", err)
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

// DownloadArtifactByID — GET /stat_lab/artifact/:id
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
		// 跨 feature 越权:本人 boltslides/claw 的产物 id 不能从 stat_lab 路由取。回 404 防枚举。
		utils.Error(c, 4404, "产物不存在或不属于你")
		return
	}

	// 🔴 2026-08-07 修(四份镜像同改):回写响应体**不能**用 artifactListTimeout(10s)。
	//    minio-go 的 *minio.Object 与 GetObject 传入的 ctx 绑定,而 c.DataFromReader 是边读边回写 ⇒
	//    10s 一到,正在传输的三线表 docx 当场被截断成损坏文件。上界改由 APITimeoutMiddleware
	//    的 isObjectServePath 分支(10min)给,客户端断开时 gin 会取消请求 ctx,不泄 goroutine。
	ctx := c.Request.Context()
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

// DownloadSessionArtifact — GET /stat_lab/session/artifact?session_id=<id>&path=out/<name>[&download=1]
// storage 未启用时的实时回退:文本产物按 text/plain 回写。一律 nosniff。
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
	// 文本一律 text/plain 回写(防 html/svg 同源执行);前端预览读这个再渲染。
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(wf.Content))
}

// ─── 收割落 MinIO ───────────────────────────────────────────────────────────

// HarvestTurnArtifacts 是 agentbridge.OnTurnArtifactsFn 的实现:**每轮结束后**把该会话
// 交付目录里的产物收割进 MinIO + agent_artifacts。由 bootstrap 经
// FeatureBridge.SetArtifactHarvester 注入(BuildSpec 时 Handler 还不存在,故晚绑定)。
//
// 🔴 为什么必须有它(2026-08-07 生产取证):在此之前,产物耐久化的**唯一**触发点是
//    用户点开产物面板(GetSessionArtifacts → harvestSession)。而会话工作区是临时的
//    (executor 容器重启即清、30 天 GC)——用户没在那个窗口期点过面板,产物就永久
//    丢失,且**零日志**。实测 claw 有 13 个会话调用过写文件工具,只有 7 个留下了产物行;
//    典型漏例发出过 12 个 artifact 帧、用户当时看得见卡片,但一行都没落库。
//    完整取证见 agentbridge/artifact_dispatch.go 顶部注释。
//
// 契约(agentbridge 侧要求):
//   · 幂等 —— harvestSession 是按 dedup_anchor 的 upsert,可被重复/并发调用。
//   · 自带容错 —— 会话已删 / 工作区已清 / agent 暂不可达都是正常终局,吞掉即可。
//   · 不往上抛 —— 调用方没有重试,只会记日志。
func (h *Handler) HarvestTurnArtifacts(ctx context.Context, userID uint, sessionID string) {
	if h.artifactRepo == nil || !storage.IsEnabled() {
		return // storage 未启用 → 走实时回退,本就没有耐久层可写
	}
	if err := h.harvestSession(ctx, userID, sessionID); err != nil {
		if agentClientErrIs4xxOrMissing(err) {
			return // 会话已删 / 工作区已清:正常终局,不是错误
		}
		slog.Warn("轮末产物收割失败(on-list 兜底仍会在用户打开面板时重试)",
			"feature", FeatureKey, "session_id", sessionID, "err", err)
	}
}

// readArtifactManifest 读 ./out/manifest.json(agent 可选写)并解析成 file→meta 映射。
// 任何缺失/读失败/解析失败都返回 nil(静默退化,不影响产物列出)。
// 解析走 agentartifact.ParseManifest 单一真源 —— 四个 feature 不再各抄一份(2026-08-07 A9)。
func (h *Handler) readArtifactManifest(ctx context.Context, sessionID string) map[string]agentartifact.Meta {
	wf, err := h.feature.AgentClient().GetWorkspaceFile(ctx, sessionID, artifactDir+"/"+agentartifact.ManifestName)
	if err != nil || wf == nil || wf.State != "ok" || wf.PreviewType != "text" {
		return nil
	}
	return agentartifact.ParseManifest([]byte(wf.Content))
}

// harvestSession 收割会话 ./out 顶层文件 → MinIO + 元数据。
// upsert-only:executor 工作区是临时的,耐久真源在 MinIO+DB,故绝不按 live 工作区删已持久化产物。
func (h *Handler) harvestSession(ctx context.Context, ownerID uint, sessionID string) error {
	tree, err := h.feature.AgentClient().ListWorkspaceFiles(ctx, sessionID, artifactDir)
	if err != nil {
		return err
	}
	if tree == nil || tree.State != "ok" {
		return nil // ./out 不存在(还没画 / 临时工作区已清):保留已持久化产物
	}
	// 友好标题:agent 可选写 out/manifest.json;没有就回落文件名(前端 `title || name`)。
	// 2026-08-07 A9:此前只有 claw 读它,三份镜像压根不读 —— 而生产 97.7% 的产物在 stat_lab,
	// 不补这三份等于这条通道对绝大多数产物零效果。
	meta := h.readArtifactManifest(ctx, sessionID)
	for _, e := range tree.Entries {
		if e.IsDirectory || !shouldListArtifact(e.Name) {
			continue
		}
		// 大小上限:超限文件不收割(否则 ReadWorkspaceFileRaw 把整块读进后端内存)。三线表 docx 与
	// Results md 都很小
		// 越界的多半是异常产物。跳过 + warn。
		if e.Size > maxArtifactBytes {
			slog.Warn("statlab harvest: skip oversized artifact", "session", sessionID, "name", e.Name, "size", e.Size, "cap", maxArtifactBytes)
			continue
		}
		relPath := artifactDir + "/" + e.Name
		title, desc := "", ""
		if m, ok := meta[e.Name]; ok {
			title, desc = m.Title, m.Description
		}
		h.harvestFile(ctx, ownerID, sessionID, relPath, e.Name, title, desc, fileSig(e.Size, e.MTimeMs))
	}
	return nil
}

// harvestFile 收割单文件(二进制安全)。sig 命中已有行且已落 MinIO → 跳过昂贵的字节重读。
func (h *Handler) harvestFile(ctx context.Context, ownerID uint, sessionID, relPath, name, title, desc, sig string) {
	anchor := agentartifact.DedupAnchorFor(sessionID, relPath)
	existing, _ := h.artifactRepo.GetByDedup(anchor)
	// 数据分析的产物是「只读交付物」——三线表 docx / Results md / analysis.py 直接在产物面板
	// 下载或预览,无用户端编辑
	// 已下线)。故不再有 user_edited 保护:agent 重画同名文件即以新内容覆盖(sig 未变则跳过重读)。
	if existing != nil && existing.Kind == "file" && sig != "" && existing.SourceSig == sig && existing.StorageKey != "" {
		return
	}
	raw, err := h.feature.AgentClient().ReadWorkspaceFileRaw(ctx, sessionID, relPath)
	if err != nil || raw == nil || raw.State != "ok" {
		return
	}
	h.upsertArtifact(ctx, ownerID, sessionID, relPath, name, raw.MimeType, raw.Bytes, title, desc, sig, existing)
}

// upsertArtifact 内容变更才上传 MinIO(按 sha256 去重),元信息每次 upsert。
func (h *Handler) upsertArtifact(ctx context.Context, ownerID uint, sessionID, relPath, name, mime string, data []byte, title, desc, sig string, existing *agentartifact.Artifact) {
	anchor := agentartifact.DedupAnchorFor(sessionID, relPath)
	sum := sha256.Sum256(data)
	sha := hex.EncodeToString(sum[:])
	key := artifactStorageKey(ownerID, sessionID, relPath)
	if existing == nil || existing.ContentSHA256 != sha || existing.StorageKey == "" {
		if _, err := storage.PutObject(ctx, storage.AgentArtifactsBucket(), key,
			bytes.NewReader(data), int64(len(data)), storage.PutOptions{ContentType: mime}); err != nil {
			slog.Error("statlab harvest: put object failed", "session", sessionID, "path", relPath, "err", err)
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
		Title:         title,
		Description:   desc,
	}); err != nil {
		slog.Error("statlab harvest: upsert row failed", "session", sessionID, "path", relPath, "err", err)
	}
}

// cleanupArtifacts 删某会话全部交付物(行 + MinIO)。会话 reset/delete 用。
func (h *Handler) cleanupArtifacts(ctx context.Context, sessionID string) {
	if sessionID == "" || h.artifactRepo == nil || !storage.IsEnabled() {
		return
	}
	keys, err := h.artifactRepo.DeleteBySession(sessionID)
	if err != nil {
		slog.Error("statlab artifact cleanup: delete rows failed", "session", sessionID, "err", err)
		return
	}
	if len(keys) == 0 {
		return
	}
	_ = storage.DeleteObjects(ctx, storage.AgentArtifactsBucket(), keys, func(key string, err error) {
		slog.Error("statlab artifact: delete object failed", "key", key, "err", err)
	})
}

// artifactStorageKey 拼 MinIO 对象 key:stat_lab/<ownerID>/<sessionID>/<relpath>。
func artifactStorageKey(ownerID uint, sessionID, relPath string) string {
	return FeatureKey + "/" + strconv.FormatUint(uint64(ownerID), 10) + "/" + sessionID + "/" + relPath
}
