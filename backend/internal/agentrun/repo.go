package agentrun

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"scholar-backend/internal/agentbridge"
)

// OutputRefMaxBytes —— output_ref JSON 列的硬上限。
// 🔴 这不是性能优化,是**契约执法**:产物正文永远在 workDir,DB 只存 {path, chars, evidence_ids}。
// 没有这条断言,一定有人图省事把整篇中间稿塞进 JSON 列 —— 然后 Run 列表查询开始拖库、
// journal 导出爆内存,而且是几个月后才发作、追不回是谁塞的。宁可在写入点当场拒绝。
const OutputRefMaxBytes = 4096

// 步状态(与 0048 表注释一致)。
const (
	StepPending = "pending"
	StepRunning = "running"
	StepDone    = "done"
	StepFailed  = "failed"
)

var (
	ErrNoStepClaimed   = errors.New("agentrun: no step claimed")
	ErrOutputRefTooBig = errors.New("agentrun: output_ref exceeds size limit (正文必须留在 workDir)")
)

// OutputRef —— step 产出的**引用**,不是正文。
type OutputRef struct {
	Path        string   `json:"path,omitempty"`         // 相对 workDir,如 run/steps/search.md
	Chars       int      `json:"chars,omitempty"`        // 正文字数(供 UI 与判据用,不含正文本身)
	EvidenceIDs []string `json:"evidence_ids,omitempty"` // 本步落账的 E 编号
	Note        string   `json:"note,omitempty"`         // 一句话摘要(给 admin/用户看,**不是**正文)
}

// Repo 是 Run 引擎的持久层。骑既有的 agentbridge.SagaStepRow(0048),**不新建 step 表**。
type Repo struct{ db *gorm.DB }

func NewRepo(db *gorm.DB) *Repo { return &Repo{db: db} }

// ── Run ──────────────────────────────────────────────────────────────────────

func (r *Repo) CreateRun(ctx context.Context, run *AgentRun) error {
	return r.db.WithContext(ctx).Create(run).Error
}

func (r *Repo) GetRun(ctx context.Context, id uint64) (*AgentRun, error) {
	var out AgentRun
	if err := r.db.WithContext(ctx).First(&out, id).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

// SetRunStatus 改 Run 状态;进终态时一并盖 finished_at。
// 🔴 用 `status NOT IN (终态)` 做条件更新:终态是**不可逆**的。
// 没有这个条件,一个迟到的 reconciler 就能把用户已取消的 Run 改回 running 继续烧钱。
func (r *Repo) SetRunStatus(ctx context.Context, id uint64, status, errMsg string) error {
	patch := map[string]any{"status": status, "updated_at": time.Now()}
	if errMsg != "" {
		patch["error"] = errMsg
	}
	if IsTerminal(status) {
		now := time.Now()
		patch["finished_at"] = &now
	}
	return r.db.WithContext(ctx).Model(&AgentRun{}).
		Where("id = ? AND status NOT IN ?", id, []string{StatusDone, StatusFailed, StatusCanceled}).
		Updates(patch).Error
}

// ActiveRunCount 全局活跃 Run 数(调度闸的分子)。
func (r *Repo) ActiveRunCount(ctx context.Context) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&AgentRun{}).
		Where("status IN ?", []string{StatusPlanning, StatusRunning}).Count(&n).Error
	return n, err
}

// ActiveRunCountForUser per-user 活跃 Run 数。
func (r *Repo) ActiveRunCountForUser(ctx context.Context, userID uint64) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&AgentRun{}).
		Where("user_id = ? AND status IN ?", userID, []string{StatusPlanning, StatusRunning}).Count(&n).Error
	return n, err
}

// ListRunsForUser 用户维度列表(最近优先)。
func (r *Repo) ListRunsForUser(ctx context.Context, userID uint64, limit int) ([]AgentRun, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	out := []AgentRun{}
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).
		Order("created_at DESC").Limit(limit).Find(&out).Error
	return out, err
}

// ── Step ─────────────────────────────────────────────────────────────────────

// SeedSteps 按模板把 Step 行一次性展开(幂等:靠 uk_saga_step 的 ON DUPLICATE 忽略)。
// 幂等很重要:Run 创建后若 backend 在展开中途被 kill,重启的 resume 会再调一次。
func (r *Repo) SeedSteps(ctx context.Context, runID uint64, featureKey string, tpl RunTemplate) error {
	saga := SagaIDFor(runID)
	rows := make([]agentbridge.SagaStepRow, 0, len(tpl.Steps))
	for _, s := range tpl.Steps {
		rows = append(rows, agentbridge.SagaStepRow{
			SagaID: saga, FeatureKey: featureKey, StepKey: s.Key, Status: StepPending,
		})
	}
	if len(rows) == 0 {
		return nil
	}
	// 幂等插入:撞 uk_saga_step(saga_id, step_key) 时忽略,不报错。
	return r.db.WithContext(ctx).
		Clauses(gormOnConflictDoNothing()).
		Create(&rows).Error
}

// ListSteps 取本 Run 的全部步(按 id 升序 = 模板声明序)。
func (r *Repo) ListSteps(ctx context.Context, runID uint64) ([]agentbridge.SagaStepRow, error) {
	out := []agentbridge.SagaStepRow{}
	err := r.db.WithContext(ctx).Where("saga_id = ?", SagaIDFor(runID)).
		Order("id ASC").Find(&out).Error
	return out, err
}

// ClaimNextStep —— **原子认领**下一个可跑的步。
//
// 🔴 MySQL 没有 RETURNING,所以是「先选候选 → 条件 UPDATE → 判 RowsAffected==1」三步。
//
//	条件 UPDATE 里必须**同时**带上 status='pending' 与租约条件:
//	  · 只判 status:两个 worker 同时读到同一行、同时 UPDATE,两个都会 RowsAffected==1(读已提交下
//	    第二个看到的仍是 pending)—— 于是同一步被跑两遍,烧两份钱、产物互相覆盖。
//	  · 带上 executor/lease 后,第二个 worker 的 WHERE 不再匹配,RowsAffected==0,老实放弃。
//	RowsAffected==1 是**唯一**的认领成功判据 —— 别用「UPDATE 没报错」代替它,那永远是 true。
//
// 返回 ErrNoStepClaimed 表示这一轮没抢到(正常情况,不是错误)。
func (r *Repo) ClaimNextStep(
	ctx context.Context, runID uint64, executorID string, lease time.Duration, maxRetry int,
) (*agentbridge.SagaStepRow, error) {
	saga := SagaIDFor(runID)
	now := time.Now()

	// 候选 = 本 Run 里**最早的未完成步**(pending 或 running),不做任何跳过。
	//
	// 🔴 串行语义就落在这个「不跳过」上。曾经写成「取最早的 pending 或租约过期的 running」——
	//    那会在第 1 步正常运行(running + 租约有效)时**跳过它去认领第 2 步**,
	//    两步并发跑、后一步读不到前一步的产物,而 Run 看起来一切正常。
	//    正确姿势:先无条件取最早未完成的那一行,再判它**本身**能不能认领;
	//    它若正被别人持有(running 且租约未过期),就谁也别动 —— 返回"没抢到"。
	var cand agentbridge.SagaStepRow
	err := r.db.WithContext(ctx).
		Where("saga_id = ? AND status IN ?", saga, []string{StepPending, StepRunning}).
		Order("id ASC").First(&cand).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNoStepClaimed // 没有未完成的步 = Run 已跑完(或全失败),由调用方判定
	}
	if err != nil {
		return nil, err
	}
	// 最早那步正被人持有且租约有效 → 本轮什么都不做(串行的全部含义)。
	if cand.Status == StepRunning && cand.LeaseUntil != nil && cand.LeaseUntil.After(now) {
		return nil, ErrNoStepClaimed
	}

	// 超出重试上限 → 直接判死,不再认领(DLQ)。
	if maxRetry > 0 && cand.Attempt >= maxRetry {
		_ = r.FailStep(ctx, cand.ID, "attempt exceeded maxRetry")
		return nil, ErrNoStepClaimed
	}

	res := r.db.WithContext(ctx).Model(&agentbridge.SagaStepRow{}).
		Where("id = ? AND status = ? AND (lease_until IS NULL OR lease_until < ?)",
			cand.ID, cand.Status, now).
		Updates(map[string]any{
			"status":      StepRunning,
			"attempt":     gorm.Expr("attempt + 1"),
			"executor_id": executorID,
			"lease_until": now.Add(lease),
			"updated_at":  now,
		})
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected != 1 {
		return nil, ErrNoStepClaimed // 被别人抢先了 —— 正常竞争,不是错误
	}

	// 回读认领后的真实行(attempt 已 +1;调用方要用它判是不是最后一次机会)。
	var claimed agentbridge.SagaStepRow
	if err := r.db.WithContext(ctx).First(&claimed, cand.ID).Error; err != nil {
		return nil, err
	}
	return &claimed, nil
}

// RenewLease 续租(长步执行中周期性调用,防 reconciler 误判 worker 已死)。
func (r *Repo) RenewLease(ctx context.Context, stepID uint64, executorID string, lease time.Duration) error {
	return r.db.WithContext(ctx).Model(&agentbridge.SagaStepRow{}).
		Where("id = ? AND executor_id = ? AND status = ?", stepID, executorID, StepRunning).
		Update("lease_until", time.Now().Add(lease)).Error
}

// CompleteStep 收口一步。ref 会被序列化进 output_ref,**超限直接拒绝**(见 OutputRefMaxBytes)。
func (r *Repo) CompleteStep(ctx context.Context, stepID uint64, turnID *uint64, ref OutputRef) error {
	raw, err := json.Marshal(ref)
	if err != nil {
		return err
	}
	if len(raw) > OutputRefMaxBytes {
		return ErrOutputRefTooBig
	}
	patch := map[string]any{
		"status": StepDone, "output_ref": json.RawMessage(raw),
		"lease_until": nil, "updated_at": time.Now(),
	}
	if turnID != nil {
		patch["turn_id"] = *turnID
	}
	return r.db.WithContext(ctx).Model(&agentbridge.SagaStepRow{}).
		Where("id = ?", stepID).Updates(patch).Error
}

// RequeueStep 把一步退回 pending(轮尽分页 / 判据未达标)。**不算失败**,attempt 已在认领时 +1。
func (r *Repo) RequeueStep(ctx context.Context, stepID uint64, reason string) error {
	return r.db.WithContext(ctx).Model(&agentbridge.SagaStepRow{}).
		Where("id = ?", stepID).
		Updates(map[string]any{
			"status": StepPending, "lease_until": nil,
			"error": reason, "updated_at": time.Now(),
		}).Error
}

func (r *Repo) FailStep(ctx context.Context, stepID uint64, reason string) error {
	return r.db.WithContext(ctx).Model(&agentbridge.SagaStepRow{}).
		Where("id = ?", stepID).
		Updates(map[string]any{
			"status": StepFailed, "lease_until": nil,
			"error": reason, "updated_at": time.Now(),
		}).Error
}

// ReconcileLeases 把租约过期的 running 步退回 pending(worker 崩了/容器被杀)。
// 只碰 `run:` 前缀的 saga —— 0048 是通用底座,别的编排(如 peerreview 自己的 saga)骑同一张表,
// 回收它们的步会破坏那些编排自己的状态机。
func (r *Repo) ReconcileLeases(ctx context.Context) (int64, error) {
	res := r.db.WithContext(ctx).Model(&agentbridge.SagaStepRow{}).
		Where("saga_id LIKE ? AND status = ? AND lease_until IS NOT NULL AND lease_until < ?",
			"run:%", StepRunning, time.Now()).
		Updates(map[string]any{
			"status": StepPending, "lease_until": nil, "updated_at": time.Now(),
		})
	return res.RowsAffected, res.Error
}

// gormOnConflictDoNothing —— SeedSteps 的幂等插入子句。抽成函数只为把 clause 依赖收在一处。
func gormOnConflictDoNothing() clause.OnConflict {
	return clause.OnConflict{DoNothing: true}
}
