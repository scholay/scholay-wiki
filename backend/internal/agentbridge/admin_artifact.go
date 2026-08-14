package agentbridge

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	pathpkg "path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentartifact"
	"scholar-backend/internal/agentattachstore"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/storage"

	"github.com/gin-gonic/gin"
)

// 存量附件落盘名的硬身份：<uuid>-<原名>。归档 / journal 的
// @"path" 没有独立 ACL 行时，只能把这种系统产生的首部 marker 补入白名单；
// 不带 UUID 的用户手写 @"secret" 绝不能因为出现在历史文本里就变成授权。
var adminStoredAttachmentName = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-.+`)

type AdminArtifactDTO struct {
	ID                 uint64     `json:"id"`
	SessionID          string     `json:"sessionId"`
	Path               string     `json:"path"`
	Name               string     `json:"name"`
	Title              string     `json:"title"`
	Description        string     `json:"description"`
	Kind               string     `json:"kind"`
	Mime               string     `json:"mime"`
	Size               int64      `json:"size"`
	CreatedAt          *time.Time `json:"createdAt,omitempty"`
	UpdatedAt          *time.Time `json:"updatedAt,omitempty"`
	Source             string     `json:"source"` // storage | workspace
	StorageAvailable   bool       `json:"storageAvailable"`
	WorkspaceAvailable bool       `json:"workspaceAvailable"`
	URL                string     `json:"url"`
}

// normalizeAdminWorkspacePath 把所有 workspace 读取收口为 POSIX 相对路径。
// 拒绝绝对路径、../、NUL 与反斜杠，绝不把边界判定外包给 agent resolver。
func normalizeAdminWorkspacePath(raw string) (string, bool) {
	if raw == "" || strings.ContainsRune(raw, '\x00') || strings.Contains(raw, `\`) || pathpkg.IsAbs(raw) {
		return "", false
	}
	for _, segment := range strings.Split(raw, "/") {
		if segment == ".." {
			return "", false
		}
	}
	if strings.IndexFunc(raw, func(r rune) bool { return r < 0x20 || r == 0x7f }) >= 0 {
		return "", false
	}
	clean := pathpkg.Clean(raw)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", false
	}
	return clean, true
}

func (r *Repository) adminArtifactEventRows(ctx context.Context, sessionID string) ([]TurnEventRow, error) {
	var rows []TurnEventRow
	err := r.db.WithContext(ctx).
		Where("agent_session_id = ? AND ev_type IN ?", sessionID, []string{string(EvArtifact), string(EvUserMessage)}).
		Order("turn_id ASC, ev_seq ASC, id ASC").Find(&rows).Error
	return rows, err
}

// adminUserMessageMarkerPaths 只解析 user content 首部、与 foldUserAttachments 同构的
// @"path" 标记（最多 10 个）。这是 pre-0112 没有 agent_attachments 行时的精确白名单。
func adminLeadingAttachmentMarkerPaths(text, sessionID string) map[string]struct{} {
	paths := make(map[string]struct{})
	rest := text
	for count := 0; count < 10 && strings.HasPrefix(rest, `@"`); count++ {
		end := strings.Index(rest[2:], `"`)
		if end < 0 {
			break
		}
		rawPath := rest[2 : 2+end]
		// 只信 foldUserAttachments 产生的当前会话绝对路径。相对 marker
		// 可由用户在正文中手写，不能倒推出文件读权限。
		if !pathpkg.IsAbs(rawPath) {
			break
		}
		clean, ok := adminRelativeWorkspacePath(rawPath, sessionID)
		if !ok || !adminStoredAttachmentName.MatchString(pathpkg.Base(clean)) {
			break
		}
		paths[clean] = struct{}{}
		rest = strings.TrimLeft(rest[2+end+1:], " ")
	}
	return paths
}

func adminSessionMessageText(message agent.SessionMessage) string {
	var direct string
	if json.Unmarshal(message.Content, &direct) == nil {
		return direct
	}
	var blocks []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if json.Unmarshal(message.Content, &blocks) != nil || len(blocks) == 0 || blocks[0].Type != "text" {
		return ""
	}
	return blocks[0].Text
}

func adminArchiveMarkerPaths(sessionID string, messages []agent.SessionMessage) map[string]struct{} {
	paths := make(map[string]struct{})
	for i := range messages {
		if messages[i].Type != "user" {
			continue
		}
		for clean := range adminLeadingAttachmentMarkerPaths(adminSessionMessageText(messages[i]), sessionID) {
			paths[clean] = struct{}{}
		}
	}
	return paths
}

func adminUserMessageMarkerPaths(sessionID string, rows []TurnEventRow) map[string]struct{} {
	paths := make(map[string]struct{})
	for i := range rows {
		if rows[i].AgentSessionID != sessionID || rows[i].EvType != string(EvUserMessage) {
			continue
		}
		var frame struct {
			Content string `json:"content"`
		}
		if json.Unmarshal(rows[i].Payload, &frame) != nil {
			continue
		}
		for clean := range adminLeadingAttachmentMarkerPaths(frame.Content, sessionID) {
			paths[clean] = struct{}{}
		}
	}
	return paths
}

func adminDeclaredArtifactPaths(sessionID string, rows []TurnEventRow) map[string]struct{} {
	paths := make(map[string]struct{})
	for i := range rows {
		if rows[i].AgentSessionID != sessionID || rows[i].EvType != string(EvArtifact) {
			continue
		}
		var frame struct {
			Path string `json:"path"`
		}
		if json.Unmarshal(rows[i].Payload, &frame) != nil {
			continue
		}
		if clean, ok := normalizeAdminWorkspacePath(frame.Path); ok {
			paths[clean] = struct{}{}
		}
	}
	return paths
}

func adminWorkspaceAllowlist(
	session *SessionRow,
	attachments []agentattachstore.Attachment,
	artifactEvents []TurnEventRow,
	archivePaths map[string]struct{},
) map[string]struct{} {
	allowed := make(map[string]struct{})
	if session == nil {
		return allowed
	}
	for i := range attachments {
		row := attachments[i]
		if row.SessionID != session.AgentSessionID || row.UserID != uint64(session.UserID) ||
			row.FeatureKey != session.FeatureKey || row.DeletedAt != nil {
			continue
		}
		if clean, ok := normalizeAdminWorkspacePath(row.RelPath); ok {
			allowed[clean] = struct{}{}
		}
	}
	for declared := range adminDeclaredArtifactPaths(session.AgentSessionID, artifactEvents) {
		allowed[declared] = struct{}{}
	}
	for attached := range adminUserMessageMarkerPaths(session.AgentSessionID, artifactEvents) {
		allowed[attached] = struct{}{}
	}
	for attached := range archivePaths {
		allowed[attached] = struct{}{}
	}
	return allowed
}

func (b *Bridge) adminLoadWorkspaceAllowlist(ctx context.Context, session *SessionRow) (map[string]struct{}, map[string]agentattachstore.Attachment, error) {
	var attachments []agentattachstore.Attachment
	var err error
	if b.adminAttachments != nil {
		attachments, err = b.adminAttachments.ListBySession(session.AgentSessionID, uint64(session.UserID))
		if err != nil {
			return nil, nil, err
		}
	}
	events, err := b.repo.adminArtifactEventRows(ctx, session.AgentSessionID)
	if err != nil {
		return nil, nil, err
	}
	archiveMessages, err := b.adminReadArchiveRaw(session.AgentSessionID)
	if err != nil {
		return nil, nil, err
	}
	archivePaths := adminArchiveMarkerPaths(session.AgentSessionID, archiveMessages)
	allowed := adminWorkspaceAllowlist(session, attachments, events, archivePaths)
	attachmentByPath := make(map[string]agentattachstore.Attachment)
	for i := range attachments {
		row := attachments[i]
		if row.SessionID != session.AgentSessionID || row.UserID != uint64(session.UserID) ||
			row.FeatureKey != session.FeatureKey || row.DeletedAt != nil {
			continue
		}
		if clean, ok := normalizeAdminWorkspacePath(row.RelPath); ok {
			attachmentByPath[clean] = row
		}
	}
	return allowed, attachmentByPath, nil
}

// adminServeDurableAttachment 让旧会话在 executor cwd 被 GC 后仍能打开用户原始附件。
// 这里只接受上面已经按 session/user/feature 交叉校验的行；失败返回 false
// 让调用方继续尝试 workspace 副本。
func adminServeDurableAttachment(c *gin.Context, row agentattachstore.Attachment) bool {
	if row.StorageKey == "" {
		return false
	}
	obj, info, err := storage.GetObject(c.Request.Context(), storage.AgentAttachmentsBucket(), row.StorageKey)
	if err != nil {
		return false
	}
	defer obj.Close()
	disposition := "inline"
	if c.Query("download") == "1" {
		disposition = "attachment"
	}
	mime := row.Mime
	if mime == "" {
		mime = "application/octet-stream"
	}
	if disposition == "inline" {
		switch strings.ToLower(strings.TrimSpace(strings.SplitN(mime, ";", 2)[0])) {
		case "text/html", "application/xhtml+xml", "image/svg+xml":
			mime = "text/plain; charset=utf-8"
		}
	}
	filename := row.Filename
	if filename == "" {
		filename = pathpkg.Base(row.RelPath)
	}
	size := row.SizeBytes
	if info != nil && info.Size >= 0 {
		size = info.Size
	}
	c.Header("Content-Disposition", disposition+`; filename*=UTF-8''`+url.PathEscape(filename))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "no-store")
	c.DataFromReader(http.StatusOK, size, mime, obj, nil)
	return true
}

func adminArtifactBelongsToSession(row *agentartifact.Artifact, session *SessionRow) bool {
	return row != nil && session != nil && row.SessionID == session.AgentSessionID &&
		row.FeatureKey == session.FeatureKey && row.OwnerKind == "user" &&
		row.OwnerID == uint64(session.UserID)
}

func adminPersistentArtifactDTO(row agentartifact.Artifact, workspace bool) AdminArtifactDTO {
	filename := row.Filename
	if filename == "" {
		filename = pathpkg.Base(row.RelPath)
	}
	artifactURL := "/admin/agent-sessions/" + url.PathEscape(row.SessionID) + "/artifact/" + strconv.FormatUint(row.ID, 10)
	if row.StorageKey == "" && workspace {
		artifactURL = "/admin/agent-sessions/" + url.PathEscape(row.SessionID) + "/file?path=" + url.QueryEscape(row.RelPath)
	}
	return AdminArtifactDTO{
		ID: row.ID, SessionID: row.SessionID, Path: row.RelPath, Name: filename,
		Title: row.Title, Description: row.Description, Kind: row.Kind, Mime: row.Mime,
		Size: row.SizeBytes, CreatedAt: &row.CreatedAt, UpdatedAt: &row.UpdatedAt,
		Source: "storage", StorageAvailable: row.StorageKey != "", WorkspaceAvailable: workspace,
		URL: artifactURL,
	}
}

func adminWorkspaceArtifactDTO(sessionID string, entry agent.WorkspaceTreeEntry) AdminArtifactDTO {
	kind := "file"
	if entry.IsDirectory {
		kind = "dir"
	}
	return AdminArtifactDTO{
		SessionID: sessionID, Path: entry.Path, Name: entry.Name, Kind: kind, Size: entry.Size,
		Source: "workspace", WorkspaceAvailable: true,
		URL: "/admin/agent-sessions/" + url.PathEscape(sessionID) + "/file?path=" + url.QueryEscape(entry.Path),
	}
}

// AdminListSessionArtifacts GET /admin/agent-sessions/:sessionId/artifacts
// agent_artifacts+MinIO 是耐久真源；workspace 仅补充 EvArtifact 已声明但尚未收割的项。
func (b *Bridge) AdminListSessionArtifacts(c *gin.Context) {
	sessionID := strings.TrimSpace(c.Param("sessionId"))
	if sessionID == "" {
		utils.BadRequest(c, "sessionId 必填")
		return
	}
	session, err := b.repo.FindByAgentSessionID(sessionID)
	if errors.Is(err, ErrNotFound) {
		utils.NotFound(c, "会话不存在或已清理")
		return
	}
	if err != nil {
		utils.InternalError(c, 500, "查询会话归属失败", err)
		return
	}
	if b.adminArtifacts == nil {
		utils.InternalError(c, 500, "产物存储未配置", errors.New("agentbridge: nil admin artifact repository"))
		return
	}
	rows, err := b.adminArtifacts.ListBySession(sessionID)
	if err != nil {
		utils.InternalError(c, 500, "查询会话产物失败", err)
		return
	}

	// 先严格筛归属：即使 repository 的 session 条件未来被误改，也不能泄漏跨会话行。
	persistent := make([]agentartifact.Artifact, 0, len(rows))
	for i := range rows {
		if adminArtifactBelongsToSession(&rows[i], session) {
			if clean, ok := normalizeAdminWorkspacePath(rows[i].RelPath); ok {
				rows[i].RelPath = clean
				persistent = append(persistent, rows[i])
			}
		}
	}

	declaredRows, declaredErr := b.repo.adminArtifactEventRows(c.Request.Context(), sessionID)
	declared := map[string]struct{}{}
	if declaredErr == nil {
		declared = adminDeclaredArtifactPaths(sessionID, declaredRows)
	} else if len(persistent) == 0 {
		utils.InternalError(c, 500, "查询会话产物声明失败", declaredErr)
		return
	}
	workspace := make(map[string]agent.WorkspaceTreeEntry)
	client := b.clientForFeature(session.FeatureKey)
	if declaredErr == nil && client != nil && len(declared) > 0 {
		tree, treeErr := client.ListWorkspaceFiles(c.Request.Context(), sessionID, "out")
		if treeErr == nil && tree != nil && tree.State == "ok" {
			for i := range tree.Entries {
				entry := tree.Entries[i]
				if strings.HasPrefix(entry.Name, ".") || entry.Name == "manifest.json" {
					continue
				}
				candidate := entry.Path
				if candidate == "" {
					candidate = "out/" + entry.Name
				}
				clean, ok := normalizeAdminWorkspacePath(candidate)
				if !ok {
					continue
				}
				if _, ok := declared[clean]; !ok {
					continue
				}
				entry.Path = clean
				workspace[clean] = entry
			}
		} else if treeErr != nil && len(persistent) == 0 && !errors.Is(treeErr, agent.ErrSessionNotFound) {
			utils.InternalError(c, 500, "读取会话实时产物失败", treeErr)
			return
		} else if treeErr == nil && tree != nil && tree.State != "ok" && tree.State != "missing" && len(persistent) == 0 {
			utils.InternalError(c, 500, "读取会话实时产物失败", errors.New("agentbridge: workspace tree state "+tree.State))
			return
		}
	}

	items := make([]AdminArtifactDTO, 0, len(persistent)+len(workspace))
	for i := range persistent {
		_, live := workspace[persistent[i].RelPath]
		items = append(items, adminPersistentArtifactDTO(persistent[i], live))
		delete(workspace, persistent[i].RelPath)
	}
	// workspace 回退按 EvArtifact 宣告顺序输出，不遍历 map 制造随机抖动。
	for i := range declaredRows {
		var frame struct {
			Path string `json:"path"`
		}
		if json.Unmarshal(declaredRows[i].Payload, &frame) != nil {
			continue
		}
		clean, ok := normalizeAdminWorkspacePath(frame.Path)
		if !ok {
			continue
		}
		if entry, ok := workspace[clean]; ok {
			items = append(items, adminWorkspaceArtifactDTO(sessionID, entry))
			delete(workspace, clean)
		}
	}
	utils.Success(c, gin.H{"items": items, "total": len(items)})
}

// AdminGetSessionArtifact GET /admin/agent-sessions/:sessionId/artifact/:artifactId?download=1
func (b *Bridge) AdminGetSessionArtifact(c *gin.Context) {
	sessionID := strings.TrimSpace(c.Param("sessionId"))
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("artifactId")), 10, 64)
	if sessionID == "" || err != nil || id == 0 {
		utils.BadRequest(c, "sessionId 与 artifactId 必须有效")
		return
	}
	session, err := b.repo.FindByAgentSessionID(sessionID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "产物不存在")
			return
		}
		utils.InternalError(c, 500, "查询会话归属失败", err)
		return
	}
	if b.adminArtifacts == nil {
		utils.InternalError(c, 500, "产物存储未配置", errors.New("agentbridge: nil admin artifact repository"))
		return
	}
	row, err := b.adminArtifacts.GetByID(id)
	if err != nil || !adminArtifactBelongsToSession(row, session) || row.StorageKey == "" {
		if err != nil && !errors.Is(err, agentartifact.ErrNotFound) {
			utils.InternalError(c, 500, "查询会话产物失败", err)
			return
		}
		utils.NotFound(c, "产物不存在")
		return
	}
	obj, info, err := storage.GetObject(c.Request.Context(), storage.AgentArtifactsBucket(), row.StorageKey)
	if err != nil {
		utils.NotFound(c, "产物已失效")
		return
	}
	defer obj.Close()

	filename := row.Filename
	if filename == "" {
		filename = pathpkg.Base(row.RelPath)
	}
	if row.Kind == "dir" && !strings.HasSuffix(strings.ToLower(filename), ".zip") {
		filename += ".zip"
	}
	disposition := "inline"
	if c.Query("download") == "1" {
		disposition = "attachment"
	}
	mime := row.Mime
	if mime == "" {
		mime = "application/octet-stream"
	}
	if disposition == "inline" {
		switch strings.ToLower(strings.TrimSpace(strings.SplitN(mime, ";", 2)[0])) {
		case "text/html", "application/xhtml+xml", "image/svg+xml":
			mime = "text/plain; charset=utf-8"
		}
	}
	size := row.SizeBytes
	if info != nil && info.Size >= 0 {
		size = info.Size
	}
	c.Header("Content-Disposition", disposition+`; filename*=UTF-8''`+url.PathEscape(filename))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "no-store")
	c.DataFromReader(http.StatusOK, size, mime, obj, nil)
}
