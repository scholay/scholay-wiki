// ============================================================================
// RespondQuotaExceeded —— 「额度耗尽」的统一 HTTP 出口(6010,冻结契约)。
//
// 信封:{code:6010, message:"<友好文案>", data:{quota:{reset_at:"<RFC3339,无窗口时空串>",
// window_days:<int>, credit_balance_positive:<bool>, credit_autopay:<bool>}}};
// HTTP 状态由 6010 推导为 429(见 utils.httpStatusFromCode)。
// 所有把 vip.ErrQuotaExceeded 映射成 6010 的 handler(peerreview / prism / ai translate /
// matrix …)一律走这里,别再各自手搓 utils.SafeError —— 那会丢结构化 quota 载荷。
// ============================================================================

package vip

import (
	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"
)

// RespondQuotaExceeded 把一个 quota 错误写成 6010/429 响应。
// err 的文案由 NewQuotaError* 构造,本就是给用户看的友好中文,直接透出;
// 结构化字段缺失(旧位点 / 非本包构造)时降级为无 data 的 6010,前端兼容 quota 缺失。
func RespondQuotaExceeded(c *gin.Context, err error) {
	msg := "AI 额度已用完。"
	if err != nil {
		msg = err.Error()
	}
	if d, ok := QuotaDetailsFrom(err); ok {
		utils.ErrorWithData(c, errcode.AgentQuotaExceeded, msg, gin.H{"quota": d.Payload()})
		return
	}
	utils.Error(c, errcode.AgentQuotaExceeded, msg)
}
