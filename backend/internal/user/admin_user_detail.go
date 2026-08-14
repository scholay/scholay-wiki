package user

import "time"

// adminUserAuthProviderView is the deliberately narrow auth-provider shape
// exposed to administrators. Provider identifiers and provider_data can contain
// third-party account identifiers/tokens and must never cross this boundary.
type adminUserAuthProviderView struct {
	Provider  string    `json:"provider"`
	CreatedAt time.Time `json:"created_at"`
}

// adminUserDetailView is the explicit response contract for
// GET /admin/users/:id/detail.
//
// Keep this DTO separate from the GORM model: User and UserAuthProvider contain
// storage-only fields (password hash, legacy admin id and third-party identity
// data) that must not become API fields when either model changes in the future.
type adminUserDetailView struct {
	ID             uint                        `json:"id"`
	Username       *string                     `json:"username"`
	Email          *string                     `json:"email"`
	Phone          *string                     `json:"phone"`
	AvatarURL      *string                     `json:"avatar_url"`
	Bio            *string                     `json:"bio"`
	Role           string                      `json:"role"`
	Status         int8                        `json:"status"`
	FrozenAt       *time.Time                  `json:"frozen_at"`
	FrozenReason   string                      `json:"frozen_reason"`
	AdminNotes     string                      `json:"admin_notes"`
	EmailVerified  bool                        `json:"email_verified"`
	PhoneVerified  bool                        `json:"phone_verified"`
	LastLoginAt    *time.Time                  `json:"last_login_at"`
	LastLoginIP    *string                     `json:"last_login_ip"`
	LastActiveAt   *time.Time                  `json:"last_active_at"`
	VIPTier        *string                     `json:"vip_tier"`
	VIPExpiresAt   *time.Time                  `json:"vip_expires_at"`
	RegisterSource string                      `json:"register_source"`
	CreatedAt      time.Time                   `json:"created_at"`
	UpdatedAt      time.Time                   `json:"updated_at"`
	AuthProviders  []adminUserAuthProviderView `json:"auth_providers"`
}

// toAdminUserDetailView is a pure allow-list mapping. In particular, do not
// replace this with returning User/UserAuthProvider directly.
func toAdminUserDetailView(u User, providers []UserAuthProvider) adminUserDetailView {
	providerViews := make([]adminUserAuthProviderView, 0, len(providers))
	for _, provider := range providers {
		providerViews = append(providerViews, adminUserAuthProviderView{
			Provider:  provider.Provider,
			CreatedAt: provider.CreatedAt,
		})
	}

	return adminUserDetailView{
		ID:             u.ID,
		Username:       u.Username,
		Email:          u.Email,
		Phone:          u.Phone,
		AvatarURL:      u.AvatarURL,
		Bio:            u.Bio,
		Role:           u.Role,
		Status:         u.Status,
		FrozenAt:       u.FrozenAt,
		FrozenReason:   u.FrozenReason,
		AdminNotes:     u.AdminNotes,
		EmailVerified:  u.EmailVerified,
		PhoneVerified:  u.PhoneVerified,
		LastLoginAt:    u.LastLoginAt,
		LastLoginIP:    u.LastLoginIP,
		LastActiveAt:   u.LastActiveAt,
		VIPTier:        u.VIPTier,
		VIPExpiresAt:   u.VIPExpiresAt,
		RegisterSource: u.RegisterSource,
		CreatedAt:      u.CreatedAt,
		UpdatedAt:      u.UpdatedAt,
		AuthProviders:  providerViews,
	}
}
