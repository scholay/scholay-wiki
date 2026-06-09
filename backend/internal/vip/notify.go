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

// tierDisplayName 套餐展示名。
func tierDisplayName(tier string) string {
	if tier == TierMax {
		return "Max 套餐"
	}
	return "Pro 套餐"
}

func yuanStr(f float64) string { return fmt.Sprintf("¥%.2f", f) }

// notifyOrderFulfilled 支付成功(充值 / 订阅 / 续期 / 升级)后通知。
func (s *Service) notifyOrderFulfilled(ord *Order) {
	switch ord.OrderType {
	case "recharge":
		title := "经费充值成功"
		inApp := fmt.Sprintf("您充值的 %d 永久科研经费已到账,可用于随时重置每日额度。", ord.CreditsGranted)
		s.notify(ord.UserID, title, inApp, utils.EmailContent{
			Title: title,
			Intro: "您的科研经费充值已成功到账。永久经费长期有效、不会过期,可随时用于重置当日 AI 额度。",
			Rows: [][2]string{
				{"充值金额", yuanStr(ord.FinalAmount)},
				{"到账经费", fmt.Sprintf("%d 永久经费", ord.CreditsGranted)},
				{"订单号", ord.OrderNo},
			},
			CTAText: "查看账户资产", CTAURL: membershipURL(),
		})
	case "subscription":
		name := tierDisplayName(ord.PlanCode)
		var title, verb string
		switch ord.SubAction {
		case "renew":
			title, verb = name+"续期成功", "续期"
		case "upgrade":
			title, verb = "已升级到 "+name, "升级"
		default:
			title, verb = name+"开通成功", "开通"
		}
		exp := ""
		if ord.NewExpiresAt != nil {
			exp = ord.NewExpiresAt.Format("2006-01-02")
		}
		rows := [][2]string{{"会员套餐", name}, {"有效期至", exp}}
		note := ""
		if ord.CreditsGranted > 0 {
			if ord.SubAction == "renew" {
				rows = append(rows, [2]string{"赠送经费", fmt.Sprintf("%d 经费(下一周期发放)", ord.CreditsGranted)})
				note = "续期赠送的经费将在下一计费周期开始时自动发放并生效,本周期额度与经费不变。"
			} else {
				rows = append(rows, [2]string{"赠送经费", fmt.Sprintf("%d 经费", ord.CreditsGranted)})
			}
		}
		rows = append(rows, [2]string{"支付金额", yuanStr(ord.FinalAmount)}, [2]string{"订单号", ord.OrderNo})
		inApp := fmt.Sprintf("您的 %s 已%s,有效期至 %s。", name, verb, exp)
		s.notify(ord.UserID, title, inApp, utils.EmailContent{
			Title:   title,
			Intro:   fmt.Sprintf("感谢您订阅 %s 会员!您的 %s 已%s,以下是本次订单详情:", utils.EmailBrandName, name, verb),
			Rows:    rows,
			CTAText: "查看会员权益", CTAURL: membershipURL(),
			Note: note,
		})
	}
}

// notifyRedeem 兑换码激活成功(会员 / 经费)后通知。
func (s *Service) notifyRedeem(userID uint, r *RedeemResult) {
	if r == nil {
		return
	}
	if r.Kind == GrantKindCredit {
		kindCN := "临时"
		if r.CreditKind == CreditKindPerm {
			kindCN = "永久"
		}
		title := "经费兑换成功"
		inApp := fmt.Sprintf("兑换成功!%d %s科研经费已到账。", r.Credits, kindCN)
		s.notify(userID, title, inApp, utils.EmailContent{
			Title:   title,
			Intro:   "您的兑换码已成功激活,科研经费已到账。",
			Rows:    [][2]string{{"到账经费", fmt.Sprintf("%d %s经费", r.Credits, kindCN)}},
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
