// ============================================================================
// agentattach — 附件耐久化的接缝(MinIO 真源 + DB 身份 + cwd 工作副本)
//
// 方案:docs/research/agent-data-storage-2026-08/ATTACHMENT-DURABILITY.md
//
// 在此之前,输入框附件的字节**只在 executor 会话 cwd**:会话删/重置立刻没,30 天
// workdir GC 一到永久消失,而 journal 里的 @"path" 永不过期 ⇒ 幽灵 chip。产出物早已
// 落 MinIO(agent_artifacts),用户自己传的原始数据反而没有 —— 这个不对称正是本文件补的。
//
// 三层分工(不是二选一):
//   MinIO 对象  = 耐久真源,永久
//   会话 cwd    = 工作副本,可丢;模型的 Read/Bash/vision 读的是磁盘,MinIO 替代不了
//   MySQL 行    = 身份 / 归属 / 生命周期(agent_attachments,迁移 0112/0113)
// ============================================================================

package agentattach

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/agentattachstore"
	"scholar-backend/internal/storage"
)

// Store —— agentattach 依赖 DB 的**全部**面(消费方定义的窄接口)。
// 生产实现是 *agentattachstore.Repository;单测传 fake,不起库。
type Store interface {
	Upsert(a *agentattachstore.Attachment) error
	GetByUUID(uuid string, userID uint64) (*agentattachstore.Attachment, error)
	GetBySessionUUID(sessionID, uuid string, userID uint64) (*agentattachstore.Attachment, error)
	FindLiveByUserSHA(userID uint64, sha string) (*agentattachstore.Attachment, error)
	CountRefs(userID uint64, sha string, excludeID uint64) (int64, error)
	SumBytesByUser(userID uint64) (int64, error)
	ListLiveByUUID(uuid string, userID uint64) ([]agentattachstore.Attachment, error)
	ListLiveByUser(userID uint64, limit int) ([]agentattachstore.Attachment, error)
	// LiveStorageKeys 从给定 key 集里筛出「仍被未软删的行引用」的那些 —— 孤儿 reaper 的判据。
	// 刻意只认 live 行:软删行代表用户已经行使过删除权,此时对象若还在就是删除没删干净,
	// 正该被回收。
	LiveStorageKeys(keys []string) ([]string, error)
	MarkMaterialized(id uint64, at *time.Time) error
	SoftDelete(id uint64, userID uint64) error
	DeleteBySession(sessionID string) ([]agentattachstore.Attachment, error)
}

// ─── 默认 store(装配) ─────────────────────────────────────────────────────
//
// 🔴 为什么是包级默认值而不是构造参数:Uploader / Relocator 一共有 6 个构造点,其中 4 个
// 在各 feature 的 handler 构造函数里(claw / smart_search / stat_lab 的 NewHandler),
// 改签名要动四个 feature 包才能让 bootstrap 注进去。更麻烦的是**顺序**:那些 NewHandler
// 在 bootstrap 里的调用位置各不相同,构造期读默认值会踩到「还没 SetDefaultStore 就先构造了」。
// 所以这里做两件事:① 存包级默认值;② **在使用时**(而不是构造时)解析。
// 需要隔离的地方(单测)用 WithStore 覆盖到实例上,包级值不参与。
var (
	storeMu      sync.RWMutex
	defaultStore Store
)

// SetDefaultStore 由 bootstrap 调一次。nil = 不启用耐久化(行为完全等同改造前)。
func SetDefaultStore(s Store) {
	storeMu.Lock()
	defaultStore = s
	storeMu.Unlock()
}

func resolveStore(override Store) Store {
	if override != nil {
		return override
	}
	storeMu.RLock()
	defer storeMu.RUnlock()
	return defaultStore
}

// ─── 对象存储接缝 ─────────────────────────────────────────────────────────
//
// 🔴 为什么不直接调 internal/storage 的包级函数:那是个进程单例,没有真 MinIO 就
// IsEnabled()==false,于是**整条耐久化路径在单测里一行都跑不到** —— 只能测纯函数,
// 而这次要防的回归恰恰全在带副作用的路径上(双写顺序 / 去重 / 自愈 / 引用计数)。
// 一层五方法的接口换来「无需容器即可对行为下断言」。生产实现是下面的 minioObjects,
// 与直接调包级函数逐行等价。

// ObjectRef —— 列举对象时需要的最小信息(key + 落盘时间 + 大小)。
// LastModified 是孤儿 reaper 的安全线依据:比它新的对象一律不碰(可能正在上传中)。
type ObjectRef struct {
	Key          string
	LastModified time.Time
	Size         int64
}

// ObjectStore —— agentattach 用到的对象存储面。
type ObjectStore interface {
	Enabled() bool
	Put(ctx context.Context, key, contentType string, body []byte) error
	Get(ctx context.Context, key string, sizeHint int64) ([]byte, error)
	Delete(ctx context.Context, key string) error
	// Exists 只查对象在不在(HEAD,不拉字节)—— 上传去重前的存在性复核,见 putAttachmentObject。
	// 查不出来(网络/权限错)时返回 err,调用方按「不确定」处理,**不能**当成不存在。
	Exists(ctx context.Context, key string) (bool, error)
	// List 列出前缀下的对象(孤儿 reaper 专用)。max<=0 表示不设上限。
	List(ctx context.Context, prefix string, max int) ([]ObjectRef, error)
	// Serve 流式回写(带 Range / 304)。放进接口而不是让 handler 直接调 storage,
	// 是为了取回端点的响应语义(inline vs attachment / 410 / 缓存头)也能被断言。
	Serve(w http.ResponseWriter, r *http.Request, key, contentType string) error
}

type minioObjects struct{}

func (minioObjects) Enabled() bool { return storage.IsEnabled() }

func (minioObjects) Put(ctx context.Context, key, contentType string, body []byte) error {
	_, err := storage.PutObject(ctx, storage.AgentAttachmentsBucket(), key, bytes.NewReader(body), int64(len(body)),
		storage.PutOptions{ContentType: contentType})
	return err
}

func (minioObjects) Get(ctx context.Context, key string, sizeHint int64) ([]byte, error) {
	obj, _, err := storage.GetObject(ctx, storage.AgentAttachmentsBucket(), key)
	if err != nil {
		return nil, err
	}
	defer obj.Close()
	limit := sizeHint
	if limit <= 0 || limit > MaxFileBytes {
		limit = MaxFileBytes
	}
	// +1:能识别「对象比 DB 记的更长」的异常(sha 校验随后会拒掉它)。
	return io.ReadAll(io.LimitReader(obj, limit+1))
}

func (minioObjects) Delete(ctx context.Context, key string) error {
	return storage.DeleteObject(ctx, storage.AgentAttachmentsBucket(), key)
}

func (minioObjects) Exists(ctx context.Context, key string) (bool, error) {
	if _, err := storage.StatObject(ctx, storage.AgentAttachmentsBucket(), key); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (minioObjects) List(ctx context.Context, prefix string, max int) ([]ObjectRef, error) {
	infos, err := storage.ListObjectInfos(ctx, storage.AgentAttachmentsBucket(), prefix, max)
	if err != nil {
		return nil, err
	}
	out := make([]ObjectRef, 0, len(infos))
	for _, in := range infos {
		out = append(out, ObjectRef{Key: in.Key, LastModified: in.LastModified, Size: in.Size})
	}
	return out, nil
}

func (minioObjects) Serve(w http.ResponseWriter, r *http.Request, key, contentType string) error {
	return storage.ServeObject(w, r, storage.AgentAttachmentsBucket(), key, contentType)
}

var objects ObjectStore = minioObjects{}

// SetObjectStore 替换对象存储实现,返回还原函数(单测用 defer 还原,别在生产调)。
func SetObjectStore(o ObjectStore) func() {
	prev := objects
	objects = o
	return func() { objects = prev }
}

// ─── MinIO key ───────────────────────────────────────────────────────────

// objectKeyFor —— 内容寻址 + 按 user 分片:att/<user_id>/<sha256>。
//
// 为什么内容寻址(而不是照抄产物的 <feature>/<owner>/<session>/<relpath>):
//
//	① 跨会话复用今天在磁盘上是 N+1 份字节(EnsureLocal 是复制不是移动),路径派生会把这份
//	   冗余原样搬进 MinIO;内容寻址下 N 行指向同一个对象,MinIO 只存 1 份。
//	② 路径派生意味着 relocate 必须重新 PUT 一次。
//	③ 自愈时的完整性校验白得:拉回来重算 sha256 与 key 比对即可,不需要额外字段。
//
// 为什么按 user 分片(而不是全局 att/<sha256>):全局能跨用户去重,但会引入
//
//	① **存在性预言机** —— A 传一份文件若「秒传」,就能推断出别的用户传过同样的字节
//	   (stat_lab 会话里可能是含 PHI 的数据文件,这是真问题);
//	② **删除权互锁** —— A 删号要清 A 的字节,但对象被 B 引用着,删不掉;不删又不合规。
//
// 分片的代价只是同一份文件被两个用户各存一份,换来 DeleteUser 能像 library 的 papers/<uid>/
// 那样一条前缀全清。
func objectKeyFor(userID uint, sha string) string {
	return fmt.Sprintf("att/%d/%s", userID, sha)
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// ─── 身份键:落盘名里的 UUID ───────────────────────────────────────────────

// storedUUIDRe —— 落盘名 <uuid>-<原名> 的前缀。与前端 agent-history.ts 的
// STORED_UUID_PREFIX、relocate.go 的 storedNamePrefix 是同一条规则的三处镜像
// (前端剥展示名 / 后端剥展示名 / 这里剥身份键)。**改一处必须同步三处**。
var storedUUIDRe = regexp.MustCompile(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-`)

// UUIDFromStoredName 从落盘名(或完整路径的 basename)里剥出附件身份 UUID。
// 剥不出 → "" ⇒ 调用方按「存量附件 / 非附件路径」回落老逻辑,不猜。
func UUIDFromStoredName(name string) string {
	if i := strings.LastIndexByte(name, '/'); i >= 0 {
		name = name[i+1:]
	}
	m := storedUUIDRe.FindStringSubmatch(name)
	if m == nil {
		return ""
	}
	return strings.ToLower(m[1])
}

// ─── 配额 ────────────────────────────────────────────────────────────────

// maxUserAttachmentBytes —— per-user **耐久**附件额度(MinIO 侧,跨会话按内容去重求和)。
//
// 与 executor 的会话 cwd 帽(1GB/2000 文件)是两件不同的事,别混:
//   - executor 那道帽保护的是**宿主磁盘**,口径是「整个会话 cwd」(模型产物、pip 装的
//     东西全计入),用户不该把它理解成自己的存储额度;
//   - 这一道才是「你在平台上一共存了多少原始数据」,而且用户有删除入口可以自救。
//
// 定在 PUT 之前:超额时一个字节都不写,恶意刷量拿不到耐久存储。
const maxUserAttachmentBytes int64 = 2 * 1024 * 1024 * 1024

// ErrUserAttachmentQuota —— per-user 耐久额度已满的哨兵错误。
//
// 存在的唯一理由是**给用户一条出路**:各 feature 的上传 handler 靠 errors.Is 把它翻成
// errcode.AttachmentQuotaExceeded(7010),前端据此打开附件管理弹窗让用户删掉旧文件。
// 若只回一句文案(与其它上传错误同码),用户看到的就是「空间满了,请删除」+ 无处可删。
var ErrUserAttachmentQuota = errors.New("你的附件存储空间已用满")

// humanBytes 把字节数写成人能读的量级(只给用户看的文案用)。
func humanBytes(n int64) string {
	switch {
	case n >= 1<<30:
		return fmt.Sprintf("%.1fGB", float64(n)/float64(1<<30))
	case n >= 1<<20:
		return fmt.Sprintf("%.0fMB", float64(n)/float64(1<<20))
	default:
		return fmt.Sprintf("%dKB", n/1024)
	}
}

// UserAttachmentQuotaBytes 暴露额度上限(列表端点要把「上限」告诉前端,
// 否则进度条只能前端再写一份 2GB 常量 —— 两份常量迟早漂移)。
func UserAttachmentQuotaBytes() int64 { return maxUserAttachmentBytes }

// ─── 对象写入 / 删除 ──────────────────────────────────────────────────────

// putAttachmentObject 把字节写进耐久层,返回 storage_key。
//
// 命中同用户同 sha 的既有对象 → 复用 key、跳过 PUT(去重)。
func putAttachmentObject(ctx context.Context, st Store, userID uint, sha, mime string, body []byte) (string, error) {
	key := objectKeyFor(userID, sha)
	if st != nil {
		if prev, err := st.FindLiveByUserSHA(uint64(userID), sha); err == nil && prev != nil && prev.StorageKey != "" {
			// 已有同内容对象:重试上传 / 同一文件传两次都走这里,不再传一遍 30MB。
			//
			// 🔴 但必须**复核对象真的还在**,不能只信 DB 行。行与对象是两个系统,它们会分家:
			// reaper 误删、桶被人工动过、MinIO 恢复到旧快照 —— 任何一种之后,这里都会
			// 「去重成功」并跳过 PUT,于是用户拿到一个上传成功、却永远 404 的附件。
			// 更要命的是**这条路把唯一的自救动作堵死了**:取回端点回的是「文件已失效」、
			// 自愈报的是「请重新上传」,而用户照做时又会命中这次去重 —— 重传多少次都修不好。
			// 让用户按提示做却做不成,是本仓库反复吃亏的那类形状。
			// 一次 HEAD(不拉字节)换掉这条死路;查不出来(err)时保守认为在,退化成旧行为。
			ok, xerr := objects.Exists(ctx, prev.StorageKey)
			if xerr != nil || ok {
				if xerr != nil {
					slog.Warn("agentattach: 去重前的对象存在性复核失败,按存在处理",
						"user_id", userID, "key", prev.StorageKey, "err", xerr)
				}
				return prev.StorageKey, nil
			}
			slog.Warn("agentattach: DB 有行但对象不在,重新写入(不跳过 PUT)",
				"user_id", userID, "key", prev.StorageKey)
			key = prev.StorageKey
		}
	}
	if err := objects.Put(ctx, key, mime, body); err != nil {
		return "", err
	}
	return key, nil
}

// NewSessionCleaner 造 agentbridge 的会话数据清理钩子:删会话 / 重置会话时清该会话的
// 附件行,并对引用计数归零的对象删字节。
//
// cwd 里的文件不用管 —— 会话目录本身被 rm -rf 了。
func NewSessionCleaner(st Store) func(ctx context.Context, sessionID string) {
	if st == nil {
		// 未装配就返回一个真正的空操作,而不是每次删会话都去 resolveStore 一次 ——
		// 后者在「调用方传了 typed-nil」时会变成一次 nil 解引用 panic。
		return func(context.Context, string) {}
	}
	return func(ctx context.Context, sessionID string) {
		s := resolveStore(st)
		if s == nil || sessionID == "" {
			return
		}
		rows, err := s.DeleteBySession(sessionID)
		if err != nil {
			slog.Warn("agentattach: 清理会话附件行失败", "session_id", sessionID, "err", err)
		}
		for i := range rows {
			// 逐行数引用:别的会话还引用着同一份字节时对象必须留下(内容寻址的直接后果)。
			deleteObjectIfUnreferenced(ctx, s, rows[i].UserID, rows[i].ContentSHA256, rows[i].StorageKey, rows[i].ID)
		}
		if len(rows) > 0 {
			slog.Info("agentattach: 会话附件已随会话清理", "session_id", sessionID, "rows", len(rows))
		}
	}
}

// deleteObjectIfUnreferenced 引用计数归零才删对象 —— 内容寻址的必然代价。
// 顺序刻意是「先删行、后删对象」:反过来会出现「对象没了但行还在」的假可用;
// 而本顺序最坏留一个孤儿对象,由孤儿 reaper(与 library_cleanup 同款)兜底。
func deleteObjectIfUnreferenced(ctx context.Context, st Store, userID uint64, sha, key string, excludeID uint64) {
	if key == "" || sha == "" || !objects.Enabled() {
		return
	}
	if st != nil {
		n, err := st.CountRefs(userID, sha, excludeID)
		if err != nil {
			// 数不清就不删 —— 少删一个对象只是占空间,多删一个是别的会话的用户数据没了。
			slog.Warn("agentattach: 引用计数失败,保留对象", "user_id", userID, "key", key, "err", err)
			return
		}
		if n > 0 {
			return
		}
	}
	if err := objects.Delete(ctx, key); err != nil {
		slog.Warn("agentattach: 删除附件对象失败(best-effort)", "user_id", userID, "key", key, "err", err)
	}
}
