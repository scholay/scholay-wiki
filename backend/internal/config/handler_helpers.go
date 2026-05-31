// ============================================================================
// Scholay学术 V1.0
// 配置 Handler - 公共小工具:回调 URL 规范化 + 转发包外通用助手。
//
// 敏感字段处理 (maskSecret / preserveSecretOnEmpty / isShowSensitive) 已迁到
// internal/common/utils/secret.go, 所有需要的模块直接 import utils 用。
// 包外重构时一并修复了"前端把 '********' 遮罩值 PUT 回来被当真密钥存库"的 bug。
// 包内沿用小写别名, 调用方无需改动。
// ============================================================================

package config

import (
	"strings"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// 兼容包内现有调用方: 转发到 common/utils 的新实现。
const maskedSecretValue = utils.MaskedSecretValue

func maskSecret(field *string, show bool) { utils.MaskSecret(field, show) }

func isShowSensitive(c *gin.Context, queryKey string) bool {
	return utils.IsShowSensitive(c, queryKey)
}

func preserveSecretOnEmpty(c *gin.Context, newValue, existingValue string, configExists bool, fieldLabel string) (string, bool) {
	return utils.PreserveSecretOnEmpty(c, newValue, existingValue, configExists, fieldLabel)
}

// normalizeCallbackURL 确保回调 URL 以给定 suffix 结尾;空串不处理
func normalizeCallbackURL(raw, suffix string) string {
	if raw == "" || strings.HasSuffix(raw, suffix) {
		return raw
	}
	return strings.TrimSuffix(raw, "/") + suffix
}
