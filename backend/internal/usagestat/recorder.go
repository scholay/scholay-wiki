// ============================================================================
// 功能使用录入入口 —— 业务模块在用户"实际使用"功能那一刻调一次。
//
// 约定 (与旧 usagelog 一致):
//   1. 不在导航/页面 mount 时调 (那只是点菜单, 不算使用)
//   2. 在自然的业务接口/事件被触发时调 (提交搜索、发提问、暂存、收藏、改维度、审稿步骤…)
//   3. 录入异步 (safego 包裹), 不阻塞业务; 单条失败仅 Warn
// ============================================================================

package usagestat

import (
	"encoding/json"
	"log/slog"
	"strings"

	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"

	"github.com/gin-gonic/gin"
)

// Event 一条使用事件的录入参数。HTTP 上下文优先用 FromGin 预填再补字段;
// 非 HTTP 上下文 (agentbridge WS 钩子) 直接构造。
type Event struct {
	UserID        *uint          // nil = 匿名
	AnonID        string         // 匿名访客稳定标识 (前端提供)
	Feature       string         // 必填, 取 Feature* 常量
	Action        string         // 必填, 业务动作
	CorrelationID string         // 可选, 连贯性键 (审稿 submission_id 等)
	Source        string         // 可选, traditional / smart
	IPAddress     string         // 可选
	UserAgent     string         // 可选
	Extra         map[string]any // 可选, 业务上下文
}

// Recorder 业务模块依赖的最小录入接口 —— Service 实现, bootstrap 注入。
type Recorder interface {
	// RecordFromGin: HTTP handler 用 —— 从 gin.Context 自动抽 user_id/ip/ua/anon_id。
	RecordFromGin(c *gin.Context, feature, action string, extra map[string]any)
	// Record: 完全控制 (非 HTTP 上下文, 或需要带 correlation_id/source 时) 用。
	Record(e Event)
}

// FromGin 预填 gin 上下文字段 (user_id / anon_id / ip / ua), 调用方再补 Feature/
// Action/CorrelationID/Source/Extra 后交给 Service.Record。
// anon_id 来自前端 X-Anon-Id 头 (http 实例对所有请求注入), 用于匿名访客去重计人;
// public Track 端点 (暂存/收藏) 走 fetch 不带该头, 改用请求体里的 anon_id 覆盖。
func FromGin(c *gin.Context) Event {
	if c == nil {
		return Event{}
	}
	return Event{
		UserID:    userIDFromGin(c),
		AnonID:    c.GetHeader("X-Anon-Id"),
		IPAddress: c.ClientIP(),
		UserAgent: c.GetHeader("User-Agent"),
	}
}

// RecordFromGin 见 Recorder.RecordFromGin (简单事件用; 不带 correlation/source)。
func (s *Service) RecordFromGin(c *gin.Context, feature, action string, extra map[string]any) {
	e := FromGin(c)
	e.Feature = feature
	e.Action = action
	e.Extra = extra
	s.Record(e)
}

// Record 异步写一条事件 (全局有界 record 池 + QuickIO deadline; 单条 INSERT 失败仅 Warn)。
func (s *Service) Record(e Event) {
	if e.Feature == "" || e.Action == "" {
		return
	}
	safego.Record("usagestat:"+e.Feature, func() {
		ev := &UsageEvent{
			UserID:        e.UserID,
			AnonID:        e.AnonID,
			Feature:       e.Feature,
			Action:        e.Action,
			CorrelationID: e.CorrelationID,
			Source:        e.Source,
			IPAddress:     e.IPAddress,
			UserAgent:     e.UserAgent,
			DeviceType:    inferDeviceType(e.UserAgent),
		}
		if e.Extra != nil {
			if b, err := json.Marshal(e.Extra); err == nil {
				ev.Extra = b
			}
		}
		ctx, cancel := ctxutil.With(ctxutil.QuickIO)
		defer cancel()
		if err := s.repo.Create(ctx, ev); err != nil {
			slog.Warn("usagestat: record failed",
				"feature", e.Feature, "action", e.Action, "err", err)
		}
	})
}

// userIDFromGin 从 gin.Context 抽 user_id —— auth middleware 注入的可能是
// uint/uint64/int/int64/float64 (JWT claims 反序列化), 都兼容; 取不到返 nil (匿名)。
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

// inferDeviceType 简单 UA 推断 mobile/tablet/desktop, 取不到返空串。
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
