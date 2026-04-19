// ============================================================================
// Scholay学术 V1.0
// 配置 Handler - 公共小工具：敏感字段遮罩、空值保留、回调 URL 规范化
// ============================================================================

package config

import (
	"strings"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

const maskedSecretValue = "********"

// maskSecret 若 show=false 且字段非空，则替换为掩码；否则原样返回指针指向的值
func maskSecret(field *string, show bool) {
	if !show && field != nil && *field != "" {
		*field = maskedSecretValue
	}
}

// isShowSensitive 统一读取 ?show_sensitive=true / ?show_password=true / ?show_secret=true
func isShowSensitive(c *gin.Context, queryKey string) bool {
	return c.Query(queryKey) == "true"
}

// normalizeCallbackURL 确保回调 URL 以给定 suffix 结尾；空串不处理
func normalizeCallbackURL(raw, suffix string) string {
	if raw == "" || strings.HasSuffix(raw, suffix) {
		return raw
	}
	return strings.TrimSuffix(raw, "/") + suffix
}

// preserveSecretOnEmpty 在更新配置时处理“空值保留旧密钥”的通用逻辑。
//
//	newValue       用户提交的密钥（可能为空）
//	existingValue  数据库中已有的值（如果 configExists 为 false，则该值忽略）
//	configExists   数据库是否存在既有配置
//	c              gin 上下文（仅用于回写错误响应）
//	fieldLabel     错误信息里的字段名，例如 "Client Secret"
//
// 返回最终应写入的值；若返回 ok=false，调用方应立即 return（错误已写入响应）。
func preserveSecretOnEmpty(c *gin.Context, newValue, existingValue string, configExists bool, fieldLabel string) (string, bool) {
	if newValue != "" {
		return newValue, true
	}
	if configExists {
		return existingValue, true
	}
	utils.BadRequest(c, fieldLabel+" is required for new configuration")
	return "", false
}
