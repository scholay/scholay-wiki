// ============================================================================
// 会员/计费事件通知 —— 走支付的(充值 / 订阅 / 续期 / 升级)+ 兑换码激活,成功后给用户
// 发**站内信**(可靠、不依赖 SMTP)+**邮件**(有邮箱才发,best-effort 异步)。
// 邮件统一走 utils.RenderBrandedEmail(Scholay 品牌模板)。
//
// 依赖经接口注入(bootstrap):MessageSender = message adapter;EmailConfigProvider = config service。
// ============================================================================

package vip

import (
	"fmt"
	"log/slog"

	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
)

// MessageSender 站内信发送(对齐 message.MessageServiceAdapter.SendToUser)。
type MessageSender interface {
	SendToUser(userID uint, title, content, category, linkURL, linkText string) error
}

// EmailConfigProvider 取当前生效邮件配置(对齐 config.Service.GetActiveEmailConfig)。
type EmailConfigProvider interface {
	GetActiveEmailConfig() (*model.EmailConfig, error)
}

// SetNotifier 注入站内信 + 邮件配置(bootstrap 调一次;任一为 nil 即跳过对应通道)。
func (s *Service) SetNotifier(msg MessageSender, emailCfg EmailConfigProvider) {
	s.msg = msg
	s.emailCfg = emailCfg
}

// membershipURL 账户资产页绝对链接(邮件 CTA 用)。
func membershipURL() string { return config.CanonicalBaseURL() + "/settings/membership" }

// notify 发一条交易类站内信 + 邮件(有邮箱才发邮件)。全 best-effort,绝不阻塞/失败主流程。
func (s *Service) notify(userID uint, title, inApp string, ec utils.EmailContent) {
	if s.msg != nil {
		if err := s.msg.SendToUser(userID, title, inApp, "transaction", "/settings/membership", "查看账户"); err != nil {
			slog.Warn("vip: in-app message failed", "user_id", userID, "title", title, "err", err)
		}
	}
	if s.emailCfg == nil {
		return
	}
	addr, _ := s.repo.GetUserContact(userID)
	if addr == "" {
		return // 无邮箱不发邮件
	}
	cfg, err := s.emailCfg.GetActiveEmailConfig()
	if err != nil || cfg == nil {
		return // 未配置邮件服务
	}
	ecfg := utils.EmailConfig{
		SMTPHost: cfg.SMTPHost, SMTPPort: cfg.SMTPPort, SMTPUser: cfg.SMTPUser,
		SMTPPassword: cfg.SMTPPassword, FromEmail: cfg.FromEmail, FromName: cfg.FromName,
	}
	subject := utils.EmailBrandName + " · " + title
	body := utils.RenderBrandedEmail(ec)
	safego.Go("vip-notify-email", func() {
		if err := utils.SendEmailWithTLS(ecfg, []string{addr}, subject, body); err != nil {
			slog.Warn("vip: email send failed", "user_id", userID, "err", err)
		}
	})
}

// tierDisplayName 等级展示名(统一 Free / Pro / Max,不带「套餐」后缀)。
func tierDisplayName(tier string) string {
	if tier == TierMax {
		return "Max"
	}
	return "Pro"
}

func yuanStr(f float64) string { return fmt.Sprintf("¥%.2f", f) }

// NotifyInviteCampaignReward 在邀请奖励事务提交后发明确通知。
// kind 沿用 credit_transactions.type，避免“发了钱但用户不知道是哪条规则”。
func (s *Service) NotifyInviteCampaignReward(userID uint, credits int, kind string) {
	if userID == 0 || credits <= 0 {
		return
	}
	var title, intro, inApp string
	switch kind {
	case TxInviteRegistrationInvitee:
		title = "受邀注册奖励到账"
		intro = "您通过好友邀请完成注册，受邀奖励已到账。"
		inApp = fmt.Sprintf("受邀注册奖励 %d 科研经费已到账。", credits)
	case TxInviteFirstPurchaseRebate:
		title = "邀请首单返利到账"
		intro = "您邀请的好友完成了首笔有效付费，返利已到账。"
		inApp = fmt.Sprintf("好友首单返利 %d 科研经费已到账。", credits)
	default:
		title = "邀请注册奖励到账"
		intro = "您邀请的好友已完成注册，邀请奖励已到账。"
		inApp = fmt.Sprintf("邀请注册奖励 %d 科研经费已到账。", credits)
	}
	s.notify(userID, title, inApp, utils.EmailContent{
		Title:   title,
		Intro:   intro,
		Rows:    [][2]string{{"到账经费", fmt.Sprintf("%d 经费", credits)}},
		CTAText: "查看账户资产", CTAURL: membershipURL(),
	})
}

// NotifyInviteRewardReversal 告知邀请人：好友的首单退款已对原返利做相同口径回收。
func (s *Service) NotifyInviteRewardReversal(userID uint, reclaimed, shortfall int, refundNo string) {
	if userID == 0 || (reclaimed <= 0 && shortfall <= 0) {
		return
	}
	title := "邀请首单返利已调整"
	inApp := fmt.Sprintf("因好友首单退款，已回收 %d 科研经费返利。", reclaimed)
	rows := [][2]string{{"已回收经费", fmt.Sprintf("%d 经费", reclaimed)}, {"退款单号", refundNo}}
	if shortfall > 0 {
		rows = append(rows, [2]string{"未回收差额", fmt.Sprintf("%d 经费", shortfall)})
		inApp += fmt.Sprintf("余额不足的 %d 经费未形成负余额。", shortfall)
	}
	s.notify(userID, title, inApp, utils.EmailContent{
		Title:   title,
		Intro:   "邀请返利会随对应首单的有效净实付调整。",
		Rows:    rows,
		CTAText: "查看账户资产", CTAURL: membershipURL(),
	})
}

// notifyOrderFulfilled 支付成功(充值 / 订阅 / 续期 / 升级)后通知。
func (s *Service) notifyOrderFulfilled(ord *Order) {
	// 付费成功外部通知(飞书客服消息等)—— best-effort 异步,不阻塞站内信/邮件与主流程。
	if s.payNotify != nil {
		o := ord
		safego.Go("vip-payment-notify", func() { s.payNotify(o) })
	}
	switch ord.OrderType {
	case "recharge":
		title := "经费充值成功"
		// 0090:经费不再分临时/永久,对外就叫「经费」;且**不能再说「可用于重置额度」**——
		// 重置改扣重置次数,经费买不到重置了,留着这句就是虚假承诺。
		inApp := fmt.Sprintf("您充值的 %d 科研经费已到账。", ord.CreditsGranted)
		s.notify(ord.UserID, title, inApp, utils.EmailContent{
			Title: title,
			Intro: "您的科研经费充值已成功到账,长期有效、不会过期。",
			Rows: [][2]string{
				{"充值金额", yuanStr(ord.FinalAmount)},
				{"到账经费", fmt.Sprintf("%d 经费", ord.CreditsGranted)},
				{"订单号", ord.OrderNo},
			},
			CTAText: "查看账户资产", CTAURL: membershipURL(),
		})
	case "subscription":
		name := tierDisplayName(ord.PlanCode)
		yearly := ord.BillingCycle == CycleYearly && ord.SubAction != "upgrade"
		// 年费单显式彰显「年度会员」身份(标题/套餐名/计费周期行都带),不与月度混同。
		planLabel, cycleLabel := name, "月度"
		if yearly {
			planLabel, cycleLabel = name+" 年度会员", "年度"
		}
		var title, verb string
		switch ord.SubAction {
		case "renew":
			if yearly {
				title, verb = name+" 年度续期成功", "按年续期"
			} else {
				title, verb = name+"续期成功", "续期"
			}
		case "upgrade":
			title, verb = "已升级到 "+name, "升级"
		default:
			if yearly {
				title, verb = name+" 年度会员开通成功", "开通"
			} else {
				title, verb = name+"开通成功", "开通"
			}
		}
		exp := ""
		if ord.NewExpiresAt != nil {
			exp = ord.NewExpiresAt.Format("2006-01-02")
		}
		rows := [][2]string{{"会员套餐", planLabel}}
		// 升级单是「当前周期内补差」,周期与到期日均不变(可能对年费会员补差,billing_cycle 甚至
		// 是 yearly),挂「计费周期」行只会与用户真实身份矛盾(评审 compat-display)——故仅新购/续期
		// 显示计费周期,升级单省略该行。
		if ord.SubAction != "upgrade" {
			rows = append(rows, [2]string{"计费周期", cycleLabel})
		}
		rows = append(rows, [2]string{"有效期至", exp})
		// 0090:订阅不再赠送经费 —— 原先这里按 年度/续期 四分支播报「赠送 N 经费(按月分 12 批)」,
		// 整段删除。订阅单的 CreditsGranted 建单侧已硬置 0,履约侧也不再发放。
		note := ""
		rows = append(rows, [2]string{"支付金额", yuanStr(ord.FinalAmount)}, [2]string{"订单号", ord.OrderNo})
		inApp := fmt.Sprintf("您的 %s 已%s,有效期至 %s。", planLabel, verb, exp)
		s.notify(ord.UserID, title, inApp, utils.EmailContent{
			Title:   title,
			Intro:   fmt.Sprintf("感谢您订阅 %s 会员!您的 %s 已%s,以下是本次订单详情:", utils.EmailBrandName, planLabel, verb),
			Rows:    rows,
			CTAText: "查看会员权益", CTAURL: membershipURL(),
			Note: note,
		})
	}
}

// notifyInviteReward 邀请奖励入账后通知邀请人(0100)。**整体异步**(safego):
// 调用链挂在注册主流程的旁路上(归因 → 发放 → 通知),查邮箱/SMTP 都不该拖注册;
// 失败只 slog(notify 内部已兜),不影响已完成的发放。
func (s *Service) notifyInviteReward(userID uint, credits int) {
	safego.Go("vip-invite-reward-notify", func() {
		title := "邀请奖励到账"
		inApp := fmt.Sprintf("好友已成功注册,%d 经费邀请奖励已到账。", credits)
		s.notify(userID, title, inApp, utils.EmailContent{
			Title:   title,
			Intro:   "您邀请的好友已成功注册,邀请奖励已发放到您的账户。",
			Rows:    [][2]string{{"到账经费", fmt.Sprintf("%d 经费", credits)}},
			CTAText: "查看账户资产", CTAURL: membershipURL(),
		})
	})
}

// notifyRedeem 兑换码激活成功(会员 / 经费)后通知。
func (s *Service) notifyRedeem(userID uint, r *RedeemResult) {
	if r == nil {
		return
	}
	if r.Kind == GrantKindCredit {
		// 0090:经费只有一种,恒按「科研经费」措辞 —— 旧「临时/永久」前缀分支是死代码
		// (兑换发放读到存量 temp 也一律按 perm 入账,见 repository.go),留着只会误导文案口径。
		title := "经费兑换成功"
		inApp := fmt.Sprintf("兑换成功!%d 科研经费已到账。", r.Credits)
		s.notify(userID, title, inApp, utils.EmailContent{
			Title:   title,
			Intro:   "您的兑换码已成功激活,科研经费已到账。",
			Rows:    [][2]string{{"到账经费", fmt.Sprintf("%d 经费", r.Credits)}},
			CTAText: "查看账户资产", CTAURL: membershipURL(),
		})
		return
	}
	name := tierDisplayName(r.Tier)
	exp := ""
	if r.ExpiresAt != nil {
		exp = r.ExpiresAt.Format("2006-01-02")
	}
	title := "会员兑换成功"
	inApp := fmt.Sprintf("兑换成功!已开通 %s,有效期至 %s。", name, exp)
	s.notify(userID, title, inApp, utils.EmailContent{
		Title:   title,
		Intro:   fmt.Sprintf("您的兑换码已成功激活,已为您开通 %s。", name),
		Rows:    [][2]string{{"会员套餐", name}, {"有效期至", exp}},
		CTAText: "查看会员权益", CTAURL: membershipURL(),
	})
}

// notifyOrderRefunded 管理台登记退款后通知用户。
//
// 与 notifyOrderFulfilled 同一套通道(站内信 + 邮件),全 best-effort。
// 🔴 **不下发内部退款原因**:reason 是给运维/财务看的内部字段(可能写着「用户投诉话术恶劣」
// 这种不该给用户看的内容),邮件里只说事实(退了多少、权益怎么变),原因由客服另行沟通。
func (s *Service) notifyOrderRefunded(ord *Order, amount float64, membershipRevoked bool, creditsReclaimed int) {
	if ord == nil {
		return
	}
	title := "退款已处理"
	rows := [][2]string{
		{"退款金额", yuanStr(amount)},
		{"原订单号", ord.OrderNo},
	}
	// 权益变化必须写清楚 —— 用户看到扣钱/掉会员却没有解释是最容易变成工单的一类。
	if creditsReclaimed > 0 {
		rows = append(rows, [2]string{"回收经费", fmt.Sprintf("%d 经费", creditsReclaimed)})
	}
	if membershipRevoked {
		rows = append(rows, [2]string{"会员状态", "已终止"})
	}

	inApp := fmt.Sprintf("您订单 %s 的退款 %s 已处理。", ord.OrderNo, yuanStr(amount))
	switch {
	case membershipRevoked && creditsReclaimed > 0:
		inApp += fmt.Sprintf("同时已终止对应会员权益并回收 %d 经费。", creditsReclaimed)
	case membershipRevoked:
		inApp += "同时已终止对应会员权益。"
	case creditsReclaimed > 0:
		inApp += fmt.Sprintf("同时已回收 %d 经费。", creditsReclaimed)
	}

	s.notify(ord.UserID, title, inApp, utils.EmailContent{
		Title:   title,
		Intro:   "您的订单退款已处理完成。退款到账时间以支付渠道为准(通常 1–7 个工作日)。",
		Rows:    rows,
		CTAText: "查看账户", CTAURL: membershipURL(),
		Note: "如对本次退款有疑问,请通过站内客服联系我们。",
	})
}
