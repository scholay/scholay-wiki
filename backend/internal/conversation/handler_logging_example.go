package conversation

import (
	"encoding/json"
	"fmt"
	"time"

	"scholar-backend/internal/common/telemetry"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// StreamChatWithLogging demonstrates AI chat with comprehensive logging
func (h *ChatHandler) StreamChatWithLogging(c *gin.Context) {
	logger := telemetry.NewLogger("conversation.chat.stream")
	ctx := c.Request.Context()
	
	// Start a span for the chat operation
	tracer := telemetry.GetTracer()
	ctx, span := tracer.Start(ctx, "conversation.chat.stream",
		trace.WithSpanKind(trace.SpanKindInternal),
	)
	defer span.End()
	
	// Get user and conversation context
	userID := c.GetUint("userID")
	conversationID := c.Param("id")
	
	// Log chat request initiation
	logger.Info(ctx, "Chat stream request initiated",
		attribute.Int64("user_id", int64(userID)),
		attribute.String("conversation_id", conversationID),
		attribute.String("client_ip", c.ClientIP()),
		attribute.Bool("is_streaming", true),
	)
	
	var req struct {
		Message     string   `json:"message" binding:"required"`
		ParentID    *string  `json:"parent_id"`
		Model       string   `json:"model"`
		Temperature float64  `json:"temperature"`
		MaxTokens   int      `json:"max_tokens"`
		Papers      []string `json:"papers"` // Referenced paper IDs
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		logger.Error(ctx, "Invalid chat request", err,
			attribute.Int64("user_id", int64(userID)),
			attribute.String("conversation_id", conversationID),
			attribute.String("error_type", "validation"),
		)
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	
	// Log chat request details
	logger.Debug(ctx, "Processing chat request",
		attribute.Int64("user_id", int64(userID)),
		attribute.String("conversation_id", conversationID),
		attribute.Int("message_length", len(req.Message)),
		attribute.String("model", req.Model),
		attribute.Float64("temperature", req.Temperature),
		attribute.Int("max_tokens", req.MaxTokens),
		attribute.Int("referenced_papers", len(req.Papers)),
	)
	
	// Add to span
	span.SetAttributes(
		attribute.Int64("user.id", int64(userID)),
		attribute.String("conversation.id", conversationID),
		attribute.String("ai.model", req.Model),
		attribute.Int("message.length", len(req.Message)),
		attribute.Int("papers.count", len(req.Papers)),
	)
	
	// Check user quota
	quotaCheckStart := time.Now()
	hasQuota := h.checkUserQuota(userID)
	quotaCheckDuration := time.Since(quotaCheckStart)
	
	logger.Debug(ctx, "User quota checked",
		attribute.Int64("user_id", int64(userID)),
		attribute.Bool("has_quota", hasQuota),
		attribute.Float64("check_duration_ms", float64(quotaCheckDuration.Milliseconds())),
	)
	
	if !hasQuota {
		logger.Warn(ctx, "User quota exceeded",
			attribute.Int64("user_id", int64(userID)),
			attribute.String("conversation_id", conversationID),
		)
		c.JSON(403, gin.H{"error": "Quota exceeded"})
		return
	}
	
	// Estimate token usage
	estimatedTokens := h.estimateTokens(req.Message)
	logger.Debug(ctx, "Token usage estimated",
		attribute.Int64("user_id", int64(userID)),
		attribute.Int("estimated_tokens", estimatedTokens),
	)
	
	// Set up SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	
	// Start streaming
	streamStart := time.Now()
	totalTokens := 0
	responseChunks := 0
	
	// Log stream start
	logger.Info(ctx, "Starting chat stream",
		attribute.Int64("user_id", int64(userID)),
		attribute.String("conversation_id", conversationID),
		attribute.String("model", req.Model),
	)
	
	// Simulate streaming response
	flusher, ok := c.Writer.(interface{ Flush() })
	if !ok {
		logger.Error(ctx, "Streaming not supported", fmt.Errorf("response writer doesn't support flushing"),
			attribute.Int64("user_id", int64(userID)),
		)
		c.JSON(500, gin.H{"error": "Streaming not supported"})
		return
	}
	
	// Stream response chunks
	for i := 0; i < 10; i++ {
		chunk := fmt.Sprintf("Response chunk %d based on your query about the papers...", i)
		
		// Log each chunk (in debug mode)
		if i%5 == 0 { // Log every 5th chunk to avoid log spam
			logger.Debug(ctx, "Streaming chunk",
				attribute.Int("chunk_number", i),
				attribute.Int("chunk_size", len(chunk)),
				attribute.Int64("user_id", int64(userID)),
			)
		}
		
		// Send chunk
		data := map[string]interface{}{
			"content": chunk,
			"done":    i == 9,
		}
		jsonData, _ := json.Marshal(data)
		fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
		flusher.Flush()
		
		responseChunks++
		totalTokens += len(chunk) / 4 // Rough token estimation
		
		time.Sleep(100 * time.Millisecond) // Simulate processing
	}
	
	streamDuration := time.Since(streamStart)
	
	// Log stream completion
	logger.Info(ctx, "Chat stream completed",
		attribute.Int64("user_id", int64(userID)),
		attribute.String("conversation_id", conversationID),
		attribute.Int("total_tokens", totalTokens),
		attribute.Int("response_chunks", responseChunks),
		attribute.Float64("stream_duration_ms", float64(streamDuration.Milliseconds())),
		attribute.Float64("tokens_per_second", float64(totalTokens)/streamDuration.Seconds()),
	)
	
	// Log usage event for billing
	logger.Info(ctx, "AI usage event",
		attribute.String("event_type", "ai.chat.completed"),
		attribute.Int64("user_id", int64(userID)),
		attribute.String("conversation_id", conversationID),
		attribute.String("model", req.Model),
		attribute.Int("input_tokens", estimatedTokens),
		attribute.Int("output_tokens", totalTokens),
		attribute.Int("total_tokens", estimatedTokens+totalTokens),
		attribute.Float64("duration_seconds", streamDuration.Seconds()),
		attribute.String("status", "success"),
	)
	
	// Update span with final metrics
	span.SetAttributes(
		attribute.Int("tokens.input", estimatedTokens),
		attribute.Int("tokens.output", totalTokens),
		attribute.Int("tokens.total", estimatedTokens+totalTokens),
		attribute.Float64("duration.ms", float64(streamDuration.Milliseconds())),
		attribute.String("status", "success"),
	)
	
	// Send done signal
	fmt.Fprintf(c.Writer, "data: [DONE]\n\n")
	flusher.Flush()
}

// AnalyzePaperWithLogging demonstrates paper analysis with comprehensive logging
func (h *Handler) AnalyzePaperWithLogging(c *gin.Context) {
	logger := telemetry.NewLogger("conversation.paper.analyze")
	ctx := c.Request.Context()
	
	// Start a span for analysis
	tracer := telemetry.GetTracer()
	ctx, span := tracer.Start(ctx, "paper.analyze",
		trace.WithSpanKind(trace.SpanKindInternal),
	)
	defer span.End()
	
	userID := c.GetUint("userID")
	paperID := c.Param("paperId")
	
	// Log analysis request
	logger.Info(ctx, "Paper analysis requested",
		attribute.Int64("user_id", int64(userID)),
		attribute.String("paper_id", paperID),
		attribute.String("client_ip", c.ClientIP()),
	)
	
	var req struct {
		AnalysisType string   `json:"analysis_type"` // summary, critique, implications
		Depth        string   `json:"depth"`         // basic, detailed, comprehensive
		Focus        []string `json:"focus"`         // methodology, results, conclusions
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		logger.Error(ctx, "Invalid analysis request", err,
			attribute.Int64("user_id", int64(userID)),
			attribute.String("paper_id", paperID),
		)
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}
	
	// Log analysis parameters
	logger.Debug(ctx, "Starting paper analysis",
		attribute.String("paper_id", paperID),
		attribute.String("analysis_type", req.AnalysisType),
		attribute.String("depth", req.Depth),
		attribute.Int("focus_areas", len(req.Focus)),
	)
	
	// Fetch paper details
	fetchStart := time.Now()
	// Simulate paper fetching
	paperTitle := "Sample Paper Title"
	paperAuthors := 5
	paperYear := 2024
	fetchDuration := time.Since(fetchStart)
	
	logger.Debug(ctx, "Paper details fetched",
		attribute.String("paper_id", paperID),
		attribute.String("paper_title", paperTitle),
		attribute.Int("author_count", paperAuthors),
		attribute.Int("publication_year", paperYear),
		attribute.Float64("fetch_duration_ms", float64(fetchDuration.Milliseconds())),
	)
	
	// Perform analysis
	analysisStart := time.Now()
	
	// Simulate AI analysis
	time.Sleep(2 * time.Second)
	
	analysisDuration := time.Since(analysisStart)
	tokensUsed := 1500 // Simulated token count
	
	// Log analysis completion
	logger.Info(ctx, "Paper analysis completed",
		attribute.Int64("user_id", int64(userID)),
		attribute.String("paper_id", paperID),
		attribute.String("paper_title", paperTitle),
		attribute.String("analysis_type", req.AnalysisType),
		attribute.Int("tokens_used", tokensUsed),
		attribute.Float64("analysis_duration_ms", float64(analysisDuration.Milliseconds())),
	)
	
	// Log analysis event
	logger.Info(ctx, "Analysis event",
		attribute.String("event_type", "paper.analysis.completed"),
		attribute.Int64("user_id", int64(userID)),
		attribute.String("paper_id", paperID),
		attribute.String("analysis_type", req.AnalysisType),
		attribute.String("depth", req.Depth),
		attribute.Int("tokens_used", tokensUsed),
		attribute.Float64("duration_seconds", analysisDuration.Seconds()),
	)
	
	// Update span
	span.SetAttributes(
		attribute.String("paper.id", paperID),
		attribute.String("paper.title", paperTitle),
		attribute.String("analysis.type", req.AnalysisType),
		attribute.Int("tokens.used", tokensUsed),
		attribute.Float64("duration.ms", float64(analysisDuration.Milliseconds())),
	)
	
	c.JSON(200, gin.H{
		"success":  true,
		"analysis": "Detailed analysis results here...",
		"tokens":   tokensUsed,
	})
}

// Helper functions (examples)
func (h *ChatHandler) checkUserQuota(userID uint) bool {
	// Check user's remaining quota
	return true
}

func (h *ChatHandler) estimateTokens(text string) int {
	// Rough estimation: 1 token per 4 characters
	return len(text) / 4
}
