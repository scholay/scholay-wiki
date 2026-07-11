// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 小程序配置的 admin CRUD(单行,GET/PUT)。AppSecret 走全站脱敏口径:
// 默认 ******** ,?show_sensitive=true 解蔽;PUT 时留空/仍是遮罩则保留旧值。

package wechat

import (
	"errors"
	"strings"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetMiniProgramConfig 取小程序配置(Admin only)
// GET /api/v1/admin/wechat-miniprogram/config[?show_sensitive=true]
func (h *Handler) GetMiniProgramConfig(c *gin.Context) {
	cfg, err := h.service.GetMiniProgramConfig()
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// 迁移已 seed 单行;真查不到就回空壳,前端照常渲染空表单。
			utils.Success(c, &MiniProgramConfig{ID: 1})
			return
		}
		utils.InternalError(c, 5000, "获取小程序配置失败", err)
		return
	}

	if !utils.IsShowSensitive(c, "show_sensitive") && cfg.AppSecret != "" {
		cfg.AppSecret = utils.MaskedSecretValue
	}
	utils.Success(c, cfg)
}

// updateMiniProgramConfigRequest 小程序配置更新体。
type updateMiniProgramConfigRequest struct {
	AppID     string `json:"app_id"`
	AppSecret string `json:"app_secret"`
	Enabled   bool   `json:"enabled"`
}

// UpdateMiniProgramConfig 保存小程序配置(Admin only)
// PUT /api/v1/admin/wechat-miniprogram/config
func (h *Handler) UpdateMiniProgramConfig(c *gin.Context) {
	var req updateMiniProgramConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数有误: "+err.Error())
		return
	}

	cfg := &MiniProgramConfig{
		ID:        1,
		AppID:     req.AppID,
		AppSecret: req.AppSecret,
		Enabled:   req.Enabled,
	}

	// AppSecret 留空 / 仍是遮罩("****") → 保留旧值,避免只改开关/AppID 时把密钥洗没。
	if existing, err := h.service.GetMiniProgramConfig(); err == nil && existing != nil {
		if req.AppSecret == "" || strings.Contains(req.AppSecret, "****") {
			cfg.AppSecret = existing.AppSecret
		}
	}

	// 启用必须凭据齐全 —— 否则开了开关也换不了登录,还会误导前端显示"小程序登录已就绪"。
	if cfg.Enabled && (cfg.AppID == "" || cfg.AppSecret == "") {
		utils.BadRequest(c, "启用小程序登录前请先填好 AppID 与 AppSecret")
		return
	}

	if err := h.service.UpdateMiniProgramConfig(cfg); err != nil {
		utils.InternalError(c, 5002, "保存小程序配置失败", err)
		return
	}

	// 回吐时遮罩,不把明文密钥回给前端。
	if cfg.AppSecret != "" {
		cfg.AppSecret = utils.MaskedSecretValue
	}
	utils.Success(c, cfg)
}
