// ============================================================================
// 成果交付「收割落 MinIO」—— agent ./out 顶层条目 → MinIO + agent_artifacts 元数据。
//
// 触发:on-list(GetSessionArtifacts 调 harvestSession),不碰共享 agentbridge ws pipe。
// 文件 → 二进制安全 raw 读 → 真实 mime → MinIO(变更才传,按 sha256 去重)。
// 目录 → 递归打 zip(collectDirForZip,已 raw)→ MinIO,kind=dir。
// 对账:删掉 ./out 已不存在的旧行 + 对应 MinIO 对象,保 DB/MinIO 与当前 ./out 一致。
// 生命周期 = 会话 TTL:reset/delete 时 cleanupArtifacts 清行 + 对象。
// ============================================================================

package claw

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"strconv"
	"strings"

	"scholar-backend/internal/agentartifact"
	"scholar-backend/internal/storage"
)

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

// harvestSession 收割会话 ./out 顶层 → MinIO + 元数据 + 对账。非致命错误(单文件读失败/too_large)
// 跳过不中断;返回的 error 仅为「列目录」本身的错(调用方据 4xx/missing 决定空列表 or 回退)。
// 收割是 **upsert-only**:只把 ./out 当前条目加/更新进 MinIO+DB,**绝不**按 live 工作区删已持久化的产物。
// 原因:executor 会话工作区是临时的(/home/bun/sessions,容器重启/重部署即清空),而产物的耐久真源是
// MinIO+DB。早先的「on-list 对账删除」会在重启后工作区为空时把已交付产物全清掉 → 重进会话产物消失。
// 产物的真正生命周期边界 = 会话 reset/delete(cleanupArtifacts 全清);agent 中途删 ./out 里的文件
// 只造成列表里多留一条仍可下载的旧产物(可接受,远好于「重进即丢」)。
func (h *Handler) harvestSession(ctx context.Context, ownerID uint, sessionID string) error {
	tree, err := h.feature.AgentClient().ListWorkspaceFiles(ctx, sessionID, artifactDir)
	if err != nil {
		return err
	}
	if tree == nil || tree.State != "ok" {
		// ./out 不存在(没产出 / 临时工作区已清):**保留**已持久化产物,什么都不删。
		return nil
	}
	meta := h.readArtifactManifest(ctx, sessionID) // 可能为 nil, 取值时安全
	for _, e := range tree.Entries {
		if strings.HasPrefix(e.Name, ".") {
			continue // 隐藏项一律跳过
		}
		relPath := artifactDir + "/" + e.Name
		title, desc := "", ""
		if m, ok := meta[e.Name]; ok {
			title, desc = m.Title, m.Description
		}
		if e.IsDirectory {
			h.harvestDir(ctx, ownerID, sessionID, relPath, e.Name, title, desc)
			continue
		}
		if !shouldListArtifact(e.Name, false) {
			continue // manifest.json / 空名
		}
		h.harvestFile(ctx, ownerID, sessionID, relPath, e.Name, title, desc, fileSig(e.Size, e.MTimeMs))
	}
	return nil
}

// fileSig = "<size>:<mtimeMs>" —— agent tree 的轻量签名,做收割变更检测(没变就不重读字节)。
func fileSig(size, mtimeMs int64) string {
	return strconv.FormatInt(size, 10) + ":" + strconv.FormatInt(mtimeMs, 10)
}

// harvestFile 收割单文件(二进制安全)。sig 命中已有行且已落 MinIO → 跳过昂贵的字节重读。
func (h *Handler) harvestFile(ctx context.Context, ownerID uint, sessionID, relPath, name, title, desc, sig string) {
	anchor := agentartifact.DedupAnchorFor(sessionID, relPath)
	existing, _ := h.artifactRepo.GetByDedup(anchor)
	// 变更检测:size:mtime 一致、是文件、且已落 MinIO → 内容没变,直接跳过 ReadWorkspaceFileRaw。
	if existing != nil && existing.Kind == "file" && sig != "" && existing.SourceSig == sig && existing.StorageKey != "" {
		return
	}
	raw, err := h.feature.AgentClient().ReadWorkspaceFileRaw(ctx, sessionID, relPath)
	if err != nil || raw == nil || raw.State != "ok" {
		return // too_large / 读失败 → 跳过,不阻断其它文件
	}
	h.upsertArtifact(ctx, ownerID, sessionID, relPath, name, raw.MimeType, "file", raw.Bytes, title, desc, sig, existing)
}

// harvestDir 把目录递归打成一个 zip 落 MinIO(kind=dir)。目录无可靠单签名 → 每轮重建 zip,
// 但 sha256 去重仍挡住 MinIO 重传(目录较罕见,提示词也已弱化)。
func (h *Handler) harvestDir(ctx context.Context, ownerID uint, sessionID, relPath, name, title, desc string) {
	entries, _, err := h.collectDirForZip(ctx, sessionID, relPath)
	if err != nil || len(entries) == 0 {
		return
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, e := range entries {
		w, werr := zw.Create(e.name)
		if werr != nil {
			continue
		}
		_, _ = w.Write(e.data)
	}
	if zw.Close() != nil || buf.Len() == 0 {
		return
	}
	existing, _ := h.artifactRepo.GetByDedup(agentartifact.DedupAnchorFor(sessionID, relPath))
	h.upsertArtifact(ctx, ownerID, sessionID, relPath, name, "application/zip", "dir", buf.Bytes(), title, desc, "", existing)
}

// upsertArtifact 内容变更才上传 MinIO(按 sha256 去重),元信息每次 upsert(title/desc/sig 可能更新)。
// existing 由调用方传入(避免二次查 + 做变更检测);key 变化(file↔dir .zip 翻转)时删旧对象防 MinIO orphan。
func (h *Handler) upsertArtifact(ctx context.Context, ownerID uint, sessionID, relPath, name, mime, kind string, data []byte, title, desc, sig string, existing *agentartifact.Artifact) {
	anchor := agentartifact.DedupAnchorFor(sessionID, relPath)
	sum := sha256.Sum256(data)
	sha := hex.EncodeToString(sum[:])
	key := artifactStorageKey(ownerID, sessionID, relPath)
	if kind == "dir" {
		key += ".zip"
	}
	if existing == nil || existing.ContentSHA256 != sha || existing.StorageKey == "" {
		if _, err := storage.PutObject(ctx, storage.AgentArtifactsBucket(), key,
			bytes.NewReader(data), int64(len(data)), storage.PutOptions{ContentType: mime}); err != nil {
			slog.Error("claw harvest: put object failed", "session", sessionID, "path", relPath, "err", err)
			return
		}
		// key 变了(同 relPath 由文件变目录或反之,.zip 后缀增减)→ 旧对象不再被任何行引用,删之防 orphan。
		if existing != nil && existing.StorageKey != "" && existing.StorageKey != key {
			h.deleteObjects(ctx, []string{existing.StorageKey})
		}
	}
	if err := h.artifactRepo.Upsert(&agentartifact.Artifact{
		OwnerKind:     "user",
		OwnerID:       uint64(ownerID),
		FeatureKey:    "claw",
		SessionID:     sessionID,
		RelPath:       relPath,
		Filename:      name,
		Mime:          mime,
		SizeBytes:     int64(len(data)),
		ContentSHA256: sha,
		SourceSig:     sig,
		StorageKey:    key,
		DedupAnchor:   anchor,
		Title:         title,
		Description:   desc,
		Kind:          kind,
	}); err != nil {
		slog.Error("claw harvest: upsert row failed", "session", sessionID, "path", relPath, "err", err)
	}
}

// cleanupArtifacts 删某会话全部交付物(行 + MinIO)。会话 reset/delete 用。
func (h *Handler) cleanupArtifacts(ctx context.Context, sessionID string) {
	if sessionID == "" || h.artifactRepo == nil || !storage.IsEnabled() {
		return
	}
	keys, err := h.artifactRepo.DeleteBySession(sessionID)
	if err != nil {
		slog.Error("claw artifact cleanup: delete rows failed", "session", sessionID, "err", err)
		return
	}
	h.deleteObjects(ctx, keys)
}

func (h *Handler) deleteObjects(ctx context.Context, keys []string) {
	if len(keys) == 0 {
		return
	}
	_ = storage.DeleteObjects(ctx, storage.AgentArtifactsBucket(), keys, func(key string, err error) {
		slog.Error("claw artifact: delete object failed", "key", key, "err", err)
	})
}

// artifactStorageKey 拼 MinIO 对象 key:claw/<ownerID>/<sessionID>/<relpath>。
func artifactStorageKey(ownerID uint, sessionID, relPath string) string {
	return "claw/" + strconv.FormatUint(uint64(ownerID), 10) + "/" + sessionID + "/" + relPath
}
