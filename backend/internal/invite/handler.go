// ============================================================================
// invite HTTP handler —— 用户端(我的邀请 / 落地页打开)+ 管理端(汇总 / 列表 / 明细)。
// 路由挂载见 cmd/server/routes_user.go / routes_admin.go。
// ============================================================================

package invite

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// Campaign GET /invite/campaign(公开，路由限流)。
func (h *Handler) Campaign(c *gin.Context) {
	view, err := h.svc.Campaign()
	if err != nil {
		utils.InternalError(c, 500, "获取邀请活动失败", err)
		return
	}
	if setCampaignPublicCache(c, view) {
		return
	}
	utils.Success(c, view)
}

// setCampaignPublicCache 让低频活动开关可被浏览器/CDN 短时复用，并用 ETag
// 将前端重回页面时的合理刷新降为 304；最长 60 秒后必须重验，
// 不允许 CDN 用 stale-while-revalidate 继续展示已关闭的活动。
func setCampaignPublicCache(c *gin.Context, view PublicCampaign) bool {
	raw, err := json.Marshal(view)
	if err != nil {
		return false
	}
	sum := sha256.Sum256(raw)
	etag := fmt.Sprintf("\"%x\"", sum)
	c.Header("Cache-Control", "public, max-age=60, must-revalidate")
	c.Header("ETag", etag)
	for _, candidate := range strings.Split(c.GetHeader("If-None-Match"), ",") {
		candidate = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(candidate), "W/"))
		if candidate == etag || candidate == "*" {
			c.Status(http.StatusNotModified)
			return true
		}
	}
	return false
}

// Preview POST /invite/preview {code}(公开，路由限流)。无效请求统一 valid=false。
func (h *Handler) Preview(c *gin.Context) {
	var req struct {
		Code string `json:"code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		campaign, cfgErr := h.svc.Campaign()
		if cfgErr != nil {
			utils.InternalError(c, 500, "服务暂不可用,请稍后重试", cfgErr)
			return
		}
		utils.Success(c, InvitePreview{Valid: false, Campaign: campaign})
		return
	}
	preview, err := h.svc.Preview(req.Code)
	if err != nil {
		utils.InternalError(c, 500, "服务暂不可用,请稍后重试", err)
		return
	}
	utils.Success(c, preview)
}

// ─── 用户端 ──────────────────────────────────────────────────────────────

// GetMyInvite GET /user/invite(登录态)—— get-or-create 我的邀请码 + 统计。
func (h *Handler) GetMyInvite(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	view, err := h.svc.Stats(uid)
	if err != nil {
		utils.InternalError(c, 500, "获取邀请信息失败,请稍后重试", err)
		return
	}
	utils.Success(c, view)
}

// GetMyRegistrations GET /user/invite/registrations?page=&page_size=(登录态)
// —— 我邀请的用户列表。行内 name 已在服务层脱敏(原始邮箱/用户名/ID 不下发)。
func (h *Handler) GetMyRegistrations(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	items, total, err := h.svc.UserRegistrations(uid, page, pageSize)
	if err != nil {
		utils.InternalError(c, 500, "获取邀请记录失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": total})
}

// GetStatus GET /user/invite/status(登录态)。
func (h *Handler) GetStatus(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	status, err := h.svc.Status(uid)
	if err != nil {
		utils.InternalError(c, 500, "获取邀请绑定状态失败", err)
		return
	}
	utils.Success(c, status)
}

// Bind POST /user/invite/bind {code}(登录态)。source 固定 manual，绝不信任客户端传值。
// 可预期的业务结果统一 200 + status.reason，只有 DB/账务失败才 5xx。
func (h *Handler) Bind(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	// method 由服务端根据该用户最早 auth provider/注册资料推导，不把操作来源 manual
	// 错存成 email/phone/google/wechat 等真实注册方式。
	result, err := h.svc.Bind(req.Code, uid, sourceManual, "")
	if err == nil {
		utils.Success(c, result)
		return
	}
	if isExpectedBindError(err) {
		status, statusErr := h.svc.Status(uid)
		if statusErr != nil {
			utils.InternalError(c, 500, "获取邀请绑定状态失败", statusErr)
			return
		}
		status.Eligible = false
		status.Reason = bindReason(err)
		status.Code = ""
		utils.Success(c, InviteBindResult{Status: *status, Rewards: InviteBindRewards{}})
		return
	}
	utils.InternalError(c, 500, "绑定邀请关系失败,请稍后重试", err)
}

// RecordOpen POST /invite/open {code}(公开,限流)—— 落地页打开计数。
// 契约:码不存在返回 {valid:false} 而非 4xx(防探测噪音);连请求体畸形也按
// valid:false 收口 —— 这个端点对外只有「有效/无效」两种回答,不提供任何探测面。
func (h *Handler) RecordOpen(c *gin.Context) {
	var req struct {
		Code string `json:"code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Success(c, gin.H{"valid": false})
		return
	}
	valid, err := h.svc.RecordOpen(req.Code)
	if err != nil {
		// DB 故障是我们的问题,不是探测 —— 照常 5xx(友好文案,不回显 err)。
		utils.InternalError(c, 500, "服务暂不可用,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"valid": valid})
}

// ─── 管理端 ──────────────────────────────────────────────────────────────

// AdminSummary GET /admin/invites/summary —— 邀请人数 / 总打开 / 总注册 / 近 7 天注册 / 累计奖励经费。
func (h *Handler) AdminSummary(c *gin.Context) {
	sum, err := h.svc.Summary()
	if err != nil {
		utils.InternalError(c, 500, "获取邀请汇总失败", err)
		return
	}
	utils.Success(c, sum)
}

// AdminList GET /admin/invites?page=&page_size=&keyword= —— 邀请人分页列表。
func (h *Handler) AdminList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	items, total, err := h.svc.List(c.Query("keyword"), page, pageSize)
	if err != nil {
		utils.InternalError(c, 500, "获取邀请列表失败", err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": total})
}

// AdminRegistrations GET /admin/invites/:id/registrations?page=&page_size=
// —— 某邀请人(:id = user_id)带来的注册明细。
func (h *Handler) AdminRegistrations(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的邀请人 id")
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	items, total, err := h.svc.RegistrationsOf(uint(id), page, pageSize)
	if err != nil {
		utils.InternalError(c, 500, "获取邀请注册明细失败", err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": total})
}

// AdminGetCampaign / AdminUpdateCampaign 挂在 config.manage，与 users.view 的监控看板分开。
func (h *Handler) AdminGetCampaign(c *gin.Context) {
	cfg, err := h.svc.AdminCampaign()
	if err != nil {
		utils.InternalError(c, 500, "获取邀请活动配置失败", err)
		return
	}
	utils.Success(c, cfg)
}

func (h *Handler) AdminUpdateCampaign(c *gin.Context) {
	adminID, _ := utils.GetUserID(c)
	var req CampaignConfig
	if !utils.BindJSON(c, &req) {
		return
	}
	if err := h.svc.UpdateCampaign(&req); err != nil {
		if ce, ok := AsCampaignConfigError(err); ok {
			utils.BadRequest(c, ce.Error())
			return
		}
		utils.InternalError(c, 500, "保存邀请活动配置失败", err)
		return
	}
	slog.Info("audit: admin 更新邀请活动配置",
		"admin_id", adminID, "enabled", req.Enabled,
		"inviter_registration_credits", req.InviterRegistrationCredits,
		"invitee_registration_credits", req.InviteeRegistrationCredits,
		"registration_daily_cap", req.RegistrationDailyCap,
		"bind_window_days", req.BindWindowDays,
		"first_purchase_window_days", req.FirstPurchaseWindowDays,
		"first_purchase_rebate_bps", req.FirstPurchaseRebateBPS,
		"code_help_url", req.CodeHelpURL)
	cfg, err := h.svc.AdminCampaign()
	if err != nil {
		utils.InternalError(c, 500, "配置已保存但回读失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已保存", cfg)
}
