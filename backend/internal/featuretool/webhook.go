// ============================================================================
// 功能广场 —— Webhook 派发
//
// 工具 增/改/删 → 异步推送 {event, tool, timestamp} 到所有启用的 webhook 订阅,
// 带 HMAC-SHA256 签名 (X-Scholay-Signature: sha256=<hex>), 每次投递落
// feature_tool_webhook_deliveries, 并回写 webhook.last_status。
//
// 异步 (safego, 带 recover) —— 下游慢/挂不影响主流程。下游 (discourse 等) 收到后
// 自行同步成对应帖子。
// ============================================================================

package featuretool

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"scholar-backend/internal/common/httpclient"
	"scholar-backend/internal/common/safego"
)

// 事件类型
const (
	EventCreated = "created"
	EventUpdated = "updated"
	EventDeleted = "deleted"
)

// WebhookPayload 推给下游的报文。deleted 事件 Tool 可能只含 id/slug。
type WebhookPayload struct {
	Event     string `json:"event"`
	Timestamp string `json:"timestamp"`
	Tool      *Tool  `json:"tool"`
}

// Dispatcher 负责把工具变更派发给下游订阅。
type Dispatcher struct {
	repo *Repository
}

func NewDispatcher(repo *Repository) *Dispatcher { return &Dispatcher{repo: repo} }

// Dispatch 异步把一次工具变更推给所有启用 + 订阅了该事件的 webhook。
// 非阻塞: 立即返回, 实际投递在后台 goroutine。
func (d *Dispatcher) Dispatch(event string, tool *Tool) {
	safego.Go("featuretool.webhook.dispatch", func() {
		hooks, err := d.repo.EnabledWebhooks()
		if err != nil {
			slog.Error("featuretool webhook: list enabled failed", "err", err)
			return
		}
		if len(hooks) == 0 {
			return
		}
		payload := WebhookPayload{Event: event, Timestamp: time.Now().Format(time.RFC3339), Tool: tool}
		body, err := json.Marshal(payload)
		if err != nil {
			slog.Error("featuretool webhook: marshal failed", "err", err)
			return
		}
		for i := range hooks {
			h := hooks[i]
			if !subscribed(h.Events, event) {
				continue
			}
			d.deliver(&h, event, tool, body)
		}
	})
}

// subscribed events 为空表示订阅全部事件。
func subscribed(events []string, event string) bool {
	if len(events) == 0 {
		return true
	}
	for _, e := range events {
		if e == event {
			return true
		}
	}
	return false
}

// deliver 同步投递一次 (已在后台 goroutine 内), 记录结果。
func (d *Dispatcher) deliver(h *Webhook, event string, tool *Tool, body []byte) {
	del := &WebhookDelivery{
		WebhookID:   h.ID,
		Event:       event,
		Attempt:     1,
		RequestBody: truncate(string(body), 60000),
	}
	if tool != nil {
		id := tool.ID
		del.ToolID = &id
	}

	req, err := http.NewRequest(http.MethodPost, h.URL, bytes.NewReader(body))
	if err != nil {
		d.record(h, del, "failed", 0, "", fmt.Sprintf("build request: %v", err))
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Scholay-FeatureTool-Webhook/1.0")
	req.Header.Set("X-Scholay-Event", event)
	if h.Secret != "" {
		mac := hmac.New(sha256.New, []byte(h.Secret))
		mac.Write(body)
		req.Header.Set("X-Scholay-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	}

	// Restricted: 拨号层拦截内网/环回/metadata 段(URL 由 admin 配置,防 SSRF)。
	resp, err := httpclient.Restricted(15 * time.Second).Do(req)
	if err != nil {
		d.record(h, del, "failed", 0, "", err.Error())
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))

	status := "success"
	errMsg := ""
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		status = "failed"
		errMsg = fmt.Sprintf("downstream HTTP %d", resp.StatusCode)
	}
	d.record(h, del, status, resp.StatusCode, string(respBody), errMsg)
}

func (d *Dispatcher) record(h *Webhook, del *WebhookDelivery, status string, httpStatus int, respBody, errMsg string) {
	del.Status = status
	del.HTTPStatus = httpStatus
	del.ResponseBody = truncate(respBody, 20000)
	del.Error = truncate(errMsg, 2000)
	if err := d.repo.InsertDelivery(del); err != nil {
		slog.Error("featuretool webhook: insert delivery failed", "err", err, "webhook_id", h.ID)
	}
	if err := d.repo.UpdateWebhookStatus(h.ID, status, errMsg, time.Now()); err != nil {
		slog.Error("featuretool webhook: update status failed", "err", err, "webhook_id", h.ID)
	}
	if status == "failed" {
		slog.Warn("featuretool webhook delivery failed", "webhook_id", h.ID, "url", h.URL, "event", del.Event, "err", errMsg)
	}
}

// TestDeliver 立即同步投递一个测试事件 (admin 在配置页点"测试"), 返回结果供页面显示。
func (d *Dispatcher) TestDeliver(h *Webhook) (int, string, error) {
	payload := WebhookPayload{Event: "test", Timestamp: time.Now().Format(time.RFC3339), Tool: nil}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, h.URL, bytes.NewReader(body))
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Scholay-Event", "test")
	if h.Secret != "" {
		mac := hmac.New(sha256.New, []byte(h.Secret))
		mac.Write(body)
		req.Header.Set("X-Scholay-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	}
	resp, err := httpclient.Restricted(15 * time.Second).Do(req)
	if err != nil {
		_ = d.repo.UpdateWebhookStatus(h.ID, "failed", err.Error(), time.Now())
		return 0, "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	status := "success"
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		status = "failed"
	}
	_ = d.repo.UpdateWebhookStatus(h.ID, status, "", time.Now())
	return resp.StatusCode, string(respBody), nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
