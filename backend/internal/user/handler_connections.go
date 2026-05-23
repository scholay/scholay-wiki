// ============================================================================
// Scholay学术 V1.0
// Handler - 当前用户的「登录方式 / 已绑定第三方」总览
// ============================================================================

package user

import (
	"encoding/json"
	"net/http"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// ConnectionItem 是单个登录方式的展示信息。
//
// 包含两类 provider:
//   - 「本地」:email / phone —— provider_user_id 就是邮箱 / 手机本身
//   - 「第三方」:github / google / wechat / apple / orcid / microsoft / discourse
//     —— provider_user_id 是各家自己的 ID,display 取 ProviderData 里的昵称
//
// `bound=false` 的项也会列出(便于前端"绑定"按钮),只是 created_at / provider_user_id 为空。
type ConnectionItem struct {
	Provider       string  `json:"provider"`
	Bound          bool    `json:"bound"`
	DisplayName    string  `json:"display_name,omitempty"`
	AvatarURL      string  `json:"avatar_url,omitempty"`
	ProviderUserID string  `json:"provider_user_id,omitempty"` // 第三方:其 ID;本地:邮箱 / 手机
	CreatedAt      *string `json:"created_at,omitempty"`
}

// 全部可能的 provider 列表 —— 前端按这个顺序渲染卡片。
var allProviders = []string{
	"email", "phone",
	"github", "google", "wechat", "apple", "orcid", "microsoft", "discourse",
}

// GetUserConnections GET /api/v1/user/connections
// 返回当前用户的「登录方式 / 第三方绑定」总览。
//
// 给账号设置 /settings/connections 页面用 —— 一次拿全所有 provider 的状态,
// 配合「绑定 / 解绑」按钮的可见性 + 解绑保护(最后一个不可解)的 UI 提示。
//
// 附带返回 login_methods_count(同后端 Service.CountLoginMethods),前端用它
// 判断「这个 unbind 按钮要不要灰掉」。
func (h *Handler) GetUserConnections(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	user, err := h.service.FindByID(userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "failed to load user")
		return
	}
	if user == nil {
		utils.ErrorResponse(c, http.StatusNotFound, "user not found")
		return
	}

	providers, err := h.service.repo.ListAuthProvidersByUser(userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "failed to load providers")
		return
	}

	// 先把已绑 provider 摊成 map,后面 allProviders 遍历时 O(1) 查找
	byProvider := make(map[string]UserAuthProvider, len(providers))
	for _, p := range providers {
		byProvider[p.Provider] = p
	}

	items := make([]ConnectionItem, 0, len(allProviders))
	for _, name := range allProviders {
		item := ConnectionItem{Provider: name}

		switch name {
		case "email":
			if user.Email != nil && *user.Email != "" {
				item.Bound = true
				item.DisplayName = *user.Email
				item.ProviderUserID = *user.Email
			}
		case "phone":
			if user.Phone != nil && *user.Phone != "" {
				item.Bound = true
				item.DisplayName = *user.Phone
				item.ProviderUserID = *user.Phone
			}
		default:
			if ap, ok := byProvider[name]; ok {
				item.Bound = true
				item.ProviderUserID = ap.ProviderUserID
				// 从 ProviderData JSON 抽 display name + avatar(各 provider 字段名不一,统一兜底)
				item.DisplayName, item.AvatarURL = extractProviderDisplay(ap.ProviderData)
				createdAt := ap.CreatedAt.Format("2006-01-02 15:04:05")
				item.CreatedAt = &createdAt
			}
		}
		items = append(items, item)
	}

	// login_methods_count:用 Service.CountLoginMethods,与解绑保护用的是同一份算法
	methodsCount, err := h.service.CountLoginMethods(userID)
	if err != nil {
		// 计数失败不致命,降级为 0 + warning,前端依然可以渲染
		methodsCount = 0
	}

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"connections":         items,
		"login_methods_count": methodsCount,
	})
}

// extractProviderDisplay 从 ProviderData JSON 抽 display name + avatar URL。
// 各 provider 存的字段名不统一(github: login/name/avatar_url,google: name/picture,
// discourse: username/name/avatar_url …),做兜底优先级:name → display_name → login
// → username → email,头像:avatar_url → picture。
func extractProviderDisplay(data *string) (display, avatar string) {
	if data == nil || *data == "" {
		return "", ""
	}
	var m map[string]string
	if err := json.Unmarshal([]byte(*data), &m); err != nil {
		return "", ""
	}
	for _, key := range []string{"name", "display_name", "login", "username", "nickname", "email"} {
		if v, ok := m[key]; ok && v != "" {
			display = v
			break
		}
	}
	for _, key := range []string{"avatar_url", "picture"} {
		if v, ok := m[key]; ok && v != "" {
			avatar = v
			break
		}
	}
	return display, avatar
}
