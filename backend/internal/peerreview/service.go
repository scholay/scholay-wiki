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
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/agentconfig"
	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/llmusage"
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

	// agentCfg 读 agent 模型配置: meta/letter 用快模型 (haiku_model), review 用主模型 (main_model)。
	// 可空 — 空 / 配置缺失时不切模型, 全用会话默认 (主模型), 功能不受影响只是没成本优化。
	agentCfg *agentconfig.Service

	// vip 会员每日额度。可空(不限)。**在 Submit 内、确认要真正跑一轮审稿时**才扣,
	// 不放 handler —— 否则非法/非自己的/重复点击/无稿件 的 Submit 会白白烧掉额度(审稿 free=1/天)。
	vip *vip.Service
}

// SetVIPChecker 注入会员限额服务(每次真正投递审稿扣 1)。允许 nil 禁用。
func (s *Service) SetVIPChecker(v *vip.Service) { s.vip = v }

// NewService — bootstrap 阶段构造。
func NewService(
	repo *Repository,
	promptSvc *promptregistry.Service,
	feature *agentbridge.FeatureBridge,
	agentCfg *agentconfig.Service,
) *Service {
	return &Service{
		repo:      repo,
		promptSvc: promptSvc,
		feature:   feature,
		bucket:    storage.PeerReviewAssetBucket,
		broker:    NewStreamBroker(),
		agentCfg:  agentCfg,
	}
}

// fastModel — meta/letter 用的快模型 (haiku_model)。空 = 不切, 用会话默认 (主模型)。
func (s *Service) fastModel() string {
	if s.agentCfg == nil {
		return ""
	}
	cfg, err := s.agentCfg.GetConfig()
	if err != nil || cfg == nil {
		return ""
	}
	return cfg.HaikuModel
}

// mainModel — review 用的主模型 (main_model)。review 与 meta 共用会话, meta 把会话切到了
// haiku, 所以 review 必须**显式切回** main; 空则退化为不切 (可能残留 haiku, 仅在 main 未配置时)。
func (s *Service) mainModel() string {
	if s.agentCfg == nil {
		return ""
	}
	cfg, err := s.agentCfg.GetConfig()
	if err != nil || cfg == nil {
		return ""
	}
	return cfg.MainModel
}

// Broker 暴露给 handler — 单例 broker 由 service 持有,SSE 端点订阅它。
func (s *Service) Broker() *StreamBroker { return s.broker }

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
	sub, err := s.repo.CreateDraft(userID, mode)
	if err != nil {
		return nil, err
	}
	// 立即给 submission 绑一个 agent session, 整个 wizard + 4 轮审稿全程复用。
	// 失败不阻塞 draft 创建 (前端拿到 submission 后还能上传文件等),
	// 下次 advance 调用时会按需 lazy-create。
	if sess, err := s.feature.AgentClient().CreateSession(ctx, &agent.CreateSessionOptions{DisallowedTools: scoringSessionDeny}); err == nil {
		_ = s.repo.SetAgentSession(sub.ID, sess.SessionID)
		sub.AgentSessionID.String = sess.SessionID
		sub.AgentSessionID.Valid = true
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
	sess, err := s.feature.AgentClient().CreateSession(ctx, &agent.CreateSessionOptions{DisallowedTools: scoringSessionDeny})
	if err != nil {
		return "", fmt.Errorf("create agent session: %w", err)
	}
	if err := s.repo.SetAgentSession(sub.ID, sess.SessionID); err != nil {
		return "", err
	}
	sub.AgentSessionID.String = sess.SessionID
	sub.AgentSessionID.Valid = true
	return sess.SessionID, nil
}

// resetAgentSession DELETE + CREATE — 在 assets_revision 变化时调用,
// 让 agent 不带着旧 manuscript 干扰。同时清空 step_cache 让下次 advance
// fingerprint 自然 miss。
func (s *Service) resetAgentSession(ctx context.Context, sub *Submission) (string, error) {
	if sub.AgentSessionID.Valid && sub.AgentSessionID.String != "" {
		_ = s.feature.AgentClient().DeleteSession(ctx, sub.AgentSessionID.String)
	}
	sess, err := s.feature.AgentClient().CreateSession(ctx, &agent.CreateSessionOptions{DisallowedTools: scoringSessionDeny})
	if err != nil {
		return "", fmt.Errorf("recreate agent session: %w", err)
	}
	if err := s.repo.SetAgentSession(sub.ID, sess.SessionID); err != nil {
		return "", err
	}
	_ = s.repo.DeleteAllStepCache(sub.ID)
	sub.AgentSessionID.String = sess.SessionID
	sub.AgentSessionID.Valid = true
	return sess.SessionID, nil
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
// 返回落盘路径供 prompt 引用 (方案 B: 让大模型用 Read 原生分析, backend 不抽文本)。
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
		body, rerr := io.ReadAll(rc)
		_ = rc.Close()
		if rerr != nil {
			return nil, fmt.Errorf("read object %s: %w", a.ObjectKey, rerr)
		}
		pushed, perr := client.PushSessionFile(ctx, sessionID, a.Filename, body)
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
	b.WriteString("【稿件文件 — 已放在你的当前工作目录, 用 Read 工具读取它们的真实内容】\n")
	b.WriteString("- 论文正文: " + files.manuscriptPath + "\n")
	for _, att := range files.attachments {
		line := "- 补充材料: " + att.path
		if att.category != "" {
			line += " (" + att.category + ")"
		}
		b.WriteString(line + "\n")
	}
	b.WriteString("\n请先用 Read 工具读取论文正文全文")
	if len(files.attachments) > 0 {
		b.WriteString(" (需要时一并读取补充材料)")
	}
	b.WriteString(", 不要凭文件名臆测内容。\n")
	return b.String()
}

// buildMethodologyPrompt 方法论 + 审稿人选择会话的提示 —— Skill-开 的临时会话里跑。
// agent 读论文 + invoke reviewer-roster 编排 skill, 选 3 位审稿人, 末尾输出选择 JSON。
// 自由文本方法论注入后续评分轮; 选择 JSON 由后端 parseSelection 解析 → 按 slug 读各审稿人 SKILL.md。
func buildMethodologyPrompt(files *sessionAssets, menu []reviewerMenuEntry) string {
	var b strings.Builder
	b.WriteString("你是审稿流程的「方法论编排」。请先读完稿件原文, 判断这篇论文的领域 / 类型 / 方法学。\n\n")
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
	b.WriteString("\n【输出要求】\n")
	b.WriteString("先用简洁中文条列你的方法论(不要 JSON):1) 论文领域/类型/方法学判断;2) 为何选这 3 位审稿人;3) 三位应分别重点关注什么。\n")
	b.WriteString("**然后在回复的最末尾**输出一个 ```json 代码块(本次回复的最后一个 json 块),格式严格如下:\n")
	b.WriteString("```json\n{\"reviewers\":[{\"slug\":\"rv-xxx\",\"why_chosen\":\"一句理由\"},{\"slug\":\"rv-yyy\",\"why_chosen\":\"...\"},{\"slug\":\"rv-zzz\",\"why_chosen\":\"...\"}]}\n```\n")
	b.WriteString("约束:slug **必须照抄上面【可选审稿人花名册】里的某一项**(原样复制, 不要改写/翻译/自创);恰好 3 个互不相同;不要选 chief;不要把审稿人画像正文塞进 JSON。\n")
	return b.String()
}

// runMethodologyPhase 跑方法论 + 审稿人选择会话: 临时新建一个 Skill-开 的会话(nil opts → 全局默认含 Skill),
// 让 agent 读论文 + invoke reviewer-roster 选 3 位审稿人, 产出自由文本方法论 + 末尾选择 JSON。
// 返回 (注入评分轮的方法论自由文本, 恰好 3 位 ReviewerChoice)。任何失败都降级:
// 方法论返回空串、审稿人退化到内置三人格 —— 评分照常进行, 永不 hard-fail。会话用完即删。
func (s *Service) runMethodologyPhase(ctx context.Context, submissionID uint64, files *sessionAssets) (string, []ReviewerChoice) {
	// 把这一轮的 agent 输出推到 SlotMethodology, 让前端在"通读全文·制定审稿标准"阶段看到实时进度,
	// 而不是干等一个空转圈。Begin/Done 包住整段: 任何提前 return(降级)也会让前端的 SSE 收尾,
	// 不会卡在 pending。defer 顺序 LIFO → 先 DeleteSession 再 broker.Done, 符合预期。
	s.broker.Begin(submissionID, SlotMethodology)
	defer s.broker.Done(submissionID, SlotMethodology)

	// AddDirs: 只给方法论会话加载审稿人 skill(reviewer-roster + rv-*, 经 --add-dir);
	// Skill 工具保持开(不传 DisallowedTools)→ agent 可 invoke。claw 等其它会话不传 → 看不到这些 skill。
	created, err := s.feature.AgentClient().CreateSession(ctx, &agent.CreateSessionOptions{
		AddDirs: []string{reviewerSkillAddDir()},
	})
	if err != nil {
		slog.Warn("peerreview methodology session create failed; builtin reviewers",
			"submission_id", submissionID, "err", err)
		return "", builtinReviewerChoices()
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
		return "", builtinReviewerChoices()
	}
	reply, _, cerr := s.feature.Bridge().ServerSideChatStreaming(ctx, methSessID,
		buildMethodologyPrompt(mfiles, availableReviewers()),
		func(delta string) { s.broker.Append(submissionID, SlotMethodology, delta) },
		func(note string) { s.broker.Status(submissionID, SlotMethodology, note) },
		s.mainModel())
	if cerr != nil {
		slog.Warn("peerreview methodology round failed; builtin reviewers",
			"submission_id", submissionID, "err", cerr)
		return "", builtinReviewerChoices()
	}
	// 选择轮成功: 自由文本方法论(去掉末尾选择 JSON 块)注入评分轮; 选择 JSON → 3 位审稿人(失败自退化)。
	choices := s.resolveReviewerChoices(submissionID, reply)
	return stripTrailingFencedJSON(reply), choices
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

	ext := strings.ToLower(filepath.Ext(fh.Filename))
	key := fmt.Sprintf("tmp/%d/%s%s", submissionID, uuid.New().String(), ext)

	if _, err := storage.PutObject(ctx, bucket, key, strings.NewReader(string(body)),
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
	// 由 pushAssetsToSession 推到 agent 会话 cwd, 让大模型用 Read 工具原生分析。
	// 标题 / 摘要 / 关键词等元数据统一由 agent 的 meta-extract 抽 (见 runMetaExtract)。
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
	switch fromStep {
	case 1:
		return s.advanceTo2(ctx, sub)
	case 2:
		return s.advanceTo3(ctx, sub)
	case 3:
		// Step3 → Step4: 无 agent, 直接转
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

	fingerprint := fingerprintStep2(sub.AssetsRevision)

	cache, err := s.repo.GetStepCache(sub.ID, 2)
	if err != nil {
		// 缓存查询失败别静默吞 —— 当作 miss 继续(重跑 agent)是对的, 但 DB/连接异常要可观测。
		slog.Warn("peerreview: get step2 cache failed", "submission_id", sub.ID, "err", err)
	}
	if cache != nil && cache.InputFingerprint == fingerprint {
		// Cache 命中: 直接转 step=2 (payload 已经在 submission.title/abstract/extra_meta_json,
		// 因为上次成功后 goroutine 已经回填过)。
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
	if err := s.repo.SetComputeState(sub.ID, StateComputingMeta, ""); err != nil {
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
	if step2Cache.InputFingerprint != fingerprintStep2(sub.AssetsRevision) {
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
	if err != nil {
		slog.Warn("peerreview: get step3 cache failed", "submission_id", sub.ID, "err", err)
	}
	if cache != nil && cache.InputFingerprint == fingerprint {
		// 命中: 已经写过 letter_body 到 submission, 直接转 step=3
		if err := s.repo.PatchSubmission(sub.ID, map[string]any{"step": 3}); err != nil {
			return nil, err
		}
		return s.repo.GetByID(sub.ID, sub.UserID)
	}

	// miss: 异步起草 (session 保留)
	if err := s.repo.PatchSubmission(sub.ID, map[string]any{"step": 3}); err != nil {
		return nil, err
	}
	if err := s.repo.SetComputeState(sub.ID, StateComputingLetter, ""); err != nil {
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

func (s *Service) runMetaExtract(ctx context.Context, submissionID uint64, sessionID, fingerprint string) {
	failure := func(reason string) {
		_ = s.repo.SetComputeState(submissionID, StateFailed, reason)
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

	// 方案 B: 把稿件 + 附件推到 agent 会话 cwd, 让它用 Read 读全文 (不再 backend 抽文本)。
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

	// 元数据抽取**只需论文开头** (标题/摘要/关键词/学科/类型都在首页+摘要区)。
	// 不要求通读全文 —— 全文留给后面的审稿轮 (runReviewBackground 会重读)。这样大幅减少
	// Read 进上下文的体量, meta 抽取从"读整本 PDF"提速到"读前 1-2 页"。
	prompt := fmt.Sprintf(
`请从这篇论文里抽取投稿元数据。论文文件已放在你的当前工作目录:
%s

**只需读论文开头部分** (标题/摘要/关键词/学科通常都在首页与摘要区), **不必通读全文**, 以加快速度:
- PDF: 优先用 `+"`pdftotext -l 2 \"<文件>\" -`"+` 只取前 2 页 (容器已装 poppler-utils); 不行再 Read。
- docx/其它: 用 pandoc/python 转换后取开头即可。

抽取结构化元数据, **严格 JSON 输出**(不要任何前后缀文本 / 不要 markdown 代码块):

{
  "title": "<论文完整标题, 不要带换行 / ligature artifact / 序号>",
  "abstract": "<完整摘要, 1 段, 200-400 字>",
  "keywords": ["<3-7 个关键词, 简短 1-3 词>"],
  "subjects": ["<1-3 个学科领域, 例如 '计算机科学' / 'Computational Linguistics'>"],
  "manuscriptType": "<research / review / short_communication 三选一, 不确定填 research>"
}`, files.manuscriptPath)

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

	reply, _, _, err := s.chatWithRetry(ctx, sessionID, submissionID, SlotMeta, prompt, s.fastModel(),
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
	_ = s.repo.SetComputeState(submissionID, StateIdle, "")
	s.broker.Done(submissionID, SlotMeta)
}

// runLetterDraft: agent session 里已经有 manuscript —— step1→2 的 meta-extract 已用
// Read 工具把稿件读进了会话上下文 (方案 B)。这里只发简短 prompt 告诉它 "起草 letter,
// 目标 X, 风格 Y", 不重传也不重读稿件。这是 single-session 的核心 token 节省点。
// (前置依赖: advanceTo3 的 safety check 保证 assets 没变, 会话里的稿件仍是当前版本。)
func (s *Service) runLetterDraft(ctx context.Context, submissionID uint64, sessionID, fingerprint string) {
	failure := func(reason string) {
		_ = s.repo.SetComputeState(submissionID, StateFailed, reason)
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

	reply, _, err := s.feature.Bridge().ServerSideChatStreaming(ctx, sessionID, prompt, func(delta string) {
		s.broker.Append(submissionID, SlotLetter, delta)
	}, func(note string) {
		s.broker.Status(submissionID, SlotLetter, note)
	}, s.fastModel())
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
	_ = s.repo.SetComputeState(submissionID, StateIdle, "")
	s.broker.Done(submissionID, SlotLetter)
}

// ─── fingerprint helpers ─────────────────────────────────────────────

// fingerprintStep2 — meta extraction 只依赖 manuscript 文本, 而 manuscript 跟着 assets_revision 走。
func fingerprintStep2(assetsRevision uint32) string {
	return fmt.Sprintf("a%d", assetsRevision)
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

	// 到这里才是"草稿 + 稿件齐备、确实要跑一轮审稿" —— 此刻扣会员每日额度(最贵的功能)。
	// 放在 status/manuscript 守门之后, 保证非法 id / 重复点击 / 无稿件 不会白烧额度。
	if s.vip != nil {
		if err := s.vip.CheckAndConsume(ctx, uint(userID), vip.FeaturePeerReview); err != nil {
			return nil, err // vip.ErrQuotaExceeded → handler 映射成 6010/429
		}
	}

	// 复用 submission 自己的 agent session (CreateDraft 时建的);
	// 不存在则补建一个 (不调 reset, 避免清掉 wizard 期间累积的 manuscript / letter 对话)。
	sessionID, err := s.ensureAgentSession(ctx, sub)
	if err != nil {
		return nil, fmt.Errorf("agent session: %w", err)
	}

	if err := s.repo.MarkSubmitted(id, time.Now(), sessionID); err != nil {
		return nil, err
	}
	_ = s.repo.SetComputeState(id, StateReviewing, "")

	// 异步跑 agent — 用 safego 包一层 recover,避免 panic 把主进程带崩
	safego.Go(fmt.Sprintf("peerreview-runner-%d", id), func() {
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

	// 方案 B: 把稿件 + 附件推到 agent 会话 cwd (审稿可能在 meta 之后很久才触发,
	// 此处再推一次保证 session 重建后文件仍在), 让审稿人用 Read 读原文。
	files, perr := s.pushAssetsToSession(ctx, submissionID, sessionID)
	if perr != nil {
		if errors.Is(perr, ErrManuscriptMissing) {
			s.markFailedAndLog(submissionID, "稿件未上传")
		} else {
			s.markFailedAndLog(submissionID, "推送稿件到 agent 失败: "+perr.Error())
		}
		return
	}

	// 选择 + 方法论会话(临时, Skill 开): agent 读论文 + invoke reviewer-roster 选 3 位审稿人, 产出方法论。
	// 期间 compute_state=computing_methodology: status 仍 reviewing, 但前端据此显示"通读全文·制定审稿标准"
	// + 实时方法论流(slot=methodology), 不把这段误标成"审稿人A评议中"。完成/降级后切回 reviewing。
	//
	// 挑审稿人已从后端 Go(原 4 个 PersonaRandomPicker + feature_prompts DB)整体移进 agent;
	// 返回的 choices 恒为 3 位 ReviewerChoice(选择失败自动退化到内置三人格), 永不 hard-fail。
	_ = s.repo.SetComputeState(submissionID, StateComputingMethodology, "")
	methodology, choices := s.runMethodologyPhase(ctx, submissionID, files)
	_ = s.repo.SetComputeState(submissionID, StateReviewing, "")

	commonContext := buildCommonContext(sub, files, methodology)

	// 3 位审稿人串行 — 每位独立 slot, 同时推 broker 让前端实时看到 agent 输出。
	// 保留各自 ReviewerOutput 用于 chief 上下文。
	reviewerOutputs := make(map[string]*ReviewerOutput, 3)
	for i, role := range []string{"alpha", "beta", "gamma"} {
		slot := ReviewerSlot(role)
		choice := choices[i] // 第 i 位 agent 选中的审稿人 → 固定槽 alpha/beta/gamma(前端仍匿名显示 A/B/C)
		prompt := buildReviewerPrompt(choice, commonContext, role)

		reply, usage, _, err := s.chatWithRetry(ctx, sessionID, submissionID, slot, prompt, s.mainModel(),
			func(r string) bool { _, ok := parseReviewerJSON(r); return ok }, peerReviewJSONRetries)
		if err != nil {
			s.failUser(submissionID, slot, "审稿生成失败,请稍后重试",
				fmt.Errorf("reviewer chat role=%s reviewer=%s: %w", role, choice.Slug, err))
			return
		}

		out, ok := parseReviewerJSON(reply)
		rep := s.buildReportFromReviewer(submissionID, role, out, ok, reply, usage)
		if err := s.repo.UpsertReport(rep); err != nil {
			s.failUser(submissionID, slot, "保存审稿结果失败,请稍后重试",
				fmt.Errorf("save role=%s report: %w", role, err))
			return
		}
		if ok {
			reviewerOutputs[role] = out
		}
		s.broker.Done(submissionID, slot)
	}

	// chief — 把 3 份 reviewer JSON 拼成上下文, 让主审能逐位回应。chief 人格固定(内置 const)。
	chiefSlot := ReviewerSlot("chief")
	chiefPrompt := buildChiefPrompt(commonContext, reviewerOutputs)

	chiefReply, chiefUsage, _, err := s.chatWithRetry(ctx, sessionID, submissionID, chiefSlot, chiefPrompt, s.mainModel(),
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
	s.broker.Done(submissionID, chiefSlot)

	_ = s.repo.MarkCompleted(submissionID)
	_ = s.repo.SetComputeState(submissionID, StateIdle, "")
}

// peerReviewJSONRetries 评分轮 JSON 解析失败时的最大重发次数(带强约束提示重发)。
const peerReviewJSONRetries = 2

// scoringSessionDeny: 审稿是 server 单发要 JSON 的批处理 —— 给评分会话**追加**禁用
// Skill/Agent(子 agent), 防模型在评分轮 invoke skill / 起子 agent 产生叙述文本冲碎 JSON。
// union 进 agent 全局禁用列表(见 conversationService.buildSessionCliArgs)。
// 方法论会话(P3 step2)不传这个 → Skill 开, 可 invoke 审稿 skill。
var scoringSessionDeny = []string{"Skill", "Agent", "Task"}

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
	var lastUsage *agentbridge.ChatUsage
	for attempt := 0; ; attempt++ {
		s.broker.Begin(submissionID, slot)
		reply, usage, err := s.feature.Bridge().ServerSideChatStreaming(ctx, sessionID, cur,
			func(delta string) { s.broker.Append(submissionID, slot, delta) },
			func(note string) { s.broker.Status(submissionID, slot, note) },
			model)
		if err != nil {
			return "", nil, false, err
		}
		lastReply = reply
		lastUsage = usage
		if validate(reply) {
			return reply, usage, true, nil
		}
		if attempt >= maxRetry {
			return lastReply, lastUsage, false, nil
		}
		s.broker.Status(submissionID, slot, "输出格式异常, 正在重新生成…")
		cur = prompt + retryHint
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
	_ = s.repo.SetComputeState(submissionID, StateFailed, reason)
}

// failUser 审稿失败统一收口: 原始错误(agent/存储/JSON 解析等内部细节)只进日志,
// 给用户的两条路 —— broker 实时 SSE + DB compute_error(FailureBanner 回看)—— 都只回友好中文。
// 避免把 "agent chat role=alpha reviewer=...: <raw>" 这类内部串漏给用户。
func (s *Service) failUser(submissionID uint64, slot, friendly string, raw error) {
	slog.Error("peerreview failed", "submission_id", submissionID, "slot", slot, "err", raw)
	s.broker.Fail(submissionID, slot, friendly)
	s.markFailedAndLog(submissionID, friendly)
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

func buildCommonContext(sub *Submission, files *sessionAssets, methodology string) string {
	var b strings.Builder
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
	b.WriteString(buildAssetsBlock(files))

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
- 你可以用 Read 工具读取上面列出的稿件 / 补充材料文件 (它们就在你的工作目录里);
  但严禁 Write / Edit 这些文件, 也严禁 Bash / WebSearch 等本地或外网工具
`)
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
