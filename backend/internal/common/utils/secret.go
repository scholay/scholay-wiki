// ============================================================================
// Scholay学术 V1.0
// 敏感字段(密钥 / 密码 / token) 在 admin 后台的统一处理:
//
//   - 展示时遮罩 (MaskSecret + IsShowSensitive 配合 ?show_sensitive=true 解蔽)
//   - 更新时"留空保留旧值"(PreserveSecretOnEmpty), 关键的反 bug 点:
//       *** 同时把遮罩字符串识别为"保留旧值" ***
//     —— 否则前端 GET 拿到 "********" 再 PUT 回来会把它当成新密钥写库, 真正的
//     密钥就被毁了 (这是 OAuth/支付/微信/Agent 等配置最容易踩的坑)。
//
// 之前散落在 config 包内的 maskSecret / preserveSecretOnEmpty / isShowSensitive
// 移到这里, 所有需要敏感字段处理的模块直接 import utils 用。
// ============================================================================

package utils

import "github.com/gin-gonic/gin"

// MaskedSecretValue 是 GET 时回给前端的统一遮罩, 也是更新时被识别为"无变化"的哨兵。
// 选 "********" 与历史一致, 改这里要小心 —— 旧前端 / API 客户端可能依赖具体值。
const MaskedSecretValue = "********"

// MaskSecret 若 show=false 且字段非空, 替换为 MaskedSecretValue; 否则原样保留。
//
//	utils.MaskSecret(&cfg.ClientSecret, utils.IsShowSensitive(c, "show_sensitive"))
func MaskSecret(field *string, show bool) {
	if !show && field != nil && *field != "" {
		*field = MaskedSecretValue
	}
}

// IsShowSensitive 统一读取 admin 端 ?show_sensitive=true / ?show_password=true /
// ?show_secret=true 等开关。前端"查询"按钮就是给 URL 拼这一个 query。
func IsShowSensitive(c *gin.Context, queryKey string) bool {
	return c.Query(queryKey) == "true"
}

// PreserveSecretOnEmpty 处理"更新配置时密钥字段留空 / 仍是遮罩 → 保留旧值"的通用逻辑。
//
//   - newValue        前端提交的新密钥值; 可能是 ""(用户没动) 也可能是 "********"(用户没动)
//   - existingValue   DB 已有的真实值 (configExists=false 时忽略)
//   - configExists    DB 是否已有这条配置
//   - c               gin 上下文 (新建配置缺密钥时直接回 400)
//   - fieldLabel      错误消息里的字段名, 如 "Client Secret"
//
// 返回 (最终入库的值, ok)。ok=false 时调用方应立即 return; 错误响应已经写过了。
//
// 关键: newValue 是 "" **或** MaskedSecretValue 都被视为"用户没改", 保留旧值。
// 之前只判 "" 会导致前端拿着 GET 的遮罩值 PUT 回来时把 "********" 当真密钥存库。
func PreserveSecretOnEmpty(c *gin.Context, newValue, existingValue string, configExists bool, fieldLabel string) (string, bool) {
	if newValue != "" && newValue != MaskedSecretValue {
		return newValue, true
	}
	if configExists {
		return existingValue, true
	}
	BadRequest(c, fieldLabel+" is required for new configuration")
	return "", false
}

// PreserveSecretOnEmptyNoCtx 同 PreserveSecretOnEmpty, 但不写 HTTP 响应(给非 HTTP
// 路径或 service 层用); 缺密钥时返回 ok=false, 调用方自己决定怎么报错。
func PreserveSecretOnEmptyNoCtx(newValue, existingValue string, configExists bool) (string, bool) {
	if newValue != "" && newValue != MaskedSecretValue {
		return newValue, true
	}
	if configExists {
		return existingValue, true
	}
	return "", false
}
