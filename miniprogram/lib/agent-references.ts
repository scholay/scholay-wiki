// 「引用文献」消息块 —— 与 Web 端 shared/lib/agent-references.ts 的 buildReferenceBlock 格式 1:1。
// 引用文献集论文/文件夹后,后端已把资料物化进会话 cwd 的 references/;前端在发送的
// user_message 文本末尾追加这段块,告诉 agent 引用了哪些、资料在 ./references/。

export interface RefLike {
  kind: 'paper' | 'folder'
  title: string
  paperCount?: number
}

const OPEN = '【引用文献】'
const CLOSE = '【/引用文献】'
const HINT =
  '(以下文献已放入工作目录 ./references/,清单见 ./references/INDEX.md,可用 Read 查看;请基于它们回答与引用,勿臆造)'

export function buildReferenceBlock(refs: RefLike[]): string {
  if (!refs || refs.length === 0) return ''
  const lines = refs
    .map((r) => (r.kind === 'folder' ? '- 📁 ' + r.title + ' [' + (r.paperCount || 0) + '篇]' : '- 📄 ' + r.title))
    .join('\n')
  return '\n\n' + OPEN + '\n' + HINT + '\n' + lines + '\n' + CLOSE
}
