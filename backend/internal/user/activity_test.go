package user

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func newActivityDryRunDB(t *testing.T, out *bytes.Buffer) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(mysql.New(mysql.Config{
		DSN:                       "activity:activity@tcp(localhost:3306)/activity?parseTime=true",
		SkipInitializeWithVersion: true,
	}), &gorm.Config{
		DryRun:                 true,
		DisableAutomaticPing:   true,
		SkipDefaultTransaction: true,
		Logger: logger.New(log.New(out, "", 0), logger.Config{
			LogLevel: logger.Info,
		}),
	})
	if err != nil {
		t.Fatalf("open dry-run database: %v", err)
	}
	return db
}

func TestUpdateLastActiveUsesAtomicOneMinuteGuardAndFreezesUpdatedAt(t *testing.T) {
	var sqlLog bytes.Buffer
	repo := NewRepository(newActivityDryRunDB(t, &sqlLog))
	activeAt := time.Date(2026, 8, 8, 12, 34, 56, 0, time.Local)

	if err := repo.UpdateLastActive(context.Background(), 42, activeAt); err != nil {
		t.Fatalf("UpdateLastActive: %v", err)
	}

	query := strings.Join(strings.Fields(strings.ToLower(sqlLog.String())), " ")
	for _, required := range []string{
		"update users set last_active_at =",
		"updated_at = updated_at",
		"last_active_at is null or last_active_at <=",
		"where id = 42",
	} {
		if !strings.Contains(query, required) {
			t.Errorf("generated SQL missing %q:\n%s", required, sqlLog.String())
		}
	}
	if lastActiveWriteInterval != time.Minute {
		t.Fatalf("last-active write interval = %s, want 1m", lastActiveWriteInterval)
	}
}

func TestOrdinaryUserWritesCannotOverwriteLastActive(t *testing.T) {
	var sqlLog bytes.Buffer
	repo := NewRepository(newActivityDryRunDB(t, &sqlLog))
	staleActiveAt := time.Date(2020, 1, 2, 3, 4, 5, 0, time.Local)
	username := "stale-model"

	if err := repo.Update(&User{ID: 42, Username: &username, LastActiveAt: &staleActiveAt}); err != nil {
		t.Fatalf("ordinary Update: %v", err)
	}
	if strings.Contains(strings.ToLower(sqlLog.String()), "last_active_at") {
		t.Fatalf("ordinary Save must not overwrite the dedicated activity column:\n%s", sqlLog.String())
	}

	sqlLog.Reset()
	if err := repo.Create(&User{Username: &username, LastActiveAt: &staleActiveAt}); err != nil {
		t.Fatalf("ordinary Create: %v", err)
	}
	if strings.Contains(strings.ToLower(sqlLog.String()), "last_active_at") {
		t.Fatalf("ordinary Create must omit last_active_at and use its DEFAULT NULL:\n%s", sqlLog.String())
	}
}

func TestRecordActivityWritesLastAndDailyFromOneExplicitEvent(t *testing.T) {
	var sqlLog bytes.Buffer
	service := NewService(NewRepository(newActivityDryRunDB(t, &sqlLog)))

	if err := service.RecordActivity(context.Background(), 42); err != nil {
		t.Fatalf("RecordActivity: %v", err)
	}

	queries := strings.ToLower(sqlLog.String())
	if !strings.Contains(queries, "update users") || !strings.Contains(queries, "set last_active_at") {
		t.Fatalf("last_active_at write missing:\n%s", sqlLog.String())
	}
	if !strings.Contains(queries, "insert ignore into user_daily_active") {
		t.Fatalf("daily-active write missing:\n%s", sqlLog.String())
	}
}

// daily 缓存只能表示「DB 已成功」。禁止恢复 SETNX pre-claim:
// 否则并发请求2会看到键就提前成功,而请求1随后 DB 失败时当天可能永久漏记。
func TestRecordActivityDoesNotPreclaimDailyCache(t *testing.T) {
	raw, err := os.ReadFile("service.go")
	if err != nil {
		t.Fatalf("read service.go: %v", err)
	}
	source := string(raw)
	if strings.Contains(source, ".SetNX(ctx, dauKey") {
		t.Fatal("daily activity must not use a pre-claim SETNX")
	}
	dbWrite := strings.Index(source, "s.repo.RecordDailyActive(ctx, userID, today)")
	confirmedWrite := strings.Index(source, "rdb.Set(ctx, dauKey")
	if dbWrite < 0 || confirmedWrite < 0 || confirmedWrite < dbWrite {
		t.Fatalf("confirmed cache must be written only after the DB call (db=%d cache=%d)", dbWrite, confirmedWrite)
	}
	if !strings.Contains(source, "user:dau:v2:confirmed:") {
		t.Fatal("daily activity must use a new confirmed-key version, isolated from legacy pre-claim keys")
	}
}

func TestRecordActivityRejectsMissingAuthenticatedUser(t *testing.T) {
	service := NewService(nil)
	if err := service.RecordActivity(context.Background(), 0); err == nil {
		t.Fatal("RecordActivity(userID=0) error = nil, want validation error")
	}
}

func TestActivityHandlerUsesAuthenticatedContextAndUnifiedResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var sqlLog bytes.Buffer
	handler := NewHandler(NewService(NewRepository(newActivityDryRunDB(t, &sqlLog))), nil)
	router := gin.New()
	router.POST("/activity", func(c *gin.Context) {
		c.Set("user_id", uint(42))
		handler.RecordActivity(c)
	})

	w := httptest.NewRecorder()
	// 即使恶意客户端携带伪造时间,处理器也不解析请求体,只用服务端 now。
	req := httptest.NewRequest(http.MethodPost, "/activity", strings.NewReader(`{"active_at":"2099-01-01T00:00:00Z"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", w.Code, w.Body.String())
	}
	var body struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Code != 0 || body.Message != "success" {
		t.Fatalf("response = %#v, want unified success", body)
	}
	if strings.Contains(sqlLog.String(), "2099-01-01") {
		t.Fatalf("client supplied timestamp leaked into activity SQL:\n%s", sqlLog.String())
	}
}

func TestActivityHandlerRejectsMissingAuthenticationContext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewHandler(NewService(nil), nil)
	router := gin.New()
	router.POST("/activity", handler.RecordActivity)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/activity", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401; body=%s", w.Code, w.Body.String())
	}
}
