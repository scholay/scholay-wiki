// ============================================================================
// agentattach — agent 会话「附件」通用实现:文件上传(方案 B: 推原始文件给 agent)
//
// 泛化动机 (2026-07-14 三 feature 输入框统一): 上传 / 引用文献原先是 claw 专属实现
// (internal/claw/upload.go + references.go), 但它只依赖 agentbridge.FeatureBridge
// (get-or-create 会话 + AgentClient 推文件) 与 library.Reader, 本质 feature 无关。
// 抽到本包后 claw / smart_search / prism 共用同一份校验、限额、落盘、物化逻辑,
// 各 feature handler 只剩薄委托 (路由 + 响应包装), 行为与 DTO 形状对 claw 100% 不变。
//
// 不在 backend 做任何文本抽取 / OCR / base64 inline。流程:
//
//   1. multipart 收文件 → 校验类型 + 大小
//   2. 解析目标会话: 请求带 session_id → 校验归属; 为空 → 走 feature 各自的
//      空会话策略 (claw: 新建会话 = "添加文件即开会话"; smart_search: 复用唯一会话;
//      prism: 不走这条路, 由 handler 按 project 解析后调 UploadToSession)
//   3. PushSessionFile 把原始字节 POST 给 agent /api/sessions/:id/files,
//      agent 写进 ~/sessions/<sessionId>/ 并回落盘绝对路径
//   4. 返回 { sessionId, path, type, name, mimeType, size } 给前端;
//      前端把它放进下一条 user_message.attachments[].path, agent 端按类型读:
//      图片 → base64 直嵌 vision; 纯文本 → Read; PDF/docx/xlsx/pptx/odt/rtf →
//      ReadDocument (pdftotext/pandoc 抽文本, 全 feature 可用, 不依赖 Bash)。
//
// 为什么不抽文本:
//   - agent 执行器有安全受限的 ReadDocument (固定 argv 转换器) + 图片 vision 通道,
//     让大模型在会话内按需读比 backend 预抽取信息损失小、能力强。
//   - backend 不碰文件内容 → 无 pdfparse 依赖、无 80K 截断、无 base64 撑爆 context。
//
// 白名单原则 (2026-07 文件上传调研): **收 = 能读**。凡容器内没有解析路径的格式
// (旧版 doc/xls/ppt、ods/odp、bmp、svg) 一律在入口拒收并给出用户可执行的指引,
// 绝不让"传上去了 AI 却打不开"的断层发生。
//
// 限制 (仍然要前端预校验, 改这里同步各 feature 的 Composer):
//   - 图片 ≤ 5MB  (Anthropic vision 单图硬上限, 超了 agent 调模型时会 400)
//   - 文件 ≤ 30MB (扫描版大 PDF 留余量; 真正瓶颈是模型 context, 由 agent 侧把控)
// ============================================================================

package agentattach

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/google/uuid"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentattachstore"
	"scholar-backend/internal/agentbridge"
)

const (
	MaxFileBytes    = 30 * 1024 * 1024
	MaxImageBytes   = 5 * 1024 * 1024
	pushFileTimeout = 30 * time.Second
)

// AttachmentDTO — 返给前端的统一附件结构 (方案 B)。
// 前端只需把 path 放进 user_message.attachments[].path; sessionId 用于"添加文件即开会话"
// 场景下前端 adopt 这个新会话 (历史会话上传时 sessionId 不变)。
// ⚠️ 字段名是前端契约 (sessionId/type/name/mimeType/size/path), 三 feature 共用, 不可改。
//
// UUID/ID 是 0112 耐久化新增的**加法**字段:前端拿 uuid 就能拼统一取回端点
// GET /user/attachment/:uuid。缺省为空 = MinIO 未启用的降级路径,前端回落老的 per-feature
// session/file 代理(见 ⑨ 前向兼容)。老客户端不读这两个字段,不受影响。
type AttachmentDTO struct {
	SessionID string `json:"sessionId"`
	Type      string `json:"type"` // "image" | "file"
	Name      string `json:"name"`
	MimeType  string `json:"mimeType"`
	Size      int64  `json:"size"`
	Path      string `json:"path"`           // agent 容器内绝对路径 (会话隔离 cwd 下)
	UUID      string `json:"uuid,omitempty"` // 落盘名前缀 = 附件持久身份;取回端点按它反查
	ID        uint64 `json:"id,omitempty"`   // agent_attachments 行 id(有 = 已耐久)
}

// SessionResolver — 请求未带 session_id 时的会话解析策略, feature 语义差异所在:
//   - claw:         FeatureBridge.CreateNewSession ("添加文件 = 开始新会话", 前端 adopt)
//   - smart_search: FeatureBridge.GetOrCreateSession (单会话语义, 复用当前会话)
//
// 签名与 FeatureBridge 的两个方法一致, 装配时直接传方法值即可。
type SessionResolver func(ctx context.Context, userID uint) (string, error)

// Uploader 持有 FeatureBridge, 以便解析会话并通过底层 agent.Client 推送文件。
type Uploader struct {
	feature      *agentbridge.FeatureBridge
	resolveEmpty SessionResolver
	// subdir 落盘子目录(单段,字母数字-_;空 = 会话 cwd 根)。prism 传 "uploads":
	// 其 cwd 是 LaTeX 文档工作区,附件混进根目录会污染编译面(评审遗留,2026-07-14 补)。
	// executor pushSessionFile 白名单解析文件名里的一层子目录,其余照旧 basename 防穿越。
	subdir string
	// store 覆盖包级默认 store(只有单测用;生产走 SetDefaultStore,见 store.go 的解释)。
	store Store
	// pushFn 覆盖「把字节推进会话 cwd」这一步。抽成字段只为可测:feature 是具体类型
	// (*agentbridge.FeatureBridge),没法伪造,而本次要防的回归恰恰是**双写顺序**
	// (MinIO 先于 cwd)与「cwd 失败后重试不重传」——不给这个缝就一条都断言不了。
	// nil = 走真实 agent 客户端(生产恒为 nil)。
	pushFn func(ctx context.Context, sessionID, relPath string, body []byte) (string, error)
}

// NewUploader — resolveEmpty 为 nil 时默认 CreateNewSession (即 claw 原语义, 保持行为不变)。
func NewUploader(feature *agentbridge.FeatureBridge, resolveEmpty SessionResolver) *Uploader {
	u := &Uploader{feature: feature, resolveEmpty: resolveEmpty}
	if u.resolveEmpty == nil && feature != nil {
		u.resolveEmpty = feature.CreateNewSession
	}
	return u
}

// Feature 暴露底层 FeatureBridge(prism 的取图端点复用它调 GetWorkspaceFile;nil 时表示未注入)。
func (u *Uploader) Feature() *agentbridge.FeatureBridge {
	if u == nil {
		return nil
	}
	return u.feature
}

// WithSubdir 设置落盘子目录(链式;非法段被忽略并回落根目录)。
func (u *Uploader) WithSubdir(dir string) *Uploader {
	if subdirRe.MatchString(dir) {
		u.subdir = dir
	}
	return u
}

// WithStore 覆盖本实例的耐久化 store(单测隔离用;生产走 SetDefaultStore)。
func (u *Uploader) WithStore(s Store) *Uploader {
	u.store = s
	return u
}

var subdirRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,32}$`)

// HandleUpload 是 gin handler 的"业务体", 不负责 HTTP 状态码 (留给各 feature Handler 包装)。
// 返回 error 由调用方转 4xx; 返回 nil + DTO 由调用方包成 200。
//
// 目标会话: 多会话 feature (claw) 里文件必须落到用户当前正在看的那个会话 cwd, 而不是
// "最近活跃"。前端把 activeSessionId 透传过来:
//   - session_id 非空 → 校验归属 (防越权写别人会话), push 到它;
//   - session_id 为空 → 走 resolveEmpty 策略 (新建 / 复用), 返回 sessionId 让前端 adopt。
//
// 校验先行: 类型 / 大小不合格时**不建会话** (与 claw 原实现顺序一致)。
func (u *Uploader) HandleUpload(c *gin.Context, userID uint) (*AttachmentDTO, error) {
	fh, attType, outMime, body, err := parseAndValidateUpload(c)
	if err != nil {
		return nil, err
	}
	sessionID := strings.TrimSpace(c.PostForm("session_id"))
	if sessionID != "" {
		owns, oerr := u.feature.OwnsSession(userID, sessionID)
		if oerr != nil {
			return nil, fmt.Errorf("会话校验失败: %w", oerr)
		}
		if !owns {
			return nil, errors.New("无权访问该会话")
		}
	} else {
		sessionID, err = u.resolveEmpty(c.Request.Context(), userID)
		if err != nil {
			return nil, fmt.Errorf("会话不可用: %w", err)
		}
	}
	return u.pushToSession(c.Request.Context(), userID, sessionID, fh, attType, outMime, body)
}

// UploadToSession — 会话由调用方解析/鉴权好的直通入口 (prism: per-project 会话,
// handler 先按 projectID 校验归属 + ensureProjectSession 拿 sessionID 再调这里)。
// 只做 multipart 校验 + 推送, 不看 session_id 表单字段。
//
// userID 是 0112 耐久化新增的必填参数:附件行的归属列。prism 的会话归属是 project,
// 但**上传的人**永远是一个已鉴权自然人 —— 附件表刻意按 user_id 归属(见 0112 表头注释)。
func (u *Uploader) UploadToSession(c *gin.Context, userID uint, sessionID string) (*AttachmentDTO, error) {
	fh, attType, outMime, body, err := parseAndValidateUpload(c)
	if err != nil {
		return nil, err
	}
	return u.pushToSession(c.Request.Context(), userID, sessionID, fh, attType, outMime, body)
}

// parseAndValidateUpload — multipart 解析 + 类型白名单 + 大小限额 (纯校验, 不碰会话)。
func parseAndValidateUpload(c *gin.Context) (fh *multipart.FileHeader, attType, outMime string, body []byte, err error) {
	if perr := c.Request.ParseMultipartForm(MaxFileBytes); perr != nil {
		// 走到这的超限是路由层 MaxBytesReader (50MB) 在读 body 时触发的, 不是 30MB —— 文案别谎报口径
		// (2026-07 文件上传调研: 旧文案「≤30MB」误导)。
		return nil, "", "", nil, errors.New("上传内容过大或格式错误 (单文件上限: 文件 30MB / 图片 5MB)")
	}
	fh, err = c.FormFile("file")
	if err != nil {
		return nil, "", "", nil, errors.New("缺少 file 字段")
	}
	if fh.Size > MaxFileBytes {
		return nil, "", "", nil, fmt.Errorf("文件大小 %.1fMB 超出上限 %dMB", float64(fh.Size)/1024/1024, MaxFileBytes/1024/1024)
	}

	mime := strings.ToLower(fh.Header.Get("Content-Type"))
	ext := strings.ToLower(filepath.Ext(fh.Filename))

	// SVG 安全限制: SVG 可含 <script>, 历史回放代理若按 image/svg+xml 内联会变同源 XSS。
	// 入口直接拒 —— 不论它被嗅探成图片还是当成 XML 文本分类 (proxy 侧白名单是最终兜底)。
	if ext == ".svg" || mime == "image/svg+xml" {
		return nil, "", "", nil, errors.New("暂不支持 SVG 文件 (安全限制)")
	}

	// BMP: Anthropic vision 的 media_type 白名单只有 jpeg/png/gif/webp (agent attachments.ts 同款),
	// 收了也嵌不进模型 (静默丢) —— 收口在上传层, 给用户明确指引 (2026-07 文件上传调研)。
	if ext == ".bmp" || mime == "image/bmp" {
		return nil, "", "", nil, errors.New("暂不支持 BMP 图片, 请转换为 PNG / JPG 后上传")
	}

	// 旧版 Office (doc/xls/ppt) 与 OpenDocument 表格/演示 (ods/odp): 容器内没有任何解析器
	// (pandoc 只读 docx/xlsx/pptx/odt 系), 收了必然读不了 —— 上传口拒收并引导另存为新格式,
	// 别让用户传完才发现 AI 打不开 (2026-07 文件上传调研: "收了读不了"体验断层)。
	// ⚠️ 只按**扩展名**拒 (审查修正): mime 不可作为单独拒收依据 —— Windows 装 Excel/WPS 后
	// 注册表把 .csv 映射成 application/vnd.ms-excel、.docx 映射成 application/msword,
	// 按 mime 拒会把这些合法文件全杀。legacy mime 只在扩展名不认识时于 default 分支兜底。
	if isLegacyOfficeExt(ext) {
		return nil, "", "", nil, fmt.Errorf("暂不支持旧版 Office 格式 (%s), 请在 Office/WPS 中另存为 docx / xlsx / pptx 后再上传", ext)
	}

	switch {
	case isImage(mime, ext):
		if fh.Size > MaxImageBytes {
			return nil, "", "", nil, fmt.Errorf("图片 %.1fMB 超出上限 %dMB", float64(fh.Size)/1024/1024, MaxImageBytes/1024/1024)
		}
		attType = "image"
		outMime = normalizeImageMime(mime, ext)
	case isPDF(mime, ext):
		attType = "file"
		outMime = "application/pdf"
	case isPlainText(mime, ext):
		attType = "file"
		outMime = mimeOrFallback(mime, "text/plain")
	case isOffice(mime, ext):
		// office 二进制 (docx/xlsx/pptx/odt/rtf): agent 端 ReadDocument 工具经 pandoc 抽文本
		// (全 feature 可用, 不依赖 Bash); claw 另可用 Bash+openpyxl 对 xlsx 精读。
		// backend 不抽文本, 只放行推送。
		attType = "file"
		outMime = mimeOrFallback(mime, "application/octet-stream")
	case isUnsupportedImageMime(mime):
		// image/* 但不在 vision 白名单 (tiff/heic/avif/heif…): 收了 agent 也嵌不进模型
		// (attachments.ts 白名单只有 jpeg/png/gif/webp, 超白名单静默丢) —— 与 bmp 同因, 入口拒。
		return nil, "", "", nil, fmt.Errorf("暂不支持该图片格式 (%s), 请转换为 PNG / JPG 后上传", mime)
	case isLegacyOfficeMime(mime):
		// 扩展名不认识 + legacy mime → 按旧版 Office 拒 (如无扩展名的 .doc 流)。
		return nil, "", "", nil, errors.New("暂不支持旧版 Office 格式, 请在 Office/WPS 中另存为 docx / xlsx / pptx 后再上传")
	default:
		return nil, "", "", nil, fmt.Errorf("暂不支持的文件类型 (%s / %s); 可上传图片、PDF、Office 文档 (docx/xlsx/pptx)、Markdown / 纯文本", ext, mime)
	}

	body, err = readMultipart(fh)
	if err != nil {
		return nil, "", "", nil, fmt.Errorf("读取文件失败: %w", err)
	}
	return fh, attType, outMime, body, nil
}

// pushToSession — 把校验完的字节**先落耐久层、再落会话 cwd**, 组装 DTO。
//
// 🔴 顺序是 MinIO → DB → cwd,不是反过来。两种顺序最终都是双写,区别只在**失败时留下什么**:
//   - cwd 优先:cwd 写成功、MinIO 挂了 → 得到一个「有字节没耐久性」的附件,而**用户看不出
//     区别** —— 静默降级回改造前的行为,是最坏的失败模式(这类断层本仓库反复吃亏)。
//   - MinIO 优先(采纳):cwd 写失败时字节仍然是安全的,用户拿到可执行错误去腾空间再重试,
//     而**重试会命中 sha 去重、不重新上传一遍 30MB**,只补一次 cwd 推送。
//
// 代价:被 cwd 配额拒掉的上传会在 MinIO 留一个对象 + 一行 materialized_at IS NULL 的行。
// 这不是垃圾 —— 那是一份用户确实上传成功的文件,可取回、可复用、可删。挡恶意刷量的是
// per-user 配额,它在 PUT **之前**。
func (u *Uploader) pushToSession(parent context.Context, userID uint, sessionID string, fh *multipart.FileHeader, attType, outMime string, body []byte) (*AttachmentDTO, error) {
	ctx, cancel := context.WithTimeout(parent, pushFileTimeout)
	defer cancel()
	// 落盘名 = <uuid>-<原名>:①前端历史回放剥离器(agent-history STORED_UUID_PREFIX)只认带
	// UUID 前缀的 @"path" 为附件标记;②防同名文件互相覆盖。展示名(DTO.Name)仍用原名。
	// 0112 起这个 UUID 同时是**附件的持久身份键**:它已经写在存量 journal 的 @"path" 里且
	// 永不过期 ⇒ 取回端点按它反查,存量历史零改造。这三重用途叠在同一个串上,更不能改格式。
	attUUID := uuid.NewString()
	storedName := attUUID + "-" + filepath.Base(fh.Filename)
	relPath := storedName
	if u.subdir != "" {
		// 子目录经文件名携带(executor 白名单解析一层安全段),免动 multipart 协议。
		relPath = u.subdir + "/" + storedName
	}

	row, derr := u.persistDurable(ctx, userID, sessionID, attUUID, storedName, relPath,
		fh.Filename, attType, outMime, body)
	if derr != nil {
		return nil, derr
	}

	// body 已在内存(gin multipart 读出),包成 reader 流给 agent —— 至少省掉 client 端的 multipart 整份缓冲。
	pushedPath, err := u.push(ctx, sessionID, relPath, body)
	if err != nil {
		if errors.Is(err, agent.ErrSessionQuotaExceeded) {
			// agent 端会话累计配额帽(1GB/2000 文件):给用户可执行的指引,不走 infra 脱敏。
			//
			// 文案里的**两条出路今天都真的走得通**,这是本次收尾补上的:
			//   ① 新开一个对话 —— 一直可行(新会话 cwd 是空的);
			//   ② 输入框「+」→「我的附件」里删掉不用的附件 —— 删除会连带清掉会话 cwd 里的
			//      工作副本,于是**真的**能腾出这道帽的空间。在删除入口落地之前这句话是说不得的
			//      (改造前那句「请删除部分历史文件」正是因为没有入口而成了空话)。
			// 括号里那半句是耐久化买到的改善:字节此刻已在 MinIO,重传命中 sha 去重,
			// 不会再传一遍 30MB。
			return nil, errors.New("当前会话的文件空间已满, 请新开一个对话, 或在输入框「+」→「我的附件」里删掉不再需要的文件后重试(已上传的文件不会丢失)")
		}
		return nil, fmt.Errorf("文件推送失败: %w", err)
	}
	if row != nil {
		now := time.Now()
		if merr := u.st().MarkMaterialized(row.ID, &now); merr != nil {
			// 只影响「下次是否多做一次存在性探测」,不影响本次可用性 → warn 不阻断。
			slog.Warn("agentattach: 标记 cwd 副本失败", "attachment_id", row.ID, "err", merr)
		}
	}

	dto := &AttachmentDTO{
		SessionID: sessionID,
		Type:      attType,
		Name:      fh.Filename,
		MimeType:  outMime,
		Size:      fh.Size,
		Path:      pushedPath,
		UUID:      attUUID,
	}
	if row != nil {
		dto.ID = row.ID
	}
	return dto, nil
}

// st 解析本次要用的 store(实例覆盖优先,否则包级默认)。见 store.go 里为什么是包级默认。
func (u *Uploader) st() Store { return resolveStore(u.store) }

// push 把字节写进会话 cwd,返回 agent 容器内绝对路径。
func (u *Uploader) push(ctx context.Context, sessionID, relPath string, body []byte) (string, error) {
	if u.pushFn != nil {
		return u.pushFn(ctx, sessionID, relPath, body)
	}
	pushed, err := u.feature.AgentClient().PushSessionFile(ctx, sessionID, relPath, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	return pushed.Path, nil
}

// persistDurable —— 把字节写进 MinIO + 落一行 agent_attachments。
// 返回 (nil, nil) 表示**降级放行**:未装配 store 或 MinIO 未启用(dev 常态),行为完全等同
// 改造前 —— 本机开发不该被迫起一套 MinIO。
//
// 已启用但 PutObject 失败则 **fail-closed** 报错:这是暂时性故障,用户重试代价低;
// 静默降级会造成「以为存了其实没存」,而这正是本次要消灭的那类断层。
func (u *Uploader) persistDurable(ctx context.Context, userID uint, sessionID, attUUID, storedName, relPath, filename, attType, outMime string, body []byte) (*agentattachstore.Attachment, error) {
	st := u.st()
	if st == nil || !objects.Enabled() {
		if st == nil {
			slog.Warn("agentattach: 附件耐久化未装配,本次上传只落会话 cwd(30 天 GC 后消失)",
				"session_id", sessionID)
		}
		return nil, nil
	}

	// ① per-user 耐久额度:在 PUT **之前**。超额时一个字节都不写。
	//
	// 🔴 sha 必须先算:额度是按 **DISTINCT content_sha256** 求和的(SumBytesByUser),
	// 所以「已经存过的同一份字节」再传一次并不会让占用变大 —— 此时把 len(body) 加进去
	// 就是**凭空多算一次**。这个错在两个真实场景里会直接卡死用户:
	//   · 浏览器/前端重试同一次上传(网络抖动)—— 明明没多占一个字节却被判超额;
	//   · 会话 cwd 满 → 用户腾完空间**重试**(这条路正是 MinIO 优先顺序买来的能力):
	//     恰恰是快到顶的用户最需要它,而按旧算法他必然被自己的第一次上传挡在门外。
	sha := sha256Hex(body)
	incoming := int64(len(body))
	if prev, ferr := st.FindLiveByUserSHA(uint64(userID), sha); ferr == nil && prev != nil {
		incoming = 0
	}
	used, err := st.SumBytesByUser(uint64(userID))
	if err != nil {
		// 额度算不出来时放行:配额是保护措施,不该因为一次 DB 抖动就把用户的正常上传拒掉。
		slog.Warn("agentattach: 附件额度统计失败,本次放行", "user_id", userID, "err", err)
	} else if used+incoming > maxUserAttachmentBytes {
		// 用 ErrUserAttachmentQuota 包一层:调用方(各 feature handler)据此回 7010,
		// 前端才能把这条错误接到「打开附件管理 → 删掉旧文件」这个**真的做得到**的动作上。
		// 只回一句文案而没有专属码 = 又一次「指引一件用户做不到的事」。
		return nil, fmt.Errorf("%w (已用 %s / 上限 %s), 请删除不再需要的附件后重试",
			ErrUserAttachmentQuota, humanBytes(used), humanBytes(maxUserAttachmentBytes))
	}

	// ② 内容寻址 PUT(同用户同内容命中既有对象则跳过传输)。
	key, perr := putAttachmentObject(ctx, st, userID, sha, outMime, body)
	if perr != nil {
		slog.Error("agentattach: 附件写入对象存储失败(fail-closed)",
			"user_id", userID, "session_id", sessionID, "err", perr)
		return nil, errors.New("文件保存失败, 请稍后重试")
	}

	// ③ 落行。uk_session_uuid 让重复写幂等。
	row := &agentattachstore.Attachment{
		AttachmentUUID: attUUID,
		UserID:         uint64(userID),
		FeatureKey:     u.featureKey(),
		SessionID:      sessionID,
		StoredName:     storedName,
		RelPath:        relPath,
		Filename:       filename,
		AttType:        attType,
		Mime:           outMime,
		SizeBytes:      int64(len(body)),
		ContentSHA256:  sha,
		StorageKey:     key,
	}
	if uerr := st.Upsert(row); uerr != nil {
		// 对象已经在 MinIO 了但行落不下 → 该对象无人可发现(孤儿)。这里 fail-closed 而不是
		// 放行:没有行就没有取回入口、没有配额计数、没有删除权,等于「存了但用户拿不到」。
		// 孤儿对象由 reaper 兜底(与 library_cleanup 同款,Phase 3)。
		slog.Error("agentattach: 附件元数据落库失败(对象已写入,留待 reaper 回收)",
			"user_id", userID, "session_id", sessionID, "key", key, "err", uerr)
		return nil, errors.New("文件保存失败, 请稍后重试")
	}
	return row, nil
}

// featureKey 取所属 feature 的 key(仅用于审计列;未装配时空串)。
func (u *Uploader) featureKey() string {
	if u == nil || u.feature == nil {
		return ""
	}
	return u.feature.Spec().Key
}

// ─── 类型嗅探 helpers ────────────────────────────────────────────────────

// isImage — 仅认 vision 可嵌入的图片 (审查修正: 不再用 image/* 前缀兜底放行 ——
// tiff/heic/avif 等收了 agent 也嵌不进模型, 静默丢成"幻影图片")。
// mime 白名单与 agent attachments.ts IMAGE_MEDIA 对齐; .bmp 上传口已专门拒。
func isImage(mime, ext string) bool {
	switch mime {
	case "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp":
		return true
	}
	switch ext {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif":
		return true
	}
	return false
}

// isUnsupportedImageMime — image/* 前缀但不在 vision 白名单 (isImage 已排除的余集)。
// 单列谓词是为了给专属拒收文案 ("请转换为 PNG/JPG"), 而非落进含混的"暂不支持的文件类型"。
func isUnsupportedImageMime(mime string) bool {
	return strings.HasPrefix(mime, "image/") && !isImage(mime, "")
}

func normalizeImageMime(mime, ext string) string {
	if mime == "image/jpg" { // 非标写法归一 (agent 白名单只认 image/jpeg)
		return "image/jpeg"
	}
	if strings.HasPrefix(mime, "image/") {
		return mime
	}
	switch ext {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	}
	return "image/png"
}

func isPDF(mime, ext string) bool {
	return ext == ".pdf" || strings.Contains(mime, "pdf")
}

// isPlainText — 用户可能上传的"纯文本系": markdown / json / csv / 各种源码 / 配置等。
// 用 mime 前缀 + 扩展名白名单双保险。
func isPlainText(mime, ext string) bool {
	if strings.HasPrefix(mime, "text/") {
		return true
	}
	switch mime {
	case "application/json", "application/xml", "application/yaml", "application/x-yaml":
		return true
	}
	switch ext {
	case ".md", ".markdown", ".txt", ".log", ".json", ".jsonl", ".xml", ".yaml", ".yml",
		".csv", ".tsv", ".sql", ".sh", ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs",
		".c", ".cpp", ".h", ".hpp", ".java", ".rb", ".php", ".tex", ".bib":
		return true
	}
	return false
}

// isOffice — agent 端**确实能读**的 office 文档系 (docx/xlsx/pptx/odt/rtf):
// ReadDocument 工具经上游 pandoc ≥3.8.3 抽文本, 全 feature 可用。
// 上传时浏览器/客户端常给 application/octet-stream, 所以主要靠扩展名白名单。
// 旧版 doc/xls/ppt 与 ods/odp **不在此列** —— 容器无解析器, 由 isLegacyOffice 在入口拒收。
func isOffice(mime, ext string) bool {
	switch ext {
	case ".docx", ".xlsx", ".pptx", ".odt", ".rtf":
		return true
	}
	switch mime {
	case "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"application/vnd.oasis.opendocument.text",
		"application/rtf":
		return true
	}
	return false
}

// isLegacyOfficeExt — 无解析器的旧版/冷门 Office 扩展名 (guard 拒收并引导另存为新格式)。
// 只看扩展名: mime 不可信 (Windows 注册表会给 .csv/.docx 报 legacy mime, 见 guard 处注释)。
func isLegacyOfficeExt(ext string) bool {
	switch ext {
	case ".doc", ".xls", ".ppt", ".ods", ".odp":
		return true
	}
	return false
}

// isLegacyOfficeMime — legacy mime 兜底判定, 仅在扩展名不属于任何受支持类别时
// (switch default 前) 使用, 用来给无扩展名的旧版 Office 流一个可执行的拒收文案。
func isLegacyOfficeMime(mime string) bool {
	switch mime {
	case "application/msword",
		"application/vnd.ms-excel",
		"application/vnd.ms-powerpoint",
		"application/vnd.oasis.opendocument.spreadsheet",
		"application/vnd.oasis.opendocument.presentation":
		return true
	}
	return false
}

func mimeOrFallback(mime, fallback string) string {
	if mime != "" {
		return mime
	}
	return fallback
}

func readMultipart(fh *multipart.FileHeader) ([]byte, error) {
	f, err := fh.Open()
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(f)
}
