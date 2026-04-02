// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// ========== 文本提取方法 ==========

// extractTextFromTXT 从TXT文件提取文本
func extractTextFromTXT(content []byte) (string, error) {
	// 检测并转换编码
	if !utf8.Valid(content) {
		// 尝试GBK解码（简单处理，生产环境应使用更完善的编码检测）
		return string(content), nil
	}
	return string(content), nil
}

// extractTextFromWord 从Word文件提取文本
// 支持 .docx (Office Open XML), .doc (OLE), .rtf, .odt 等格式
func extractTextFromWord(content []byte, fileExt string) (string, error) {
	if len(content) < 4 {
		return "", fmt.Errorf("文件内容太短")
	}

	reader := bytes.NewReader(content)

	// 根据文件头判断实际格式
	// ZIP 文件以 PK (0x50 0x4B) 开头 - docx, odt
	if content[0] == 0x50 && content[1] == 0x4B {
		// 尝试作为 docx 解析
		text, err := extractTextFromDocx(reader, int64(len(content)))
		if err == nil && len(strings.TrimSpace(text)) > 0 {
			return text, nil
		}
		// 尝试作为 odt 解析
		text, err = extractTextFromODT(reader, int64(len(content)))
		if err == nil && len(strings.TrimSpace(text)) > 0 {
			return text, nil
		}
	}

	// RTF 文件以 {\rtf 开头
	if len(content) >= 5 && string(content[:5]) == "{\\rtf" {
		return extractTextFromRTF(content)
	}

	// OLE 文件以 D0 CF 11 E0 开头 - 旧版 .doc
	if content[0] == 0xD0 && content[1] == 0xCF && content[2] == 0x11 && content[3] == 0xE0 {
		return extractTextFromOldDoc(content)
	}

	// 尝试作为纯文本处理
	if utf8.Valid(content) {
		text := string(content)
		if len(strings.TrimSpace(text)) > 50 {
			return cleanupText(text), nil
		}
	}

	// 最后尝试提取可见文本
	return extractVisibleText(content), nil
}

// extractTextFromDocx 从 docx 文件提取文本
func extractTextFromDocx(reader io.ReaderAt, size int64) (string, error) {
	// 使用标准库 archive/zip 读取
	zipReader, err := zip.NewReader(reader, size)
	if err != nil {
		return "", fmt.Errorf("无法打开 docx 文件: %w", err)
	}

	var textContent strings.Builder

	// 遍历 ZIP 文件中的所有文件
	for _, f := range zipReader.File {
		// docx 的主要文本内容在 word/document.xml 中
		if f.Name == "word/document.xml" {
			rc, err := f.Open()
			if err != nil {
				continue
			}

			data, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				continue
			}

			// 从 XML 中提取纯文本
			text := extractTextFromWordXML(string(data))
			textContent.WriteString(text)
			break
		}
	}

	return textContent.String(), nil
}

// extractTextFromODT 从 OpenDocument 格式文件提取文本
func extractTextFromODT(reader io.ReaderAt, size int64) (string, error) {
	zipReader, err := zip.NewReader(reader, size)
	if err != nil {
		return "", err
	}

	var textContent strings.Builder

	for _, f := range zipReader.File {
		// ODT 的文本内容在 content.xml 中
		if f.Name == "content.xml" {
			rc, err := f.Open()
			if err != nil {
				continue
			}

			data, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				continue
			}

			// 提取 text:p 标签中的内容
			text := extractTextFromODTXML(string(data))
			textContent.WriteString(text)
			break
		}
	}

	return textContent.String(), nil
}

// extractTextFromODTXML 从 ODT XML 中提取文本
func extractTextFromODTXML(xmlContent string) string {
	var result strings.Builder
	var currentParagraph strings.Builder
	content := xmlContent
	pos := 0

	for pos < len(content) {
		tagStart := strings.Index(content[pos:], "<")
		if tagStart == -1 {
			break
		}
		tagStart += pos

		tagEnd := strings.Index(content[tagStart:], ">")
		if tagEnd == -1 {
			break
		}
		tagEnd += tagStart

		tag := content[tagStart : tagEnd+1]

		// 段落结束
		if strings.HasPrefix(tag, "</text:p") {
			paragraphText := strings.TrimSpace(currentParagraph.String())
			if paragraphText != "" {
				result.WriteString(paragraphText)
				result.WriteString("\n")
			}
			currentParagraph.Reset()
			pos = tagEnd + 1
			continue
		}

		// 换行
		if strings.HasPrefix(tag, "<text:line-break") {
			currentParagraph.WriteString("\n")
			pos = tagEnd + 1
			continue
		}

		// 文本内容（不在标签内的文本）
		nextTag := strings.Index(content[tagEnd+1:], "<")
		if nextTag > 0 {
			text := content[tagEnd+1 : tagEnd+1+nextTag]
			if strings.TrimSpace(text) != "" {
				currentParagraph.WriteString(text)
			}
		}

		pos = tagEnd + 1
	}

	return cleanupText(result.String())
}

// extractTextFromRTF 从 RTF 文件提取文本
func extractTextFromRTF(content []byte) (string, error) {
	var result strings.Builder
	text := string(content)

	inGroup := 0
	skipGroup := false
	i := 0

	for i < len(text) {
		ch := text[i]

		if ch == '{' {
			inGroup++
			// 检查是否是需要跳过的组（如 \fonttbl, \colortbl, \stylesheet 等）
			if i+1 < len(text) && text[i+1] == '\\' {
				rest := text[i+1:]
				if strings.HasPrefix(rest, "\\fonttbl") ||
					strings.HasPrefix(rest, "\\colortbl") ||
					strings.HasPrefix(rest, "\\stylesheet") ||
					strings.HasPrefix(rest, "\\info") ||
					strings.HasPrefix(rest, "\\*") {
					skipGroup = true
				}
			}
			i++
			continue
		}

		if ch == '}' {
			inGroup--
			if inGroup <= 1 {
				skipGroup = false
			}
			i++
			continue
		}

		if skipGroup {
			i++
			continue
		}

		if ch == '\\' {
			// 处理控制字
			i++
			if i >= len(text) {
				break
			}

			// 特殊字符
			switch text[i] {
			case '\\', '{', '}':
				result.WriteByte(text[i])
				i++
				continue
			case '\n', '\r':
				i++
				continue
			}

			// 读取控制字
			ctrlWord := strings.Builder{}
			for i < len(text) && ((text[i] >= 'a' && text[i] <= 'z') || (text[i] >= 'A' && text[i] <= 'Z')) {
				ctrlWord.WriteByte(text[i])
				i++
			}

			// 跳过数字参数
			for i < len(text) && ((text[i] >= '0' && text[i] <= '9') || text[i] == '-') {
				i++
			}

			// 跳过可选空格
			if i < len(text) && text[i] == ' ' {
				i++
			}

			// 处理特定控制字
			word := ctrlWord.String()
			switch word {
			case "par", "line":
				result.WriteString("\n")
			case "tab":
				result.WriteString("\t")
			case "u": // Unicode 字符
				// 简化处理，跳过
			}
			continue
		}

		// 普通字符
		if ch >= 32 && ch < 127 {
			result.WriteByte(ch)
		}
		i++
	}

	return cleanupText(result.String()), nil
}

// extractTextFromOldDoc 从旧版 .doc (OLE) 文件提取文本
func extractTextFromOldDoc(content []byte) (string, error) {
	// OLE 格式比较复杂，这里使用简化方法：
	// 查找 WordDocument 流中的文本

	var result strings.Builder
	inText := false
	textStart := 0

	// 查找可能的文本区域（连续的可打印字符）
	for i := 0; i < len(content); i++ {
		b := content[i]

		// 检测 UTF-16LE 编码的文本（Word 常用）
		if i+1 < len(content) && content[i+1] == 0 && b >= 32 && b < 127 {
			if !inText {
				inText = true
				textStart = i
			}
		} else if inText {
			// 提取这段文本
			if i-textStart > 20 { // 至少 10 个字符
				for j := textStart; j < i; j += 2 {
					if j+1 < len(content) && content[j+1] == 0 && content[j] >= 32 && content[j] < 127 {
						result.WriteByte(content[j])
					}
				}
				result.WriteString("\n")
			}
			inText = false
		}
	}

	text := result.String()
	if len(strings.TrimSpace(text)) < 50 {
		// 回退到简单方法
		return extractVisibleText(content), nil
	}

	return cleanupText(text), nil
}

// extractTextFromWordXML 从 Word XML 中提取纯文本
// Word XML 使用 <w:t> 标签包含文本内容，<w:p> 表示段落
func extractTextFromWordXML(xmlContent string) string {
	var result strings.Builder
	var currentParagraph strings.Builder

	content := xmlContent
	pos := 0

	for pos < len(content) {
		// 查找下一个标签
		tagStart := strings.Index(content[pos:], "<")
		if tagStart == -1 {
			break
		}
		tagStart += pos

		tagEnd := strings.Index(content[tagStart:], ">")
		if tagEnd == -1 {
			break
		}
		tagEnd += tagStart

		tag := content[tagStart : tagEnd+1]

		// 处理段落结束标签 </w:p> - 添加换行
		if strings.HasPrefix(tag, "</w:p") {
			paragraphText := strings.TrimSpace(currentParagraph.String())
			if paragraphText != "" {
				result.WriteString(paragraphText)
				result.WriteString("\n")
			}
			currentParagraph.Reset()
			pos = tagEnd + 1
			continue
		}

		// 处理表格行结束 </w:tr> - 添加换行
		if strings.HasPrefix(tag, "</w:tr") {
			paragraphText := strings.TrimSpace(currentParagraph.String())
			if paragraphText != "" {
				result.WriteString(paragraphText)
				result.WriteString("\n")
			}
			currentParagraph.Reset()
			pos = tagEnd + 1
			continue
		}

		// 处理表格单元格结束 </w:tc> - 添加制表符分隔
		if strings.HasPrefix(tag, "</w:tc") {
			currentParagraph.WriteString("\t")
			pos = tagEnd + 1
			continue
		}

		// 处理换行标签 <w:br/>
		if strings.HasPrefix(tag, "<w:br") {
			currentParagraph.WriteString("\n")
			pos = tagEnd + 1
			continue
		}

		// 处理文本标签 <w:t> 或 <w:t ...>
		if strings.HasPrefix(tag, "<w:t>") || strings.HasPrefix(tag, "<w:t ") {
			// 找到 </w:t> 结束标签
			textStart := tagEnd + 1
			textEndTag := strings.Index(content[textStart:], "</w:t>")
			if textEndTag != -1 {
				textEnd := textStart + textEndTag
				text := content[textStart:textEnd]
				currentParagraph.WriteString(text)
				pos = textEnd + 6 // 跳过 </w:t>
				continue
			}
		}

		pos = tagEnd + 1
	}

	// 处理最后一个段落
	paragraphText := strings.TrimSpace(currentParagraph.String())
	if paragraphText != "" {
		result.WriteString(paragraphText)
		result.WriteString("\n")
	}

	text := result.String()

	// 如果没有提取到文本，尝试备用方法
	if strings.TrimSpace(text) == "" {
		return extractTextFallback(xmlContent)
	}

	// 清理多余的空行
	text = cleanupText(text)

	return text
}

// extractTextFallback 备用文本提取方法 - 只提取 <w:t> 标签内容
func extractTextFallback(xmlContent string) string {
	var result strings.Builder

	// 使用简单的状态机提取 <w:t>...</w:t> 之间的内容
	content := xmlContent
	for {
		// 查找 <w:t 开始
		idx := strings.Index(content, "<w:t")
		if idx == -1 {
			break
		}
		content = content[idx:]

		// 找到 >
		endBracket := strings.Index(content, ">")
		if endBracket == -1 {
			break
		}

		// 找到 </w:t>
		closeTag := strings.Index(content[endBracket:], "</w:t>")
		if closeTag == -1 {
			content = content[endBracket+1:]
			continue
		}

		// 提取文本
		text := content[endBracket+1 : endBracket+closeTag]
		result.WriteString(text)

		content = content[endBracket+closeTag+6:]
	}

	return result.String()
}

// cleanupText 清理文本中的多余空白
func cleanupText(text string) string {
	// 统一换行符
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")

	// 合并连续空白
	lines := strings.Split(text, "\n")
	var cleanLines []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			cleanLines = append(cleanLines, line)
		}
	}

	return strings.Join(cleanLines, "\n")
}

// extractVisibleText 从二进制文件中提取可见文本
func extractVisibleText(content []byte) string {
	var result strings.Builder

	for _, b := range content {
		// 只保留可打印字符
		if b >= 32 && b < 127 {
			result.WriteByte(b)
		} else if b == '\n' || b == '\r' || b == '\t' {
			result.WriteByte(' ')
		}
	}

	// 清理结果
	text := result.String()
	// 移除连续空格
	for strings.Contains(text, "  ") {
		text = strings.ReplaceAll(text, "  ", " ")
	}

	return strings.TrimSpace(text)
}

// extractTextFromXML 从XML文件提取文本（去除标签）
func extractTextFromXML(content []byte) (string, error) {
	text := string(content)

	// 移除 XML 声明
	xmlDeclPattern := regexp.MustCompile(`<\?xml[^?]*\?>`)
	text = xmlDeclPattern.ReplaceAllString(text, "")

	// 移除 CDATA 标记但保留内容
	cdataPattern := regexp.MustCompile(`<!\[CDATA\[(.*?)\]\]>`)
	text = cdataPattern.ReplaceAllString(text, "$1")

	// 移除注释
	commentPattern := regexp.MustCompile(`<!--[\s\S]*?-->`)
	text = commentPattern.ReplaceAllString(text, "")

	// 移除所有 XML 标签
	tagPattern := regexp.MustCompile(`<[^>]+>`)
	text = tagPattern.ReplaceAllString(text, " ")

	// 解码常见的 XML 实体
	text = decodeXMLEntities(text)

	// 清理多余空白
	text = cleanupWhitespace(text)

	return text, nil
}

// extractTextFromHTML 从HTML文件提取文本（去除标签和脚本）
func extractTextFromHTML(content []byte) (string, error) {
	text := string(content)

	// 移除 DOCTYPE 声明
	doctypePattern := regexp.MustCompile(`<!DOCTYPE[^>]*>`)
	text = doctypePattern.ReplaceAllString(text, "")

	// 移除 script 标签及其内容
	scriptPattern := regexp.MustCompile(`(?i)<script[^>]*>[\s\S]*?</script>`)
	text = scriptPattern.ReplaceAllString(text, "")

	// 移除 style 标签及其内容
	stylePattern := regexp.MustCompile(`(?i)<style[^>]*>[\s\S]*?</style>`)
	text = stylePattern.ReplaceAllString(text, "")

	// 移除 noscript 标签及其内容
	noscriptPattern := regexp.MustCompile(`(?i)<noscript[^>]*>[\s\S]*?</noscript>`)
	text = noscriptPattern.ReplaceAllString(text, "")

	// 移除注释
	commentPattern := regexp.MustCompile(`<!--[\s\S]*?-->`)
	text = commentPattern.ReplaceAllString(text, "")

	// 将块级元素替换为换行（保持段落结构）
	blockTags := []string{"p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6",
		"li", "tr", "td", "th", "article", "section", "header", "footer", "aside", "nav"}
	for _, tag := range blockTags {
		// 处理开始标签
		openPattern := regexp.MustCompile(`(?i)<` + tag + `[^>]*>`)
		text = openPattern.ReplaceAllString(text, "\n")
		// 处理结束标签
		closePattern := regexp.MustCompile(`(?i)</` + tag + `>`)
		text = closePattern.ReplaceAllString(text, "\n")
	}

	// 移除所有剩余的 HTML 标签
	tagPattern := regexp.MustCompile(`<[^>]+>`)
	text = tagPattern.ReplaceAllString(text, " ")

	// 解码 HTML 实体
	text = decodeHTMLEntities(text)

	// 清理多余空白
	text = cleanupWhitespace(text)

	return text, nil
}

// decodeXMLEntities 解码 XML 实体
func decodeXMLEntities(text string) string {
	replacements := map[string]string{
		"&lt;":   "<",
		"&gt;":   ">",
		"&amp;":  "&",
		"&apos;": "'",
		"&quot;": "\"",
	}
	for entity, char := range replacements {
		text = strings.ReplaceAll(text, entity, char)
	}

	// 解码数字实体 &#xxx; 和 &#xXXX;
	numEntityPattern := regexp.MustCompile(`&#(\d+);`)
	text = numEntityPattern.ReplaceAllStringFunc(text, func(match string) string {
		numStr := match[2 : len(match)-1]
		if num, err := strconv.Atoi(numStr); err == nil && num < 65536 {
			return string(rune(num))
		}
		return match
	})

	hexEntityPattern := regexp.MustCompile(`(?i)&#x([0-9a-f]+);`)
	text = hexEntityPattern.ReplaceAllStringFunc(text, func(match string) string {
		hexStr := match[3 : len(match)-1]
		if num, err := strconv.ParseInt(hexStr, 16, 32); err == nil && num < 65536 {
			return string(rune(num))
		}
		return match
	})

	return text
}

// decodeHTMLEntities 解码 HTML 实体
func decodeHTMLEntities(text string) string {
	// 首先处理 XML 基本实体
	text = decodeXMLEntities(text)

	// 常见 HTML 实体
	htmlEntities := map[string]string{
		"&nbsp;":   " ",
		"&ensp;":   " ",
		"&emsp;":   " ",
		"&thinsp;": " ",
		"&ndash;":  "\u2013", // –
		"&mdash;":  "\u2014", // —
		"&lsquo;":  "\u2018", // '
		"&rsquo;":  "\u2019", // '
		"&ldquo;":  "\u201C", // "
		"&rdquo;":  "\u201D", // "
		"&bull;":   "\u2022", // •
		"&hellip;": "\u2026", // …
		"&copy;":   "\u00A9", // ©
		"&reg;":    "\u00AE", // ®
		"&trade;":  "\u2122", // ™
		"&deg;":    "\u00B0", // °
		"&plusmn;": "\u00B1", // ±
		"&times;":  "\u00D7", // ×
		"&divide;": "\u00F7", // ÷
		"&frac12;": "\u00BD", // ½
		"&frac14;": "\u00BC", // ¼
		"&frac34;": "\u00BE", // ¾
		"&euro;":   "\u20AC", // €
		"&pound;":  "\u00A3", // £
		"&yen;":    "\u00A5", // ¥
		"&cent;":   "\u00A2", // ¢
		"&alpha;":  "\u03B1", // α
		"&beta;":   "\u03B2", // β
		"&gamma;":  "\u03B3", // γ
		"&delta;":  "\u03B4", // δ
		"&pi;":     "\u03C0", // π
		"&sigma;":  "\u03C3", // σ
		"&omega;":  "\u03C9", // ω
	}
	for entity, char := range htmlEntities {
		text = strings.ReplaceAll(text, entity, char)
	}

	return text
}

// cleanupWhitespace 清理多余的空白字符
func cleanupWhitespace(text string) string {
	// 将多个空格替换为单个空格
	spacePattern := regexp.MustCompile(`[ \t]+`)
	text = spacePattern.ReplaceAllString(text, " ")

	// 将多个换行替换为最多两个换行
	newlinePattern := regexp.MustCompile(`\n{3,}`)
	text = newlinePattern.ReplaceAllString(text, "\n\n")

	// 移除行首行尾空格
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSpace(line)
	}
	text = strings.Join(lines, "\n")

	return strings.TrimSpace(text)
}

// extractTextFromPDF 从PDF文件提取文本
func extractTextFromPDF(content []byte) (string, error) {
	// PDF 文本提取比较复杂，这里提供简化实现
	// 生产环境建议使用专门的 PDF 库如 pdfcpu 或调用外部工具

	text := extractVisibleText(content)
	if len(text) < 100 {
		return "", fmt.Errorf("无法从PDF中提取足够的文本内容，请尝试复制文本后直接粘贴")
	}

	return text, nil
}
