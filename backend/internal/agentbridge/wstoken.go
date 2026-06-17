// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentbridge

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
	// wsTicketTTL 是一次性 ws ticket 在 Redis 里的存活时间。
	// 短到足以让窃听毫无意义 (浏览器拿到 ticket 后通常 100ms 内就发起 WS upgrade),
	// 长到容忍页面 JS 调度延迟 + 弱网。30s 是项目里 verification_code / oauth_nonce 同档。
	wsTicketTTL = 30 * time.Second

	// wsTicketBytes 是 ticket 的原始随机字节数; hex 编码后 64 字符, 足以抗暴力枚举。
	wsTicketBytes = 32
)

var (
	// ErrWSTicketInvalid 是 ws ticket 不存在 / 过期 / payload 损坏 / 跨 feature 误用 时的错误。
	ErrWSTicketInvalid = errors.New("agentbridge: ws ticket invalid or expired")

	// ErrSessionMismatch 是 IssueWSTicket 拒绝为非本人 session 颁发 ticket 的错误。
	// 防御内部 API 滥用 (理论上 caller 已经经过 JWT 校验, 但多一道防线没坏处)。
	ErrSessionMismatch = errors.New("agentbridge: session does not belong to user")
)

// IssueWSTicket 为 (user, feature, session) 颁发一张 30s 一次性 ws ticket。
// 用作 WS 升级时的鉴权材料,替代把 JWT 直接放到 URL query —— JWT 长 TTL,会被 nginx
// access log 落盘, 一旦日志泄露就能拿来重放整轮会话; ticket 用即销毁, 即便泄露窗口也仅 30s。
//
// 失败原因:
//   - sessionID 不属于 userID → ErrSessionMismatch
//   - Redis 不可用 → 直接报错; 不像 quota 钩子那样 fail-open, 这关系到鉴权安全
func (f *FeatureBridge) IssueWSTicket(ctx context.Context, userID uint, sessionID string) (string, error) {
	if sessionID == "" {
		return "", errors.New("agentbridge: empty session id")
	}
	owns, err := f.OwnsSession(userID, sessionID)
	if err != nil {
		return "", fmt.Errorf("ownership check: %w", err)
	}
	if !owns {
		return "", ErrSessionMismatch
	}
	return f.mintWSTicket(ctx, userID, sessionID)
}

// IssueWSTicketTrusted 同 IssueWSTicket,但**跳过** OwnsSession 检查 —— 用于 session 不在
// 通用 agent_sessions 映射、而由 feature 自己管归属的场景(如 Prism 每项目独立会话存
// prism_projects.agent_session_id)。**调用方必须已自行校验归属**(如 prism 先 GetProject(uid)
// 确认项目属本人,再解析出该项目的 sessionID),否则就是越权漏洞。
func (f *FeatureBridge) IssueWSTicketTrusted(ctx context.Context, userID uint, sessionID string) (string, error) {
	if sessionID == "" {
		return "", errors.New("agentbridge: empty session id")
	}
	return f.mintWSTicket(ctx, userID, sessionID)
}

// mintWSTicket 铸一张 ticket 写进 Redis(归属校验由调用方决定)。
//
// 走 persist 池:ws ticket 被主池 LRU 逐出 = 用户拿着有效 ticket 却升级 WS 失败(401),
// 是硬性鉴权破坏而非优雅降级,正是 noeviction 池要保护的 correctness 键。persist 未配置
// 时 GetRedisPersist 回落主池,单实例部署行为不变。
func (f *FeatureBridge) mintWSTicket(ctx context.Context, userID uint, sessionID string) (string, error) {
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return "", errors.New("agentbridge: redis unavailable, cannot issue ws ticket")
	}
	token, err := randomTicketHex()
	if err != nil {
		return "", err
	}
	// payload 编码: <feature_key>:<user_id>:<session_id>; SplitN(":",3) 解, session_id 自身
	// 不会含 ":" (agent 端用 nanoid)。即便 redis key 路径含义将来变, payload 自描述。
	payload := fmt.Sprintf("%s:%d:%s", f.spec.Key, userID, sessionID)
	if err := rdb.Set(ctx, wsTicketKey(token), payload, wsTicketTTL).Err(); err != nil {
		return "", fmt.Errorf("set ws ticket: %w", err)
	}
	return token, nil
}

// ConsumeWSTicket 取回并销毁 ticket。GETDEL 保证一次性: 即便被中间人偷听到 ticket,
// 第二次使用会直接失效。返回 (userID, sessionID, error)。
//
// feature_key mismatch 也返 ErrWSTicketInvalid: 防止用 smart_search 的 ticket 升级
// paper_review 的 WS (即便概率极低, 也属于跨 feature 越权)。
func (f *FeatureBridge) ConsumeWSTicket(ctx context.Context, token string) (uint, string, error) {
	if token == "" {
		return 0, "", ErrWSTicketInvalid
	}
	rdb := cache.GetRedisPersist() // 与 mintWSTicket 同池, 否则 GETDEL 查不到 ticket
	if rdb == nil {
		return 0, "", errors.New("agentbridge: redis unavailable")
	}
	payload, err := rdb.GetDel(ctx, wsTicketKey(token)).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return 0, "", ErrWSTicketInvalid
		}
		return 0, "", fmt.Errorf("getdel ws ticket: %w", err)
	}
	parts := strings.SplitN(payload, ":", 3)
	if len(parts) != 3 || parts[0] != f.spec.Key {
		return 0, "", ErrWSTicketInvalid
	}
	uid64, parseErr := strconv.ParseUint(parts[1], 10, 64)
	if parseErr != nil || uid64 == 0 {
		return 0, "", ErrWSTicketInvalid
	}
	return uint(uid64), parts[2], nil
}

// wsTicketKey 是 ticket 在 Redis 里的 key 模板。前缀 "agent:ws_ticket:" 让运维一眼能看出来,
// `KEYS agent:ws_ticket:*` 可枚举所有未消费的 ticket (诊断用)。
func wsTicketKey(token string) string {
	return "agent:ws_ticket:" + token
}

// randomTicketHex 用 crypto/rand 出 wsTicketBytes 字节再 hex 编码。
// 不用 math/rand —— ticket 是鉴权材料, 必须 unpredictable。
func randomTicketHex() (string, error) {
	b := make([]byte, wsTicketBytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("crypto/rand: %w", err)
	}
	return hex.EncodeToString(b), nil
}
