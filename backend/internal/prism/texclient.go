// ============================================================================
// TexClient —— 与 scholar_prism_tex 编译沙箱的交互(锁定架构 D3:watcher 模型)。
//
// 后端与沙箱**只经共享卷通信**,无网络、无 Docker socket:
//   1. mkdir <workDir>/<cid>/ 写入项目文件(路径做 basename/../ 校验)
//   2. 原子写 <cid>/.request(main=<入口> / engine=<pdflatex|xelatex>)
//   3. 轮询 <cid>/status.json 出现 → 读 pdf/log/error → RemoveAll 清理
// 沙箱侧 watcher 见 prism_tex/entrypoint.sh。
// ============================================================================

package prism

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type TexClient struct {
	workDir string
	// pollTimeout 后端侧等待上限(略大于沙箱内 latexmk 超时,兜底沙箱卡死)。
	pollTimeout time.Duration
}

func NewTexClient(workDir string) *TexClient {
	if workDir == "" {
		workDir = "/data/prism-work"
	}
	return &TexClient{workDir: workDir, pollTimeout: 95 * time.Second}
}

// CompileResult 编译结果。
type CompileResult struct {
	Status       string // success | error
	PDF          []byte // 成功时的 PDF 字节
	Log          string // 完整 latexmk 日志
	ErrorSummary string // 友好错误摘要(error.txt;不回显原始 crash)
	DurationMs   int
}

// statusFile 对应沙箱写的 status.json。
type statusFile struct {
	Status     string `json:"status"`
	PDF        string `json:"pdf"`
	Log        string `json:"log"`
	Exit       int    `json:"exit"`
	DurationMs int    `json:"duration_ms"`
}

// safeRel 校验项目内相对路径:清理后不得逃出任务目录(禁绝对路径 / ..)。
func safeRel(rel string) (string, bool) {
	rel = strings.TrimSpace(rel)
	if rel == "" || strings.HasPrefix(rel, "/") {
		return "", false
	}
	clean := filepath.Clean(rel)
	if clean == ".." || strings.HasPrefix(clean, "../") || strings.Contains(clean, "/../") || filepath.IsAbs(clean) {
		return "", false
	}
	return clean, true
}

// Compile 同步执行一次编译(由调用方放在后台 goroutine + 自带超时 ctx 里跑)。
func (t *TexClient) Compile(ctx context.Context, files map[string]string, mainFile, engine string) (*CompileResult, error) {
	if engine != EngineXeLaTeX {
		engine = EnginePDFLaTeX
	}
	main, ok := safeRel(mainFile)
	if !ok {
		return nil, fmt.Errorf("prism: invalid main file %q", mainFile)
	}

	cid, err := randID()
	if err != nil {
		return nil, err
	}
	jobDir := filepath.Join(t.workDir, cid)
	if err := os.MkdirAll(jobDir, 0o755); err != nil {
		return nil, fmt.Errorf("prism: mkdir job dir: %w", err)
	}
	defer os.RemoveAll(jobDir) // 编译完即清理,沙箱卷不留垃圾

	// 写项目文件(每个路径都过 safeRel)。
	for rel, body := range files {
		clean, ok := safeRel(rel)
		if !ok {
			return nil, fmt.Errorf("prism: invalid file path %q", rel)
		}
		full := filepath.Join(jobDir, clean)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			return nil, fmt.Errorf("prism: mkdir for %q: %w", clean, err)
		}
		if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
			return nil, fmt.Errorf("prism: write %q: %w", clean, err)
		}
	}

	// 原子写 .request(先 .tmp 再 rename),确保 watcher 只在文件齐全后认领。
	req := fmt.Sprintf("main=%s\nengine=%s\n", main, engine)
	tmp := filepath.Join(jobDir, ".request.tmp")
	if err := os.WriteFile(tmp, []byte(req), 0o644); err != nil {
		return nil, fmt.Errorf("prism: write request: %w", err)
	}
	if err := os.Rename(tmp, filepath.Join(jobDir, ".request")); err != nil {
		return nil, fmt.Errorf("prism: commit request: %w", err)
	}

	// 轮询 status.json。
	statusPath := filepath.Join(jobDir, "status.json")
	deadline := time.Now().Add(t.pollTimeout)
	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()
	for {
		if _, err := os.Stat(statusPath); err == nil {
			break
		}
		if time.Now().After(deadline) {
			return nil, errors.New("prism: compile timed out (sandbox 未在限期内回写 status)")
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
		}
	}

	raw, err := os.ReadFile(statusPath)
	if err != nil {
		return nil, fmt.Errorf("prism: read status: %w", err)
	}
	var st statusFile
	if err := json.Unmarshal(raw, &st); err != nil {
		return nil, fmt.Errorf("prism: parse status: %w", err)
	}

	res := &CompileResult{Status: st.Status, DurationMs: st.DurationMs}
	if b, e := os.ReadFile(filepath.Join(jobDir, st.Log)); e == nil {
		res.Log = string(b)
	}
	if b, e := os.ReadFile(filepath.Join(jobDir, "error.txt")); e == nil {
		res.ErrorSummary = strings.TrimSpace(string(b))
	}
	if st.Status == CompileSuccess && st.PDF != "" {
		if b, e := os.ReadFile(filepath.Join(jobDir, st.PDF)); e == nil {
			res.PDF = b
		} else {
			res.Status = CompileError
			if res.ErrorSummary == "" {
				res.ErrorSummary = "编译成功但未找到 PDF 产物"
			}
		}
	}
	return res, nil
}

func randID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
