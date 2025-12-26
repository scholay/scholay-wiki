// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package websocket

import (
	"fmt"
	"sync"

	"github.com/olahol/melody"
)

// Hub WebSocket 连接管理中心
// 基于 melody 实现，管理用户连接映射
type Hub struct {
	melody *melody.Melody

	// userSessions 用户ID -> 会话集合的映射
	// 一个用户可能有多个连接（多设备/多标签页）
	userSessions map[uint]map[*melody.Session]bool
	mu           sync.RWMutex
}

// NewHub 创建新的 Hub
func NewHub() *Hub {
	m := melody.New()

	// 配置 melody
	m.Config.MaxMessageSize = 1024 * 64 // 64KB
	m.Config.MessageBufferSize = 256

	hub := &Hub{
		melody:       m,
		userSessions: make(map[uint]map[*melody.Session]bool),
	}

	// 设置事件处理器
	hub.setupHandlers()

	return hub
}

// setupHandlers 设置 melody 事件处理器
func (h *Hub) setupHandlers() {
	// 连接建立
	h.melody.HandleConnect(func(s *melody.Session) {
		// 从 session 中获取 userID（在 handler 中设置）
		userID, ok := s.Get("user_id")
		if !ok {
			return
		}

		uid := userID.(uint)
		h.mu.Lock()
		if h.userSessions[uid] == nil {
			h.userSessions[uid] = make(map[*melody.Session]bool)
		}
		h.userSessions[uid][s] = true
		h.mu.Unlock()

		fmt.Printf("[WebSocket] User %d connected, total sessions: %d\n", uid, len(h.userSessions[uid]))
	})

	// 连接断开
	h.melody.HandleDisconnect(func(s *melody.Session) {
		userID, ok := s.Get("user_id")
		if !ok {
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

		fmt.Printf("[WebSocket] User %d disconnected\n", uid)
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
			pong, _ := NewPongMessage()
			data, _ := pong.ToJSON()
			s.Write(data)
			return
		}

		// 其他消息类型暂不处理（服务端主要是推送，不接收业务消息）
	})

	// 错误处理
	h.melody.HandleError(func(s *melody.Session, err error) {
		fmt.Printf("[WebSocket] Error: %v\n", err)
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
	h.mu.RUnlock()

	if !exists || len(sessions) == 0 {
		// 用户不在线，不是错误
		return nil
	}

	for session := range sessions {
		if err := session.Write(data); err != nil {
			fmt.Printf("[WebSocket] Failed to send to user %d: %v\n", userID, err)
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

// GetOnlineUserCount 获取在线用户数量
func (h *Hub) GetOnlineUserCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.userSessions)
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

// Close 关闭 Hub
func (h *Hub) Close() error {
	return h.melody.Close()
}

