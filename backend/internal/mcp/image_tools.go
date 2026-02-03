// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 图片工具 MCP
// 提供图表生成、图片处理、LaTeX 图片代码生成功能

package mcp

import (
	"context"
	"fmt"
	"strings"
)

// ImageToolProvider 图片工具提供者
type ImageToolProvider struct{}

// DiagramNode 图表节点类型
type DiagramNode struct {
	ID    string
	Label string
	Shape string
}

// DiagramEdge 图表边类型
type DiagramEdge struct {
	From  string
	To    string
	Label string
}

// NewImageToolProvider 创建图片工具提供者
func NewImageToolProvider() *ImageToolProvider {
	return &ImageToolProvider{}
}

// GetCategory 返回工具分类
func (p *ImageToolProvider) GetCategory() ToolCategory {
	return CategoryImage
}

// GetTools 返回工具定义列表
func (p *ImageToolProvider) GetTools() []ToolDefinition {
	return []ToolDefinition{
		{
			Name:        "generate_tikz_chart",
			Description: "生成 TikZ 图表代码（柱状图、折线图、饼图等）",
			Category:    CategoryImage,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"chart_type": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"bar", "line", "pie", "scatter", "area"},
						"description": "图表类型",
					},
					"data": map[string]interface{}{
						"type":        "array",
						"description": "数据点数组，每个元素包含 label 和 value",
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"label": map[string]string{"type": "string"},
								"value": map[string]string{"type": "number"},
							},
						},
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
				},
				"required": []string{"chart_type", "data"},
			},
			IdempotentHint: true,
		},
		{
			Name:        "generate_tikz_diagram",
			Description: "生成 TikZ 流程图/结构图代码",
			Category:    CategoryImage,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"diagram_type": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"flowchart", "tree", "network", "block", "timeline"},
						"description": "图表类型",
					},
					"nodes": map[string]interface{}{
						"type":        "array",
						"description": "节点数组",
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"id":    map[string]string{"type": "string"},
								"label": map[string]string{"type": "string"},
								"shape": map[string]string{"type": "string"},
							},
						},
					},
					"edges": map[string]interface{}{
						"type":        "array",
						"description": "边/连接数组",
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"from":  map[string]string{"type": "string"},
								"to":    map[string]string{"type": "string"},
								"label": map[string]string{"type": "string"},
							},
						},
					},
					"title": map[string]interface{}{
						"type":        "string",
						"description": "图表标题",
					},
				},
				"required": []string{"diagram_type", "nodes"},
			},
			IdempotentHint: true,
		},
		{
			Name:        "generate_figure_code",
			Description: "生成 LaTeX 图片插入代码（\\includegraphics）",
			Category:    CategoryImage,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"filename": map[string]interface{}{
						"type":        "string",
						"description": "图片文件名",
					},
					"caption": map[string]interface{}{
						"type":        "string",
						"description": "图片说明",
					},
					"label": map[string]interface{}{
						"type":        "string",
						"description": "引用标签（如 fig:example）",
					},
					"width": map[string]interface{}{
						"type":        "string",
						"description": "图片宽度（如 0.8\\textwidth）",
						"default":     "0.8\\textwidth",
					},
					"position": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"h", "t", "b", "p", "H", "htbp"},
						"description": "图片位置",
						"default":     "htbp",
					},
				},
				"required": []string{"filename"},
			},
			IdempotentHint: true,
		},
		{
			Name:        "generate_subfigures",
			Description: "生成多子图 LaTeX 代码",
			Category:    CategoryImage,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"figures": map[string]interface{}{
						"type":        "array",
						"description": "子图数组",
						"items": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"filename": map[string]string{"type": "string"},
								"caption":  map[string]string{"type": "string"},
								"label":    map[string]string{"type": "string"},
							},
						},
					},
					"main_caption": map[string]interface{}{
						"type":        "string",
						"description": "主图说明",
					},
					"main_label": map[string]interface{}{
						"type":        "string",
						"description": "主图标签",
					},
					"columns": map[string]interface{}{
						"type":        "integer",
						"description": "每行子图数量",
						"default":     2,
					},
				},
				"required": []string{"figures"},
			},
			IdempotentHint: true,
		},
		{
			Name:        "suggest_figure_packages",
			Description: "根据图片需求建议 LaTeX 宏包",
			Category:    CategoryImage,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"requirements": map[string]interface{}{
						"type":        "array",
						"description": "需求列表：tikz, pgfplots, subfigure, svg, etc.",
						"items":       map[string]string{"type": "string"},
					},
				},
				"required": []string{"requirements"},
			},
			ReadOnlyHint: true,
		},
	}
}

// ExecuteTool 执行工具
func (p *ImageToolProvider) ExecuteTool(ctx context.Context, name string, args map[string]interface{}) (*ToolResult, error) {
	switch name {
	case "generate_tikz_chart":
		return p.generateTikzChart(ctx, args)
	case "generate_tikz_diagram":
		return p.generateTikzDiagram(ctx, args)
	case "generate_figure_code":
		return p.generateFigureCode(ctx, args)
	case "generate_subfigures":
		return p.generateSubfigures(ctx, args)
	case "suggest_figure_packages":
		return p.suggestFigurePackages(ctx, args)
	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}

// generateTikzChart 生成 TikZ 图表
func (p *ImageToolProvider) generateTikzChart(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	chartType, ok := args["chart_type"].(string)
	if !ok || chartType == "" {
		return CreateErrorResult(fmt.Errorf("chart_type is required")), nil
	}

	dataRaw, ok := args["data"].([]interface{})
	if !ok || len(dataRaw) == 0 {
		return CreateErrorResult(fmt.Errorf("data is required")), nil
	}

	// 解析数据
	var labels []string
	var values []float64
	for _, item := range dataRaw {
		if m, ok := item.(map[string]interface{}); ok {
			if label, ok := m["label"].(string); ok {
				labels = append(labels, label)
			}
			if value, ok := m["value"].(float64); ok {
				values = append(values, value)
			}
		}
	}

	title, _ := args["title"].(string)
	xLabel, _ := args["x_label"].(string)
	yLabel, _ := args["y_label"].(string)

	var code strings.Builder

	switch chartType {
	case "bar":
		code.WriteString(generateBarChart(labels, values, title, xLabel, yLabel))
	case "line":
		code.WriteString(generateLineChart(labels, values, title, xLabel, yLabel))
	case "pie":
		code.WriteString(generatePieChart(labels, values, title))
	case "scatter":
		code.WriteString(generateScatterChart(labels, values, title, xLabel, yLabel))
	default:
		code.WriteString(generateBarChart(labels, values, title, xLabel, yLabel))
	}

	return CreateSuccessResult(map[string]interface{}{
		"code":       code.String(),
		"chart_type": chartType,
		"packages":   []string{"tikz", "pgfplots"},
	}), nil
}

// generateBarChart 生成柱状图
func generateBarChart(labels []string, values []float64, title, xLabel, yLabel string) string {
	var code strings.Builder
	code.WriteString("\\begin{tikzpicture}\n")
	code.WriteString("\\begin{axis}[\n")
	code.WriteString("    ybar,\n")
	code.WriteString("    enlargelimits=0.15,\n")
	code.WriteString("    legend style={at={(0.5,-0.15)}, anchor=north, legend columns=-1},\n")
	if title != "" {
		code.WriteString(fmt.Sprintf("    title={%s},\n", title))
	}
	if xLabel != "" {
		code.WriteString(fmt.Sprintf("    xlabel={%s},\n", xLabel))
	}
	if yLabel != "" {
		code.WriteString(fmt.Sprintf("    ylabel={%s},\n", yLabel))
	}
	code.WriteString("    symbolic x coords={")
	code.WriteString(strings.Join(labels, ", "))
	code.WriteString("},\n")
	code.WriteString("    xtick=data,\n")
	code.WriteString("    nodes near coords,\n")
	code.WriteString("    nodes near coords align={vertical},\n")
	code.WriteString("]\n")
	code.WriteString("\\addplot coordinates {")
	for i, label := range labels {
		code.WriteString(fmt.Sprintf("(%s, %.2f) ", label, values[i]))
	}
	code.WriteString("};\n")
	code.WriteString("\\end{axis}\n")
	code.WriteString("\\end{tikzpicture}")
	return code.String()
}

// generateLineChart 生成折线图
func generateLineChart(labels []string, values []float64, title, xLabel, yLabel string) string {
	var code strings.Builder
	code.WriteString("\\begin{tikzpicture}\n")
	code.WriteString("\\begin{axis}[\n")
	if title != "" {
		code.WriteString(fmt.Sprintf("    title={%s},\n", title))
	}
	if xLabel != "" {
		code.WriteString(fmt.Sprintf("    xlabel={%s},\n", xLabel))
	}
	if yLabel != "" {
		code.WriteString(fmt.Sprintf("    ylabel={%s},\n", yLabel))
	}
	code.WriteString("    symbolic x coords={")
	code.WriteString(strings.Join(labels, ", "))
	code.WriteString("},\n")
	code.WriteString("    xtick=data,\n")
	code.WriteString("    grid=major,\n")
	code.WriteString("    mark=*,\n")
	code.WriteString("]\n")
	code.WriteString("\\addplot coordinates {")
	for i, label := range labels {
		code.WriteString(fmt.Sprintf("(%s, %.2f) ", label, values[i]))
	}
	code.WriteString("};\n")
	code.WriteString("\\end{axis}\n")
	code.WriteString("\\end{tikzpicture}")
	return code.String()
}

// generatePieChart 生成饼图
func generatePieChart(labels []string, values []float64, title string) string {
	var code strings.Builder
	code.WriteString("\\begin{tikzpicture}\n")
	code.WriteString("\\pie[text=legend")
	if title != "" {
		code.WriteString(fmt.Sprintf(", title={%s}", title))
	}
	code.WriteString("]{")
	
	parts := []string{}
	for i, label := range labels {
		parts = append(parts, fmt.Sprintf("%.1f/%s", values[i], label))
	}
	code.WriteString(strings.Join(parts, ", "))
	code.WriteString("}\n")
	code.WriteString("\\end{tikzpicture}")
	return code.String()
}

// generateScatterChart 生成散点图
func generateScatterChart(labels []string, values []float64, title, xLabel, yLabel string) string {
	var code strings.Builder
	code.WriteString("\\begin{tikzpicture}\n")
	code.WriteString("\\begin{axis}[\n")
	code.WriteString("    only marks,\n")
	if title != "" {
		code.WriteString(fmt.Sprintf("    title={%s},\n", title))
	}
	if xLabel != "" {
		code.WriteString(fmt.Sprintf("    xlabel={%s},\n", xLabel))
	}
	if yLabel != "" {
		code.WriteString(fmt.Sprintf("    ylabel={%s},\n", yLabel))
	}
	code.WriteString("    grid=major,\n")
	code.WriteString("]\n")
	code.WriteString("\\addplot coordinates {")
	for i := range labels {
		code.WriteString(fmt.Sprintf("(%d, %.2f) ", i+1, values[i]))
	}
	code.WriteString("};\n")
	code.WriteString("\\end{axis}\n")
	code.WriteString("\\end{tikzpicture}")
	return code.String()
}

// generateTikzDiagram 生成 TikZ 图表
func (p *ImageToolProvider) generateTikzDiagram(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	diagramType, ok := args["diagram_type"].(string)
	if !ok || diagramType == "" {
		return CreateErrorResult(fmt.Errorf("diagram_type is required")), nil
	}

	nodesRaw, ok := args["nodes"].([]interface{})
	if !ok || len(nodesRaw) == 0 {
		return CreateErrorResult(fmt.Errorf("nodes is required")), nil
	}

	// 解析节点
	var nodes []DiagramNode
	for _, item := range nodesRaw {
		if m, ok := item.(map[string]interface{}); ok {
			node := DiagramNode{
				ID:    getImageString(m, "id"),
				Label: getImageString(m, "label"),
				Shape: getImageString(m, "shape"),
			}
			if node.ID == "" {
				node.ID = fmt.Sprintf("node%d", len(nodes))
			}
			if node.Shape == "" {
				node.Shape = "rectangle"
			}
			nodes = append(nodes, node)
		}
	}

	// 解析边
	var edges []DiagramEdge
	if edgesRaw, ok := args["edges"].([]interface{}); ok {
		for _, item := range edgesRaw {
			if m, ok := item.(map[string]interface{}); ok {
				edges = append(edges, DiagramEdge{
					From:  getImageString(m, "from"),
					To:    getImageString(m, "to"),
					Label: getImageString(m, "label"),
				})
			}
		}
	}

	title, _ := args["title"].(string)

	var code strings.Builder

	switch diagramType {
	case "flowchart":
		code.WriteString(generateFlowchartCode(nodes, edges, title))
	case "tree":
		code.WriteString(generateTreeCode(nodes, edges, title))
	default:
		code.WriteString(generateFlowchartCode(nodes, edges, title))
	}

	return CreateSuccessResult(map[string]interface{}{
		"code":         code.String(),
		"diagram_type": diagramType,
		"packages":     []string{"tikz", "tikz-qtree"},
	}), nil
}

func getImageString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// generateFlowchartCode 生成流程图
func generateFlowchartCode(nodes []DiagramNode, edges []DiagramEdge, title string) string {
	var code strings.Builder
	code.WriteString("\\begin{tikzpicture}[node distance=2cm]\n")
	code.WriteString("\\tikzstyle{startstop} = [rectangle, rounded corners, minimum width=3cm, minimum height=1cm, text centered, draw=black, fill=red!30]\n")
	code.WriteString("\\tikzstyle{process} = [rectangle, minimum width=3cm, minimum height=1cm, text centered, draw=black, fill=orange!30]\n")
	code.WriteString("\\tikzstyle{decision} = [diamond, minimum width=3cm, minimum height=1cm, text centered, draw=black, fill=green!30]\n")
	code.WriteString("\\tikzstyle{arrow} = [thick,->,>=stealth]\n\n")

	// 生成节点
	for i, node := range nodes {
		style := "process"
		if i == 0 {
			style = "startstop"
		}
		position := ""
		if i > 0 {
			position = fmt.Sprintf("[below of=%s]", nodes[i-1].ID)
		}
		code.WriteString(fmt.Sprintf("\\node (%s) %s [%s] {%s};\n", node.ID, position, style, node.Label))
	}

	code.WriteString("\n")

	// 生成边
	for _, edge := range edges {
		if edge.Label != "" {
			code.WriteString(fmt.Sprintf("\\draw [arrow] (%s) -- node[anchor=east] {%s} (%s);\n", edge.From, edge.Label, edge.To))
		} else {
			code.WriteString(fmt.Sprintf("\\draw [arrow] (%s) -- (%s);\n", edge.From, edge.To))
		}
	}

	code.WriteString("\\end{tikzpicture}")
	return code.String()
}

// generateTreeCode 生成树形图
func generateTreeCode(nodes []DiagramNode, edges []DiagramEdge, title string) string {
	var code strings.Builder
	code.WriteString("\\begin{tikzpicture}[sibling distance=4cm, level distance=2cm]\n")
	code.WriteString("\\tikzstyle{every node}=[circle, draw, minimum size=1cm]\n")

	if len(nodes) > 0 {
		code.WriteString(fmt.Sprintf("\\node {%s}\n", nodes[0].Label))
		if len(nodes) > 1 {
			code.WriteString("  child { node {")
			code.WriteString(nodes[1].Label)
			code.WriteString("} }\n")
		}
		if len(nodes) > 2 {
			code.WriteString("  child { node {")
			code.WriteString(nodes[2].Label)
			code.WriteString("} };\n")
		}
	}

	code.WriteString("\\end{tikzpicture}")
	return code.String()
}

// generateFigureCode 生成图片插入代码
func (p *ImageToolProvider) generateFigureCode(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	filename, ok := args["filename"].(string)
	if !ok || filename == "" {
		return CreateErrorResult(fmt.Errorf("filename is required")), nil
	}

	caption, _ := args["caption"].(string)
	label, _ := args["label"].(string)
	width := "0.8\\textwidth"
	if w, ok := args["width"].(string); ok && w != "" {
		width = w
	}
	position := "htbp"
	if pos, ok := args["position"].(string); ok && pos != "" {
		position = pos
	}

	var code strings.Builder
	code.WriteString(fmt.Sprintf("\\begin{figure}[%s]\n", position))
	code.WriteString("    \\centering\n")
	code.WriteString(fmt.Sprintf("    \\includegraphics[width=%s]{%s}\n", width, filename))
	if caption != "" {
		code.WriteString(fmt.Sprintf("    \\caption{%s}\n", caption))
	}
	if label != "" {
		code.WriteString(fmt.Sprintf("    \\label{%s}\n", label))
	}
	code.WriteString("\\end{figure}")

	return CreateSuccessResult(map[string]interface{}{
		"code":     code.String(),
		"filename": filename,
		"packages": []string{"graphicx"},
	}), nil
}

// generateSubfigures 生成多子图代码
func (p *ImageToolProvider) generateSubfigures(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	figuresRaw, ok := args["figures"].([]interface{})
	if !ok || len(figuresRaw) == 0 {
		return CreateErrorResult(fmt.Errorf("figures is required")), nil
	}

	mainCaption, _ := args["main_caption"].(string)
	mainLabel, _ := args["main_label"].(string)
	columns := 2
	if col, ok := args["columns"].(float64); ok {
		columns = int(col)
	}

	subWidth := fmt.Sprintf("%.2f\\textwidth", 0.9/float64(columns))

	var code strings.Builder
	code.WriteString("\\begin{figure}[htbp]\n")
	code.WriteString("    \\centering\n")

	for i, item := range figuresRaw {
		if m, ok := item.(map[string]interface{}); ok {
			filename := getImageString(m, "filename")
			caption := getImageString(m, "caption")
			label := getImageString(m, "label")

			code.WriteString(fmt.Sprintf("    \\begin{subfigure}[b]{%s}\n", subWidth))
			code.WriteString("        \\centering\n")
			code.WriteString(fmt.Sprintf("        \\includegraphics[width=\\textwidth]{%s}\n", filename))
			if caption != "" {
				code.WriteString(fmt.Sprintf("        \\caption{%s}\n", caption))
			}
			if label != "" {
				code.WriteString(fmt.Sprintf("        \\label{%s}\n", label))
			}
			code.WriteString("    \\end{subfigure}\n")

			// 添加换行符
			if (i+1)%columns == 0 && i < len(figuresRaw)-1 {
				code.WriteString("    \\\\[1em]\n")
			} else if i < len(figuresRaw)-1 {
				code.WriteString("    \\hfill\n")
			}
		}
	}

	if mainCaption != "" {
		code.WriteString(fmt.Sprintf("    \\caption{%s}\n", mainCaption))
	}
	if mainLabel != "" {
		code.WriteString(fmt.Sprintf("    \\label{%s}\n", mainLabel))
	}
	code.WriteString("\\end{figure}")

	return CreateSuccessResult(map[string]interface{}{
		"code":     code.String(),
		"packages": []string{"graphicx", "subcaption"},
	}), nil
}

// suggestFigurePackages 建议图片宏包
func (p *ImageToolProvider) suggestFigurePackages(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	requirementsRaw, ok := args["requirements"].([]interface{})
	if !ok || len(requirementsRaw) == 0 {
		return CreateErrorResult(fmt.Errorf("requirements is required")), nil
	}

	packages := []map[string]string{}

	for _, req := range requirementsRaw {
		reqStr, ok := req.(string)
		if !ok {
			continue
		}

		switch reqStr {
		case "tikz", "diagram", "flowchart":
			packages = append(packages, map[string]string{
				"name":        "tikz",
				"declaration": "\\usepackage{tikz}",
				"description": "TikZ 绘图包，支持流程图、图表等",
			})
		case "pgfplots", "chart", "plot":
			packages = append(packages, map[string]string{
				"name":        "pgfplots",
				"declaration": "\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}",
				"description": "PGFPlots 图表包，支持各种数据图表",
			})
		case "subfigure", "subfig", "multiple":
			packages = append(packages, map[string]string{
				"name":        "subcaption",
				"declaration": "\\usepackage{subcaption}",
				"description": "子图支持，用于多图并排",
			})
		case "svg":
			packages = append(packages, map[string]string{
				"name":        "svg",
				"declaration": "\\usepackage{svg}",
				"description": "SVG 图片支持",
			})
		case "wrapfig", "wrap":
			packages = append(packages, map[string]string{
				"name":        "wrapfig",
				"declaration": "\\usepackage{wrapfig}",
				"description": "文字环绕图片",
			})
		case "float":
			packages = append(packages, map[string]string{
				"name":        "float",
				"declaration": "\\usepackage{float}",
				"description": "浮动体控制，支持 [H] 位置",
			})
		}
	}

	// 始终建议 graphicx
	packages = append([]map[string]string{{
		"name":        "graphicx",
		"declaration": "\\usepackage{graphicx}",
		"description": "基础图片支持",
	}}, packages...)

	return CreateSuccessResult(map[string]interface{}{
		"packages": packages,
		"count":    len(packages),
	}), nil
}
