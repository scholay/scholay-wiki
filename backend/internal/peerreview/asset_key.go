// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

// assetPrefix 是审稿稿件/附件在 MinIO 里的落点前缀。
//
// 🔴 2026-08 事故:这里原本是 `tmp/<submissionID>/...`,而 scholar-peer-review-assets 桶上挂着
// 「tmp/ 前缀 24h 自动过期」的 ILM 规则(storage.ensureTmpLifecycle)。当时的注释宣称
// 「submit 时 service 层把对象从 tmp/ 移动到 submitted/」—— 代码里从来没有这个动作。
// 结果:每一份稿件在上传约 25 小时后被 MinIO 静默删除,peer_review_assets 全表死链,
// 桶实测 0 字节。没有任何日志、任何报错,因为删的人是 MinIO 自己。
//
// 为什么不是「补一个 submit 时的迁移动作」:
//   - 草稿本来就会跨天存活。ResumeOrCreateDraft / LatestActiveDraft 的产品语义就是
//     「下次进来接着上次没投完的稿子」,AdvanceStep 的 step2/step3 还要回读正文
//     (pushAssetsToSession)。24h ILM 会在用户走到 submit 之前就吃掉文件,
//     迁移动作只是把损失从「100%」降到「隔夜的那些」,仍然在丢用户稿件。
//   - 这个桶里根本没有 ILM 该管的东西。tmp/ 前缀在 library / feedback 那边的正当理由是
//     「对象已落地但还没有 DB 行认领」;而 UploadAsset 是同一个请求里 PutObject 成功后立刻
//     CreateAsset,并且 CreateAsset 失败时已有补偿删除。无主窗口只有几毫秒。
//
// 所以正确修法是把 key 迁出自动删除区(本文件)+ 主动摘掉桶上那条规则
// (storage.TmpILMRevokedBuckets)+ 用 DB 驱动的孤儿对账替代它兜底
// (cleanup.reapOrphanPeerReviewObjects)。
const assetPrefix = "submissions/"

// assetObjectKey 生成一个稿件/附件对象的 key。
//
// 不变式(由 asset_key_test.go 钉死):返回值绝不落在 storage.IsTmpILMManaged 为真的前缀下。
// 这张表的行在 PutObject 成功后立即创建,对象从第一秒起就是「被 DB 引用的用户稿件」,
// 生命周期只能由业务侧的删除路径(DeleteAsset / DeleteSubmission / 注销)决定。
//
// 扩展名保留(小写):管理端下载与 agent 侧按扩展名分派解析器时要用。
// 文件名本身不进 key —— 用户中文/空格/超长文件名进 object key 会带来一串编码问题,
// 原名在 peer_review_assets.filename 与对象的 original-name 元数据里都留了。
func assetObjectKey(submissionID uint64, filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	return fmt.Sprintf("%s%d/%s%s", assetPrefix, submissionID, uuid.New().String(), ext)
}
