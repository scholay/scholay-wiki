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

	// 文件 CRUD(友好提示)。
	ErrInvalidPath      = errors.New("文件名不合法(仅支持 .tex/.bib/.sty/.cls,且不能含 ../)")
	ErrFileExists       = errors.New("同名文件已存在")
	ErrCannotDeleteMain = errors.New("主文件不能删除")
)
