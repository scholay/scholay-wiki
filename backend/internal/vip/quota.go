package vip

import "os"
import "strconv"

// dailyLimits —— 每个受限功能、每个等级的「每日次数」上限。<=0 视为不限。
// 默认值(可被 env 覆盖, 见 limitFor):审稿最贵→最低,翻译最轻→较高;pro≈10-20×。
//
// 调额度只改这里(或设对应 env), 重启生效;简单版不做 admin 在线可调。
var dailyLimits = map[string]map[string]int{
	FeatureTranslate:   {TierFree: 10, TierPro: 200},
	FeatureSmartSearch: {TierFree: 5, TierPro: 100},
	FeatureClaw:        {TierFree: 10, TierPro: 200},
	FeaturePeerReview:  {TierFree: 1, TierPro: 20},
}

// featureLabel 给用户看的功能名(用于超限文案)。
var featureLabel = map[string]string{
	FeatureTranslate:   "AI 翻译",
	FeatureSmartSearch: "智能搜索",
	FeatureClaw:        "智能助手",
	FeaturePeerReview:  "智能审稿",
}

// GatedFeatures 返回受限额门槛的功能 key 列表(给 Status 接口遍历)。
func GatedFeatures() []string {
	return []string{FeatureTranslate, FeatureSmartSearch, FeatureClaw, FeaturePeerReview}
}

// limitFor 返回 (feature, tier) 的每日上限。优先读 env `VIP_LIMIT_<FEATURE>_<TIER>`(整数),
// 否则用 dailyLimits 默认;未知 feature/tier → 0(不限, 安全放行而不是误锁)。
func limitFor(feature, tier string) int {
	if v := os.Getenv("VIP_LIMIT_" + envKey(feature) + "_" + envKey(tier)); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	if m, ok := dailyLimits[feature]; ok {
		if lim, ok := m[tier]; ok {
			return lim
		}
	}
	return 0
}

func envKey(s string) string {
	out := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'a' && c <= 'z' {
			c -= 32
		} else if c == '-' {
			c = '_'
		}
		out[i] = c
	}
	return string(out)
}

// featureName 友好名;无映射回退 key。
func featureName(feature string) string {
	if v, ok := featureLabel[feature]; ok {
		return v
	}
	return feature
}
