// Package upstream 提供 scholay backend 调用外部 HTTP API 的统一基础设施。
//
// # 设计目标
//
// 历史上 backend 调外部接口的代码散落各处, 每个域 (minicod / wechat / payment /
// seosubmit / umami / ...) 各自实现 retry / timeout / breaker / 日志, 导致:
//
//   - 可观测性割裂: 慢 / 失败原因要扒 N 个包才能拼出全貌
//   - 重试策略不一致 (5 次 / 0 次 / 切账户)
//   - 错误分类靠 strings.Contains, 脆弱
//   - 部分上游缺 breaker 保护, 上游抖动会拖整个 backend
//
// 本包把这些共性沉淀成一份 Client 配置 + 一组 typed error, 让业务侧只关心
// "这是哪个 endpoint, 入参什么"。
//
// # 主要组件
//
//   - [Client]     一个上游 = 一个 Client; Builder 链式构造, 进程内长期持有
//   - [Request] / [Response]  统一的请求/响应信封
//   - [Error]      typed error 信封, 配合 [ErrAuth] / [ErrRateLimit] 等 sentinel
//   - [RetryConfig]  指数退避 + jitter
//   - [BreakerConfig] gobreaker 的薄封装 + 按 name 注册
//   - [BeforeHook] / [AfterHook]  配额检查 / usage 记账
//
// # 典型用法
//
//	// 在 bootstrap 阶段构造一次, 跨 request 复用
//	minicodCli, err := upstream.New("minicod").
//	    BaseURL("https://open.scholay.com").
//	    HTTPClient(httpclient.Default()).
//	    Retry(upstream.RetryConfig{Max: 3}).
//	    Breaker(upstream.BreakerConfig{}).
//	    Build()
//
//	// 调用 — JSON 便利方法
//	var papers PapersResp
//	if err := minicodCli.GetJSON(ctx, "/v1/papers/search", url.Values{
//	    "q":     {"transformer"},
//	    "limit": {"5"},
//	}, &papers); err != nil {
//	    switch {
//	    case errors.Is(err, upstream.ErrRateLimit):
//	        // 429, 已经重试 3 次还是 429 → 等会儿再试
//	    case errors.Is(err, upstream.ErrAuth):
//	        // 401/403 → 换 thirdparty 账户重试 (业务侧自己控制)
//	    case errors.Is(err, upstream.ErrCircuit):
//	        // breaker 打开, 上游可能挂了 → 直接告诉用户稍后重试
//	    default:
//	        return fmt.Errorf("call minicod: %w", err)
//	    }
//	}
//
// # 复用现有基建
//
//   - HTTP 连接池走 [scholar-backend/internal/common/httpclient]
//     默认 Default(), 流式可传 Streaming(), 长任务用 LongRunning()
//   - breaker 用 gobreaker, 注册表是本包内 process-global map
//   - slog 五元组 (upstream / endpoint / status / latency_ms / attempt)
//     自动注入, 不需要业务侧自己加
//
// # 跟现有 common/circuitbreaker 的关系
//
// 老包 [scholar-backend/internal/common/circuitbreaker] 把 breaker 在 init
// 时全部声明出来 (SemanticScholarBreaker / AIServiceBreaker / ...), 是 v1。
// 新代码请走本包的 Builder.Breaker(); 老代码继续用 v1 不冲突。
//
// # 不在本包范围内
//
//   - WebSocket (用各 feature 的 ws hook)
//   - SMTP 邮件 (用 net/smtp 即可)
//   - Aliyun SDK 等已经自带 client 的 SDK (没必要再套一层)
//   - scholar_agent 调用 (已经走 internal/agentbridge)
package upstream
