// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package websocket

import (
	"log/slog"
	"sync"
	"time"

	"github.com/olahol/melody"
)

// SessionActivityUpdater 定义更新 session activity 的接口
type SessionActivityUpdater interface {
	UpdateSessionActivityByUserID(userID uint, ip string) error
}

// OnlineStats 在线统计信息
type OnlineStats struct {
	OnlineUsers  int `json:"online_users"`   // 在线登录用户数
	OnlineGuests int `json:"online_guests"`  // 在线访客数
	TotalOnline  int `json:"total_online"`   // 总在线数
}

// SnapshotRecorder 快照记录器接口（由 user.Service 实现）
type SnapshotRecorder interface {
	RecordOnlineSnapshot(userCount, guestCount int) error
}

// Hub WebSocket 连接管理中心
// 基于 melody 实现，管理用户连接映射
type Hub struct {
	melody *melody.Melody

	// userSessions 用户ID -> 会话集合的映射
	// 一个用户可能有多个连接（多设备/多标签页）
	userSessions map[uint]map[*melody.Session]bool

	// guestSessions 访客会话集合（未登录用户）
	guestSessions map[*melody.Session]bool

	mu sync.RWMutex

	// stopCh signals background goroutines to exit during Close()
	stopCh chan struct{}

	// sessionUpdater 用于更新 session activity
	sessionUpdater SessionActivityUpdater

	// snapshotRecorder 用于记录在线人数快照
	snapshotRecorder SnapshotRecorder
}

// 空闲超时配置
const (
	// IdleTimeout 连接空闲超时时间（前端 5 分钟无活动后停止心跳，后端再等 2 分钟后断开）
	IdleTimeout = 7 * time.Minute

	// IdleCheckInterval 空闲检查间隔
	IdleCheckInterval = 1 * time.Minute
)

// NewHub 创建新的 Hub
func NewHub() *Hub {
	m := melody.New()

	// 配置 melody
	m.Config.MaxMessageSize = 1024 * 64 // 64KB
	m.Config.MessageBufferSize = 256
	// 设置 Pong 等待超时（用于检测连接是否存活）
	m.Config.PongWait = 2 * time.Minute
	// 设置 Ping 周期（必须小于 PongWait）
	m.Config.PingPeriod = 1 * time.Minute

	hub := &Hub{
		melody:        m,
		userSessions:  make(map[uint]map[*melody.Session]bool),
		guestSessions: make(map[*melody.Session]bool),
		stopCh:        make(chan struct{}),
	}

	// 设置事件处理器
	hub.setupHandlers()

	// 启动空闲连接检查器
	go hub.startIdleChecker()

	return hub
}

// SetSessionUpdater 设置 session activity 更新器
func (h *Hub) SetSessionUpdater(updater SessionActivityUpdater) {
	h.sessionUpdater = updater
}

// SetSnapshotRecorder 设置在线快照记录器
func (h *Hub) SetSnapshotRecorder(recorder SnapshotRecorder) {
	h.snapshotRecorder = recorder
}

// recordSnapshot 记录当前在线人数快照（异步执行）
func (h *Hub) recordSnapshot() {
	if h.snapshotRecorder == nil {
		return
	}

	// 获取当前在线数
	h.mu.RLock()
	userCount := len(h.userSessions)
	guestCount := len(h.guestSessions)
	h.mu.RUnlock()

	// 异步记录，不阻塞连接处理
	go func() {
		if err := h.snapshotRecorder.RecordOnlineSnapshot(userCount, guestCount); err != nil {
			slog.Error("failed to record online snapshot", "err", err)
		}
	}()
}

// setupHandlers 设置 melody 事件处理器
func (h *Hub) setupHandlers() {
	// 连接建立
	h.melody.HandleConnect(func(s *melody.Session) {
		// 记录连接时间和最后活动时间
		now := time.Now()
		s.Set("connect_time", now)
		s.Set("last_ping_time", now)

		// 检查是否是访客连接
		isGuest, _ := s.Get("is_guest")
		if isGuest == true {
			// 访客连接
			h.mu.Lock()
			h.guestSessions[s] = true
			guestCount := len(h.guestSessions)
			h.mu.Unlock()
			slog.Info("guest connected", "total_guests", guestCount)
			// 记录在线快照
			h.recordSnapshot()
			return
		}

		// 从 session 中获取 userID（在 handler 中设置）
		userID, ok := s.Get("user_id")
		if !ok {
			// 没有 user_id 也视为访客
			h.mu.Lock()
			h.guestSessions[s] = true
			guestCount := len(h.guestSessions)
			h.mu.Unlock()
			slog.Info("guest connected (no user_id)", "total_guests", guestCount)
			// 记录在线快照
			h.recordSnapshot()
			return
		}

		uid := userID.(uint)
		h.mu.Lock()
		if h.userSessions[uid] == nil {
			h.userSessions[uid] = make(map[*melody.Session]bool)
		}
		h.userSessions[uid][s] = true
		h.mu.Unlock()

		slog.Info("user connected", "user_id", uid, "total_sessions", len(h.userSessions[uid]))

		// 更新 session activity（连接建立时）
		h.updateSessionActivity(s)
		// 记录在线快照
		h.recordSnapshot()
	})

	// 连接断开
	h.melody.HandleDisconnect(func(s *melody.Session) {
		// 检查是否是访客
		isGuest, _ := s.Get("is_guest")
		if isGuest == true {
			h.mu.Lock()
			delete(h.guestSessions, s)
			guestCount := len(h.guestSessions)
			h.mu.Unlock()
			slog.Info("guest disconnected", "remaining_guests", guestCount)
			// 记录在线快照
			h.recordSnapshot()
			return
		}

		userID, ok := s.Get("user_id")
		if !ok {
			// 没有 user_id 可能是访客
			h.mu.Lock()
			delete(h.guestSessions, s)
			h.mu.Unlock()
			// 记录在线快照
			h.recordSnapshot()
			return
		}

		uid := userID.(uint)
		h.mu.Lock()
		if sessions, exists := h.userSessions[uid]; exists {
			delete(sessions, s)
			if len(sessions) == 0 {
				delete(h.userSessions, uid)
			}
		}
		h.mu.Unlock()

		slog.Info("user disconnected", "user_id", uid)
		// 记录在线快照
		h.recordSnapshot()
	})

	// 接收消息
	h.melody.HandleMessage(func(s *melody.Session, msg []byte) {
		// 解析消息
		message, err := ParseMessage(msg)
		if err != nil {
			errMsg, _ := NewErrorMessage(400, "Invalid message format")
			data, _ := errMsg.ToJSON()
			s.Write(data)
			return
		}

		// 处理 ping 消息
		if message.Type == MessageTypePing {
			// 更新最后活动时间（用于空闲检测）
			s.Set("last_ping_time", time.Now())

			// 只对登录用户更新 session activity
			isGuest, _ := s.Get("is_guest")
			if isGuest != true {
				h.updateSessionActivity(s)
			}

			pong, _ := NewPongMessage()
			data, _ := pong.ToJSON()
			s.Write(data)
			return
		}

		// 其他消息类型暂不处理（服务端主要是推送，不接收业务消息）
	})

	// 错误处理
	h.melody.HandleError(func(s *melody.Session, err error) {
		slog.Error("WebSocket error", "err", err)
	})
}

// updateSessionActivity 更新用户的 session activity
// 节流：每 30 秒最多更新一次
func (h *Hub) updateSessionActivity(s *melody.Session) {
	if h.sessionUpdater == nil {
		return
	}

	userID, ok := s.Get("user_id")
	if !ok {
		return
	}

	// 节流检查：避免频繁更新数据库
	lastUpdateKey := "last_activity_update"
	if lastUpdate, ok := s.Get(lastUpdateKey); ok {
		if time.Since(lastUpdate.(time.Time)) < 30*time.Second {
			return // 30秒内已更新过，跳过
		}
	}

	// 获取客户端 IP
	ip := ""
	if clientIP, ok := s.Get("client_ip"); ok {
		ip = clientIP.(string)
	}

	uid := userID.(uint)

	// 异步更新，避免阻塞 WebSocket 消息处理
	go func() {
		if err := h.sessionUpdater.UpdateSessionActivityByUserID(uid, ip); err != nil {
			slog.Error("failed to update session activity", "user_id", uid, "err", err)
		}
	}()

	// 记录本次更新时间
	s.Set(lastUpdateKey, time.Now())
}

// GetMelody 获取 melody 实例（用于 handler）
func (h *Hub) GetMelody() *melody.Melody {
	return h.melody
}

// SendToUser 向指定用户发送消息
func (h *Hub) SendToUser(userID uint, msg *Message) error {
	data, err := msg.ToJSON()
	if err != nil {
		return err
	}

	h.mu.RLock()
	sessions, exists := h.userSessions[userID]
	sessionCount := len(sessions)
	h.mu.RUnlock()

	if !exists || sessionCount == 0 {
		// 用户不在线，记录日志
		slog.Debug("user not online, message not sent", "user_id", userID, "sessions", sessionCount, "msg_type", msg.Type)
		return nil
	}

	slog.Debug("sending message to user", "user_id", userID, "sessions", sessionCount, "msg_type", msg.Type)

	for session := range sessions {
		if err := session.Write(data); err != nil {
			slog.Error("failed to send WebSocket message", "user_id", userID, "err", err)
		}
	}

	return nil
}

// SendNotification 向用户发送站内信通知
func (h *Hub) SendNotification(userID uint, msgID uint, title, content, category, linkURL, linkText string) error {
	msg, err := NewNotificationMessage(msgID, title, content, category, linkURL, linkText)
	if err != nil {
		return err
	}
	return h.SendToUser(userID, msg)
}

// SendUnreadCount 向用户发送未读消息数量
func (h *Hub) SendUnreadCount(userID uint, count int) error {
	msg, err := NewUnreadCountMessage(count)
	if err != nil {
		return err
	}
	return h.SendToUser(userID, msg)
}

// SendToast 向用户发送纯 toast 提示（无站内信记录，不可点击）
func (h *Hub) SendToast(userID uint, title, content, category string) error {
	msg, err := NewToastMessage(title, content, category)
	if err != nil {
		return err
	}
	return h.SendToUser(userID, msg)
}

// Broadcast 向所有连接广播消息
func (h *Hub) Broadcast(msg *Message) error {
	data, err := msg.ToJSON()
	if err != nil {
		return err
	}
	return h.melody.Broadcast(data)
}

// IsUserOnline 检查用户是否在线
func (h *Hub) IsUserOnline(userID uint) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	sessions, exists := h.userSessions[userID]
	return exists && len(sessions) > 0
}

// GetOnlineUserCount 获取在线登录用户数量
func (h *Hub) GetOnlineUserCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.userSessions)
}

// GetOnlineGuestCount 获取在线访客数量
func (h *Hub) GetOnlineGuestCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.guestSessions)
}

// GetOnlineStats 获取完整的在线统计信息
func (h *Hub) GetOnlineStats() OnlineStats {
	h.mu.RLock()
	defer h.mu.RUnlock()
	users := len(h.userSessions)
	guests := len(h.guestSessions)
	return OnlineStats{
		OnlineUsers:  users,
		OnlineGuests: guests,
		TotalOnline:  users + guests,
	}
}

// GetUserSessionCount 获取用户的会话数量
func (h *Hub) GetUserSessionCount(userID uint) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if sessions, exists := h.userSessions[userID]; exists {
		return len(sessions)
	}
	return 0
}

// Close 关闭 Hub 并停止后台 goroutine
func (h *Hub) Close() error {
	close(h.stopCh)
	return h.melody.Close()
}

// startIdleChecker 启动空闲连接检查器
func (h *Hub) startIdleChecker() {
	ticker := time.NewTicker(IdleCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			h.checkIdleConnections()
		case <-h.stopCh:
			slog.Info("WebSocket idle checker stopped")
			return
		}
	}
}

// checkIdleConnections 检查并关闭空闲连接
func (h *Hub) checkIdleConnections() {
	now := time.Now()
	var idleSessions []*melody.Session

	// 收集空闲的访客连接
	h.mu.RLock()
	for session := range h.guestSessions {
		if lastPing, ok := session.Get("last_ping_time"); ok {
			if now.Sub(lastPing.(time.Time)) > IdleTimeout {
				idleSessions = append(idleSessions, session)
			}
		} else {
			// 没有 last_ping_time，检查连接时间
			if connTime, ok := session.Get("connect_time"); ok {
				if now.Sub(connTime.(time.Time)) > IdleTimeout {
					idleSessions = append(idleSessions, session)
				}
			}
		}
	}

	// 收集空闲的用户连接
	for _, sessions := range h.userSessions {
		for session := range sessions {
			if lastPing, ok := session.Get("last_ping_time"); ok {
				if now.Sub(lastPing.(time.Time)) > IdleTimeout {
					idleSessions = append(idleSessions, session)
				}
			} else {
				// 没有 last_ping_time，检查连接时间
				if connTime, ok := session.Get("connect_time"); ok {
					if now.Sub(connTime.(time.Time)) > IdleTimeout {
						idleSessions = append(idleSessions, session)
					}
				}
			}
		}
	}
	h.mu.RUnlock()

	// 关闭空闲连接
	for _, session := range idleSessions {
		userID, _ := session.Get("user_id")
		isGuest, _ := session.Get("is_guest")
		if isGuest == true {
			slog.Debug("closing idle guest connection")
		} else if userID != nil {
			slog.Debug("closing idle user connection", "user_id", userID)
		}
		session.Close()
	}

	if len(idleSessions) > 0 {
		slog.Info("closed idle connections", "count", len(idleSessions))
	}
}

