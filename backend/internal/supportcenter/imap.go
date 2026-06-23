// ============================================================================
// IMAP 收件箱拉取 —— 用 emersion/go-imap(v1,最成熟的 Go IMAP 库)增量拉取客服邮箱。
//
// 增量策略:按 (account, UIDVALIDITY) 记录已入库最大 UID,每轮只拉 UID > last 的新邮件;
// UIDVALIDITY 变更(服务器重建邮箱)时游标自然归零 → 走首次引导(只拉最近 N 封,防灌爆)。
// 只读 SELECT + BODY.PEEK[]:**不改服务器上的已读状态**(邮箱本体不被我们污染)。
// 正文解析用 emersion/go-message/mail(blank import charset 注册 GBK 等中文编码)。
// ============================================================================

package supportcenter

import (
	"fmt"
	"io"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/emersion/go-imap"
	imapclient "github.com/emersion/go-imap/client"
	_ "github.com/emersion/go-message/charset" // 注册 GBK/GB2312 等字符集解码
	gomail "github.com/emersion/go-message/mail"
)

// bootstrapFetchCount 首次同步(或 UIDVALIDITY 变更)只拉最近 N 封,防止把十年存量灌进库。
const bootstrapFetchCount = 30

// maxBodyBytes 单个正文 part 的读取上限(防超大邮件占库)。
const maxBodyBytes = 2 << 20 // 2MB

// dialIMAP 按配置连接并登录。调用方负责 Logout。
func dialIMAP(cfg *SupportCenterConfig) (*imapclient.Client, error) {
	addr := fmt.Sprintf("%s:%d", cfg.IMAPHost, cfg.IMAPPort)
	var (
		c   *imapclient.Client
		err error
	)
	if cfg.IMAPTLS {
		c, err = imapclient.DialTLS(addr, nil)
	} else {
		c, err = imapclient.Dial(addr)
	}
	if err != nil {
		return nil, fmt.Errorf("连接 IMAP 服务器失败: %w", err)
	}
	if err := c.Login(cfg.IMAPUsername, cfg.IMAPPassword); err != nil {
		_ = c.Logout()
		// 区分"连接被服务器中途掐断"(瞬时,会自愈)与"凭证/配置不对"(持续,需人工)——
		// 否则连接抖动会被一律包成"登录失败(检查账号/密码/授权码)"误导排查方向。
		if isTransientIMAPErr(err) {
			return nil, fmt.Errorf("IMAP 连接中断(将自动重试): %w", err)
		}
		return nil, fmt.Errorf("IMAP 登录失败(检查账号/密码/授权码): %w", err)
	}
	return c, nil
}

// isTransientIMAPErr 判断 IMAP 错误是否瞬时(连接被掐/超时/网络抖动)。瞬时错误会自愈,
// 不该每个轮询周期刷一条 WARN;非瞬时(认证/配置)则需要人工介入,要稳定可见。
// 用字符串嗅探(go-imap v1 不暴露结构化错误类型),覆盖常见网络层文案。
func isTransientIMAPErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	for _, s := range []string{
		"connection closed",
		"connection reset",
		"broken pipe",
		"eof",
		"i/o timeout",
		"timeout",
		"connection refused",
		"no such host",
		"tls handshake",
		"use of closed network connection",
		"network is unreachable",
	} {
		if strings.Contains(msg, s) {
			return true
		}
	}
	return false
}

// TestIMAP 用已保存配置连一次(配置页「测试连接」):登录 + 选 INBOX,回邮件总数。
func (s *Service) TestIMAP() (uint32, error) {
	cfg, err := s.repo.GetConfig()
	if err != nil {
		return 0, err
	}
	if cfg.IMAPHost == "" || cfg.IMAPUsername == "" || cfg.IMAPPassword == "" {
		return 0, fmt.Errorf("IMAP 配置不完整(host/账号/密码)")
	}
	c, err := dialIMAP(cfg)
	if err != nil {
		return 0, err
	}
	defer func() { _ = c.Logout() }()
	mbox, err := c.Select("INBOX", true)
	if err != nil {
		return 0, fmt.Errorf("选择 INBOX 失败: %w", err)
	}
	return mbox.Messages, nil
}

// PollOnce 拉一轮新邮件入库,返回新增封数。未启用/未配置 → (0, nil) 静默跳过。
func (s *Service) PollOnce() (int, error) {
	cfg, err := s.repo.GetConfig()
	if err != nil {
		return 0, err
	}
	if !cfg.IMAPEnabled || cfg.IMAPHost == "" || cfg.IMAPUsername == "" || cfg.IMAPPassword == "" {
		return 0, nil
	}

	c, err := dialIMAP(cfg)
	if err != nil {
		return 0, err
	}
	defer func() { _ = c.Logout() }()

	mbox, err := c.Select("INBOX", true) // readonly:不动服务器已读标记
	if err != nil {
		return 0, fmt.Errorf("select INBOX: %w", err)
	}
	if mbox.Messages == 0 {
		return 0, nil
	}
	uidValidity := uint64(mbox.UidValidity)
	lastUID, err := s.repo.MaxUID(cfg.IMAPUsername, uidValidity)
	if err != nil {
		return 0, err
	}

	section := &imap.BodySectionName{Peek: true}
	items := []imap.FetchItem{imap.FetchEnvelope, imap.FetchUid, section.FetchItem()}
	messages := make(chan *imap.Message, 16)
	done := make(chan error, 1)

	seqset := new(imap.SeqSet)
	if lastUID == 0 {
		// 首次同步:按序号取最近 N 封。
		from := uint32(1)
		if mbox.Messages > bootstrapFetchCount {
			from = mbox.Messages - bootstrapFetchCount + 1
		}
		seqset.AddRange(from, mbox.Messages)
		go func() { done <- c.Fetch(seqset, items, messages) }()
	} else {
		// 增量:UID > last(stop=0 即 "*")。
		seqset.AddRange(uint32(lastUID+1), 0)
		go func() { done <- c.UidFetch(seqset, items, messages) }()
	}

	type newMail struct{ fromName, fromAddr, subject, snippet string }
	var newMails []newMail
	for msg := range messages {
		uid := uint64(msg.Uid)
		if uid == 0 || uid <= lastUID && lastUID > 0 {
			continue // UID range 边界回带(部分服务器把 last 本身也回出来)
		}
		row := parseMailMessage(msg, section)
		if row == nil {
			continue
		}
		row.Account = cfg.IMAPUsername
		row.UIDValidity = uidValidity
		row.UID = uid
		inserted, err := s.repo.InsertIgnore(row)
		if err != nil {
			slog.Warn("supportcenter: inbox insert failed", "uid", uid, "err", err)
			continue
		}
		if inserted {
			newMails = append(newMails, newMail{row.FromName, row.FromAddr, row.Subject, row.Snippet})
		}
	}
	if err := <-done; err != nil {
		return len(newMails), fmt.Errorf("imap fetch: %w", err)
	}

	// 新邮件 → 飞书(1 封发详情;多封发汇总,防刷屏)。
	if n := len(newMails); n == 1 {
		m := newMails[0]
		s.notifyInboundMail(m.fromName, m.fromAddr, m.subject, m.snippet)
	} else if n > 1 {
		lines := []string{fmt.Sprintf("📧 客服邮箱收到 %d 封新邮件", n)}
		for i, m := range newMails {
			if i >= 5 {
				lines = append(lines, fmt.Sprintf("……等共 %d 封", n))
				break
			}
			lines = append(lines, fmt.Sprintf("· %s:%s", m.fromAddr, m.subject))
		}
		lines = append(lines, "→ 后台「邮件中心」查看与回复")
		s.notifyFeishu("email", lines)
	}
	return len(newMails), nil
}

// parseMailMessage 把一条 IMAP 消息解析成入库行(头部解码 + 正文 text/html 抽取)。
// 解析失败尽量降级(envelope 兜底),返回 nil 表示彻底没法用。
func parseMailMessage(msg *imap.Message, section *imap.BodySectionName) *MailInbox {
	row := &MailInbox{Status: "unread"}

	// envelope 兜底(主题/发件人/时间)。
	if env := msg.Envelope; env != nil {
		row.Subject = env.Subject
		if !env.Date.IsZero() {
			d := env.Date
			row.SentAt = &d
		}
		row.MessageID = env.MessageId
		if len(env.From) > 0 {
			row.FromName = env.From[0].PersonalName
			row.FromAddr = env.From[0].Address()
		}
		var tos []string
		for _, a := range env.To {
			tos = append(tos, a.Address())
		}
		row.ToAddr = strings.Join(tos, ", ")
	}

	body := msg.GetBody(section)
	if body == nil {
		if row.Subject == "" && row.FromAddr == "" {
			return nil
		}
		return row
	}
	mr, err := gomail.CreateReader(body)
	if err != nil {
		slog.Debug("supportcenter: mail parse failed, envelope only", "err", err)
		return row
	}
	// 头部(go-message 会解 RFC2047 编码词 + charset)。
	if subj, err := mr.Header.Subject(); err == nil && subj != "" {
		row.Subject = subj
	}
	if from, err := mr.Header.AddressList("From"); err == nil && len(from) > 0 {
		row.FromName = from[0].Name
		row.FromAddr = from[0].Address
	}
	if t, err := mr.Header.Date(); err == nil && !t.IsZero() {
		row.SentAt = &t
	}
	if mid, err := mr.Header.MessageID(); err == nil && mid != "" {
		row.MessageID = mid
	}

	// 正文:第一个 text/plain 与第一个 text/html;附件跳过(收件箱只管正文)。
	for {
		p, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			break // 部分损坏的 MIME,保住已解析的
		}
		if _, ok := p.Header.(*gomail.InlineHeader); !ok {
			continue
		}
		ct, _, _ := p.Header.(*gomail.InlineHeader).ContentType()
		b, _ := io.ReadAll(io.LimitReader(p.Body, maxBodyBytes))
		switch {
		case strings.HasPrefix(ct, "text/plain") && row.TextBody == "":
			row.TextBody = string(b)
		case strings.HasPrefix(ct, "text/html") && row.HTMLBody == "":
			row.HTMLBody = string(b)
		}
	}

	row.Snippet = makeSnippet(row.TextBody, row.HTMLBody)
	if row.Subject == "" {
		row.Subject = "(无主题)"
	}
	return row
}

var htmlTagRe = regexp.MustCompile(`(?s)<style.*?</style>|<script.*?</script>|<[^>]*>`)
var spaceRe = regexp.MustCompile(`\s+`)

// makeSnippet 列表预览:优先纯文本;只有 HTML 时粗剥标签。截 200 字。
func makeSnippet(text, html string) string {
	src := text
	if strings.TrimSpace(src) == "" && html != "" {
		src = htmlTagRe.ReplaceAllString(html, " ")
	}
	src = strings.TrimSpace(spaceRe.ReplaceAllString(src, " "))
	r := []rune(src)
	if len(r) > 200 {
		return string(r[:200]) + "…"
	}
	return src
}

// StartPoller 启动后台轮询(每分钟 tick,按配置的间隔节流;配置改间隔即时生效,无需重启)。
// ctx 取消即退出。注册见 cmd/server/background.go。
func (s *Service) StartPoller(stop <-chan struct{}) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	var lastRun time.Time
	var consecutiveFail int // 连续失败计数:抑制每个周期刷同一条 WARN,并在恢复时打点
	slog.Info("supportcenter: IMAP poller started")
	for {
		select {
		case <-ticker.C:
			cfg, err := s.repo.GetConfig()
			if err != nil || !cfg.IMAPEnabled {
				continue
			}
			interval := time.Duration(cfg.IMAPPollMinutes) * time.Minute
			if interval < time.Minute {
				interval = time.Minute
			}
			if time.Since(lastRun) < interval {
				continue
			}
			lastRun = time.Now()
			n, err := s.PollOnce()
			if err != nil {
				consecutiveFail++
				logIMAPPollFailure(err, consecutiveFail)
				continue
			}
			if consecutiveFail > 0 {
				slog.Info("supportcenter: imap poll recovered", "after_failures", consecutiveFail)
				consecutiveFail = 0
			}
			if n > 0 {
				slog.Info("supportcenter: imap poll done", "new_mails", n)
			}
		case <-stop:
			slog.Info("supportcenter: IMAP poller stopped")
			return
		}
	}
}

// logIMAPPollFailure 按"瞬时 vs 认证/配置"两类分级,避免每个轮询周期刷同一条 WARN:
//   - 瞬时(连接被掐/超时/网络抖动):首次 WARN 提示,之后 DEBUG;长期不愈(每 60 次失败)
//     再 WARN 一次,防止根因其实不瞬时(如授权码过期表现为断连)被永久淹没。
//   - 认证/配置(账号/密码/授权码/IMAP 开关不对):持续存在且不会自愈 → 首次 + 每 30 次
//     失败打一条 ERROR,带明确处置指引;其余降 DEBUG。
func logIMAPPollFailure(err error, consecutive int) {
	if isTransientIMAPErr(err) {
		switch {
		case consecutive == 1:
			slog.Warn("supportcenter: imap poll failed (transient, auto-retry)", "err", err)
		case consecutive%60 == 0:
			slog.Warn("supportcenter: imap poll still failing", "err", err, "consecutive", consecutive)
		default:
			slog.Debug("supportcenter: imap poll failed (transient)", "err", err, "consecutive", consecutive)
		}
		return
	}
	if consecutive == 1 || consecutive%30 == 0 {
		slog.Error("supportcenter: imap login/config error — 检查邮箱账号/密码/授权码或 IMAP 是否开启",
			"err", err, "consecutive", consecutive)
	} else {
		slog.Debug("supportcenter: imap poll failed (config error, alert suppressed)", "err", err, "consecutive", consecutive)
	}
}
