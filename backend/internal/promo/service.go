// ============================================================================
// 限时领取会员推广(Promo)—— 业务层。
// ============================================================================

package promo

import (
	"crypto/sha256"
	"fmt"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

// GetConfig 后台读全量配置(单行)。
func (s *Service) GetConfig() (*PromoConfig, error) { return s.repo.GetConfig() }

// UpdateConfig 后台保存配置(单行)。
func (s *Service) UpdateConfig(in *PromoConfig) error { return s.repo.UpdateConfig(in) }

// GetPublic 用户端下发:关闭 → 只 enabled=false;开启 → 全部展示字段(含二维码 data URL)。
func (s *Service) GetPublic() (*PublicView, error) {
	c, err := s.repo.GetConfig()
	if err != nil {
		return nil, err
	}
	if !c.Enabled {
		return &PublicView{Enabled: false}, nil
	}
	return &PublicView{
		Enabled:    true,
		Title:      c.Title,
		Subtitle:   c.Subtitle,
		Benefits:   c.Benefits,
		ButtonText: c.ButtonText,
		WechatQR:   c.WechatQR,
	}, nil
}

const publicQRURL = "/api/v1/config/promo/qr"

// promoQRVersion 作为图片 URL 的内容版本/cache-buster。后台替换二维码
// 后 URL 必然变化；图片端点仍只做短缓存，因为数据库没有持久化历史版本。
func promoQRVersion(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", sum[:8])
}

// GetPublicSummary 下发常驻导航/弹窗控制所需的小配置，不携带大型 data URL。
func (s *Service) GetPublicSummary() (*PublicSummaryView, error) {
	c, err := s.repo.GetConfig()
	if err != nil {
		return nil, err
	}
	return makePublicSummary(c), nil
}

func makePublicSummary(c *PromoConfig) *PublicSummaryView {
	if !c.Enabled {
		return &PublicSummaryView{Enabled: false}
	}
	view := &PublicSummaryView{
		Enabled:    true,
		Title:      c.Title,
		Subtitle:   c.Subtitle,
		Benefits:   c.Benefits,
		ButtonText: c.ButtonText,
	}
	if c.WechatQR != "" {
		view.WechatQRURL = fmt.Sprintf("%s?v=%s", publicQRURL, promoQRVersion(c.WechatQR))
	}
	return view
}
