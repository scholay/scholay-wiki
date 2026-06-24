// ============================================================================
// 限时领取会员推广(Promo)—— 业务层。
// ============================================================================

package promo

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
