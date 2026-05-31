// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// Package ctxutil — 集中的 context timeout 档位。
//
// **强制规则**:
//   - 任何 `context.WithTimeout(context.Background(), <魔数>)` 调用应改用本包的命名档位之一,
//     而不是写裸常量。命名档位让你一眼能看出"这是什么级别的操作", 调整 SLO 时只改一处。
//   - HTTP / WS handler 中的请求级 context 仍走 `c.Request.Context()`, 这里只管 **detach 出来的
//     后台任务** (e.g. 写 cache / 跑异步 / 写日志) 的超时。
//
// 档位粒度: 6 档, 覆盖 99% 场景:
//
//   | 档位             | 时长 | 典型用途                                                   |
//   |-----------------|------|-----------------------------------------------------------|
//   | CacheRead       | 200ms| Redis Get / 内存级 lookup; 卡住就 fail-open                |
//   | CacheWrite      | 2s   | Redis Set / 写本地缓存; 比 Read 宽一档容写穿透             |
//   | QuickIO         | 5s   | DB 单表查询 / OAuth 第三方 token 换取 / 小 RPC             |
//   | NormalIO        | 30s  | 跨服务调用 / agent push 配置 / 文件 metadata 读取          |
//   | LongIO          | 5min | 同步等 LLM 短响应 / 中等大小 PDF 解析 / minicod 批量查询    |
//   | BackgroundJob   | 30min| 异步审稿一轮全流程 / 长流任务 / 大批量数据迁移             |
//
// 例:
//
//   ctx, cancel := ctxutil.With(ctxutil.QuickIO)
//   defer cancel()
//   resp, err := http.Do(ctx, req)
//
// 不在表里 (e.g. 1h+ 的极特殊场景) 才用 `context.WithTimeout(context.Background(), x)` 直写,
// 同时加注释解释为什么常用档位不够用。
package ctxutil

import (
	"context"
	"time"
)

// Timeout 档位常量. 单位 time.Duration.
const (
	CacheRead     = 200 * time.Millisecond
	CacheWrite    = 2 * time.Second
	QuickIO       = 5 * time.Second
	NormalIO      = 30 * time.Second
	LongIO        = 5 * time.Minute
	BackgroundJob = 30 * time.Minute
)

// With 从 context.Background() 派生一个带 timeout 的新 ctx, 返回 (ctx, cancel)。
// 等价于 `context.WithTimeout(context.Background(), d)`, 但语义更清晰: 表示"我开了个全新的后台任务"。
//
// 用法:
//
//	ctx, cancel := ctxutil.With(ctxutil.NormalIO)
//	defer cancel()
//	res, err := svc.DoIt(ctx, ...)
func With(d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), d)
}

// WithParent 派生一个带 timeout 的 ctx, 父 ctx 取消时子 ctx 也取消。
// 用法: 请求级 ctx 内嵌套调用上游, 上游不应比本请求慢 → 用本函数收紧上限。
//
//	ctx, cancel := ctxutil.WithParent(c.Request.Context(), ctxutil.QuickIO)
//	defer cancel()
func WithParent(parent context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, d)
}
