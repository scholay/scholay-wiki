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

// initPaymentHandlers 支付域（支付宝 + 微信支付）。
// orderSvc 实现 payment.OrderServiceInterface（充值/订阅履约), 由 vip.Service.Order() 提供;
// 传 nil 则支付功能不可用(回调不入账)。
func initPaymentHandlers(db *gorm.DB, orderSvc payment.OrderServiceInterface) (*payment.AlipayHandler, *payment.WeChatPayHandler) {
	alipayService := payment.NewAlipayService(db)
	alipayHandler := payment.NewAlipayHandler(alipayService, orderSvc)

	wechatPayRepo := payment.NewWeChatPayRepository(db)
	wechatPayService := payment.NewWeChatPayService(wechatPayRepo)
	wechatPayHandler := payment.NewWeChatPayHandler(wechatPayService, orderSvc)

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
