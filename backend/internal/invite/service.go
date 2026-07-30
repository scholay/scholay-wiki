// ============================================================================
// invite.Service —— 邀请码 get-or-create / 打开计数 / 注册归因 / 管理端统计。
//
// 归因链路(方案 A,ctx 贯穿):
//   前端在请求头带 X-Invite-Code → middleware.InviteCodeMiddleware 写进 request ctx
//   → user 各注册成功路径(事务提交后)经包级钩子调 AttributeFromContext
//   → 这里取码、校验、INSERT IGNORE 落流水。全程 best-effort:任何失败只 slog,
//     绝不影响注册返回。
// ============================================================================

package invite

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"strings"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/utils"
)

type Service struct {
	repo *Repository

	// 邀请奖励(0100)的两个注入 seam(bootstrap 接 vip;均 nil 安全 —— 不接线 = 奖励整体关闭,
	// invite 包刻意不 import vip,依赖方向保持 bootstrap 单向组装)。
	rewardCfg     func() (amount, dailyCap int)                              // 读 billing_config 两旋钮
	rewardGranter func(inviterID uint, amount int, invitedUserID uint) error // 入账(vip.GrantInviteReward)
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

// SetRewardConfigProvider 注入「邀请奖励配置」读取 seam(amount=每邀请奖励经费,0=关闭;
// dailyCap=每邀请人每日计奖上限,0=不限)。nil 安全:不注入即视为活动关闭。
func (s *Service) SetRewardConfigProvider(fn func() (amount, dailyCap int)) { s.rewardCfg = fn }

// SetRewardGranter 注入奖励发放 seam(bootstrap 接 vip.Service.GrantInviteReward)。
// nil 安全:不注入即视为活动关闭。
func (s *Service) SetRewardGranter(fn func(inviterID uint, amount int, invitedUserID uint) error) {
	s.rewardGranter = fn
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

// isValidCodeFormat 码格式预检:定长 + 字符集内。公开端点先过这道再碰 DB,
// 无效格式零成本拒绝(防探测/刷库噪音)。
func isValidCodeFormat(s string) bool {
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
//   · 撞 uk_invite_codes_user(并发双开同一用户)→ IGNORE 吞掉,查回复用既有码;
//   · 撞 uk_invite_codes_code(与别人撞码,8 位 31 字符集概率 ~1e-12,理论保留)→
//     查回发现该 user 仍无码,换码重试,最多 3 次。
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
		fresh := &InviteCode{UserID: userID, Code: generateCode()}
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
	row, err := s.GetOrCreate(userID)
	if err != nil {
		return nil, err
	}
	registered, err := s.repo.CountRegistrations(userID)
	if err != nil {
		return nil, err
	}
	// 邀请奖励(0100):reward_per_invite = 当前配置(0=活动未开;seam 未接线同样是 0),
	// reward_total = 累计已获(与配置无关的历史事实,活动关了也照常展示)。
	rewardPer := 0
	if s.rewardCfg != nil {
		if amount, _ := s.rewardCfg(); amount > 0 {
			rewardPer = amount
		}
	}
	rewardTotal, err := s.repo.RewardTotalOf(userID)
	if err != nil {
		return nil, err
	}
	return &UserInviteView{
		Code:            row.Code,
		URL:             s.InviteURL(row.Code),
		OpenCount:       row.OpenCount,
		RegisteredCount: registered,
		RewardPerInvite: rewardPer,
		RewardTotal:     rewardTotal,
		CreatedAt:       row.CreatedAt,
	}, nil
}

// InviteURL 拼落地页完整 URL:公网 origin + "/i/" + code。
// 🔴 origin 优先取 SITE_URL(公网站点唯一真源,.env 显式配置)——
// **不能**优先 FRONTEND_USER_URL:docker-compose 把它硬编码为 "http://frontend-user:80"
// (容器内网地址,供 internal/config 下发前端做内部拼接),实测用它拼出的分享链接
// 是用户不可达的内网 URL。仅当 SITE_URL 缺失时才回落它(裸机部署可能只配了公网
// FRONTEND_USER_URL),最后兜底品牌域名。
func (s *Service) InviteURL(code string) string {
	base := os.Getenv("SITE_URL")
	if base == "" && appconfig.AppConfig != nil {
		base = appconfig.AppConfig.App.FrontendUserURL
	}
	if base == "" {
		base = "https://www.scholay.com"
	}
	return strings.TrimRight(base, "/") + "/i/" + code
}

// RecordOpen 落地页打开:码存在则 open_count 原子 +1 并刷新 last_opened_at。
// 返回 valid=false 而不报错(契约:不存在不报 4xx,防探测噪音);
// 格式不合法的码零成本拒绝,不碰 DB。
func (s *Service) RecordOpen(code string) (bool, error) {
	norm := normalizeCode(code)
	if !isValidCodeFormat(norm) {
		return false, nil
	}
	return s.repo.IncrementOpen(norm)
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

// AttributeRegistration 把 code 归因到 invitedUserID。best-effort 语义:
//   · 码格式不对 / 码不存在 → 静默忽略(header 可被任意伪造,不值得报错);
//   · inviter == invited → 忽略(自邀理论不可能 —— 新号注册前拿不到自己的码,纯防御);
//   · invited_user_id 撞唯一键 = 已归因过 → INSERT IGNORE 静默幂等;
//   · 仅 DB 故障返回 error(由调用方 slog)。
func (s *Service) AttributeRegistration(code string, invitedUserID uint, method string) error {
	norm := normalizeCode(code)
	if invitedUserID == 0 || !isValidCodeFormat(norm) {
		return nil
	}
	ic, err := s.repo.FindByCode(norm)
	if err != nil {
		return err
	}
	if ic == nil {
		return nil
	}
	if ic.UserID == invitedUserID {
		return nil
	}
	if len(method) > 32 {
		method = method[:32] // 列宽 varchar(32),截断防插入报错
	}
	row := &InviteRegistration{
		InviterUserID: ic.UserID,
		CodeID:        ic.ID,
		InvitedUserID: invitedUserID,
		Method:        method,
	}
	affected, err := s.repo.InsertRegistrationIgnore(row)
	if err != nil {
		return err
	}
	// 奖励只挂在「新归因成功」上(RowsAffected=1):被唯一键吞掉的重放/并发归因绝不触发,
	// 与 rewarded_credits=0 条件更新构成双保险。maybeReward 全程 best-effort,不影响归因结果。
	if affected > 0 {
		s.maybeReward(row)
	}
	return nil
}

// maybeReward 新归因成功后尝试给邀请人发奖励(0100)。全程 best-effort:任何失败只 slog,
// 永不上抛 —— 奖励是归因的旁路,归因又是注册的旁路,双层旁路都不许反噬注册主流程。
func (s *Service) maybeReward(reg *InviteRegistration) {
	if s.rewardCfg == nil || s.rewardGranter == nil {
		return // seam 未接线 = 活动关闭
	}
	amount, dailyCap := s.rewardCfg()
	if amount <= 0 {
		return // 活动未开(invite_reward_credits=0)
	}
	// id 兜底:gorm 对 INSERT IGNORE 成功插入(RowsAffected=1)会回填自增 id;
	// 万一没回填(id=0 会让条件更新恒 miss、奖励静默丢失),按唯一键 invited_user_id 查回。
	if reg.ID == 0 {
		got, err := s.repo.FindRegistrationByInvitedUser(reg.InvitedUserID)
		if err != nil || got == nil {
			slog.Error("invite: 邀请奖励发放失败(查回归因行失败)",
				"inviter", reg.InviterUserID, "invited", reg.InvitedUserID, "err", err)
			return
		}
		reg = got
	}
	// 日上限:今天已计奖励的邀请数(rewarded_credits>0 的行数)达到 cap 即跳过,归因本身不受影响。
	if dailyCap > 0 {
		n, err := s.repo.CountRewardedToday(reg.InviterUserID)
		if err != nil {
			slog.Error("invite: 邀请奖励发放失败(查当日已奖数失败)",
				"inviter", reg.InviterUserID, "invited", reg.InvitedUserID, "err", err)
			return
		}
		if n >= int64(dailyCap) {
			slog.Info("invite: 邀请奖励达当日上限,未发放(归因照常)",
				"inviter", reg.InviterUserID, "invited", reg.InvitedUserID, "daily_cap", dailyCap)
			return
		}
	}
	// 🔴 顺序:**先抢标记,再入账,失败回滚标记**。
	//   · 先标记(WHERE rewarded_credits=0 条件更新)——并发/重放下只有一个执行流抢得到,
	//     防双发;顺序反过来(先发后标)失败窗口会变成「已入账、没标记」→ 重放再发一次,
	//     多发的钱不可回收,比标记错更糟。
	//   · granter 失败把标记回滚成 0 —— 防「标了没发」把用户应得的奖励永久吞掉。
	won, err := s.repo.MarkRewarded(reg.ID, amount)
	if err != nil {
		slog.Error("invite: 邀请奖励发放失败(抢标记失败)",
			"inviter", reg.InviterUserID, "invited", reg.InvitedUserID, "err", err)
		return
	}
	if !won {
		return // 已被标过(并发/重放)= 已发放,静默幂等
	}
	if err := s.rewardGranter(reg.InviterUserID, amount, reg.InvitedUserID); err != nil {
		slog.Error("invite: 邀请奖励入账失败,回滚标记",
			"inviter", reg.InviterUserID, "invited", reg.InvitedUserID, "amount", amount, "err", err)
		if uerr := s.repo.UnmarkRewarded(reg.ID); uerr != nil {
			slog.Error("invite: 邀请奖励标记回滚失败(需人工对账:rewarded_credits>0 但无对应流水)",
				"registration_id", reg.ID, "inviter", reg.InviterUserID, "err", uerr)
		}
		return
	}
	slog.Info("invite: 邀请奖励已发放",
		"inviter", reg.InviterUserID, "invited", reg.InvitedUserID, "amount", amount)
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
		out = append(out, UserRegistrationRow{
			Name:      maskIdentity(r.Email, r.Name),
			Method:    r.Method,
			CreatedAt: r.CreatedAt,
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
