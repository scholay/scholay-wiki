// ============================================================================
// agentbridge/displacement — "多窗口接管" 实现
//
// 用户在 N 个 tab 同时打开同一 feature 时, 后端只保留最新一条 WS 活跃,
// 前面的窗口收到 displaced 帧 + Close(1000) 后由前端弹 banner 提示 "已在其他
// 窗口打开"。
//
// 流程:
//   1. HandleWS 升级成功后 → 构造 displacedConn → Swap 到 activeWSConns
//   2. 拿到的 prev (如有) → 异步 displace() 给老 WS 发帧 + 关
//   3. WS 退出时 (defer) → CompareAndDelete 摘掉自己
//
// 跟 pipe 协作:
//   - displacer 写 front 时跟 pipe 共用同一把 frontWriteMu, 避免并发 WriteMessage
//     违反 gorilla websocket 的 "writes from one goroutine" 契约
//   - displacer 用 closeOnce 自闭锁, 即便被 pipe 自然 Close 路径并发触发也安全
// ============================================================================

package agentbridge

import (
	"log/slog"
	"sync"
	"time"

	gorillaws "github.com/gorilla/websocket"
)

// DisplacedReason 是 displaced 帧的 reason 字段, 让前端区分被踢的根因。
// 当前只有一种 reason (session_taken_over), 留段位是为了将来扩展:
//   - token_revoked: 管理员强制下线 / 改密
//   - quota_exhausted: 配额耗尽强制中断
//   - server_shutdown: 服务端 graceful shutdown 告知
//
// 新增 reason 时同步更新前端 ClientMessage / ServerMessage 协议。
type DisplacedReason string

const (
	// ReasonSessionTakenOver — 同账号在另一个 tab/设备打开同一 feature, 后端只留新的。
	ReasonSessionTakenOver DisplacedReason = "session_taken_over"
)

// displacedFramePayload 是发给被挤掉的老 WS 的最后一帧 JSON。
// 前端 useSmartSearchSocket / claw 的 socket 识别 type=displaced → 不重连 + 弹接管 banner。
// 协议字段:
//
//	type    = "displaced"     (常量, JSON 协议判别)
//	reason  = DisplacedReason (枚举码, 前端按 reason 决定 UI 文案 + 行为)
//	message = 人话 (zh)        (兜底文案, 前端没识别 reason 时直接显示)
var displacedFramePayload = []byte(
	`{"type":"displaced","reason":"session_taken_over","message":"此会话已在其他窗口打开, 当前窗口已断开。"}`,
)

// displacementWriteTimeout 是 displacer 写帧时的硬上限, 防止老 WS 已经死了但
// TCP 还没探测到时无限阻塞 displacer goroutine。
const displacementWriteTimeout = 3 * time.Second

// displacedConn 是 activeWSConns 里的最小记账单元。
//
// 字段 conn 是前端 WS; writeMu 跟 pipe 共用同一把 — 因为 displace 时机可能与
// pipe 的 "agent→front 转发" 并发, 必须互斥写。featureKey/userID/agentSID 仅用于
// log, 方便排查 "什么时候哪个用户哪个 session 被踢掉的"。
type displacedConn struct {
	conn       *gorillaws.Conn
	writeMu    *sync.Mutex
	featureKey string
	userID     uint
	agentSID   string

	closeOnce sync.Once
}

// displace 给老 WS 发 displaced 帧 + Close(1000)。幂等 (重复调用只会触发一次)。
//
// 关键设计:
//   - 用 CloseNormalClosure (1000), 前端 onclose 不会触发自动重连
//     (前端 reconnect 只在非正常关闭时触发, 见 useSmartSearchSocket)
//   - SetWriteDeadline 兜底, 老 WS TCP 卡住时不阻塞 goroutine
//   - 拿 writeMu 而不是用 gorilla 的 WriteControl 路径 — WriteMessage 和 WriteControl
//     之间 gorilla 不互锁, 但跟 pipe 的 WriteMessage 互锁是必要的
func (d *displacedConn) displace() {
	d.closeOnce.Do(func() {
		slog.Info("agentbridge ws: displacing old connection",
			"feature", d.featureKey, "user_id", d.userID, "session_id", d.agentSID)

		d.writeMu.Lock()
		_ = d.conn.SetWriteDeadline(time.Now().Add(displacementWriteTimeout))
		// 1) 业务帧: 让前端 banner 识别原因
		_ = d.conn.WriteMessage(gorillaws.TextMessage, displacedFramePayload)
		// 2) close frame: code=1000 表示这是有序正常关闭, 前端不应重连
		_ = d.conn.WriteControl(
			gorillaws.CloseMessage,
			gorillaws.FormatCloseMessage(gorillaws.CloseNormalClosure, "displaced"),
			time.Now().Add(displacementWriteTimeout),
		)
		d.writeMu.Unlock()

		// 3) 真关掉 socket — pipe 那边的 read 循环会得到 close error 并自然收口
		_ = d.conn.Close()
	})
}
