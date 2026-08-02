// 取证型预检索 · 检索式抽取(2026-08 证据账本 P1)。**纯函数,零 I/O,零 LLM,零网络。**
//
// ── 这个文件回答一个问题:引擎要替模型先搜一枪,用什么当检索词?────────────────────
// 终稿 §一的判别力事实:本纪元内有过工具调用 → DOI 接地率 98%;失忆纪元 → 43%。
// **证据在场时模型本来就不编,它编是因为看不见。** 于是最强的干预不是「拦住它编」(出口闸),
// 而是让它开口的那一刻手上就有真东西 —— 引擎在第一次 LLM call 之前先跑一次检索。
// 这条路径完全不需要模型配合,因此**不依赖任何 provider 的 tool_choice 支持度**
// (tool-choice-probe-2026-08.md:线上主力 deepseek-v4-pro/flash 静默无视 tool_choice,闸未通过)。
//
// ── 唯一设计铁律:只做减法,不做加法 ──────────────────────────────────────────────
// 送上游的每一个词块,都是**用户原文的连续子串**。引擎从不翻译、不造同义词、不查词典、不改字。
// 三条理由,按重要性排:
//  1. **加法会往账本里灌错东西。** 账本的全部价值是「上面每一条都是某个工具真的返回过的」。
//     一个猜错的译名/同义词会把一批**真实但离题**的论文钉进账本,而模型后续引用它们时,
//     那是一次「相关性错误」—— 比幻觉轻,但仍然是我们亲手制造的。减法最坏只是召回差。
//  2. **zh→en 词典是一条会烂掉的规则。** 本仓库铁律:「一条永远绿的规则」和「一条不存在的
//     规则」等价。一份没人维护的术语表在半年后仍然「在跑」,但已经在系统性地搜错东西 ——
//     而且没有任何信号告诉我们它烂了。减法没有需要维护的知识。
//  3. **减法可审计。** 出了问题永远能指着用户原文说「我们只删了这几段、这几段是为什么删的」。
//
// ⇒ 因此本文件有两套词表,它们的**权限严格不同**,别把它们混起来:
//     · TRIM_PREFIX / TRIM_SUFFIX —— 会**改写**字符串,只在**锚定的头尾**生效,故保守。
//     · META_TEST                 —— **只用来判定「删干净后还剩东西吗」,永远不产出**,故可以很凶。
//   中文没有分词器可用(不许加依赖),而在串中间删停用词必然把词切碎(「研究生就业」删掉
//   「研究」剩「生就业」),那正是往上游发垃圾。**把删除降级成一次判定**是绕开分词的关键一招。
//
// ── 目标不是「一次搜准」──────────────────────────────────────────────────────────
// 宽口径探一枪(limit 小),目的是保证模型开口时账本非空;精修补搜由模型自己做
// (smart-search skill §1 原文就是「先用核心 2-3 词探路(limit=5),看回的标题再收紧」——
// 本模块是那句话的机械执行版,不是新策略)。

/** 抽取结果。null 表示「这条消息里抽不出可检索的主题」——那就**不预检索**,不是拿垃圾去搜。 */
export interface PrefetchQuery {
  /** 发给上游的检索式。 */
  query: string;
  /** 抽取路径,进 log:latin=只有拉丁术语 / cjk=只有中文词块 / mixed=两者都有。 */
  kind: "latin" | "cjk" | "mixed";
  /** 检索式里是否含中文 —— 零命中时的解释分支(平台三源是国际英文库)。 */
  hasCjk: boolean;
  /** 抽出的词块,**每一块都是用户原文的连续子串**(审计不变量,单测钉死)。 */
  terms: string[];
}

/** 只看消息前 N 字符:超长粘贴稿的正文不是检索意图(与 researchTurn.hasLiteratureIntent 同姿态)。 */
const SCAN_CHARS = 400;
const MAX_LATIN_TERMS = 4;
const MAX_CJK_TERMS = 3;
/** 单个中文词块的长度上限:超过它多半是整句话而不是术语,整块丢弃(**绝不截断块内文字**)。 */
const MAX_CJK_TERM_CHARS = 40;
/** 整条检索式的长度上限;超出从尾部丢**整块**。 */
const MAX_QUERY_CHARS = 60;

const CJK_CLASS = "\\u4e00-\\u9fff\\u3400-\\u4dbf";
const HAS_CJK_RE = new RegExp(`[${CJK_CLASS}]`);
const NON_CJK_RE = new RegExp(`[^${CJK_CLASS}]+`, "g");
/** 拉丁术语:必须字母开头,允许内部数字/连字符/加号/点(CRISPR-Cas9 / PD-1 / GPT-4 / C++ / scRNA-seq)。
 *  刻意取**极大匹配**再按长度过滤,而不是在正则里限长 —— 限长会把一个超长 run 切成几段,
 *  那是切碎(违反「连续子串」的精神);超长 run 应当整条丢弃。 */
const LATIN_TOKEN_RE = /[A-Za-z][A-Za-z0-9+\-.]*/g;
/** 拉丁 token 的长度上限:超过它的不是术语(粘贴的 base64 / 哈希 / 长串占位)。 */
const MAX_LATIN_TOKEN_CHARS = 30;
/** 单字符重复串(xxxxx / -----)不是术语。 */
const REPEATED_CHAR_RE = /^(.)\1+$/;

// ── 平台生成的块:这些不是用户打的字,一律先剥掉 ──────────────────────────────────
// 【引用文献】块的格式真源在 frontend-user/src/shared/lib/agent-references.ts(OPEN/CLOSE 常量);
// @"绝对路径" 附件标记的契约在 turnLoop.ts attachLine。两者都是平台注入,拿去当检索词是纯噪声。
const REFERENCE_BLOCK_RE = /【引用文献】[\s\S]*?(?:【\/引用文献】|$)/g;
const ATTACH_MARK_RE = /@"[^"\n]*"/g;
const FENCE_RE = /```[\s\S]*?(?:```|$)/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;
const URL_RE = /https?:\/\/\S+/g;
// 裸 DOI 刻意剥掉而不是拿去搜:手里有 DOI 是**解引用**任务(get_paper_by_doi),不是「凭记忆 vs 有证据」
// 那个失效模式。预检索只保留一条代码路径、一个工具、一次调用,不为这条支线加第二个入口。
const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>,;)]+/g;

function stripPlatformBlocks(text: string): string {
  return text
    .replace(REFERENCE_BLOCK_RE, " ")
    .replace(FENCE_RE, " ")
    .replace(INLINE_CODE_RE, " ")
    .replace(ATTACH_MARK_RE, " ")
    .replace(URL_RE, " ")
    .replace(DOI_RE, " ");
}

// ── ① 会改写字符串的词表:只在锚定的头/尾生效,故必须保守 ─────────────────────────────
// 「请求框架」(帮我查一下……)与「疑问尾巴」(……有哪些呢)是中文提问里可以剥掉的两头;
// 中间一律不动 —— 中间才是主题所在,也正是没有分词器就不能碰的地方。
//
// 🔴 **锚定 ≠ 安全**,这是本模块最容易犯的错,单测里有专门一条钉它:
//    「找 / 查 / 写 / 我」这类**单字动词或代词**放进前缀表,会把 `找矿`、`查体`、`写作`、
//    `我国水稻育种` 的第一个字吃掉,产出 `国水稻育种` 这种**看起来像中文、其实是碎片**的检索式 ——
//    比不做还坏(垃圾检索会往账本里灌离题题录)。同理 `推荐`→`推荐系统`、`搜索`→`搜索引擎`、
//    `检索`→`检索增强生成`、`分析`→`分析化学`、`查询`→`查询优化`:这些**二字动词也会撞术语词首**。
// ⇒ 定表规则(不许违反):前缀只收三类 ——
//    (a) 代词/语气/礼貌词:它们不可能是术语词首;
//    (b) 「…一下 / …几篇」这类**复合请求短语**:尾巴本身就是请求标记,不与术语撞;
//    (c) 极少数几乎不可能作术语词首的动作词(梳理/盘点/调研/汇总/撰写/起草/列出/列举)。
//    落不进这三类的动词**宁可不剥** —— 留下 "查" 只是噪声(排序略差),剥错是碎片(搜出垃圾)。
const TRIM_PREFIX = [
  // (a) 代词 / 语气 / 请求框架
  "你好", "您好", "请问", "麻烦你", "麻烦", "帮忙", "请帮我", "帮我", "请你", "请",
  "我想问", "我想了解", "我想", "我要", "我需要", "我在做", "我在", "我们",
  "能不能", "能否", "可不可以", "可以帮我", "给我", "替我",
  // (b) 复合请求短语(带请求标记的尾巴 → 与术语词首不冲突)
  "查一下", "查一查", "查查", "查找一下", "找一下", "找找", "找几篇", "找几个", "搜一下", "搜搜",
  "看一下", "看看", "说一下", "说说", "讲一下", "讲讲", "谈一谈", "谈谈",
  "介绍一下", "总结一下", "分析一下", "对比一下", "比较一下", "评估一下",
  "梳理一下", "整理一下", "推荐一下", "推荐几篇", "推荐几个",
  "检索一下", "搜索一下", "查询一下", "写一篇", "写一个", "写一下",
  // (c) 几乎不可能作术语词首的动作词
  "梳理", "盘点", "调研", "汇总", "撰写", "起草", "列出", "列举",
  // 范围 / 时间限定:是检索意图的修饰,不是主题本身
  "关于", "对于", "针对", "有关", "有没有", "有哪些", "还有哪些", "还有", "是否有", "是否",
  "一下", "一些", "一篇", "一个", "几篇", "几个", "若干",
  "最新", "最近", "目前", "现在", "当前", "近年来", "近年", "近五年", "近三年", "近十年", "国内外",
  "这个", "那个", "的",
];
// 后缀同理,但风险天然低一档:请求的尾巴几乎都是完整词(……的研究进展 / ……有哪些)。
// 仍刻意剔掉了 "等"(会把 `教育平等` 剪成 `教育平`);"等等" 保留。
const TRIM_SUFFIX = [
  "吗", "呢", "吧", "啊", "谢谢", "多谢", "了", "的", "等等",
  "有哪些", "哪些", "哪几篇", "是什么", "什么", "如何", "怎么样", "怎样", "怎么", "多少", "为什么",
  "文献综述", "系统综述", "系统评价", "研究综述", "综述",
  "研究进展", "最新进展", "研究现状", "研究热点", "研究方向", "研究领域", "研究",
  "参考文献", "相关文献", "文献", "论文", "文章", "期刊", "预印本",
  "进展", "现状", "热点", "前沿", "趋势", "动态",
  "重要发现", "代表性研究", "代表性工作", "研究工作", "代表作", "工作",
  "发现", "成果", "结论", "结果", "数据", "资料", "报告",
  "方面", "方向", "领域", "问题", "情况", "内容", "重要", "主要", "关键", "相关",
  "最新", "最近", "近年", "一下",
];

// ── ② 只用于判定、永远不产出的词表:因此可以很凶 ────────────────────────────────────
// 用法只有一处:把一个词块里的 meta 词**全部删掉**,看还剩不剩得下 2 个字。剩不下 = 这块话里
// 没有主题(「你应该使用查询论文的工具来找」),整块丢弃。删除结果只进 if,绝不进 query。
// ⇒ 上面因为「会撞术语词首」而被踢出 TRIM_PREFIX 的那些动词(查询/搜索/检索/推荐/分析/找/写…),
//   在这里可以放心收回来:判定用不会切碎任何东西。
// ⚠️ 往这里加词是安全的(最坏是少探一枪);往 TRIM_* 加词是危险的(会切碎用户的术语)。
const META_TEST = [
  ...TRIM_PREFIX, ...TRIM_SUFFIX,
  "查询", "查找", "检索", "搜索", "收集", "推荐", "分析", "总结", "介绍", "对比", "比较", "评估",
  "查", "找", "搜", "写", "看", "说", "讲", "谈", "列",
  "应该", "使用", "用", "工具", "来", "去", "把", "被", "让", "告诉", "帮", "我",
  "参考", "根据", "基于", "结合", "补充", "另外", "此外", "顺便", "比如", "例如", "这样", "那样",
  // 编辑/改写类请求(纯检索面的 smart_search 会把任何消息判成取证轮,这些词让它们落回 no_query)
  "润色", "改写", "修改", "校对", "排版", "翻译", "这段", "那段", "意思", "不要", "别", "一样",
  "可以吗", "行吗", "好吗", "这些", "那些", "它们", "他们", "你", "他", "它",
  "和", "与", "及", "以及", "或", "或者", "还是", "在", "对", "从", "到", "为", "于", "由",
  "是", "有", "没有", "不", "也", "都", "就", "还", "再", "又", "很", "太", "更", "并", "而", "且",
  "篇", "个", "些", "点", "种", "类", "条", "份", "等",
];

// ── 英文侧的停用词:功能词 + 请求元词 + 平台/文件类词。同样只用于**丢弃 token**,不改写 token。
const LATIN_STOP = new Set([
  "a", "an", "the", "and", "or", "but", "if", "of", "on", "in", "at", "to", "for", "from", "by",
  "with", "without", "about", "into", "over", "under", "between", "as", "is", "are", "was", "were",
  "be", "been", "being", "do", "does", "did", "can", "could", "will", "would", "shall", "should",
  "may", "might", "must", "have", "has", "had", "not", "no", "yes", "so", "than", "then", "there",
  "here", "this", "that", "these", "those", "it", "its", "them", "their", "they", "we", "our",
  "you", "your", "me", "my", "i", "he", "she", "his", "her",
  "please", "help", "find", "search", "look", "list", "give", "show", "tell", "explain",
  "summarize", "summarise", "write", "draft", "recommend", "need", "want", "know", "get",
  "recent", "latest", "new", "newest", "current", "any", "some", "all", "more", "most", "much",
  "many", "few", "several", "what", "which", "how", "why", "when", "who", "where",
  "paper", "papers", "article", "articles", "literature", "review", "reviews", "study", "studies",
  "research", "publication", "publications", "preprint", "preprints", "journal", "journals",
  "reference", "references", "citation", "citations", "state", "art", "overview", "progress",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "png", "jpg", "jpeg",
  "http", "https", "www", "com", "org", "doi", "url", "link",
]);

function alternation(words: readonly string[]): string {
  // 长的排前面:JS 正则交替是 leftmost-first,不排序会让「查」先命中而「查一下」永远轮不到。
  return [...new Set(words)].sort((a, b) => b.length - a.length).join("|");
}

const PREFIX_RE = new RegExp(`^(?:${alternation(TRIM_PREFIX)})`);
const SUFFIX_RE = new RegExp(`(?:${alternation(TRIM_SUFFIX)})$`);
const META_TEST_RE = new RegExp(alternation(META_TEST), "g");

/** 锚定剥两头,直到不再变短。每轮至少短 1 字符,故必然终止;循环帽只是防御性上界。 */
function trimRequestFrame(piece: string): string {
  let s = piece;
  for (let i = 0; i < 32; i++) {
    const before = s;
    s = s.replace(PREFIX_RE, "").replace(SUFFIX_RE, "");
    if (s === before) break;
  }
  return s;
}

/**
 * 这块话里还剩主题吗 —— **判定专用**(见文件头「两套词表权限不同」)。
 * 删干净后 <2 个汉字 = 整块都是请求措辞,没有可检索的东西。
 */
function hasTopicSubstance(piece: string): boolean {
  return piece.replace(META_TEST_RE, "").length >= 2;
}

/**
 * 从本轮用户原文抽一条宽口径检索式。抽不出 → null(**不预检索**,而不是拿垃圾去搜)。
 *
 * @param userText 本轮 user 消息**原文**:必须是 turnLoop append 任何平台指令(语言行 / 预算披露 /
 *   证据账本块)之前的那一份,否则会把我们自己注入的文字当成用户的检索意图。
 */
export function buildPrefetchQuery(userText: string): PrefetchQuery | null {
  if (!userText) return null;
  const scanned = stripPlatformBlocks(userText).slice(0, SCAN_CHARS);
  if (!scanned.trim()) return null;

  // ── 拉丁术语:天然有分隔符,直接取 token 再按停用词丢弃(token 本身一个字母都不改)。
  const latin: string[] = [];
  const seenLatin = new Set<string>();
  for (const raw of scanned.match(LATIN_TOKEN_RE) ?? []) {
    const tok = raw.replace(/[.\-+]+$/, ""); // 句末标点粘上来的尾巴
    if (tok.length < 2 || tok.length > MAX_LATIN_TOKEN_CHARS) continue;
    if (REPEATED_CHAR_RE.test(tok)) continue; // xxxxxxxx / ---- 一类占位不是术语
    const key = tok.toLowerCase();
    if (LATIN_STOP.has(key) || seenLatin.has(key)) continue;
    seenLatin.add(key);
    latin.push(tok);
  }

  // ── 中文词块:按「非汉字」切段(标点、空格、拉丁词都是天然切点),再锚定剥两头。
  //    刻意**不在段中间切**:没有分词器,中间切必然切碎术语(见文件头)。
  const cjk: string[] = [];
  const seenCjk = new Set<string>();
  for (const run of scanned.replace(NON_CJK_RE, "\n").split("\n")) {
    if (!run) continue;
    const piece = trimRequestFrame(run);
    if (piece.length < 2 || piece.length > MAX_CJK_TERM_CHARS) continue;
    if (!hasTopicSubstance(piece)) continue;
    if (seenCjk.has(piece)) continue;
    seenCjk.add(piece);
    cjk.push(piece);
  }

  // 中文块多于帽时留**最长的几块**(长块信息量高),但输出仍按原文顺序 —— 顺序即语序。
  const cjkKept =
    cjk.length <= MAX_CJK_TERMS
      ? cjk
      : [...cjk].sort((a, b) => b.length - a.length).slice(0, MAX_CJK_TERMS).sort((a, b) => cjk.indexOf(a) - cjk.indexOf(b));

  // 拉丁在前:平台三源是国际英文库,英文术语是它们真正能匹配的那一半。
  const terms: string[] = [];
  let used = 0;
  for (const t of [...latin.slice(0, MAX_LATIN_TERMS), ...cjkKept]) {
    const cost = t.length + (terms.length ? 1 : 0);
    if (used + cost > MAX_QUERY_CHARS) continue; // 丢整块,不截断
    terms.push(t);
    used += cost;
  }
  if (terms.length === 0) return null;

  const query = terms.join(" ");
  // 全拉丁且只剩一个 2 字符 token(如 "AI")= 信息量不足以当检索式,不值得为它花一次调用。
  if (query.length < 3) return null;

  const hasLatin = terms.some((t) => /[A-Za-z]/.test(t));
  const hasCjk = HAS_CJK_RE.test(query);
  return {
    query,
    kind: hasLatin && hasCjk ? "mixed" : hasCjk ? "cjk" : "latin",
    hasCjk,
    terms,
  };
}
