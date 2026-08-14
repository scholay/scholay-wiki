// ============================================================================
// 智能审稿 v3 — GORM repository
//
// 三表 CRUD,纯 SQL 操作。所有"是不是该建草稿 / 是否能跳到下一步"业务判断
// 都在 [[Service]] 里,这里只管把对象存回去 / 查出来。
// ============================================================================

package peerreview

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrNotFound 是 service / handler 层判断 404 的 sentinel。
var ErrNotFound = errors.New("peerreview: not found")

// isDuplicateKey 判断是否 MySQL 唯一键冲突 (1062)。check→insert 的 TOCTOU 竞态下,
// 让并发的第二个 INSERT 命中唯一索引兜底,再回查复用(同 prism/files.go 的做法)。
func isDuplicateKey(err error) bool {
	var me *mysql.MySQLError
	return errors.As(err, &me) && me.Number == 1062
}

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// ─── Submission ──────────────────────────────────────────────────────────

// CreateDraft 新建草稿;调用方只需指定 user/mode。
//
// 返回 created:true=确实插了新行;false=并发下命中唯一索引
// uk_one_draft_per_user_mode(别的请求已建)→ 回查复用了既有草稿。
// 调用方据 created 决定是否要为草稿绑 agent session(复用时不要重复建)。
func (r *Repository) CreateDraft(userID uint64, mode string) (sub *Submission, created bool, err error) {
	s := &Submission{
		UserID: userID,
		Mode:   mode,
		Status: "draft",
		Step:   1,
	}
	if e := r.db.Create(s).Error; e != nil {
		// 唯一索引兜底:并发同 (user,mode) 同时建草稿,落败方回查复用赢家那条。
		if isDuplicateKey(e) {
			if existing, e2 := r.LatestDraftOfMode(userID, mode); e2 == nil {
				return existing, false, nil
			}
		}
		return nil, false, e
	}
	return s, true, nil
}

// GetByID 按 id 取,带 user 校验(防越权)。
func (r *Repository) GetByID(id uint64, userID uint64) (*Submission, error) {
	var s Submission
	err := r.db.Where("id = ? AND user_id = ?", id, userID).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &s, err
}

// GetByIDInternal 按 id 取(不校验 user)— 仅供后端 agent runner 等服务端流程使用。
func (r *Repository) GetByIDInternal(id uint64) (*Submission, error) {
	var s Submission
	err := r.db.First(&s, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &s, err
}

// LatestActiveDraftOfMode 找用户最近一条 "已开始" 的草稿 —— 必须至少有 1 个 asset。
//
// 跟 LatestDraftOfMode 的区别:
//   - LatestDraftOfMode: 任何 draft 都返(包括空草稿,resume-or-create 旧逻辑用)
//   - LatestActiveDraftOfMode: 只返"用户传过至少一个文件"的草稿(避免误激活空草稿)
//
// 业务定义:用户刚进 wizard 还没传文件 → 没有"激活的草稿";一传文件就有了。
// 用 EXISTS 子查询比 JOIN 高效, 且不依赖 manuscript_asset_id (附件也算活跃)。
func (r *Repository) LatestActiveDraftOfMode(userID uint64, mode string) (*Submission, error) {
	var s Submission
	err := r.db.
		Where("user_id = ? AND mode = ? AND status = ?", userID, mode, "draft").
		Where("EXISTS (SELECT 1 FROM peer_review_assets WHERE submission_id = peer_review_submissions.id)").
		Order("updated_at DESC").
		First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &s, err
}

// CountAssets 统计 submission 的 asset 数量, 不区分 role。
// DeleteAsset 后判 "是否还剩文件" 用 — 0 个就把整条 draft 自动清掉。
func (r *Repository) CountAssets(submissionID uint64) (int64, error) {
	var n int64
	return n, r.db.Model(&Asset{}).Where("submission_id = ?", submissionID).Count(&n).Error
}

// LatestDraftOfMode 找用户 (mode) 最近一条 status='draft' 的草稿。
//
// 用于 wizard 入口的 "resume-or-create" 流程: 如果上次进入 wizard 但没投递,
// 下次再进同一模式的 wizard 会自动定位到那条草稿继续完成, 而不是每次新建空草稿
// 堆积一堆死草稿。
//
// 已完成 / 失败的提交不算 — 即便它是 "最近一条"; 我们只回退到草稿。
// 没草稿 → ErrNotFound, 调用方接着 CreateDraft。
func (r *Repository) LatestDraftOfMode(userID uint64, mode string) (*Submission, error) {
	var s Submission
	err := r.db.Where("user_id = ? AND mode = ? AND status = ?", userID, mode, "draft").
		Order("updated_at DESC").
		First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &s, err
}

// ListByUser 列出某用户的全部投稿,按 created_at 倒序。
//
// Omit 掉列表页用不到的重列(letter_body 是 mediumtext 审稿信全文,abstract/两个 json 也可观):
// toListItem 只读 id/mode/status/title/journal_name/school_name/degree_type/submitted_at/completed_at,
// service 只额外读 status+id 批量填 ChiefDecision(gorm:"-" 派生列,不受 Omit 影响)。
// Omit 失败安全:GORM 若忽略它顶多退回"全列查询"的原行为,绝不会把需要的列查成空。
func (r *Repository) ListByUser(userID uint64, mode string) ([]Submission, error) {
	q := r.db.
		Omit("abstract", "journal_meta_json", "letter_body", "extra_meta_json").
		Where("user_id = ?", userID).
		Order("created_at DESC")
	if mode != "" {
		q = q.Where("mode = ?", mode)
	}
	var items []Submission
	return items, q.Find(&items).Error
}

// PatchSubmission 局部更新 —— 接受一个 map 直接写,字段名跟 column 对齐。
// ⚠️ 无状态条件、也拿不到 RowsAffected:**不要**用它做「起跑」类转态(那是 ClaimStatus 的活)。
func (r *Repository) PatchSubmission(id uint64, fields map[string]any) error {
	if len(fields) == 0 {
		return nil
	}
	return r.db.Model(&Submission{}).Where("id = ?", id).Updates(fields).Error
}

// ClaimStatus 条件转态:仅当当前 status == from 才写入 fields(其中应含新 status),
// 返回是否**本次调用抢到**。并发下只有一个执行流拿 true,其余拿 false。
//
// 🔴 2026-08-02 计费审计 P1-8:审稿是全平台单次成本最高的功能,而它的三条起跑口
// (Submit / AdvanceStep / RetryReview)全是「GetByID 读状态 → 内存判定 → 无条件 UPDATE →
// 起后台 goroutine」的 check-then-act。两个几乎同时到达的请求会双双通过幂等守卫、双双通过
// 只读的额度闸、双双 UPDATE 成功(后者静默覆盖前者),然后在**同一条 agent session** 上并行
// 跑两整场审稿:agent 侧的 inFlight 只是每连接的,而 SessionMeta 按 sid 全局共享、
// runTurn 的结果整体替换 meta.messages,于是两路互相丢消息、污染上下文;DB 侧 UpsertReport 的
// OnConflict UpdateAll 又让同一 (submission_id, role) 静默互相覆盖 —— 既多烧一整场 token,
// 又可能产出被污染的审稿结论。
//
// 本包其实早就有这个范式(CreateDraft 的唯一键兜底、DeleteManuscriptIfMatch),只是起跑口没用。
func (r *Repository) ClaimStatus(id uint64, from string, fields map[string]any) (bool, error) {
	if len(fields) == 0 {
		return false, nil
	}
	res := r.db.Model(&Submission{}).Where("id = ? AND status = ?", id, from).Updates(fields)
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

// ClaimComputeState 抢「向导某一步的计算权」:仅当仍是草稿且当前 compute_state 属于 fromStates
// (idle / failed = 空闲可跑)才置成 to,返回是否抢到。用于 AdvanceStep 的两条 LLM 分支 ——
// 那里的 `ComputeState != idle && != failed` 是内存判定,并发下两个「下一步」会双双通过、
// 各自 resetAgentSession 再各自起 goroutine(向导单轮历史上烧到过 10-17M token)。
func (r *Repository) ClaimComputeState(id uint64, fromStates []string, to string) (bool, error) {
	res := r.db.Model(&Submission{}).
		Where("id = ? AND status = 'draft' AND compute_state IN ?", id, fromStates).
		Updates(map[string]any{"compute_state": to, "compute_error": sql.NullString{}})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

// MarkSubmitted 把草稿从 draft → queued,绑定 agent session;
// 业务层在调这之前应已校验 step==4 + agreed + 必填字段齐。
func (r *Repository) MarkSubmitted(id uint64, agreedAt time.Time, agentSessionID string) error {
	return r.PatchSubmission(id, map[string]any{
		"status":           "queued",
		"agreed_at":        agreedAt,
		"agent_session_id": agentSessionID,
		"submitted_at":     time.Now(),
	})
}

// DeleteSubmission 删主行 — peer_review_assets / reports / step_cache 走 FK CASCADE 自动清。
// MinIO 对象 + agent session 由 service 层在调用本方法前处理。
func (r *Repository) DeleteSubmission(id uint64) error {
	return r.db.Delete(&Submission{}, id).Error
}

// MarkReviewing / MarkCompleted / MarkFailed 是 agent runner 用的转态钩子。
func (r *Repository) MarkReviewing(id uint64) error {
	return r.PatchSubmission(id, map[string]any{"status": "reviewing"})
}

func (r *Repository) MarkCompleted(id uint64) error {
	return r.PatchSubmission(id, map[string]any{
		"status":       "completed",
		"completed_at": time.Now(),
	})
}

func (r *Repository) MarkFailed(id uint64, reason string) error {
	return r.PatchSubmission(id, map[string]any{
		"status":        "failed",
		"failed_reason": reason,
	})
}

// ─── 卡死复位 (stuck draft / stranded review 兜底) ──────────────────────────

// ReconcileStaleComputingDraftsOnBoot: 进程重启后, computing_meta/letter 的 wizard 步骤
// (其 goroutine 已随旧进程消失, 且是用户驱动的快步骤)复位 failed 让用户重试。
// **reviewing 行不在此处判失败** —— 改由 Service.ReconcileStaleOnBoot 重新拉起 runReviewBackground
// 续审(发版后自动续上, 用户基本无感)。返回复位的草稿计算行数。
//
// **单实例部署假设**: 启动时把所有 in-progress 行判为"上个进程残留"。若将来横向扩容多实例,
// 需改成只扫 updated_at 超阈值的行, 以免误杀其它实例正在跑的任务 (当前 docker-compose 单后端)。
func (r *Repository) ReconcileStaleComputingDraftsOnBoot() (int64, error) {
	d := r.db.Model(&Submission{}).
		Where("compute_state IN ?", []string{"computing_meta", "computing_letter"}).
		Updates(map[string]any{"compute_state": "failed", "compute_error": "服务重启中断, 请重试"})
	return d.RowsAffected, d.Error
}

// StrandedReviewIDs: 进程重启后仍处于 queued/reviewing 的审稿行 ID —— 其推进 goroutine 已随旧
// 进程消失, 由 Service 在 boot 时重新拉起 runReviewBackground 续审(UpsertReport 已幂等, 重跑安全)。
// 单实例假设同上。
func (r *Repository) StrandedReviewIDs() ([]uint64, error) {
	var ids []uint64
	err := r.db.Model(&Submission{}).
		Where("status IN ?", []string{"queued", "reviewing"}).
		Pluck("id", &ids).Error
	return ids, err
}

// FailStaleComputing: 周期兜底 —— 把 compute_state 卡在 computing_* 且 updated_at 超过 olderThan
// 的草稿行复位 failed。meta/letter 受 LongIO (~5min) context 约束, 正常 ≤5min 完成; 超时多半是
// 没崩但卡死 / 漏复位。reviewing 可能合理地耗时很久 (4 轮 agent), 不在此扫。返回复位行数。
func (r *Repository) FailStaleComputing(olderThan time.Duration) (int64, error) {
	cutoff := time.Now().Add(-olderThan)
	res := r.db.Model(&Submission{}).
		Where("compute_state IN ?", []string{"computing_meta", "computing_letter"}).
		Where("updated_at < ?", cutoff).
		Updates(map[string]any{"compute_state": "failed", "compute_error": "处理超时, 请重试"})
	return res.RowsAffected, res.Error
}

// ─── Asset ───────────────────────────────────────────────────────────────

func (r *Repository) CreateAsset(a *Asset) error {
	return r.db.Create(a).Error
}

func (r *Repository) ListAssets(submissionID uint64) ([]Asset, error) {
	var items []Asset
	return items, r.db.Where("submission_id = ?", submissionID).
		Order("created_at ASC").Find(&items).Error
}

func (r *Repository) GetAsset(id, submissionID uint64) (*Asset, error) {
	var a Asset
	err := r.db.Where("id = ? AND submission_id = ?", id, submissionID).First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &a, err
}

func (r *Repository) DeleteAsset(id, submissionID uint64) error {
	return r.db.Where("id = ? AND submission_id = ?", id, submissionID).
		Delete(&Asset{}).Error
}

// DeleteManuscriptIfMatch 如果当前主稿件 id == aid,把 submission.manuscript_asset_id 清空;
// 用户删了主稿件后,前端 nextDisabled 会重新判 "无 manuscript"。
func (r *Repository) DeleteManuscriptIfMatch(submissionID, aid uint64) error {
	return r.db.Model(&Submission{}).
		Where("id = ? AND manuscript_asset_id = ?", submissionID, aid).
		Update("manuscript_asset_id", sql.NullInt64{}).Error
}

func (r *Repository) SetManuscriptAsset(submissionID, aid uint64) error {
	return r.PatchSubmission(submissionID, map[string]any{"manuscript_asset_id": aid})
}

// ─── Report ──────────────────────────────────────────────────────────────

func (r *Repository) UpsertReport(rep *Report) error {
	// 同 (submission_id, role) 走 ON DUPLICATE KEY UPDATE。
	// 之前是 r.db.Save(rep) —— rep.ID=0 时 Save 走 INSERT, 同一 submission 重跑(或 chatWithRetry
	// 之后再写)会撞唯一键 uk_submission_role(submission_id, role)报错 → 整单 markFailed。
	// 改成显式 OnConflict + UpdateAll: 冲突时按新值整行覆盖(重跑=重审, 覆盖语义正确)。
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "submission_id"}, {Name: "role"}},
		UpdateAll: true,
	}).Create(rep).Error
}

func (r *Repository) ListReports(submissionID uint64) ([]Report, error) {
	var items []Report
	return items, r.db.Where("submission_id = ?", submissionID).
		Order("created_at ASC").Find(&items).Error
}

func (r *Repository) GetReportByRole(submissionID uint64, role string) (*Report, error) {
	var rep Report
	err := r.db.Where("submission_id = ? AND role = ?", submissionID, role).First(&rep).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &rep, err
}

// CountReports 给 agent runner 判 "4 份齐了" 用。
func (r *Repository) CountReports(submissionID uint64) (int64, error) {
	var n int64
	return n, r.db.Model(&Report{}).Where("submission_id = ?", submissionID).Count(&n).Error
}

// ChiefReportsBySubmissionIDs 批量取一批投稿的主审报告 (role='chief'), 列表页"决议"列用。
// 只选 recommendation + content_md (够算决议结果, content_md 用于旧脏数据 recommendation=NULL 时复原)。
// 空 ids → 直接返回空 map, 不打 DB。
func (r *Repository) ChiefReportsBySubmissionIDs(ids []uint64) (map[uint64]Report, error) {
	out := make(map[uint64]Report, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	var items []Report
	err := r.db.
		Select("submission_id", "recommendation", "decision", "content_md").
		Where("role = ? AND submission_id IN ?", "chief", ids).
		Find(&items).Error
	if err != nil {
		return nil, err
	}
	for i := range items {
		out[items[i].SubmissionID] = items[i]
	}
	return out, nil
}

// ─── 0058 新增: revision bumps + StepCache CRUD + ComputeState 切换 ──────

// BumpAssetsRevision = assets_revision +=1 + **清空所有下游 AI 衍生字段**。
//
// 文件变了 ⇒ 之前 AI 抽出的 title/abstract/keywords/subjects/type 都基于旧稿件,
// 已经全无意义; cover letter 又依赖 meta 所以也无效。
// 一次性清空, 前端 polling 自动看到空表单 + 引导用户重新走 AI 识别。
//
// 注:journal_meta_json / school_* 不是 AI 衍生, 不在这里清(那是用户选的)。
func (r *Repository) BumpAssetsRevision(id uint64) error {
	return r.db.Exec(`
		UPDATE peer_review_submissions
		   SET assets_revision = assets_revision + 1,
		       title = NULL,
		       abstract = NULL,
		       extra_meta_json = NULL,
		       letter_body = NULL
		 WHERE id = ?`, id).Error
}

// BumpMetaRevision = meta_revision +=1 + 清 letter_body。
//
// title/abstract/keywords/journal 任一改变 ⇒ 之前起草的 letter 不再适用。
// 注意 PatchSubmission 在写 title/abstract/extraMeta 的同时 bump meta,
// 不会清 title 自己 (因为是用户刚刚 PATCH 进去的, 清了就丢了)。
func (r *Repository) BumpMetaRevision(id uint64) error {
	return r.db.Exec(`
		UPDATE peer_review_submissions
		   SET meta_revision = meta_revision + 1,
		       letter_body = NULL
		 WHERE id = ?`, id).Error
}

func (r *Repository) BumpLetterRevision(id uint64) error {
	return r.db.Exec(
		"UPDATE peer_review_submissions SET letter_revision = letter_revision + 1 WHERE id = ?", id,
	).Error
}

// SetAgentSession 把新建 / 重建 的 agent session id 写到 submission。
// Reset (assets bump) 流程会先 DELETE 旧 session, 再 CreateSession, 再调用本方法。
func (r *Repository) SetAgentSession(id uint64, sessionID string) error {
	return r.PatchSubmission(id, map[string]any{"agent_session_id": sessionID})
}

// SetComputeState 单独抽出来, advance flow 高频调用 (computing_* → idle / failed)。
func (r *Repository) SetComputeState(id uint64, state string, errMsg string) error {
	fields := map[string]any{"compute_state": state}
	if errMsg != "" {
		fields["compute_error"] = errMsg
	} else {
		fields["compute_error"] = sql.NullString{}
	}
	return r.PatchSubmission(id, fields)
}

// SetExtraMeta 把 ExtractedMeta (keywords/subjects/type) 序列化进 extra_meta_json 列。
// service 层负责 JSON 序列化, 这里只接受 raw bytes。
func (r *Repository) SetExtraMeta(id uint64, payload json.RawMessage) error {
	return r.PatchSubmission(id, map[string]any{"extra_meta_json": payload})
}

// ─── StepCache CRUD ────────────────────────────────────────────────────

// GetStepCache 返回 (cache, nil) 命中; (nil, ErrNotFound) 未命中。
func (r *Repository) GetStepCache(submissionID uint64, step uint8) (*StepCache, error) {
	var c StepCache
	err := r.db.Where("submission_id = ? AND step = ?", submissionID, step).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &c, err
}

// UpsertStepCache 复合 PK 冲突时覆写 — 永远只有一行 per (submission, step)。
func (r *Repository) UpsertStepCache(c *StepCache) error {
	return r.db.Save(c).Error
}

// DeleteAllStepCache 删指定 submission 全部 step cache。
// 用于 "agent session 被 reset" 后让所有缓存失效。
func (r *Repository) DeleteAllStepCache(submissionID uint64) error {
	return r.db.Where("submission_id = ?", submissionID).Delete(&StepCache{}).Error
}

// ─── helpers ─────────────────────────────────────────────────────────────

// rawJSONOrNull 在 service 层把 nil/empty 标准化为 "null" 字面,避免存进 DB 报 invalid JSON。
func rawJSONOrNull(v any) (json.RawMessage, error) {
	if v == nil {
		return []byte("null"), nil
	}
	return json.Marshal(v)
}
