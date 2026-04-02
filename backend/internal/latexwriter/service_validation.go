// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"

	"scholar-backend/internal/ai"
)

// AutoFixLatex 自动修复 LaTeX 代码
func (s *Service) AutoFixLatex(ctx context.Context, content string, writer io.Writer, modelLevel string) error {
	// 先验证代码
	validator := NewLatexValidator()
	result := validator.Validate(content)

	// 如果没有问题，直接返回
	if result.Valid && len(result.Warnings) == 0 {
		writeSSEData(writer, "<reply>\n✅ LaTeX 代码验证通过，无需修复。\n</reply>\n")
		return nil
	}

	return s.AutoFixLatexWithValidation(ctx, content, result, writer, modelLevel)
}

// AutoFixLatexWithValidation 根据验证结果自动修复 LaTeX 代码
func (s *Service) AutoFixLatexWithValidation(ctx context.Context, content string, result *ValidationResult, writer io.Writer, modelLevel string) error {
	// 构建修复提示词
	validator := NewLatexValidator()
	validationReport := validator.FormatValidationResult(result)

	systemPrompt := `你是一个专业的 LaTeX 语法修复专家。用户会提供一段有语法问题的 LaTeX 代码和验证报告。

你的任务是：
1. 分析验证报告中指出的问题
2. 修复所有错误和警告
3. 保持原有内容和格式不变，只修复语法问题

【重要】输出格式：
<think>
分析发现的问题...
</think>

<reply>
修复说明：
1. 问题一：xxx，已修复为 xxx
2. 问题二：xxx，已修复为 xxx
...
</reply>

<code>
修复后的完整 LaTeX 代码
</code>

注意：
- <code> 中必须输出完整的修复后代码，不能省略
- 只修复语法问题，不要改变内容或格式
- 确保修复后的代码可以正常编译`

	userMessage := fmt.Sprintf(`请修复以下 LaTeX 代码中的语法问题。

【验证报告】
%s

【原始代码】
`+"```latex"+`
%s
`+"```"+`

请根据验证报告修复所有问题，输出完整的修复后代码。`, validationReport, content)

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage},
	}

	// 使用 LaTeX Agent 配置的默认模型
	return s.streamWithModel(ctx, messages, writer, 0)
}

// ValidateLatex 验证 LaTeX 代码
func (s *Service) ValidateLatex(content string) *ValidationResult {
	validator := NewLatexValidator()
	return validator.Validate(content)
}

// AutoFixCompileError 根据编译器错误日志自动修复 LaTeX 代码
// 这是最准确的修复方式，因为它使用真正的 TeX 编译器输出
func (s *Service) AutoFixCompileError(ctx context.Context, content string, compileLog string, engine string, writer io.Writer) error {
	if engine == "" {
		engine = "pdftex"
	}

	systemPrompt := `你是一个专业的 LaTeX 编译错误修复专家。用户会提供：
1. 有编译错误的 LaTeX 代码
2. TeX 编译器（` + engine + `）输出的实际错误日志

你的任务是分析编译器的错误信息，找出并修复问题。

【重要】常见编译错误及修复方法：

1. **参数不完整**
   - "Missing number, treated as zero" → 检查数字参数是否缺失
   - 例如：\documentclass[pt,apaper] → \documentclass[12pt,a4paper]
   - 例如：margin=in → margin=1in

2. **命令未定义**
   - "Undefined control sequence" → 检查宏包是否导入或命令拼写
   - 例如：需要 \usepackage{siunitx} 才能使用 \SI

3. **数学模式错误**
   - "Missing $ inserted" → 检查数学模式是否正确闭合
   - "Missing } inserted" → 检查括号是否匹配

4. **下标/上标问题**
   - 空的下标 \beta_ 或上标 x^ → 必须有内容

5. **环境不匹配**
   - "Environment xxx undefined" → 检查环境名称和宏包
   - "\begin{xxx} ended by \end{yyy}" → 环境配对错误

6. **编码/字体问题**
   - 包含中文但缺少 xeCJK 等宏包

【输出格式】
<think>
分析编译器的错误信息...
找出具体问题所在...
</think>

<reply>
🔧 修复说明：
1. 第 N 行：问题描述 → 修复方法
2. ...
</reply>

<code>
修复后的完整 LaTeX 代码（必须完整，不能省略任何部分）
</code>

【注意】
- 必须根据实际的编译器错误信息来修复，不要猜测
- <code> 中必须输出完整的修复后代码
- 只修复导致编译错误的问题，保持其他内容不变
- 确保修复后的代码可以正常编译`

	// 截取错误日志的关键部分（避免太长）
	logSummary := compileLog
	if len(compileLog) > 3000 {
		// 优先保留包含错误的部分
		lines := strings.Split(compileLog, "\n")
		var errorLines []string
		for i, line := range lines {
			if strings.HasPrefix(line, "!") || strings.HasPrefix(line, "l.") ||
				strings.Contains(line, "Error") || strings.Contains(line, "error") {
				// 取错误行前后的上下文
				start := i - 2
				if start < 0 {
					start = 0
				}
				end := i + 3
				if end > len(lines) {
					end = len(lines)
				}
				for j := start; j < end; j++ {
					errorLines = append(errorLines, lines[j])
				}
				errorLines = append(errorLines, "---")
			}
		}
		if len(errorLines) > 0 {
			logSummary = strings.Join(errorLines, "\n")
		} else {
			// 如果没找到明显错误标记，取最后1000字符
			logSummary = compileLog[len(compileLog)-1000:]
		}
	}

	userMessage := fmt.Sprintf(`请修复以下 LaTeX 代码的编译错误。

【编译引擎】%s

【编译器错误日志】
%s

【原始代码】
`+"```latex"+`
%s
`+"```"+`

请根据编译器的错误信息修复代码，输出完整的修复后代码。`, engine, logSummary, content)

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage},
	}

	// 使用 LaTeX Agent 配置的默认模型
	return s.streamWithModel(ctx, messages, writer, 0)
}

// ConvertLatexToWord 将 LaTeX 转换为 Word 文档
// 使用 Pandoc 进行转换
func (s *Service) ConvertLatexToWord(latexContent string, filename string) ([]byte, error) {
	// 创建临时文件
	tmpDir := "/tmp/latex-export"
	if err := os.MkdirAll(tmpDir, 0755); err != nil {
		return nil, fmt.Errorf("创建临时目录失败: %w", err)
	}

	// 生成唯一文件名
	timestamp := fmt.Sprintf("%d", time.Now().UnixNano())
	texFile := fmt.Sprintf("%s/%s_%s.tex", tmpDir, filename, timestamp)
	docxFile := fmt.Sprintf("%s/%s_%s.docx", tmpDir, filename, timestamp)

	// 写入 LaTeX 文件
	if err := os.WriteFile(texFile, []byte(latexContent), 0644); err != nil {
		return nil, fmt.Errorf("写入 LaTeX 文件失败: %w", err)
	}
	defer os.Remove(texFile)

	// 检查 Pandoc 是否可用
	checkCmd := exec.Command("which", "pandoc")
	if err := checkCmd.Run(); err != nil {
		return nil, fmt.Errorf("Pandoc 未安装，无法进行转换。请在服务器上安装 Pandoc")
	}

	// 使用 Pandoc 转换
	cmd := exec.Command("pandoc",
		"-f", "latex",
		"-t", "docx",
		"-o", docxFile,
		texFile,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("Pandoc 转换失败: %s, 输出: %s", err.Error(), string(output))
	}
	defer os.Remove(docxFile)

	// 读取生成的 Word 文件
	docxBytes, err := os.ReadFile(docxFile)
	if err != nil {
		return nil, fmt.Errorf("读取 Word 文件失败: %w", err)
	}

	return docxBytes, nil
}
