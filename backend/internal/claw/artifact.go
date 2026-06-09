// ============================================================================
// Scholay 智能助手 (Claw) — 成果交付 (agent 产出 → web 用户可下载/预览)
//
// 背景: agent 在私有、临时的会话 cwd 里工作, 用户(网页端)看不到也下不到磁盘文件。
// 约定: agent(由 prompts/claw.go 的"成果交付"段指引)把要交给用户的成品写进 ./out/
// 子目录; 后端把 ./out/ 列出来 (GetSessionArtifacts) + 提供下载/预览 (DownloadSessionArtifact),
// 成品即作为可下载产物到达用户。这是 OpenAI Code-Interpreter 式"已知输出目录"范式,
// 由 agent 自己决定什么写进 ./out (agent-native), 后端只忠实地把该目录的文件呈现出去。
//
// 生命周期 = 会话生命周期 (跟 ./out 一起活/灭, 即"session TTL"): 不落 MinIO, 实时从
// agent 会话 cwd 回读。会话删除/重置 → cwd 连同产物一并清理 (见 agent sessionService)。
//
// 安全 (沿用 file.go 同款约束):
//   ① UserAuthMiddleware 已鉴权;  ② OwnsSession 校验会话归属 (防越权);
//   ③ artifactRelPath 只放行 out/<basename>, 杜绝 ../ 穿越 / 读 cwd 根或别的目录;
//   ④ 文本一律 text/plain 回写、图片仅光栅图、+ nosniff (防同源 XSS, 同 file.go)。
// ============================================================================

package claw

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/common/utils"
)

// artifactDir 是会话 cwd 内约定的"交付目录"。与 prompts/claw.go 的成果交付段一致。
const artifactDir = "out"

// artifactManifestName 是 agent 可选写入 ./out 的清单文件: agent 用它显式声明每个交付物的
// title/description (相当于 deliver_artifact(path,title,description) 的元信息), 后端据此给
// 产物卡片更友好的标题。清单本身不作为可下载产物列出。缺失/格式坏 → 退化成只用文件名。
const artifactManifestName = "manifest.json"

const (
	artifactListTimeout = 10 * time.Second
	// maxArtifactBytes — 单个产物回取上限, 防异常大文件撑爆 backend (同 file.go maxProxyImageBytes 思路)。
	maxArtifactBytes = 12 * 1024 * 1024
)

// ArtifactDTO — 一个可交付产物的元信息。Title/Description 来自 agent 的 manifest.json (可空)。
type ArtifactDTO struct {
	Path        string `json:"path"` // 相对会话 cwd: 文件形如 out/xxx.md, 目录形如 out/proj
	Name        string `json:"name"` // 文件名 / 目录名
	Kind        string `json:"kind"` // "file"(单文件直下) | "dir"(整目录打包 zip 下载)
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
}

// artifactMeta — manifest.json 里单个交付物的标注。
type artifactMeta struct {
	Title       string
	Description string
}

// readArtifactManifest 读 ./out/manifest.json (agent 可选写) 并解析成 file→meta 映射。
// 任何缺失/读失败/解析失败都返回 nil (静默退化, 不影响产物列出)。
func (h *Handler) readArtifactManifest(ctx context.Context, sessionID string) map[string]artifactMeta {
	wf, err := h.feature.AgentClient().GetWorkspaceFile(ctx, sessionID, artifactDir+"/"+artifactManifestName)
	if err != nil || wf == nil || wf.State != "ok" || wf.PreviewType != "text" {
		return nil
	}
	return parseArtifactManifest([]byte(wf.Content))
}

// parseArtifactManifest 解析 out/manifest.json 文本为 file(basename)→meta 映射。纯函数, 便于单测。
// 空 / 非法 JSON / 无 artifacts → nil (调用方取值天然安全)。file 取 basename, 防 manifest 写 ../。
func parseArtifactManifest(content []byte) map[string]artifactMeta {
	if strings.TrimSpace(string(content)) == "" {
		return nil
	}
	var parsed struct {
		Artifacts []struct {
			File        string `json:"file"`
			Title       string `json:"title"`
			Description string `json:"description"`
		} `json:"artifacts"`
	}
	if json.Unmarshal(content, &parsed) != nil {
		return nil
	}
	if len(parsed.Artifacts) == 0 {
		return nil
	}
	out := make(map[string]artifactMeta, len(parsed.Artifacts))
	for _, a := range parsed.Artifacts {
		f := strings.TrimSpace(a.File)
		if f == "" {
			continue
		}
		out[path.Base(f)] = artifactMeta{Title: a.Title, Description: a.Description}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// artifactRelPath 校验并规整前端传来的产物相对路径: 只允许 out/<basename>。
// 杜绝绝对路径 / .. 穿越 / 读 cwd 根或其它目录。非法返回 ("","")。
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

// agentClientErrIs4xxOrMissing — agent 4xx / 会话不存在: 客户端原因, 当作"无产物/找不到"
// 处理 (回 4xx 或空列表), 不当成 502 噪音 (这些恰说明上游校验生效了)。
func agentClientErrIs4xxOrMissing(err error) bool {
	var hErr *agent.HTTPError
	return errors.Is(err, agent.ErrSessionNotFound) ||
		(errors.As(err, &hErr) && hErr.StatusCode >= 400 && hErr.StatusCode < 500)
}

// shouldListArtifact 判定 out/ 下一个目录项是否应作为可下载产物列出:
// 排除目录、dotfile(.开头)、清单文件 manifest.json 本身、空名。纯函数, 便于单测。
func shouldListArtifact(name string, isDir bool) bool {
	if isDir || name == "" || strings.HasPrefix(name, ".") || name == artifactManifestName {
		return false
	}
	return true
}

// GetSessionArtifacts — GET /claw/session/artifacts?session_id=<id>
//
// 列出会话交付目录 out/ 下的文件 (agent 产出的成品), 供前端渲染成可下载/预览的产物卡片。
// out/ 不存在 (还没产出任何东西) → 返回空列表 (非错误)。
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
		meta := h.readArtifactManifest(ctx, sessionID) // 可能为 nil, 取值时安全
		for _, e := range tree.Entries {
			if strings.HasPrefix(e.Name, ".") {
				continue // 隐藏项(.开头)一律跳过
			}
			if e.IsDirectory {
				// 子目录 → 作为一个"打包 zip"产物(整目录递归打包下载, 见 DownloadArtifactZip)。
				items = append(items, ArtifactDTO{Path: artifactDir + "/" + e.Name, Name: e.Name, Kind: "dir"})
				continue
			}
			if !shouldListArtifact(e.Name, false) {
				continue // 过滤 manifest.json / 空名
			}
			dto := ArtifactDTO{Path: artifactDir + "/" + e.Name, Name: e.Name, Kind: "file"}
			if m, ok := meta[e.Name]; ok {
				dto.Title = m.Title
				dto.Description = m.Description
			}
			items = append(items, dto)
		}
	}
	utils.Success(c, gin.H{"items": items, "total": len(items)})
}

// DownloadSessionArtifact — GET /claw/session/artifact?session_id=<id>&path=out/<name>[&download=1]
//
// 回取一个交付产物。文本类按 text/plain 回写 (前端可内联预览/渲染), 图片按光栅图;
// download=1 时强制 Content-Disposition: attachment 触发下载。一律带 nosniff。
// 当前仅支持 text/image (agent 预览读接口只返回这两类); 二进制 → 404, 待后续
// deliver_artifact + 原始字节回读补齐。
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

	c.Header("X-Content-Type-Options", "nosniff")
	if c.Query("download") == "1" {
		c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+url.QueryEscape(name))
	}

	switch wf.PreviewType {
	case "image":
		mimeType, payload, derr := decodeDataURL(wf.DataURL)
		if derr != nil {
			utils.InternalError(c, codeAgentUnreachable, "图片解析失败", derr)
			return
		}
		if mimeType == "" {
			mimeType = wf.MimeType
		}
		// 只回写光栅图 —— 拒绝 svg 等可被浏览器当文档执行脚本的类型 (同源 XSS 防护, 同 file.go)。
		if !allowedRasterMIME[strings.ToLower(strings.TrimSpace(mimeType))] {
			utils.Error(c, 4404, "不支持的图片类型")
			return
		}
		c.Data(http.StatusOK, mimeType, payload)
	case "text":
		// 文本一律 text/plain 回写 (防 html/svg 同源 XSS); 前端预览也读这个再自行 Markdown 渲染。
		c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(wf.Content))
	default:
		utils.Error(c, 4404, "暂不支持下载该类型文件")
	}
}

const (
	artifactZipTimeout = 30 * time.Second
	maxZipFiles        = 50               // 防 agent 失控刷一堆文件
	maxZipDepth        = 4                // 防深目录递归炸栈/超时
	maxZipPerFileBytes = 5 * 1024 * 1024  // 单文件上限(超了跳过)
	maxZipTotalBytes   = 30 * 1024 * 1024 // 打包总量上限(防撑爆 backend)
)

// zipEntry — 打包进 zip 的一个文件(name 相对 out/, 如 proj/a.md)。
type zipEntry struct {
	name string
	data []byte
}

// collectDirForZip 递归收集 dir(相对 cwd, 如 out/proj)下的文本/图片文件字节, 带限额防异常。
// 二进制 / 超大 / 读失败的文件跳过(agent 读接口只回 text/image)。返回条目与跳过数。
func (h *Handler) collectDirForZip(ctx context.Context, sessionID, dir string) ([]zipEntry, int, error) {
	var entries []zipEntry
	total, skipped := 0, 0
	var walk func(d string, depth int) error
	walk = func(d string, depth int) error {
		if depth > maxZipDepth || len(entries) >= maxZipFiles {
			return nil
		}
		tree, err := h.feature.AgentClient().ListWorkspaceFiles(ctx, sessionID, d)
		if err != nil {
			return err
		}
		if tree == nil || tree.State != "ok" {
			return nil
		}
		for _, e := range tree.Entries {
			if len(entries) >= maxZipFiles {
				break
			}
			if strings.HasPrefix(e.Name, ".") {
				continue
			}
			if e.IsDirectory {
				if err := walk(e.Path, depth+1); err != nil {
					return err
				}
				continue
			}
			wf, rerr := h.feature.AgentClient().ReadWorkspaceFileFull(ctx, sessionID, e.Path)
			if rerr != nil || wf == nil || wf.State != "ok" || wf.Size > maxZipPerFileBytes {
				skipped++
				continue
			}
			var data []byte
			switch wf.PreviewType {
			case "text":
				data = []byte(wf.Content)
			case "image":
				_, payload, derr := decodeDataURL(wf.DataURL)
				if derr != nil {
					skipped++
					continue
				}
				data = payload
			default:
				skipped++ // 二进制等暂不支持
				continue
			}
			if total+len(data) > maxZipTotalBytes {
				skipped++
				continue
			}
			total += len(data)
			entries = append(entries, zipEntry{name: strings.TrimPrefix(e.Path, artifactDir+"/"), data: data})
		}
		return nil
	}
	if err := walk(dir, 0); err != nil {
		return nil, 0, err
	}
	return entries, skipped, nil
}

// DownloadArtifactZip — GET /claw/session/artifact.zip?session_id=<id>&dir=out/<name>
//
// 把交付目录 out/<name> 递归打包成一个 zip 下载(多文件 / 目录产物的统一交付)。
// 带限额防异常(见上方常量);二进制文件跳过。dir 复用 artifactRelPath 校验(只允许 out/<name>)。
func (h *Handler) DownloadArtifactZip(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID := strings.TrimSpace(c.Query("session_id"))
	dir, name := artifactRelPath(c.Query("dir"))
	if sessionID == "" || dir == "" {
		utils.BadRequest(c, "missing or invalid session_id/dir")
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

	ctx, cancel := context.WithTimeout(c.Request.Context(), artifactZipTimeout)
	defer cancel()
	entries, _, err := h.collectDirForZip(ctx, sessionID, dir)
	if err != nil {
		if agentClientErrIs4xxOrMissing(err) {
			utils.Error(c, 4404, "目录不存在或不属于你")
			return
		}
		utils.InternalError(c, codeAgentUnreachable, "打包失败,请稍后重试", err)
		return
	}
	if len(entries) == 0 {
		utils.Error(c, 4404, "目录为空或无可打包文件")
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
	if cerr := zw.Close(); cerr != nil {
		utils.InternalError(c, codeAgentUnreachable, "打包失败,请稍后重试", cerr)
		return
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+url.QueryEscape(name)+".zip")
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}
