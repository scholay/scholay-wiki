/**
 * 出口清洗(claw 成果交付「双保险」之一)—— 把助手正文里泄漏的**容器内部路径**收敛掉。
 *
 * 主机制是「提示词铁律(禁念路径)+ 帧驱动的就近产物卡」;用户能不能看到成果**已不依赖正文**。
 * 本函数只兜住模型顽固 bias 的漏网之鱼(微调固化的表达,prompt 难 100% 根治),让偶发泄漏的
 * 容器路径不至于直接怼到用户脸上。
 *
 * **刻意极度保守**:只处理**无歧义**的容器内部路径 —— 显式 `./out/` 交付目录前缀、以及容器绝对
 * 根(/home、/workspace…)。不碰裸 `out/`(可能是 checkout/ layout/ 的一部分)、不碰普通 prose、
 * 不碰 URL。宁可漏清洗,不可误伤正文。仅 claw 使用(prism 的文件树/路径是合法用户概念,不清洗)。
 */

// 显式相对交付路径:` ./out/xxx `(可带反引号)。`./` 前缀消歧,不会撞 checkout/ 之类。
const REL_OUT = /`?\.\/out\/([^\s`)）]+)`?/g;
// 容器绝对根路径:/home/... /workspace/... 等。研究助手正文里几乎不可能合法出现,视作内部泄漏。
const ABS_CONTAINER = /`?\/(?:home|workspace|app|root|srv|mnt|data)\/[^\s`)）]+`?/g;

// ── deliver 档:裸 `out/xxx.ext`(2026-08-07 交付链路重建 A11)────────────────────
//
// 🔴 为什么必须补:生产实测 221 个「正文出现 out/」的轮里,**只有 4 轮**是带 `./` 的形态
//    ——也就是说上面那条 REL_OUT 的命中率约 1.8%,是一条几乎永远绿的规则。
//    98.2% 是裸 `out/report.docx`,而模块头那句「不碰裸 out/(可能是 checkout/ 的一部分)」
//    正是它一直漏的理由。
//
// 消歧改用**两侧锚定**而不是 `./` 前缀:
//   左:前面不能紧跟单词字符或 `/`(挡住 checkout/ 、layout/ 、a/out/);
//   右:必须以**已知交付扩展名**结尾(挡住 "out/ 目录" 这种把普通词组吞掉的情况)。
// 两条同时满足时,它是内部路径的可能性远高于合法 prose。仍然保守:宁可漏,不可误伤。
//
// ⚠️ 不用 lookbehind(Safari 16.4 才支持),改成捕获前置字符再原样吐回。
const DELIVER_EXT = "md|markdown|txt|csv|json|html?|svg|png|jpe?g|webp|gif|pdf|docx?|xlsx?|pptx?|zip|py|bib|tex";
const BARE_OUT = new RegExp(
  "(^|[^\\w\\-/])`?(?:\\./)?out/([^\\s`)）、,，;；:：]+\\.(?:" + DELIVER_EXT + "))`?",
  "gi",
);
// 中文里把目录说成词组的形态:「out 目录」「工作目录下」「根目录里」。
// 这些不是路径、清洗不出文件名,只能整体换成用户语汇。
const DIR_PHRASE = /(?:`?out`?\s*目录|工作目录|会话目录|当前目录|根目录)(?:下|里|中)?/g;

/**
 * 清洗档位(2026-08-07 A11)。
 *
 * 🔴 分档是必须的:本函数的文件头注释写着「仅 claw 使用」,而实测有 **4 个调用点** ——
 *    claw MessageTurn、**prism PrismMessageTurn**、shared/components/chat/ToolCallBlock、
 *    shared/components/chat/tool-semantics。给全部调用点一刀切地加强清洗会有两处误伤:
 *      · prism 的路径是**合法的用户概念**(用户自己在看文件树),清掉等于把界面说残;
 *      · Bash chip 若被改写,会显示一条模型根本没跑过的命令。
 *
 * 'verbatim'(默认)= 改造前行为,只清无歧义的 `./out/` 与容器绝对根。
 * 'deliver'  = 只给 **claw 的助手正文**用:额外清裸 `out/x.ext` 与「out 目录/工作目录」词组。
 */
export type StripMode = 'verbatim' | 'deliver';

function basenameOf(p: string): string {
  const parts = p.replace(/`/g, '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

/**
 * 去掉正文里无歧义的容器内部路径,只保留文件名(用户能对上下方产物卡的名字)。
 * 例:"已保存到 ./out/综述.md" → "已保存到 综述.md";"/home/bun/x/out/a.csv" → "a.csv"。
 */
export function stripContainerPaths(text: string, mode: StripMode = 'verbatim'): string {
  if (!text) return text;
  // 快路径:绝大多数正文不含这些片段,直接原样返回,避免正则开销。
  const maybe =
    /out\/|\/(?:home|workspace|app|root|srv|mnt|data)\//.test(text) ||
    (mode === 'deliver' && /目录/.test(text));
  if (!maybe) return text;

  let out = text.replace(REL_OUT, (_m, rest: string) => basenameOf(rest)).replace(ABS_CONTAINER, (m) => basenameOf(m));
  if (mode === 'deliver') {
    out = out
      .replace(BARE_OUT, (_m, lead: string, rest: string) => lead + basenameOf(rest))
      .replace(DIR_PHRASE, '下方卡片');
  }
  return out;
}
