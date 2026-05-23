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

	"scholar-backend/internal/common/safego"

	"github.com/olahol/melody"
)

// Hub WebSocket 连接管理中心
//
// 基于 melody 实现，管理用户连接映射。在线人数 / 访客数已不再写库或对外暴露
// 统计接口 —— 这些指标全部交给 umami,本类只承担「实时推送」职责:
//   - 站内信 push (NotificationMessage / UnreadCountMessage / ToastMessage)
//   - 用户与会话集合维护,用于 SendToUser 命中目标
//   - 空闲连接回收
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
	safego.Go("ws-idle-checker", hub.startIdleChecker)

	return hub
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
			h.mu.Lock()
			h.guestSessions[s] = true
			guestCount := len(h.guestSessions)
			h.mu.Unlock()
			slog.Info("guest connected", "total_guests", guestCount)
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
			return
		}

		userID, ok := s.Get("user_id")
		if !ok {
			// 没有 user_id 可能是访客
			h.mu.Lock()
			delete(h.guestSessions, s)
			h.mu.Unlock()
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
	})

	// 接收消息
	h.melody.HandleMessage(func(s *melody.Session, msg []byte) {
		message, err := ParseMessage(msg)
		if err != nil {
			errMsg, _ := NewErrorMessage(400, "Invalid message format")
			data, _ := errMsg.ToJSON()
			s.Write(data)
			return
		}

		// 处理 ping 消息(仅刷新空闲时间,不再写库)
		if message.Type == MessageTypePing {
			s.Set("last_ping_time", time.Now())
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
		} else if connTime, ok := session.Get("connect_time"); ok {
			if now.Sub(connTime.(time.Time)) > IdleTimeout {
				idleSessions = append(idleSessions, session)
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
			} else if connTime, ok := session.Get("connect_time"); ok {
				if now.Sub(connTime.(time.Time)) > IdleTimeout {
					idleSessions = append(idleSessions, session)
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
