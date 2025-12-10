package currency

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
)

// DeductMiddleware 扣费中间件
// 用法: router.POST("/api", currencyMiddleware.Deduct("peer_review"), handler)
type DeductMiddleware struct {
	service *Service
}

// NewDeductMiddleware 创建扣费中间件
func NewDeductMiddleware(service *Service) *DeductMiddleware {
	return &DeductMiddleware{service: service}
}

// Deduct 创建扣费中间件（根据业务类型自动扣费）
func (m *DeductMiddleware) Deduct(bizType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. 获取用户ID
		userID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 4001, "message": "请先登录"})
			c.Abort()
			return
		}

		// 2. 获取扣费配置
		config, err := m.service.GetDeductConfig(bizType)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5001, "message": "获取扣费配置失败"})
			c.Abort()
			return
		}

		// 3. 没有配置或金额为0，跳过扣费
		if config == nil || config.Amount == 0 {
			c.Next()
			return
		}

		// 4. 检查余额
		checkResult, err := m.service.CheckBalance(userID.(uint), config.CurrencyType, config.Amount)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5002, "message": "检查余额失败"})
			c.Abort()
			return
		}

		if !checkResult.Sufficient {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"code":    4020,
				"message": "余额不足",
				"data": gin.H{
					"currency_type": config.CurrencyType,
					"balance":       checkResult.Balance,
					"required":      checkResult.Required,
					"shortage":      checkResult.Shortage,
				},
			})
			c.Abort()
			return
		}

		// 5. 执行扣费
		ctx := context.Background()
		bizID := c.GetString("biz_id") // 可选，从上下文获取业务ID
		transaction, err := m.service.Deduct(ctx, userID.(uint), &DeductRequest{
			CurrencyType: config.CurrencyType,
			Amount:       config.Amount,
			BizType:      bizType,
			BizID:        bizID,
			Description:  config.Description,
		})

		if err != nil {
			if err == ErrInsufficientBalance {
				c.JSON(http.StatusPaymentRequired, gin.H{"code": 4020, "message": "余额不足"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5003, "message": "扣费失败: " + err.Error()})
			}
			c.Abort()
			return
		}

		// 6. 将交易信息存入上下文（供后续使用或退款）
		c.Set("currency_transaction", transaction)
		c.Set("currency_transaction_no", transaction.TransactionNo)

		c.Next()
	}
}

// DeductByModelLevel 根据模型级别动态扣费
// bizTypePrefix 是业务类型前缀，如 "ai_chat" 或 "smart_analysis"
// 会根据请求中的 model_level 参数拼接成完整的 bizType，如 "ai_chat_low", "ai_chat_mid", "ai_chat_high"
// 支持从 query 参数、JSON body 或 context 中获取 model_level
func (m *DeductMiddleware) DeductByModelLevel(bizTypePrefix string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. 获取用户ID
		userID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 4001, "message": "请先登录"})
			c.Abort()
			return
		}

		// 2. 获取模型级别（优先级：query > context）
		modelLevel := c.Query("model_level")
		if modelLevel == "" {
			// 尝试从context中获取（需要前置中间件设置）
			if ml, exists := c.Get("model_level"); exists {
				modelLevel = ml.(string)
			}
		}

		// 默认使用 low 级别
		if modelLevel == "" {
			modelLevel = "low"
		}

		// 验证模型级别
		if modelLevel != "low" && modelLevel != "mid" && modelLevel != "high" {
			modelLevel = "low"
		}

		// 3. 拼接完整的业务类型
		bizType := bizTypePrefix + "_" + modelLevel

		// 4. 获取扣费配置
		config, err := m.service.GetDeductConfig(bizType)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5001, "message": "获取扣费配置失败"})
			c.Abort()
			return
		}

		// 5. 没有配置或金额为0，跳过扣费
		if config == nil || config.Amount == 0 {
			c.Next()
			return
		}

		// 6. 检查余额
		checkResult, err := m.service.CheckBalance(userID.(uint), config.CurrencyType, config.Amount)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5002, "message": "检查余额失败"})
			c.Abort()
			return
		}

		if !checkResult.Sufficient {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"code":    4020,
				"message": "余额不足",
				"data": gin.H{
					"currency_type": config.CurrencyType,
					"balance":       checkResult.Balance,
					"required":      checkResult.Required,
					"shortage":      checkResult.Shortage,
				},
			})
			c.Abort()
			return
		}

		// 7. 执行扣费
		ctx := context.Background()
		bizID := c.GetString("biz_id")
		transaction, err := m.service.Deduct(ctx, userID.(uint), &DeductRequest{
			CurrencyType: config.CurrencyType,
			Amount:       config.Amount,
			BizType:      bizType,
			BizID:        bizID,
			Description:  config.Description,
		})

		if err != nil {
			if err == ErrInsufficientBalance {
				c.JSON(http.StatusPaymentRequired, gin.H{"code": 4020, "message": "余额不足"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5003, "message": "扣费失败: " + err.Error()})
			}
			c.Abort()
			return
		}

		// 8. 将交易信息存入上下文
		c.Set("currency_transaction", transaction)
		c.Set("currency_transaction_no", transaction.TransactionNo)

		c.Next()
	}
}

// CheckBalance 创建余额检查中间件（只检查不扣费）
func (m *DeductMiddleware) CheckBalance(bizType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 4001, "message": "请先登录"})
			c.Abort()
			return
		}

		config, err := m.service.GetDeductConfig(bizType)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5001, "message": "获取扣费配置失败"})
			c.Abort()
			return
		}

		if config == nil || config.Amount == 0 {
			c.Next()
			return
		}

		checkResult, err := m.service.CheckBalance(userID.(uint), config.CurrencyType, config.Amount)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5002, "message": "检查余额失败"})
			c.Abort()
			return
		}

		if !checkResult.Sufficient {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"code":    4020,
				"message": "余额不足",
				"data": gin.H{
					"currency_type": config.CurrencyType,
					"balance":       checkResult.Balance,
					"required":      checkResult.Required,
					"shortage":      checkResult.Shortage,
				},
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

