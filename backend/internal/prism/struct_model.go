// ============================================================================
// 结构体真源模型(struct 轨)—— prism_projects.doc_struct JSON 的 Go 映射。
//   见 docs/research/prism-render-surface-2026-06/REPORT.md Part III §2.1。
// 真源 = 结构化前置信息(数据)+ 有类型正文块 + 引用库 + 目标模板。
// projector.go 把它确定性投影成 .tex/.bib;前端渲染器据它画「逼近最终 PDF」的可编辑面。
// ============================================================================

package prism

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// 正文块类型。
const (
	BlockHeading     = "heading"
	BlockParagraph   = "paragraph"
	BlockDisplayMath = "displayMath"
	BlockFigure      = "figure"
	BlockList        = "list"
	BlockTable       = "table"  // GFM markdown 表格(agent 在 document.md 里写 | ... |)
	BlockOpaque      = "opaque" // 兜底:agent 认不出的怪 LaTeX,原样塞回,前端显示「AI 管理的区域」
)

// 行内片段类型。
const (
	InlineText   = "text"
	InlineBold   = "bold"
	InlineItalic = "italic"
	InlineCite   = "cite"
	InlineMath   = "math"
)

// DocStruct 是 struct 轨项目的真源。
type DocStruct struct {
	StructVersion  int                 `json:"structVersion"`
	TargetTemplate string              `json:"targetTemplate"`
	FrontMatter    FrontMatter         `json:"frontMatter"`
	Body           []Block             `json:"body"`
	Bibliography   map[string]string   `json:"bibliography,omitempty"` // citeKey → BibTeX 条目(PDF/Word 共用单一真源)
	Assets         map[string]DocAsset `json:"assets,omitempty"`       // 逻辑 id → 隐藏文件指针(二进制在 MinIO)
}

// FrontMatter 结构化前置信息(投稿换刊只重映射这一层,不动正文)。
type FrontMatter struct {
	Title        string        `json:"title"`
	ShortTitle   string        `json:"shortTitle,omitempty"`
	Authors      []Author      `json:"authors,omitempty"`
	Affiliations []Affiliation `json:"affiliations,omitempty"`
	Abstract     string        `json:"abstract,omitempty"`
	Keywords     []string      `json:"keywords,omitempty"`
}

type Author struct {
	ID            string   `json:"id,omitempty"`
	Given         string   `json:"given,omitempty"`
	Family        string   `json:"family,omitempty"`
	Email         string   `json:"email,omitempty"`
	Orcid         string   `json:"orcid,omitempty"`
	Corresponding bool     `json:"corresponding,omitempty"`
	AffRefs       []string `json:"affRefs,omitempty"` // → Affiliation.ID(按模板投影成 \author[1] / \IEEEauthorblockA / \inst{1})
}

type Affiliation struct {
	ID           string `json:"id,omitempty"`
	Organization string `json:"organization,omitempty"`
	Department   string `json:"department,omitempty"`
	City         string `json:"city,omitempty"`
	Country      string `json:"country,omitempty"`
}

// Block 是正文块;Type 决定其它字段语义。
type Block struct {
	ID    string `json:"id,omitempty"`
	Type  string `json:"type"`
	Level int    `json:"level,omitempty"` // heading 级别 1/2/3
	Text  string `json:"text,omitempty"`  // heading 标题
	Label string `json:"label,omitempty"` // \label{} 锚

	Inlines []Inline `json:"inlines,omitempty"` // paragraph 行内序列

	Latex string `json:"latex,omitempty"` // displayMath 公式源

	Asset   string `json:"asset,omitempty"`   // figure → assets[key]
	Caption string `json:"caption,omitempty"` // figure 题注
	Width   string `json:"width,omitempty"`   // figure 宽度(如 0.8\linewidth)

	Ordered bool       `json:"ordered,omitempty"` // list 有序/无序
	Items   [][]Inline `json:"items,omitempty"`   // list 项

	Rows [][]string `json:"rows,omitempty"` // table 行(rows[0]=表头);单元格为纯文本

	RawLatex string `json:"rawLatex,omitempty"` // opaque 原样 LaTeX
}

// Inline 行内片段。
type Inline struct {
	T     string `json:"t"`               // text|bold|italic|cite|math
	V     string `json:"v,omitempty"`     // text/bold/italic 文本
	Key   string `json:"key,omitempty"`   // cite key
	Latex string `json:"latex,omitempty"` // inline math 源
}

// DocAsset 逻辑 id → 隐藏文件指针(图片/数据;二进制落 MinIO,这里只存路径)。
type DocAsset struct {
	FileID  uint   `json:"fileId,omitempty"`
	RelPath string `json:"relPath,omitempty"`
	Mime    string `json:"mime,omitempty"`
}

// ParseDocStruct 反序列化 + 兜底缺省值。
func ParseDocStruct(s string) (*DocStruct, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, errors.New("结构体为空")
	}
	var d DocStruct
	if err := json.Unmarshal([]byte(s), &d); err != nil {
		return nil, fmt.Errorf("结构体解析失败: %w", err)
	}
	if d.StructVersion == 0 {
		d.StructVersion = 1
	}
	if strings.TrimSpace(d.TargetTemplate) == "" {
		d.TargetTemplate = "article"
	}
	if d.Bibliography == nil {
		d.Bibliography = map[string]string{}
	}
	return &d, nil
}

// Marshal 序列化为规范 JSON(落库 / 算 sha)。
func (d *DocStruct) Marshal() (string, error) {
	b, err := json.Marshal(d)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// DefaultDocStruct 新建 struct 项目的起始骨架。
// 干净起始:不塞英文占位/假作者 —— 标题/作者/摘要留空(前端显占位),正文一个空段供直接落笔。
func DefaultDocStruct() *DocStruct {
	return &DocStruct{
		StructVersion:  1,
		TargetTemplate: "article",
		FrontMatter:    FrontMatter{Title: ""},
		Body: []Block{
			{ID: "b1", Type: BlockParagraph},
		},
		Bibliography: map[string]string{},
	}
}

// StructVersion 结构体追加式版本链(镜像 prism_file_versions 不可变审计纪律)。
type StructVersion struct {
	ID            uint      `gorm:"column:id;primaryKey" json:"id"`
	ProjectID     uint      `gorm:"column:project_id" json:"project_id"`
	VersionNo     int       `gorm:"column:version_no" json:"version_no"`
	DocStruct     string    `gorm:"column:doc_struct" json:"-"`
	StructSHA256  string    `gorm:"column:struct_sha256" json:"struct_sha256,omitempty"`
	Author        string    `gorm:"column:author" json:"author"`
	Status        string    `gorm:"column:status" json:"status"`
	BaseVersionID *uint     `gorm:"column:base_version_id" json:"base_version_id,omitempty"`
	CreatedAt     time.Time `gorm:"column:created_at" json:"created_at"`
}

func (StructVersion) TableName() string { return "prism_struct_versions" }
