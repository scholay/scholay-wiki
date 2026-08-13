// ============================================================================
// invite.Service —— 邀请码、活动规则、注册归因、首单返利与管理端观测。
//
// 归因链路(方案 A,ctx 贯穿):
//   前端在请求头带 X-Invite-Code → middleware.InviteCodeMiddleware 写进 request ctx
//   → user 各新建账号路径(主注册事务提交后)经包级钩子调 AttributeFromContext
//   → 这里进入 Bind，把关系、里程碑、奖励审计与钱包流水放在一个新事务。
//
// 归因仍是注册主链路的 best-effort 后置动作：失败记录 slog，不撤销已成功创建的账号；
// 但 Bind 内部的奖励链路是强事务、可并发幂等的，不是旧版的分步发放。
// ============================================================================

package invite

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"os"
	"strings"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/utils"

	"gorm.io/gorm"
)

type Service struct {
	repo *Repository

	// txRewardGranter 由 bootstrap 接到 vip.WalletService.GrantPermInTx。关系、里程碑、
	// grant 审计、钱包和 credit_transactions 共用调用方事务，不再存在「先抢标记再单独发钱」的裂缝。
	txRewardGranter func(tx *gorm.DB, userID uint, amount int, txType, refID, note string) (uint64, error)
	// txRewardReclaimer 由 bootstrap 接到 vip.WalletService，用于首单退款时幂等回收返利。
	txRewardReclaimer func(tx *gorm.DB, userID uint, expected int, refID, note string) (uint64, int, int, error)
	// 事务提交后的邀请奖励通知；kind 与钱包流水 type 一致。
	// 通知不参与账务事务，失败不得回滚已入账奖励。
	rewardNotifier func(userID uint, amount int, kind string)
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

func (s *Service) SetTxRewardGranter(fn func(tx *gorm.DB, userID uint, amount int, txType, refID, note string) (uint64, error)) {
	s.txRewardGranter = fn
}

func (s *Service) SetTxRewardReclaimer(fn func(tx *gorm.DB, userID uint, expected int,
	refID, note string) (uint64, int, int, error)) {
	s.txRewardReclaimer = fn
}

func (s *Service) SetRewardNotifier(fn func(userID uint, amount int, kind string)) {
	s.rewardNotifier = fn
}

const (
	sourceLink   = "link"
	sourceManual = "manual"

	milestoneRegistration  = "registration"
	milestoneFirstPurchase = "first_purchase"
	roleInviter            = "inviter"
	roleInvitee            = "invitee"

	txRegistrationInviter = "invite_registration_inviter"
	txRegistrationInvitee = "invite_registration_invitee"
	txFirstPurchaseRebate = "invite_first_purchase_rebate"
)

var (
	ErrCampaignDisabled  = errors.New("invite: campaign disabled")
	ErrInvalidInviteCode = errors.New("invite: invalid code")
	ErrSelfInvite        = errors.New("invite: self invite")
	ErrAlreadyBound      = errors.New("invite: user already bound")
	ErrBindWindowExpired = errors.New("invite: bind window expired")
	ErrInviterNotEarlier = errors.New("invite: inviter must predate invitee")
	ErrUserUnavailable   = errors.New("invite: user unavailable")
	ErrRewardPortUnwired = errors.New("invite: transactional reward port unavailable")
)

type CampaignConfigError struct{ msg string }

func (e *CampaignConfigError) Error() string { return e.msg }

func AsCampaignConfigError(err error) (*CampaignConfigError, bool) {
	var target *CampaignConfigError
	ok := errors.As(err, &target)
	return target, ok
}

func validateCampaignConfig(cfg *CampaignConfig) error {
	if cfg == nil {
		return &CampaignConfigError{msg: "邀请活动配置不能为空"}
	}
	if cfg.InviterRegistrationCredits < 0 || cfg.InviteeRegistrationCredits < 0 || cfg.RegistrationDailyCap < 0 {
		return &CampaignConfigError{msg: "注册奖励和每日上限不能为负数"}
	}
	if cfg.InviterRegistrationCredits > 1_000_000_000 || cfg.InviteeRegistrationCredits > 1_000_000_000 {
		return &CampaignConfigError{msg: "单个注册奖励不能超过 10 亿经费"}
	}
	if cfg.RegistrationDailyCap > 1_000_000 {
		return &CampaignConfigError{msg: "每日计奖上限不能超过 100 万人"}
	}
	if cfg.FirstPurchaseRebateBPS < 0 || cfg.FirstPurchaseRebateBPS > 10000 {
		return &CampaignConfigError{msg: "首单返利必须在 0–10000 基点之间"}
	}
	if cfg.BindWindowDays <= 0 || cfg.FirstPurchaseWindowDays <= 0 ||
		cfg.BindWindowDays > 3650 || cfg.FirstPurchaseWindowDays > 3650 {
		return &CampaignConfigError{msg: "绑定时窗和首单时窗必须在 1–3650 天之间"}
	}
	if cfg.Enabled && cfg.InviterRegistrationCredits == 0 && cfg.InviteeRegistrationCredits == 0 && cfg.FirstPurchaseRebateBPS == 0 {
		return &CampaignConfigError{msg: "活动开启时至少需要配置一种注册奖励或首单返利"}
	}
	cfg.CodeHelpURL = strings.TrimSpace(cfg.CodeHelpURL)
	if len(cfg.CodeHelpURL) > 500 {
		return &CampaignConfigError{msg: "帮助链接不能超过 500 个字符"}
	}
	if cfg.CodeHelpURL != "" {
		u, err := url.ParseRequestURI(cfg.CodeHelpURL)
		if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
			return &CampaignConfigError{msg: "帮助链接只能为空或完整的 http(s) 地址"}
		}
	}
	return nil
}

// ─── 码生成(纯函数,见 code_test.go)──────────────────────────────────────

// codeLen 邀请码长度。
const codeLen = 8

// codeAlphabet 大写 base32 风格字符集,去掉易混字符 0/O/1/I/L(31 字符),
// 与 vip 兑换码同一取舍:方便口头转述/人工抄写。
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// generateCode 用 crypto/rand 生成 8 位邀请码(utils.SecureRandomString 无模偏差)。
func generateCode() string {
	return utils.SecureRandomString(codeLen, codeAlphabet)
}

// normalizeCode 统一大写 + 去首尾空白(用户从 URL/口头转述来的码大小写不定)。
func normalizeCode(s string) string {
	return strings.ToUpper(strings.TrimSpace(s))
}

// isValidCodeFormat 兼容两代码：
//   - stranded 历史码：6 位完整 [A-Z0-9]，确实存在 0/O/L；
//   - 新码：8 位 codeAlphabet，继续排除易混字符。
//
// 其他长度零成本拒绝；通过格式也仍必须 DB + active user 复核。
func isValidCodeFormat(s string) bool {
	if len(s) == 6 {
		for i := 0; i < len(s); i++ {
			if !((s[i] >= 'A' && s[i] <= 'Z') || (s[i] >= '0' && s[i] <= '9')) {
				return false
			}
		}
		return true
	}
	if len(s) != codeLen {
		return false
	}
	for i := 0; i < len(s); i++ {
		if !strings.ContainsRune(codeAlphabet, rune(s[i])) {
			return false
		}
	}
	return true
}

// ─── 用户端 ──────────────────────────────────────────────────────────────

// GetOrCreate 取该用户的邀请码,没有则生成(created_at 即「生成邀请」时刻)。
//
// 并发安全靠 INSERT IGNORE + 两个唯一键,而非显式事务:
//
//	· 撞 uk_invite_codes_user(并发双开同一用户)→ IGNORE 吞掉,查回复用既有码;
//	· 撞 uk_invite_codes_code(与别人撞码,8 位 31 字符集概率 ~1e-12,理论保留)→
//	  查回发现该 user 仍无码,换码重试,最多 3 次。
//
// 单条 INSERT 本身原子,显式事务反而引入 REPEATABLE READ 快照可见性的坑,不用。
func (s *Service) GetOrCreate(userID uint) (*InviteCode, error) {
	row, err := s.repo.FindByUserID(userID)
	if err != nil {
		return nil, err
	}
	if row != nil {
		return row, nil
	}
	for attempt := 0; attempt < 3; attempt++ {
		fresh := &InviteCode{UserID: userID, Code: generateCode(), IsActive: true}
		affected, err := s.repo.InsertCodeIgnore(fresh)
		if err != nil {
			return nil, err
		}
		if affected > 0 {
			// gorm 回填了自增 id;created_at 由列默认值生成,查回一次拿完整行(含精确时刻)。
			if got, err := s.repo.FindByUserID(userID); err == nil && got != nil {
				return got, nil
			}
			return fresh, nil
		}
		// 被 IGNORE:先当「并发下别人已给该 user 建了码」处理,查回复用;
		// 查不到才是撞码,换一个码重试。
		existing, err := s.repo.FindByUserID(userID)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			return existing, nil
		}
	}
	return nil, errors.New("invite: 生成邀请码失败(撞码重试耗尽)")
}

// Stats 用户端「我的邀请」:get-or-create + 归因注册数 + 完整落地 URL。
func (s *Service) Stats(userID uint) (*UserInviteView, error) {
	cfg, err := s.campaignConfig()
	if err != nil {
		return nil, err
	}
	var row *InviteCode
	if cfg.Enabled {
		row, err = s.GetOrCreate(userID)
	} else {
		// 关闭态只读已有码，绝不 get-or-create，也不激活历史停用码。
		row, err = s.repo.FindByUserID(userID)
	}
	if err != nil {
		return nil, err
	}
	registered, err := s.repo.CountRegistrations(userID)
	if err != nil {
		return nil, err
	}
	// 当前注册奖励只读独立活动真源；活动关闭对外展示 0。
	rewardPer := 0
	if cfg.Enabled {
		rewardPer = cfg.InviterRegistrationCredits
	}
	rewardTotal, err := s.repo.RewardTotalOf(userID)
	if err != nil {
		return nil, err
	}
	view := &UserInviteView{
		RegisteredCount: registered,
		RewardPerInvite: rewardPer,
		RewardTotal:     rewardTotal,
	}
	if row != nil {
		view.OpenCount = row.OpenCount
		view.CreatedAt = row.CreatedAt
		if row.IsActive && cfg.Enabled {
			view.Code = row.Code
			view.URL = s.InviteURL(row.Code)
		}
	}
	return view, nil
}

// InviteURL 拼落地页完整 URL:公网 origin + "/i/" + code。
// 🔴 origin 优先取 SITE_URL(公网站点唯一真源,.env 显式配置)——
// **不能**优先 FRONTEND_USER_URL:docker-compose 把它硬编码为 "http://frontend-user:80"
// (容器内网地址,供 internal/config 下发前端做内部拼接),实测用它拼出的分享链接
// 是用户不可达的内网 URL。仅当 SITE_URL 缺失时才回落它(裸机部署可能只配了公网
// FRONTEND_USER_URL),最后兜底 CanonicalBaseURL()。
//
// 🔴 最后一档以前是写死的品牌域名。那意味着一个漏配 SITE_URL 的环境会把自己的
// 邀请码拼成**别的站点**的链接:用户点开进的是生产站,而那个 code 在生产库里不存在
// → 落地页报无效码,邀请转化静默归零,且日志里两边都看不出问题。现在最后一档是
// CanonicalBaseURL(),它自己已经没有真实域名兜底(release 模式漏配直接启动失败)。
func (s *Service) InviteURL(code string) string {
	base := os.Getenv("SITE_URL")
	if base == "" && appconfig.AppConfig != nil {
		base = appconfig.AppConfig.App.FrontendUserURL
	}
	if base == "" {
		base = appconfig.CanonicalBaseURL()
	}
	return strings.TrimRight(base, "/") + "/i/" + code
}

// RecordOpen 落地页打开:码存在则 open_count 原子 +1 并刷新 last_opened_at。
// 返回 valid=false 而不报错(契约:不存在不报 4xx,防探测噪音);
// 格式不合法的码零成本拒绝,不碰 DB。
func (s *Service) RecordOpen(code string) (bool, error) {
	cfg, err := s.campaignConfig()
	if err != nil {
		return false, err
	}
	if !cfg.Enabled {
		return false, nil
	}
	norm := normalizeCode(code)
	if !isValidCodeFormat(norm) {
		return false, nil
	}
	return s.repo.IncrementOpen(norm)
}

func defaultCampaignConfig() *CampaignConfig {
	return &CampaignConfig{ID: 1, BindWindowDays: 30, FirstPurchaseWindowDays: 30}
}

func (s *Service) campaignConfig() (*CampaignConfig, error) {
	cfg, err := s.repo.GetCampaignConfig()
	if err != nil {
		return nil, err
	}
	if cfg == nil {
		return defaultCampaignConfig(), nil
	}
	return cfg, nil
}

func publicCampaign(cfg *CampaignConfig) PublicCampaign {
	if cfg == nil {
		cfg = defaultCampaignConfig()
	}
	out := PublicCampaign{
		Enabled: cfg.Enabled, BindWindowDays: cfg.BindWindowDays,
		FirstPurchaseWindowDays: cfg.FirstPurchaseWindowDays, CodeHelpURL: cfg.CodeHelpURL,
	}
	if cfg.Enabled {
		out.InviterRegistrationCredits = cfg.InviterRegistrationCredits
		out.InviteeRegistrationCredits = cfg.InviteeRegistrationCredits
		out.RegistrationDailyCap = cfg.RegistrationDailyCap
		out.FirstPurchaseRebateBPS = cfg.FirstPurchaseRebateBPS
	}
	return out
}

func (s *Service) Campaign() (PublicCampaign, error) {
	cfg, err := s.campaignConfig()
	if err != nil {
		return PublicCampaign{}, err
	}
	return publicCampaign(cfg), nil
}

func (s *Service) AdminCampaign() (*CampaignConfig, error) { return s.campaignConfig() }

func (s *Service) UpdateCampaign(cfg *CampaignConfig) error {
	if err := validateCampaignConfig(cfg); err != nil {
		return err
	}
	return s.repo.UpdateCampaignConfig(cfg)
}

// Preview 只在活动开启且码属于存在的 active 用户时返回 valid=true。
// 所有无效/孤儿/冻结码对外同一 false，不泄漏内部状态。
func (s *Service) Preview(code string) (*InvitePreview, error) {
	cfg, err := s.campaignConfig()
	if err != nil {
		return nil, err
	}
	out := &InvitePreview{Campaign: publicCampaign(cfg)}
	if !cfg.Enabled {
		return out, nil
	}
	norm := normalizeCode(code)
	if !isValidCodeFormat(norm) {
		return out, nil
	}
	ic, err := s.repo.FindActiveCode(norm)
	if err != nil {
		return nil, err
	}
	if ic == nil {
		return out, nil
	}
	out.Valid = true
	out.Code = norm
	out.InviterName = maskIdentity(ic.InviterEmail, ic.InviterName)
	return out, nil
}

// ─── 归因(best-effort 旁路)────────────────────────────────────────────

// AttributeFromContext 从请求 ctx 取 X-Invite-Code 并归因到新用户。
// 由 user 包的注册成功路径(事务提交后)经包级钩子调用;签名即
// user.SetInviteAttributor 要的形状。任何失败只 slog.Warn,永不上抛。
func (s *Service) AttributeFromContext(ctx context.Context, invitedUserID uint, method string) {
	code := middleware.InviteCodeFromContext(ctx)
	if code == "" {
		return // 请求没带邀请码 —— 绝大多数注册走这里,零开销返回
	}
	if err := s.AttributeRegistration(code, invitedUserID, method); err != nil {
		slog.Warn("invite: 注册归因失败(不影响注册)",
			"invited_user_id", invitedUserID, "method", method, "err", err)
	}
}

// AttributeRegistration 把 code 归因到 invitedUserID。调用者采用 best-effort 语义:
//
//	· 无效/自邀/已绑定/超时/活动关闭等确定性结果静默忽略；
//	· DB 或账务故障返回 error，由调用方 slog；
//	· 一旦进入奖励事务，关系/里程碑/grant/钱包要么全成功，要么全回滚。
func (s *Service) AttributeRegistration(code string, invitedUserID uint, method string) error {
	_, err := s.Bind(code, invitedUserID, sourceLink, method)
	if err == nil || isExpectedBindError(err) {
		return nil
	}
	return err
}

// ─── 管理端 ──────────────────────────────────────────────────────────────

// Summary 后台汇总数(邀请人 / 打开 / 注册 / 近 7 天 / 累计奖励)。
func (s *Service) Summary() (*AdminSummary, error) {
	return s.repo.Summary()
}

// List 后台邀请人分页列表。
func (s *Service) List(keyword string, page, pageSize int) ([]AdminInviteRow, int64, error) {
	page, pageSize = clampPage(page, pageSize)
	return s.repo.List(strings.TrimSpace(keyword), pageSize, (page-1)*pageSize)
}

// RegistrationsOf 后台某邀请人的注册明细分页。
func (s *Service) RegistrationsOf(inviterUserID uint, page, pageSize int) ([]AdminRegistrationRow, int64, error) {
	page, pageSize = clampPage(page, pageSize)
	return s.repo.RegistrationsOf(inviterUserID, pageSize, (page-1)*pageSize)
}

// UserRegistrations 邀请人视角的「我邀请的用户」分页 —— 复用 admin 查询,出口**逐行脱敏**
// (原始邮箱/用户名/用户 ID 不出服务层,见 UserRegistrationRow 注释)。
func (s *Service) UserRegistrations(inviterUserID uint, page, pageSize int) ([]UserRegistrationRow, int64, error) {
	rows, total, err := s.RegistrationsOf(inviterUserID, page, pageSize)
	if err != nil {
		return nil, 0, err
	}
	out := make([]UserRegistrationRow, 0, len(rows)) // 显式 [],防 nil→null
	for _, r := range rows {
		netFirstPurchaseRebate := r.FirstPurchaseRebateCredits - r.FirstPurchaseReversedCredits
		if netFirstPurchaseRebate < 0 {
			netFirstPurchaseRebate = 0
		}
		out = append(out, UserRegistrationRow{
			Name:                       maskIdentity(r.Email, r.Name),
			Method:                     r.Method,
			Source:                     r.Source,
			RewardedCredits:            r.InviterRegistrationCredits,
			InviterRegistrationCredits: r.InviterRegistrationCredits,
			// 用户端展示实际保留的净返利；shortfall 未从钱包扣到，仍算用户已得。
			FirstPurchaseRebateCredits: netFirstPurchaseRebate,
			FirstPurchasePaidAt:        r.FirstPurchasePaidAt,
			BoundAt:                    r.BoundAt,
			CreatedAt:                  r.CreatedAt,
		})
	}
	return out, total, nil
}

// maskIdentity 生成脱敏展示名:优先邮箱(al***@gmail.com),次选用户名(张**),都空回「用户***」。
// 按 rune 处理防止把中文/多字节字符切碎。
func maskIdentity(email, name string) string {
	if e := strings.TrimSpace(email); e != "" {
		if at := strings.Index(e, "@"); at > 0 {
			local := []rune(e[:at])
			keep := 2
			if len(local) <= 2 {
				keep = 1
			}
			return string(local[:keep]) + "***" + e[at:]
		}
	}
	if n := []rune(strings.TrimSpace(name)); len(n) > 0 {
		return string(n[:1]) + "**"
	}
	return "用户***"
}

// clampPage 分页参数钳位(与 vip.ListCodes 口径一致)。
func clampPage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 20
	}
	return page, pageSize
}
