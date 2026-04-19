// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package cache

import (
	"context"
	"log/slog"
	"sync"

	"scholar-backend/internal/common/safego"
)

// CacheJob represents a cache write job
type CacheJob struct {
	Ctx   context.Context
	Fn    func() error
	ErrCh chan error // Optional error channel for callers who want to wait
}

// WorkerPool manages a pool of workers for async cache operations
type WorkerPool struct {
	workers int
	jobs    chan CacheJob
	wg      sync.WaitGroup
	once    sync.Once
}

var globalWorkerPool *WorkerPool

// InitWorkerPool initializes the global worker pool
// Should be called once at application startup
func InitWorkerPool(workerCount int, queueSize int) {
	globalWorkerPool = &WorkerPool{
		workers: workerCount,
		jobs:    make(chan CacheJob, queueSize),
	}
	globalWorkerPool.Start()
}

// GetWorkerPool returns the global worker pool instance
func GetWorkerPool() *WorkerPool {
	if globalWorkerPool == nil {
		// Fallback: create a default pool if not initialized
		slog.Warn("WorkerPool not initialized, creating default pool")
		InitWorkerPool(10, 100)
	}
	return globalWorkerPool
}

// Start starts the worker pool
func (wp *WorkerPool) Start() {
	wp.once.Do(func() {
		for i := 0; i < wp.workers; i++ {
			wp.wg.Add(1)
			id := i
			safego.Go("cache-worker-pool", func() { wp.worker(id) })
		}
		slog.Info("Cache worker pool started", "workers", wp.workers)
	})
}

// worker processes cache jobs from the queue
func (wp *WorkerPool) worker(id int) {
	defer wp.wg.Done()

	for job := range wp.jobs {
		// Check if context is already cancelled
		select {
		case <-job.Ctx.Done():
			if job.ErrCh != nil {
				job.ErrCh <- job.Ctx.Err()
			}
			continue
		default:
		}

		// Execute the cache operation
		err := job.Fn()
		if err != nil {
			slog.Error("Cache operation failed", "worker", id, "err", err)
		}

		// Send result to error channel if provided
		if job.ErrCh != nil {
			job.ErrCh <- err
		}
	}
}

// Submit submits a cache job to the worker pool (fire-and-forget)
// Returns immediately without waiting for completion
func (wp *WorkerPool) Submit(ctx context.Context, fn func() error) {
	select {
	case wp.jobs <- CacheJob{Ctx: ctx, Fn: fn}:
		// Job queued successfully
	default:
		// Queue is full, log warning and drop the job
		slog.Warn("Cache worker pool queue is full, dropping cache write")
	}
}

// Shutdown gracefully shuts down the worker pool
// Should be called during application shutdown
func (wp *WorkerPool) Shutdown() {
	close(wp.jobs)
	wp.wg.Wait()
	slog.Info("Cache worker pool shut down gracefully")
}

// ShutdownGlobalPool shuts down the global worker pool
func ShutdownGlobalPool() {
	if globalWorkerPool != nil {
		globalWorkerPool.Shutdown()
	}
}

