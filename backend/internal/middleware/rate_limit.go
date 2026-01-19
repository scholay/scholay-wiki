// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RequestCounter 记录请求计数
type RequestCounter struct {
	mu       sync.RWMutex
	requests map[string]*requestInfo
}

type requestInfo struct {
	count     int
	firstTime time.Time
	lastTime  time.Time
}

var (
	counter = &RequestCounter{
		requests: make(map[string]*requestInfo),
	}
	cleanupTicker *time.Ticker
)

func init() {
	// 每分钟清理一次过期数据
	cleanupTicker = time.NewTicker(1 * time.Minute)
	go func() {
		for range cleanupTicker.C {
			counter.cleanup()
		}
	}()
}

// cleanup 清理超过 2 分钟的记录
func (rc *RequestCounter) cleanup() {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	
	now := time.Now()
	for key, info := range rc.requests {
		if now.Sub(info.lastTime) > 2*time.Minute {
			delete(rc.requests, key)
		}
	}
}

// AntiLoopMiddleware 防止循环请求的中间件
// 如果同一个 IP 在 1 分钟内对同一个资源请求超过 30 次，则阻止
func AntiLoopMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 只检查 Semantic Scholar 相关的接口
		path := c.Request.URL.Path
		if !isSensitivePath(path) {
			c.Next()
			return
		}

		// 获取客户端 IP
		clientIP := c.ClientIP()
		
		// 生成唯一键：IP + 路径
		key := fmt.Sprintf("%s:%s", clientIP, path)
		
		counter.mu.Lock()
		info, exists := counter.requests[key]
		now := time.Now()
		
		if !exists {
			counter.requests[key] = &requestInfo{
				count:     1,
				firstTime: now,
				lastTime:  now,
			}
			counter.mu.Unlock()
			c.Next()
			return
		}
		
		// 计算时间窗口（1 分钟）
		duration := now.Sub(info.firstTime)
		if duration > 1*time.Minute {
			// 超过 1 分钟，重置计数器
			counter.requests[key] = &requestInfo{
				count:     1,
				firstTime: now,
				lastTime:  now,
			}
			counter.mu.Unlock()
			c.Next()
			return
		}
		
		// 更新计数
		info.count++
		info.lastTime = now
		
		// 检测循环：1 分钟内超过 30 次相同请求
		if info.count > 30 {
			counter.mu.Unlock()
			c.JSON(http.StatusTooManyRequests, gin.H{
				"code":    4029,
				"message": fmt.Sprintf("检测到异常请求模式，已被暂时阻止。请刷新页面后重试。(请求次数: %d 次/分钟)", info.count),
				"data": gin.H{
					"refresh_required": true,
					"blocked_until":    now.Add(1 * time.Minute).Unix(),
				},
			})
			c.Abort()
			return
		}
		
		counter.mu.Unlock()
		c.Next()
	}
}

// isSensitivePath 判断是否是敏感路径（容易被循环请求）
func isSensitivePath(path string) bool {
	sensitivePaths := []string{
		"/api/v1/public/papers/search",
		"/api/v1/public/papers/batch",
		"/api/v1/public/search/suggestions",
		"/api/v1/scholar/authors/",
		"/api/v1/scholar/papers/",
	}
	
	for _, sp := range sensitivePaths {
		if len(path) >= len(sp) && path[:len(sp)] == sp {
			return true
		}
	}
	
	return false
}
