package currency

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

// DeductMiddleware 扣费中间件
// 用法: router.POST("/api", currencyMiddleware.DeductAfterSuccess("peer_review"), handler)
type DeductMiddleware struct {
	service *Service
}

// NewDeductMiddleware 创建扣费中间件
func NewDeductMiddleware(service *Service) *DeductMiddleware {
	return &DeductMiddleware{service: service}
}

// Deduct 创建扣费中间件（先检查余额，成功响应后再扣费）
// 扣费时机：handler 执行完成且响应状态码为 2xx 时才扣费
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

		// 3. 没有配置或金额为0，跳过扣费检查
		if config == nil || config.Amount == 0 {
			c.Next()
			return
		}

		// 4. 检查余额（先检查，不扣费）
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

		// 5. 将扣费信息存入上下文，供后续扣费使用
		c.Set("deduct_user_id", userID.(uint))
		c.Set("deduct_config", config)
		c.Set("deduct_biz_type", bizType)

		// 6. 执行 handler
		c.Next()

		// 7. 检查响应状态，只有成功时才扣费
		if c.Writer.Status() >= 200 && c.Writer.Status() < 300 {
			// 检查是否已经被标记为跳过扣费（某些情况下handler可能需要跳过）
			if skipDeduct, exists := c.Get("skip_deduct"); exists && skipDeduct.(bool) {
				return
			}

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
				// 扣费失败只记录日志，不影响已成功的响应
				fmt.Printf("[Currency] Deduct failed after success: userID=%d, bizType=%s, err=%v\n", userID.(uint), bizType, err)
			} else {
				fmt.Printf("[Currency] Deduct success: userID=%d, bizType=%s, amount=%d, txNo=%s\n", userID.(uint), bizType, config.Amount, transaction.TransactionNo)
			}
		}
	}
}

// DeductByModelLevel 根据模型级别动态扣费（先检查余额，成功响应后再扣费）
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

		// 5. 没有配置或金额为0，跳过扣费检查
		if config == nil || config.Amount == 0 {
			c.Next()
			return
		}

		// 6. 检查余额（先检查，不扣费）
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

		// 7. 将扣费信息存入上下文，供后续扣费使用
		c.Set("deduct_user_id", userID.(uint))
		c.Set("deduct_config", config)
		c.Set("deduct_biz_type", bizType)

		// 8. 执行 handler
		c.Next()

		// 9. 检查响应状态，只有成功时才扣费
		if c.Writer.Status() >= 200 && c.Writer.Status() < 300 {
			// 检查是否已经被标记为跳过扣费
			if skipDeduct, exists := c.Get("skip_deduct"); exists && skipDeduct.(bool) {
				return
			}

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
				// 扣费失败只记录日志，不影响已成功的响应
				fmt.Printf("[Currency] DeductByModelLevel failed after success: userID=%d, bizType=%s, err=%v\n", userID.(uint), bizType, err)
			} else {
				fmt.Printf("[Currency] DeductByModelLevel success: userID=%d, bizType=%s, amount=%d, txNo=%s\n", userID.(uint), bizType, config.Amount, transaction.TransactionNo)
			}
		}
	}
}

// DeductOncePerBizID 创建去重扣费中间件（同一 bizType + bizID 只扣一次费）
// bizIDKey: 从请求中获取 bizID 的字段名（支持 JSON body 和 query 参数）
// 适用于多维分析等场景，同一篇论文只扣一次费
// 注意：对于需要结合其他因素（如维度哈希）的场景，应使用 DeductWithDynamicBizID
func (m *DeductMiddleware) DeductOncePerBizID(bizType, bizIDKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. 获取用户ID
		userID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 4001, "message": "请先登录"})
			c.Abort()
			return
		}

		// 2. 获取 bizID（优先从 JSON body，其次从 query）
		var bizID string
		
		// 读取并缓存 body，以便后续 handler 可以重新读取
		bodyBytes, err := io.ReadAll(c.Request.Body)
		if err == nil && len(bodyBytes) > 0 {
			// 恢复 body 以供后续 handler 使用
			c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
			
			// 尝试从 JSON body 获取 bizID
			var bodyMap map[string]interface{}
			if err := json.Unmarshal(bodyBytes, &bodyMap); err == nil {
				if val, ok := bodyMap[bizIDKey]; ok {
					bizID = fmt.Sprintf("%v", val)
				}
			}
		}
		
		// 如果 body 中没有，尝试从 query 获取
		if bizID == "" {
			bizID = c.Query(bizIDKey)
		}

		// 3. 获取扣费配置
		config, err := m.service.GetDeductConfig(bizType)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5001, "message": "获取扣费配置失败"})
			c.Abort()
			return
		}

		// 4. 没有配置或金额为0，跳过扣费检查
		if config == nil || config.Amount == 0 {
			c.Next()
			return
		}

		// 5. 检查是否已经扣过费（基于 bizType + bizID 去重）
		if bizID != "" {
			fullBizID := fmt.Sprintf("%s_%s", bizType, bizID)
			alreadyDeducted, err := m.service.HasDeducted(userID.(uint), bizType, fullBizID)
			if err != nil {
				fmt.Printf("[Currency] Check deduction failed: userID=%d, bizType=%s, bizID=%s, err=%v\n", userID.(uint), bizType, fullBizID, err)
			} else if alreadyDeducted {
				// 已扣过费，跳过扣费但继续执行 handler
				fmt.Printf("[Currency] Already deducted, skip: userID=%d, bizType=%s, bizID=%s\n", userID.(uint), bizType, fullBizID)
				c.Set("skip_deduct", true)
				c.Set("biz_id", fullBizID)
				c.Next()
				return
			}
		}

		// 6. 检查余额（先检查，不扣费）
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

		// 7. 将扣费信息存入上下文
		fullBizID := ""
		if bizID != "" {
			fullBizID = fmt.Sprintf("%s_%s", bizType, bizID)
		}
		c.Set("deduct_user_id", userID.(uint))
		c.Set("deduct_config", config)
		c.Set("deduct_biz_type", bizType)
		c.Set("biz_id", fullBizID)

		// 8. 执行 handler
		c.Next()

		// 9. 检查响应状态，只有成功时才扣费
		if c.Writer.Status() >= 200 && c.Writer.Status() < 300 {
			// 检查是否已经被标记为跳过扣费
			if skipDeduct, exists := c.Get("skip_deduct"); exists && skipDeduct.(bool) {
				return
			}

			ctx := context.Background()
			transaction, err := m.service.Deduct(ctx, userID.(uint), &DeductRequest{
				CurrencyType: config.CurrencyType,
				Amount:       config.Amount,
				BizType:      bizType,
				BizID:        fullBizID,
				Description:  config.Description,
			})

			if err != nil {
				fmt.Printf("[Currency] DeductOncePerBizID failed after success: userID=%d, bizType=%s, bizID=%s, err=%v\n", userID.(uint), bizType, fullBizID, err)
			} else {
				fmt.Printf("[Currency] DeductOncePerBizID success: userID=%d, bizType=%s, bizID=%s, amount=%d, txNo=%s\n", userID.(uint), bizType, fullBizID, config.Amount, transaction.TransactionNo)
			}
		}
	}
}

// DeductAfterWithDynamicBizID 创建动态去重扣费中间件
// handler 需要在处理过程中设置 c.Set("deduct_biz_id", bizID) 来指定去重的业务ID
// 适用于需要结合多个因素（如 paperId + dimensionHash）生成 bizID 的场景
// 如果 handler 未设置 deduct_biz_id，则每次都扣费（不去重）
func (m *DeductMiddleware) DeductAfterWithDynamicBizID(bizType string) gin.HandlerFunc {
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

		// 3. 没有配置或金额为0，跳过扣费检查
		if config == nil || config.Amount == 0 {
			c.Next()
			return
		}

		// 4. 检查余额（先检查，不扣费）
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

		// 5. 将扣费信息存入上下文
		c.Set("deduct_user_id", userID.(uint))
		c.Set("deduct_config", config)
		c.Set("deduct_biz_type", bizType)

		// 6. 执行 handler
		c.Next()

		// 7. 检查响应状态，只有成功时才扣费
		if c.Writer.Status() >= 200 && c.Writer.Status() < 300 {
			// 检查是否已经被标记为跳过扣费（handler 可能已经判断过）
			if skipDeduct, exists := c.Get("skip_deduct"); exists && skipDeduct.(bool) {
				return
			}

			// 获取 handler 设置的动态 bizID
			bizID := ""
			if bid, exists := c.Get("deduct_biz_id"); exists {
				bizID = bid.(string)
			}

			// 如果有 bizID，检查是否已经扣过费
			if bizID != "" {
				alreadyDeducted, err := m.service.HasDeducted(userID.(uint), bizType, bizID)
				if err != nil {
					fmt.Printf("[Currency] Check deduction failed: userID=%d, bizType=%s, bizID=%s, err=%v\n", userID.(uint), bizType, bizID, err)
				} else if alreadyDeducted {
					fmt.Printf("[Currency] Already deducted, skip: userID=%d, bizType=%s, bizID=%s\n", userID.(uint), bizType, bizID)
					return
				}
			}

			// 执行扣费
			ctx := context.Background()
			transaction, err := m.service.Deduct(ctx, userID.(uint), &DeductRequest{
				CurrencyType: config.CurrencyType,
				Amount:       config.Amount,
				BizType:      bizType,
				BizID:        bizID,
				Description:  config.Description,
			})

			if err != nil {
				fmt.Printf("[Currency] DeductAfterWithDynamicBizID failed: userID=%d, bizType=%s, bizID=%s, err=%v\n", userID.(uint), bizType, bizID, err)
			} else {
				fmt.Printf("[Currency] DeductAfterWithDynamicBizID success: userID=%d, bizType=%s, bizID=%s, amount=%d, txNo=%s\n", userID.(uint), bizType, bizID, config.Amount, transaction.TransactionNo)
			}
		}
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

