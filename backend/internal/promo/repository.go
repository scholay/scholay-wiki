// ============================================================================
// 限时领取会员推广(Promo)—— 数据访问。
// ============================================================================

package promo

import (
	"errors"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// GetConfig 取单行配置;迁移已 seed id=1,记录不存在时兜底空配置(不报错)。
func (r *Repository) GetConfig() (*PromoConfig, error) {
	var c PromoConfig
	if err := r.db.First(&c).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &PromoConfig{ID: 1}, nil
		}
		return nil, err
	}
	return &c, nil
}

// UpdateConfig 全量更新单行(map 指定字段,避免 gorm 跳零值导致开关关不掉)。
func (r *Repository) UpdateConfig(c *PromoConfig) error {
	return r.db.Model(&PromoConfig{}).Where("id = ?", 1).Updates(map[string]any{
		"enabled":     c.Enabled,
		"title":       c.Title,
		"subtitle":    c.Subtitle,
		"benefits":    c.Benefits,
		"button_text": c.ButtonText,
		"wechat_qr":   c.WechatQR,
	}).Error
}
