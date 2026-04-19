// ============================================================================
// Scholay学术 V1.0
// bootstrap.go 中可独立抽出的领域初始化辅助
// 原则：只抽纯构造 + 同域注入，不跨域；跨域的 Set* 注入仍留在 bootstrapServices
// ============================================================================

package main

import (
	"gorm.io/gorm"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/payment"
	"scholar-backend/internal/wechat"
	"scholar-backend/internal/wechatofficial"
)

// initPaymentHandlers 支付域（支付宝 + 微信支付）
func initPaymentHandlers(db *gorm.DB) (*payment.AlipayHandler, *payment.WeChatPayHandler) {
	alipayService := payment.NewAlipayService(db)
	alipayHandler := payment.NewAlipayHandler(alipayService, nil)

	wechatPayRepo := payment.NewWeChatPayRepository(db)
	wechatPayService := payment.NewWeChatPayService(wechatPayRepo)
	wechatPayHandler := payment.NewWeChatPayHandler(wechatPayService, nil)

	return alipayHandler, wechatPayHandler
}

// initWeChatDomain 微信域（小程序 + 公众号）
// 返回 service 方便需要进一步 adapter 封装的调用方使用
func initWeChatDomain(db *gorm.DB, aiService *ai.Service) (
	*wechat.Service,
	*wechat.Handler,
	*wechatofficial.Handler,
) {
	wechatService := wechat.NewService(db)
	wechatHandler := wechat.NewHandler(db)

	wechatOfficialService := wechatofficial.NewService(db, aiService)
	wechatOfficialHandler := wechatofficial.NewHandler(wechatOfficialService)

	return wechatService, wechatHandler, wechatOfficialHandler
}
