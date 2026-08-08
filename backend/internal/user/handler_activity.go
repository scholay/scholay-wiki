package user

import (
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// RecordActivity 只接受已鉴权用户的显式活跃事件。
// 时间由服务端生成,请求体刻意为空,避免客户端伪造/回拨 last_active_at。
func (h *Handler) RecordActivity(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	if err := h.service.RecordActivity(c.Request.Context(), userID); err != nil {
		utils.InternalServerError(c, "记录用户活跃失败,请稍后重试", err)
		return
	}

	utils.Success(c, nil)
}
