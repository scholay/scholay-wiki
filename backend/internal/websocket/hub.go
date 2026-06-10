// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package websocket

import (
	"errors"
	"io"
	"log/slog"
	"net"
	"sync"
	"time"

	"scholar-backend/internal/common/safego"

	gorillaws "github.com/gorilla/websocket"
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
		// 在临界区内取计数 —— 锁外 len(h.userSessions[uid]) 会与 HandleDisconnect 持写锁的
		// delete(sessions, s) 构成「concurrent map read and map write」整进程 fatal(同 SendToUser 已修)。
		sessionCount := len(h.userSessions[uid])
		h.mu.Unlock()

		slog.Info("user connected", "user_id", uid, "total_sessions", sessionCount)
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
		// 正常断连(用户关页签 / 跳走 / 网络断 / 手机切后台 / 本 hub idle 检查器主动关)不是服务端
		// 错误 —— 降到 Debug,避免污染 ERROR 日志、接监控时误报。只有真·非预期错误才记 ERROR。
		if isBenignWSErr(err) {
			slog.Debug("WebSocket closed", "err", err)
			return
		}
		slog.Error("WebSocket error", "err", err)
	})
}

// isBenignWSErr 判定一个 WS 读/写错误是否为"正常断连"(不该当 ERROR)。覆盖两类:
//  1. WS 协议级关闭码(1000/1001/1005/1006)—— gorilla *CloseError。
//  2. 底层网络层:连接已关闭(含本 hub idle 检查器主动 session.Close() 后读循环读到的
//     "use of closed network connection")、读超时(i/o timeout)、EOF —— 这些是
//     *net.OpError / net.ErrClosed,不是 *CloseError,IsCloseError 抓不到,正是线上刷屏那
//     ~190 条 "WebSocket error" 的真实来源(绝大多数是 idle 主动收割连接,属预期行为)。
func isBenignWSErr(err error) bool {
	if err == nil {
		return true
	}
	if gorillaws.IsCloseError(err,
		gorillaws.CloseNormalClosure,    // 1000 正常
		gorillaws.CloseGoingAway,        // 1001 关页签 / 跳走
		gorillaws.CloseNoStatusReceived, // 1005 无状态码关闭(浏览器默认)
		gorillaws.CloseAbnormalClosure,  // 1006 TCP 直接断(网络抖动 / 切后台)
	) {
		return true
	}
	if errors.Is(err, net.ErrClosed) || errors.Is(err, io.EOF) {
		return true
	}
	var nerr net.Error
	if errors.As(err, &nerr) && nerr.Timeout() {
		return true
	}
	return false
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

	// 在 RLock 内把内层 map 快照成本地 slice，再在锁外迭代写。
	// 直接锁外迭代 h.userSessions[userID] 这个 map 会与 HandleDisconnect 持写锁的
	// delete(sessions, s) 形成并发 map 迭代+写 —— Go 运行时会抛不可 recover 的 fatal error
	// 整进程崩溃（RecoveryMiddleware 救不了）。范式同 checkIdleConnections。
	h.mu.RLock()
	sessions := h.userSessions[userID]
	snapshot := make([]*melody.Session, 0, len(sessions))
	for session := range sessions {
		snapshot = append(snapshot, session)
	}
	h.mu.RUnlock()

	if len(snapshot) == 0 {
		// 用户不在线，记录日志
		slog.Debug("user not online, message not sent", "user_id", userID, "sessions", 0, "msg_type", msg.Type)
		return nil
	}

	slog.Debug("sending message to user", "user_id", userID, "sessions", len(snapshot), "msg_type", msg.Type)

	for _, session := range snapshot {
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
