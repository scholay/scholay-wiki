// ============================================================================
// 「引用文献」消息块 —— 单一格式真源(claw composer 生成 + history 回放解析共用)。
//
// 用户在 claw 输入框引用收藏的论文 / 整个文件夹后,后端已把资料物化进会话 cwd 的 references/。
// 前端在发送的 user_message 文本**末尾**追加一段引用块:
//   - 给 agent 看:告诉它引用了哪些、资料在 ./references/(配套 library-reference skill)。
//   - 给前端看:历史回放(reload)时从 transcript 文本里解析回来,渲染成引用 chip;
//     展示时把这段块从正文里剥掉(stripReferenceBlock),只显示用户真正打的字。
//
// 格式必须 build/parse 严格对称(改一处改两处)。
// ============================================================================

import type { TurnReference } from '@/shared/types/chat';

const OPEN = '【引用文献】';
const CLOSE = '【/引用文献】';
const HINT =
  '(以下文献已放入工作目录 ./references/,清单见 ./references/INDEX.md,可用 Read 查看;请基于它们回答与引用,勿臆造)';

// 行格式:论文 `- 📄 <title>`;文件夹 `- 📁 <title> [<n>篇]`。
function refLine(r: TurnReference): string {
  if (r.kind === 'folder') {
    return `- 📁 ${r.title} [${r.paperCount ?? 0}篇]`;
  }
  return `- 📄 ${r.title}`;
}

/** buildReferenceBlock —— 把引用项渲染成追加到 user_message 末尾的文本块。无引用 → 空串。 */
export function buildReferenceBlock(refs: TurnReference[]): string {
  if (!refs || refs.length === 0) return '';
  const lines = refs.map(refLine).join('\n');
  return `\n\n${OPEN}\n${HINT}\n${lines}\n${CLOSE}`;
}

// 文件夹行解析:`- 📁 <title> [<n>篇]`(title 取最后一个 ` [N篇]` 之前的部分)。
const FOLDER_RE = /^- 📁 (.+) \[(\d+)篇\]$/;
const PAPER_PREFIX = '- 📄 ';

/**
 * stripReferenceBlock —— 从一段文本里剥离引用块,返回 { text(去块后的正文), references(解析出的引用) }。
 * 没有引用块时原样返回 text + 空数组。容错:块不完整 / 行不规整时尽力解析,不抛错。
 */
export function stripReferenceBlock(content: string): {
  text: string;
  references: TurnReference[];
} {
  const open = content.lastIndexOf(OPEN);
  if (open < 0) return { text: content, references: [] };
  const closeIdx = content.indexOf(CLOSE, open);
  const blockEnd = closeIdx < 0 ? content.length : closeIdx + CLOSE.length;
  const block = content.slice(open, blockEnd);

  const references: TurnReference[] = [];
  for (const raw of block.split('\n')) {
    const line = raw.trimEnd();
    const fm = FOLDER_RE.exec(line);
    if (fm) {
      references.push({ kind: 'folder', title: fm[1], paperCount: Number(fm[2]) || 0 });
      continue;
    }
    if (line.startsWith(PAPER_PREFIX)) {
      const title = line.slice(PAPER_PREFIX.length).trim();
      if (title) references.push({ kind: 'paper', title });
    }
  }

  const text = (content.slice(0, open) + content.slice(blockEnd)).trim();
  return { text, references };
}
