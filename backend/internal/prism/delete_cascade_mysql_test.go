package prism

import (
	"os"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// 针对**真实 MySQL** 的删项目级联测试。
//
// 为什么必须打真库:这些表一个外键都没有(0012 / 0053 / 0059 建表时都没建 FK),
// 「级联」完全是 DeleteProjectCascade 里的手写 DELETE 列表。用假 DB / mock 只能验证
// 「我调了我写的那几行」,而这里要验证的恰恰是**没写的那几行** —— 删完之后库里还剩什么。
// 只有真的往表里写行、真的删、再真的数一遍,才能发现漏表。
//
// 不设 PRISM_TEST_DSN 时 skip 并明说跳过了什么(不是通过)。跑法:
//
//	docker run --rm --network scholar_scholar-network -v <repo>/backend:/src -w /src \
//	  -e PRISM_TEST_DSN='scholar_user:scholar_pass@tcp(mysql:3306)/scholar?parseTime=true&loc=Local' \
//	  golang:1.21-alpine go test ./internal/prism/ -run MySQL -v
func openPrismTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("PRISM_TEST_DSN")
	if dsn == "" {
		t.Skip("跳过:未设 PRISM_TEST_DSN —— 删项目级联**本次没有被验证**,不是通过")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	return db
}

// TestMySQLDeleteProjectCascadeLeavesNothing —— 删项目后,任何 project 级子表都不得留行。
//
// 断言方式刻意是「按表名逐张数行」而不是「检查我删了哪几个 model」:漏表这个缺陷的形状就是
// 「代码里没有那一行」,只有从表这一侧数才看得见。新增 project 级子表时把表名加进 tables 即可。
//
// 变异验证:注释掉 DeleteProjectCascade 里删 StructVersion 的那段 → prism_struct_versions 剩 1 行,本用例失败。
func TestMySQLDeleteProjectCascadeLeavesNothing(t *testing.T) {
	db := openPrismTestDB(t)
	repo := NewRepository(db)

	// 用一个几乎不可能与真实数据撞车的 user_id,便于失败时人工辨认残留。
	const testUserID = uint(987654321)

	p := &Project{
		UserID:    testUserID,
		Title:     "级联删除测试项目",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := db.Create(p).Error; err != nil {
		t.Fatalf("create project: %v", err)
	}
	pid := p.ID
	// 兜底清理:用例中途失败也不留脏数据。
	t.Cleanup(func() {
		_ = repo.DeleteProjectCascade(pid)
	})

	// 每张 project 级子表塞一行。
	f := &File{ProjectID: pid, RelPath: "main.tex", FileKind: "tex", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := db.Create(f).Error; err != nil {
		t.Fatalf("create file: %v", err)
	}
	if err := db.Create(&FileVersion{FileID: f.ID, VersionNo: 1, Body: "\\documentclass{article}", CreatedAt: time.Now()}).Error; err != nil {
		t.Fatalf("create file version: %v", err)
	}
	if err := db.Create(&StructVersion{
		ProjectID: pid, VersionNo: 1,
		DocStruct: `{"structVersion":1,"body":[{"id":"b1","type":"paragraph"}]}`,
		Author:    "user", Status: "current", CreatedAt: time.Now(),
	}).Error; err != nil {
		t.Fatalf("create struct version: %v", err)
	}
	if err := db.Create(&RevisionItem{
		ProjectID: pid, Seq: 1, Reviewer: "Reviewer 1",
		Quote: "The methods section lacks detail.", Severity: "major", Status: "pending",
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}).Error; err != nil {
		t.Fatalf("create revision item: %v", err)
	}
	if err := db.Create(&Compile{ProjectID: pid, Status: "success", CreatedAt: time.Now()}).Error; err != nil {
		t.Fatalf("create compile: %v", err)
	}
	if err := db.Create(&Edit{ProjectID: pid, Status: "applied", CreatedAt: time.Now()}).Error; err != nil {
		t.Fatalf("create edit: %v", err)
	}

	// 前置断言:该写进去的都写进去了(否则下面的「删干净了」是假绿)。
	tables := []string{
		"prism_files", "prism_struct_versions", "prism_revision_items",
		"prism_compiles", "prism_edits",
	}
	for _, tbl := range tables {
		if n := countByProject(t, db, tbl, pid); n != 1 {
			t.Fatalf("前置条件不成立:%s 应有 1 行,实际 %d —— 本用例证明不了任何事", tbl, n)
		}
	}
	if n := countFileVersions(t, db, f.ID); n != 1 {
		t.Fatalf("前置条件不成立:prism_file_versions 应有 1 行,实际 %d", n)
	}

	if err := repo.DeleteProjectCascade(pid); err != nil {
		t.Fatalf("DeleteProjectCascade: %v", err)
	}

	for _, tbl := range tables {
		if n := countByProject(t, db, tbl, pid); n != 0 {
			t.Errorf("删项目后 %s 仍残留 %d 行 —— 用户点了删除,数据还在库里", tbl, n)
		}
	}
	if n := countFileVersions(t, db, f.ID); n != 0 {
		t.Errorf("删项目后 prism_file_versions 仍残留 %d 行", n)
	}
	var projLeft int64
	if err := db.Table("prism_projects").Where("id = ?", pid).Count(&projLeft).Error; err != nil {
		t.Fatalf("count project: %v", err)
	}
	if projLeft != 0 {
		t.Errorf("项目主行未删除")
	}

	// 幂等:重复删(重试 / 并发双击)不得报错。
	if err := repo.DeleteProjectCascade(pid); err != nil {
		t.Fatalf("重复 DeleteProjectCascade 应为 no-op,得到 %v", err)
	}
}

func countByProject(t *testing.T, db *gorm.DB, table string, pid uint) int64 {
	t.Helper()
	var n int64
	if err := db.Table(table).Where("project_id = ?", pid).Count(&n).Error; err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	return n
}

func countFileVersions(t *testing.T, db *gorm.DB, fileID uint) int64 {
	t.Helper()
	var n int64
	if err := db.Table("prism_file_versions").Where("file_id = ?", fileID).Count(&n).Error; err != nil {
		t.Fatalf("count prism_file_versions: %v", err)
	}
	return n
}
