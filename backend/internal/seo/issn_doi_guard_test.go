// 2026-08-10 双智能体交叉审计后的两道数据质量防线:
//   - NormalizeISSNs:输出侧兜底,Periodical JSON-LD 的 issn 永远不重复、不拼接
//     (Nature/JAMA 等 18 刊曾输出 ["A","A, B",…] 脏数组;存量由迁移 0122 清洗)。
//   - samePaperTitle:DOI 撞键防线的判定谓词(olx:W29576601 字段嫁接事故的防回归)。
package seo

import (
	"reflect"
	"strings"
	"testing"
)

func TestNormalizeISSNs(t *testing.T) {
	for _, tc := range []struct {
		name string
		in   []string
		want []string
	}{
		{
			name: "Nature 线上实测脏形态:元素内逗号拼接 + 跨元素重复",
			in:   []string{"0028-0836", "0028-0836, 0090-0028, 0300-8746", "1476-4687, 2058-1092, 2058-1106"},
			want: []string{"0028-0836", "0090-0028", "0300-8746", "1476-4687", "2058-1092", "2058-1106"},
		},
		{
			name: "干净数组原样保序",
			in:   []string{"0168-8278", "1600-0641"},
			want: []string{"0168-8278", "1600-0641"},
		},
		{
			name: "小写 x 统一大写、分号分隔、空元素剔除",
			in:   []string{"1545-861x; 1545-8636", "", "  "},
			want: []string{"1545-861X", "1545-8636"},
		},
		{name: "空输入", in: nil, want: []string{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := NormalizeISSNs(tc.in); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("NormalizeISSNs(%v) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestSamePaperTitleGuardsDOIGrafting(t *testing.T) {
	// 同一论文的跨源记录:标题一致(或仅大小写/尾部差异)→ 放行(不误伤多源 ID)
	if !samePaperTitle("Human Radiation Exposures Related to Nuclear Weapons Industries",
		"human radiation exposures related to nuclear weapons industries.") {
		t.Fatal("同标题(大小写/尾标点差异)必须判同一论文")
	}
	// 30 rune 前缀相同的长标题变体(副标题差异)→ 同一论文
	long := "A systematic review of gut microbiome and depression"
	if !samePaperTitle(long, long+": an umbrella meta-analysis") {
		t.Fatal("前缀一致的副标题变体必须判同一论文")
	}
	// 字段嫁接形态:标题完全无关 → 拒
	if samePaperTitle("Human radiation exposures related to nuclear weapons industries",
		"The Latvian genome database: linking genomic data to health records") {
		t.Fatal("无关标题必须判不同论文(DOI 嫁接防线)")
	}
	// 空标题无从判定 → 按不同处理(宁可拒写 DOI)
	if samePaperTitle("", "anything") || samePaperTitle("  ", strings.Repeat("x", 40)) {
		t.Fatal("空标题必须判不同")
	}
}
