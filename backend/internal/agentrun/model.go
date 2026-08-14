// Package agentrun —— 科研内核的 Run 引擎(2026-08 架构方案 Phase 1)。
//
// ── 它把哪条因果链改了 ──────────────────────────────────────────────────────
// 今天:一条用户请求 = 一条 turn = **一次性内存事务**。24 轮到顶就 round_cap 终结,
//
//	会话闲置 30 分钟就重灌丢证据,崩了就没。科研任务(系统综述、荟萃分析)动辄几十轮、
//	跨小时,这个形状装不下 —— 这才是科研能力上不去的**结构**原因,不是模型不够聪明。
//
// 之后:一条科研请求 = 一个持久 **Run**;Run = 一串 **Step**;
//
//	每个 Step 就是一次**更短的普通 runTurn**(maxRounds 6~8),
//	交接靠 MySQL(agent_runs + agent_saga_steps)+ workDir 的 run/ 产物,**不靠内存 messages**。
//
// ── 三条不许破的边界 ────────────────────────────────────────────────────────
//  1. **不新建执行路径**。Step 仍然走 f.ServerSideChatStreaming → runTurn,
//     与今天 peerreview 在生产用的是同一条路。新建第二条执行路径 = 两套行为要各修一遍。
//  2. **Step 串行,并发度恒为 1,零 fan-out**。全容器只有 2 个 turn 槽
//     (agent/src/server/admission.ts:13,按 1.5G 内存标定),派发子代理会让一个用户
//     做综述就占死整个容器。串行反而对槽压是**净减压**:持槽从「一段 15 分钟不可抢占」
//     变成「一串 3 分钟可抢占片段」。
//  3. **产物正文永远在 workDir,DB 只存引用**。理由是模型视野:workDir 是模型能 Read 的
//     天然位置;塞进 DB 就得再造一条注入通道,而且 JSON 列会被中间稿撑爆。
package agentrun

import "time"

// Run 状态机。终态三个:done / failed / canceled。
const (
	// StatusPlanning:Run 行已建、Step 行尚未展开(或正在展开)。
	StatusPlanning = "planning"
	// StatusRunning:至少一步已排队/在跑。
	StatusRunning = "running"
	// StatusAwaitingUser:需要用户确认才能继续(Phase 2 的升级入口用;Phase 1 不产生)。
	StatusAwaitingUser = "awaiting_user"
	StatusDone         = "done"
	StatusFailed       = "failed"
	StatusCanceled     = "canceled"
)

// IsTerminal 判终态。**唯一真源** —— 调度、reconciler、handler 都读它,
// 别在别处再写一份 `s == "done" || s == "failed"`:漏一个分支就会让 canceled 的 Run 被继续推进。
func IsTerminal(status string) bool {
	switch status {
	case StatusDone, StatusFailed, StatusCanceled:
		return true
	}
	return false
}

// AgentRun = agent_runs 一行(迁移 0101/0102)。
type AgentRun struct {
	ID             uint64     `gorm:"column:id;primaryKey;autoIncrement"`
	UserID         uint64     `gorm:"column:user_id;not null;default:0"`
	FeatureKey     string     `gorm:"column:feature_key;type:varchar(64);not null;default:''"`
	AgentSessionID string     `gorm:"column:agent_session_id;type:varchar(64);not null;default:''"`
	TemplateKey    string     `gorm:"column:template_key;type:varchar(64);not null;default:''"`
	Status         string     `gorm:"column:status;type:varchar(16);not null;default:'planning'"`
	Title          string     `gorm:"column:title;type:varchar(255);not null;default:''"`
	Request        string     `gorm:"column:request;type:text"`
	Error          string     `gorm:"column:error;type:text"`
	CreatedAt      time.Time  `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP(3)"`
	UpdatedAt      time.Time  `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP(3)"`
	FinishedAt     *time.Time `gorm:"column:finished_at"`
}

func (AgentRun) TableName() string { return "agent_runs" }

// SagaID 是本 Run 在 agent_saga_steps 里的命名空间。
// 🔴 前缀不可改:reconciler 与 repo 都按 `run:` 前缀区分「Run 引擎的步」与
// 「其它编排(如 peerreview 自己的 saga)的步」—— 改了会让两类步互相回收。
func (r *AgentRun) SagaID() string { return SagaIDFor(r.ID) }

// SagaIDFor 见 AgentRun.SagaID。抽成函数是为了 repo/engine 在只有 id 时也能算,
// 且**只有这一处拼串**(拼串散落 = 前缀漂移 = 两类步互相回收)。
func SagaIDFor(runID uint64) string {
	return "run:" + itoa(runID)
}

func itoa(v uint64) string {
	if v == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = byte('0' + v%10)
		v /= 10
	}
	return string(b[i:])
}
