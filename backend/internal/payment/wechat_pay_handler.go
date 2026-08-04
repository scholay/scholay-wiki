// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// wxNotifyLockTTL 回调**在途**锁的存活时长。
//
// 🔴 刻意只有 2 分钟,而不是覆盖微信 24 小时重试窗口的 26 小时。
// 这把锁的职责只有一个:防止同一条通知的并发投递被重复处理一遍。
// **真正的幂等保证是持久的** —— 订单行的 `status == 'paid'` 短路 + vip.fulfill 内的
// 行锁与条件 UPDATE。Redis 键不是持久真源,拿它当 24 小时的「已处理」标记有个致命后果:
// 只要释放锁那一步失败(网络抖动、ctx 已取消、Redis 重启),键就会滞留 26 小时,
// 而微信随后 15 次重试全部命中「重复」分支被 ACK 掉 —— 钱收了、订单永远不履约,
// 且系统内没有退款链路。锁短命 + 幂等交给数据库,这个失败模式就不存在了。
const wxNotifyLockTTL = 2 * time.Minute

// WeChatPayHandler 微信支付处理器。
type WeChatPayHandler struct {
	service      *WeChatPayService
	orderService OrderServiceInterface
}

// NewWeChatPayHandler 创建微信支付处理器。
func NewWeChatPayHandler(service *WeChatPayService, orderService OrderServiceInterface) *WeChatPayHandler {
	return &WeChatPayHandler{service: service, orderService: orderService}
}

// ─── 管理端:配置 CRUD ───────────────────────────────────────────────────────

// GetAllConfigs 获取所有微信支付配置。
func (h *WeChatPayHandler) GetAllConfigs(c *gin.Context) {
	showKeys := utils.IsShowSensitive(c, "show_sensitive") || c.Query("show_keys") == "true"
	configs, err := h.service.GetAllConfigs(showKeys)
	if err != nil {
		utils.InternalError(c, 3001, "加载微信支付配置失败", err)
		return
	}
	utils.Success(c, configs)
}

// GetActiveConfig 获取激活的微信支付配置。
func (h *WeChatPayHandler) GetActiveConfig(c *gin.Context) {
	config, err := h.service.GetActiveConfig()
	if err != nil {
		utils.InternalError(c, 3002, "加载激活微信支付配置失败", err)
		return
	}
	showKeys := utils.IsShowSensitive(c, "show_sensitive") || c.Query("show_keys") == "true"
	utils.Success(c, config.ToDTO(showKeys))
}

// CreateConfig 创建微信支付配置。
func (h *WeChatPayHandler) CreateConfig(c *gin.Context) {
	var dto WeChatPayConfigDTO
	if !utils.BindJSON(c, &dto) {
		return
	}
	if err := h.service.CreateConfig(&dto); err != nil {
		// 3000-3099 → HTTP 400。配置校验失败是用户输入问题,原文回显给管理员
		// (这是后台、对方是管理员,精确报错远比笼统提示有价值)。
		utils.Error(c, 3003, err.Error())
		return
	}
	utils.Success(c, gin.H{"message": "配置已保存,请点「测试配置」验证后再启用"})
}

// UpdateConfig 更新微信支付配置。
func (h *WeChatPayHandler) UpdateConfig(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	var dto WeChatPayConfigDTO
	if !utils.BindJSON(c, &dto) {
		return
	}
	if err := h.service.UpdateConfig(uint64(id), &dto); err != nil {
		utils.Error(c, 3004, err.Error())
		return
	}
	utils.Success(c, gin.H{"message": "配置已更新;凭证有改动时需重新测试并启用"})
}

// DeleteConfig 删除微信支付配置。
func (h *WeChatPayHandler) DeleteConfig(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	if err := h.service.DeleteConfig(uint64(id)); err != nil {
		utils.InternalError(c, 3005, "删除微信支付配置失败", err)
		return
	}
	utils.Success(c, gin.H{"message": "配置已删除"})
}

// ActivateConfig 激活微信支付配置。
func (h *WeChatPayHandler) ActivateConfig(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	if err := h.service.ActivateConfig(uint64(id)); err != nil {
		utils.Error(c, 3006, err.Error())
		return
	}
	utils.Success(c, gin.H{"message": "配置已启用"})
}

// TestConfig 测试配置正确性(后台「测试配置」按钮)。
//
// 🔴 无论通过与否都回 HTTP 200 + 结构化诊断。用 4xx 表达「配置有问题」会被前端的
// apiToast 失败分支吞掉响应体,管理员只能看到一句笼统提示,拿不到逐项结果。
func (h *WeChatPayHandler) TestConfig(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	// 单独给这次调用一个更宽的超时:要真的打一次微信接口。
	ctx, cancel := contextWithTimeout(c, 25*time.Second)
	defer cancel()

	result, err := h.service.TestConfig(ctx, uint64(id))
	if err != nil {
		utils.InternalError(c, 3010, "测试微信支付配置失败", err)
		return
	}
	utils.Success(c, result)
}

// ─── 用户端:下单 ───────────────────────────────────────────────────────────

// WeChatPaymentRequest 创建微信支付的请求体。
//
// 🔴 **刻意没有 Amount 字段**(2026-08-02 计费审计 P1-4)。此前它是客户端必填并被原样
// 送去微信下单,orderRecord.FinalAmount 全程没读过 —— 任意登录用户都能对自己的 ¥269
// 订单发起一笔 ¥0.01 的支付。钱会真的进商户号、订单永远 pending、系统内又没有退款链路。
// 「本单应付多少钱」只能有服务端一个真源。
type WeChatPaymentRequest struct {
	OrderNo string `json:"order_no" binding:"required"`
	// Mode 支付场景:native(默认,扫码)/ h5(手机浏览器)/ jsapi(微信内)。
	Mode string `json:"mode"`
	// OpenID jsapi 场景必填。
	OpenID string `json:"openid"`
}

// CreatePayment 创建微信支付订单。
func (h *WeChatPayHandler) CreatePayment(c *gin.Context) {
	if h.orderService == nil {
		utils.Error(c, 2000, "支付功能暂未开放")
		return
	}
	var req WeChatPaymentRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	orderRecord, err := h.orderService.GetOrderByOrderNo(req.OrderNo)
	if err != nil {
		// 2000-2099 → HTTP 400。用户侧的「订单不存在」不是服务端故障,
		// 不该走 5xxx(那会返回 HTTP 500 并自动打一条 ERROR 日志)。
		utils.Error(c, 2001, "订单不存在,请刷新后重试")
		return
	}
	if orderRecord.UserID != userID {
		utils.Error(c, 2002, "无权访问该订单")
		return
	}
	if orderRecord.Status != "pending" {
		utils.Error(c, 2003, "订单状态异常,无法支付(可能已支付或已取消)")
		return
	}

	// 金额只认订单行的 final_amount。
	amount := orderRecord.FinalAmount

	// 充值单的 PlanCode 是空的,拼出来会是「订阅套餐-」这种残句直接显示在
	// 用户的微信支付面板上。按单据类型分别取文案。
	description := "Scholay 科研经费充值"
	if strings.TrimSpace(orderRecord.PlanCode) != "" {
		description = fmt.Sprintf("Scholay 订阅-%s", orderRecord.PlanCode)
	}

	ctx, cancel := contextWithTimeout(c, 20*time.Second)
	defer cancel()

	result, err := h.service.CreatePrepay(ctx, WxPrepayParams{
		OrderNo:     req.OrderNo,
		AmountYuan:  amount,
		Description: description,
		Mode:        req.Mode,
		OpenID:      req.OpenID,
		ClientIP:    c.ClientIP(),
	})
	if err != nil {
		slog.Error("wechat-pay: create prepay failed",
			"order_no", req.OrderNo, "mode", req.Mode, "err", err)
		utils.Error(c, 2004, "创建支付失败,请稍后重试")
		return
	}

	utils.Success(c, gin.H{
		"mode":          result.Mode,
		"code_url":      result.CodeURL,
		"h5_url":        result.H5URL,
		"prepay_id":     result.PrepayID,
		"invoke_params": result.InvokeParams,
		"expires_at":    result.ExpiresAt,
		"order_no":      req.OrderNo,
		"amount":        amount,
		"timestamp":     time.Now().Unix(),
	})
}

// QueryPaymentStatus 查询订单支付状态(前端扫码后轮询用)。
//
// 顺带承担「兜底对账」:本地还是 pending 时会主动去微信查一次,查到已支付就地履约。
// 回调丢失(反代吃了请求 / 部署重启 / 回调地址临时不可达)是线上最常见的故障,
// 有了这条路径,用户自己的轮询就能把订单救回来,不必等人工介入。
func (h *WeChatPayHandler) QueryPaymentStatus(c *gin.Context) {
	if h.orderService == nil {
		utils.Error(c, 2000, "支付功能暂未开放")
		return
	}
	orderNo := c.Param("orderNo")
	if orderNo == "" {
		utils.Error(c, 2001, "缺少订单号")
		return
	}
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	orderRecord, err := h.orderService.GetOrderByOrderNo(orderNo)
	if err != nil {
		utils.Error(c, 2001, "订单不存在")
		return
	}
	if orderRecord.UserID != userID {
		utils.Error(c, 2002, "无权访问该订单")
		return
	}

	status := orderRecord.Status
	if status == "pending" {
		ctx, cancel := contextWithTimeout(c, 12*time.Second)
		defer cancel()

		if tx, qerr := h.service.QueryTransaction(ctx, orderNo); qerr != nil {
			// 查单失败不影响前端继续轮询 —— 只是这一轮没拿到网关状态。
			slog.Warn("wechat-pay: poll query failed", "order_no", orderNo, "err", qerr)
		} else if tx != nil && tx.TradeState == WxTradeStateSuccess {
			slog.Info("wechat-pay: order settled via polling fallback (callback likely lost)",
				"order_no", orderNo, "transaction_id", tx.TransactionID)
			if ferr := h.fulfill(tx); ferr != nil {
				slog.Error("wechat-pay: polling fallback fulfillment failed",
					"order_no", orderNo, "err", ferr)
			} else if fresh, rerr := h.orderService.GetOrderByOrderNo(orderNo); rerr == nil {
				status = fresh.Status
			}
		}
	}

	utils.Success(c, gin.H{
		"order_no": orderNo,
		"status":   status,
		"paid":     status == "paid",
	})
}

// ─── 回调 ────────────────────────────────────────────────────────────────────

// wxAck 回 200 + SUCCESS:告诉微信「这条通知我处理完了,别再推了」。
//
// 用于所有**永久无法再推进**的情况:已履约、重复推送、终态非成功、我们不处理的事件类型。
// 对这些回 4xx/5xx 只会换来 24 小时的无效重试。
func wxAck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": ""})
}

// wxNack 回非 200 + FAIL:请求微信按退避策略重试。
//
// 🔴 code 必须是字符串 "FAIL" —— utils.Error 的 Response.Code 是 int,
// 渲染出来是 {"code":3008},微信不认,会被当成失败并重试;
// 而我们真正想表达「别重试了」的场合又会因此重试。所以回调路径一律不用 utils.*。
// 同时绝不把内部错误原文回给微信。
func wxNack(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"code": "FAIL", "message": message})
}

// HandleNotify 处理微信支付回调。
//
// 处理顺序是安全性的一部分,不可调换:
//
//	读原始字节 → 验签(RSA,微信公钥/平台证书)→ 解密(AES-GCM,APIv3)
//	→ 断言事件类型/币种/订单归属/金额 → 去重锁 → 履约 → 应答
func (h *WeChatPayHandler) HandleNotify(c *gin.Context) {
	if h.orderService == nil {
		// 不能回 SUCCESS:否则微信不再重试,这笔钱永远不会入账。
		slog.Error("wechat-pay: callback received but order service unavailable")
		wxNack(c, http.StatusServiceUnavailable, "order service not available")
		return
	}

	// 🔴 必须先拿原始字节:v3 验签的输入是响应体的逐字节原文。
	// 老实现用 utils.BindJSON,body 被 gin 消费掉,验签在结构上就无法进行。
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		slog.Warn("wechat-pay: read callback body failed", "err", err)
		wxNack(c, http.StatusBadRequest, "read body failed")
		return
	}
	if len(raw) == 0 {
		wxNack(c, http.StatusBadRequest, "empty body")
		return
	}

	ctx := c.Request.Context()
	envelope, tx, err := h.service.VerifyNotify(ctx, raw, c.Request.Header)
	if err != nil {
		// 验签失败绝不回 SUCCESS。若是我方配置/时钟问题,让微信重试有机会自愈;
		// 若是伪造回调,401 也是正确答复。
		slog.Error("wechat-pay: callback verification failed",
			"err", err, "serial", c.Request.Header.Get("Wechatpay-Serial"), "ip", c.ClientIP())
		wxNack(c, http.StatusUnauthorized, "signature verification failed")
		return
	}

	// 事件类型必须显式判断:退款通知与支付通知信封结构相同,
	// 只看 trade_state 会把 REFUND.SUCCESS 当作付款成功而凭空发货。
	if envelope.EventType != "" && envelope.EventType != WxEventTransactionSuccess {
		slog.Info("wechat-pay: ignoring non-payment callback", "event_type", envelope.EventType)
		wxAck(c) // 我们不处理,但它是合法通知,ACK 掉避免无谓重试
		return
	}

	if tx.TradeState != WxTradeStateSuccess {
		// 终态且非成功:重试再多次也不会变。ACK。
		slog.Info("wechat-pay: callback with non-success trade state",
			"order_no", tx.OutTradeNo, "trade_state", tx.TradeState, "desc", tx.TradeStateDesc)
		wxAck(c)
		return
	}
	if tx.OutTradeNo == "" || tx.TransactionID == "" {
		slog.Error("wechat-pay: callback missing out_trade_no/transaction_id")
		wxNack(c, http.StatusBadRequest, "malformed payload")
		return
	}
	// 币种必须是人民币 —— 金额换算按分/100 做,外币会算出完全错误的元。
	if cur := tx.Amount.Currency; cur != "" && cur != "CNY" {
		slog.Error("wechat-pay: unexpected currency", "order_no", tx.OutTradeNo, "currency", cur)
		wxNack(c, http.StatusBadRequest, "unexpected currency")
		return
	}

	slog.Info("wechat-pay: callback verified",
		"order_no", tx.OutTradeNo, "transaction_id", tx.TransactionID,
		"amount_fen", tx.Amount.Total, "trade_state", tx.TradeState, "event_id", envelope.ID)

	// 在途锁:只防同一条通知的并发投递,不承担幂等职责(见 wxNotifyLockTTL 的说明)。
	// 拿不到 Redis 时 fail-open 继续处理 —— 少一层去重远好过漏一笔履约。
	rdb := cache.GetRedis()
	lockKey := "wxpay:notify:" + envelope.ID
	locked := false
	if rdb != nil && envelope.ID != "" {
		ok, serr := rdb.SetNX(ctx, lockKey, "1", wxNotifyLockTTL).Result()
		if serr == nil && !ok {
			// 同一条通知正在被另一个请求处理。**回 FAIL 让微信稍后重试**,而不是 ACK ——
			// 我们无法确认在途的那次会成功,ACK 等于替它打包票。等重试到来时,
			// 要么锁已过期、要么订单已 paid,两条路都会得到正确的最终应答。
			slog.Info("wechat-pay: callback already in flight, asking wechat to retry",
				"event_id", envelope.ID, "order_no", tx.OutTradeNo)
			wxNack(c, http.StatusConflict, "callback in flight")
			return
		}
		locked = serr == nil && ok
	}
	// 处理失败释放锁,让紧随其后的重试能立刻重新处理而不必等锁自然过期。
	//
	// 🔴 用**与请求生命周期解耦**的 ctx:走到这里往往正是因为处理超时/微信先断连,
	// 此时 c.Request.Context() 已被取消,go-redis 会在取数据库连接前就短路返回
	// context.Canceled —— DEL 根本发不出去。锁一旦滞留,后续重试全被判为在途冲突。
	releaseLock := func() {
		if !locked {
			return
		}
		dctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := rdb.Del(dctx, lockKey).Err(); err != nil {
			slog.Error("wechat-pay: release notify lock failed — 后续重试会被误判为在途冲突,"+
				"直到该键 2 分钟后自然过期", "event_id", envelope.ID, "err", err)
		}
	}

	// 订单预检:把「永远不可能成功」与「暂时失败」分开,才能选对应答。
	order, oerr := h.orderService.GetOrderByOrderNo(tx.OutTradeNo)
	if oerr != nil {
		releaseLock()
		// 🔴 必须区分「订单确实不存在」与「数据库暂时读不到」。
		// 前者重试也变不出来,ACK 止损;后者一旦 ACK,微信立刻停止重试,
		// 这笔已经收到的钱就永远不会被履约 —— 而系统内没有退款链路。
		if errors.Is(oerr, gorm.ErrRecordNotFound) {
			slog.Error("wechat-pay: PAID BUT ORDER NOT FOUND — manual reconciliation required",
				"order_no", tx.OutTradeNo, "transaction_id", tx.TransactionID,
				"amount_fen", tx.Amount.Total)
			wxAck(c)
			return
		}
		slog.Error("wechat-pay: order lookup failed, asking wechat to retry",
			"order_no", tx.OutTradeNo, "err", oerr)
		wxNack(c, http.StatusInternalServerError, "order lookup failed")
		return
	}
	if order.Status == "paid" {
		slog.Info("wechat-pay: order already paid", "order_no", tx.OutTradeNo)
		wxAck(c)
		return
	}
	// 少付直接拒绝履约(fulfill 内部也有同样的断言,这里是为了能回准确的应答)。
	if paidCents, wantCents := tx.Amount.Total, int(order.FinalAmount*100+0.5); paidCents < wantCents {
		releaseLock()
		slog.Error("wechat-pay: UNDERPAID — manual reconciliation required",
			"order_no", tx.OutTradeNo, "paid_fen", paidCents, "expected_fen", wantCents)
		wxAck(c) // 金额不对,重试也不会变
		return
	}

	if err := h.fulfill(tx); err != nil {
		releaseLock()
		slog.Error("wechat-pay: fulfillment failed, asking wechat to retry",
			"order_no", tx.OutTradeNo, "err", err)
		wxNack(c, http.StatusInternalServerError, "process failed")
		return
	}

	slog.Info("wechat-pay: payment processed", "order_no", tx.OutTradeNo)
	wxAck(c)
}

// fulfill 把一笔已确认的成功交易交给订单服务履约。
// 回调与轮询兜底两条通道都走这里,保证校验口径一致。
func (h *WeChatPayHandler) fulfill(tx *WeChatPayTransaction) error {
	amountInYuan := float64(tx.Amount.Total) / 100.0
	callbackData := map[string]any{
		"mchid":            tx.MchID,
		"appid":            tx.AppID,
		"out_trade_no":     tx.OutTradeNo,
		"transaction_id":   tx.TransactionID,
		"trade_type":       tx.TradeType,
		"trade_state":      tx.TradeState,
		"trade_state_desc": tx.TradeStateDesc,
		"bank_type":        tx.BankType,
		"success_time":     tx.SuccessTime,
		"payer_openid":     tx.Payer.OpenID,
		"amount_total":     tx.Amount.Total,
		"amount_currency":  tx.Amount.Currency,
	}
	return h.orderService.ProcessWeChatPayCallback(
		tx.OutTradeNo, tx.TransactionID, amountInYuan, callbackData)
}

// contextWithTimeout 基于请求上下文派生一个带超时的 ctx。
//
// 用 c.Request.Context() 而不是 context.Background():请求断开时应当连带取消上游调用,
// 不留下一个还在等微信应答的孤儿 goroutine。
func contextWithTimeout(c *gin.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Request.Context(), d)
}
