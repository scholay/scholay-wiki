// ============================================================================
// Scholay PDF 解析 —— pdfjs 子进程 + 字体大小启发式
// ----------------------------------------------------------------------------
// 由 Go 主进程 spawn `node <PDF_EXTRACT_SCRIPT>` 子进程,PDF 原始字节 stdin →
// 结构化 JSON stdout(每个 text item 带 font size / x / y / width)。详见
// `backend/pdf-extract/extract.js`。
//
// 比 pdftotext 优势:拿到字体尺寸 + 位置 → 标题 = 第一页中字号最大的连续 block
//   (与 Zotero PDFWorker.getRecognizerData 一个思路)。
// 适用面:有 / 无 DOI 的所有学术 PDF;预印本;讲义;扫描后 OCR'd 的 PDF。
//
// 兜底:
//   - Node 没装 / 脚本不在 → 返回 ErrPdfExtractMissing,handler 走 503
//   - PDF 损坏 → 返回错误,handler 让用户重新上传
//   - 提取出空 items → 当作"无文本 PDF"(扫描件未 OCR),title/abstract 空,
//     依靠下游 AI 兜底失败提示
// ============================================================================

package pdfparse

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
)

// ErrPdfExtractMissing Node 子进程 / 脚本不可用时返回
var ErrPdfExtractMissing = errors.New("node or pdf-extract script not found (set PDF_EXTRACT_SCRIPT or install node)")

// Result 解析出的结构化结果(handler 层只关心这层)
type Result struct {
	Title    string
	Abstract string
	FullText string
	DOI      string
	ArXivID  string
	// 以下字段是 heuristic 抽取,可能为空。
	// 与 DOI / 标题不同,这几个没法靠 regex 精准定位,所以质量参差不齐 ——
	// 作者:多人按 , / ; / & / "and" 切分,首字母大写
	// 年份:1900-2030 内 4 位数字,优先取 (YYYY) / © YYYY / Published YYYY
	// 期刊:页头 / 页脚的 ALL CAPS 行 或 含 "Journal of" / "Proceedings" / "Transactions" 等关键字
	Authors []string
	Year    uint16
	Venue   string
}

// Options 解析参数
type Options struct {
	// MaxFullTextChars 截断 full_text 上限(防 AI prompt 撑爆),默认 60_000
	MaxFullTextChars int
	// Timeout Node 子进程超时,默认 60s
	Timeout time.Duration
}

const (
	defaultMaxFullText = 60_000
	defaultTimeout     = 60 * time.Second

	// pdfParseMaxConcurrent 同时运行的 node 解析子进程上限。每个解析驻留 ~50MB 输入 +
	// 一个 node 进程(数十 MB)+ 完整缓冲的 JSON stdout, 无上限并发会在突发上传下把单
	// 后端容器顶到 OOM(审计 high)。4 是经验默认, 可按容器内存上调。
	pdfParseMaxConcurrent = 4
	// pdfParseAcquireTimeout 抢解析槽位的最长等待。等不到就快速失败 —— 否则大量请求会各自
	// 攥着已读入的 50MB 输入在闸门前排队, 把内存堆爆。失败对 handler 是非致命(降级为
	// 「未抽取到元数据」, 用户仍可手填保存)。
	pdfParseAcquireTimeout = 8 * time.Second
	// maxPdfStdoutBytes node stdout 缓冲上限, 防失控子进程输出顶爆内存。extract.mjs 限 25 页,
	// 正常输出远小于此; 纯防御。
	maxPdfStdoutBytes = 64 << 20
)

// ErrPdfParseBusy 解析槽位已满且等待超时。handler 视为非致命(降级处理)。
var ErrPdfParseBusy = errors.New("pdf parse: too many concurrent parses, retry later")

// pdfParseSem 解析并发闸门(带缓冲 channel 当信号量)。
var pdfParseSem = make(chan struct{}, pdfParseMaxConcurrent)

// acquirePdfParseSlot 抢一个解析槽位: 先非阻塞试拿, 满了再限时等待, 超时快速失败。
func acquirePdfParseSlot(ctx context.Context) error {
	select {
	case pdfParseSem <- struct{}{}:
		return nil
	default:
	}
	timer := time.NewTimer(pdfParseAcquireTimeout)
	defer timer.Stop()
	select {
	case pdfParseSem <- struct{}{}:
		return nil
	case <-timer.C:
		return ErrPdfParseBusy
	case <-ctx.Done():
		return ErrPdfParseBusy
	}
}

// cappedBuffer 是带上限的写缓冲: 超过 cap 时 Write 返回错误, 让 cmd.Run 失败,
// 防止失控的 node 子进程把 stdout 写到撑爆内存。
type cappedBuffer struct {
	buf bytes.Buffer
	cap int
}

func (b *cappedBuffer) Write(p []byte) (int, error) {
	if b.buf.Len()+len(p) > b.cap {
		return 0, fmt.Errorf("pdf-extract: output exceeded %d bytes cap", b.cap)
	}
	return b.buf.Write(p)
}

// 与 extract.js 输出对应的 raw 结构
type rawItem struct {
	Str    string  `json:"str"`
	Font   string  `json:"font"`
	Size   float64 `json:"size"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	EOL    bool    `json:"eol"`
}

type rawPage struct {
	ViewportHeight float64   `json:"viewport_height"`
	ViewportWidth  float64   `json:"viewport_width"`
	Items          []rawItem `json:"items"`
}

type rawExtract struct {
	Pages             []rawPage `json:"pages"`
	FullText          string    `json:"full_text"`
	NumPagesTotal     int       `json:"num_pages_total"`
	NumPagesExtracted int       `json:"num_pages_extracted"`
}

// scriptPath 找 extract.js —— PDF_EXTRACT_SCRIPT 环境变量优先,否则按惯用位置探
func scriptPath() (string, error) {
	if p := os.Getenv("PDF_EXTRACT_SCRIPT"); p != "" {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	candidates := []string{
		"/app/pdf-extract/extract.mjs",      // Docker 容器内
		"./pdf-extract/extract.mjs",         // 本地 dev,backend 目录下跑
		"./backend/pdf-extract/extract.mjs", // 本地 dev,repo root 跑
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", ErrPdfExtractMissing
}

// Parse 入口
func Parse(ctx context.Context, pdfData []byte, opts Options) (*Result, error) {
	if _, err := exec.LookPath("node"); err != nil {
		return nil, ErrPdfExtractMissing
	}
	script, err := scriptPath()
	if err != nil {
		return nil, err
	}

	// 并发闸门: 限制同时运行的 node 子进程数, 防突发上传 OOM。等不到槽位即返回 ErrPdfParseBusy。
	if err := acquirePdfParseSlot(ctx); err != nil {
		return nil, err
	}
	defer func() { <-pdfParseSem }()

	timeout := opts.Timeout
	if timeout == 0 {
		timeout = defaultTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "node", script)
	cmd.Stdin = bytes.NewReader(pdfData)
	stdout := cappedBuffer{cap: maxPdfStdoutBytes}
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("pdf-extract failed: %w (stderr: %s)", err, truncate(stderr.String(), 400))
	}

	var raw rawExtract
	if err := json.Unmarshal(stdout.buf.Bytes(), &raw); err != nil {
		return nil, fmt.Errorf("pdf-extract: invalid JSON output: %w", err)
	}

	maxLen := opts.MaxFullTextChars
	if maxLen == 0 {
		maxLen = defaultMaxFullText
	}
	full := raw.FullText
	if len(full) > maxLen {
		full = full[:maxLen]
	}

	title, titleMaxY := extractTitleFromPages(raw.Pages)
	abstract := extractAbstractFromText(full)
	doi, arxiv := extractIdentifiers(full)
	authors := extractAuthorsFromPages(raw.Pages, titleMaxY)
	year := extractYearFromText(full)
	venue := extractVenueFromPages(raw.Pages)

	return &Result{
		Title:    title,
		Abstract: abstract,
		FullText: full,
		DOI:      doi,
		ArXivID:  arxiv,
		Authors:  authors,
		Year:     year,
		Venue:    venue,
	}, nil
}

// ============================================================================
// 标题抽取 —— 字体大小启发式
// ============================================================================
// 思路(借鉴 Zotero recognize-pdf 服务端做法的简化版):
//   1. 只看第一页
//   2. 把 items 按 Y 坐标分组成 "行"(同行 Y 差 ≤ 3 pt)
//   3. 每行算 max font size,跳过"页眉/页脚区"(顶部 Y < 70 pt)
//   4. 找全页里最大的 font size = title size 候选
//   5. 收集所有 font size 接近 title size(±15%)、且不在 page-header 区的行
//   6. 取连续(Y 单调,行距 ≤ 2.2 倍 size)的最长块作为标题文本
//   7. 过滤明显的非标题(ARTICLE / OPEN / DOI URL 等 boilerplate)
//
// 这套对带 DOI / 不带 DOI 的论文都好使:不依赖关键词,直接看视觉层级。

const headerExclusionY = 70 // 顶端 page header 区域上限(典型 60-65 pt)

var nonTitleBoilerplate = []*regexp.Regexp{
	// 文章类型徽章 / OA 标识(整行全大写关键词)
	regexp.MustCompile(`^\s*(?:ARTICLE|REVIEW|REVIEWS?\s+ARTICLE|RESEARCH\s+ARTICLE|ORIGINAL\s+RESEARCH|ORIGINAL\s+ARTICLE|EDITORIAL|LETTER|LETTERS?|COMMENT|COMMENTARY|PERSPECTIVE|BRIEF\s+COMMUNICATION|NEWS|OPINION|OPEN|OPEN\s+ACCESS|HYPOTHESIS|SHORT\s+REPORT|CASE\s+REPORT|TECHNICAL\s+NOTE)\s*$`),
	regexp.MustCompile(`(?i)\bhttps?://(?:dx\.)?doi\.org/`),
	regexp.MustCompile(`(?i)^\s*doi:\s`),
	regexp.MustCompile(`(?i)^\s*arxiv:\s*\d`),
	regexp.MustCompile(`(?i)^\s*preprint\b`),
	regexp.MustCompile(`(?i)^\s*available\s+online`),
	regexp.MustCompile(`^\s*\d+\s*$`), // 纯页码
	regexp.MustCompile(`(?i)^\s*copyright\b`),
	regexp.MustCompile(`(?i)^\s*©`),
	regexp.MustCompile(`(?i)^\s*vol(\.|ume)\s*\d`),
	regexp.MustCompile(`^\s*\d{4}\s*[-–]\s*\d{4}\s*$`),
}

type pageLine struct {
	Y       float64
	Size    float64 // 该行最大字号
	X       float64 // 起始 x(最左 item 的 x)
	Text    string
	Indices []int // 原 items 索引,debug 用
}

// 返回 (title, titleMaxY) —— titleMaxY 是标题块最底行的 Y 坐标,
// 让作者抽取知道"从哪里往下找";为 0 时表示没抽出标题。
func extractTitleFromPages(pages []rawPage) (string, float64) {
	if len(pages) == 0 || len(pages[0].Items) == 0 {
		return "", 0
	}
	page := pages[0]

	// 1) Y 分组成行 —— 同行容差 3pt
	lines := groupItemsToLines(page.Items, 3.0)

	// 2) 排除 page-header 区
	var candidates []pageLine
	for _, ln := range lines {
		if ln.Y < headerExclusionY {
			continue
		}
		text := strings.TrimSpace(ln.Text)
		if text == "" {
			continue
		}
		if isBoilerplate(text) {
			continue
		}
		// 全大写行(作者名 / 单位)通常不是 title
		if isMostlyUpper(text) {
			continue
		}
		// 太短的"行"(< 3 chars)通常是页码或分隔符
		if len([]rune(text)) < 3 {
			continue
		}
		candidates = append(candidates, pageLine{
			Y:    ln.Y,
			Size: ln.Size,
			X:    ln.X,
			Text: text,
		})
	}
	if len(candidates) == 0 {
		return "", 0
	}

	// 3) 找最大 font size
	maxSize := 0.0
	for _, c := range candidates {
		if c.Size > maxSize {
			maxSize = c.Size
		}
	}
	if maxSize <= 0 {
		return "", 0
	}

	// 4) 收集所有"接近最大字号"的行(>= 90% maxSize) —— 标题可能跨多行
	sizeThreshold := maxSize * 0.9
	var titleCandidates []pageLine
	for _, c := range candidates {
		if c.Size >= sizeThreshold {
			titleCandidates = append(titleCandidates, c)
		}
	}
	if len(titleCandidates) == 0 {
		return "", 0
	}

	// 5) 在候选里按 Y 升序排,挑出最大连续块(行距 ≤ 2.2 倍字号)
	sort.Slice(titleCandidates, func(i, j int) bool {
		return titleCandidates[i].Y < titleCandidates[j].Y
	})
	bestStart, bestEnd, curStart := 0, 0, 0
	for i := 1; i < len(titleCandidates); i++ {
		gap := titleCandidates[i].Y - titleCandidates[i-1].Y
		if gap > maxSize*2.2 {
			if (i - 1 - curStart) > (bestEnd - bestStart) {
				bestStart = curStart
				bestEnd = i - 1
			}
			curStart = i
		}
	}
	if (len(titleCandidates) - 1 - curStart) > (bestEnd - bestStart) {
		bestStart = curStart
		bestEnd = len(titleCandidates) - 1
	}

	// 6) 拼成最终标题 + 记录块底 Y
	parts := make([]string, 0, bestEnd-bestStart+1)
	var maxY float64
	for i := bestStart; i <= bestEnd; i++ {
		parts = append(parts, titleCandidates[i].Text)
		if titleCandidates[i].Y > maxY {
			maxY = titleCandidates[i].Y
		}
	}
	title := strings.Join(parts, " ")
	title = normalizeWhitespace(title)
	if len([]rune(title)) < 5 {
		return "", 0
	}
	return title, maxY
}

func isBoilerplate(s string) bool {
	for _, re := range nonTitleBoilerplate {
		if re.MatchString(s) {
			return true
		}
	}
	return false
}

func isMostlyUpper(s string) bool {
	letters := 0
	upper := 0
	for _, r := range s {
		if unicode.IsLetter(r) {
			letters++
			if unicode.IsUpper(r) {
				upper++
			}
		}
	}
	return letters >= 3 && upper*100/letters >= 80
}

// groupItemsToLines 按 Y 坐标分组 —— 同行 Y 差 ≤ tolerance
// 同行内按 X 升序拼接 text(中间适当加空格);返回按 Y 升序的行列表
func groupItemsToLines(items []rawItem, tolerance float64) []pageLine {
	if len(items) == 0 {
		return nil
	}
	// 按 Y 升序、相同 Y 按 X 升序排
	sorted := make([]int, len(items))
	for i := range sorted {
		sorted[i] = i
	}
	sort.SliceStable(sorted, func(a, b int) bool {
		ia, ib := items[sorted[a]], items[sorted[b]]
		if math.Abs(ia.Y-ib.Y) <= tolerance {
			return ia.X < ib.X
		}
		return ia.Y < ib.Y
	})

	lines := []pageLine{}
	var cur *pageLine
	var curIndices []int
	var curParts []string
	var curMaxSize float64
	var curMinX float64
	var curY float64

	flush := func() {
		if cur == nil {
			return
		}
		cur.Text = strings.TrimSpace(strings.Join(curParts, " "))
		cur.Size = curMaxSize
		cur.X = curMinX
		cur.Y = curY
		cur.Indices = curIndices
		lines = append(lines, *cur)
		cur = nil
		curIndices = nil
		curParts = nil
		curMaxSize = 0
		curMinX = 0
	}

	for _, idx := range sorted {
		it := items[idx]
		if cur == nil {
			cur = &pageLine{}
			curY = it.Y
			curMinX = it.X
		}
		if math.Abs(it.Y-curY) > tolerance {
			flush()
			cur = &pageLine{}
			curY = it.Y
			curMinX = it.X
		}
		curIndices = append(curIndices, idx)
		curParts = append(curParts, it.Str)
		if it.Size > curMaxSize {
			curMaxSize = it.Size
		}
		if it.X < curMinX {
			curMinX = it.X
		}
	}
	flush()
	return lines
}

// ============================================================================
// 摘要抽取 —— 与旧版同款,基于关键词
// ============================================================================
// 用 full_text 字符串而非 pages —— 抽 Abstract 章节标题"靠词不靠位置",
// 这块旧版心智成熟,继续用。

var abstractStartHints = []*regexp.Regexp{
	regexp.MustCompile(`(?i)^\s*abstract\s*[:.]?\s*$`),
	regexp.MustCompile(`(?i)^\s*abstract\s*[—–-]\s*`),
	regexp.MustCompile(`^\s*摘\s*要\s*[:：.]?\s*$`),
}

var abstractInlineHints = []*regexp.Regexp{
	regexp.MustCompile(`(?i)^\s*abstract\s*[:.—–-]\s*(.+)$`),
	regexp.MustCompile(`^\s*摘\s*要\s*[:：.]\s*(.+)$`),
}

var abstractStopHints = []*regexp.Regexp{
	regexp.MustCompile(`(?i)^\s*keywords?\s*[:：.]`),
	regexp.MustCompile(`(?i)^\s*key\s*words?\s*[:：.]`),
	regexp.MustCompile(`(?i)^\s*\d+\.?\s*introduction\b`),
	regexp.MustCompile(`(?i)^\s*i\.\s*introduction\b`),
	regexp.MustCompile(`^\s*1\s*引\s*言\s*$`),
	regexp.MustCompile(`^\s*关键词\s*[:：.]`),
}

func extractAbstractFromText(text string) string {
	if text == "" {
		return ""
	}
	lines := strings.Split(text, "\n")
	scanEnd := len(lines)
	if scanEnd > 400 {
		scanEnd = 400
	}

	startIdx := -1
	var inlineStart string
	for i := 0; i < scanEnd; i++ {
		line := lines[i]
		for _, re := range abstractInlineHints {
			if m := re.FindStringSubmatch(line); m != nil {
				startIdx = i + 1
				inlineStart = strings.TrimSpace(m[1])
				goto found
			}
		}
		for _, re := range abstractStartHints {
			if re.MatchString(line) {
				startIdx = i + 1
				goto found
			}
		}
	}
found:
	if startIdx < 0 {
		return ""
	}

	var sb strings.Builder
	if inlineStart != "" {
		sb.WriteString(inlineStart)
	}
	emptyStreak := 0
	for i := startIdx; i < scanEnd; i++ {
		line := lines[i]
		trim := strings.TrimSpace(line)
		stopped := false
		for _, re := range abstractStopHints {
			if re.MatchString(line) {
				stopped = true
				break
			}
		}
		if stopped {
			break
		}
		if trim == "" {
			emptyStreak++
			if emptyStreak >= 2 {
				break
			}
			continue
		}
		emptyStreak = 0
		if sb.Len() > 0 {
			sb.WriteByte(' ')
		}
		sb.WriteString(trim)
		if sb.Len() > 4000 {
			break
		}
	}
	result := normalizeWhitespace(sb.String())
	if len([]rune(result)) < 80 {
		return ""
	}
	return result
}

// ============================================================================
// Identifiers: DOI / arXiv 抽取(Zotero 同款 regex)
// ============================================================================

var (
	doiPattern   = regexp.MustCompile(`\b10\.[0-9]{4,}/[^\s&"']*[^\s&"'.,]`)
	arxivPattern = regexp.MustCompile(`(?i)\barxiv[:\s]+(\d{4}\.\d{4,5}(?:v\d+)?)`)
)

func extractIdentifiers(text string) (doi string, arxivID string) {
	if m := doiPattern.FindString(text); m != "" {
		doi = trimUnbalancedTail(m)
	}
	if m := arxivPattern.FindStringSubmatch(text); len(m) >= 2 {
		arxivID = m[1]
	}
	return
}

func trimUnbalancedTail(s string) string {
	for len(s) > 0 {
		last := s[len(s)-1]
		if last == ')' && !strings.ContainsRune(s, '(') {
			s = s[:len(s)-1]
			continue
		}
		if last == '}' && !strings.ContainsRune(s, '{') {
			s = s[:len(s)-1]
			continue
		}
		break
	}
	return s
}

// ============================================================================
// 作者抽取(基于结构化页面)
// ============================================================================
// 作者通常出现在标题正下方,字号比标题小、比正文略大或相当;一行/多行,
// 名字之间用 , ; & "and" 分隔;末尾常带 superscript 数字(单位编号)和
// email 标记 ✉ * † ‡ § 等。
//
// 策略:
//   1. 从 titleMaxY 下方 5pt 开始,扫到 titleMaxY+250pt 为止(不超过那块通常是 abstract)
//   2. 遇到 "Abstract" 关键词立即终止
//   3. 收前 1-3 个候选行,拼接后按 author-name 解析
//   4. 单个名字长度 3-80,去重后最多保留 30 个(防意外炸数据)

var (
	// 上标 / 角标数字、email 标记、单位编号(论文常用)
	authorAdornmentsRe = regexp.MustCompile("[⁰-₟¹²³†‡§¶⁋★☆*✉#§¶†‡]")
	// 单位编号后跟逗号(如 "Yang Smith, John¹, Jane²,3" 切完没问题)
	authorSplitRe = regexp.MustCompile(`(?i)\s*(?:[,;]|\s+and\s+|\s+&\s+|\s*·\s*)\s*`)
	// 裸数字(单位编号脱掉 superscript 后残留的普通数字)。提到包级, 与本文件其它
	// 正则一致, 避免每次 parseAuthorNames 调用都重新编译。
	bareDigitRe = regexp.MustCompile(`\b\d{1,3}\b`)
)

func extractAuthorsFromPages(pages []rawPage, titleMaxY float64) []string {
	if len(pages) == 0 || titleMaxY <= 0 {
		return nil
	}
	page := pages[0]
	lines := groupItemsToLines(page.Items, 3.0)

	var rawParts []string
	collected := 0
	for _, ln := range lines {
		if ln.Y <= titleMaxY+1 {
			continue // 上方(含标题)跳过
		}
		if ln.Y > titleMaxY+250 {
			break // 太远,大概率已进入 abstract 区域
		}
		text := strings.TrimSpace(ln.Text)
		if text == "" {
			continue
		}
		if isBoilerplate(text) {
			continue
		}
		// 遇 Abstract 关键词 → 停
		if isAbstractStartLine(text) {
			break
		}
		// 行太长(> 300 chars)大概率是 abstract 起始,跳出
		if len([]rune(text)) > 300 {
			break
		}
		// 行太短没意义
		if len([]rune(text)) < 4 {
			continue
		}
		// 纯数字(页码 / 杂噪)跳过
		if isMostlyNumeric(text) {
			continue
		}
		rawParts = append(rawParts, text)
		collected++
		if collected >= 3 {
			break
		}
	}
	if len(rawParts) == 0 {
		return nil
	}
	return parseAuthorNames(strings.Join(rawParts, ", "))
}

func parseAuthorNames(raw string) []string {
	// 1) 去 superscript / email 标记
	cleaned := authorAdornmentsRe.ReplaceAllString(raw, "")
	// 2) 去裸数字(单位编号脱掉 superscript 后会留下普通数字)—— 切前先 strip
	cleaned = bareDigitRe.ReplaceAllString(cleaned, "")
	// 3) 切割
	parts := authorSplitRe.Split(cleaned, -1)
	seen := make(map[string]bool)
	out := []string{}
	for _, p := range parts {
		p = strings.TrimSpace(p)
		// 去掉残留的标点和多余空白
		p = strings.Trim(p, " ,;.·-")
		p = normalizeWhitespace(p)
		if p == "" {
			continue
		}
		runes := []rune(p)
		if len(runes) < 3 || len(runes) > 80 {
			continue
		}
		// 至少要有 1 个字母(否则可能是纯数字脏数据)
		hasLetter := false
		for _, r := range runes {
			if unicode.IsLetter(r) {
				hasLetter = true
				break
			}
		}
		if !hasLetter {
			continue
		}
		key := strings.ToLower(p)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, p)
		if len(out) >= 30 {
			break
		}
	}
	return out
}

func isAbstractStartLine(s string) bool {
	for _, re := range abstractStartHints {
		if re.MatchString(s) {
			return true
		}
	}
	for _, re := range abstractInlineHints {
		if re.MatchString(s) {
			return true
		}
	}
	return false
}

func isMostlyNumeric(s string) bool {
	letters, digits := 0, 0
	for _, r := range s {
		switch {
		case unicode.IsLetter(r):
			letters++
		case unicode.IsDigit(r):
			digits++
		}
	}
	return digits > letters && digits >= 3
}

// ============================================================================
// 年份抽取
// ============================================================================
// 优先级:
//   1. "(2025)" 圆括号包数字 —— 期刊引用块标准格式
//   2. "© 2025" / "© 2025," 版权年份
//   3. "Published" / "Published online" / "Received" / "Accepted" 关键词后跟年份
//   4. 前 3000 字符里任意 1900-2030 的 4 位数字(兜底,选第一个)

var (
	yearParenRe   = regexp.MustCompile(`\((19[0-9]{2}|20[0-2][0-9])\)`)
	yearCopyRe    = regexp.MustCompile(`(?:©|\(c\)|copyright)\s*(19[0-9]{2}|20[0-2][0-9])`)
	yearPubRe     = regexp.MustCompile(`(?i)(?:published(?:\s+online)?|received|accepted|appeared)[^0-9]*(19[0-9]{2}|20[0-2][0-9])`)
	yearAnyRe     = regexp.MustCompile(`\b(19[0-9]{2}|20[0-2][0-9])\b`)
	yearCopySoft  = regexp.MustCompile(`(?i)copyright[^0-9]{0,20}(19[0-9]{2}|20[0-2][0-9])`)
)

func extractYearFromText(text string) uint16 {
	if text == "" {
		return 0
	}
	head := text
	if len(head) > 3000 {
		head = head[:3000]
	}
	// 1)(YYYY)
	if m := yearParenRe.FindStringSubmatch(head); len(m) >= 2 {
		return parseYearU16(m[1])
	}
	// 2)© / copyright
	if m := yearCopyRe.FindStringSubmatch(head); len(m) >= 2 {
		return parseYearU16(m[1])
	}
	if m := yearCopySoft.FindStringSubmatch(head); len(m) >= 2 {
		return parseYearU16(m[1])
	}
	// 3) Published / Received / Accepted
	if m := yearPubRe.FindStringSubmatch(head); len(m) >= 2 {
		return parseYearU16(m[1])
	}
	// 4) 兜底:第一个 1900-2030
	if m := yearAnyRe.FindStringSubmatch(head); len(m) >= 2 {
		return parseYearU16(m[1])
	}
	return 0
}

func parseYearU16(s string) uint16 {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + int(r-'0')
	}
	if n < 1900 || n > 2099 {
		return 0
	}
	return uint16(n)
}

// ============================================================================
// 期刊(venue)抽取
// ============================================================================
// 学术 PDF 期刊名常见位置:
//   - 第一页底部 citation 行:"HUMANITIES AND SOCIAL ... | (2026)13:9 | https://doi.org/..."
//   - 第一页顶部页头:"ARTICLE      HUMANITIES AND SOCIAL ..."(伴随 ARTICLE 标签)
//   - 标题上方:"Journal of X" / "Proceedings of X" / "IEEE Transactions on X"
//
// 策略(取 first match):
//   1. 全部行扫一遍,符合"含管道 |"模式 + 管道前是 ALL CAPS / 期刊关键字 → 优先取
//   2. 行匹配 "Journal of" / "Proceedings of" / "Transactions on" / "Conference on" 关键字
//   3. ALL CAPS 长行(>15 字符,在页头或页脚区) —— 兜底

var (
	venueKeywordRe = regexp.MustCompile(`(?i)\b(?:journal\s+of|proceedings\s+of|transactions\s+on|conference\s+on|symposium\s+on|review\s+of|annual\s+review\s+of|letters\s+on|advances\s+in)\b`)
)

func extractVenueFromPages(pages []rawPage) string {
	if len(pages) == 0 {
		return ""
	}
	page := pages[0]
	vh := page.ViewportHeight
	lines := groupItemsToLines(page.Items, 3.0)

	// 第一轮:含 "|" 的引用行
	for _, ln := range lines {
		text := strings.TrimSpace(ln.Text)
		if !strings.Contains(text, "|") {
			continue
		}
		// "<venue> | (year)vol:iss | https://doi.org/..."
		head := strings.TrimSpace(strings.SplitN(text, "|", 2)[0])
		// 去开头的 "ARTICLE " 等前缀
		head = stripLeadingArticleTag(head)
		if isLikelyVenue(head) {
			return head
		}
	}
	// 第二轮:含 journal/proceedings/transactions 等关键字
	for _, ln := range lines {
		text := strings.TrimSpace(ln.Text)
		if venueKeywordRe.MatchString(text) {
			// 截断到行尾(避免拼上 DOI 等噪声)
			v := normalizeWhitespace(text)
			if len([]rune(v)) > 200 {
				v = string([]rune(v)[:200])
			}
			return v
		}
	}
	// 第三轮:页头 / 页脚的 ALL CAPS 长行
	for _, ln := range lines {
		inHeader := ln.Y < 70
		inFooter := vh > 0 && ln.Y > vh-80
		if !inHeader && !inFooter {
			continue
		}
		text := strings.TrimSpace(ln.Text)
		text = stripLeadingArticleTag(text)
		if isLikelyVenue(text) {
			return text
		}
	}
	return ""
}

func isLikelyVenue(s string) bool {
	runes := []rune(s)
	if len(runes) < 10 || len(runes) > 200 {
		return false
	}
	// 必须以字母开头,排除以数字/标点开头的页码行
	if !unicode.IsLetter(runes[0]) {
		return false
	}
	// 含 DOI / URL 等 → 不是 venue
	if strings.Contains(strings.ToLower(s), "doi.org") || strings.Contains(strings.ToLower(s), "http") {
		return false
	}
	// 关键字命中 → likely
	if venueKeywordRe.MatchString(s) {
		return true
	}
	// 大量大写字母 → likely(期刊全大写命名常见)
	if isMostlyUpper(s) {
		return true
	}
	return false
}

// stripLeadingArticleTag 去掉 "ARTICLE " / "REVIEW " 等首部标签
var leadingArticleTagRe = regexp.MustCompile(`^\s*(?:ARTICLE|REVIEW|RESEARCH\s+ARTICLE|EDITORIAL|LETTER|COMMENT|PERSPECTIVE|OPEN|OPEN\s+ACCESS)\s+`)

func stripLeadingArticleTag(s string) string {
	return leadingArticleTagRe.ReplaceAllString(s, "")
}

// ============================================================================
// utils
// ============================================================================

var whitespaceRe = regexp.MustCompile(`\s+`)

func normalizeWhitespace(s string) string {
	return strings.TrimSpace(whitespaceRe.ReplaceAllString(s, " "))
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
