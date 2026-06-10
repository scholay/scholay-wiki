// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// 功能使用统计录入入口 —— 业务模块(minicod / claw / peerreview / library)
// 在用户**实际使用**功能的那一刻调一次。约束:
//   1. **不在导航/页面 mount 时调**(那只是点击菜单,不算"使用")
//   2. 在自然的业务接口被打到时调(提交搜索、发送消息、提交审稿、添加论文 ...)
//   3. 调用方负责异步 safego.Go 包裹, 不阻塞业务响应

package usagelog

import (
	"encoding/json"
	"log/slog"
	"strings"

	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"

	"github.com/gin-gonic/gin"
)

// FeatureUseEvent 一条"功能使用"事件 —— 非 HTTP 上下文(如 Claw 的 WS 钩子) 用这个直接填。
// HTTP 上下文有 gin.Context 时优先用 Service.RecordFromGin, 自动抽 IP/UA/path。
type FeatureUseEvent struct {
	UserID      *uint          // nil = 匿名(公开接口可能未登录)
	FeatureCode string         // 必填, 取 model.go 里的 Feature* 常量
	FeatureName string         // 必填, 中文名; 推荐取 FeatureNames[FeatureCode]
	Action      string         // 必填, 业务动作 (search / send_message / submit / add ...)
	IPAddress   string         // 可选
	UserAgent   string         // 可选
	RequestPath string         // 可选 (HTTP 路径; WS 等场景留空)
	Referer     string         // 可选
	SessionID   string         // 可选
	ExtraData   map[string]any // 可选, 业务上下文 (query / paper_id / submission_id 等)
}

// FeatureRecorder 业务模块依赖的录入接口 —— Service 实现, bootstrap 注入。
// 用接口而不是直接依赖 Service: (a) 业务模块只持有最小依赖, (b) 测试可注入 noop。
type FeatureRecorder interface {
	// RecordFromGin: HTTP handler 用 —— 从 gin.Context 自动抽 user_id / IP / UA / path / Referer。
	RecordFromGin(c *gin.Context, featureCode, featureName, action string, extra map[string]any)
	// Record: 非 HTTP 上下文(WS hook 等) 用 —— 调用方手动填可填的字段。
	Record(event FeatureUseEvent)
}

// RecordFromGin 见 FeatureRecorder.RecordFromGin。
func (s *Service) RecordFromGin(c *gin.Context, featureCode, featureName, action string, extra map[string]any) {
	if c == nil {
		s.Record(FeatureUseEvent{
			FeatureCode: featureCode,
			FeatureName: featureName,
			Action:      action,
			ExtraData:   extra,
		})
		return
	}
	s.Record(FeatureUseEvent{
		UserID:      userIDFromGin(c),
		FeatureCode: featureCode,
		FeatureName: featureName,
		Action:      action,
		IPAddress:   c.ClientIP(),
		UserAgent:   c.GetHeader("User-Agent"),
		RequestPath: c.Request.URL.Path,
		Referer:     c.GetHeader("Referer"),
		ExtraData:   extra,
	})
}

// Record 异步写一条 usage log (safego 包裹, panic 不会带崩进程; 单条 INSERT 失败仅 Warn)。
// 调用方直接 `recorder.Record(event)` 即可, 不必再 safego.Go 一层。
func (s *Service) Record(event FeatureUseEvent) {
	if event.FeatureCode == "" || event.Action == "" {
		return
	}
	if event.FeatureName == "" {
		event.FeatureName = FeatureNames[event.FeatureCode]
	}
	safego.Record("usagelog-record:"+event.FeatureCode, func() {
		log := &UsageLog{
			UserID:      event.UserID,
			SessionID:   event.SessionID,
			FeatureCode: event.FeatureCode,
			FeatureName: event.FeatureName,
			Action:      event.Action,
			RequestPath: event.RequestPath,
			RefererPath: event.Referer,
			IPAddress:   event.IPAddress,
			UserAgent:   event.UserAgent,
			DeviceType:  inferDeviceType(event.UserAgent),
		}
		if event.ExtraData != nil {
			if b, err := json.Marshal(event.ExtraData); err == nil {
				log.ExtraData = b
			}
		}
		ctx, cancel := ctxutil.With(ctxutil.QuickIO)
		defer cancel()
		if err := s.repo.Create(ctx, log); err != nil {
			slog.Warn("usagelog: record feature use failed",
				"feature_code", event.FeatureCode, "action", event.Action, "err", err)
		}
	})
}

// userIDFromGin 从 gin.Context 抽 user_id —— auth middleware 注入的可能是
// uint / uint64 / int / float64 (JWT claims 反序列化), 这里都兼容; 取不到返 nil。
func userIDFromGin(c *gin.Context) *uint {
	v, ok := c.Get("user_id")
	if !ok {
		return nil
	}
	switch id := v.(type) {
	case uint:
		if id == 0 {
			return nil
		}
		return &id
	case uint64:
		if id == 0 {
			return nil
		}
		u := uint(id)
		return &u
	case int:
		if id <= 0 {
			return nil
		}
		u := uint(id)
		return &u
	case int64:
		if id <= 0 {
			return nil
		}
		u := uint(id)
		return &u
	case float64:
		if id <= 0 {
			return nil
		}
		u := uint(id)
		return &u
	}
	return nil
}

// inferDeviceType 简单 UA 推断 —— mobile / tablet / desktop, 取不到返空串。
// 不做精细 OS/browser 解析 (那需要 useragent 库, 价值不大 admin 用不上)。
func inferDeviceType(ua string) string {
	if ua == "" {
		return ""
	}
	low := strings.ToLower(ua)
	if strings.Contains(low, "tablet") || strings.Contains(low, "ipad") {
		return "tablet"
	}
	if strings.Contains(low, "mobile") || strings.Contains(low, "android") || strings.Contains(low, "iphone") {
		return "mobile"
	}
	return "desktop"
}
