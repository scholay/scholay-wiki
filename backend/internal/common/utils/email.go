// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package utils

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
)

// NormalizeEmail 把邮箱统一为「小写 + trim 空白」,作为持久化和查询的规范形式。
//
// 为什么需要:MySQL 默认 collation 是 utf8mb4_general_ci(大小写不敏感),但这是
// 部署级配置,不能依赖 —— 业务代码必须在自己这一层显式处理。否则:
//   - alice@example.com 与 Alice@Example.com 会被视为两个独立账号
//   - GitHub OAuth 回调 email 大小写与原注册不一致 → 合并失败,重建账号
//
// 规则刻意保守:只 lower + trim,不动 +-tag 与子域 (alice+spam@gmail.com 仍是独立账号),
// 避免误伤一类合法用户场景。
//
// 所有 user 仓库的 FindByEmail / Create / Update / FindVerificationCode 都过这一层。
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// EmailConfig represents email configuration
type EmailConfig struct {
	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPassword string
	FromEmail    string
	FromName     string
}

// SendEmailWithTLS sends email with TLS/SSL support
// Supports both STARTTLS (port 587) and SMTPS (port 465)
func SendEmailWithTLS(config EmailConfig, to []string, subject, body string) error {
	addr := fmt.Sprintf("%s:%d", config.SMTPHost, config.SMTPPort)

	// Prepare email message
	message := fmt.Sprintf("To: %s\r\n"+
		"From: %s <%s>\r\n"+
		"Subject: %s\r\n"+
		"MIME-version: 1.0;\r\n"+
		"Content-Type: text/html; charset=\"UTF-8\";\r\n"+
		"\r\n"+
		"%s\r\n",
		to[0], config.FromName, config.FromEmail, subject, body)

	// TLS configuration
	tlsConfig := &tls.Config{
		ServerName: config.SMTPHost,
	}

	// Port 465: Use SMTPS (SSL from start)
	if config.SMTPPort == 465 {
		conn, err := tls.Dial("tcp", addr, tlsConfig)
		if err != nil {
			return fmt.Errorf("failed to connect via SSL: %w", err)
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, config.SMTPHost)
		if err != nil {
			return fmt.Errorf("failed to create SMTP client: %w", err)
		}
		defer client.Close()

		// Authenticate
		auth := smtp.PlainAuth("", config.SMTPUser, config.SMTPPassword, config.SMTPHost)
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("authentication failed: %w", err)
		}

		// Set sender
		if err = client.Mail(config.FromEmail); err != nil {
			return fmt.Errorf("failed to set sender: %w", err)
		}

		// Set recipients
		for _, recipient := range to {
			if err = client.Rcpt(recipient); err != nil {
				return fmt.Errorf("failed to set recipient: %w", err)
			}
		}

		// Send message
		w, err := client.Data()
		if err != nil {
			return fmt.Errorf("failed to send DATA command: %w", err)
		}
		_, err = w.Write([]byte(message))
		if err != nil {
			return fmt.Errorf("failed to write message: %w", err)
		}
		err = w.Close()
		if err != nil {
			return fmt.Errorf("failed to close message writer: %w", err)
		}

		return client.Quit()
	}

	// Port 587 or others: Use STARTTLS
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, config.SMTPHost)
	if err != nil {
		return fmt.Errorf("failed to create SMTP client: %w", err)
	}
	defer client.Close()

	// Start TLS
	if err = client.StartTLS(tlsConfig); err != nil {
		return fmt.Errorf("failed to start TLS: %w", err)
	}

	// Authenticate
	auth := smtp.PlainAuth("", config.SMTPUser, config.SMTPPassword, config.SMTPHost)
	if err = client.Auth(auth); err != nil {
		return fmt.Errorf("authentication failed (user: %s, host: %s, port: %d): %w", config.SMTPUser, config.SMTPHost, config.SMTPPort, err)
	}

	// Set sender
	if err = client.Mail(config.FromEmail); err != nil {
		return fmt.Errorf("failed to set sender: %w", err)
	}

	// Set recipients
	for _, recipient := range to {
		if err = client.Rcpt(recipient); err != nil {
			return fmt.Errorf("failed to set recipient: %w", err)
		}
	}

	// Send message
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("failed to send DATA command: %w", err)
	}
	_, err = w.Write([]byte(message))
	if err != nil {
		return fmt.Errorf("failed to write message: %w", err)
	}
	err = w.Close()
	if err != nil {
		return fmt.Errorf("failed to close message writer: %w", err)
	}

	return client.Quit()
}
