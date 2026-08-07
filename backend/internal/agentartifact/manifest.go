// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentartifact

import (
	"encoding/json"
	"path"
	"strings"
)

// ManifestName —— 交付目录里的产物清单文件名(agent 侧写,backend 读)。
//
// 🔴 它**不是**交付物,任何 feature 列产物时都必须把它排除掉。
// 这一条以前只有 claw 做到:statlab / scidraw / boltslides 的 shouldListArtifact
// 只排除空名与点开头文件 ⇒ 一旦 manifest 被写出来,用户的产物列表里就会多一张
// 名为 manifest.json 的卡片。所以判定收进本包,四个 feature 共用 IsManifest。
const ManifestName = "manifest.json"

// Meta —— manifest.json 里单个交付物的标注。
type Meta struct {
	Title       string
	Description string
}

// IsManifest 判定某个 out/ 顶层条目是不是清单文件本身。
func IsManifest(name string) bool { return name == ManifestName }

// ParseManifest 解析 out/manifest.json 文本为 file(basename) → Meta 映射。
//
// 纯函数,便于单测。空 / 非法 JSON / 无 artifacts 一律返回 nil ——
// 调用方 `meta[name]` 取值天然安全,清单坏了只是没有友好标题,绝不影响产物列出。
// file 取 basename:防清单里写 `../` 把标注挂到别的目录上。
//
// ⚠️ 本函数从 internal/claw 提上来(2026-08-07 A9)。提升的理由不是复用,是**防漂移**:
// 四个 feature 各抄一份解析逻辑,而其中三份从一开始就没抄 —— 与 timeout 白名单、
// prompt 交付纪律是同一类事故。现在解析与「是不是清单」的判定只有一处。
func ParseManifest(content []byte) map[string]Meta {
	if strings.TrimSpace(string(content)) == "" {
		return nil
	}
	var parsed struct {
		Artifacts []struct {
			File        string `json:"file"`
			Title       string `json:"title"`
			Description string `json:"description"`
		} `json:"artifacts"`
	}
	if json.Unmarshal(content, &parsed) != nil {
		return nil
	}
	if len(parsed.Artifacts) == 0 {
		return nil
	}
	out := make(map[string]Meta, len(parsed.Artifacts))
	for _, a := range parsed.Artifacts {
		f := strings.TrimSpace(a.File)
		if f == "" {
			continue
		}
		out[path.Base(f)] = Meta{Title: a.Title, Description: a.Description}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
