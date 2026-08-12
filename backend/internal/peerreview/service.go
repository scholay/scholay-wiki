// ============================================================================
// 智能审稿 v3 — Service 层(业务逻辑 + 文件上传 + agent 编排)
//
// 公开方法(都需要 userID 做权限校验):
//
//   CreateDraft / GetSubmission / ListSubmissions / PatchSubmission
//   UploadAsset / DeleteAsset / ListAssets / OpenAsset
//   Submit (Step4 投递 → 启动 agent runner)
//   RecommendJournals (Step2 期刊推荐 — 同步调一次 agent)
//   DraftLetter       (Step3 AI 起草信件 — 同步调一次 agent)
//   ListReports / GetReportByRole
//
// agent 编排(submit → 后台 4 轮):
//
//   1. 创建 / 复用 agentbridge session (feature_key='peerreview')
//   2. 按 alpha → beta → gamma → chief 顺序 EnqueueChatMessage
//   3. 每轮轮询 GetChatStatus 直到 idle,然后 GetSessionMessages 拿最新 assistant
//   4. 从 assistant content 解析 { decision, scores, content } 三段
//   5. 落 peer_review_reports + 4 份齐了就 MarkCompleted
// ============================================================================

package peerreview

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/llmusage"
	"scholar-backend/internal/modelcatalog"
	"scholar-backend/internal/promptregistry"
	"scholar-backend/internal/storage"
	"scholar-backend/internal/vip"
)

// ─── 配置常量 ────────────────────────────────────────────────────────────

// 上传限制 —— 基于真实约束, 不是拍脑袋的 200MB:
//   - 稿件: 存 MinIO; 审稿流程跑起来时推到 agent 会话 cwd 让大模型 Read 原生分析 (方案 B)。
//     后端"全量读进内存"做 sha256 + 推送, 200MB 直接是后端 OOM 风险。
//     学术论文 (含图表) 通常 1-20MB, 盲审脱敏版更小 → 50MB 足够且内存安全。
//   - 附件: 0-10 份补充材料 (图 / 数据 / response letter), 同样存 MinIO + 推给 agent。
//     每份 30MB × 10 = 300MB 上限, 再大无意义且占存储。
// 前端 UploadStep 的 MAIN_MAX / ATT_MAX 必须与此一致 (改这里记得同步那边)。
const (
	MaxManuscriptBytes = 50 * 1024 * 1024 // 50MB
	MaxAttachmentBytes = 30 * 1024 * 1024 // 30MB / 份
	MaxAttachmentCount = 10
)

// ExtractedMeta 是 agent 抽出来的稿件结构化元数据,
// 既用作 step2 cache 的 payload, 也作为 Submission.extra_meta_json 的反序列化目标,
// 也作为前端 PatchPayload.ExtraMeta 的接收类型。
type ExtractedMeta struct {
	Title          string   `json:"title,omitempty"`
	Abstract       string   `json:"abstract,omitempty"`
	Keywords       []string `json:"keywords,omitempty"`
	Subjects       []string `json:"subjects,omitempty"`
	ManuscriptType string   `json:"manuscriptType,omitempty"`
}

// compute_state 取值, 跟 [[Submission.ComputeState]] 对齐。
const (
	StateIdle            = "idle"
	StateComputingMeta   = "computing_meta"
	StateComputingLetter = "computing_letter"
	// StateComputingMethodology — Step4 投递后、三位审稿人开跑前的方法论编排阶段。
	// status 仍是 reviewing, 但 compute_state 用它区分: 前端据此显示"通读全文·制定审稿标准",
	// 而不是把这 ~数分钟误标成"审稿人A正在评议中"(那一轮其实还没开始)。
	StateComputingMethodology = "computing_methodology"
	StateReviewing            = "reviewing"
	StateFailed               = "failed"
)

// ─── 错误 ────────────────────────────────────────────────────────────────

var (
	ErrInvalidMode       = errors.New("peerreview: invalid mode")
	ErrInvalidStep       = errors.New("peerreview: invalid step")
	ErrManuscriptMissing = errors.New("peerreview: manuscript not uploaded")
	ErrNotAgreed         = errors.New("peerreview: 用户未同意双盲规范")
	ErrAttachmentLimit   = errors.New("peerreview: attachment 数量超过上限")
	// ErrNotDraft —— 仅 draft 可被编辑 (改字段 / 传删文件 / 推进步骤)。已提交的投稿
	// (queued/reviewing/completed/failed) 命中此错误。消息直接面向用户, 不加包前缀。
	ErrNotDraft = errors.New("该投稿已提交, 无法再修改")
)

// ─── Service ────────────────────────────────────────────────────────────

// Service 负责 peerreview feature 的全部业务编排 — 稿件 CRUD + agent 编排。
// 审稿人选择已移进 agent(reviewer-roster skill, 见 runMethodologyPhase / service_reviewers.go),
// 后端不再持有 PersonaRandomPicker; promptSvc 仅留给 handler 渲染老报告 (GetPromptByID)。
type Service struct {
	repo      *Repository
	promptSvc *promptregistry.Service // GetPromptByID 用 (handler 渲染老 report DTO 时回查 Slug/Name)
	feature   *agentbridge.FeatureBridge
	bucket    func() string // 解耦:bucket name 从 storage 包动态取(测试可注入)
	broker    *StreamBroker // agent goroutine 把 deltas 推给它, SSE handler 订阅

	// models 模型目录解析器(modelcatalog.Service):各阶段模型按能力绑定取
	// (peerreview.meta/letter/methodology/scoring/chief,admin 后台可改绑)。
	// 可空 — 空 / 解析为空时不切模型, 全用会话默认 (主模型), 功能不受影响只是没成本优化。
	models ModelResolver

	// vip 会员每日额度。可空(不限)。**在 Submit 内、确认要真正跑一轮审稿时**才扣,
	// 不放 handler —— 否则非法/非自己的/重复点击/无稿件 的 Submit 会白白烧掉额度(审稿 free=1/天)。
	vip *vip.Service
}

// SetVIPChecker 注入会员限额服务(每次真正投递审稿扣 1)。允许 nil 禁用。
func (s *Service) SetVIPChecker(v *vip.Service) { s.vip = v }

// peerreviewMinBudgetMicro —— 起跑审稿所需的**最低剩余预算**(微元真实成本)。
//
// 🔴 2026-08-02 计费审计 P1-3:审稿是全平台单次成本最高的操作(一场 5-10M token,
// 真实成本可达 free 整窗 300,000 微元的几十倍),而它的起跑闸 CheckDailyQuota 是纯布尔判定
// ——「窗口已用 < 上限」为真即放行,剩 1 微元也照跑一整场。跑完的超支部分:开了 autopay 的
// 从经费实扣(ConsumeForQuota 无余额校验、可扣成负),没开的平台全吃,系统里唯一的痕迹是
// 一条 slog.Warn。这里改成「起跑前要求剩余预算够一场的量级」,把敞口从「一场」压到
// 「至多一场,且只对本来就有额度的人发生」。
//
// 取 200,000 微元 = ¥0.2 真实成本 ≈ free 整窗的 2/3:比一场真实审稿便宜(不误伤正常用户),
// 又足以把「几乎归零还硬跑一场」挡在门外。不做成 admin 旋钮:这是成本护栏不是产品参数,
// 加旋钮只会多一个被误设成 0 的地方(参见 free_window_tokens 的教训)。
const peerreviewMinBudgetMicro = 200_000

// ensureReviewBudget 审稿起跑闸:先过通用额度闸,再要求剩余预算够一场的量级。
// vip 未接线 / 不限额档 → 直接放行。
func (s *Service) ensureReviewBudget(ctx context.Context, userID uint64) error {
	if s.vip == nil {
		return nil
	}
	if err := s.vip.CheckDailyQuota(ctx, uint(userID)); err != nil {
		return err // vip.ErrQuotaExceeded → handler 映射成 6010/429
	}
	remaining, unlimited := s.vip.RemainingWindowMicro(ctx, uint(userID))
	if unlimited || remaining >= peerreviewMinBudgetMicro {
		return nil
	}
	slog.Info("peerreview: 剩余额度不足以起跑一场审稿,拒绝投递",
		"user_id", userID, "remaining_micro", remaining, "need_micro", peerreviewMinBudgetMicro)
	return vip.NewQuotaError("剩余额度不够跑完一份完整的审稿,所以这次没有开始 —— 没有扣掉任何额度,你的稿件和填好的信息都还在。等额度自动恢复满额后再投递就行;想现在就跑,可以用 1 次重置次数、升级会员,或开启「用经费继续」(只扣超出额度的那部分)。")
}

// VIPCheckerWired 报告配额校验器是否已注入(bootstrap 启动断言付费功能已接线)。
func (s *Service) VIPCheckerWired() bool { return s.vip != nil }

// ModelResolver 模型目录解析(modelcatalog.Service 实现);小接口便于测试注入。
type ModelResolver interface {
	Resolve(purpose string) string
}

// NewService — bootstrap 阶段构造。
func NewService(
	repo *Repository,
	promptSvc *promptregistry.Service,
	feature *agentbridge.FeatureBridge,
	models ModelResolver,
) *Service {
	return &Service{
		repo:      repo,
		promptSvc: promptSvc,
		feature:   feature,
		bucket:    storage.PeerReviewAssetBucket,
		broker:    NewStreamBroker(),
		models:    models,
	}
}

// modelFor — 按能力绑定取模型(modelcatalog.Purpose* 常量)。空 = 不切, 用会话默认。
// 注意 serverside 的语义:空 modelID 不发 set_runtime_config 帧 → executor 跑默认主模型
// (modelOverride 是 per-WS-connection 状态, 不是「沿用会话上次」)。同一会话按轮切换的场景
// (meta 切快模型后 review 必须显式切回) 依赖这里恒有值; Resolve 的回退链保证了这一点。
func (s *Service) modelFor(purpose string) string {
	if s.models == nil {
		return ""
	}
	return s.models.Resolve(purpose)
}

// Broker 暴露给 handler — 单例 broker 由 service 持有,SSE 端点订阅它。
func (s *Service) Broker() *StreamBroker { return s.broker }

// setComputeStateNotify = SetComputeState + 向该 submission 当前全部 SSE 订阅者广播 state 控制帧。
// 推送是 best-effort:没有订阅者时静默落空,DB 才是真源,错过帧由前端慢轮询兜底
// (2026-08-12 推送化:此前前端只能 2s 轮询感知翻转,每份投稿 ~130-210 次 GET)。
// service 内的翻转点一律走这里;repo 层的兜底路径(boot reconcile / sweeper)没有 broker,维持纯 DB 写。
func (s *Service) setComputeStateNotify(submissionID uint64, state, errMsg string) error {
	err := s.repo.SetComputeState(submissionID, state, errMsg)
	if err == nil {
		s.broker.BroadcastAll(submissionID, StreamEvent{Phase: StreamPhaseState, ComputeState: state})
	}
	return err
}

// notifyReportReady 广播「role 报告已落库」控制帧 —— 必须在 UpsertReport 成功**之后**调,
// 前端收帧即 invalidate reports 查询,拿到的一定是已可读的 DB 行。
func (s *Service) notifyReportReady(submissionID uint64, role string) {
	s.broker.BroadcastAll(submissionID, StreamEvent{Phase: StreamPhaseReportReady, Role: role})
}

// BucketName 暴露 MinIO bucket 名 — DownloadAssets handler 流式打包 zip 时用。
func (s *Service) BucketName() string { return s.bucket() }

// resumeBootDelay: boot 续审前等一会儿, 给 agent 容器起来的时间(backend 不 depends_on agent)。
// resumeConcurrency: boot 时并发续审上限, 防一次发版有多条在审时把 agent 打爆。
const (
	resumeBootDelay   = 30 * time.Second
	resumeConcurrency = 2
)

// ReconcileStaleOnBoot: 启动时调一次。
//   - computing_meta/letter 的 wizard 步骤(快、用户驱动)→ 复位 failed 让用户重试;
//   - queued/reviewing 的审稿行(发版中断、goroutine 已没)→ **自动续审**: 延迟等 agent 就绪后
//     限流重新拉起 runReviewBackground。UpsertReport 已 OnConflict 幂等, 重跑会覆盖已存报告、不撞唯一键,
//     所以从头重跑安全(代价: 浪费已完成轮次算力, 且可能选到不同的 3 位审稿人, 可接受)。
// bootstrap 在构造完 service 后调用。
func (s *Service) ReconcileStaleOnBoot() {
	drafts, err := s.repo.ReconcileStaleComputingDraftsOnBoot()
	if err != nil {
		slog.Error("peerreview reconcile stale drafts on boot", "err", err)
	}
	ids, err := s.repo.StrandedReviewIDs()
	if err != nil {
		slog.Error("peerreview list stranded reviews on boot", "err", err)
		return
	}
	if drafts > 0 || len(ids) > 0 {
		slog.Warn("peerreview boot reconcile",
			"failed_stuck_drafts", drafts, "resuming_reviews", len(ids))
	}
	if len(ids) == 0 {
		return
	}
	// 后台续审 —— 等 agent 就绪 + 限流, 逐条重跑(runReviewBackground 自带 30min ctx + panic recover)。
	safego.Go("peerreview-resume-on-boot", func() {
		time.Sleep(resumeBootDelay)
		sem := make(chan struct{}, resumeConcurrency)
		for _, raw := range ids {
			id := raw
			ctx, cancel := ctxutil.With(ctxutil.BackgroundJob)
			sub, gerr := s.repo.GetByIDInternal(id)
			if gerr != nil {
				cancel()
				slog.Warn("peerreview resume: load submission failed", "submission_id", id, "err", gerr)
				continue
			}
			sessionID, serr := s.ensureAgentSession(ctx, sub)
			cancel()
			if serr != nil {
				s.markFailedAndLog(id, "续审重建 agent 会话失败: "+serr.Error())
				continue
			}
			sem <- struct{}{}
			safego.Go(fmt.Sprintf("peerreview-resume-%d", id), func() {
				defer func() { <-sem }()
				slog.Info("peerreview resuming stranded review", "submission_id", id)
				s.runReviewBackground(id, sessionID)
			})
		}
	})
}

// StartStaleSweeper: 后台周期兜底 —— 每 5min 把 computing_* 卡超 15min 的草稿复位 failed。
// 三层防线: 各 goroutine 的 panic recover (崩溃) + ReconcileStaleOnBoot (重启) + 本方法
// (运行期间没崩但卡死 / 漏复位)。进程退出时 goroutine 随之结束, 无需显式停止。
func (s *Service) StartStaleSweeper() {
	safego.Go("peerreview-stale-sweeper", func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			// 每 tick 独立 recover —— 否则单次 panic 会让整条 sweeper goroutine 永久退出
			// (safego 的外层 recover 只兜一次), 兜底层就静默消失了。
			func() {
				defer func() {
					if r := recover(); r != nil {
						slog.Error("peerreview stale sweep panic", "panic", r)
					}
				}()
				n, err := s.repo.FailStaleComputing(15 * time.Minute)
				if err != nil {
					slog.Error("peerreview stale sweep", "err", err)
				} else if n > 0 {
					slog.Warn("peerreview swept stale computing rows", "count", n)
				}
			}()
		}
	})
}

// GetPromptByID 给 handler 渲染 reportDTO 时回查 prompt 的 slug/name (前端展示用)。
// 失败 → 返回 (nil, err), 调用方自己决定是否致命。
//
// 旧 API GetSkill(*Skill) 已下线, 字段对齐: 旧 skill.Slug = 新 prompt.Slug,
// 旧 skill.Name = 新 prompt.Name; handler 改取 prompt 字段不必改 DTO shape。
func (s *Service) GetPromptByID(id uint64) (*promptregistry.Prompt, error) {
	if s.promptSvc == nil {
		return nil, ErrNotFound
	}
	p, err := s.promptSvc.GetByID(id)
	if err != nil {
		if errors.Is(err, promptregistry.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return p, nil
}

// ─── 草稿 CRUD ────────────────────────────────────────────────────────────

func (s *Service) CreateDraft(ctx context.Context, userID uint64, mode string) (*Submission, error) {
	if mode != "journal" && mode != "thesis" {
		return nil, ErrInvalidMode
	}
	// 收口:每用户每模式至多一个草稿。先复用既有草稿(含尚未上传文件的空草稿),
	// 没有再新建 —— 修复 wizard 反复进入 / 上传失败 / 重复触发时空草稿堆积。
	// 注意:入口探活用的是 LatestActiveDraft(带 EXISTS(asset) 过滤,看不到空草稿),
	// 这里刻意用 LatestDraftOfMode(不过滤)兜底复用空草稿;并发竞态再由 DB 唯一索引
	// uk_one_draft_per_user_mode + repo.CreateDraft 的 1062 回查保证最终只剩一条。
	if existing, err := s.repo.LatestDraftOfMode(userID, mode); err == nil {
		return existing, nil
	} else if !errors.Is(err, ErrNotFound) {
		return nil, err
	}
	sub, created, err := s.repo.CreateDraft(userID, mode)
	if err != nil {
		return nil, err
	}
	if !created {
		// 并发下复用了别的请求刚建的草稿,它已自带 agent session,不要重复建(否则泄漏 session)。
		return sub, nil
	}
	// 立即给新草稿绑一个 agent session, 整个 wizard + 4 轮审稿全程复用。
	// 失败不阻塞 draft 创建 (前端拿到 submission 后还能上传文件等),
	// 下次 advance 调用时会按需 lazy-create。
	if sess, err := s.feature.AgentClient().CreateSession(ctx, &agent.CreateSessionOptions{DisallowedTools: scoringSessionDeny, AllowedMcpTools: reviewerAllowedMcpTools}); err == nil {
		_ = s.repo.SetAgentSession(sub.ID, sess.SessionID)
		sub.AgentSessionID.String = sess.SessionID
		sub.AgentSessionID.Valid = true
		s.bindOwnerSession(sub, sess.SessionID)
	}
	return sub, nil
}

// LatestActiveDraft — 只读查询, 找用户 (mode) 最近一条**已上传过文件**的草稿。
// 没有 → ErrNotFound, 前端 wizard 渲染空 UploadStep, 等用户上传文件再 lazy 创建。
func (s *Service) LatestActiveDraft(userID uint64, mode string) (*Submission, error) {
	if mode != "journal" && mode != "thesis" {
		return nil, ErrInvalidMode
	}
	return s.repo.LatestActiveDraftOfMode(userID, mode)
}

// ResumeOrCreateDraft 是 wizard 入口的统一入口:
//
//   1. 找该用户该模式 (journal / thesis) 最近的草稿
//   2. 有 → 返回它 (前端用 .step 字段自己定位到当前步骤,无副作用)
//   3. 没 → CreateDraft 新建一条
//
// 这样保证用户每次进 /peer-review/journal 看到的都是"上次没投完的稿件",
// 而不是每次都开新草稿堆积一堆空记录。
// 已完成 / 已失败的提交不算 "未完成", 不会被 resume; 它们沉淀到审稿记录列表里。
func (s *Service) ResumeOrCreateDraft(ctx context.Context, userID uint64, mode string) (*Submission, error) {
	if mode != "journal" && mode != "thesis" {
		return nil, ErrInvalidMode
	}
	if sub, err := s.repo.LatestDraftOfMode(userID, mode); err == nil {
		return sub, nil
	}
	return s.CreateDraft(ctx, userID, mode)
}

// ensureAgentSession get-or-create — 给 advance flow 用,
// session 不存在 / 已被 agent 端 GC 时, 透明重建并写回 DB。
func (s *Service) ensureAgentSession(ctx context.Context, sub *Submission) (string, error) {
	if sub.AgentSessionID.Valid && sub.AgentSessionID.String != "" {
		return sub.AgentSessionID.String, nil
	}
	sess, err := s.feature.AgentClient().CreateSession(ctx, &agent.CreateSessionOptions{DisallowedTools: scoringSessionDeny, AllowedMcpTools: reviewerAllowedMcpTools})
	if err != nil {
		return "", fmt.Errorf("create agent session: %w", err)
	}
	if err := s.repo.SetAgentSession(sub.ID, sess.SessionID); err != nil {
		return "", err
	}
	sub.AgentSessionID.String = sess.SessionID
	sub.AgentSessionID.Valid = true
	s.bindOwnerSession(sub, sess.SessionID)
	return sess.SessionID, nil
}

// resetAgentSession DELETE + CREATE — 在 assets_revision 变化时调用,
// 让 agent 不带着旧 manuscript 干扰。同时清空 step_cache 让下次 advance
// fingerprint 自然 miss。
func (s *Service) resetAgentSession(ctx context.Context, sub *Submission) (string, error) {
	if sub.AgentSessionID.Valid && sub.AgentSessionID.String != "" {
		_ = s.feature.AgentClient().DeleteSession(ctx, sub.AgentSessionID.String)
	}
	sess, err := s.feature.AgentClient().CreateSession(ctx, &agent.CreateSessionOptions{DisallowedTools: scoringSessionDeny, AllowedMcpTools: reviewerAllowedMcpTools})
	if err != nil {
		return "", fmt.Errorf("recreate agent session: %w", err)
	}
	if err := s.repo.SetAgentSession(sub.ID, sess.SessionID); err != nil {
		return "", err
	}
	_ = s.repo.DeleteAllStepCache(sub.ID)
	sub.AgentSessionID.String = sess.SessionID
	sub.AgentSessionID.Valid = true
	s.bindOwnerSession(sub, sess.SessionID)
	return sess.SessionID, nil
}

// bindOwnerSession 把「投稿↔agent 会话」映射双写进统一归属表 agent_sessions
// (owner_kind=submission, owner_id=sub.ID)。主真源仍是 peer_review_submissions.agent_session_id;
// 这里 best-effort 让标准 OwnsSession / IssueWSTicket 也覆盖 peerreview。失败仅告警不阻断。
func (s *Service) bindOwnerSession(sub *Submission, sessionID string) {
	if s.feature == nil || sub == nil || sub.UserID == 0 || sessionID == "" {
		return
	}
	if err := s.feature.BindOwnerSession(uint(sub.UserID), "submission", sub.ID, sessionID); err != nil {
		slog.Warn("peerreview: dual-write agent_sessions(owner) failed",
			"submission_id", sub.ID, "user_id", sub.UserID, "session_id", sessionID, "err", err)
	}
}

// sessionAssets 描述已推送到 agent 会话 cwd 的文件 (供 prompt 引用)。
type sessionAssets struct {
	manuscriptPath string // agent 容器内绝对路径
	manuscriptName string // 原始文件名 (展示用)
	attachments    []pushedAttachment
}

type pushedAttachment struct {
	path     string
	name     string
	category string
}

// pushAssetsToSession 把稿件 + 附件从 MinIO 下载后推到 agent 会话隔离 cwd,
// 返回落盘路径供 prompt 引用 (方案 B: backend 不预抽文本 —— 正文经 ExtractDocHead 确定性
// 有界抽取后 preamble 注入, 附件由 agent 按需 Read/ReadDocument)。
// 稿件必须存在, 否则 ErrManuscriptMissing。
//
// 幂等: 多次调用会重复推送 (覆盖同名 uuid 文件), 用在 runMetaExtract / runReviewBackground
// 各自的入口处, 保证即便 session 被 agent 端 GC / 重建后文件仍在 cwd。
func (s *Service) pushAssetsToSession(ctx context.Context, submissionID uint64, sessionID string) (*sessionAssets, error) {
	if sessionID == "" {
		return nil, errors.New("peerreview: empty agent sessionId")
	}
	bucket := s.bucket()
	if bucket == "" {
		return nil, errors.New("peerreview: storage not configured")
	}
	assets, err := s.repo.ListAssets(submissionID)
	if err != nil {
		return nil, err
	}
	client := s.feature.AgentClient()

	out := &sessionAssets{}
	for _, a := range assets {
		rc, _, gerr := storage.GetObject(ctx, bucket, a.ObjectKey)
		if gerr != nil {
			return nil, fmt.Errorf("get object %s: %w", a.ObjectKey, gerr)
		}
		// 直接把 MinIO 对象 reader 流给 agent —— 不再 io.ReadAll 整份读进内存(50MB 稿件省一份完整拷贝)。
		pushed, perr := client.PushSessionFile(ctx, sessionID, a.Filename, rc)
		_ = rc.Close()
		if perr != nil {
			return nil, fmt.Errorf("push asset %s: %w", a.Filename, perr)
		}
		if a.Role == "manuscript" {
			out.manuscriptPath = pushed.Path
			out.manuscriptName = a.Filename
		} else {
			cat := ""
			if a.Category.Valid {
				cat = a.Category.String
			}
			out.attachments = append(out.attachments, pushedAttachment{
				path: pushed.Path, name: a.Filename, category: cat,
			})
		}
	}
	if out.manuscriptPath == "" {
		return nil, ErrManuscriptMissing
	}
	return out, nil
}

// buildAssetsBlock 生成"文件已在工作目录, 请 Read"提示块, 供 meta / 审稿 prompt 共用。
func buildAssetsBlock(files *sessionAssets) string {
	var b strings.Builder
	b.WriteString("【稿件文件 — 已放在你的当前工作目录】\n")
	b.WriteString("- 论文正文: " + files.manuscriptPath + "\n")
	for _, att := range files.attachments {
		line := "- 补充材料: " + att.path
		if att.category != "" {
			line += " (" + att.category + ")"
		}
		b.WriteString(line + "\n")
	}
	b.WriteString("\n稿件是 PDF/docx 二进制 —— 请用 **ReadDocument 工具**读取论文正文全文")
	if len(files.attachments) > 0 {
		b.WriteString(" (需要时一并读取补充材料;文本类附件用 Read,文档类用 ReadDocument)")
	}
	b.WriteString(", 不要凭文件名臆测内容。\n")
	return b.String()
}

// buildInlinedAssetsBlock —— 正文已作为 preamble 注入会话上文时用(审稿路径):不再指示读正文文件,
// 避免共享 session 里每位审稿人 + 主审各读一遍全文 → O(N²) input 计费。只保留"补充材料按需读"。
// 与 buildAssetsBlock(指示读全文)互斥二选一,由 buildCommonContext 的 manuscriptInlined 决定。
func buildInlinedAssetsBlock(files *sessionAssets) string {
	var b strings.Builder
	b.WriteString("【稿件正文 — 已在本会话上文完整给出】\n")
	b.WriteString("论文正文全文已作为上文消息提供,请**直接基于上文正文**评审,**不要**再用 Read/ReadDocument 重新读取正文文件(重复读取纯属浪费)。\n")
	if len(files.attachments) > 0 {
		b.WriteString("\n补充材料(仅确有必要时才读;文本类用 Read,文档类用 ReadDocument):\n")
		for _, att := range files.attachments {
			line := "- " + att.path
			if att.category != "" {
				line += " (" + att.category + ")"
			}
			b.WriteString(line + "\n")
		}
	}
	return b.String()
}

// buildManuscriptPreamble —— 审稿开始前向共享 session **一次性**注入正文的 preamble。
// 随后审稿人/主审都把它当作已在上文的稳定前缀(prompt-cache 命中走 cache-read 折扣),不再各自重读。
// truncated=true(超长稿件被 400K 字符 / token 预算钳断)时**如实告知模型**读到的只是前段 ——
// 此前对截断文本谎称「全文」且禁止再读,审稿人在不知情下半盲审(2026-07 文件上传调研 P1)。
func buildManuscriptPreamble(manuscript string, truncated bool) string {
	var b strings.Builder
	if truncated {
		b.WriteString("【待审论文正文(前段抽取)— 只此一次给出,请通读并记住】\n")
		b.WriteString("下面是本场审稿论文正文的**前段抽取**(原文超长,超出预算的后段未包含)。随后几位审稿人与主审都将基于这份文本评审,你无需、也不要再用 Read/ReadDocument 重新读取正文文件。\n")
		b.WriteString("**诚实性要求**:你们只读到了正文前段。涉及全文覆盖性的判断(如「全文未见 XX」)必须限定为「已读部分未见」;最终报告须如实注明「本次评审基于正文前段抽取,未覆盖全文」。\n\n")
	} else {
		b.WriteString("【待审论文正文全文 — 只此一次给出,请通读并记住】\n")
		b.WriteString("下面是本场审稿的论文正文全文。随后几位审稿人与主审都将**基于这份正文**评审,你无需、也不要再用 Read/ReadDocument 重新读取正文文件。\n\n")
	}
	b.WriteString("===== 论文正文开始 =====\n")
	b.WriteString(manuscript)
	b.WriteString("\n===== 论文正文结束 =====\n\n")
	b.WriteString("现在只需回复「已阅」两个字,不要分析、不要调用任何工具。")
	return b.String()
}

// buildMethodologyPrompt 方法论 + 审稿人选择会话的提示 —— Skill-开 的临时会话里跑。
// agent 读论文 + invoke reviewer-roster 编排 skill, 选 3 位审稿人, 末尾输出选择 JSON。
// 自由文本方法论注入后续评分轮; 选择 JSON 由后端 parseSelection 解析 → 按 slug 读各审稿人 SKILL.md。
func buildMethodologyPrompt(files *sessionAssets, menu []reviewerMenuEntry, lenses []lensMenuEntry, memCtx string) string {
	var b strings.Builder
	// 时间锚点(2026-07):方法论自由文本会拼进评分轮 commonContext,这里若按训练截止推错年份
	// 会二次污染全部评分轮,故与 buildCommonContext 一样注入当前日期(天粒度)。
	b.WriteString("【当前日期】今天是 " + time.Now().Format("2006年01月02日") + ";判断文献与方法的时效性时以此为准 —— 晚于你训练知识截止的文献可能真实存在,不要仅凭年份晚于你的认知就判其可疑。\n\n")
	b.WriteString("你是审稿流程的「方法论编排」。请先读完稿件原文, 判断这篇论文的领域 / 类型 / 方法学。\n\n")
	if strings.TrimSpace(memCtx) != "" {
		b.WriteString("[投稿人背景 — 长期记忆, 仅帮助你理解论文所属领域/作者水平; 绝不可影响你对论文本身的客观判断]\n")
		b.WriteString(memCtx)
		b.WriteString("[/投稿人背景]\n\n")
	}
	b.WriteString(buildAssetsBlock(files))
	if len(menu) > 0 {
		// 后端把真实花名册喂进来(agent 从清单挑、不凭空编 slug), 按"专攻优先 → 通用兜底"分两组提示。
		var specialized, general []reviewerMenuEntry
		for _, m := range menu {
			if len(m.Fit) > 0 {
				specialized = append(specialized, m)
			} else {
				general = append(general, m)
			}
		}
		render := func(m reviewerMenuEntry, showFit bool) string {
			line := "- " + m.Slug
			if m.Name != "" {
				line += " — " + m.Name
			}
			if m.Domain != "" {
				line += " · " + m.Domain
			}
			if showFit && len(m.Fit) > 0 {
				line += "  [学科:" + strings.Join(m.Fit, ", ") + "]"
			}
			if m.Desc != "" {
				line += ":" + m.Desc
			}
			return line
		}
		b.WriteString("\n【可选审稿人花名册 —— 必须从下列挑【恰好 3 位】互补审稿人, slug 照抄, 严禁自创不在列表里的 slug】\n")
		if len(specialized) > 0 {
			b.WriteString("\n《领域专家(其 fit 学科若与本文学科相交, 优先选)》\n")
			for _, m := range specialized {
				b.WriteString(render(m, true) + "\n")
			}
		}
		if len(general) > 0 {
			b.WriteString("\n《通用审稿人(各覆盖一个通用维度; 无领域专家匹配时全选, 否则补满剩余槽)》\n")
			for _, m := range general {
				b.WriteString(render(m, false) + "\n")
			}
		}
		b.WriteString("\n【选择规则】先判断本文学科;若有领域专家的学科与之相交, **优先选 1-2 位最匹配的领域专家**, 再用通用审稿人按视角互补补满到恰好 3 位;若无任何领域专家匹配, 则选 3 位最相关的通用审稿人。不要选 3 个同质审稿人(典型组合:1 位领域专家 + 方法学 + 创新性/可复现性)。\n")
	}
	// 多技能组合:可叠加视角 lens —— 给每位审稿人锐化额外审查角度而不改其身份。
	if len(lenses) > 0 {
		b.WriteString("\n【可叠加审查视角 lens —— 可选,由你按需判断】\n每位审稿人**可选**叠加下列视角, 用于额外聚焦某类审查(如统计严谨/因果/伦理/图表诚信), **不改变其审稿身份**。叠几个、叠哪些由你按稿件实际情况判断:只在该视角确实与本文相关、且不是该审稿人 base 已充分覆盖的方面时才叠。**宁缺毋滥——多数情况 0-2 个就够, 叠太多会稀释审稿焦点**;单人最多 5 个(系统硬上限)。\n")
		for _, l := range lenses {
			line := "- " + l.Slug
			if l.Name != "" {
				line += " — " + l.Name
			}
			if l.Desc != "" {
				line += ":" + l.Desc
			}
			b.WriteString(line + "\n")
		}
	}
	b.WriteString("\n【输出要求】\n")
	b.WriteString("先用简洁中文条列你的方法论(不要 JSON):1) 论文领域/类型/方法学判断;2) 为何选这 3 位审稿人(及各自叠了哪些视角);3) 三位应分别重点关注什么。\n")
	b.WriteString("**然后在回复的最末尾**输出一个 ```json 代码块(本次回复的最后一个 json 块),格式严格如下:\n")
	b.WriteString("```json\n{\"reviewers\":[{\"slug\":\"rv-xxx\",\"lenses\":[\"lens-aaa\"],\"why_chosen\":\"一句理由\"},{\"slug\":\"rv-yyy\",\"lenses\":[],\"why_chosen\":\"...\"},{\"slug\":\"rv-zzz\",\"lenses\":[\"lens-bbb\",\"lens-ccc\"],\"why_chosen\":\"...\"}]}\n```\n")
	b.WriteString("约束:slug **必须照抄上面【可选审稿人花名册】里的某一项**(原样复制, 不要改写/翻译/自创);恰好 3 个互不相同;不要选 chief;`lenses` 是**可选**的 0-2 个视角 slug(照抄【可叠加审查视角】里的项,不叠就写 []);不要把审稿人画像/视角正文塞进 JSON。\n")
	return b.String()
}

// runMethodologyPhase 跑方法论 + 审稿人选择会话: 临时新建一个 Skill-开 的会话(nil opts → 全局默认含 Skill),
// 让 agent 读论文 + invoke reviewer-roster 选 3 位审稿人, 产出自由文本方法论 + 末尾选择 JSON。
// 返回 (注入评分轮的方法论自由文本, 恰好 3 位 ReviewerChoice)。任何失败都降级:
// 方法论返回空串、审稿人退化到内置三人格 —— 评分照常进行, 永不 hard-fail。会话用完即删。
// 返回 (方法论自由文本, 选中的 3 位审稿人, 本阶段累计 token)。token 供单场成本兜底累加。
func (s *Service) runMethodologyPhase(ctx context.Context, submissionID uint64, files *sessionAssets, memCtx string) (string, []ReviewerChoice, int64) {
	// 把这一轮的 agent 输出推到 SlotMethodology, 让前端在"通读全文·制定审稿标准"阶段看到实时进度,
	// 而不是干等一个空转圈。Begin/Done 包住整段: 任何提前 return(降级)也会让前端的 SSE 收尾,
	// 不会卡在 pending。defer 顺序 LIFO → 先 DeleteSession 再 broker.Done, 符合预期。
	s.broker.Begin(submissionID, SlotMethodology)
	defer s.broker.Done(submissionID, SlotMethodology)

	// 2026-07:不再 AddDirs 加载 reviewer-skills。原因:① buildMethodologyPrompt 已 in-band 注入
	// 完整确定性花名册(availableReviewers,含 slug/name/domain/fit/desc + 选择规则),选人自足;
	// ② 评分轮按 slug 后端读 SKILL.md 注入 SCORING_PERSONA,不经这条路;③ clean-room 执行器无
	// fork 的「Skill 工具」,skills 是全文常驻 system 后缀,reviewer-skills ~74KB 撞 loader 40KB
	// 总量帽 → 静默、非确定性截断,且每个 tool round 重发白烧数十万 input token。故整段移除。
	// DisallowedTools 禁 AskUserQuestion:方法论会话是 server-side / 无人值守(经 ServerSideChatStreaming
	// 自扮 WS 客户端跑),没有用户能作答 —— 模型若发问会导致本轮无方法论输出、降级到 builtin reviewers。
	// 另禁 Bash 三件套(2026-07 文件上传调研):审稿全链路只读(正文 ExtractDocHead 注入 + 附件
	// ReadDocument),prompt 本就严禁 Bash,denylist 对齐设计意图(此前事实上未禁,与 spec 注释漂移)。
	// 不复用 scoringSessionDeny(那会连带禁 Skill,而方法论会话按上方设计保留 Skill 开)。
	created, err := s.feature.AgentClient().CreateSession(ctx, &agent.CreateSessionOptions{
		DisallowedTools: []string{"AskUserQuestion", "Bash", "BashOutput", "KillShell"},
		AllowedMcpTools: reviewerAllowedMcpTools,
	})
	if err != nil {
		slog.Warn("peerreview methodology session create failed; builtin reviewers",
			"submission_id", submissionID, "err", err)
		return "", builtinReviewerChoices(), 0
	}
	methSessID := created.SessionID
	defer func() {
		dctx, dcancel := ctxutil.With(ctxutil.BackgroundJob)
		defer dcancel()
		if derr := s.feature.AgentClient().DeleteSession(dctx, methSessID); derr != nil {
			slog.Warn("peerreview methodology session cleanup failed", "session_id", methSessID, "err", derr)
		}
	}()

	// 方法论会话也要能 Read 原文 → 把稿件推到它自己的 cwd。
	mfiles, perr := s.pushAssetsToSession(ctx, submissionID, methSessID)
	if perr != nil {
		slog.Warn("peerreview push assets to methodology session failed; builtin reviewers",
			"submission_id", submissionID, "err", perr)
		return "", builtinReviewerChoices(), 0
	}
	reply, methUsage, cerr := s.feature.ServerSideChatStreaming(ctx, methSessID,
		buildMethodologyPrompt(mfiles, availableReviewers(), availableLenses(), memCtx),
		func(delta string) { s.broker.Append(submissionID, SlotMethodology, delta) },
		func(note string) { s.broker.Status(submissionID, SlotMethodology, note) },
		s.modelFor(modelcatalog.PurposePeerreviewMethodology))
	if cerr != nil {
		slog.Warn("peerreview methodology round failed; builtin reviewers",
			"submission_id", submissionID, "err", cerr)
		return "", builtinReviewerChoices(), usageTotal(methUsage)
	}
	// 选择轮成功: 自由文本方法论(去掉末尾选择 JSON 块)注入评分轮; 选择 JSON → 3 位审稿人(失败自退化)。
	choices := s.resolveReviewerChoices(submissionID, reply)
	return stripTrailingFencedJSON(reply), choices, usageTotal(methUsage)
}

func (s *Service) GetSubmission(userID, id uint64) (*Submission, error) {
	return s.repo.GetByID(id, userID)
}

func (s *Service) ListSubmissions(userID uint64, mode string) ([]Submission, error) {
	subs, err := s.repo.ListByUser(userID, mode)
	if err != nil {
		return nil, err
	}
	// 已完成投稿: 批量取主审决议填进 ChiefDecision, 让列表"决议"列直接显示结果而不是"已完成"。
	var completedIDs []uint64
	for i := range subs {
		if subs[i].Status == "completed" {
			completedIDs = append(completedIDs, subs[i].ID)
		}
	}
	if len(completedIDs) > 0 {
		chiefs, cerr := s.repo.ChiefReportsBySubmissionIDs(completedIDs)
		if cerr != nil {
			// 决议列拿不到不致命, 退化为"已完成"即可; 记一条 warn 便于排查。
			slog.Warn("peerreview list: load chief decisions", "err", cerr)
		} else {
			for i := range subs {
				if rep, ok := chiefs[subs[i].ID]; ok {
					subs[i].ChiefDecision = chiefDecisionOf(&rep)
				}
			}
		}
	}
	return subs, nil
}

var recommendationRe = regexp.MustCompile(`"recommendation"\s*:\s*"([^"]+)"`)

// chiefDecisionOf 返回主审决议结果 (内部值 小修/大修/拒稿 或历史值; 前端 lib/recommendation 再映射展示名)。
// 优先结构化列 recommendation / decision; 都缺失 (旧脏数据 JSON 解析失败) 时从 content_md 正则复原。
func chiefDecisionOf(rep *Report) string {
	if rep.Recommendation.Valid && strings.TrimSpace(rep.Recommendation.String) != "" {
		return strings.TrimSpace(rep.Recommendation.String)
	}
	if rep.Decision.Valid && strings.TrimSpace(rep.Decision.String) != "" {
		return strings.TrimSpace(rep.Decision.String)
	}
	if rep.ContentMd != "" {
		if m := recommendationRe.FindStringSubmatch(rep.ContentMd); len(m) == 2 {
			return strings.TrimSpace(m[1])
		}
	}
	return ""
}

// PatchPayload 是 handler 解出来的 patch DTO。
// 各字段为指针 / RawMessage,nil 表示不更新。
type PatchPayload struct {
	Step          *uint8           `json:"step,omitempty"`
	Title         *string          `json:"title,omitempty"`
	Abstract      *string          `json:"abstract,omitempty"`
	ExtraMeta     *ExtractedMeta   `json:"extraMeta,omitempty"`
	LetterBody    *string          `json:"letterBody,omitempty"`
	JournalTarget json.RawMessage  `json:"journalTarget,omitempty"`
	SchoolTarget  *SchoolTargetIn  `json:"schoolTarget,omitempty"`
}

type SchoolTargetIn struct {
	SchoolName      string `json:"schoolName"`
	DegreeType      string `json:"degreeType"`
	DisciplineField string `json:"disciplineField"`
	AdvisorName     string `json:"advisorName,omitempty"`
}

// PatchPayload 新增 ExtraMeta 透传, 持久化 keywords/subjects/manuscriptType。
// service 内部根据用户改了什么字段, 自动 bump 对应 revision (assets/meta/letter)。
func (s *Service) PatchSubmission(userID, id uint64, p PatchPayload) (*Submission, error) {
	sub, err := s.repo.GetByID(id, userID)
	if err != nil {
		return nil, err
	}
	// 只能改草稿 —— 已提交的投稿不允许再回填字段 / bump revision (否则会改坏已提交/已完稿件)。
	if sub.Status != "draft" {
		return nil, ErrNotDraft
	}
	fields := map[string]any{}

	// step 改动不算 revision 变化 (纯导航)
	if p.Step != nil {
		if *p.Step < 1 || *p.Step > 4 {
			return nil, ErrInvalidStep
		}
		fields["step"] = *p.Step
	}

	// 以下任意字段改动 → bumpMeta=true (会在 commit 后触发 BumpMetaRevision)
	bumpMeta := false
	bumpLetter := false

	if p.Title != nil && (!sub.Title.Valid || sub.Title.String != *p.Title) {
		fields["title"] = *p.Title
		bumpMeta = true
	}
	if p.Abstract != nil && (!sub.Abstract.Valid || sub.Abstract.String != *p.Abstract) {
		fields["abstract"] = *p.Abstract
		bumpMeta = true
	}
	if p.ExtraMeta != nil {
		raw, _ := json.Marshal(p.ExtraMeta)
		// 跟 DB 当前值比较 (简化: 任意改动就 bump)
		fields["extra_meta_json"] = json.RawMessage(raw)
		bumpMeta = true
	}
	if p.LetterBody != nil && (!sub.LetterBody.Valid || sub.LetterBody.String != *p.LetterBody) {
		fields["letter_body"] = *p.LetterBody
		bumpLetter = true
	}
	if len(p.JournalTarget) > 0 && string(p.JournalTarget) == "null" {
		// 显式传 null = 用户点了"取消选择"; 清空期刊字段 + bump meta
		if sub.JournalID.Valid || sub.JournalName.Valid {
			bumpMeta = true
		}
		fields["journal_id"] = sql.NullInt64{}
		fields["journal_name"] = sql.NullString{}
		fields["journal_meta_json"] = nil
	} else if len(p.JournalTarget) > 0 {
		// 解出 journalId / canonicalName 单独存,meta 整块塞 JSON。
		// journalId<=0 = 自定义期刊 (只有用户输入的 canonicalName, 无 IF/Quartile 等元数据)。
		var jt struct {
			JournalID       int64    `json:"journalId"`
			CanonicalName   string   `json:"canonicalName"`
			ISSNs           []string `json:"issns,omitempty"`
			AIReason        string   `json:"aiReason,omitempty"`
			JCRImpactFactor float64  `json:"jcrImpactFactor,omitempty"`
			JCRQuartile     string   `json:"jcrQuartile,omitempty"`
		}
		if err := json.Unmarshal(p.JournalTarget, &jt); err == nil {
			name := strings.TrimSpace(jt.CanonicalName)
			if name == "" {
				return nil, errors.New("期刊名称不能为空 (自定义期刊请填写完整名称)")
			}
			if len(name) > 250 {
				return nil, errors.New("期刊名称过长 (最多 250 字)")
			}
			if jt.JournalID > 0 {
				fields["journal_id"] = jt.JournalID
			} else {
				// 自定义期刊 — 显式清掉旧的 journal_id 关联
				fields["journal_id"] = sql.NullInt64{}
			}
			fields["journal_name"] = name
			fields["journal_meta_json"] = p.JournalTarget
			// 期刊变化 → meta revision bump → 让 step3 letter cache 失效
			if !sub.JournalID.Valid || sub.JournalID.Int64 != jt.JournalID ||
				!sub.JournalName.Valid || sub.JournalName.String != jt.CanonicalName {
				bumpMeta = true
			}
		}
	}
	if p.SchoolTarget != nil {
		// 毕业模式 — 校名 / 学位 / 学科任何一个变 → bumpMeta
		if !sub.SchoolName.Valid || sub.SchoolName.String != p.SchoolTarget.SchoolName ||
			!sub.DegreeType.Valid || sub.DegreeType.String != p.SchoolTarget.DegreeType ||
			!sub.DisciplineField.Valid || sub.DisciplineField.String != p.SchoolTarget.DisciplineField {
			bumpMeta = true
		}
		fields["school_name"] = p.SchoolTarget.SchoolName
		fields["degree_type"] = p.SchoolTarget.DegreeType
		fields["discipline_field"] = p.SchoolTarget.DisciplineField
		fields["advisor_name"] = p.SchoolTarget.AdvisorName
	}

	if len(fields) > 0 {
		if err := s.repo.PatchSubmission(id, fields); err != nil {
			return nil, err
		}
	}
	if bumpMeta {
		_ = s.repo.BumpMetaRevision(id)
	}
	if bumpLetter {
		_ = s.repo.BumpLetterRevision(id)
	}
	return s.repo.GetByID(id, userID)
}

// ─── 文件上传 ─────────────────────────────────────────────────────────────

// UploadAsset 把 multipart 文件存 MinIO + 落 DB 元数据。
// 主稿件还会同步抽文本(超时 30s),失败不阻塞上传,只是 text_excerpt 为空,
// 后续 Step2 推荐 / submit prompt 都没东西可喂 agent。
func (s *Service) UploadAsset(
	ctx context.Context, userID, submissionID uint64,
	fh *multipart.FileHeader, role, category string,
) (*Asset, error) {
	sub, err := s.repo.GetByID(submissionID, userID)
	if err != nil {
		return nil, err
	}
	// 只能往草稿传文件 —— 已提交的投稿换/加稿件会改坏已提交/已完成审稿的资料集。
	if sub.Status != "draft" {
		return nil, ErrNotDraft
	}
	if role != "manuscript" && role != "attachment" {
		return nil, errors.New("peerreview: role must be manuscript / attachment")
	}

	// 附件里的旧版 Office (doc/xls/ppt/ods/odp) 拒收 —— agent 容器无解析器, 收了审稿时也读不了
	// (2026-07 文件上传调研「收=能读」原则, 与 agentattach 同口径)。
	if role == "attachment" {
		switch strings.ToLower(filepath.Ext(fh.Filename)) {
		case ".doc", ".xls", ".ppt", ".ods", ".odp":
			return nil, errors.New("暂不支持旧版 Office 附件格式, 请另存为 docx / xlsx / pptx 后再上传")
		}
	}

	// 类型 / 空文件 / 大小 校验 —— 与前端一致, 防绕过前端直接打 API
	// (前端 accept 属性只是建议, 0B / .txt / 超限文件都能伪造请求送进来)。
	limit := int64(MaxAttachmentBytes)
	if role == "manuscript" {
		limit = MaxManuscriptBytes
		ext := strings.ToLower(filepath.Ext(fh.Filename))
		if ext != ".pdf" && ext != ".docx" {
			return nil, errors.New("稿件正文只支持 .pdf / .docx")
		}
	}
	if fh.Size == 0 {
		return nil, errors.New("文件是空的 (0 字节)")
	}
	if fh.Size > limit {
		return nil, fmt.Errorf("文件超过 %d MB 上限", limit/1024/1024)
	}

	// 附件数量上限
	if role == "attachment" {
		existing, _ := s.repo.ListAssets(submissionID)
		count := 0
		for _, a := range existing {
			if a.Role == "attachment" {
				count++
			}
		}
		if count >= MaxAttachmentCount {
			return nil, ErrAttachmentLimit
		}
	}

	src, err := fh.Open()
	if err != nil {
		return nil, fmt.Errorf("open multipart: %w", err)
	}
	defer src.Close()

	// 读全量到内存:稿件最大 200MB,我们要 sha256 + 抽文本(只对 manuscript),
	// 而且 MinIO 单 part 上传需要预先知道 size,所以也不省了。
	body, err := io.ReadAll(src)
	if err != nil {
		return nil, fmt.Errorf("read multipart: %w", err)
	}

	sum := sha256.Sum256(body)
	hexsum := hex.EncodeToString(sum[:])

	bucket := s.bucket()
	if bucket == "" {
		return nil, errors.New("peerreview: storage not configured")
	}

	key := assetObjectKey(submissionID, fh.Filename)

	if _, err := storage.PutObject(ctx, bucket, key, bytes.NewReader(body),
		int64(len(body)), storage.PutOptions{
			ContentType: fh.Header.Get("Content-Type"),
			UserMeta: map[string]string{
				"original-name": fh.Filename,
				"submission-id": fmt.Sprintf("%d", submissionID),
				"role":          role,
			},
		}); err != nil {
		return nil, fmt.Errorf("put object: %w", err)
	}

	a := &Asset{
		SubmissionID: submissionID,
		Role:         role,
		Filename:     fh.Filename,
		Size:         uint64(len(body)),
		Mime:         fh.Header.Get("Content-Type"),
		ObjectKey:    key,
	}
	if hexsum != "" {
		a.SHA256.String = hexsum
		a.SHA256.Valid = true
	}
	if category != "" {
		a.Category.String = category
		a.Category.Valid = true
	}

	// 方案 B: backend 不再抽文本 / 不再 pdfparse。原始文件存 MinIO, 审稿流程跑起来时
	// 由 pushAssetsToSession 推到 agent 会话 cwd (正文走 ExtractDocHead 有界抽取,
	// 附件按需 Read/ReadDocument)。标题/摘要/关键词等元数据由 meta-extract 抽 (runMetaExtract)。
	if err := s.repo.CreateAsset(a); err != nil {
		_ = storage.DeleteObject(ctx, bucket, key)
		return nil, err
	}

	// 主稿件更新到 submission.manuscript_asset_id
	if role == "manuscript" {
		_ = s.repo.SetManuscriptAsset(submissionID, a.ID)
	}
	// asset 增减 → bump assets_revision → 让 step2/3 cache 失效。
	// 注意: 这里不主动 reset agent session, 只在下次 AdvanceStep 检测到 cache miss 时按需 reset,
	// 避免用户上传/删除后再次上传过程中反复重建 session 浪费 agent 端 jsonl。
	_ = s.repo.BumpAssetsRevision(submissionID)
	return a, nil
}

// DeleteAsset 删一个文件。
//
// 返回 submissionDeleted=true 表示"删的是草稿里最后一个文件, 整条草稿已被一并取消"
// (连带 submission + agent session)。保留这个"删光=取消草稿"的行为, 是为了避免在审稿
// 记录里残留空壳草稿。但前端必须据此把向导【重置到新建空态】, 而不是继续去拉这条已不存在的
// submission —— 否则 ListAssets 返 404、前端 query 出错保留旧缓存, 表现为"删除不管用、强刷才消失"。
func (s *Service) DeleteAsset(ctx context.Context, userID, submissionID, assetID uint64) (submissionDeleted bool, err error) {
	sub0, err := s.repo.GetByID(submissionID, userID)
	if err != nil {
		return false, err
	}
	// 只能删草稿里的文件 —— 已提交的投稿删稿件会改坏已提交/已完成审稿的资料集。
	if sub0.Status != "draft" {
		return false, ErrNotDraft
	}
	a, err := s.repo.GetAsset(assetID, submissionID)
	if err != nil {
		return false, err
	}
	if err := s.repo.DeleteAsset(assetID, submissionID); err != nil {
		return false, err
	}
	if a.Role == "manuscript" {
		_ = s.repo.DeleteManuscriptIfMatch(submissionID, assetID)
	}
	_ = storage.DeleteObject(ctx, s.bucket(), a.ObjectKey)
	_ = s.repo.BumpAssetsRevision(submissionID)

	// 删光草稿里所有文件 = 取消整条草稿 (连带 submission + agent session), 不留空壳记录。
	sub, gerr := s.repo.GetByID(submissionID, userID)
	if gerr == nil && sub.Status == "draft" {
		if n, _ := s.repo.CountAssets(submissionID); n == 0 {
			if derr := s.DeleteSubmission(ctx, userID, submissionID); derr == nil {
				return true, nil
			}
		}
	}
	return false, nil
}

func (s *Service) ListAssets(userID, submissionID uint64) ([]Asset, error) {
	if _, err := s.repo.GetByID(submissionID, userID); err != nil {
		return nil, err
	}
	return s.repo.ListAssets(submissionID)
}

// ─── 删除整条 submission ────────────────────────────────────────────────
//
// DeleteSubmission 等同于"取消草稿 / 删除审稿记录":
//   1. 校验所有权 (GetByID with userID filter)
//   2. 删 agent session (agent 容器的 jsonl + tool-results)
//   3. 删所有 asset 对应的 MinIO 对象
//   4. 删 DB 行 — peer_review_assets / _reports / _step_cache 走 FK CASCADE 自动清
//   5. 通知 broker 终止 (如果正在 computing,SSE 订阅方会收到 error 并 close)
//
// 任意子步骤失败不阻塞后续 — agent / MinIO 失败只 log,DB 删除仍执行;
// 残留的 agent session jsonl / MinIO 对象由 agent 端 GC / MinIO ILM 兜底。
func (s *Service) DeleteSubmission(ctx context.Context, userID, submissionID uint64) error {
	sub, err := s.repo.GetByID(submissionID, userID)
	if err != nil {
		return err
	}

	// 1) agent session
	if sub.AgentSessionID.Valid && sub.AgentSessionID.String != "" {
		if err := s.feature.AgentClient().DeleteSession(ctx, sub.AgentSessionID.String); err != nil {
			// 404 = session 已不存在, OK; 其它错误只 log
			if !errors.Is(err, agent.ErrSessionNotFound) {
				// 不致命, 继续
				_ = err
			}
		}
		// 清掉统一归属表里的映射 (best-effort, 孤儿无害但保持整洁)
		if s.feature != nil {
			_ = s.feature.UnbindOwnerSession("submission", submissionID)
		}
	}

	// 2) MinIO 对象 (按 asset 列表取 objectKey 批删, 失败只 log)
	bucket := s.bucket()
	if bucket != "" {
		assets, _ := s.repo.ListAssets(submissionID)
		keys := make([]string, 0, len(assets))
		for _, a := range assets {
			if a.ObjectKey != "" {
				keys = append(keys, a.ObjectKey)
			}
		}
		if len(keys) > 0 {
			_ = storage.DeleteObjects(ctx, bucket, keys, nil)
		}
	}

	// 3) 终止 broker — 一次性 fail 该 submission 下所有 slot
	s.broker.FailAll(submissionID, "submission deleted")

	// 4) DB 行 (FK CASCADE 删 assets / reports / step_cache)
	return s.repo.DeleteSubmission(submissionID)
}

// ─── AdvanceStep: wizard "下一步" 的统一入口 ───────────────────────────────
//
// 替代之前直接 PATCH(step) + 独立 ExtractMeta/DraftLetter 调用的拼凑做法。
// 单一接口处理三种情况:
//
//   from=1 → 进 step2: 检查 step2 cache fingerprint; 命中复用; miss → reset session
//            + 异步跑 meta extract goroutine
//   from=2 → 进 step3: 检查 step3 cache fingerprint; 命中复用; miss → 异步跑 letter draft
//            goroutine (session 保留, agent 还记得 manuscript)
//   from=3 → 进 step4: 无 agent 调用, 直接 bump step
//
// 异步路径返回 compute_state='computing_xxx', 前端 polling submission detail。
// 同步路径 (cache hit) 直接返回 compute_state='idle' + 新的 step。

// AdvanceStep 是 wizard 进入下一步的核心入口。
func (s *Service) AdvanceStep(ctx context.Context, userID, submissionID uint64, fromStep int) (*Submission, error) {
	sub, err := s.repo.GetByID(submissionID, userID)
	if err != nil {
		return nil, err
	}
	// wizard 只能推进草稿。已提交的投稿 (queued/reviewing/completed/failed) 一律拒绝 ——
	// 否则 reviewing 撞下面的 computeState 守卫报"计算中", 而 completed (computeState 已回 idle)
	// 会绕过守卫被重新抽 meta / 起草, 把已完稿件改坏。Submit 同样有此守卫 (幂等)。
	if sub.Status != "draft" {
		return nil, ErrNotDraft
	}
	if sub.ComputeState != StateIdle && sub.ComputeState != StateFailed {
		return nil, errors.New("当前正在计算中, 请稍候")
	}
	if fromStep < 1 || fromStep > 3 {
		return nil, ErrInvalidStep
	}
	// 向导 step1→2(抽 meta)/ step2→3(起草信)都是真实 LLM 编排, 与 Submit 一样理应过每日额度 ——
	// 否则已超额用户可反复点"下一步"烧平台成本(改一次文件即 cache miss 强制重跑, 更易反复触发;
	// 历史事故: 向导单轮 10-17M token)。step3→4 无 agent, 不扣。放在 status/computeState/step
	// 守门之后, 保证非法 id / 重复点击不白扣额度。
	if fromStep == 1 || fromStep == 2 {
		// 🔴 抢计算权(审计 P1-8):上面的 ComputeState 判定是内存的,并发两个「下一步」会双双通过、
		// 各自 resetAgentSession 再各自起 goroutine —— 同一条会话上两路并行,既多烧一整轮
		// (向导单轮历史上到过 10-17M token),又互相污染上下文。条件更新让只有一个赢家。
		// 注意抢的是**计算权而非最终状态**:cache 命中的分支不跑 LLM,下面会把它还原成 idle。
		to := StateComputingMeta
		if fromStep == 2 {
			to = StateComputingLetter
		}
		won, cerr := s.repo.ClaimComputeState(submissionID, []string{StateIdle, StateFailed}, to)
		if cerr != nil {
			return nil, cerr
		}
		if !won {
			return nil, errors.New("当前正在计算中, 请稍候")
		}
		// 抢到计算权 = computeState 已翻转,同样广播 state 控制帧(与 setComputeStateNotify 同语义)。
		s.broker.BroadcastAll(submissionID, StreamEvent{Phase: StreamPhaseState, ComputeState: to})
		release := func() {
			if e := s.setComputeStateNotify(submissionID, StateIdle, ""); e != nil {
				slog.Error("peerreview: 向导计算权释放失败(会卡在 computing 但无人在跑)",
					"submission_id", submissionID, "err", e)
			}
		}
		if s.vip != nil {
			if err := s.vip.CheckDailyQuota(ctx, uint(userID)); err != nil {
				release()
				return nil, err // vip.ErrQuotaExceeded → handler 映射成 6010/429
			}
		}
		// 内存态同步:下游 advanceTo2/advanceTo3 会据 sub.ComputeState 再判一次/回写。
		sub.ComputeState = to
		out, aerr := func() (*Submission, error) {
			if fromStep == 1 {
				return s.advanceTo2(ctx, sub)
			}
			return s.advanceTo3(ctx, sub)
		}()
		if aerr != nil {
			release()
			return nil, aerr
		}
		return out, nil
	}
	// fromStep==3:无 agent 调用、不烧 token,不需要抢计算权,直接转。
	if fromStep == 3 {
		if err := s.repo.PatchSubmission(sub.ID, map[string]any{"step": 4}); err != nil {
			return nil, err
		}
		return s.repo.GetByID(submissionID, userID)
	}
	return nil, ErrInvalidStep
}

// advanceTo2 处理 Step1 → Step2: 抽 meta。
//
// fingerprint = assets_revision (meta 只依赖 manuscript 文本)。
// 命中 cache → reload payload 到 submission.title/abstract/extra_meta_json, 转 step=2。
// miss → reset agent session (旧 manuscript 不能干扰) + spawn goroutine。
func (s *Service) advanceTo2(ctx context.Context, sub *Submission) (*Submission, error) {
	// 必须先有 manuscript
	assets, _ := s.repo.ListAssets(sub.ID)
	hasManuscript := false
	for _, a := range assets {
		if a.Role == "manuscript" {
			hasManuscript = true
			break
		}
	}
	if !hasManuscript {
		return nil, ErrManuscriptMissing
	}

	fingerprint := fingerprintStep2(sub.AssetsRevision, s.modelFor(modelcatalog.PurposePeerreviewMeta))

	cache, err := s.repo.GetStepCache(sub.ID, 2)
	if err != nil && !errors.Is(err, ErrNotFound) {
		// cache miss (ErrNotFound) 是正常路径(首跑 / 输入变更)→ 不记;只有真正的 DB/连接异常才 WARN。
		slog.Warn("peerreview: get step2 cache failed", "submission_id", sub.ID, "err", err)
	}
	if cache != nil && cache.InputFingerprint == fingerprint {
		// Cache 命中: 直接转 step=2 (payload 已经在 submission.title/abstract/extra_meta_json,
		// 因为上次成功后 goroutine 已经回填过)。
		// 归还计算权(审计 P1-8):调用方为抢并发把 compute_state 置成了 computing_meta,
		// 而这条分支不跑 LLM、没有 goroutine 会去清它 —— 不还就永远卡在「计算中」。
		if err := s.setComputeStateNotify(sub.ID, StateIdle, ""); err != nil {
			return nil, err
		}
		if err := s.repo.PatchSubmission(sub.ID, map[string]any{"step": 2}); err != nil {
			return nil, err
		}
		return s.repo.GetByID(sub.ID, sub.UserID)
	}

	// Cache miss: 旧 cache 跟 agent session 里的 manuscript 可能都过时,
	// 重建一切 (DeleteSession + CreateSession + 清所有 step_cache)。
	if _, err := s.resetAgentSession(ctx, sub); err != nil {
		return nil, err
	}
	if err := s.repo.PatchSubmission(sub.ID, map[string]any{"step": 2}); err != nil {
		return nil, err
	}
	if err := s.setComputeStateNotify(sub.ID, StateComputingMeta, ""); err != nil {
		return nil, err
	}

	// 异步 agent goroutine (detached context, 5min timeout)
	sid := sub.ID
	sessionID := sub.AgentSessionID.String
	fp := fingerprint
	safego.Go(fmt.Sprintf("peerreview-meta-%d", sid), func() {
		bgCtx, cancel := ctxutil.With(ctxutil.LongIO)
		defer cancel()
		s.runMetaExtract(bgCtx, sid, sessionID, fp)
	})

	return s.repo.GetByID(sub.ID, sub.UserID)
}

// validateReadyForReview 校验"开始起草投稿信 / 提交审稿"所需的必填元信息,
// 与前端 wizard step2 的 nextDisabled 规则保持一致(前端 ManuscriptMetaForm 唯一必填=标题;
// SchoolPickerStep 在毕业模式额外要求院校 + 学科)。后端做权威校验,堵住绕过前端的直连 API。
//
// 复用在两处闸门: advanceTo3 (Step2→3 起草信) 与 Submit (Step4 提交),前者用户改一次就过,
// 后者是兜底(wizard 虽不让前跳, 但 API 仍可能被直接调用)。
func validateReadyForReview(sub *Submission) error {
	if strings.TrimSpace(sub.Title.String) == "" {
		return errors.New("请先填写稿件标题")
	}
	if sub.Mode == "thesis" {
		if strings.TrimSpace(sub.SchoolName.String) == "" {
			return errors.New("请先填写目标院校")
		}
		if strings.TrimSpace(sub.DisciplineField.String) == "" {
			return errors.New("请先填写学科 / 研究方向")
		}
	}
	return nil
}

// advanceTo3 处理 Step2 → Step3: 起草 letter。
//
// fingerprint = (assets_revision, meta_revision, journal_id 或 school_*) 。
// 命中 → 把 cache.payload.body 写到 submission.letter_body, 转 step=3。
// miss → spawn goroutine (不 reset session — agent 已经有 manuscript)。
//
// Safety check: 若 step2 cache fingerprint 跟当前 assets_revision 已对不上,
// 拒绝 advance, 要求用户先回 step2 重新生成。这保证 agent session 里的 manuscript
// 永远是 step2 cache 认可的版本。
func (s *Service) advanceTo3(ctx context.Context, sub *Submission) (*Submission, error) {
	// Sanity: step2 cache 必须存在且还新。
	// 区分两种情况(此前都笼统报"文件已变更", 误导):
	//   - cache 为 nil:Step 2 从未成功生成(常见:meta 抽取解析失败)→ 提示先生成。
	//   - fingerprint 不一致:稿件文件确实变了 → 提示回 Step 2 重新生成。
	step2Cache, _ := s.repo.GetStepCache(sub.ID, 2)
	if step2Cache == nil {
		return nil, errors.New("请先在第 2 步生成稿件信息后再继续")
	}
	if step2Cache.InputFingerprint != fingerprintStep2(sub.AssetsRevision, s.modelFor(modelcatalog.PurposePeerreviewMeta)) {
		return nil, errors.New("文件已变更, 请回到第 2 步重新生成稿件信息后再继续")
	}

	// 必填元信息校验 —— 与前端 wizard step2 的 nextDisabled 规则一致 (见 validateReadyForReview)。
	// 期刊为"选填": journal 模式没填期刊也允许 advance, agent 会走通用 STM 模板;
	// 毕业模式要求院校 + 学科 (审稿背景设定);两种模式都要求标题。
	if err := validateReadyForReview(sub); err != nil {
		return nil, err
	}

	fingerprint := fingerprintStep3(sub)

	cache, err := s.repo.GetStepCache(sub.ID, 3)
	if err != nil && !errors.Is(err, ErrNotFound) {
		// cache miss 正常, 同 step2: 只有真正的 DB/连接异常才 WARN。
		slog.Warn("peerreview: get step3 cache failed", "submission_id", sub.ID, "err", err)
	}
	if cache != nil && cache.InputFingerprint == fingerprint {
		// 命中: 已经写过 letter_body 到 submission, 直接转 step=3
		// 归还计算权(审计 P1-8,同 advanceTo2 的红字):这条分支不跑 LLM,没人会清 computing_letter。
		if err := s.setComputeStateNotify(sub.ID, StateIdle, ""); err != nil {
			return nil, err
		}
		if err := s.repo.PatchSubmission(sub.ID, map[string]any{"step": 3}); err != nil {
			return nil, err
		}
		return s.repo.GetByID(sub.ID, sub.UserID)
	}

	// miss: 异步起草 (session 保留)
	if err := s.repo.PatchSubmission(sub.ID, map[string]any{"step": 3}); err != nil {
		return nil, err
	}
	if err := s.setComputeStateNotify(sub.ID, StateComputingLetter, ""); err != nil {
		return nil, err
	}

	sid := sub.ID
	sessionID := sub.AgentSessionID.String
	fp := fingerprint
	safego.Go(fmt.Sprintf("peerreview-letter-%d", sid), func() {
		bgCtx, cancel := ctxutil.With(ctxutil.LongIO)
		defer cancel()
		s.runLetterDraft(bgCtx, sid, sessionID, fp)
	})

	return s.repo.GetByID(sub.ID, sub.UserID)
}

// ─── 异步 agent goroutine 实现 ──────────────────────────────────────────

// runMetaExtract: 发完整 manuscript prompt (单 session 的第一轮),
// agent 返结构化 JSON, 解析 + 落 step_cache + 回填 submission。
// reviewCallCtxWith 用已知 userID 给 ctx 打上 LLM 账本归属 (feature=peer_review,
// user=投稿人, request_id=submissionID)。ServerSideChatStreaming 内部据此把每轮 token
// 落统一账本。userID=0 → user_id=NULL。
func reviewCallCtxWith(ctx context.Context, submissionID, userID uint64) context.Context {
	var uid *uint
	if userID > 0 {
		u := uint(userID)
		uid = &u
	}
	return llmusage.WithCall(ctx, llmusage.Call{
		Feature:   llmusage.FeaturePeerReview,
		UserID:    uid,
		RequestID: strconv.FormatUint(submissionID, 10),
	})
}

// reviewCallCtx 没有现成 submission 时从 DB 取 userID 再打归属 (取不到则 NULL)。
func (s *Service) reviewCallCtx(ctx context.Context, submissionID uint64) context.Context {
	var userID uint64
	if sub, err := s.repo.GetByIDInternal(submissionID); err == nil {
		userID = sub.UserID
	}
	return reviewCallCtxWith(ctx, submissionID, userID)
}

// meta「预识别」的文档头有界抽取参数:前 metaHeadPages 页 且 ≤ metaHeadChars 字符(标题/摘要/
// 关键词/学科都落在这个范围内)。把「只看开头」从提示词软约束升级成构造性硬约束的关键(见 runMetaExtract)。
const (
	metaHeadPages = 3
	metaHeadChars = 8000
	// 审稿正文「只读一次」的抽取字符上界:pdfPages=0=全部页,上界与 agent ReadDocument 的 MAX_DOC_CHARS
	// (默认 400k)对齐 —— 审稿人本就需要通读全文,不缩量以免降低审稿质量,故不构成相对旧 ReadDocument 路径的回归。
	reviewManuscriptChars = 400000
	// 正文 preamble 的估算 token 预算(2026-07 文件上传调研):400K **字符**对英文稿 ≈ 100K tokens
	// 尚可,对中文稿 ≈ 300K+ tokens,单条 preamble 直接超模型上下文(agent 默认窗 128K)。
	// 注入前按 estimateTokens 粗估并钳到该预算内,超出部分截断并如实标注(见 capManuscriptForContext)。
	reviewManuscriptTokenBudget = 90000
)

// estimateTokens 粗估文本 token 数:CJK ≈ 1 token/字符,其它(拉丁/数字/标点)≈ 1 token/4 字符。
// 只用于预算钳制,不追求精确;宁可略高估(预算内留余量)。
func estimateTokens(s string) int {
	cjk, other := 0, 0
	for _, r := range s {
		if isCJKRune(r) {
			cjk++
		} else {
			other++
		}
	}
	return cjk + other/4
}

func isCJKRune(r rune) bool {
	return (r >= 0x2E80 && r <= 0x9FFF) || // CJK 部首/统一表意文字区
		(r >= 0x3400 && r <= 0x4DBF) ||
		(r >= 0xAC00 && r <= 0xD7AF) || // Hangul 音节 (审查修正: 韩文稿件此前低估约 4 倍)
		(r >= 0xF900 && r <= 0xFAFF) || // 兼容表意文字
		(r >= 0xFF00 && r <= 0xFFEF) || // 全角符号
		r >= 0x20000 // CJK 扩展 B 及以上平面 (生僻汉字)
}

// capManuscriptForContext 把抽取的正文钳到 token 预算内:预算内原样返回;超出则按 rune 逐个累计
// 估算 token,截到预算处,返回 (截断文本, true)。截断结果由 preamble/commonContext 如实标注,
// 绝不再对模型谎称「全文」(此前 truncated 标志被调用点忽略 = 静默半盲审)。
func capManuscriptForContext(text string) (string, bool) {
	if estimateTokens(text) <= reviewManuscriptTokenBudget {
		return text, false
	}
	var b strings.Builder
	b.Grow(len(text))
	used, other := 0, 0
	for _, r := range text {
		if isCJKRune(r) {
			used++
		} else {
			other++
			if other%4 == 0 {
				used++
			}
		}
		if used >= reviewManuscriptTokenBudget {
			break
		}
		b.WriteRune(r)
	}
	return b.String(), true
}

func (s *Service) runMetaExtract(ctx context.Context, submissionID uint64, sessionID, fingerprint string) {
	failure := func(reason string) {
		_ = s.setComputeStateNotify(submissionID, StateFailed, reason)
		s.broker.Fail(submissionID, SlotMeta, reason)
	}
	// panic 兜底: 否则 compute_state 永远卡在 computing_meta —— 前端按钮禁用 + AdvanceStep 400,
	// 用户除了取消草稿(删光文件)无路可退。复位 failed 让 FailureBanner 出"重试"。
	defer func() {
		if r := recover(); r != nil {
			slog.Error("peerreview meta goroutine panic", "submission_id", submissionID, "panic", r)
			failure("内部错误, 请重试")
		}
	}()
	ctx = s.reviewCallCtx(ctx, submissionID) // LLM 账本归属 (feature=peer_review + 投稿人)
	s.broker.Begin(submissionID, SlotMeta)

	// 稿件推到 agent 会话 cwd —— 供下方**确定性有界抽取**(ExtractDocHead)读取,同时为后续 letter /
	// 审稿轮保证文件在 cwd(pushAssetsToSession 幂等,各入口各推一次)。meta 本身不再让 agent 自己读全文。
	files, perr := s.pushAssetsToSession(ctx, submissionID, sessionID)
	if perr != nil {
		if errors.Is(perr, ErrManuscriptMissing) {
			failure("稿件未上传")
		} else {
			slog.Error("peerreview meta push assets failed", "submission_id", submissionID, "err", perr)
			failure("稿件处理失败,请稍后重试")
		}
		return
	}

	// 【核心止血】确定性有界抽取「文档头」:对所有格式硬性钳到 前 metaHeadPages 页 且 ≤ metaHeadChars 字符
	// (PDF 走 pdftotext -l N;docx/其它走 pandoc 后硬截)。取代过去「让 agent 自己 ReadDocument」——那条路
	// 对 docx 靠提示词永远抽全文(pandoc 无页限)、PDF 的 first_pages 是模型可无视的软约束,叠加共享 session +
	// JSON 重试,一次便宜的 meta 会把整篇稿件反复灌进上下文烧掉大量 token。现在 meta 那轮 agent 只拿到一小段
	// 头文本、不进任何文件读取工具,token 由构造钳死。
	head, herr := s.feature.AgentClient().ExtractDocHead(ctx, sessionID, files.manuscriptPath, metaHeadPages, metaHeadChars)
	if herr != nil {
		// 扫描件无文本层 / 转换失败 → agent 返 422。不再退回全文乱读,直接引导用户重试(记 Warn,非系统故障)。
		slog.Warn("peerreview meta extract doc head failed", "submission_id", submissionID, "err", herr)
		failure("稿件信息抽取失败,请确认稿件包含可选中文字(非扫描图片),或稍后重试")
		return
	}

	prompt := fmt.Sprintf(
`下面是一篇论文的**开头部分**(标题、摘要、关键词、学科通常都在这里)。请据此抽取投稿元数据。
只依据给出的文本,不要臆测;文本可能在中途截断,忽略不完整的尾句即可。

===== 论文开头 =====
%s
===== 结束 =====

抽取结构化元数据, **严格 JSON 输出**(不要任何前后缀文本 / 不要 markdown 代码块):

{
  "title": "<论文完整标题, 不要带换行 / ligature artifact / 序号>",
  "abstract": "<完整摘要, 1 段, 200-400 字>",
  "keywords": ["<3-7 个关键词, 简短 1-3 词>"],
  "subjects": ["<1-3 个学科领域, 例如 '计算机科学' / 'Computational Linguistics'>"],
  "manuscriptType": "<research / review / short_communication 三选一, 不确定填 research>"
}`, head.Text)

	// 元数据 JSON 解析:模型偶发吐非法 JSON —— 尤其含非 ASCII 的论文(法语/带变音符),
	// 会在结构位置漏出游离字符(如 'ç')冲碎 JSON。与审稿打分链一致,走 chatWithRetry 有界
	// 重试(带"只输出合法 JSON"强约束)+ 引号修复兜底,不再一次解析失败就让整步 fail。
	parseMeta := func(reply string) (ExtractedMeta, bool) {
		var m ExtractedMeta
		raw := extractFirstJSONObject(reply)
		if raw == nil {
			return m, false
		}
		if err := json.Unmarshal(raw, &m); err == nil {
			return m, true
		}
		// 兜底:修复字符串内未转义的引号后再试(repairUnescapedInnerQuotes 已用于审稿报告解析)。
		if err := json.Unmarshal(repairUnescapedInnerQuotes(raw), &m); err == nil {
			return m, true
		}
		return m, false
	}

	reply, _, _, err := s.chatWithRetry(ctx, sessionID, submissionID, SlotMeta, prompt, s.modelFor(modelcatalog.PurposePeerreviewMeta),
		func(r string) bool { _, valid := parseMeta(r); return valid }, 2)
	if err != nil {
		slog.Error("peerreview meta agent chat failed", "submission_id", submissionID, "err", err)
		failure("信息抽取失败,请稍后重试")
		return
	}
	meta, ok := parseMeta(reply)
	if !ok {
		// 重试后仍非法 —— 模型输出问题, 非系统故障, 记 Warn 让用户重试。
		slog.Warn("peerreview meta json parse failed after retries", "submission_id", submissionID)
		failure("信息抽取失败,请稍后重试")
		return
	}

	// 落 step_cache
	payload, _ := json.Marshal(meta)
	_ = s.repo.UpsertStepCache(&StepCache{
		SubmissionID:     submissionID,
		Step:             2,
		InputFingerprint: fingerprint,
		PayloadJSON:      payload,
	})

	// 回填 submission: title/abstract 顶层列 + extra_meta_json (keywords/subjects/type)
	fields := map[string]any{}
	if meta.Title != "" {
		fields["title"] = meta.Title
	}
	if meta.Abstract != "" {
		fields["abstract"] = meta.Abstract
	}
	extra := ExtractedMeta{
		Keywords:       meta.Keywords,
		Subjects:       meta.Subjects,
		ManuscriptType: meta.ManuscriptType,
	}
	extraJSON, _ := json.Marshal(extra)
	fields["extra_meta_json"] = json.RawMessage(extraJSON)
	if len(fields) > 0 {
		_ = s.repo.PatchSubmission(submissionID, fields)
	}
	_ = s.setComputeStateNotify(submissionID, StateIdle, "")
	s.broker.Done(submissionID, SlotMeta)
}

// runLetterDraft: agent session 里已经有稿件「文档头」—— step1→2 的 meta-extract 已把 ExtractDocHead
// 抽出的开头文本(标题/摘要/前 metaHeadPages 页)内联进了会话上下文。这里只发简短 prompt 告诉它
// "起草 letter, 目标 X, 风格 Y", 不重传也不重读稿件(cover letter 只需标题/摘要/贡献,头文本够用)。
// 这是 single-session 的核心 token 节省点。
// (前置依赖: advanceTo3 的 safety check 保证 assets 没变, 会话里的稿件头仍是当前版本。)
func (s *Service) runLetterDraft(ctx context.Context, submissionID uint64, sessionID, fingerprint string) {
	failure := func(reason string) {
		_ = s.setComputeStateNotify(submissionID, StateFailed, reason)
		s.broker.Fail(submissionID, SlotLetter, reason)
	}
	// panic 兜底: 否则 compute_state 永远卡在 computing_letter (同 runMetaExtract)。
	defer func() {
		if r := recover(); r != nil {
			slog.Error("peerreview letter goroutine panic", "submission_id", submissionID, "panic", r)
			failure("内部错误, 请重试")
		}
	}()
	s.broker.Begin(submissionID, SlotLetter)

	sub, err := s.repo.GetByIDInternal(submissionID)
	if err != nil {
		slog.Error("peerreview letter load submission failed", "submission_id", submissionID, "err", err)
		failure("加载投稿信息失败,请稍后重试")
		return
	}
	ctx = reviewCallCtxWith(ctx, submissionID, sub.UserID) // LLM 账本归属

	variant := "cover_letter"
	target := "通用 STM 期刊投稿模板 (用户未指定目标期刊)"
	if sub.Mode == "thesis" {
		variant = "review_letter"
		target = fmt.Sprintf("%s · %s · %s",
			sub.SchoolName.String, degreeLabel(sub.DegreeType.String), sub.DisciplineField.String)
		if sub.AdvisorName.Valid && sub.AdvisorName.String != "" {
			target += " · 指导老师 " + sub.AdvisorName.String
		}
	} else if sub.JournalName.Valid && sub.JournalName.String != "" {
		target = sub.JournalName.String
	}

	kind := "英文 Cover Letter (致期刊编辑部)"
	if variant == "review_letter" {
		kind = "中文致评阅老师审稿信"
	}

	prompt := fmt.Sprintf(
`基于前面那篇论文 (你已经记住), 请帮我起草一份 %s。

目标: %s
风格: 正式严谨, 200-400 词

直接输出信件正文, 不要任何前后缀 / 元注释 / markdown 代码块。`, kind, target)

	reply, _, err := s.feature.ServerSideChatStreaming(ctx, sessionID, prompt, func(delta string) {
		s.broker.Append(submissionID, SlotLetter, delta)
	}, func(note string) {
		s.broker.Status(submissionID, SlotLetter, note)
	}, s.modelFor(modelcatalog.PurposePeerreviewLetter))
	if err != nil {
		slog.Error("peerreview letter agent chat failed", "submission_id", submissionID, "err", err)
		failure("推荐信生成失败,请稍后重试")
		return
	}
	body := strings.TrimSpace(reply)
	if body == "" {
		failure("推荐信生成失败,请稍后重试")
		return
	}

	// step_cache + 回填 submission.letter_body
	payload, _ := json.Marshal(map[string]string{"body": body})
	_ = s.repo.UpsertStepCache(&StepCache{
		SubmissionID:     submissionID,
		Step:             3,
		InputFingerprint: fingerprint,
		PayloadJSON:      payload,
	})
	_ = s.repo.PatchSubmission(submissionID, map[string]any{"letter_body": body})
	_ = s.setComputeStateNotify(submissionID, StateIdle, "")
	s.broker.Done(submissionID, SlotLetter)
}

// ─── fingerprint helpers ─────────────────────────────────────────────

// fingerprintStep2 — meta extraction 依赖 manuscript 文本(跟 assets_revision 走)+ 抽取模型
// (admin 换绑 peerreview.meta 后强制重抽, 避免旧模型的缓存结果穿透)。
func fingerprintStep2(assetsRevision uint32, modelID string) string {
	return fmt.Sprintf("a%d:%s", assetsRevision, modelID)
}

// fingerprintStep3 — letter 依赖 manuscript + meta + 目标 (期刊或院校)。
func fingerprintStep3(sub *Submission) string {
	target := ""
	if sub.Mode == "journal" && sub.JournalID.Valid {
		target = fmt.Sprintf("j%d", sub.JournalID.Int64)
	} else if sub.Mode == "thesis" {
		target = "t:" + sub.SchoolName.String + "/" + sub.DegreeType.String + "/" + sub.DisciplineField.String
	}
	return fmt.Sprintf("a%d_m%d_%s", sub.AssetsRevision, sub.MetaRevision, target)
}

// ─── 投递 ────────────────────────────────────────────────────────────────

// Submit 把草稿 → queued,后台 goroutine 跑 agent 4 轮。
// 同一份草稿被点两次 Submit,第二次会返回当前状态,不重复跑 agent(由 status 守门)。
func (s *Service) Submit(ctx context.Context, userID, id uint64) (*Submission, error) {
	sub, err := s.repo.GetByID(id, userID)
	if err != nil {
		return nil, err
	}
	if sub.Status != "draft" {
		return sub, nil // 幂等:已投递/审稿中/完成 直接返回, 不重复跑、不扣额度
	}
	if !sub.ManuscriptAssetID.Valid {
		return nil, ErrManuscriptMissing
	}
	// 必填元信息兜底校验 (标题 / 毕业模式院校 + 学科) —— 与 advanceTo3 同一规则,
	// 防直连 API 绕过前端用空标题/空院校提交, 否则审稿 prompt 背景为空、质量退化。
	if err := validateReadyForReview(sub); err != nil {
		return nil, err
	}

	// 🔴 先抢起跑权,再做一切有成本的事(审计 P1-8)。
	// 上面的 `sub.Status != "draft"` 是内存判定,并发下两个请求会双双通过 —— 用条件更新把
	// draft→queued 变成只有一个赢家的原子动作。抢不到 = 别人已经在跑,直接返回当前状态(幂等)。
	won, err := s.repo.ClaimStatus(id, "draft", map[string]any{"status": "queued"})
	if err != nil {
		return nil, err
	}
	if !won {
		return s.repo.GetByID(id, userID) // 并发落败 = 已被投递,不重复跑、不扣额度
	}
	// 抢到之后任何一步失败都要把状态还回 draft,否则用户的草稿会永远卡在 queued 且没人在跑。
	revert := func() {
		if _, e := s.repo.ClaimStatus(id, "queued", map[string]any{"status": "draft"}); e != nil {
			slog.Error("peerreview: 起跑失败后回滚 draft 失败(草稿会卡在 queued,需人工处理)",
				"submission_id", id, "err", e)
		}
	}

	// 到这里才是"草稿 + 稿件齐备、确实要跑一轮审稿" —— 此刻扣会员每日额度(最贵的功能)。
	// 放在 status/manuscript 守门之后, 保证非法 id / 重复点击 / 无稿件 不会白烧额度。
	// 起跑闸(审计 P1-3):通用额度闸 + 「剩余预算够跑完一场」。
	if err := s.ensureReviewBudget(ctx, userID); err != nil {
		revert()
		return nil, err
	}

	// 复用 submission 自己的 agent session (CreateDraft 时建的);
	// 不存在则补建一个 (不调 reset, 避免清掉 wizard 期间累积的 manuscript / letter 对话)。
	sessionID, err := s.ensureAgentSession(ctx, sub)
	if err != nil {
		revert()
		return nil, fmt.Errorf("agent session: %w", err)
	}

	if err := s.repo.MarkSubmitted(id, time.Now(), sessionID); err != nil {
		revert()
		return nil, err
	}
	_ = s.setComputeStateNotify(id, StateReviewing, "")

	// 异步跑 agent — 用 safego 包一层 recover,避免 panic 把主进程带崩
	safego.Go(fmt.Sprintf("peerreview-runner-%d", id), func() {
		s.runReviewBackground(id, sessionID)
	})

	return s.repo.GetByID(id, userID)
}

// RetryReview —— 重试一份**失败**的审稿(评审 top#2:失败原本是终局死胡同,只能删了重传;这里给出
// 可重试路径)。复用 submission 已建的会话与已完成的报告:runReviewBackground 的 loadPersistedReviewer /
// allReviewersPersisted / chief-persisted 短路会跳过已完成轮,只补跑失败/未跑的部分 —— 已完成轮的 token
// 不会重烧。仍过每日额度闸(重试会消耗 token,和首跑一样从严)。非 failed 状态 → 原样返回(幂等)。
func (s *Service) RetryReview(ctx context.Context, userID, id uint64) (*Submission, error) {
	sub, err := s.repo.GetByID(id, userID)
	if err != nil {
		return nil, err
	}
	if sub.Status != StateFailed { // StateFailed=="failed";markFailedAndLog 同时置 status+compute_state=failed
		return sub, nil // 只重试失败的;其它状态原样返回,前端据 status 决定是否显示「重试」
	}
	if !sub.ManuscriptAssetID.Valid {
		return nil, ErrManuscriptMissing
	}
	// 抢起跑权(审计 P1-8):failed→reviewing 的条件更新,并发重试只有一个赢家。
	// 顺带把「先回 reviewing 让前端切走失败态」这件事一并做了(原来是后面的 MarkReviewing)。
	won, err := s.repo.ClaimStatus(id, StateFailed, map[string]any{"status": "reviewing"})
	if err != nil {
		return nil, err
	}
	if !won {
		return s.repo.GetByID(id, userID) // 并发落败 = 已被别的请求重试上了
	}
	revert := func() {
		if _, e := s.repo.ClaimStatus(id, "reviewing", map[string]any{"status": StateFailed}); e != nil {
			slog.Error("peerreview: 重试起跑失败后回滚 failed 失败(会卡在 reviewing 但无人在跑)",
				"submission_id", id, "err", e)
		}
	}
	// 起跑闸(审计 P1-3):重试同样是完整一场,与首跑同一把闸。
	if err := s.ensureReviewBudget(ctx, userID); err != nil {
		revert()
		return nil, err
	}
	sessionID, err := s.ensureAgentSession(ctx, sub)
	if err != nil {
		revert()
		return nil, fmt.Errorf("agent session: %w", err)
	}
	_ = s.setComputeStateNotify(id, StateReviewing, "")
	safego.Go(fmt.Sprintf("peerreview-retry-%d", id), func() {
		s.runReviewBackground(id, sessionID)
	})
	return s.repo.GetByID(id, userID)
}

// runReviewBackground 后台 agent 编排 — 4 轮 skill-driven 串行。
//
// 流程:
//   1. PickSkillsForSubmission 按 subjects 选 4 个 skill (alpha/beta/gamma/chief)
//   2. 取 manuscript 文本 + meta 组成 commonContext
//   3. 串行跑 alpha → beta → gamma: 每轮 prompt = skill.SystemPrompt + commonContext,
//      agent 回严格 JSON, 解析到 ReviewerOutput 落 report 结构化字段
//   4. 最后跑 chief: prompt = skill.SystemPrompt + commonContext + 三位 reviewer JSON 摘要,
//      agent 回 ChiefOutput, 落 chief report
//
// 任何一轮失败 → MarkFailed 整份 submission, 前面成功的报告保留 (用户能在详情页看到)。
// JSON 解析失败 → 不致命: 报告里 content_md 存原文, 结构化字段留 NULL, 前端优雅降级。
// loadPersistedReviewer — P0 廉价止血(债#4):某 reviewer 已有持久化报告 → 返回 (从 ContentMd
// rehydrate 的 ReviewerOutput, done=true),本次跳过重跑。persisted=nil 表示已存的是 degraded 行
// (解析不出结构化输出)→ 仍跳轮,chief 该槽自然降级(与原始首跑行为一致)。GetReportByRole 报错
// (含 ErrNotFound)→ done=false → 正常跑该 reviewer(重跑经 UpsertReport 的 (submission_id, role)
// OnConflict 覆盖,安全)。
//
// 必须 rehydrate reviewerOutputs:否则 crash 重入后 chief 静默丢已完成 reviewer 的真实意见。
func (s *Service) loadPersistedReviewer(submissionID uint64, role string) (out *ReviewerOutput, done bool) {
	rep, err := s.repo.GetReportByRole(submissionID, role)
	if err != nil {
		return nil, false
	}
	if parsed, ok := parseReviewerJSON(rep.ContentMd); ok {
		return parsed, true
	}
	return nil, true
}

// allReviewersPersisted — alpha/beta/gamma 三份报告是否都已持久化(用于跳过整段 methodology 会话,
// 即债#4 的最大单笔浪费)。
func (s *Service) allReviewersPersisted(submissionID uint64) bool {
	for _, role := range []string{"alpha", "beta", "gamma"} {
		if _, err := s.repo.GetReportByRole(submissionID, role); err != nil {
			return false
		}
	}
	return true
}

func (s *Service) runReviewBackground(submissionID uint64, sessionID string) {
	// panic 兜底: 否则 status 永远卡在 reviewing —— 工单详情永久"审稿进行中", 且 Submit 幂等
	// 无法重触发。复位 failed 让用户看到失败终态 (markFailedAndLog 同时置 status + compute_state)。
	defer func() {
		if r := recover(); r != nil {
			slog.Error("peerreview review goroutine panic", "submission_id", submissionID, "panic", r)
			s.markFailedAndLog(submissionID, "审稿内部错误, 请稍后重试")
		}
	}()
	ctx, cancel := ctxutil.With(ctxutil.BackgroundJob)
	defer cancel()

	if err := s.repo.MarkReviewing(submissionID); err != nil {
		return
	}

	sub, err := s.repo.GetByIDInternal(submissionID)
	if err != nil {
		s.markFailedAndLog(submissionID, "load submission: "+err.Error())
		return
	}
	// LLM 账本归属: methodology / 3 审稿人 / chief 的每轮 server-side chat 都用这个 ctx,
	// ServerSideChatStreaming 内部据此各落一行 (feature=peer_review + 投稿人)。
	ctx = reviewCallCtxWith(ctx, submissionID, sub.UserID)

	// 把稿件 + 附件推到 agent 会话 cwd (审稿可能在 meta 之后很久才触发,此处再推一次保证 session
	// 重建后文件仍在)。正文供下方**一次性有界抽取**读取;附件仍可按需 Read。
	files, perr := s.pushAssetsToSession(ctx, submissionID, sessionID)
	if perr != nil {
		if errors.Is(perr, ErrManuscriptMissing) {
			s.markFailedAndLog(submissionID, "稿件未上传")
		} else {
			s.markFailedAndLog(submissionID, "推送稿件到 agent 失败: "+perr.Error())
		}
		return
	}

	// 【R2 止血】审稿正文「只读一次」:过去 commonContext 让**每位**审稿人 + 主审各用 ReadDocument 通读全文,
	// 在共享 session 里叠成 O(N²) input 计费(alpha 读一份;beta 轮既带上 alpha 那份、又自己再读一份…到 chief
	// 已累积多份全文)。改为后端**确定性抽全文一次**(pdfPages=0=全部页,仍受 reviewManuscriptChars 上界),
	// 下方作为**一条 preamble** 注入共享 session,审稿人直接引用上文、不再各读一遍。抽取失败(扫描件无文本层)
	// 则清空 → 回退到旧的「各自 ReadDocument」路径,不 hard-fail。
	var manuscriptInline string
	var manuscriptTruncated bool // 抽取被 400K 字符钳 ∨ token 预算钳 —— 必须向模型如实标注,严禁谎称全文
	if ft, ferr := s.feature.AgentClient().ExtractDocHead(ctx, sessionID, files.manuscriptPath, 0, reviewManuscriptChars); ferr != nil {
		slog.Warn("peerreview review manuscript extract failed; reviewers fall back to per-turn ReadDocument",
			"submission_id", submissionID, "err", ferr)
	} else {
		capped, tokCapped := capManuscriptForContext(ft.Text)
		manuscriptInline = capped
		manuscriptTruncated = ft.Truncated || tokCapped
		if manuscriptTruncated {
			slog.Warn("peerreview manuscript preamble truncated; reviewers will be told honestly",
				"submission_id", submissionID, "extract_truncated", ft.Truncated, "token_capped", tokCapped,
				"chars", len(manuscriptInline))
		}
	}

	// 选择 + 方法论会话(临时, Skill 开): agent 读论文 + invoke reviewer-roster 选 3 位审稿人, 产出方法论。
	// 期间 compute_state=computing_methodology: status 仍 reviewing, 但前端据此显示"通读全文·制定审稿标准"
	// + 实时方法论流(slot=methodology), 不把这段误标成"审稿人A评议中"。完成/降级后切回 reviewing。
	//
	// 挑审稿人已从后端 Go(原 4 个 PersonaRandomPicker + feature_prompts DB)整体移进 agent;
	// 返回的 choices 恒为 3 位 ReviewerChoice(选择失败自动退化到内置三人格), 永不 hard-fail。
	_ = s.setComputeStateNotify(submissionID, StateComputingMethodology, "")
	// 把投稿人长期记忆(画像/偏好)作为背景注入「方法论分析」这一用户向步骤(帮助理解论文所属
	// 领域/作者水平)。注意:只注入方法论会话,**不进入审稿人盲评打分**——methodology 产出的是
	// 分析文本而非原始记忆,commonContext 据此不含用户画像,保持评分客观(融合进智能审稿,但不偏审)。
	memCtx := s.feature.Bridge().MemoryBlocks(uint(sub.UserID))
	// P0 止血(债#4):全部 reviewer 已持久化(crash 在 chief 前重入)→ 跳过整段 methodology 会话
	// (最大单笔浪费),用内置三人格占位;下方 reviewer 循环会逐个 gap-fill 跳过,choices[i] 不被索引。
	var methodology string
	var choices []ReviewerChoice
	var reviewTokens int64 // 单场累计 token(方法论 + 各审稿人),用于成本兜底上限判定
	if s.allReviewersPersisted(submissionID) {
		choices = builtinReviewerChoices()
	} else {
		var methTokens int64
		methodology, choices, methTokens = s.runMethodologyPhase(ctx, submissionID, files, memCtx)
		reviewTokens += methTokens
	}
	_ = s.setComputeStateNotify(submissionID, StateReviewing, "")

	// 把抽好的正文作为**一条** preamble 注入共享 session(只此一次);随后审稿人/主审的每轮都只把它当作
	// 已在上文的稳定前缀(prompt-cache 命中走 cache-read 折扣),不再各自重读。注入失败 → 清空回退到 ReadDocument。
	if manuscriptInline != "" {
		_, pUsage, serr := s.feature.ServerSideChatStreaming(ctx, sessionID, buildManuscriptPreamble(manuscriptInline, manuscriptTruncated),
			func(string) {}, func(string) {}, s.modelFor(modelcatalog.PurposePeerreviewScoring))
		if serr != nil {
			slog.Warn("peerreview seat manuscript preamble failed; reviewers fall back to per-turn ReadDocument",
				"submission_id", submissionID, "err", serr)
			manuscriptInline = ""
		} else {
			reviewTokens += usageTotal(pUsage) // preamble 的 token 计入单场成本兜底累计
		}
	}

	commonContext := buildCommonContext(sub, files, methodology, manuscriptInline != "", manuscriptTruncated)

	// 3 位审稿人串行 — 每位独立 slot, 同时推 broker 让前端实时看到 agent 输出。
	// 保留各自 ReviewerOutput 用于 chief 上下文。
	reviewerOutputs := make(map[string]*ReviewerOutput, 3)
	roles := []string{"alpha", "beta", "gamma"}
	tokenCap := s.reviewTokenCap()
	for i, role := range roles {
		slot := ReviewerSlot(role)
		// P0 止血(债#4):已持久化的 reviewer 跳过重跑(只补缺口,不重烧整篇)。从 ContentMd
		// rehydrate reviewerOutputs,否则 chief 静默丢该 reviewer 真实意见(buildChiefPrompt 缺则降级)。
		if persisted, done := s.loadPersistedReviewer(submissionID, role); done {
			if persisted != nil {
				reviewerOutputs[role] = persisted
			}
			s.broker.Done(submissionID, slot)
			continue
		}
		// 成本兜底(评审 top#1):单场累计 token 已达上限 → 跳过剩余审稿人(出降级占位),仍进主审裁决。
		// 上限刻意很高,只在真失控(如 JSON 重试叠加)时触发,正常审稿绝不会到这里。
		if tokenCap > 0 && reviewTokens >= tokenCap {
			slog.Warn("peerreview per-review token cap hit; skipping remaining reviewers, going to chief",
				"submission_id", submissionID, "review_tokens", reviewTokens, "cap", tokenCap, "from_role", role)
			s.skipRemainingReviewers(submissionID, roles[i:])
			break
		}
		choice := choices[i] // 第 i 位 agent 选中的审稿人 → 固定槽 alpha/beta/gamma(前端仍匿名显示 A/B/C)
		prompt := buildReviewerPrompt(choice, commonContext, role)

		reply, usage, _, err := s.chatWithRetry(ctx, sessionID, submissionID, slot, prompt, s.modelFor(modelcatalog.PurposePeerreviewScoring),
			func(r string) bool { _, ok := parseReviewerJSON(r); return ok }, peerReviewJSONRetries)
		if err != nil {
			s.failUser(submissionID, slot, "审稿生成失败,请稍后重试",
				fmt.Errorf("reviewer chat role=%s reviewer=%s: %w", role, choice.Slug, err))
			return
		}
		reviewTokens += usageTotal(usage) // 累计本轮(含重试)token,供下一位的成本兜底判定

		out, ok := parseReviewerJSON(reply)
		rep := s.buildReportFromReviewer(submissionID, role, out, ok, reply, usage)
		if err := s.repo.UpsertReport(rep); err != nil {
			s.failUser(submissionID, slot, "保存审稿结果失败,请稍后重试",
				fmt.Errorf("save role=%s report: %w", role, err))
			return
		}
		s.notifyReportReady(submissionID, role)
		if ok {
			reviewerOutputs[role] = out
		}
		s.broker.Done(submissionID, slot)
	}

	// chief — 把 3 份 reviewer JSON 拼成上下文, 让主审能逐位回应。chief 人格固定(内置 const)。
	chiefSlot := ReviewerSlot("chief")
	// P0 止血(债#4):chief 已持久化(crash 在 chief upsert 与 MarkCompleted 之间)→ 直接收尾,不重跑。
	// 顺序铁律:**先写库后 Done**(与 runMetaExtract/runLetterDraft 一致)—— done 帧会让前端
	// 立即 refetch,若终局 UPDATE 还没落库,refetch 读到 reviewing 只能等 15s 兜底轮询纠正。
	if _, err := s.repo.GetReportByRole(submissionID, "chief"); err == nil {
		_ = s.repo.MarkCompleted(submissionID)
		_ = s.setComputeStateNotify(submissionID, StateIdle, "")
		s.broker.Done(submissionID, chiefSlot)
		return
	}
	chiefPrompt := buildChiefPrompt(commonContext, reviewerOutputs)

	chiefReply, chiefUsage, _, err := s.chatWithRetry(ctx, sessionID, submissionID, chiefSlot, chiefPrompt, s.modelFor(modelcatalog.PurposePeerreviewChief),
		func(r string) bool { _, ok := parseChiefJSON(r); return ok }, peerReviewJSONRetries)
	if err != nil {
		s.failUser(submissionID, chiefSlot, "主审决议生成失败,请稍后重试", fmt.Errorf("chief chat: %w", err))
		return
	}
	chiefOut, chiefOK := parseChiefJSON(chiefReply)
	chiefRep := s.buildReportFromChief(submissionID, chiefOut, chiefOK, chiefReply, chiefUsage)
	if err := s.repo.UpsertReport(chiefRep); err != nil {
		s.failUser(submissionID, chiefSlot, "保存审稿结果失败,请稍后重试", fmt.Errorf("save chief report: %w", err))
		return
	}
	s.notifyReportReady(submissionID, "chief")
	// 先写终局库再发 done 帧(顺序铁律,同上):done 触发的 refetch 必须能读到 completed/idle。
	_ = s.repo.MarkCompleted(submissionID)
	_ = s.setComputeStateNotify(submissionID, StateIdle, "")
	s.broker.Done(submissionID, chiefSlot)

	// 审稿完成后,把投稿人的长期记忆「抽取」任务推给 agent 执行(server-side 路径:新开一条到该会话的
	// WS 发 extract_memory 帧,无前端连接 → 不 displacement)。best-effort、独立 goroutine + 自带 ctx,
	// 不阻塞审稿返回;限流(per-user 90s)+ prompt 组装 + 写库校验全在 backend。抽取提示词已指明「忽略
	// 一次性任务/具体论文细节」,故只学到投稿人稳定画像(领域/水平),不会把被审论文内容写进记忆。
	if uid := uint(sub.UserID); uid != 0 {
		sid := sessionID
		safego.Go("peerreview-memory-extract", func() {
			mctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()
			s.feature.ExtractMemoryServerSide(mctx, sid, uid)
		})
	}
}

// peerReviewJSONRetries 评分轮 JSON 解析失败时的最大重发次数(带强约束提示重发)。
const peerReviewJSONRetries = 2

// scoringSessionDeny: 审稿是 server 单发要 JSON 的批处理 —— 给评分会话**追加**禁用
// Skill/Agent(子 agent), 防模型在评分轮 invoke skill / 起子 agent 产生叙述文本冲碎 JSON。
// union 进 agent 全局禁用列表(见 conversationService.buildSessionCliArgs)。
// 方法论会话(P3 step2)不传这个 → Skill 开, 可 invoke 审稿 skill(但仍在 609 单独禁 AskUserQuestion)。
// AskUserQuestion(交互提问):peerreview 全程 server-side / 无人值守,没有用户能作答 —— 一律禁,
// 否则模型发问会导致本轮无 JSON 输出、审稿降级/失败(见 docs/research/ask-mode-2026-07)。
// Bash 三件套(2026-07 文件上传调研):审稿只读,prompt 本就严禁 Bash;此前 denylist 漏掉它导致
// 「spec 注释说 peerreview 无 Bash、事实上却可用」的漂移,现对齐设计意图(附件 xlsx/pptx 走 ReadDocument)。
// 🔴 2026-08-08 加 StatRun/StatReport:builtin 走 deny-list ⇒ 新增 builtin 默认被所有老 feature 继承。
// peerreview 是**无人值守**的 server-side 会话,继承一个能跑统计引擎、能写 analysis/ 保留区的工具面
// 完全没有理由(backend permissionAllowed 对二者无条件放行)。
var scoringSessionDeny = []string{"Skill", "Agent", "Task", "AskUserQuestion", "Bash", "BashOutput", "KillShell", "StatRun", "StatReport"}

// reviewerAllowedMcpTools —— peerreview 会话对 minicod MCP 的**正向白名单**(去 mcp__minicod__ 前缀原始名)。
// 审稿只读地做「新颖性 / 先行工作 / 可复现文献」核查,不做泛检索。收敛 minicod 0.4.1 的 76 工具到论文
// 解引用 + 近邻 + 片段接地一套,避免评分/方法论轮每次灌满 tools[](见 minicod 对齐审计 #2、#15、#28)。
var reviewerAllowedMcpTools = []string{
	"search_papers", "get_paper", "get_paper_by_doi", "match_paper",
	"get_paper_citations", "get_paper_references", "get_related_works", "get_papers_batch",
	"search_authors", "get_author_papers",
	"search_snippets", "recommend_paper", "recommend_from_pool",
}

// chatWithRetry 发一轮 server-side chat 并用 validate 校验输出; 不通过则带「只输出合法 JSON」
// 强约束提示重发, 最多 maxRetry 次。**每次尝试前 broker.Begin 重置该 slot** —— 否则坏输出与
// 重试输出会在 stream buffer 里拼接, 前端拿到脏文本。
// 返回: 最后一次 reply、是否最终通过校验、agent 通信错误 (校验失败不算 err, 交调用方软降级)。
// 返回 (最终回复, 最后一轮 usage, 是否通过校验, error)。usage 供调用方写进 report 的
// agent_tokens_* 列 (展示用); 统一 token 账本由 ServerSideChatStreaming 内部按轮自动落,
// 与这里无关。usage 可能为 nil (上游没吐 token)。
func (s *Service) chatWithRetry(
	ctx context.Context,
	sessionID string,
	submissionID uint64,
	slot string,
	prompt, model string,
	validate func(string) bool,
	maxRetry int,
) (string, *agentbridge.ChatUsage, bool, error) {
	const retryHint = "\n\n⚠️ 上一条回复无法解析为合法 JSON。请【只输出】符合上面要求的那个 JSON 对象本身, " +
		"从 { 开始到 } 结束, 不要任何解释、前后缀或 markdown 代码围栏。"
	cur := prompt
	var lastReply string
	// 跨 attempt **累计** usage:① 供调用方写 report 的 agent_tokens_*(修「重试轮显示欠计」),
	// ② 供 runReviewBackground 的单场 token 兜底按真实累计(含重试)判上限。统一 token 账本仍由
	// ServerSideChatStreaming 内部按轮独立落库,与此展示累计无关(不会双计)。
	var total agentbridge.ChatUsage
	var haveUsage bool
	acc := func() *agentbridge.ChatUsage {
		if haveUsage {
			return &total
		}
		return nil
	}
	for attempt := 0; ; attempt++ {
		s.broker.Begin(submissionID, slot)
		reply, usage, err := s.feature.ServerSideChatStreaming(ctx, sessionID, cur,
			func(delta string) { s.broker.Append(submissionID, slot, delta) },
			func(note string) { s.broker.Status(submissionID, slot, note) },
			model)
		if err != nil {
			return "", nil, false, err
		}
		lastReply = reply
		if usage != nil {
			total.InputTokens += usage.InputTokens
			total.OutputTokens += usage.OutputTokens
			total.CacheReadTokens += usage.CacheReadTokens
			total.CacheCreationTokens += usage.CacheCreationTokens
			haveUsage = true
		}
		if validate(reply) {
			return reply, acc(), true, nil
		}
		if attempt >= maxRetry {
			return lastReply, acc(), false, nil
		}
		s.broker.Status(submissionID, slot, "输出格式异常, 正在重新生成…")
		cur = prompt + retryHint
	}
}

// usageTotal —— 一轮(含重试累计)的四类 token 之和(raw 口径),给单场 token 兜底累加。
func usageTotal(u *agentbridge.ChatUsage) int64 {
	if u == nil {
		return 0
	}
	return int64(u.InputTokens + u.OutputTokens + u.CacheReadTokens + u.CacheCreationTokens)
}

// reviewTokenCap —— 单场审稿(方法论 + 3 审稿人累计)token 的**失控上限**(评审 top#1 成本兜底)。
// 每轮已由执行器 MAX_TURN_TOKENS=5M 单独兜底;此处再兜「整场累计」,主要挡 JSON 重试叠加把一场
// 审稿推到几十 M 的失控路径。**刻意设很高**(默认 30M ≫ 正常一场 5-10M),只在真失控时才触发,
// 绝不影响正常审稿质量;可经 env PEERREVIEW_REVIEW_TOKEN_CAP 调。0 = 关闭。触发时优雅降级:
// 跳过剩余审稿人(出降级占位报告)、仍照常出主审裁决(chief 单独 5M 兜底),用户拿到一份结果而非失败。
func (s *Service) reviewTokenCap() int64 {
	if v := strings.TrimSpace(os.Getenv("PEERREVIEW_REVIEW_TOKEN_CAP")); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n >= 0 {
			return n
		}
	}
	return 30_000_000
}

// skipRemainingReviewers —— 单场 token 超上限时,给尚未评审的审稿人各落一份降级占位报告
// (content_md 说明 + 结构化字段 NULL,前端降级 markdown 展示),并收尾其 SSE。保证 4 份报告齐全
// (前端「等 4 份」轮询不会永转),chief 据已有意见 + 稿件本身裁决。
func (s *Service) skipRemainingReviewers(submissionID uint64, roles []string) {
	const note = "> ⚠️ 本次审稿的资源已达上限,此位审稿人未及给出完整意见。主审将据其余审稿意见与稿件本身作出裁决。"
	for _, role := range roles {
		slot := ReviewerSlot(role)
		s.broker.Begin(submissionID, slot)
		s.broker.Append(submissionID, slot, note)
		rep := s.buildReportFromReviewer(submissionID, role, nil, false, note, nil)
		if err := s.repo.UpsertReport(rep); err != nil {
			slog.Warn("peerreview skip-reviewer placeholder save failed",
				"submission_id", submissionID, "role", role, "err", err)
		} else {
			s.notifyReportReady(submissionID, role)
		}
		s.broker.Done(submissionID, slot)
	}
}

// applyAgentTokens 把一轮 server-side chat 的 token 写进 report 的 agent_tokens_* 列
// (展示/审计用)。usage==nil (上游没吐) 时留 NULL。统一账本另有 ServerSideChatStreaming
// 内部按轮记录, 与此处独立。
func applyAgentTokens(rep *Report, usage *agentbridge.ChatUsage) {
	if usage == nil {
		return
	}
	rep.AgentTokensIn = sql.NullInt32{Int32: int32(usage.InputTokens), Valid: true}
	rep.AgentTokensOut = sql.NullInt32{Int32: int32(usage.OutputTokens), Valid: true}
}

// buildReportFromReviewer 把 ReviewerOutput 编进 Report 结构化字段。
// 若 JSON 解析失败 (ok=false), 落原文到 content_md, 结构化字段全 NULL,
// 前端读到 NULL 自动降级到原 markdown 展示。
//
// 审稿人-as-skills 后新报告不再写 reviewer_skill_id(留 NULL)—— 它历史上指 feature_prompts.id,
// 现在审稿人来自 skill 文件, 真实身份(若要审计)走另加的 reviewer_slug/name 列(后续迁移)。
// 老报告的 reviewer_skill_id 仍由 handler 走 promptregistry.GetByID 渲染(legacy 回退)。
func (s *Service) buildReportFromReviewer(submissionID uint64, role string, out *ReviewerOutput, ok bool, raw string, usage *agentbridge.ChatUsage) *Report {
	rep := &Report{
		SubmissionID: submissionID,
		Role:         role,
		ContentMd:    raw, // 永远保留原文兜底
	}
	applyAgentTokens(rep, usage) // 写 agent_tokens_*; 即便 JSON 解析失败 token 也已消耗
	if !ok || out == nil {
		return rep
	}
	if out.Score > 0 {
		rep.Score.Int32 = int32(out.Score)
		rep.Score.Valid = true
	}
	if out.Recommendation != "" {
		rep.Recommendation.String = out.Recommendation
		rep.Recommendation.Valid = true
		rep.Decision.String = out.Recommendation // 兼容旧字段
		rep.Decision.Valid = true
	}
	if out.Expertise != "" {
		rep.Expertise.String = out.Expertise
		rep.Expertise.Valid = true
	}
	if len(out.Dimensions) > 0 {
		b, _ := json.Marshal(out.Dimensions)
		rep.DimensionsJSON = b
	}
	if len(out.LineComments) > 0 {
		b, _ := json.Marshal(out.LineComments)
		rep.LineCommentsJSON = b
	}
	if len(out.MacroComments) > 0 {
		b, _ := json.Marshal(out.MacroComments)
		rep.MacroCommentsJSON = b
	}
	if out.FinalSummary != "" {
		rep.FinalSummaryMd.String = out.FinalSummary
		rep.FinalSummaryMd.Valid = true
	}
	return rep
}

func (s *Service) buildReportFromChief(submissionID uint64, out *ChiefOutput, ok bool, raw string, usage *agentbridge.ChatUsage) *Report {
	rep := &Report{
		SubmissionID: submissionID,
		Role:         "chief",
		ContentMd:    raw,
	}
	applyAgentTokens(rep, usage)
	if !ok || out == nil {
		return rep
	}
	if out.Score > 0 {
		rep.Score.Int32 = int32(out.Score)
		rep.Score.Valid = true
	}
	if out.Recommendation != "" {
		rep.Recommendation.String = out.Recommendation
		rep.Recommendation.Valid = true
		rep.Decision.String = out.Recommendation
		rep.Decision.Valid = true
	}
	if out.RulingSummary != "" {
		rep.RulingSummaryMd.String = out.RulingSummary
		rep.RulingSummaryMd.Valid = true
	}
	if out.RulingParagraph != "" {
		rep.RulingParagraphMd.String = out.RulingParagraph
		rep.RulingParagraphMd.Valid = true
	}
	if len(out.ReviewerResponses) > 0 {
		b, _ := json.Marshal(out.ReviewerResponses)
		rep.ReviewerResponsesJSON = b
	}
	if len(out.MustFix) > 0 {
		b, _ := json.Marshal(out.MustFix)
		rep.MustFixJSON = b
	}
	if len(out.Suggestions) > 0 {
		b, _ := json.Marshal(out.Suggestions)
		rep.SuggestionsJSON = b
	}
	if d := int(out.DeadlineDays); d > 0 {
		rep.DeadlineDays.Int32 = int32(d)
		rep.DeadlineDays.Valid = true
	}
	if out.SummaryForAuthor != "" {
		rep.SummaryForAuthor.String = out.SummaryForAuthor
		rep.SummaryForAuthor.Valid = true
	}
	return rep
}

func (s *Service) markFailedAndLog(submissionID uint64, reason string) {
	_ = s.repo.MarkFailed(submissionID, reason)
	_ = s.setComputeStateNotify(submissionID, StateFailed, reason)
}

// failUser 审稿失败统一收口: 原始错误(agent/存储/JSON 解析等内部细节)只进日志,
// 给用户的两条路 —— broker 实时 SSE + DB compute_error(FailureBanner 回看)—— 都只回友好中文。
// 避免把 "agent chat role=alpha reviewer=...: <raw>" 这类内部串漏给用户。
func (s *Service) failUser(submissionID uint64, slot, friendly string, raw error) {
	slog.Error("peerreview failed", "submission_id", submissionID, "slot", slot, "err", raw)
	// 先写失败库再发 error 帧(顺序铁律,同 chief 收尾):error 帧触发的 refetch 必须能读到 failed。
	s.markFailedAndLog(submissionID, friendly)
	s.broker.Fail(submissionID, slot, friendly)
}


// ─── Report 查询 ─────────────────────────────────────────────────────────

func (s *Service) ListReports(userID, submissionID uint64) ([]Report, error) {
	if _, err := s.repo.GetByID(submissionID, userID); err != nil {
		return nil, err
	}
	return s.repo.ListReports(submissionID)
}

func (s *Service) GetReportByRole(userID, submissionID uint64, role string) (*Report, error) {
	if _, err := s.repo.GetByID(submissionID, userID); err != nil {
		return nil, err
	}
	return s.repo.GetReportByRole(submissionID, role)
}

// ─── 内部 helpers ────────────────────────────────────────────────────────

// journalMetaLine 把前端选刊时存进 journal_meta_json 的定位字段格式化成一行,
// 注入审稿 prompt。字段名与前端 JournalTarget 一致 (jcrImpactFactor / jcrQuartile /
// fqbQuartile / ccfRank / publisher)。无 meta 或解析失败返回空串 (调用方跳过)。
func journalMetaLine(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var m struct {
		JCRImpactFactor float64 `json:"jcrImpactFactor"`
		JCRQuartile     string  `json:"jcrQuartile"`
		FqbQuartile     string  `json:"fqbQuartile"`
		CCFRank         string  `json:"ccfRank"`
		Publisher       string  `json:"publisher"`
	}
	if err := json.Unmarshal(raw, &m); err != nil {
		return ""
	}
	var parts []string
	if m.JCRImpactFactor > 0 {
		parts = append(parts, fmt.Sprintf("影响因子 IF %.1f", m.JCRImpactFactor))
	}
	if m.FqbQuartile != "" {
		parts = append(parts, "中科院 "+m.FqbQuartile+" 区")
	}
	if m.JCRQuartile != "" {
		parts = append(parts, "JCR "+m.JCRQuartile)
	}
	if m.CCFRank != "" {
		parts = append(parts, "CCF "+m.CCFRank)
	}
	if m.Publisher != "" {
		parts = append(parts, "出版商 "+m.Publisher)
	}
	if len(parts) == 0 {
		return ""
	}
	return "期刊定位:" + strings.Join(parts, " · ")
}

// manuscriptInlined=true 表示正文已作为 preamble 注入共享 session 上文(审稿路径) → 用 buildInlinedAssetsBlock
// (勿重读正文)并去掉"可 Read 正文"的邀请;false 走旧路径(指示各自 ReadDocument 全文,如抽取失败时的回退)。
// manuscriptTruncated=true 表示注入的正文是前段抽取(超长稿件被钳)——评审措辞须限定覆盖范围。
func buildCommonContext(sub *Submission, files *sessionAssets, methodology string, manuscriptInlined bool, manuscriptTruncated bool) string {
	var b strings.Builder
	// 时间锚点 + 引用核查行为准则(2026-07):模型上下文若无当前日期,只能按训练截止(≈2025 初)
	// 推断"今年",曾把 2026 年合法引用判成「年份不可能,2026 年尚未到来」。光给日期不够(训练年代
	// 锚定仍在),必须配套「存在性只能检索裁决」的行为准则;同时保留对真·未来年份的造假警惕。
	// 按项目铁律直接 time.Now()(backend 容器时区 Asia/Shanghai),只到天粒度。
	b.WriteString("【当前日期】今天是 " + time.Now().Format("2006年01月02日") + "。这是权威日期,核查参考文献年份时以此为准:\n")
	b.WriteString("- 年份 ≤ 当前年份+1 的引用(含 in press / online first / 预印本)属正常,不构成造假信号;\n")
	b.WriteString("- 引用年份晚于你的训练知识截止 ≠ 该文献不存在;文献存在性只能用 mcp__minicod__get_paper / search_papers 检索裁决;\n")
	b.WriteString("- 检索不到时结论写「无法核实」,而非「伪造 / 不存在」;\n")
	b.WriteString("- 年份超过当前年份+1(即晚两年及以上)仍是可疑信号,应当指出。\n\n")
	b.WriteString("【稿件元信息】\n")
	if sub.Title.Valid {
		b.WriteString("标题:" + sub.Title.String + "\n")
	}
	if sub.Mode == "journal" && sub.JournalName.Valid {
		b.WriteString("目标期刊:" + sub.JournalName.String + "\n")
		// 把用户选定期刊的分区 / IF / CCF 等定位直接喂给审稿人 —— 省去 agent 再 get_journal 查一次,
		// 也让"返修/录用 门槛"贴合期刊档次 (顶刊更严)。仅真实期刊有 meta;自定义期刊 (journal_id<=0) 没有。
		if line := journalMetaLine(sub.JournalMetaJSON); line != "" {
			b.WriteString(line + "\n")
		}
	}
	if sub.Mode == "thesis" && sub.SchoolName.Valid {
		fmt.Fprintf(&b, "目标院校:%s / %s / %s\n",
			sub.SchoolName.String,
			degreeLabel(sub.DegreeType.String),
			sub.DisciplineField.String)
		// 指导老师也是用户手填的, 一并喂给审稿人 (毕业审稿要贴合导师/学位点的口径)。
		if sub.AdvisorName.Valid && sub.AdvisorName.String != "" {
			b.WriteString("指导老师:" + sub.AdvisorName.String + "\n")
		}
	}
	if sub.LetterBody.Valid && sub.LetterBody.String != "" {
		b.WriteString("\n【作者致 reviewer 信件】\n")
		b.WriteString(sub.LetterBody.String)
		b.WriteString("\n")
	}
	if m := strings.TrimSpace(methodology); m != "" {
		b.WriteString("\n【本文审稿方法论 — 方法论编排阶段基于论文 + 审稿 skill 生成, 供你参考】\n")
		b.WriteString(m)
		b.WriteString("\n")
	}
	b.WriteString("\n")
	if manuscriptInlined {
		b.WriteString(buildInlinedAssetsBlock(files))
	} else {
		b.WriteString(buildAssetsBlock(files))
	}

	// 提示审稿人有学术检索工具可用 — 用来核查引用 / 找同类对比文献 / 确认期刊定位。
	// 比写在每个 skill system_prompt 里更省: 改一次全员生效, 也不会让 prompt 重复。
	//
	// 强约束: 工具内部 enum (semantic/openalex/pubmed) 和原始品牌名 (Semantic Scholar /
	// OpenAlex / PubMed) 都是实现细节, 任何形式向用户暴露都视为越权。
	b.WriteString(`

【可用工具:学术检索】
你可以在审稿过程中调用以下工具来核查与稿件相关的事实, 让你的意见更有说服力:
- mcp__minicod__search_papers       — 用稿件关键词 / 作者 / 主题反查同类工作 (限 limit ≤ 5)
- mcp__minicod__get_paper           — 核对参考文献的真实信息 (年份 / 期刊 / 摘要)
- mcp__minicod__get_paper_citations — 看这篇被谁引用过, 判断方法学是否被领域接受
- mcp__minicod__search_authors      — 验证作者团队的领域权威度
- mcp__minicod__get_journal         — 看目标期刊近期发表过什么、IF/分区

【数据源 — 对外只用三个品牌名, 绝对不暴露工具 enum】
你能访问三个学术数据源, 对外名称分别是:
- **Graph**     — 引文图谱最完整的源
- **Discovery** — 全量学术发现, metadata 最丰富
- **Medicine**  — 生物医学和生命科学专属

调用工具时 source 参数从工具 schema 里看可选 enum 值取对 (内部技术细节, 你认得就用)。
**在你的 thinking、回复正文、JSON 输出、报告引文标注里, 必须只用 Graph / Discovery / Medicine 三个名字**。
绝对禁止任何形式向用户暴露 source 工具 enum 值或原始数据库名;
违反 = 审稿报告作废 + 用户投诉。

【使用规则】
- 仅在确实有助于你下判断时调用; 不要为调而调
- 调用结果只用于支撑你的意见, 不要把检索过程写进最终 JSON 输出
- 单次 limit ≤ 5, 空结果别死磕 (最多重试 1 次), 没数据就跳过
`)
	if manuscriptInlined && manuscriptTruncated {
		b.WriteString("- 论文正文的**前段抽取**已在会话上文给出(原文超长,后段未包含),**直接据此评审**,不要再用 Read / ReadDocument 重读正文;涉及全文覆盖性的判断须限定为「已读部分」,报告如实注明未覆盖全文。补充材料(如有,见上)仅确有必要时才读。严禁 Write / Edit / Bash / WebSearch 等工具。\n")
	} else if manuscriptInlined {
		b.WriteString("- 论文正文已在会话上文完整给出,**直接据此评审**,不要再用 Read / ReadDocument 重读正文;补充材料(如有,见上)仅确有必要时才读。严禁 Write / Edit / Bash / WebSearch 等工具。\n")
	} else {
		b.WriteString("- 你可以用 Read 工具读取上面列出的稿件文件 (用 ReadDocument 读 PDF/docx 等文档类, Read 读纯文本; 它们就在你的工作目录里);\n  但严禁 Write / Edit 这些文件, 也严禁 Bash / WebSearch 等本地或外网工具\n")
	}
	return b.String()
}

// buildReviewerPrompt — 审稿人-as-skills 版本: persona 身份/视角来自被选审稿人 SKILL.md 的
// SCORING_PERSONA 段(choice.Persona), 所有审稿人共用的 JSON 输出 schema + 规则来自
// reviewerJSONSchemaSpec const(persona_schema.go), 拼上 commonContext(稿件正文 + 元信息)。
// role 仅用于头部标明"审稿人 A/B/C"(前端匿名), 真实审稿人身份(name/slug)只内部记录。
func buildReviewerPrompt(choice ReviewerChoice, commonContext, role string) string {
	roleLabel := map[string]string{"alpha": "审稿人 A", "beta": "审稿人 B", "gamma": "审稿人 C"}[role]
	if roleLabel == "" {
		roleLabel = "审稿人"
	}
	var b strings.Builder
	b.WriteString("【审稿身份】" + roleLabel + "\n\n")
	b.WriteString(choice.Persona)
	b.WriteString("\n\n")
	// 多技能组合:在 base 人格之后、输出 schema 之前,拼上叠加的审查视角(lens 已按 slug 升序,确定性)。
	// lens 是**附加清单**(只加"额外查什么"),不含身份/输出格式 —— schema 仍是唯一输出契约(放最后),
	// 故不会与之竞争、不冲碎 JSON。顺序 = 身份 → 附加视角 → 输出契约 → 稿件数据。
	if len(choice.Lenses) > 0 {
		b.WriteString("【附加审查视角(在你原有评审基础上,额外重点核查以下方面)】\n")
		for _, l := range choice.Lenses {
			b.WriteString(l.Body)
			b.WriteString("\n\n")
		}
	}
	b.WriteString(reviewerJSONSchemaSpec)
	b.WriteString("\n\n")
	b.WriteString(commonContext)
	b.WriteString("\n\n请基于以上稿件给出你的审稿意见, 严格按 JSON schema 输出。" +
		"⚠️ 字符串值内部如需引用某个词/短语, 一律用中文引号「」或单引号, **绝不要**在 JSON 字符串里出现未转义的半角双引号 \"。")
	return b.String()
}

// buildChiefPrompt — 主审 prompt: 人格固定(chiefPersona const)+ schema(chiefJSONSchemaSpec const),
// 注入三位 reviewer 的 JSON 摘要(而非依赖 session memory), 让主审逐位回应。摘要只取关键字段。
func buildChiefPrompt(commonContext string, reviewerOutputs map[string]*ReviewerOutput) string {
	var b strings.Builder
	b.WriteString("【审稿身份】主审编辑\n\n")
	b.WriteString(chiefPersona)
	b.WriteString("\n\n")
	b.WriteString(chiefJSONSchemaSpec)
	b.WriteString("\n\n")
	b.WriteString(commonContext)

	b.WriteString("\n\n【三位审稿人的意见摘要】\n")
	for _, role := range []string{"alpha", "beta", "gamma"} {
		label := map[string]string{"alpha": "审稿人 A", "beta": "审稿人 B", "gamma": "审稿人 C"}[role]
		out, ok := reviewerOutputs[role]
		if !ok || out == nil {
			fmt.Fprintf(&b, "\n- %s: (该审稿人 JSON 解析失败, 请仅根据稿件本身判断)\n", label)
			continue
		}
		summary := map[string]any{
			"score":          out.Score,
			"recommendation": out.Recommendation,
			"expertise":      out.Expertise,
			"dimensions":     out.Dimensions,
			"final_summary":  out.FinalSummary,
			"must_fix_count": int(out.MustFixCount),
		}
		bb, _ := json.MarshalIndent(summary, "", "  ")
		fmt.Fprintf(&b, "\n%s:\n%s\n", label, string(bb))
	}
	b.WriteString("\n请综合三位意见与你对稿件的独立复审, 严格按 JSON schema 输出主审决议。" +
		"⚠️ 字符串值内部如需引用某个词/短语, 一律用中文引号「」或单引号, **绝不要**在 JSON 字符串里出现未转义的半角双引号 \"。")
	return b.String()
}

// parseReviewerJSON / parseChiefJSON — 抽 agent 回复里第一个 {} 块解析。
func parseReviewerJSON(reply string) (*ReviewerOutput, bool) {
	raw := extractFirstJSONObject(reply)
	if raw == nil {
		return nil, false
	}
	var out ReviewerOutput
	if err := json.Unmarshal(raw, &out); err == nil {
		return &out, true
	} else if err2 := json.Unmarshal(repairUnescapedInnerQuotes(raw), &out); err2 == nil {
		// agent 常在 JSON 字符串值里写未转义的内嵌半角引号 (如中文 "xxx"), 导致 strict 解析失败。
		// 修复内嵌引号后重试; 成功就拿到结构化字段, 避免前端降级成原始 JSON。
		return &out, true
	} else {
		slog.Warn("peerreview: reviewer JSON unmarshal failed (even after quote repair)",
			"err", err.Error(), "raw_len", len(raw))
		return nil, false
	}
}

func parseChiefJSON(reply string) (*ChiefOutput, bool) {
	raw := extractFirstJSONObject(reply)
	if raw == nil {
		return nil, false
	}
	var out ChiefOutput
	if err := json.Unmarshal(raw, &out); err == nil {
		return &out, true
	} else if err2 := json.Unmarshal(repairUnescapedInnerQuotes(raw), &out); err2 == nil {
		return &out, true
	} else {
		slog.Warn("peerreview: chief JSON unmarshal failed (even after quote repair)",
			"err", err.Error(), "raw_len", len(raw))
		return nil, false
	}
}

// repairUnescapedInnerQuotes 修一类常见畸形 JSON: agent 在字符串值内部写了**未转义的半角双引号**
// (例如中文正文里的 "概念"), 让 strict json.Unmarshal 在该处提前认为字符串闭合而报错。
//
// 状态机: 处于字符串内时遇到裸 ", 向后跳过空白看下一个非空白字节 —— 若是 JSON 结构终止符
// (, } ] :) 或已到末尾, 视为字符串**真正闭合**; 否则视为**内嵌引号** → 改写成 \"。
// best-effort: 极少数 `"内嵌":` 形态(内嵌引号紧跟冒号)会被误判为闭合, 但对中文正文足够;
// 修不好时调用方仍会退回 ok=false, 不会比原来更糟。
func repairUnescapedInnerQuotes(b []byte) []byte {
	out := make([]byte, 0, len(b)+16)
	inString := false
	for i := 0; i < len(b); i++ {
		c := b[i]
		if !inString {
			out = append(out, c)
			if c == '"' {
				inString = true
			}
			continue
		}
		// 字符串内部
		if c == '\\' {
			out = append(out, c)
			if i+1 < len(b) {
				out = append(out, b[i+1])
				i++
			}
			continue
		}
		if c == '"' {
			j := i + 1
			for j < len(b) && (b[j] == ' ' || b[j] == '\t' || b[j] == '\n' || b[j] == '\r') {
				j++
			}
			if j >= len(b) || b[j] == ',' || b[j] == '}' || b[j] == ']' || b[j] == ':' {
				out = append(out, c) // 真正闭合
				inString = false
			} else {
				out = append(out, '\\', '"') // 内嵌引号 → 转义
			}
			continue
		}
		out = append(out, c)
	}
	return out
}

// extractFirstJSONObject 从 agent 回复里挖出第一个完整的 {} 块。
// agent 偶尔会在 JSON 前后塞 ```json``` 围栏 / "Here is" 前缀,
// 我们对围栏宽容, 只要花括号深度归零就 cut。
// 不解析转义字符串 — 假设元数据 JSON 里没有未转义的 } 字符。
func extractFirstJSONObject(s string) []byte {
	start := strings.Index(s, "{")
	if start < 0 {
		return nil
	}
	depth := 0
	inString := false
	escape := false
	for i := start; i < len(s); i++ {
		c := s[i]
		if escape {
			escape = false
			continue
		}
		if inString {
			if c == '\\' {
				escape = true
			} else if c == '"' {
				inString = false
			}
			continue
		}
		switch c {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return []byte(s[start : i+1])
			}
		}
	}
	return nil
}

func degreeLabel(d string) string {
	switch d {
	case "phd":
		return "博士"
	case "master":
		return "硕士"
	case "bachelor":
		return "本科"
	}
	return d
}
