package agentattachstore

import (
	"os"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// 针对**真实 MySQL** 的仓储回归。
//
// 为什么非打真库不可:agentattach 那一族用例全部跑在 fakeStore 上,而 fakeStore 是**手写的
// 语义副本**。真正决定「要不要删掉一个用户附件对象」的是这里的 SQL(LiveStorageKeys),
// 决定「用户还能不能上传」的是 SumBytesByUser 的那段 GROUP BY,决定「删一行会不会连带
// 删掉别人还在用的字节」的是 CountRefs。这三条 fake 全都"实现对了",但那只证明写 fake 的人
// 理解对了,不证明 GORM 生成的 SQL 也是那个意思 —— 例如 Distinct().Pluck 若拼错列,
// 返回的就是空集,而空集在 reaper 里的含义是**整批都是孤儿,全删**。
//
// 不设 AGENTATTACH_TEST_DSN 时 skip 并明说跳过了什么(不是通过)。跑法:
//
//	docker run --rm --network scholar_scholar-network -v <repo>/backend:/src -w /src \
//	  -e AGENTATTACH_TEST_DSN='scholar_user:scholar_pass@tcp(mysql:3306)/scholar?parseTime=true&loc=Local' \
//	  golang:1.21-alpine go test ./internal/agentattachstore/ -run MySQL -v
func openAttachTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("AGENTATTACH_TEST_DSN")
	if dsn == "" {
		t.Skip("跳过:未设 AGENTATTACH_TEST_DSN —— 附件仓储 SQL **本次没有被验证**,不是通过")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	return db
}

// 用一个几乎不可能与真实数据撞车的 user_id,便于失败时人工辨认残留。
// ⚠️ 该 user 在 users 表里不存在,而 0113 给本表挂了 fk_agent_att_user(ON DELETE CASCADE)——
// 所以测试**必须**先建一行 users 再插附件行,否则 INSERT 会被外键直接拒掉。这也顺带
// 校验了那条外键真的在(它是「删号带走附件」的全部依仗)。
const attachTestUserID = uint64(987654322)

func seedAttachTestUser(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := db.Exec(`INSERT IGNORE INTO users (id, username, email, password_hash, role, status, created_at, updated_at)
	                   VALUES (?, ?, ?, '', 'user', 1, NOW(), NOW())`,
		attachTestUserID, "att-sql-probe", "att-sql-probe@example.invalid").Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() {
		// 先删附件行再删用户:外键是 CASCADE,但显式删更能让残留可见。
		db.Exec("DELETE FROM agent_attachments WHERE user_id = ?", attachTestUserID)
		db.Exec("DELETE FROM users WHERE id = ?", attachTestUserID)
	})
}

func mkRow(uuid, session, sha, key string, size int64) *Attachment {
	return &Attachment{
		AttachmentUUID: uuid, UserID: attachTestUserID, SessionID: session,
		StoredName: uuid + "-a.pdf", RelPath: uuid + "-a.pdf", Filename: "a.pdf",
		AttType: "file", Mime: "application/pdf", SizeBytes: size,
		ContentSHA256: sha, StorageKey: key,
	}
}

// TestMySQLLiveStorageKeysIsTheReaperJudgment —— reaper 的删除判据必须在真库上成立。
//
// 三种输入各钉一条:
//   - 有 live 行的 key → **必须**被认出来(认不出 = 该对象被当孤儿删掉 = 用户数据没了);
//   - 只有软删行的 key → 不认(用户已行使删除权,字节该回收);
//   - 桶里有但库里没有的 key → 不认(真孤儿)。
//
// 变异验证:把 repository.go 的 `Distinct().Pluck("storage_key", &found)` 改成
// `Pluck("attachment_uuid", &found)`(列拼错的典型形状)→ 本用例失败;而 fakeStore 那一族
// 全绿 —— 这正是这条真库用例存在的理由。
func TestMySQLLiveStorageKeysIsTheReaperJudgment(t *testing.T) {
	db := openAttachTestDB(t)
	seedAttachTestUser(t, db)
	repo := NewRepository(db)

	live := mkRow("bbbbbbbb-0000-0000-0000-000000000001", "sess-live", "sha-live", "att/987654322/live", 10)
	if err := repo.Upsert(live); err != nil {
		t.Fatalf("upsert live: %v", err)
	}
	soft := mkRow("bbbbbbbb-0000-0000-0000-000000000002", "sess-soft", "sha-soft", "att/987654322/soft", 20)
	if err := repo.Upsert(soft); err != nil {
		t.Fatalf("upsert soft: %v", err)
	}
	if err := repo.SoftDelete(soft.ID, attachTestUserID); err != nil {
		t.Fatalf("soft delete: %v", err)
	}

	keys := []string{"att/987654322/live", "att/987654322/soft", "att/987654322/orphan"}
	found, err := repo.LiveStorageKeys(keys)
	if err != nil {
		t.Fatalf("LiveStorageKeys: %v", err)
	}
	set := map[string]bool{}
	for _, k := range found {
		set[k] = true
	}
	if !set["att/987654322/live"] {
		t.Fatal("live 行的 key 没被认出来 —— reaper 会把在用的附件当孤儿删掉")
	}
	if set["att/987654322/soft"] {
		t.Fatal("只被软删行引用的 key 被当成 live —— 用户点了永久删除,字节却永远留在桶里")
	}
	if set["att/987654322/orphan"] {
		t.Fatal("库里根本没有的 key 被当成 live —— 孤儿永远回收不掉")
	}
}

// TestMySQLQuotaAndRefCountSQL —— 配额求和与引用计数的真库语义。
//
// 这两条都是「算错就出事」的数:多算 → 用户被自己的重复上传挡在门外(而他一个字节都没多占);
// 少算(CountRefs)→ 删一行连带删掉别的会话还在用的对象。
func TestMySQLQuotaAndRefCountSQL(t *testing.T) {
	db := openAttachTestDB(t)
	seedAttachTestUser(t, db)
	repo := NewRepository(db)

	// 同一份字节被两个会话引用(跨会话复用)+ 另一份独立字节 + 一份已软删。
	a1 := mkRow("cccccccc-0000-0000-0000-000000000001", "sess-a", "sha-dup", "att/987654322/dup", 100)
	a2 := mkRow("cccccccc-0000-0000-0000-000000000001", "sess-b", "sha-dup", "att/987654322/dup", 100)
	b := mkRow("cccccccc-0000-0000-0000-000000000002", "sess-a", "sha-solo", "att/987654322/solo", 30)
	gone := mkRow("cccccccc-0000-0000-0000-000000000003", "sess-a", "sha-gone", "att/987654322/gone", 500)
	for _, r := range []*Attachment{a1, a2, b, gone} {
		if err := repo.Upsert(r); err != nil {
			t.Fatalf("upsert: %v", err)
		}
	}
	if err := repo.SoftDelete(gone.ID, attachTestUserID); err != nil {
		t.Fatalf("soft delete: %v", err)
	}

	used, err := repo.SumBytesByUser(attachTestUserID)
	if err != nil {
		t.Fatalf("SumBytesByUser: %v", err)
	}
	// 130 = 100(同一份字节只算一次,尽管有两行)+ 30;软删的 500 不计。
	if used != 130 {
		t.Fatalf("配额求和应按 DISTINCT content_sha256 且排除软删, want 130 got %d", used)
	}

	// 删 a1 那一行之前:a2 仍指着同一个对象 ⇒ 必须数出 1(对象不能删)。
	n, err := repo.CountRefs(attachTestUserID, "sha-dup", a1.ID)
	if err != nil {
		t.Fatalf("CountRefs: %v", err)
	}
	if n != 1 {
		t.Fatalf("跨会话复用时引用计数应为 1(对象必须保留), got %d", n)
	}
	// 独占那份:除自己外没有别的行 ⇒ 0(可以删对象)。
	if n, err = repo.CountRefs(attachTestUserID, "sha-solo", b.ID); err != nil || n != 0 {
		t.Fatalf("独占对象的引用计数应为 0, got %d err=%v", n, err)
	}
}

// TestMySQLUpsertIsIdempotentPerSessionUUID —— uk_agent_att_session_uuid 的幂等必须由 DB 保证。
//
// 跨会话物化/重试会反复写同一 (session, uuid);拿不到这条幂等就会堆重复行,
// 而重复行会让 CountRefs 恒 > 0 ⇒ 对象**永远删不掉**(配额也就永远腾不出来)。
// 顺带钉住 created_at 不被冲突更新覆盖:否则重跑一次物化,附件就在「我的附件」里跳到最前面。
func TestMySQLUpsertIsIdempotentPerSessionUUID(t *testing.T) {
	db := openAttachTestDB(t)
	seedAttachTestUser(t, db)
	repo := NewRepository(db)

	r := mkRow("dddddddd-0000-0000-0000-000000000001", "sess-x", "sha-x", "att/987654322/x", 42)
	r.CreatedAt = time.Now().Add(-72 * time.Hour)
	if err := repo.Upsert(r); err != nil {
		t.Fatalf("upsert #1: %v", err)
	}
	firstID, firstCreated := r.ID, r.CreatedAt

	again := mkRow("dddddddd-0000-0000-0000-000000000001", "sess-x", "sha-x", "att/987654322/x", 42)
	again.RelPath = "uploads/dddddddd-0000-0000-0000-000000000001-a.pdf" // 物化落点变了
	if err := repo.Upsert(again); err != nil {
		t.Fatalf("upsert #2: %v", err)
	}

	var rows []Attachment
	if err := db.Where("user_id = ? AND attachment_uuid = ?", attachTestUserID, r.AttachmentUUID).
		Find(&rows).Error; err != nil {
		t.Fatalf("find: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("同一 (session, uuid) 必须只有一行(否则引用计数永远归不了零), got %d", len(rows))
	}
	if rows[0].ID != firstID {
		t.Fatalf("冲突时应更新原行而非新建, want id=%d got %d", firstID, rows[0].ID)
	}
	if rows[0].RelPath != again.RelPath {
		t.Fatalf("冲突时内容列应被更新, got %q", rows[0].RelPath)
	}
	if rows[0].CreatedAt.Sub(firstCreated) > time.Minute {
		t.Fatalf("created_at 不该被冲突更新覆盖, want ~%v got %v", firstCreated, rows[0].CreatedAt)
	}
}
