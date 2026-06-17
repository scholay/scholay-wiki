// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentconfig

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/utils"
)

// Handler agent_config 的 admin HTTP 接口 (路由前缀: /api/v1/admin/agent)。
type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// GetConfig 获取通用 agent 服务的配置。
// 默认返回打码版;?show_sensitive=true 时返回明文 (admin 编辑表单进入时调一次)。
func (h *Handler) GetConfig(c *gin.Context) {
	config, err := h.service.GetConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载配置失败,请稍后重试")
		return
	}
	if c.Query("show_sensitive") == "true" {
		utils.SuccessResponse(c, http.StatusOK, "success", config)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", config.MaskSensitiveData())
}

// UpdateConfig 全量覆盖单行配置。
// 密钥按"留空 / 仍是遮罩(MaskSensitiveData 返回 <前4>****<后4>)→ 保留旧值"。
// 之前的注释把责任推给前端 "前端要先用 ?show_sensitive=true 拿明文" —— 不够稳, 现在 server
// 自己识别遮罩, 切 enabled / 改 baseURL 时不会再洗掉真 token。
// C22: 用「精确等于当前 key 的遮罩形态」判定, 不再 strings.Contains(..., "****") ——
// 否则真 key 若恰含 "****" 子串会被误判成遮罩而静默丢弃。
func (h *Handler) UpdateConfig(c *gin.Context) {
	var config AgentConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数有误")
		return
	}
	if existing, err := h.service.GetConfig(); err == nil && existing != nil {
		if config.APIKey == "" || config.APIKey == existing.MaskSensitiveData().APIKey {
			config.APIKey = existing.APIKey
		}
	}
	if err := h.service.UpdateConfig(&config); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "保存配置失败,请稍后重试")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "Config updated successfully", gin.H{"message": "Config updated successfully"})
}
