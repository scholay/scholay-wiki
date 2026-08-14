// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package prism

// CompileNotifier 把编译状态变更推给项目属主(经全站常连的通知 WS,per-user 寻址)。
//
// 为什么走通知 WS 而不是 prism 自己的 agentbridge pipe(2026-08-12 推送化决策):
// 编译是 **project** 维度(prism_compiles.project_id),agent hub 是 **session** 维度,
// 而 prism 一个项目有多条对话 —— 走 pipe 要么对项目全部 session 扇出、要么用户停在
// 别的对话上就漏推;通知 WS 按 userID 寻址且前端在 AppShell 顶层常连,天然覆盖。
//
// bootstrap 注入 websocket.Hub.SendToUser 的包装;nil = 不推送(前端靠轮询兜底,
// DB 是唯一真源,推送永远是 best-effort 加速器)。
type CompileNotifier func(userID uint, compile *Compile)

var compileNotifier CompileNotifier

// SetCompileNotifier 注入编译状态推送器(bootstrap 在 wsHub 就绪后调)。允许 nil。
func SetCompileNotifier(f CompileNotifier) { compileNotifier = f }

// notifyCompileStatus 状态写库后推送当前 compile 全量(与 GET /compile/:id 同一份序列化,
// 含 error_source 派生字段)。读一次 DB 换取「帧即响应体」:前端可直接 setQueryData,
// 不用再发确认请求。失败静默 —— 推送丢了由前端兜底轮询收敛。
func (s *Service) notifyCompileStatus(userID, projectID, compileID uint) {
	if compileNotifier == nil || userID == 0 {
		return
	}
	cm, err := s.GetCompile(projectID, compileID)
	if err != nil || cm == nil {
		return
	}
	compileNotifier(userID, cm)
}
