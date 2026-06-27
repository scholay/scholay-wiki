// ============================================================================
// Scholay学术 V1.0
// 站内信 WS 一次性 ticket —— 替代把裸 JWT 放进 URL query。
//
// 站内信 WS(/api/v1/ws)历史上用 ?token=<jwt> 鉴权,JWT 长 TTL 会落进 nginx
// access log,日志泄露即可重放升级 WS。这与 agentbridge WS 早已改用一次性 ws-ticket
// 的安全决策矛盾。此处复刻同款机制:登录后 POST /user/ws-ticket 拿一张 30s 一次性 ticket,
// WS 升级用 ?ws_token=<ticket>,用即销毁(GETDEL),即便泄露窗口也仅 30s。
//
// 与 agentbridge 的 ticket 区别:站内信 WS 不绑 session,只绑 userID(整个收件箱推送),
// 故 payload 仅 "inbox:<userID>",不含 feature_key / session。
// ============================================================================

package websocket

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"scholar-backend/internal/common/cache"
)

const (
	// wsTicketTTL 一次性 ticket 存活时间。30s 与 agentbridge / 验证码 / oauth_nonce 同档:
	// 短到窃听无意义(浏览器拿到后通常 100ms 内升级 WS),长到容忍 JS 调度 + 弱网。
	wsTicketTTL = 30 * time.Second
	// wsTicketBytes ticket 原始随机字节数;hex 编码后 64 字符,足以抗暴力枚举。
	wsTicketBytes = 32
)

// ErrWSTicketInvalid ticket 不存在 / 过期 / payload 损坏。
var ErrWSTicketInvalid = errors.New("websocket: ws ticket invalid or expired")

// IssueInboxTicket 为 userID 颁发一张 30s 一次性 ws ticket。
// 走 persist 池(noeviction):ticket 被 LRU 逐出 = 用户拿着有效 ticket 却升级失败,
// 是硬性鉴权破坏而非优雅降级,与 agentbridge.mintWSTicket 同理。
func IssueInboxTicket(ctx context.Context, userID uint) (string, error) {
	if userID == 0 {
		return "", errors.New("websocket: empty user id")
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return "", errors.New("websocket: redis unavailable, cannot issue ws ticket")
	}
	b := make([]byte, wsTicketBytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("crypto/rand: %w", err)
	}
	token := hex.EncodeToString(b)
	payload := fmt.Sprintf("inbox:%d", userID)
	if err := rdb.Set(ctx, wsInboxTicketKey(token), payload, wsTicketTTL).Err(); err != nil {
		return "", fmt.Errorf("set ws ticket: %w", err)
	}
	return token, nil
}

// ConsumeInboxTicket GETDEL 取回并销毁 ticket(一次性),返回 userID。
func ConsumeInboxTicket(ctx context.Context, token string) (uint, error) {
	if token == "" {
		return 0, ErrWSTicketInvalid
	}
	rdb := cache.GetRedisPersist() // 与 IssueInboxTicket 同池,否则 GETDEL 查不到
	if rdb == nil {
		return 0, errors.New("websocket: redis unavailable")
	}
	payload, err := rdb.GetDel(ctx, wsInboxTicketKey(token)).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return 0, ErrWSTicketInvalid
		}
		return 0, fmt.Errorf("getdel ws ticket: %w", err)
	}
	parts := strings.SplitN(payload, ":", 2)
	if len(parts) != 2 || parts[0] != "inbox" {
		return 0, ErrWSTicketInvalid
	}
	uid64, parseErr := strconv.ParseUint(parts[1], 10, 64)
	if parseErr != nil || uid64 == 0 {
		return 0, ErrWSTicketInvalid
	}
	return uint(uid64), nil
}

// wsInboxTicketKey ticket 在 Redis 里的 key 模板。
func wsInboxTicketKey(token string) string {
	return "inbox:ws_ticket:" + token
}
