// ============================================================================
// Scholay 文献集分享 —— 模型 + 常量 + token/提取码生成
// ----------------------------------------------------------------------------
// 网盘式分享:一条 LibraryShare = 一个链接(token);篇目以 LibrarySharePaper 快照保存
// (收件人始终看到分享那一刻的内容);访问/转存记 LibraryShareAccess。
// 本轮只支持论文(单篇 single / 文件夹整本 collection)。
// ============================================================================

package library

import (
	"crypto/rand"
	"encoding/json"
	"time"
)

const (
	ShareKindSingle     = "single"     // 单篇分享
	ShareKindCollection = "collection" // 文件夹整本分享
	ShareKindJournal    = "journal"    // 单期刊分享(短链 + 落地页;按 journal_id 实时取详情)

	ShareEntityPaper   = "paper"   // 单篇:论文
	ShareEntityFolder  = "folder"  // 整本:文件夹
	ShareEntityJournal = "journal" // 期刊

	ShareStatusActive  = "active"
	ShareStatusRevoked = "revoked"

	ShareActionView = "view"
	ShareActionSave = "save"

	// OriginShare 标记「从他人分享转存来」的论文(库行 origin 字段);便于来源分析。
	OriginShare = "share"

	maxSharePapersSnapshot = 500 // 单个分享最多快照篇目(与批量上限一致)
	maxSharesPerUser       = 200 // 每用户最多活跃分享
	shareTokenLen          = 10  // token 长度(base58)
	extractCodeLen         = 4   // 提取码长度

	// 提取码防爆破:同一 (token, IP) 连错 shareCodeFailLimit 次后锁定 shareCodeFailWindow。
	// 4 位提取码组合数有限(32^4 ≈ 105 万),没有熔断的话匿名脚本可在线枚举。
	shareCodeFailLimit = 5

	// savedShareIDPrefix 转存来的自由文件行 source_paper_id 前缀:
	// "share-<原主PDF sha256>"。不冒充收件人自己的 PDF sha(收件人没有这份文件本体),
	// 避免其后自传 PDF 时 sha 幂等合并命中错行;同一原文件跨分享转存仍可去重。
	savedShareIDPrefix = "share-"
)

// tokenAlphabet base58(去掉易混的 0OIl),做 URL 短码。
const tokenAlphabet = "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"

// codeAlphabet 提取码字母表:去掉易混字符(0/O/1/I/l),用户手抄不易错。
const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

// LibraryShare 一条分享链接。
type LibraryShare struct {
	ID          uint64     `json:"id" gorm:"primaryKey"`
	Token       string     `json:"token" gorm:"size:32;not null"`
	UserID      uint64     `json:"user_id" gorm:"not null;index"`
	Kind        string     `json:"kind" gorm:"size:16;not null;default:'single'"`
	EntityType  string     `json:"entity_type" gorm:"size:16;not null;default:'paper'"`
	FolderID    *uint64    `json:"folder_id,omitempty"`
	JournalID   *uint64    `json:"journal_id,omitempty" gorm:"column:journal_id"`
	Title       string     `json:"title" gorm:"size:512;not null;default:''"`
	Subtitle    string     `json:"subtitle" gorm:"size:512;not null;default:''"`
	PaperCount  int        `json:"paper_count" gorm:"not null;default:0"`
	ExtractCode string     `json:"extract_code" gorm:"column:extract_code;size:16;not null;default:''"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	AllowSave   bool       `json:"allow_save" gorm:"not null;default:true"`
	Status      string     `json:"status" gorm:"size:16;not null;default:'active'"`
	ViewCount   int        `json:"view_count" gorm:"not null;default:0"`
	SaveCount   int        `json:"save_count" gorm:"not null;default:0"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func (LibraryShare) TableName() string { return "library_shares" }

// IsExpired 过期判定(无过期时间 = 永久)。
func (s *LibraryShare) IsExpired(now time.Time) bool {
	return s.ExpiresAt != nil && !s.ExpiresAt.After(now)
}

// LibrarySharePaper 分享篇目快照(分享那一刻冻结)。
type LibrarySharePaper struct {
	ID            uint64          `json:"id" gorm:"primaryKey"`
	ShareID       uint64          `json:"-" gorm:"column:share_id;not null;index"`
	Source        string          `json:"source" gorm:"size:16;not null;default:''"`
	SourcePaperID string          `json:"source_paper_id" gorm:"column:source_paper_id;size:128;not null;default:''"`
	Title         string          `json:"title" gorm:"size:1024;not null;default:''"`
	AuthorsJSON   json.RawMessage `json:"authors,omitempty" gorm:"column:authors_json;type:json"`
	Year          *uint16         `json:"year,omitempty"`
	Venue         string          `json:"venue" gorm:"size:512;not null;default:''"`
	DOI           string          `json:"doi" gorm:"size:255;not null;default:''"`
	Abstract      string          `json:"abstract,omitempty" gorm:"type:mediumtext"`
	PdfURL        string          `json:"pdf_url,omitempty" gorm:"column:pdf_url;size:1024;not null;default:''"`
	CitationCount uint32          `json:"citation_count" gorm:"column:citation_count;not null;default:0"`
	Position      int             `json:"position" gorm:"not null;default:0"`
}

func (LibrarySharePaper) TableName() string { return "library_share_papers" }

// LibraryShareAccess 访问/转存流水。
type LibraryShareAccess struct {
	ID           uint64    `json:"id" gorm:"primaryKey"`
	ShareID      uint64    `json:"-" gorm:"column:share_id;not null;index"`
	ViewerUserID *uint64   `json:"viewer_user_id,omitempty" gorm:"column:viewer_user_id"`
	ViewerLabel  string    `json:"viewer_label" gorm:"column:viewer_label;size:128;not null;default:''"`
	Action       string    `json:"action" gorm:"size:16;not null;default:'view'"`
	ItemCount    int       `json:"item_count" gorm:"column:item_count;not null;default:0"`
	CreatedAt    time.Time `json:"created_at"`
}

func (LibraryShareAccess) TableName() string { return "library_share_access" }

// randomFromAlphabet 用 crypto/rand 从字母表取 n 个字符。
// 拒绝采样(rejection sampling):丢弃会造成取模偏差的尾部字节(256 % len(alphabet) != 0 时
// 直接 b % len 会让字母表前段字符出现概率略高),保证每个字符等概率。
func randomFromAlphabet(alphabet string, n int) (string, error) {
	limit := 256 - (256 % len(alphabet)) // [0, limit) 内取模无偏
	out := make([]byte, 0, n)
	buf := make([]byte, 32)
	for len(out) < n {
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}
		for _, b := range buf {
			if int(b) >= limit {
				continue
			}
			out = append(out, alphabet[int(b)%len(alphabet)])
			if len(out) == n {
				break
			}
		}
	}
	return string(out), nil
}

func genShareToken() (string, error)  { return randomFromAlphabet(tokenAlphabet, shareTokenLen) }
func genExtractCode() (string, error) { return randomFromAlphabet(codeAlphabet, extractCodeLen) }
