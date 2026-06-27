// ============================================================================
// Scholay学术 V1.0
// OAuth「绑定到现有账号」的共享冲突校验。
//
// 登录路径(findOrCreateOAuthUser)早已收口,但「绑定到当前登录账号」路径没有 ——
// github/google/orcid/microsoft/apple/discourse 各自重写了同一段「查现有绑定 → 跨用户
// 冲突则拒绝」的逻辑,且文案漂移(github/discourse 中文、google/microsoft/orcid/apple 英文)。
//
// 跨用户冲突是账号窃取防线(把别人已绑的第三方身份绑到自己名下 = 越权),文案必须统一且
// 可被识别。这里把这一步收口;各 provider 自身的「是否允许重绑自己 / 是否 create-or-update /
// 用何种响应壳(JSON / redirect)」策略仍由各 provider 保留 —— 那些是真实的业务差异,不强行统一。
// ============================================================================

package user

import (
	"errors"
	"fmt"

	"gorm.io/gorm"
)

// ErrOAuthBoundToOther 第三方账号已被另一个用户绑定 —— 跨 provider 统一文案 + 哨兵类型。
var ErrOAuthBoundToOther = errors.New("该第三方账号已被其他账号绑定")

// oauthBindConflict 查 (provider, providerUserID) 的现有绑定,判断能否被 userID 绑定:
//   - 未被任何人绑定         → (false, nil)
//   - 已绑到本人 userID      → (true, nil)   调用方按自身策略决定「幂等成功」或「提示已绑定」
//   - 已绑到其他用户         → (false, ErrOAuthBoundToOther)
//   - DB 错误(非 NotFound)→ (false, wrapped err)
func (h *Handler) oauthBindConflict(userID uint, provider, providerUserID string) (boundToSelf bool, err error) {
	existing, err := h.service.FindAuthProvider(provider, providerUserID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return false, fmt.Errorf("find auth provider: %w", err)
	}
	if existing == nil {
		return false, nil
	}
	if existing.UserID == userID {
		return true, nil
	}
	return false, ErrOAuthBoundToOther
}
