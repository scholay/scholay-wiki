package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

type onlineSnapshotRecorder interface {
	RecordOnlineUserSnapshot() error
}

func startOnlineSnapshotTask(ctx context.Context, recorder onlineSnapshotRecorder) {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()

		log.Println("Online user snapshot task started")

		if err := recorder.RecordOnlineUserSnapshot(); err != nil {
			log.Printf("Failed to record initial online user snapshot: %v", err)
		}

		for {
			select {
			case <-ticker.C:
				if err := recorder.RecordOnlineUserSnapshot(); err != nil {
					log.Printf("Failed to record online user snapshot: %v", err)
				}
			case <-ctx.Done():
				log.Println("Online user snapshot task stopped")
				return
			}
		}
	}()
}

func runServerWithGracefulShutdown(
	router *gin.Engine,
	port string,
	onShutdown func(),
) {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	addr := ":" + port
	srv := &http.Server{
		Addr:    addr,
		Handler: router,
	}

	log.Printf("Server starting on %s", addr)
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	<-quit
	log.Println("Shutting down server...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("HTTP server forced shutdown: %v", err)
	}

	if onShutdown != nil {
		onShutdown()
	}
}

