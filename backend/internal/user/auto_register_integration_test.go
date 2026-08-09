//go:build integration

package user

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	appconfig "scholar-backend/internal/common/config"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func openUserIntegrationDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("INVITE_TEST_DSN")
	if dsn == "" {
		t.Skip("INVITE_TEST_DSN is not set")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("open user integration db: %v", err)
	}
	return db
}

func configureUserIntegrationJWT(t *testing.T) {
	t.Helper()
	previous := appconfig.AppConfig
	appconfig.AppConfig = &appconfig.Config{JWT: appconfig.JWTConfig{Secret: "invite-integration-only"}}
	t.Cleanup(func() { appconfig.AppConfig = previous })
}

func cleanupAutoRegisteredUser(t *testing.T, db *gorm.DB, userID uint) {
	t.Helper()
	if userID == 0 {
		return
	}
	if err := db.Delete(&User{}, userID).Error; err != nil {
		t.Errorf("cleanup auto-registered user %d: %v", userID, err)
	}
}

func TestIntegrationAutoRegisterEmailCreatedFlag(t *testing.T) {
	db := openUserIntegrationDB(t)
	configureUserIntegrationJWT(t)
	previousAttributor := inviteAttributor
	var attributedIDs []uint
	var attributedMethods []string
	SetInviteAttributor(func(_ context.Context, userID uint, method string) {
		attributedIDs = append(attributedIDs, userID)
		attributedMethods = append(attributedMethods, method)
	})
	t.Cleanup(func() { SetInviteAttributor(previousAttributor) })

	service := NewService(NewRepository(db))
	email := fmt.Sprintf("auto-email-%d@test.local", time.Now().UnixNano())
	first, firstToken, firstCreated, err := service.autoRegisterEmail(
		context.Background(), email, "127.0.0.1",
	)
	if err != nil {
		t.Fatalf("first autoRegisterEmail: %v", err)
	}
	t.Cleanup(func() { cleanupAutoRegisteredUser(t, db, first.ID) })
	if !firstCreated || firstToken == "" {
		t.Fatalf("first autoRegisterEmail created/token-present=(%t,%t), want (true,true)",
			firstCreated, firstToken != "")
	}

	second, secondToken, secondCreated, err := service.autoRegisterEmail(
		context.Background(), email, "127.0.0.2",
	)
	if err != nil {
		t.Fatalf("second autoRegisterEmail: %v", err)
	}
	if secondCreated || secondToken == "" || second.ID != first.ID {
		t.Fatalf("reused email user id/created/token=(%d,%t,%v), want (%d,false,token)",
			second.ID, secondCreated, secondToken != "", first.ID)
	}
	var providerCount int64
	if err := db.Model(&UserAuthProvider{}).
		Where("user_id = ? AND provider = ?", first.ID, "email").Count(&providerCount).Error; err != nil {
		t.Fatal(err)
	}
	if providerCount != 1 {
		t.Fatalf("email provider rows=%d, want 1", providerCount)
	}
	if len(attributedIDs) != 1 || attributedIDs[0] != first.ID || attributedMethods[0] != "email" {
		t.Fatalf("email attribution calls ids=%v methods=%v, want one new-user email call",
			attributedIDs, attributedMethods)
	}
}

func TestIntegrationAutoRegisterPhoneCreatedFlag(t *testing.T) {
	db := openUserIntegrationDB(t)
	configureUserIntegrationJWT(t)
	previousAttributor := inviteAttributor
	var attributedIDs []uint
	var attributedMethods []string
	SetInviteAttributor(func(_ context.Context, userID uint, method string) {
		attributedIDs = append(attributedIDs, userID)
		attributedMethods = append(attributedMethods, method)
	})
	t.Cleanup(func() { SetInviteAttributor(previousAttributor) })

	service := NewService(NewRepository(db))
	phone := fmt.Sprintf("1%010d", time.Now().UnixNano()%10_000_000_000)
	first, firstToken, firstCreated, err := service.autoRegisterPhone(
		context.Background(), phone, "127.0.0.1",
	)
	if err != nil {
		t.Fatalf("first autoRegisterPhone: %v", err)
	}
	t.Cleanup(func() { cleanupAutoRegisteredUser(t, db, first.ID) })
	if !firstCreated || firstToken == "" {
		t.Fatalf("first autoRegisterPhone created/token-present=(%t,%t), want (true,true)",
			firstCreated, firstToken != "")
	}

	second, secondToken, secondCreated, err := service.autoRegisterPhone(
		context.Background(), phone, "127.0.0.2",
	)
	if err != nil {
		t.Fatalf("second autoRegisterPhone: %v", err)
	}
	if secondCreated || secondToken == "" || second.ID != first.ID {
		t.Fatalf("reused phone user id/created/token=(%d,%t,%v), want (%d,false,token)",
			second.ID, secondCreated, secondToken != "", first.ID)
	}
	var providerCount int64
	if err := db.Model(&UserAuthProvider{}).
		Where("user_id = ? AND provider = ?", first.ID, "phone").Count(&providerCount).Error; err != nil {
		t.Fatal(err)
	}
	if providerCount != 1 {
		t.Fatalf("phone provider rows=%d, want 1", providerCount)
	}
	if len(attributedIDs) != 1 || attributedIDs[0] != first.ID || attributedMethods[0] != "phone" {
		t.Fatalf("phone attribution calls ids=%v methods=%v, want one new-user phone call",
			attributedIDs, attributedMethods)
	}
}

func TestIntegrationGenericOAuthProvidersOnlyMarkFirstLoginNew(t *testing.T) {
	db := openUserIntegrationDB(t)
	previousAttributor := inviteAttributor
	t.Cleanup(func() { SetInviteAttributor(previousAttributor) })
	service := NewService(NewRepository(db))
	handler := &Handler{service: service}
	providers := []string{"github", "google", "apple", "microsoft", "discourse"}
	userIDs := make([]uint, 0, len(providers))
	t.Cleanup(func() {
		for _, userID := range userIDs {
			cleanupAutoRegisteredUser(t, db, userID)
		}
	})

	for _, provider := range providers {
		provider := provider
		t.Run(provider, func(t *testing.T) {
			var attributedIDs []uint
			var attributedMethods []string
			SetInviteAttributor(func(_ context.Context, userID uint, method string) {
				attributedIDs = append(attributedIDs, userID)
				attributedMethods = append(attributedMethods, method)
			})
			unique := fmt.Sprintf("%s-%d", provider, time.Now().UnixNano())
			identity := oauthIdentity{
				Provider: provider, ProviderUserID: unique,
				UsernameCandidate: unique, Email: unique + "@test.local", EmailVerified: true,
			}
			first, err := handler.findOrCreateOAuthUser(context.Background(), identity)
			if err != nil {
				t.Fatalf("first %s oauth: %v", provider, err)
			}
			userIDs = append(userIDs, first.User.ID)
			if !first.IsNewUser || first.MergeToken != "" {
				t.Fatalf("first %s outcome new/merge=(%t,%t), want (true,false)",
					provider, first.IsNewUser, first.MergeToken != "")
			}

			second, err := handler.findOrCreateOAuthUser(context.Background(), identity)
			if err != nil {
				t.Fatalf("second %s oauth: %v", provider, err)
			}
			if second.IsNewUser || second.User.ID != first.User.ID || second.MergeToken != "" {
				t.Fatalf("reused %s outcome id/new/merge=(%d,%t,%t), want (%d,false,false)",
					provider, second.User.ID, second.IsNewUser, second.MergeToken != "", first.User.ID)
			}
			if len(attributedIDs) != 1 || attributedIDs[0] != first.User.ID ||
				len(attributedMethods) != 1 || attributedMethods[0] != provider {
				t.Fatalf("%s attribution ids=%v methods=%v, want one first-login call",
					provider, attributedIDs, attributedMethods)
			}
			var providerRows int64
			if err := db.Model(&UserAuthProvider{}).
				Where("user_id = ? AND provider = ?", first.User.ID, provider).
				Count(&providerRows).Error; err != nil {
				t.Fatal(err)
			}
			if providerRows != 1 {
				t.Fatalf("%s provider rows=%d, want 1", provider, providerRows)
			}
		})
	}
}
