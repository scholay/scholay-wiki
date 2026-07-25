// 语言锁定与渲染纪律的机械层(2026-07 审计 P1-7/P1-8)。纯函数,零 IO。
//
// 背景:静态 langLine 把「跟随记忆偏好」与「跟随当条消息语言」并列且无优先级,1dca5f82 的
// 整份老挝语交付正是记忆偏好压过了当条中文消息。本模块提供:
//   1) detectLang:按当条 user 消息判定期望输出语言(剥代码/公式/链接噪声后统计);
//   2) langDirective:随该轮 user 消息尾部注入的动态语言行(与 budgetDisclosure 同机制,
//      不进 system → 不破 prompt cache);
//   3) cjkRatio / explicitLangRequest:轮末输出语言纠偏 guard 的判据;
//   4) hasBoxArt:ASCII/制表符字符画检测(纠偏 guard 判据;prompt 正面模板对 flash 已被
//      审计证明无效,机械检测是唯一可靠防线)。

export type LangTag = "zh" | "en" | "ja" | "ko" | "ru" | "ar" | "th" | "lo" | "und";

export function stripNoise(t: string): string {
  return t
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@"[^"]+"/g, " "); // 附件路径标记
}

export function detectLang(raw: string): LangTag {
  // 取剥噪后尾部 2000 字符:规避首条消息的 in-band systemPrompt 前缀(中文规则文本拼最前)
  // 与长引文粘贴 —— 用户自己的指令通常在尾部。
  const t = stripNoise(raw).slice(-2000);
  let han = 0, hira = 0, kata = 0, hangul = 0, thai = 0, lao = 0, cyr = 0, arab = 0, latin = 0;
  for (const ch of t) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x4e00 && c <= 0x9fff) han++;
    else if (c >= 0x3040 && c <= 0x309f) hira++; // 平假名:助词 は の を が,真日文的标志
    else if ((c >= 0x30a0 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff)) kata++; // 片假名(含扩展)
    else if ((c >= 0xac00 && c <= 0xd7af) || (c >= 0x1100 && c <= 0x11ff)) hangul++;
    else if (c >= 0x0e00 && c <= 0x0e7f) thai++;
    else if (c >= 0x0e80 && c <= 0x0eff) lao++;
    else if (c >= 0x0400 && c <= 0x04ff) cyr++;
    else if (c >= 0x0600 && c <= 0x06ff) arab++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
  }
  const kana = hira + kata;
  const letters = han + kana + hangul + thai + lao + cyr + arab + latin;
  // 短消息弱信号(纯公式/链接/"ok")保留记忆偏好通道;但少量 CJK 已是无歧义信号,不该被短长度
  // 埋没 —— 否则「总结一下」「换成表格」这类最常见中文追问全落 und,L1/L2 语言防线在该长度双双失效
  // (审计 [12])。故仅当既短又非强 CJK 时才 und。
  const cjk = han + kana + hangul;
  const strongCJK = cjk >= 4 && cjk / Math.max(letters, 1) > 0.5;
  if (letters < 12 && !strongCJK) return "und";
  // 真日文是平假名/助词密集(は の を が);中文里嵌片假名外来词(ディープラーニング/ソニー)hira=0,
  // 不该被 kana 绝对数误判成日文(审计 [11])。故 ja 需平假名在场。纯片假名日文则落 und(不注入指令,安全)。
  if (hira >= 1 && kana >= 4) return "ja";
  if (hangul / letters > 0.3) return "ko";
  // 汉字绝对数优先:防「粘长英文材料 + 中文短指令」被 latin 占比误判为 en
  if (han >= 20 || han / letters >= 0.2) return "zh";
  if (lao / letters > 0.3) return "lo";
  if (thai / letters > 0.3) return "th";
  if (cyr / letters > 0.3) return "ru";
  if (arab / letters > 0.3) return "ar";
  if (latin / letters > 0.85 && han < 5) return "en";
  return "und";
}

export const langName: Record<Exclude<LangTag, "und">, string> = {
  zh: "中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  ru: "русский",
  ar: "العربية",
  th: "ไทย",
  lo: "ພາສາລາວ",
};

// 动态语言行:优先级具名声明 —— 当条消息语言 > 记忆偏好。与 budgetDisclosure 同机制
// append 到本轮 user 消息尾部(历史冻结不回改,system 跨轮 byte 稳定不破缓存)。
export function langDirective(tag: LangTag): string {
  if (tag === "und") return "";
  const name = langName[tag];
  return (
    `【本轮语言】用户本条消息使用「${name}」。本轮你的思考过程与回复一律使用「${name}」` +
    "——当条消息的语言优先于长期记忆中的语言偏好;仅当用户在本条消息中明确要求使用其它语言时,按其要求切换。" +
    "代码、命令、专业术语、文献标题与直接引语保持原文。"
  );
}

// 语言纠偏 guard 专用规整:stripNoise 之上再剥 markdown 表格行(表头/对齐分隔/正文行)。
// 表格单元格正是原文标题/作者/期刊名合法留英文之处 —— 一份「短中文引言 + 大英文文献表」若不剥表格,
// cjkRatio 会被英文表压到 <0.1 → 误判错语言交付 → 无谓纠偏轮把同一张表重发(审计 [13])。
// 刻意不改共享 stripNoise(那会扰动 detectLang 的输入语言判定)。
export function stripForLangGuard(t: string): string {
  return stripNoise(t)
    .split("\n")
    .filter((line) => {
      const s = line.trim();
      if (!s.includes("|")) return true;
      if (/^\|?[\s:|-]+\|?$/.test(s)) return false; // 对齐分隔行 |---|:--:|
      if (/^\|.*\|$/.test(s)) return false; // 表头/正文行 | a | b |
      return true;
    })
    .join("\n");
}

// 可见正文的 CJK 占比(轮末语言纠偏判据:期望 zh 而 CJK≈0 → 错语言交付)。
export function cjkRatio(s: string): number {
  let cjk = 0, letters = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x4e00 && c <= 0x9fff) {
      cjk++;
      letters++;
    } else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) {
      letters++;
    }
  }
  return letters === 0 ? 0 : cjk / letters;
}

// 用户当条消息里是否明确要求了其它语言(纠偏 guard 的豁免:合法英文交付不误伤)。
export function explicitLangRequest(userText: string): boolean {
  return /英文|英语|English|日文|日语|韩文|韩语|法语|德语|俄语|翻译成|译成|in English|用英文|写成英文|englisch/i.test(
    userText,
  );
}

// ---- ASCII/制表符字符画检测(P1-8)----
// 剔除带真编程语言标注的 fenced block(真代码里的 ── 分节注释不误伤);裸 ``` / ```text 块保留检测
// (flash 惯把字符画塞裸代码块)。mermaid 块整体豁免。
const CODE_LANGS =
  /^(python|py|typescript|ts|javascript|js|go|golang|java|c|cpp|c\+\+|rust|sql|bash|sh|shell|json|yaml|yml|toml|html|css|xml|r|matlab|latex|tex|mermaid)$/i;

// 结构字符 = box-drawing 里带竖直笔画/转角/交叉的字符(│┃┌┐└┘├┤┬┴┼ 及双线变体),
// 手画框必有它们;纯横线分隔(───)与真代码的 `// ─── 分节` 注释只有横线,结构字符=0。
function isStructuralBox(c: number): boolean {
  return c === 0x2502 || c === 0x2503 || (c >= 0x250c && c <= 0x254b) || (c >= 0x2551 && c <= 0x256c);
}
// 整段成规模框判据:结构字符 ≥3 且跨 ≥2 行 = 手画框(不是横线分隔/分节注释)。
function bigBoxBlock(text: string): boolean {
  let structural = 0,
    structLines = 0;
  for (const line of text.split("\n")) {
    let s = 0;
    for (const ch of line) if (isStructuralBox(ch.codePointAt(0)!)) s++;
    if (s > 0) structLines++;
    structural += s;
  }
  return structural >= 3 && structLines >= 2;
}

export function hasBoxArt(markdown: string): boolean {
  // 按 fenced block 切分。裸块/非代码语言块 → 完整检测;真代码语言块 → 只跑「成规模框」兜底
  //（回放暴露:flash 会把字符画框塞进标注了真语言的代码块逃避检测,box≥12 跨≥3 行的框不是代码,
  // 应检出;而真代码的单行 ─ 分节注释不跨 3 行,不误伤)。
  const segments: string[] = [];
  const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(markdown)) !== null) {
    segments.push(markdown.slice(last, m.index));
    const lang = (m[1] || "").trim();
    if (!lang || !CODE_LANGS.test(lang)) {
      segments.push(m[2]); // 裸块/非代码语言块参与完整检测
    } else if (lang.toLowerCase() !== "mermaid" && bigBoxBlock(m[2])) {
      return true; // 真代码语言块里塞了成规模框 → 直接判定(mermaid 渲染成图,豁免)
    }
    last = m.index + m[0].length;
  }
  segments.push(markdown.slice(last));

  for (const seg of segments) {
    const lines = seg.split("\n");
    const violations: boolean[] = lines.map((line) => {
      // a. 行内结构 box 字符(竖线/转角)≥ 2,或结构字符 ≥1 + 横线 ≥1(如 ├──)。降到 2 是修复
      //    回放暴露的漏检:手画框中间行「│ 文字 │」只有两侧两个 │,达不到旧阈值 3 → 整框只有顶底
      //    两行 violation 不触发。只数结构字符 → 纯横线分隔/`// ─── 分节`注释不误伤;GFM 表格用
      //    ASCII `|`(0x7C)不在此区间零误伤。
      let box = 0,
        structural = 0;
      for (const ch of line) {
        const c = ch.codePointAt(0)!;
        if (c >= 0x2500 && c <= 0x259f) box++;
        if (isStructuralBox(c)) structural++;
      }
      if (structural >= 2) return true;
      // b. 纯符号拼图行(长度≥10,整行由空白与符号构成;markdown 表格行含文字不会命中)
      const t = line.trim();
      if (t.length >= 10 && /^[\s|+\-_=~/\\<>^v.·*oO()\[\]{}#:]+$/.test(t) && !/^[-|: ]+$/.test(t)) {
        return true;
      }
      return false;
    });
    // 兜底:整段结构 box 字符成规模(≥3 且跨 ≥2 行)= 手画框,防窗口逻辑对稀疏但成规模的框漏检。
    if (bigBoxBlock(seg)) return true;
    // 任意 10 行窗口内 violation ≥ 3(单行 --- 分隔线、GFM 表格分隔行不触发)
    let run = 0;
    for (let i = 0; i < violations.length; i++) {
      if (violations[i]) run++;
      if (i >= 10 && violations[i - 10]) run--;
      if (run >= 3) return true;
    }
  }
  return false;
}
