// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 代码执行工具 MCP
// 提供 Python 代码执行、数据分析、图表生成功能
// 注意：实际执行需要配置安全的沙箱环境

package mcp

import (
	"context"
	"fmt"
	"strings"
)

// CodeToolProvider 代码工具提供者
type CodeToolProvider struct {
	sandboxEnabled bool
}

// NewCodeToolProvider 创建代码工具提供者
func NewCodeToolProvider() *CodeToolProvider {
	return &CodeToolProvider{
		sandboxEnabled: false, // 默认禁用，需要配置沙箱后启用
	}
}

// GetCategory 返回工具分类
func (p *CodeToolProvider) GetCategory() ToolCategory {
	return CategoryCode
}

// GetTools 返回工具定义列表
func (p *CodeToolProvider) GetTools() []ToolDefinition {
	return []ToolDefinition{
		{
			Name:        "generate_python_plot",
			Description: "生成 Python matplotlib 绑定代码（仅生成代码，不执行）",
			Category:    CategoryCode,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"plot_type": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"line", "bar", "scatter", "pie", "histogram", "heatmap", "boxplot"},
						"description": "图表类型",
					},
					"data": map[string]interface{}{
						"type":        "object",
						"description": "数据（x, y 数组或字典）",
					},
					"title": map[string]interface{}{
						"type":        "string",
						"description": "图表标题",
					},
					"x_label": map[string]interface{}{
						"type":        "string",
						"description": "X轴标签",
					},
					"y_label": map[string]interface{}{
						"type":        "string",
						"description": "Y轴标签",
					},
					"output_file": map[string]interface{}{
						"type":        "string",
						"description": "输出文件名",
						"default":     "plot.pdf",
					},
				},
				"required": []string{"plot_type", "data"},
			},
			ReadOnlyHint:   true,
			IdempotentHint: true,
		},
		{
			Name:        "generate_data_analysis_code",
			Description: "生成 Python 数据分析代码（pandas/numpy）",
			Category:    CategoryCode,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"analysis_type": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"statistics", "correlation", "regression", "clustering", "pca"},
						"description": "分析类型",
					},
					"data_description": map[string]interface{}{
						"type":        "string",
						"description": "数据描述",
					},
					"columns": map[string]interface{}{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "要分析的列名",
					},
				},
				"required": []string{"analysis_type"},
			},
			ReadOnlyHint:   true,
			IdempotentHint: true,
		},
		{
			Name:        "generate_table_code",
			Description: "从数据生成 LaTeX 表格代码",
			Category:    CategoryCode,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"headers": map[string]interface{}{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "表头",
					},
					"rows": map[string]interface{}{
						"type":        "array",
						"description": "数据行",
						"items": map[string]interface{}{
							"type":  "array",
							"items": map[string]string{"type": "string"},
						},
					},
					"caption": map[string]interface{}{
						"type":        "string",
						"description": "表格标题",
					},
					"label": map[string]interface{}{
						"type":        "string",
						"description": "引用标签",
					},
					"style": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"simple", "booktabs", "colored"},
						"description": "表格样式",
						"default":     "booktabs",
					},
				},
				"required": []string{"headers", "rows"},
			},
			IdempotentHint: true,
		},
		{
			Name:        "format_numbers",
			Description: "格式化数字为 LaTeX 科学计数法或带单位格式",
			Category:    CategoryCode,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"numbers": map[string]interface{}{
						"type":        "array",
						"items":       map[string]string{"type": "number"},
						"description": "要格式化的数字",
					},
					"format": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"scientific", "fixed", "percent", "si"},
						"description": "格式类型",
						"default":     "scientific",
					},
					"precision": map[string]interface{}{
						"type":        "integer",
						"description": "小数精度",
						"default":     3,
					},
				},
				"required": []string{"numbers"},
			},
			ReadOnlyHint: true,
		},
	}
}

// ExecuteTool 执行工具
func (p *CodeToolProvider) ExecuteTool(ctx context.Context, name string, args map[string]interface{}) (*ToolResult, error) {
	switch name {
	case "generate_python_plot":
		return p.generatePythonPlot(ctx, args)
	case "generate_data_analysis_code":
		return p.generateDataAnalysisCode(ctx, args)
	case "generate_table_code":
		return p.generateTableCode(ctx, args)
	case "format_numbers":
		return p.formatNumbers(ctx, args)
	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}

// generatePythonPlot 生成 Python 绑定代码
func (p *CodeToolProvider) generatePythonPlot(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	plotType, ok := args["plot_type"].(string)
	if !ok || plotType == "" {
		return CreateErrorResult(fmt.Errorf("plot_type is required")), nil
	}

	title, _ := args["title"].(string)
	xLabel, _ := args["x_label"].(string)
	yLabel, _ := args["y_label"].(string)
	outputFile := "plot.pdf"
	if of, ok := args["output_file"].(string); ok && of != "" {
		outputFile = of
	}

	var code strings.Builder
	code.WriteString("import matplotlib.pyplot as plt\n")
	code.WriteString("import numpy as np\n\n")

	code.WriteString("# 数据准备（请替换为实际数据）\n")

	switch plotType {
	case "line":
		code.WriteString("x = np.linspace(0, 10, 100)\n")
		code.WriteString("y = np.sin(x)\n\n")
		code.WriteString("plt.figure(figsize=(10, 6))\n")
		code.WriteString("plt.plot(x, y, '-', linewidth=2)\n")
	case "bar":
		code.WriteString("categories = ['A', 'B', 'C', 'D', 'E']\n")
		code.WriteString("values = [23, 45, 56, 78, 32]\n\n")
		code.WriteString("plt.figure(figsize=(10, 6))\n")
		code.WriteString("plt.bar(categories, values)\n")
	case "scatter":
		code.WriteString("x = np.random.randn(100)\n")
		code.WriteString("y = np.random.randn(100)\n\n")
		code.WriteString("plt.figure(figsize=(10, 6))\n")
		code.WriteString("plt.scatter(x, y, alpha=0.6)\n")
	case "pie":
		code.WriteString("labels = ['A', 'B', 'C', 'D']\n")
		code.WriteString("sizes = [15, 30, 45, 10]\n\n")
		code.WriteString("plt.figure(figsize=(8, 8))\n")
		code.WriteString("plt.pie(sizes, labels=labels, autopct='%1.1f%%')\n")
	case "histogram":
		code.WriteString("data = np.random.randn(1000)\n\n")
		code.WriteString("plt.figure(figsize=(10, 6))\n")
		code.WriteString("plt.hist(data, bins=30, edgecolor='black')\n")
	case "heatmap":
		code.WriteString("data = np.random.rand(10, 10)\n\n")
		code.WriteString("plt.figure(figsize=(10, 8))\n")
		code.WriteString("plt.imshow(data, cmap='viridis', aspect='auto')\n")
		code.WriteString("plt.colorbar()\n")
	case "boxplot":
		code.WriteString("data = [np.random.randn(100) for _ in range(5)]\n\n")
		code.WriteString("plt.figure(figsize=(10, 6))\n")
		code.WriteString("plt.boxplot(data, labels=['A', 'B', 'C', 'D', 'E'])\n")
	}

	code.WriteString("\n# 设置标签和标题\n")
	if title != "" {
		code.WriteString(fmt.Sprintf("plt.title('%s')\n", title))
	}
	if xLabel != "" {
		code.WriteString(fmt.Sprintf("plt.xlabel('%s')\n", xLabel))
	}
	if yLabel != "" {
		code.WriteString(fmt.Sprintf("plt.ylabel('%s')\n", yLabel))
	}

	code.WriteString("\n# 保存图片\n")
	code.WriteString("plt.tight_layout()\n")
	code.WriteString(fmt.Sprintf("plt.savefig('%s', dpi=300, bbox_inches='tight')\n", outputFile))
	code.WriteString("plt.close()\n")

	return CreateSuccessResult(map[string]interface{}{
		"code":        code.String(),
		"plot_type":   plotType,
		"output_file": outputFile,
		"note":        "此代码需要在 Python 环境中执行，需要安装 matplotlib 和 numpy",
	}), nil
}

// generateDataAnalysisCode 生成数据分析代码
func (p *CodeToolProvider) generateDataAnalysisCode(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	analysisType, ok := args["analysis_type"].(string)
	if !ok || analysisType == "" {
		return CreateErrorResult(fmt.Errorf("analysis_type is required")), nil
	}

	var code strings.Builder
	code.WriteString("import pandas as pd\n")
	code.WriteString("import numpy as np\n")

	switch analysisType {
	case "statistics":
		code.WriteString("from scipy import stats\n\n")
		code.WriteString("# 加载数据\n")
		code.WriteString("# df = pd.read_csv('data.csv')\n")
		code.WriteString("df = pd.DataFrame({'A': np.random.randn(100), 'B': np.random.randn(100)})\n\n")
		code.WriteString("# 描述性统计\n")
		code.WriteString("print('描述性统计：')\n")
		code.WriteString("print(df.describe())\n\n")
		code.WriteString("# 正态性检验\n")
		code.WriteString("for col in df.columns:\n")
		code.WriteString("    stat, p = stats.shapiro(df[col])\n")
		code.WriteString("    print(f'{col} 正态性检验: p={p:.4f}')\n")
	case "correlation":
		code.WriteString("import seaborn as sns\n")
		code.WriteString("import matplotlib.pyplot as plt\n\n")
		code.WriteString("# 加载数据\n")
		code.WriteString("df = pd.DataFrame(np.random.randn(100, 5), columns=['A', 'B', 'C', 'D', 'E'])\n\n")
		code.WriteString("# 计算相关系数矩阵\n")
		code.WriteString("corr = df.corr()\n")
		code.WriteString("print('相关系数矩阵：')\n")
		code.WriteString("print(corr)\n\n")
		code.WriteString("# 可视化\n")
		code.WriteString("plt.figure(figsize=(10, 8))\n")
		code.WriteString("sns.heatmap(corr, annot=True, cmap='coolwarm', center=0)\n")
		code.WriteString("plt.savefig('correlation.pdf')\n")
	case "regression":
		code.WriteString("from sklearn.linear_model import LinearRegression\n")
		code.WriteString("from sklearn.metrics import r2_score, mean_squared_error\n\n")
		code.WriteString("# 准备数据\n")
		code.WriteString("X = np.random.randn(100, 3)\n")
		code.WriteString("y = 2*X[:, 0] + 3*X[:, 1] - X[:, 2] + np.random.randn(100)*0.1\n\n")
		code.WriteString("# 线性回归\n")
		code.WriteString("model = LinearRegression()\n")
		code.WriteString("model.fit(X, y)\n\n")
		code.WriteString("# 输出结果\n")
		code.WriteString("print(f'R²: {r2_score(y, model.predict(X)):.4f}')\n")
		code.WriteString("print(f'系数: {model.coef_}')\n")
		code.WriteString("print(f'截距: {model.intercept_}')\n")
	case "clustering":
		code.WriteString("from sklearn.cluster import KMeans\n")
		code.WriteString("import matplotlib.pyplot as plt\n\n")
		code.WriteString("# 准备数据\n")
		code.WriteString("X = np.random.randn(300, 2)\n\n")
		code.WriteString("# K-means 聚类\n")
		code.WriteString("kmeans = KMeans(n_clusters=3, random_state=42)\n")
		code.WriteString("labels = kmeans.fit_predict(X)\n\n")
		code.WriteString("# 可视化\n")
		code.WriteString("plt.figure(figsize=(10, 8))\n")
		code.WriteString("plt.scatter(X[:, 0], X[:, 1], c=labels, cmap='viridis')\n")
		code.WriteString("plt.scatter(kmeans.cluster_centers_[:, 0], kmeans.cluster_centers_[:, 1], marker='x', s=200, c='red')\n")
		code.WriteString("plt.savefig('clustering.pdf')\n")
	case "pca":
		code.WriteString("from sklearn.decomposition import PCA\n")
		code.WriteString("import matplotlib.pyplot as plt\n\n")
		code.WriteString("# 准备数据\n")
		code.WriteString("X = np.random.randn(100, 10)\n\n")
		code.WriteString("# PCA 降维\n")
		code.WriteString("pca = PCA(n_components=2)\n")
		code.WriteString("X_pca = pca.fit_transform(X)\n\n")
		code.WriteString("# 输出方差解释比例\n")
		code.WriteString("print(f'方差解释比例: {pca.explained_variance_ratio_}')\n\n")
		code.WriteString("# 可视化\n")
		code.WriteString("plt.figure(figsize=(10, 8))\n")
		code.WriteString("plt.scatter(X_pca[:, 0], X_pca[:, 1], alpha=0.6)\n")
		code.WriteString("plt.xlabel('PC1')\n")
		code.WriteString("plt.ylabel('PC2')\n")
		code.WriteString("plt.savefig('pca.pdf')\n")
	}

	return CreateSuccessResult(map[string]interface{}{
		"code":          code.String(),
		"analysis_type": analysisType,
		"note":          "此代码需要在 Python 环境中执行，需要安装相应的库",
	}), nil
}

// generateTableCode 生成 LaTeX 表格代码
func (p *CodeToolProvider) generateTableCode(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	headersRaw, ok := args["headers"].([]interface{})
	if !ok || len(headersRaw) == 0 {
		return CreateErrorResult(fmt.Errorf("headers is required")), nil
	}

	rowsRaw, ok := args["rows"].([]interface{})
	if !ok || len(rowsRaw) == 0 {
		return CreateErrorResult(fmt.Errorf("rows is required")), nil
	}

	// 解析表头
	headers := []string{}
	for _, h := range headersRaw {
		if s, ok := h.(string); ok {
			headers = append(headers, s)
		}
	}

	// 解析数据行
	rows := [][]string{}
	for _, row := range rowsRaw {
		if rowArr, ok := row.([]interface{}); ok {
			rowData := []string{}
			for _, cell := range rowArr {
				if s, ok := cell.(string); ok {
					rowData = append(rowData, s)
				} else if f, ok := cell.(float64); ok {
					rowData = append(rowData, fmt.Sprintf("%.4g", f))
				}
			}
			rows = append(rows, rowData)
		}
	}

	caption, _ := args["caption"].(string)
	label, _ := args["label"].(string)
	style := "booktabs"
	if s, ok := args["style"].(string); ok {
		style = s
	}

	var code strings.Builder

	code.WriteString("\\begin{table}[htbp]\n")
	code.WriteString("    \\centering\n")
	if caption != "" {
		code.WriteString(fmt.Sprintf("    \\caption{%s}\n", caption))
	}
	if label != "" {
		code.WriteString(fmt.Sprintf("    \\label{%s}\n", label))
	}

	// 列格式
	colFormat := strings.Repeat("c", len(headers))
	code.WriteString(fmt.Sprintf("    \\begin{tabular}{%s}\n", colFormat))

	switch style {
	case "booktabs":
		code.WriteString("        \\toprule\n")
		code.WriteString("        " + strings.Join(headers, " & ") + " \\\\\n")
		code.WriteString("        \\midrule\n")
		for _, row := range rows {
			code.WriteString("        " + strings.Join(row, " & ") + " \\\\\n")
		}
		code.WriteString("        \\bottomrule\n")
	case "simple":
		code.WriteString("        \\hline\n")
		code.WriteString("        " + strings.Join(headers, " & ") + " \\\\\n")
		code.WriteString("        \\hline\n")
		for _, row := range rows {
			code.WriteString("        " + strings.Join(row, " & ") + " \\\\\n")
		}
		code.WriteString("        \\hline\n")
	default:
		code.WriteString("        \\toprule\n")
		code.WriteString("        " + strings.Join(headers, " & ") + " \\\\\n")
		code.WriteString("        \\midrule\n")
		for _, row := range rows {
			code.WriteString("        " + strings.Join(row, " & ") + " \\\\\n")
		}
		code.WriteString("        \\bottomrule\n")
	}

	code.WriteString("    \\end{tabular}\n")
	code.WriteString("\\end{table}")

	packages := []string{"booktabs"}
	if style == "colored" {
		packages = append(packages, "colortbl", "xcolor")
	}

	return CreateSuccessResult(map[string]interface{}{
		"code":     code.String(),
		"packages": packages,
	}), nil
}

// formatNumbers 格式化数字
func (p *CodeToolProvider) formatNumbers(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	numbersRaw, ok := args["numbers"].([]interface{})
	if !ok || len(numbersRaw) == 0 {
		return CreateErrorResult(fmt.Errorf("numbers is required")), nil
	}

	format := "scientific"
	if f, ok := args["format"].(string); ok {
		format = f
	}

	precision := 3
	if p, ok := args["precision"].(float64); ok {
		precision = int(p)
	}

	results := []map[string]interface{}{}

	for _, numRaw := range numbersRaw {
		num, ok := numRaw.(float64)
		if !ok {
			continue
		}

		var formatted string
		switch format {
		case "scientific":
			formatted = fmt.Sprintf("$%.*e$", precision, num)
			// 美化科学计数法
			formatted = strings.Replace(formatted, "e+", "\\times 10^{", 1)
			formatted = strings.Replace(formatted, "e-", "\\times 10^{-", 1)
			formatted = strings.TrimSuffix(formatted, "$") + "}$"
		case "fixed":
			formatted = fmt.Sprintf("$%.*f$", precision, num)
		case "percent":
			formatted = fmt.Sprintf("$%.*f\\%%$", precision-2, num*100)
		case "si":
			// 简单的 SI 前缀
			if num >= 1e9 {
				formatted = fmt.Sprintf("$%.*f\\,\\text{G}$", precision, num/1e9)
			} else if num >= 1e6 {
				formatted = fmt.Sprintf("$%.*f\\,\\text{M}$", precision, num/1e6)
			} else if num >= 1e3 {
				formatted = fmt.Sprintf("$%.*f\\,\\text{k}$", precision, num/1e3)
			} else if num < 1e-6 {
				formatted = fmt.Sprintf("$%.*f\\,\\mu$", precision, num*1e6)
			} else if num < 1e-3 {
				formatted = fmt.Sprintf("$%.*f\\,\\text{m}$", precision, num*1e3)
			} else {
				formatted = fmt.Sprintf("$%.*f$", precision, num)
			}
		default:
			formatted = fmt.Sprintf("$%.*g$", precision, num)
		}

		results = append(results, map[string]interface{}{
			"original":  num,
			"formatted": formatted,
		})
	}

	return CreateSuccessResult(map[string]interface{}{
		"results":   results,
		"format":    format,
		"precision": precision,
	}), nil
}
