// ============================================================================
// Scholay学术 V1.0
// 熔断器状态统计 —— 进程内计数器 + 结构化日志
// ============================================================================
//
// 原 breaker.go 只在 OnStateChange 打一条 slog.Warn,做不了
// "每个熔断器一周内打开过几次"、"当前是否处于 Open" 这类查询。
//
// 本文件提供：
//   1. 每个 breaker 的进程内计数器（transitions / open_count）,
//      通过 Stats() 暴露快照,后续可接 /admin/metrics/circuit-breakers 轮询;
//   2. OnStateChange 发送结构化 slog 日志(从状态/到状态/累计转换次数),
//      接入任何日志收集系统(Loki/ELK/Datadog/...)后都可直接做告警查询。

package circuitbreaker

import (
	"log/slog"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/sony/gobreaker"
)

// BreakerStats 是单个熔断器的状态快照。
type BreakerStats struct {
	Name            string    `json:"name"`
	State           string    `json:"state"`             // "closed" / "open" / "half-open"
	Transitions     int64     `json:"transitions"`       // 状态切换累计次数（生命周期）
	OpenCount       int64     `json:"open_count"`        // 切换到 Open 的累计次数
	LastTransition  time.Time `json:"last_transition"`   // 最近一次切换时刻
	LastOpenedAt    time.Time `json:"last_opened_at"`    // 最近一次切换到 Open 时刻
	CurrentSince    time.Time `json:"current_since"`     // 当前状态起始时刻
}

type breakerStat struct {
	name            string
	state           atomic.Int32 // gobreaker.State 的 int32 表示
	transitions     atomic.Int64
	openCount       atomic.Int64
	lastTransition  atomic.Int64 // unix nano
	lastOpenedAt    atomic.Int64 // unix nano
	currentSince    atomic.Int64 // unix nano
}

var (
	statsMu     sync.RWMutex
	statsByName = map[string]*breakerStat{}
)

// registerBreaker 在首次 OnStateChange 时初始化状态（Closed）。
func registerBreaker(name string) *breakerStat {
	statsMu.Lock()
	defer statsMu.Unlock()
	if s, ok := statsByName[name]; ok {
		return s
	}
	s := &breakerStat{name: name}
	s.state.Store(int32(gobreaker.StateClosed))
	s.currentSince.Store(time.Now().UnixNano())
	statsByName[name] = s
	return s
}

func nanoToTime(n int64) time.Time {
	if n == 0 {
		return time.Time{}
	}
	return time.Unix(0, n)
}

// Stats 返回所有熔断器的当前状态快照，按名字字典序排列。
// 用于健康检查接口、管理后台展示。
func Stats() []BreakerStats {
	statsMu.RLock()
	out := make([]BreakerStats, 0, len(statsByName))
	for _, s := range statsByName {
		out = append(out, BreakerStats{
			Name:           s.name,
			State:          gobreaker.State(s.state.Load()).String(),
			Transitions:    s.transitions.Load(),
			OpenCount:      s.openCount.Load(),
			LastTransition: nanoToTime(s.lastTransition.Load()),
			LastOpenedAt:   nanoToTime(s.lastOpenedAt.Load()),
			CurrentSince:   nanoToTime(s.currentSince.Load()),
		})
	}
	statsMu.RUnlock()
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// recordStateChange 更新该 breaker 的计数/状态并返回更新后的 transition 总数。
func recordStateChange(name string, to gobreaker.State, now time.Time) int64 {
	s := registerBreaker(name)
	s.state.Store(int32(to))
	t := s.transitions.Add(1)
	s.lastTransition.Store(now.UnixNano())
	s.currentSince.Store(now.UnixNano())
	if to == gobreaker.StateOpen {
		s.openCount.Add(1)
		s.lastOpenedAt.Store(now.UnixNano())
	}
	return t
}

// onStateChangeWithStats 是 breaker 的 OnStateChange 回调：写统计 + 打结构化日志。
// 日志字段固定（cb_name / cb_from / cb_to / cb_transitions）,日志系统可做
// group_by 聚合 / 告警（例如 cb_to=open 在 5 分钟内 >= 3 次）。
func onStateChangeWithStats(name string, from gobreaker.State, to gobreaker.State) {
	now := time.Now()
	total := recordStateChange(name, to, now)
	attrs := []any{
		"cb_name", name,
		"cb_from", from.String(),
		"cb_to", to.String(),
		"cb_transitions", total,
		"ts", now.Format(time.RFC3339Nano),
	}
	switch to {
	case gobreaker.StateOpen:
		// WARN 而非 ERROR: breaker 打开是"外部依赖在抖、保护机制按预期生效",不是我方后端故障。
		// ERROR 留给真正的后端缺陷, 这样值班 grep ERROR 才不会被上游(minicod/AI)抖动淹没。
		slog.Warn("circuit breaker opened (upstream degraded)", attrs...)
	case gobreaker.StateHalfOpen:
		// 进入试探恢复, 信息性事件。
		slog.Info("circuit breaker half-open (probing recovery)", attrs...)
	default:
		slog.Info("circuit breaker closed (recovered)", attrs...)
	}
}
