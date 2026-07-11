package prism

import "errors"

var (
	ErrProjectNotFound = errors.New("prism: project not found")
	ErrFileNotFound    = errors.New("prism: file not found")
	ErrCompileNotFound = errors.New("prism: compile not found")
	ErrEditNotFound    = errors.New("prism: edit not found")

	// ErrCiteNotInLibrary —— apply cite 的论文不在用户文献库(友好提示)。
	ErrCiteNotInLibrary = errors.New("文献不在你的文献库中")

	// ErrStaleBase —— 应用 AI 提案时文件已被改动(current ≠ 提案 base),需重新生成(乐观并发)。
	ErrStaleBase = errors.New("文件已变更,请放弃后重新生成 AI 修改")

	// ErrRoundBusy(V3-4.4-1)—— AI 回答进行中,prepare/reject/重开会话会抽换 agent 脚下的 cwd,拒绝(409)。
	ErrRoundBusy = errors.New("AI 正在回答中,请等本轮结束后再操作")

	// ErrRoundEpochMismatch(V3-4.4-1)—— apply 携带的轮次世代号与服务端当前不符:期间发生过新的
	// prepare(其它窗口/新一轮),这份 pending 基于过期基线,拒绝固化(409)。
	ErrRoundEpochMismatch = errors.New("文档基线已更新(可能在其它窗口发起了新一轮),请刷新后重试")

	// ErrReadOnlyProject —— 旧版(legacy)项目冻结只读 / struct 项目误用旧端点:仅查看/编译/导出。
	ErrReadOnlyProject = errors.New("该项目为旧版项目,仅支持查看 / 编译 / 导出")

	// ErrNotStructProject —— 对非 struct 轨项目调用了 struct 专用端点(或缺结构体载荷)。
	ErrNotStructProject = errors.New("该项目不是新版结构体项目")

	// 文件 CRUD(友好提示)。
	ErrInvalidPath      = errors.New("文件名不合法(仅支持 .tex/.bib/.sty/.cls,且不能含 ../)")
	ErrFileExists       = errors.New("同名文件已存在")
	ErrCannotDeleteMain = errors.New("主文件不能删除")
)
