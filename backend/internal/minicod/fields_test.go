// ============================================================================
// fields 白名单单测 —— 2026-07 线上审计。
//
// 两层锁:
//  1. 行为锁:tldr / source / 未知字段被剔除;已知字段(含 seoenrich 线上在用的
//     字段清单镜像)全量放行 —— 防"白名单顺手收紧把 seoenrich 打回 400/缺列"。
//  2. 契约锁:paperFieldSpec / authorFieldSpec 的 key 必须真实存在于仓库根
//     api-1.json 的 Paper / Author schema properties(白名单以 api-1.json 为准);
//     且 tldr/bibtex/source 绝不允许出现在 spec 里。
// ============================================================================

package minicod

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestFilterPaperFieldsDropsDeprecatedAndUnknown(t *testing.T) {
	// 线上旧构建前端的真实形态:合法字段 + 已废 tldr —— tldr 必须被剔除,其余原序放行。
	got := filterPaperFields([]string{"title", "abstract", "tldr", "citationCount", "year"})
	want := []string{"title", "abstract", "citationCount", "year"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("filterPaperFields: got %v, want %v", got, want)
	}

	// 已废 source / 任意未知字段 / 空白项一律剔除。
	got = filterPaperFields([]string{"source", "corpusId", "s2FieldsOfStudy", " ", "journal", "bogus"})
	if got != nil {
		t.Fatalf("filterPaperFields 全非法输入应返回 nil(不发 fields 取上游默认), got %v", got)
	}

	// 全空输入 → nil。
	if got := filterPaperFields(nil); got != nil {
		t.Fatalf("filterPaperFields(nil) = %v, want nil", got)
	}
}

func TestFilterAuthorFieldsDropsDeprecatedAndUnknown(t *testing.T) {
	got := filterAuthorFields([]string{"authorId", "name", "source", "homepage", "bogus"})
	want := []string{"authorId", "name", "homepage"} // source(已废)/bogus 剔除;homepage 是登记过的例外
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("filterAuthorFields: got %v, want %v", got, want)
	}
}

// TestSeoenrichFieldListsPassUnfiltered —— 镜像 internal/seoenrich 线上在用的字段清单
// (不直接 import 以免包环;seoenrich 改清单时此处须同步,失败即提醒)。
// 白名单绝不允许把这些线上验证过的字段误伤剔除。
func TestSeoenrichFieldListsPassUnfiltered(t *testing.T) {
	paperEnrich := []string{"paperId", "title", "abstract", "authors", "year", "venue", "citationCount", "fieldsOfStudy", "externalIds"}
	authorWorks := []string{"paperId", "title", "year", "venue", "citationCount"}
	authorEnrich := []string{"authorId", "name", "affiliations", "homepage", "paperCount", "citationCount", "hIndex", "orcid"}

	if got := filterPaperFields(paperEnrich); !reflect.DeepEqual(got, paperEnrich) {
		t.Fatalf("paperEnrichFields 被误伤: got %v, want %v", got, paperEnrich)
	}
	if got := filterPaperFields(authorWorks); !reflect.DeepEqual(got, authorWorks) {
		t.Fatalf("authorWorksFields 被误伤: got %v, want %v", got, authorWorks)
	}
	if got := filterAuthorFields(authorEnrich); !reflect.DeepEqual(got, authorEnrich) {
		t.Fatalf("authorEnrichFields 被误伤: got %v, want %v", got, authorEnrich)
	}
}

// TestFieldSpecMatchesAPI1JSON —— 契约锁:白名单以 api-1.json 为准。
// spec 的每个 key 必须真实存在于 api-1.json 对应 schema 的 properties;
// tldr / bibtex / source 绝不允许进 spec(前者 fields 过滤参数不接受、后者已废,均线上 400 实证)。
//
// ⚠️ api-1.json 在仓库根,Docker 构建 context(./backend)里不存在 —— 找不到文件时 Skip
// 并大声说明(与 CLAUDE.md「跨包镜像在构建里整族 skip」同一坦白口径,不做假绿)。
func TestFieldSpecMatchesAPI1JSON(t *testing.T) {
	raw, err := os.ReadFile("../../../api-1.json")
	if err != nil {
		t.Skipf("api-1.json 不在本构建 context(仓库根才有),契约锁跳过 —— 本地 `cd backend && go test ./...` 才是真校验: %v", err)
	}

	var doc struct {
		Components struct {
			Schemas map[string]struct {
				Properties map[string]json.RawMessage `json:"properties"`
			} `json:"schemas"`
		} `json:"components"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("解析 api-1.json 失败: %v", err)
	}

	check := func(specName string, spec map[string][]string, schemaName string, exceptions map[string]bool, banned []string) {
		schema, ok := doc.Components.Schemas[schemaName]
		if !ok {
			t.Fatalf("api-1.json 缺 %s schema —— 上游契约变了,白名单须重对齐", schemaName)
		}
		for key := range spec {
			if exceptions[key] {
				continue
			}
			if _, ok := schema.Properties[key]; !ok {
				t.Errorf("%s 的 key %q 不在 api-1.json %s.properties 里 —— 白名单以 api-1.json 为准,不许私加", specName, key, schemaName)
			}
		}
		for _, b := range banned {
			if _, ok := spec[b]; ok {
				t.Errorf("%s 不允许包含 %q(已废/fields 过滤不接受,线上 400 实证)", specName, b)
			}
		}
	}

	check("paperFieldSpec", paperFieldSpec, "Paper", nil, []string{"tldr", "bibtex", "source"})
	// homepage:不在 Author schema,但 seoenrich 线上在用且上游接受 —— 唯一登记例外。
	check("authorFieldSpec", authorFieldSpec, "Author", map[string]bool{"homepage": true}, []string{"source"})
}
