// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 跨多个业务模块共享的接口定义
// 仅放置在两个以上模块中有完全相同定义的接口
// 遵循 Go 惯例：消费者定义自己需要的最小接口子集
package interfaces

// OnlineStatsProvider 在线用户统计接口
// 由 websocket.Hub 实现，被 user.Handler 和 admin.DashboardHandler 共同使用
type OnlineStatsProvider interface {
	GetOnlineUserCount() int
	GetOnlineGuestCount() int
}
