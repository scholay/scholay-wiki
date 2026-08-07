// ============================================================================
// agentattach — 附件统一取回 / 删除端点(0112 耐久化)
//
//	GET    /api/v1/user/attachment/:uuid              取回(图片内联 / 其余下载)
//	DELETE /api/v1/user/attachment/:uuid?scope=...    session=只删 cwd 副本 | permanent=永久删
//
// 🔴 为什么主入口按 **uuid** 而不是行 id:历史回放里前端只有 journal 那条 @"path"
// (agent-history.ts 从 basename 剥 UUID 前缀),里面天然带 uuid、没有行 id。按 uuid 取
// ⇒ **存量 journal 零改造**,而且四个 feature 共用同一条 URL(不再是四份 per-feature 镜像)。
//
// 这一条路由同时修掉三个既有缺口(01-uploads.md §4.2/4.3/4.4):
//   ① stat_lab / sci_draw / boltslides 的 `/session/file` **后端从没注册过**,而前端无差别
//      拼该 URL ⇒ stat_lab 用户传的截图在自己气泡里必裂图;
//   ② 跨会话物化落 uploads/,而 claw/smart_search 前端只发 basename ⇒ 复用的图必 404;
//   ③ 非图片附件(PDF/docx/csv)此前**完全取不回来**(取图代理硬性要求 previewType=="image")。
// 现在三者都与「cwd 里还有没有这个文件」彻底解耦 —— 字节从 MinIO 出。
// ============================================================================

package agentattach

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentattachstore"
	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/storage"
)

// RespondUploadError —— 四个 feature 上传 handler 共用的错误应答。
//
// 存在的理由:上传的错误里**只有配额那一种**需要前端做出不同的动作(打开附件管理去删文件),
// 其余(类型不支持 / 超大 / 推送失败)都只是文案。把这个分流写在一处,而不是让 claw /
// smart_search / stat_lab / prism 各判一次 —— 四份镜像里漏掉一份,那个 feature 的用户
// 撞到配额就又回到「有报错、没出路」的老状态,而且不会有任何红灯。
func RespondUploadError(c *gin.Context, fallbackCode int, err error) {
	if errors.Is(err, ErrUserAttachmentQuota) {
		utils.Error(c, errcode.AttachmentQuotaExceeded, err.Error())
		return
	}
	utils.SafeError(c, fallbackCode, err)
}

// ExecutorResolver —— 按 feature_key 取该 feature 的 agent 执行客户端。
// 删除入口要删会话 cwd 里的那份工作副本,而附件行只记了 feature_key,不持有 bridge。
// 鸭子类型注入(bootstrap 一个闭包),避免 agentattach 反向依赖各 feature 包。
type ExecutorResolver func(featureKey string) agent.Executor

// ServeHandler —— feature 无关的附件端点。全仓只此一份(不再造 per-feature 镜像)。
type ServeHandler struct {
	store   Store
	execFor ExecutorResolver
}

func NewServeHandler(store Store) *ServeHandler {
	return &ServeHandler{store: store}
}

// WithExecutorResolver 注入 cwd 副本删除能力(缺省时 scope=session 退化为只改 DB 标记)。
func (h *ServeHandler) WithExecutorResolver(fn ExecutorResolver) *ServeHandler {
	h.execFor = fn
	return h
}

func (h *ServeHandler) st() Store { return resolveStore(h.store) }

// lookup —— 端点公共前置:参数 + 归属 + 软删语义。返回 nil 表示已写响应。
//
// 越权与不存在**都回 404**(防枚举):附件是用户原始数据,能区分「存在但不是你的」
// 就是一个存在性预言机。
//
// legacyFallback=true(仅 GET)时,「查不到行」会 302 到调用方随 ?fb= 带来的老取图代理
// —— 见 redirectLegacy 的注释,这一条是**存量历史不裂图**的全部依仗。
func (h *ServeHandler) lookup(c *gin.Context, legacyFallback bool) *agentattachstore.Attachment {
	st := h.st()
	userID := c.GetUint("user_id")
	attUUID := strings.ToLower(strings.TrimSpace(c.Param("uuid")))
	if attUUID == "" || UUIDFromStoredName(attUUID+"-x") == "" {
		// 借用同一条正则做形状校验:非 UUID 形状直接 400,不去打 DB。
		utils.BadRequest(c, "invalid attachment id")
		return nil
	}
	if st == nil || !objects.Enabled() {
		// 耐久化未装配 / MinIO 未启用(dev 常态、或线上 MinIO 暂时不可用):
		// 这条路上**每一个**附件都查不到,没有回落就是全站附件同时裂图。
		if legacyFallback && h.redirectLegacy(c) {
			return nil
		}
		utils.NotFoundWithCode(c, 4404, "文件不存在或不属于你")
		return nil
	}
	row, err := st.GetByUUID(attUUID, uint64(userID))
	if err != nil {
		if errors.Is(err, agentattachstore.ErrNotFound) {
			// 存量附件(0112 之前上传的)落这里:它们的落盘名同样带 UUID 前缀,
			// 所以前端**无法**在客户端分辨新旧 —— 回落只能由这里做。
			if legacyFallback && h.redirectLegacy(c) {
				return nil
			}
			utils.NotFoundWithCode(c, 4404, "文件不存在或不属于你")
			return nil
		}
		utils.InternalError(c, 5000, "文件读取失败,请稍后重试", err)
		return nil
	}
	if row.DeletedAt != nil {
		// 410 而不是 404:journal 里的 @"path" 是永久的,chip 永远还在。能说清「你自己删了」
		// 才不是「无解释的裂图」—— 这正是软删列存在的理由。
		utils.ErrorWithStatus(c, http.StatusGone, 4410, "该文件已被删除")
		return nil
	}
	return row
}

// redirectLegacy —— 「这个 uuid 在 agent_attachments 里没有行」时,302 到调用方指定的
// 老 per-feature 取图代理。写了响应返回 true。
//
// 🔴 为什么必须有这一步(差点上线的回归):落盘名 `<uuid>-<原名>` 的格式**一直如此**,
// 0112 之前上传的附件同样剥得出 UUID。前端只看路径,分辨不出「这个 uuid 有没有 DB 行」,
// 于是所有存量历史里的图片都会被指向本端点 → 404 → 缩略图全线裂开(改造前它们是好的)。
// 唯一知道答案的是后端,所以回落收在这里:调用方把它原本要用的老代理 URL 放进 ?fb=,
// 查不到行就把请求交还给它。<img> / fetch / lightbox 都会自动跟随 302,前端零改动。
//
// 安全:**只接受本站已鉴权前缀下的老取图代理形状**。目标同源、同一套 UserAuthMiddleware、
// 且自身还会再做一次会话归属校验 —— 不构成开放重定向,也拿不到本端点之外的任何权限。
func (h *ServeHandler) redirectLegacy(c *gin.Context) bool {
	fb := strings.TrimSpace(c.Query("fb"))
	if fb == "" || len(fb) > 512 {
		return false
	}
	// 同源绝对路径 + 固定前缀(顺带排除 "//host" 协议相对形式)。
	if !strings.HasPrefix(fb, legacyFallbackPrefix) {
		return false
	}
	// 只允许老取图代理这一种形状:既防被当成通用跳板,也防跳回本端点自己形成 302 循环。
	if !strings.Contains(fb, "/session/file") || strings.Contains(fb, "/attachment/") {
		return false
	}
	if strings.ContainsAny(fb, "\\\r\n") || strings.Contains(fb, "://") {
		return false
	}
	// 302 本身不许被缓存:同一个 URL 在附件补录/迁移之后应当改为直接命中耐久层。
	c.Header("Cache-Control", "no-store")
	c.Redirect(http.StatusFound, fb)
	return true
}

// legacyFallbackPrefix —— 回落目标必须落在用户已鉴权的 API 前缀下。
const legacyFallbackPrefix = "/api/v1/user/"

// Download — GET /user/attachment/:uuid
//
// 鉴权走 UserAuthMiddleware(<img> 发不了 Bearer,靠已支持的 scholay_token cookie,
// 与两份老取图代理同款)。
func (h *ServeHandler) Download(c *gin.Context) {
	row := h.lookup(c, true)
	if row == nil {
		return
	}
	if row.StorageKey == "" {
		// MinIO 未启用时上传的行(降级路径)不会有 key —— 字节只在会话 cwd,
		// 与存量附件同一种处境,同样交还给老代理。
		if h.redirectLegacy(c) {
			return
		}
		utils.NotFoundWithCode(c, 4404, "文件不存在或不属于你")
		return
	}

	mime := row.Mime
	if mime == "" {
		mime = "application/octet-stream"
	}
	c.Header("X-Content-Type-Options", "nosniff")
	// 光栅图白名单内联,其余一律 attachment。理由与 image.go / claw artifact 同款:
	// SVG / HTML 内联在同源下 = 存储型 XSS(能读 auth_token)。SVG 在上传口已拒,这里再拒一次
	// —— 两道独立的闸,上传口的白名单以后放宽时不至于连带把这里打开。
	// 子资源加载(<img> / fetch / pdf.js XHR)忽略 Content-Disposition,故预览不受影响。
	if !(row.AttType == "image" && allowedRasterMIME[strings.ToLower(strings.TrimSpace(mime))]) {
		c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+url.PathEscape(row.Filename))
	}
	// 🔴 **不能用 immutable**。字节确实与 uuid 一一对应、永不变(那是 immutable 的前提),
	// 但这条资源还有第二种状态变化:**用户永久删除**。`max-age=31536000, immutable` 的语义
	// 是「一年内不回源校验」,于是用户点了删除、后端也回 410 了,他自己的浏览器却还能把这张图
	// 显示一年 —— 删除权在观感上失效。这与「改品牌静态资产必须换 URL」是同一个机制,只是这里
	// 换不了 URL(uuid 就是身份,历史 journal 里写死了)。
	//
	// 改成 no-cache = **每次都重校验**,但 ServeObject 会带 ETag,未变即 304 空体
	// (几百字节 + 一次 StatObject),缩略图列表的代价可以接受;换来的是删除立刻生效。
	c.Header("Cache-Control", "private, no-cache")

	// 预算来自 c.Request.Context():APITimeoutMiddleware 的 isObjectServePath 已把
	// /attachment/ 纳入 10min 档。**不要**在这里再套一个短 ctx —— minio 的 Object 与 ctx
	// 绑定,边读边写时 ctx 一到期就把大 PDF 截成一个能打开却损坏的文件(2026-08-07 产物那次)。
	if err := objects.Serve(c.Writer, c.Request, row.StorageKey, mime); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			utils.NotFoundWithCode(c, 4404, "文件已失效")
			return
		}
		// 已经开始写 body 之后的错误(客户端断流)不能再写响应头,只记日志。
		if !c.Writer.Written() {
			utils.InternalError(c, 5000, "文件读取失败,请稍后重试", err)
		}
	}
}

// ─── 列表:撞配额时的自救入口 ───────────────────────────────────────────────

// AttachmentGroupDTO —— 「我的附件」一项。
//
// 🔴 一项 = **一份内容(content_sha256)**,不是一行、也不一定是一个 uuid。
// 因为额度就是按 DISTINCT content_sha256 算的:同一份字节被两个会话引用、或者用户传了两次
// (两个 uuid、同一份字节),占用都只有一份。若按行/按 uuid 罗列,列表里各项的 size 加起来
// 会大于 used —— 用户删掉一项发现只腾出 0 字节,这个界面就等于在骗人。
// 按内容聚合后「删掉这一项 = 腾出 Size 字节」才是真的,前端逐个 uuid 调 DELETE 即可。
type AttachmentGroupDTO struct {
	UUIDs     []string `json:"uuids"`
	Name      string   `json:"name"`
	Type      string   `json:"type"`
	MimeType  string   `json:"mimeType"`
	Size      int64    `json:"size"`
	Sessions  int      `json:"sessions"`
	CreatedAt string   `json:"createdAt"`
}

// AttachmentListDTO —— GET /user/attachments 的响应。
type AttachmentListDTO struct {
	UsedBytes  int64                `json:"usedBytes"`
	LimitBytes int64                `json:"limitBytes"`
	Items      []AttachmentGroupDTO `json:"items"`
}

// List — GET /user/attachments
//
// 这条端点是「附件空间已满」那句错误提示的**落点**。没有它,7010 就又是一句用户执行不了的
// 指引(旧文案「请删除部分历史文件」正是这么坏的)。
func (h *ServeHandler) List(c *gin.Context) {
	st := h.st()
	if st == nil {
		// 耐久化未装配:此时上传也不会计额度,列表恒为空是诚实的答案(不是错误)。
		utils.Success(c, AttachmentListDTO{LimitBytes: maxUserAttachmentBytes, Items: []AttachmentGroupDTO{}})
		return
	}
	userID := uint64(c.GetUint("user_id"))
	rows, err := st.ListLiveByUser(userID, 0)
	if err != nil {
		utils.InternalError(c, 5000, "附件列表读取失败,请稍后重试", err)
		return
	}
	used, serr := st.SumBytesByUser(userID)
	if serr != nil {
		utils.InternalError(c, 5000, "附件列表读取失败,请稍后重试", serr)
		return
	}

	// 按内容聚合。sha 为空的历史/降级行按 uuid 自成一组(它们不计额度,但用户仍该看得见、删得掉)。
	order := make([]string, 0, len(rows))
	groups := make(map[string]*AttachmentGroupDTO, len(rows))
	for i := range rows {
		r := &rows[i]
		key := r.ContentSHA256
		if key == "" {
			key = "uuid:" + r.AttachmentUUID
		}
		g, ok := groups[key]
		if !ok {
			g = &AttachmentGroupDTO{
				Name:      r.Filename,
				Type:      r.AttType,
				MimeType:  r.Mime,
				Size:      r.SizeBytes,
				CreatedAt: r.CreatedAt.Format(time.RFC3339),
			}
			groups[key] = g
			order = append(order, key)
		}
		g.Sessions++
		if !containsStr(g.UUIDs, r.AttachmentUUID) {
			g.UUIDs = append(g.UUIDs, r.AttachmentUUID)
		}
	}

	// ⚠️ 必须显式 make:nil 切片会被 encoding/json 序列化成 null,前端 .map 直接崩
	// (admin DTO 已经踩过一次,见 session-monitor 那条记录)。
	items := make([]AttachmentGroupDTO, 0, len(order))
	for _, k := range order {
		items = append(items, *groups[k])
	}
	utils.Success(c, AttachmentListDTO{UsedBytes: used, LimitBytes: maxUserAttachmentBytes, Items: items})
}

func containsStr(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// Delete — DELETE /user/attachment/:uuid?scope=session|permanent
//
// 补上 01-uploads.md §5.2 记的那个洞:用户此前**没有任何**删除单个附件的入口,
// 而配额满时的文案却是「请删除部分历史文件」—— 一条产品上无法执行的指引。
//
//	scope=session(默认):只删会话 cwd 里的工作副本 + materialized_at=NULL。
//	  字节仍在 MinIO,chip 仍能点开,下次真的要用时自愈重建。**这是腾 cwd 配额的正确动作**。
//	scope=permanent:软删行 + 引用计数归零则删对象 + 删所有 cwd 副本。此后取回端点回 410。
func (h *ServeHandler) Delete(c *gin.Context) {
	// legacyFallback=false:老取图代理只能读会话 cwd,没有删除语义 —— 把一个 DELETE
	// 302 到它,浏览器会把 DELETE 重发成 GET(RFC 7231 的既有行为),用户以为删掉了其实
	// 只是取了一次图。查不到行就诚实回 404。
	row := h.lookup(c, false)
	if row == nil {
		return
	}
	permanent := strings.EqualFold(strings.TrimSpace(c.Query("scope")), "permanent")
	userID := c.GetUint("user_id")
	st := h.st()

	rows, err := st.ListLiveByUUID(row.AttachmentUUID, uint64(userID))
	if err != nil {
		utils.InternalError(c, 5000, "删除失败,请稍后重试", err)
		return
	}
	ctx := c.Request.Context()
	for i := range rows {
		h.dropWorkspaceCopy(ctx, &rows[i])
		if !permanent {
			continue
		}
		if derr := st.SoftDelete(rows[i].ID, uint64(userID)); derr != nil {
			utils.InternalError(c, 5000, "删除失败,请稍后重试", derr)
			return
		}
		deleteObjectIfUnreferenced(ctx, st, uint64(userID), rows[i].ContentSHA256, rows[i].StorageKey, rows[i].ID)
	}
	utils.Success(c, gin.H{"deleted": len(rows), "scope": map[bool]string{true: "permanent", false: "session"}[permanent]})
}

// dropWorkspaceCopy 删一行对应的会话 cwd 工作副本并把 materialized_at 归 NULL。
// best-effort:删不掉只是多占一点会话磁盘,字节的真源在 MinIO,不影响正确性。
func (h *ServeHandler) dropWorkspaceCopy(ctx context.Context, row *agentattachstore.Attachment) {
	if h.execFor != nil {
		if cli := h.execFor(row.FeatureKey); cli != nil {
			if err := cli.DeleteWorkspaceFile(ctx, row.SessionID, row.RelPath); err != nil &&
				!errors.Is(err, agent.ErrSessionNotFound) {
				// 会话早被 GC 了是常态,不是错误。
				_ = err
			}
		}
	}
	_ = h.st().MarkMaterialized(row.ID, nil)
}
