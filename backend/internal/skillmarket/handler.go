// ============================================================================
// Skills 市场 —— HTTP Handler(user + admin)
//
// 用户面绝不回显 err.Error()(见 friendly-error-messages):service 的已知业务错映射成友好中文,
// 未知错走 500 通用文案。
// ============================================================================

package skillmarket

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/utils"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

// ── 用户面 ───────────────────────────────────────────────────────────────────

// CreateSkill POST /user/skills —— multipart:name/tagline/category/contentSource +
// (zip 文件 | files[] 文件夹 | content 纯文本)。
func (h *Handler) CreateSkill(c *gin.Context) {
	userID := c.GetUint("user_id")
	name := c.PostForm("name")
	tagline := c.PostForm("tagline")
	category := c.PostForm("category")
	contentSource := c.PostForm("contentSource")

	files, err := h.readBundleUpload(c)
	if err != nil {
		h.respondServiceErr(c, err)
		return
	}
	skill, err := h.service.CreateSkill(c.Request.Context(), userID, name, tagline, category, contentSource, files)
	if err != nil {
		h.respondServiceErr(c, err)
		return
	}
	utils.Success(c, gin.H{"id": skill.ID, "slug": skill.Slug})
}

// UpdateContent PUT /user/skills/:id/content —— 传新版本(同 CreateSkill 的 bundle 输入)。
func (h *Handler) UpdateContent(c *gin.Context) {
	userID := c.GetUint("user_id")
	skillID := parseParamUint(c, "id")
	changelog := c.PostForm("changelog")
	files, err := h.readBundleUpload(c)
	if err != nil {
		h.respondServiceErr(c, err)
		return
	}
	ver, err := h.service.UpdateContent(c.Request.Context(), userID, skillID, files, changelog)
	if err != nil {
		h.respondServiceErr(c, err)
		return
	}
	utils.Success(c, gin.H{"versionId": ver.ID, "version": ver.Version})
}

// UpdateMeta PATCH /user/skills/:id
func (h *Handler) UpdateMeta(c *gin.Context) {
	userID := c.GetUint("user_id")
	skillID := parseParamUint(c, "id")
	var req UpdateSkillMetaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "参数错误")
		return
	}
	if err := h.service.UpdateMeta(userID, skillID, req); err != nil {
		h.respondServiceErr(c, err)
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// Publish POST /user/skills/:id/publish
func (h *Handler) Publish(c *gin.Context) {
	userID := c.GetUint("user_id")
	skillID := parseParamUint(c, "id")
	var req PublishRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "参数错误")
		return
	}
	if err := h.service.Publish(userID, skillID, req.Visibility); err != nil {
		h.respondServiceErr(c, err)
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// Unpublish POST /user/skills/:id/unpublish
func (h *Handler) Unpublish(c *gin.Context) {
	userID := c.GetUint("user_id")
	skillID := parseParamUint(c, "id")
	if err := h.service.Unpublish(userID, skillID); err != nil {
		h.respondServiceErr(c, err)
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// DeleteSkill DELETE /user/skills/:id
func (h *Handler) DeleteSkill(c *gin.Context) {
	userID := c.GetUint("user_id")
	skillID := parseParamUint(c, "id")
	if err := h.service.DeleteSkill(userID, skillID); err != nil {
		h.respondServiceErr(c, err)
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// ListMySkills GET /user/skills
func (h *Handler) ListMySkills(c *gin.Context) {
	userID := c.GetUint("user_id")
	list, err := h.service.ListMySkills(userID)
	if err != nil {
		utils.ServerError(c, "获取失败")
		return
	}
	utils.Success(c, gin.H{"list": list})
}

// ListMarket GET /skills/market
func (h *Handler) ListMarket(c *gin.Context) {
	userID := c.GetUint("user_id")
	var req ListMarketRequest
	_ = c.ShouldBindQuery(&req)
	resp, err := h.service.ListMarket(userID, req)
	if err != nil {
		utils.ServerError(c, "获取失败")
		return
	}
	utils.Success(c, resp)
}

// GetDetail GET /skills/market/:idOrSlug(登录态,含私有 + 安装命令)
func (h *Handler) GetDetail(c *gin.Context) {
	userID := c.GetUint("user_id")
	dto, err := h.service.GetDetail(userID, c.Param("idOrSlug"), baseURLFrom(c))
	if err != nil {
		utils.NotFound(c, "该 skill 不存在或未公开")
		return
	}
	utils.Success(c, dto)
}

// ── 公开端点(免登录;只服务 public+approved+active)──────────────────────────

// PublicDetail GET /skills/:slug —— 匿名分享落地页。
func (h *Handler) PublicDetail(c *gin.Context) {
	dto, err := h.service.GetPublicDetail(c.Param("slug"), baseURLFrom(c))
	if err != nil {
		utils.NotFound(c, "该 skill 不存在或未公开")
		return
	}
	utils.Success(c, dto)
}

// DownloadBundle GET /skills/:slug/download —— tar.gz(根=<slug>/),任意 agent 解压即用。
func (h *Handler) DownloadBundle(c *gin.Context) {
	slug := c.Param("slug")
	rc, size, err := h.service.OpenDownload(c.Request.Context(), slug)
	if err != nil {
		if errors.Is(err, ErrDownloadUnavailable) {
			utils.Error(c, http.StatusServiceUnavailable, "下载暂不可用")
			return
		}
		utils.NotFound(c, "该 skill 不存在或未公开")
		return
	}
	defer rc.Close()
	c.Header("Content-Type", "application/gzip")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.tar.gz\"", slug))
	if size > 0 {
		c.Header("Content-Length", strconv.FormatInt(size, 10))
	}
	_, _ = io.Copy(c.Writer, rc)
}

// InstallMd GET /skills/install.md —— 商店安装说明(Markdown)。
func (h *Handler) InstallMd(c *gin.Context) {
	c.Header("Content-Type", "text/markdown; charset=utf-8")
	c.String(http.StatusOK, h.service.BuildInstallManifest(baseURLFrom(c)))
}

// MarketplaceJSON GET /skills/marketplace.json —— Claude Code marketplace 目录。
func (h *Handler) MarketplaceJSON(c *gin.Context) {
	data, err := h.service.BuildMarketplaceJSON(baseURLFrom(c))
	if err != nil {
		utils.ServerError(c, "生成失败")
		return
	}
	c.Data(http.StatusOK, "application/json; charset=utf-8", data)
}

// PublicSkillMd GET /skills/:slug/SKILL.md —— 原始(干净)SKILL.md 文本。
func (h *Handler) PublicSkillMd(c *gin.Context) {
	md, err := h.service.GetPublicSkillMd(c.Param("slug"))
	if err != nil {
		utils.NotFound(c, "该 skill 不存在或未公开")
		return
	}
	c.Header("Content-Type", "text/markdown; charset=utf-8")
	c.String(http.StatusOK, md)
}

// Install POST /user/skills/installed
func (h *Handler) Install(c *gin.Context) {
	userID := c.GetUint("user_id")
	var req InstallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "参数错误")
		return
	}
	if err := h.service.Install(userID, req.SkillID); err != nil {
		h.respondServiceErr(c, err)
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// ListInstalled GET /user/skills/installed —— claw 启用面板。
func (h *Handler) ListInstalled(c *gin.Context) {
	userID := c.GetUint("user_id")
	list, err := h.service.ListInstalled(userID)
	if err != nil {
		utils.ServerError(c, "获取失败")
		return
	}
	utils.Success(c, gin.H{"list": list})
}

// SetEnabled PATCH /user/skills/installed/:id
func (h *Handler) SetEnabled(c *gin.Context) {
	userID := c.GetUint("user_id")
	skillID := parseParamUint(c, "id")
	var req SetEnabledRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "参数错误")
		return
	}
	if err := h.service.SetEnabled(userID, skillID, req.Enabled); err != nil {
		h.respondServiceErr(c, err)
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// Uninstall DELETE /user/skills/installed/:id
func (h *Handler) Uninstall(c *gin.Context) {
	userID := c.GetUint("user_id")
	skillID := parseParamUint(c, "id")
	if err := h.service.Uninstall(userID, skillID); err != nil {
		h.respondServiceErr(c, err)
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// Report POST /skills/market/:id/report
func (h *Handler) Report(c *gin.Context) {
	userID := c.GetUint("user_id")
	skillID := parseParamUint(c, "id")
	var req ReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "参数错误")
		return
	}
	if err := h.service.Report(userID, skillID, req); err != nil {
		h.respondServiceErr(c, err)
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// ── 管理端 ───────────────────────────────────────────────────────────────────

func (h *Handler) AdminList(c *gin.Context) {
	list, err := h.service.AdminList(c.Query("status"))
	if err != nil {
		utils.ServerError(c, "获取失败")
		return
	}
	utils.Success(c, gin.H{"list": list})
}

func (h *Handler) AdminApprove(c *gin.Context) {
	if err := h.service.Approve(parseParamUint(c, "id")); err != nil {
		utils.ServerError(c, "操作失败")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

func (h *Handler) AdminReject(c *gin.Context) {
	var req RejectRequest
	_ = c.ShouldBindJSON(&req)
	if err := h.service.Reject(parseParamUint(c, "id"), req.Note); err != nil {
		utils.ServerError(c, "操作失败")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

func (h *Handler) AdminTakedown(c *gin.Context) {
	var req RejectRequest
	_ = c.ShouldBindJSON(&req)
	if err := h.service.Takedown(parseParamUint(c, "id"), req.Note); err != nil {
		utils.ServerError(c, "操作失败")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

func (h *Handler) AdminListReports(c *gin.Context) {
	list, err := h.service.ListReports(c.Query("status"))
	if err != nil {
		utils.ServerError(c, "获取失败")
		return
	}
	utils.Success(c, gin.H{"list": list})
}

func (h *Handler) AdminResolveReport(c *gin.Context) {
	adminID := c.GetUint("user_id")
	action := c.Query("action") // actioned | dismissed
	if err := h.service.ResolveReport(parseParamUint(c, "id"), adminID, action); err != nil {
		utils.ServerError(c, "操作失败")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// ── 内部辅助 ─────────────────────────────────────────────────────────────────

// readBundleUpload 从 multipart 读上传,解析成 []BundleFile(含安全校验):
//   (a) zip 字段(「选择zip文件」);(b) files[] 文件夹(「选择文件夹」,filename=相对路径);
//   (c) 单 file 字段(.zip 或单 SKILL.md);(d) content 纯文本(快速创建)。
func (h *Handler) readBundleUpload(c *gin.Context) ([]BundleFile, error) {
	if fh, ferr := c.FormFile("zip"); ferr == nil && fh != nil {
		raw, err := readMultipart(fh)
		if err != nil {
			return nil, err
		}
		return ParseZipBundle(raw)
	}
	form, _ := c.MultipartForm()
	if form != nil {
		if fhs := form.File["files"]; len(fhs) > 0 {
			var paths []string
			var datas [][]byte
			for _, fh := range fhs {
				raw, err := readMultipart(fh)
				if err != nil {
					return nil, err
				}
				paths = append(paths, fh.Filename) // FormData 第三参 = webkitRelativePath
				datas = append(datas, raw)
			}
			return NewBundleFromFiles(paths, datas)
		}
		if fhs := form.File["file"]; len(fhs) > 0 {
			fh := fhs[0]
			raw, err := readMultipart(fh)
			if err != nil {
				return nil, err
			}
			// zip magic PK 或 .zip 后缀 → 当 zip;否则当单 SKILL.md。
			if strings.HasSuffix(strings.ToLower(fh.Filename), ".zip") || (len(raw) >= 2 && raw[0] == 0x50 && raw[1] == 0x4b) {
				return ParseZipBundle(raw)
			}
			return []BundleFile{{Path: "SKILL.md", Data: raw}}, nil
		}
	}
	content := c.PostForm("content")
	if strings.TrimSpace(content) != "" {
		if int64(len(content)) > MaxBundleBytes {
			return nil, ErrBundleTooLarge
		}
		return []BundleFile{{Path: "SKILL.md", Data: []byte(content)}}, nil
	}
	return nil, errors.New("请上传含 SKILL.md 的文件夹/zip,或填写 SKILL.md 内容")
}

// readMultipart 读一份 multipart 文件(限幅)。
func readMultipart(fh *multipart.FileHeader) ([]byte, error) {
	if fh.Size > MaxBundleBytes {
		return nil, ErrBundleTooLarge
	}
	f, err := fh.Open()
	if err != nil {
		return nil, ErrBadBundle
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, MaxBundleBytes+1))
	if err != nil || int64(len(raw)) > MaxBundleBytes {
		return nil, ErrBundleTooLarge
	}
	return raw, nil
}

// baseURLFrom 从请求派生对外 base URL(scheme+host);nginx 设 X-Forwarded-Proto。
func baseURLFrom(c *gin.Context) string {
	scheme := c.GetHeader("X-Forwarded-Proto")
	if scheme == "" {
		if c.Request.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}
	return scheme + "://" + c.Request.Host
}

// respondServiceErr 把已知业务错映射友好文案;未知错 → 500 通用。
func (h *Handler) respondServiceErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		utils.NotFound(c, "该 skill 不存在")
	case errors.Is(err, ErrNotOwner):
		utils.Forbidden(c, "无权操作该 skill")
	case errors.Is(err, ErrQuotaExceeded):
		utils.Error(c, http.StatusTooManyRequests, "已达 skill 数量上限,请删除旧的或升级会员")
	case errors.Is(err, ErrNotInstallable):
		utils.BadRequest(c, "该 skill 未公开或未过审,无法安装")
	case errors.Is(err, ErrTooManyEnabled):
		utils.Error(c, http.StatusTooManyRequests, err.Error())
	case errors.Is(err, ErrBundleTooLarge):
		utils.BadRequest(c, "文件超过 30MB 上限")
	case errors.Is(err, ErrBodyTooLong):
		utils.BadRequest(c, "SKILL.md 正文过长(上限 8000 字符)")
	case errors.Is(err, ErrBadName):
		utils.BadRequest(c, "skill 名不合法(仅支持字母数字,禁用保留词/标签)")
	case errors.Is(err, ErrEmptyContent), errors.Is(err, ErrNoSkillMd), errors.Is(err, ErrBadBundle):
		utils.BadRequest(c, "SKILL.md 内容为空或格式非法")
	case errors.Is(err, ErrTooManyVersions):
		utils.BadRequest(c, "版本数已达上限,请先删除旧 skill")
	// bundle 校验错(消息安全,直接回显)
	case errors.Is(err, ErrBundleNoSkillMd), errors.Is(err, ErrBundleMultiSkillMd),
		errors.Is(err, ErrBundlePathEscape), errors.Is(err, ErrBundleFileTooLarge),
		errors.Is(err, ErrBundleTooManyFiles), errors.Is(err, ErrBundleBadExt):
		utils.BadRequest(c, err.Error())
	default:
		if err != nil && strings.HasPrefix(err.Error(), "请上传") {
			utils.BadRequest(c, err.Error())
			return
		}
		utils.ServerError(c, "操作失败,请稍后重试")
	}
}

func parseParamUint(c *gin.Context, key string) uint {
	n, _ := strconv.ParseUint(c.Param(key), 10, 64)
	return uint(n)
}
