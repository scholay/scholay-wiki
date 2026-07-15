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

function basenameOf(p: string): string {
  const parts = p.replace(/`/g, '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

/**
 * 去掉正文里无歧义的容器内部路径,只保留文件名(用户能对上下方产物卡的名字)。
 * 例:"已保存到 ./out/综述.md" → "已保存到 综述.md";"/home/bun/x/out/a.csv" → "a.csv"。
 */
export function stripContainerPaths(text: string): string {
  if (!text || (text.indexOf('/out/') < 0 && text.indexOf('/home/') < 0 && !text.startsWith('./out/'))) {
    // 快路径:绝大多数正文不含这些片段,直接原样返回,避免正则开销。
    if (!/\/out\/|\/(?:home|workspace|app|root|srv|mnt|data)\//.test(text)) return text;
  }
  return text
    .replace(REL_OUT, (_m, rest: string) => basenameOf(rest))
    .replace(ABS_CONTAINER, (m) => basenameOf(m));
}
