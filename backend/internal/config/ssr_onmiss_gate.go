// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// ssr_onmiss_gate.go —— SSR 冷门实体「现拉上游」(on-miss enrichment) 的准入闸门。
//
// 🔴 这条路径为什么必须有闸门(2026-08-12 生产实测 24h):
//   - minicod 上游调用 121,732 次/天,其中 ~115,000 次(94%)来自 SSR on-miss;
//   - 实体页请求 64,974 次/天,meta-externalagent 33,796 + Googlebot 30,879,**真人 31 次**;
//   - 每天新建 44,952 篇论文行 + 73,868 个作者行,待补全积压 145k/148k 且在涨。
//   - 机制是自激的:爬虫抓一个未落地的 /paper/{source}/{id} → 现拉上游建行 →
//     渲染出的页面带 3~8 条作者链接(作者页则带最多 25 条论文链接)→ 爬虫顺着爬 →
//     又是 miss → 沿整张学术图谱指数扩散。放着不管,上游配额由爬虫的抓取节奏决定。
//
// 闸门两层,顺序不能换:
//  1. **爬虫 UA 一律不放行**。已知爬虫读到的页面本来就不该由我们现掏钱去建 ——
//     真人的冷启动数据是前端 loader 走 /api/v1/public/papers/:id 拿的(见
//     frontend-user/src/features/browser/routes.tsx 的 prefetchPaperLoader),
//     那条路径带 seed 落库,与本闸门无关、不受影响。爬虫不跑 JS,永远走不到那条路径,
//     所以「给爬虫关掉 on-miss」不会让任何真人少看到一个字。
//  2. **非爬虫也要有界**。UA 是客户端自称的,谎报成 Chrome 就能绕过第 1 层;
//     全局每小时预算 + 单 IP 每小时上限把「伪装爬虫」的伤害封在一个可接受的常数里。
//
// 被拒绝时的行为与「实体确实不存在」完全一致(404 + noindex),不给爬虫任何
// 「再来一次也许就有了」的暗示。
//
// 实现刻意在进程内(sync.Mutex + 时间窗计数),不接 Redis:单副本部署,重启丢计数
// 的后果是「多放行不到一个小时的额度」,为它引入一个跨进程依赖不划算。
package config

import (
	"log/slog"
	"sync"
	"time"

	"scholar-backend/internal/crawlerwatch"

	"github.com/gin-gonic/gin"
)

const (
	// onMissPerIPHourly 单 IP 每小时上限。真人一次冷启动最多打开几个实体页,
	// 10 已经宽松;它防的是「一台机器换 UA 不换 IP 地刷」。
	onMissPerIPHourly = 10

	// onMissMaxTrackedIPs 单个时间窗内最多跟踪的 IP 数。超出后未记录过的 IP 一律拒绝
	// (fail-closed):走到这里说明请求源已经散到几千个 IP,那不是真人流量的形状,
	// 而放任 map 无界增长会把「防滥用」本身变成内存滥用。
	onMissMaxTrackedIPs = 4096

	// onMissWarnInterval 预算耗尽 WARN 的最小间隔。耗尽期每个请求都打 = 每小时几万行。
	onMissWarnInterval = time.Minute
)

// allowOnMissEnrich 判定本次请求能否触发一次上游现拉,并负责这条路径的可观测性。
//
// 放行走 INFO(每条带实体 ID + 剩余额度,`docker logs scholar_backend | grep ssr_onmiss`
// 就能看清谁在花钱);爬虫拒绝静默(稳态每天数万次);预算拒绝按分钟限频打 WARN。
// 闸门未构造(测试里直接 &Handler{} 拼出来的实例)时保持旧行为放行。
func (h *Handler) allowOnMissEnrich(c *gin.Context, kind, source, id string) bool {
	if h.onMissGate == nil {
		return true
	}
	ip := c.ClientIP()
	verdict, remaining, warnDrops := h.onMissGate.decide(c.Request.UserAgent(), ip, time.Now())
	if warnDrops > 0 {
		slog.Warn("ssr_onmiss budget exhausted",
			"dropped", warnDrops,
			"hourly_budget", h.onMissGate.hourlyBudget,
			"per_ip_budget", h.onMissGate.perIPBudget)
	}
	if verdict != onMissAllow {
		return false
	}
	slog.Info("ssr_onmiss enrich allowed",
		"kind", kind, "source", source, "id", id, "ip", ip, "remaining", remaining)
	return true
}

// onMissVerdict 闸门判定结果。
type onMissVerdict int

const (
	onMissAllow      onMissVerdict = iota // 放行:可以调上游
	onMissDenyBot                         // 已知爬虫 UA
	onMissDenyBudget                      // 全局每小时预算耗尽
	onMissDenyIP                          // 单 IP 每小时上限
)

// onMissGate 时间窗计数器。零值不可用,必须经 newOnMissGate 构造。
type onMissGate struct {
	hourlyBudget int // 0 = 不限预算(爬虫闸门仍然生效)
	perIPBudget  int

	mu          sync.Mutex
	windowStart time.Time
	used        int
	perIP       map[string]int

	// 预算类拒绝的累计计数与上次 WARN 时间,用于把 WARN 限频到 onMissWarnInterval 一条。
	dropped  int
	lastWarn time.Time
}

func newOnMissGate(hourlyBudget, perIPBudget int) *onMissGate {
	return &onMissGate{
		hourlyBudget: hourlyBudget,
		perIPBudget:  perIPBudget,
		perIP:        make(map[string]int),
	}
}

// decide 判定一次 on-miss 是否放行。
//
// 返回:
//   - verdict   判定结果
//   - remaining 本窗口剩余全局额度(不限预算时为 -1),仅在放行时有意义
//   - warnDrops >0 表示「调用方应当打一条 WARN」,值是自上次 WARN 以来累计被预算拒绝的次数
//
// 爬虫拒绝**不计入** warnDrops:那是稳态、每天六万次,打出来只会淹没日志;
// 爬虫抓取量本来就由 internal/crawlerwatch 转发到 umami 单独看。
func (g *onMissGate) decide(ua, ip string, now time.Time) (verdict onMissVerdict, remaining, warnDrops int) {
	// 爬虫闸门在锁外先判:不占锁、也不消耗任何预算额度 ——
	// 否则爬虫会把额度耗光,真人反而被自己的爬虫挤掉。
	if crawlerwatch.IsBot(ua) {
		return onMissDenyBot, 0, 0
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	// 翻滚窗口:满一小时整体清零。滑动窗口要保留逐请求时间戳,为这点精度不值得。
	if g.windowStart.IsZero() || now.Sub(g.windowStart) >= time.Hour {
		g.windowStart = now
		g.used = 0
		g.perIP = make(map[string]int)
	}

	if g.hourlyBudget == 0 {
		// 显式「不限」:预算与单 IP 上限一并解除(它是运维逃生口,不是半开状态)。
		g.used++
		return onMissAllow, -1, 0
	}

	deny := func(v onMissVerdict) (onMissVerdict, int, int) {
		g.dropped++
		if now.Sub(g.lastWarn) >= onMissWarnInterval {
			g.lastWarn = now
			n := g.dropped
			g.dropped = 0
			return v, 0, n
		}
		return v, 0, 0
	}

	if g.used >= g.hourlyBudget {
		return deny(onMissDenyBudget)
	}
	if ip != "" && g.perIPBudget > 0 {
		n, tracked := g.perIP[ip]
		if !tracked && len(g.perIP) >= onMissMaxTrackedIPs {
			return deny(onMissDenyIP)
		}
		if n >= g.perIPBudget {
			return deny(onMissDenyIP)
		}
		g.perIP[ip] = n + 1
	}
	g.used++
	return onMissAllow, g.hourlyBudget - g.used, 0
}
