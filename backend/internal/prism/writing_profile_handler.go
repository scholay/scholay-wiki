// ============================================================================
// Prism 写作画像 HTTP handler(Phase 3)—— 查看 / 用户覆盖 / planner 自动识别。
//   仅服务 struct 轨项目(旧版项目无画像概念)。画像变更由 service 侧失效活会话。
// ============================================================================

package prism

import (
	"context"
	"errors"
	"time"

	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/vip"

	"github.com/gin-gonic/gin"
)

// profileJSON —— 画像对外响应形状(不暴露内部字段名以外的东西)。
func profileJSON(p WritingProfile) gin.H {
	return gin.H{"base_slug": p.BaseSlug, "genre": p.Genre, "source": p.Source, "needs_refine": p.NeedsRefine}
}

// GetWritingProfile GET /user/prism/projects/:id/writing-profile → 当前画像 + 人格花名册(前端 picker)。
func (h *Handler) GetWritingProfile(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	profile, roster := h.svc.GetWritingProfileView(p)
	personas := make([]gin.H, 0, len(roster))
	for _, e := range roster {
		personas = append(personas, gin.H{
			"slug": e.Slug, "name": e.Name, "kind": e.Kind, "description": e.Desc,
			"scene": e.Scene, "traits": e.Traits, // V4 UI:选择器右栏图形化详情
			"skeleton": e.Skeleton, "sample": e.Sample, // 骨架流程图 + 成稿味道示例句
		})
	}
	utils.Success(c, gin.H{"profile": profileJSON(profile), "personas": personas})
}

// SetWritingProfile PUT /user/prism/projects/:id/writing-profile {base_slug, genre?} → 用户覆盖(最高优先级)。
func (h *Handler) SetWritingProfile(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	var req struct {
		BaseSlug string `json:"base_slug"`
		Genre    string `json:"genre"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	profile, err := h.svc.SetWritingProfileFromUser(c.Request.Context(), p, req.BaseSlug, req.Genre)
	if err != nil {
		if errors.Is(err, ErrInvalidPersona) {
			utils.SafeBadRequest(c, err)
			return
		}
		utils.InternalError(c, 500, "保存写作画像失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"profile": profileJSON(profile)})
}

// GetQualityCheck GET /user/prism/projects/:id/quality-check → 当前结构体的确定性质量回执(Phase 4)。
func (h *Handler) GetQualityCheck(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	r, err := h.svc.QualityReceiptFor(p.ID)
	if err != nil {
		utils.InternalError(c, 500, "质量检查失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"quality": r})
}

// PlanWritingProfile POST /user/prism/projects/:id/writing-profile/plan → 一次性 planner 轮自动判文体/学科。
func (h *Handler) PlanWritingProfile(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	profile, err := h.svc.PlanWritingProfile(ctx, p)
	if err != nil {
		// 配额用尽不是服务器错误:映射成结构化 quota 信号(6010 → 前端 QuotaNotifier 弹升级/重置引导)。
		// 线上审计:48h 内本端点 11 次 5xx,大头就是额度用尽被误报成 500 +「识别失败请手动选择」,
		// 用户既看不到升级引导、还以为服务坏了。与 peerreview handler 同款映射。
		if errors.Is(err, vip.ErrQuotaExceeded) {
			utils.SafeError(c, errcode.AgentQuotaExceeded, err)
			return
		}
		utils.InternalError(c, 500, "自动识别文体/学科失败,请手动选择", err)
		return
	}
	utils.Success(c, gin.H{"profile": profileJSON(profile)})
}
