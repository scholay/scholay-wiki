// 邮件记录 HTTP handler —— 管理端列表 + 概览统计。
package emaillog

import (
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// AdminList GET /admin/email-logs?channel=&status=&category=&search=&page=&page_size= —— 分页列表 + 概览。
// channel=email|sms 区分邮件/短信(前端两个 tab);概览统计也按 channel 过滤。
func (h *Handler) AdminList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "30"))
	channel := c.Query("channel")
	items, total, err := h.svc.List(Filter{
		Channel:  channel,
		Status:   c.Query("status"),
		Category: c.Query("category"),
		Search:   c.Query("search"),
	}, page, pageSize)
	if err != nil {
		utils.ServerError(c, "获取发送记录失败")
		return
	}
	totalAll, success, failed, _ := h.svc.Stats(channel)
	utils.Success(c, gin.H{
		"logs":  items,
		"total": total,
		"stats": gin.H{"total": totalAll, "success": success, "failed": failed},
	})
}
