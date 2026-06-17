// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// agentbridge/displacement_xinstance — 跨实例「多窗口接管」(C2)
//
// 进程内 activeWSConns(sync.Map)是单实例的快路径,本实例内新窗口接管立即生效。
// 但多副本部署时,两个 backend 实例可能各自持有同一 agent session 的活跃 WS →
// 同时驱动同一会话 → agent 端 jsonl 双写损坏。
//
// 这里叠加一条 Redis pub/sub 通知做跨实例收口:新 WS 注册时,除本地 Swap+displace
// 外,向频道 displaceChannel Publish 一条 {key, fromInstance}。每个实例启动一个
// 订阅 goroutine,收到非自己发的消息 → 若本实例当前持有该 key 的旧 WS,就 displace 它。
//
// 设计要点:
//   - 本地 Swap 仍是主路径;pub/sub 仅作跨实例补充。单实例 / Redis 挂 → 退化到现状。
//   - 防自杀:本实例自己发的消息按 fromInstance==instanceID 忽略,绝不关自己刚注册的连接。
//   - Publish 失败 / Redis 不可用 → 只打 debug,绝不阻断建连。
package agentbridge

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"os"
	"time"

	"github.com/redis/go-redis/v9"

	"scholar-backend/internal/common/cache"
)

// displaceChannel 是跨实例接管通知的 Redis pub/sub 频道名。
const displaceChannel = "agentbridge:displace"

// instanceID 是本进程的唯一标识(hostname + 随机后缀)。用于在 pub/sub 消息里区分
// 「这条接管通知是不是我自己发的」,避免订阅回路关掉本实例刚注册的新连接。
var instanceID = genInstanceID()

// genInstanceID 生成本实例标识。hostname 便于日志认出是哪个容器,随机后缀保证不撞。
func genInstanceID() string {
	host, _ := os.Hostname()
	if host == "" {
		host = "unknown"
	}
	var buf [6]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return host + "-" + hex.EncodeToString([]byte(time.Now().String()))[:12]
	}
	return host + "-" + hex.EncodeToString(buf[:])
}

// displaceNotice 是跨实例接管通知的 wire 格式。
type displaceNotice struct {
	Key  string `json:"key"`  // displacementKey(featureKey:sessionID)
	From string `json:"from"` // 发起接管的实例 instanceID
}

// publishDisplace 在本地 Swap 之后,广播一条接管通知给其它实例。
// best-effort:Redis 不可用 / marshal 失败只打 debug,绝不阻断建连。
func (b *Bridge) publishDisplace(ctx context.Context, key string) {
	rdb := cache.GetRedis()
	if rdb == nil {
		return
	}
	payload, err := json.Marshal(displaceNotice{Key: key, From: instanceID})
	if err != nil {
		slog.Debug("agentbridge displace: marshal notice failed", "key", key, "err", err)
		return
	}
	if err := rdb.Publish(ctx, displaceChannel, payload).Err(); err != nil {
		slog.Debug("agentbridge displace: publish failed", "key", key, "err", err)
	}
}

// StartDisplaceSubscriber 启动跨实例接管订阅 goroutine。main 用 bgCtx 调用一次。
// 收到其它实例的接管通知 → 若本实例当前持有该 session 的活跃 WS,就 displace 它。
// Redis 不可用 → 直接返回(退化到纯本地 displacement,与单实例行为一致)。
func (b *Bridge) StartDisplaceSubscriber(ctx context.Context) {
	rdb := cache.GetRedis()
	if rdb == nil {
		slog.Info("agentbridge displace: Redis unavailable, cross-instance displacement disabled (local-only)")
		return
	}
	slog.Info("agentbridge displace: cross-instance subscriber starting",
		"instance_id", instanceID, "channel", displaceChannel)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("agentbridge displace: subscriber panicked", "panic", r)
			}
		}()
		for {
			if ctx.Err() != nil {
				return
			}
			b.runDisplaceSubscribeOnce(ctx, rdb)
			select {
			case <-ctx.Done():
				slog.Info("agentbridge displace: subscriber stopped")
				return
			case <-time.After(2 * time.Second):
			}
		}
	}()
}

// runDisplaceSubscribeOnce 跑一轮 Subscribe + 消费循环,任一错误/断开即返回让外层重连。
func (b *Bridge) runDisplaceSubscribeOnce(ctx context.Context, rdb *redis.Client) {
	pubsub := rdb.Subscribe(ctx, displaceChannel)
	defer pubsub.Close()

	if _, err := pubsub.Receive(ctx); err != nil {
		slog.Debug("agentbridge displace: subscribe handshake failed", "err", err)
		return
	}
	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			b.handleDisplaceNotice(msg.Payload)
		}
	}
}

// handleDisplaceNotice 处理一条接管通知。忽略自己发的;否则若本实例当前持有该 key 的旧 WS → displace。
func (b *Bridge) handleDisplaceNotice(payload string) {
	var n displaceNotice
	if err := json.Unmarshal([]byte(payload), &n); err != nil {
		slog.Debug("agentbridge displace: bad notice payload", "err", err)
		return
	}
	if n.From == instanceID {
		return // 自己发的, 本地 Swap 已处理, 不能关自己刚注册的连接
	}
	v, ok := b.activeWSConns.Load(n.Key)
	if !ok {
		return // 本实例没持有这个 session 的连接
	}
	old, ok := v.(*displacedConn)
	if !ok {
		return
	}
	slog.Info("agentbridge displace: cross-instance takeover, displacing local WS",
		"key", n.Key, "from_instance", n.From, "this_instance", instanceID)
	old.displace() // closeOnce 幂等; 旧连接 HandleWS defer 自行 CompareAndDelete 摘除
}
