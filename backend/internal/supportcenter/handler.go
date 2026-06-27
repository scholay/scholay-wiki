// ============================================================================
// 客服与联系中心 —— HTTP handler。
//   admin(AdminAuthMiddleware 之后):配置 CRUD + 飞书/IMAP 测试 + 收件箱 + 回信/写信
//   public(免登录):GET /config/support-contact 用户端「联系我们」展示数据
// ============================================================================

package supportcenter

import (
	"log/slog"
	"strconv"
	"strings"

	"scholar-backend/internal/common/httpclient"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ─── 公开端点 ─────────────────────────────────────────────────────────────

// GetPublicContact GET /config/support-contact —— 用户端联系我们(空字段前端自然隐藏)。
func (h *Handler) GetPublicContact(c *gin.Context) {
	pc, err := h.svc.GetPublicContact()
	if err != nil {
		utils.ServerError(c, "获取联系方式失败")
		return
	}
	utils.Success(c, pc)
}

// ─── admin:配置 ──────────────────────────────────────────────────────────

// GetConfig GET /admin/support-center/config(?show_sensitive=true 显示明文)。
func (h *Handler) GetConfig(c *gin.Context) {
	cfg, err := h.svc.GetConfig()
	if err != nil {
		utils.ServerError(c, "获取配置失败")
		return
	}
	utils.Success(c, cfg.MaskSensitive(utils.IsShowSensitive(c, "show_sensitive")))
}

// qrMaxBytes 二维码 data URL 上限(图片小图;过大说明传错了)。
const qrMaxBytes = 300 * 1024

// UpdateConfig PUT /admin/support-center/config —— 敏感字段空/遮罩=保留旧值(service 层处理)。
func (h *Handler) UpdateConfig(c *gin.Context) {
	var in SupportCenterConfig
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.BadRequest(c, "参数格式错误")
		return
	}
	if len(in.WecomQR) > qrMaxBytes || len(in.FeishuQR) > qrMaxBytes {
		utils.BadRequest(c, "二维码图片过大(请压缩到 300KB 以内)")
		return
	}
	// 飞书 webhook 地址早筛(防 SSRF;空/遮罩 = 保留旧值由 service 处理,不在此校验)。
	if raw := strings.TrimSpace(in.FeishuWebhookURL); raw != "" && raw != utils.MaskedSecretValue {
		if err := httpclient.ValidateOutboundURL(raw); err != nil {
			utils.BadRequest(c, "飞书 webhook 地址无效:"+err.Error())
			return
		}
	}
	if err := h.svc.UpdateConfig(&in); err != nil {
		slog.Error("supportcenter: update config failed", "err", err)
		utils.ServerError(c, "保存配置失败")
		return
	}
	utils.SuccessWithMessage(c, "已保存", nil)
}

// TestFeishu POST /admin/support-center/feishu/test —— 用已保存配置发测试消息。
func (h *Handler) TestFeishu(c *gin.Context) {
	if err := h.svc.TestFeishu(); err != nil {
		utils.BadRequest(c, "飞书测试失败:"+err.Error())
		return
	}
	utils.SuccessWithMessage(c, "已发送,请到飞书群查看", nil)
}

// TestSMTP POST /admin/support-center/smtp/test —— 用已保存的客服发信配置给自己发测试邮件。
func (h *Handler) TestSMTP(c *gin.Context) {
	if err := h.svc.TestSMTP(); err != nil {
		utils.BadRequest(c, "发信测试失败:"+err.Error())
		return
	}
	utils.SuccessWithMessage(c, "已发送,请到客服邮箱查收", nil)
}

// TestIMAP POST /admin/support-center/imap/test —— 用已保存配置连一次。
func (h *Handler) TestIMAP(c *gin.Context) {
	count, err := h.svc.TestIMAP()
	if err != nil {
		utils.BadRequest(c, "IMAP 连接失败:"+err.Error())
		return
	}
	utils.SuccessWithMessage(c, "连接成功", gin.H{"mailbox_messages": count})
}

// PollNow POST /admin/support-center/imap/poll —— 手动立即拉取一轮。
func (h *Handler) PollNow(c *gin.Context) {
	n, err := h.svc.PollOnce()
	if err != nil {
		utils.BadRequest(c, "拉取失败:"+err.Error())
		return
	}
	utils.SuccessWithMessage(c, "拉取完成", gin.H{"new_mails": n})
}

// ─── admin:收件箱 ────────────────────────────────────────────────────────

// ListInbox GET /admin/support-center/inbox?status=&keyword=&page=&page_size=
func (h *Handler) ListInbox(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	rows, total, err := h.svc.repo.ListInbox(c.Query("status"), c.Query("keyword"), pageSize, (page-1)*pageSize)
	if err != nil {
		utils.ServerError(c, "获取收件箱失败")
		return
	}
	unread, _ := h.svc.repo.CountUnread()
	utils.Success(c, gin.H{"items": rows, "total": total, "unread": unread})
}

// GetInboxMail GET /admin/support-center/inbox/:id —— 详情(含正文),顺手 unread→read。
func (h *Handler) GetInboxMail(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "参数错误")
		return
	}
	m, err := h.svc.repo.GetInbox(id)
	if err != nil {
		utils.BadRequest(c, "邮件不存在")
		return
	}
	_ = h.svc.repo.MarkReadIfUnread(id)
	utils.Success(c, m)
}

// ReplyInbox POST /admin/support-center/inbox/:id/reply {subject?, body}
func (h *Handler) ReplyInbox(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "参数错误")
		return
	}
	var req struct {
		Subject string `json:"subject"`
		Body    string `json:"body" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "回复内容不能为空")
		return
	}
	if err := h.svc.ReplyInbox(id, req.Subject, req.Body); err != nil {
		utils.BadRequest(c, "发送失败:"+err.Error())
		return
	}
	utils.SuccessWithMessage(c, "已回复", nil)
}

// Compose POST /admin/support-center/compose {to, subject, body} —— 主动写信。
func (h *Handler) Compose(c *gin.Context) {
	var req struct {
		To      string `json:"to" binding:"required"`
		Subject string `json:"subject" binding:"required"`
		Body    string `json:"body" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "收件人 / 主题 / 正文不能为空")
		return
	}
	if err := h.svc.Compose(req.To, req.Subject, req.Body); err != nil {
		utils.BadRequest(c, "发送失败:"+err.Error())
		return
	}
	utils.SuccessWithMessage(c, "已发送", nil)
}
