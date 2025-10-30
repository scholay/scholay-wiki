package cleanup

import (
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
)

// CleanupService handles periodic database cleanup tasks
type CleanupService struct {
	db *gorm.DB
}

// NewCleanupService creates a new cleanup service
func NewCleanupService(db *gorm.DB) *CleanupService {
	return &CleanupService{db: db}
}

// Start starts all cleanup tasks as background goroutines
func (s *CleanupService) Start() {
	log.Println("Starting cleanup service...")

	// Clean expired sessions every hour
	go s.runPeriodic("expired_sessions", 1*time.Hour, s.cleanExpiredSessions)

	// Clean old snapshots every day at 3 AM
	go s.runDaily("old_snapshots", 3, 0, s.cleanOldSnapshots)

	log.Println("✓ Cleanup service started")
}

// runPeriodic runs a cleanup task at regular intervals
func (s *CleanupService) runPeriodic(name string, interval time.Duration, task func() error) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Run immediately on start
	if err := task(); err != nil {
		log.Printf("Warning: cleanup task '%s' failed: %v\n", name, err)
	}

	for range ticker.C {
		if err := task(); err != nil {
			log.Printf("Warning: cleanup task '%s' failed: %v\n", name, err)
		}
	}
}

// runDaily runs a cleanup task daily at a specific time
func (s *CleanupService) runDaily(name string, hour, minute int, task func() error) {
	for {
		now := time.Now()
		next := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, now.Location())

		// If the scheduled time has passed today, schedule for tomorrow
		if next.Before(now) {
			next = next.Add(24 * time.Hour)
		}

		duration := time.Until(next)
		log.Printf("Next '%s' cleanup scheduled at: %s (in %v)\n", name, next.Format("2006-01-02 15:04:05"), duration)

		time.Sleep(duration)

		if err := task(); err != nil {
			log.Printf("Warning: cleanup task '%s' failed: %v\n", name, err)
		}
	}
}

// cleanExpiredSessions removes expired user sessions
// Keeps sessions for 30 days after expiration for audit purposes
func (s *CleanupService) cleanExpiredSessions() error {
	cutoffTime := time.Now().Add(-30 * 24 * time.Hour)

	result := s.db.Exec(`
		DELETE FROM user_sessions
		WHERE expires_at < ?
	`, cutoffTime)

	if result.Error != nil {
		return fmt.Errorf("failed to clean expired sessions: %w", result.Error)
	}

	if result.RowsAffected > 0 {
		log.Printf("✓ Cleaned %d expired user sessions\n", result.RowsAffected)
	}

	return nil
}

// cleanOldSnapshots removes old online user snapshots
// Keeps only last 30 days of data
func (s *CleanupService) cleanOldSnapshots() error {
	cutoffTime := time.Now().Add(-30 * 24 * time.Hour)

	result := s.db.Exec(`
		DELETE FROM online_user_snapshots
		WHERE timestamp < ?
	`, cutoffTime)

	if result.Error != nil {
		return fmt.Errorf("failed to clean old snapshots: %w", result.Error)
	}

	if result.RowsAffected > 0 {
		log.Printf("✓ Cleaned %d old online user snapshots (older than 30 days)\n", result.RowsAffected)
	}

	return nil
}

// CleanExpiredSessionsNow runs the expired sessions cleanup immediately
func (s *CleanupService) CleanExpiredSessionsNow() error {
	log.Println("Running manual cleanup: expired sessions")
	return s.cleanExpiredSessions()
}

// CleanOldSnapshotsNow runs the old snapshots cleanup immediately
func (s *CleanupService) CleanOldSnapshotsNow() error {
	log.Println("Running manual cleanup: old snapshots")
	return s.cleanOldSnapshots()
}

// GetCleanupStats returns statistics about data to be cleaned
func (s *CleanupService) GetCleanupStats() (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	// Count expired sessions
	var expiredSessionsCount int64
	cutoffTime := time.Now().Add(-30 * 24 * time.Hour)
	if err := s.db.Model(&struct {
		TableName string `gorm:"-" json:"-"`
	}{}).
		Table("user_sessions").
		Where("expires_at < ?", cutoffTime).
		Count(&expiredSessionsCount).Error; err != nil {
		return nil, err
	}
	stats["expired_sessions_count"] = expiredSessionsCount

	// Count old snapshots
	var oldSnapshotsCount int64
	snapshotCutoff := time.Now().Add(-30 * 24 * time.Hour)
	if err := s.db.Model(&struct {
		TableName string `gorm:"-" json:"-"`
	}{}).
		Table("online_user_snapshots").
		Where("timestamp < ?", snapshotCutoff).
		Count(&oldSnapshotsCount).Error; err != nil {
		return nil, err
	}
	stats["old_snapshots_count"] = oldSnapshotsCount

	// Total sessions count
	var totalSessionsCount int64
	if err := s.db.Model(&struct {
		TableName string `gorm:"-" json:"-"`
	}{}).
		Table("user_sessions").
		Count(&totalSessionsCount).Error; err != nil {
		return nil, err
	}
	stats["total_sessions_count"] = totalSessionsCount

	// Total snapshots count
	var totalSnapshotsCount int64
	if err := s.db.Model(&struct {
		TableName string `gorm:"-" json:"-"`
	}{}).
		Table("online_user_snapshots").
		Count(&totalSnapshotsCount).Error; err != nil {
		return nil, err
	}
	stats["total_snapshots_count"] = totalSnapshotsCount

	return stats, nil
}
