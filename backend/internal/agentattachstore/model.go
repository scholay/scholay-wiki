// ============================================================================
// internal/agentattachstore —— 输入框上传附件(agent_attachments)的元数据访问层。
//
// 字节存 MinIO(bucket = storage.AgentAttachmentsBucket()),本表只存身份 / 归属 /
// 生命周期。设计与迁移 0112/0113 的表头注释是同一份说明,别在两处各写一半。
//
// 🔴 为什么单独一个包,而不是塞进 internal/agentattach:
//    agentattach 是纯业务层(校验 / 落盘 / 物化),它的单测不起库、跑得飞快。把 gorm 的
//    Repository 混进去,以后很容易顺手在业务函数里直接 r.db.Where(...),那一步之后单测
//    就必须起库了。分包让「要用 DB 就得先过 agentattach.Store 这个窄接口」成为编译期事实,
//    单测拿一个 fake Store 就能覆盖全部路径 —— 与 AttachmentRelocator 同款鸭子类型思路。
// ============================================================================

package agentattachstore

import "time"

// Attachment 是 agent_attachments 表的一行 = 一个附件在**某个会话**里的存在。
//
// 同一份字节被 N 个会话引用就是 N 行(共享同一个 content_sha256 / storage_key)。
// 见 0113 注释:per-session 的属性(materialized_at / 删会话)决定了这个形状。
type Attachment struct {
	ID             uint64 `gorm:"column:id;primaryKey;autoIncrement"`
	AttachmentUUID string `gorm:"column:attachment_uuid;type:char(36);not null"`
	UserID         uint64 `gorm:"column:user_id;not null"`
	FeatureKey     string `gorm:"column:feature_key;type:varchar(64);not null;default:''"`
	SessionID      string `gorm:"column:session_id;type:varchar(191);not null"`
	StoredName     string `gorm:"column:stored_name;type:varchar(320);not null"`
	RelPath        string `gorm:"column:rel_path;type:varchar(512);not null"`
	Filename       string `gorm:"column:filename;type:varchar(255);not null"`
	AttType        string `gorm:"column:att_type;type:varchar(16);not null;default:file"`
	Mime           string `gorm:"column:mime;type:varchar(160);not null;default:''"`
	SizeBytes      int64  `gorm:"column:size_bytes;not null;default:0"`
	ContentSHA256  string `gorm:"column:content_sha256;type:char(64);not null;default:''"`
	StorageKey     string `gorm:"column:storage_key;type:varchar(640);not null;default:''"`
	OriginID       uint64 `gorm:"column:origin_id;not null;default:0"`
	// MaterializedAt:cwd 副本最近一次被确认存在。NULL = 现在 cwd 里没有这份文件
	// (被 30 天 GC 清了 / 被配额驱逐 / 推送失败),下次真的用到时从 MinIO 重建。
	MaterializedAt *time.Time `gorm:"column:materialized_at"`
	// DeletedAt:软删。**不叫 gorm.DeletedAt** —— 那会让 GORM 给所有查询自动加
	// `deleted_at IS NULL`,而取回端点恰恰需要**查得到已删的行**才能回 410
	// 「该文件已被删除」而不是无解释的 404。语义差别就在这里,别改成软删插件。
	DeletedAt *time.Time `gorm:"column:deleted_at"`
	CreatedAt time.Time  `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt time.Time  `gorm:"column:updated_at;autoUpdateTime"`
}

// TableName 固定表名,避免 GORM 复数化。
func (Attachment) TableName() string { return "agent_attachments" }
