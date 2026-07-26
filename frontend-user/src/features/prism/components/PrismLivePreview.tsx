import { memo, useMemo } from 'react';
import { MarkdownRenderer } from '@/shared/components/chat/MarkdownRenderer';
import { buildNumberingFromMarkdown, citeDisplay, type CiteNumbering } from '../lib/cite-render';
import { PrismReferencesList } from './PrismReferencesList';

/**
 * 流式写作预览(Scholay Prism v2)。AI 一轮里每写完一次 document.md(Write/Edit 完成),usePrismChat 的
 * chat.live.content 就更新成**整份**最新 markdown —— 本组件把它渲染成接近「文章面」的只读预览,让用户在轮末
 * 提交前就看到 AI 写了什么(比过去干等提交+编译早)。轮末切回 StructEditor(精排 + 本次改动 diff 痕迹)。
 *
 * 只读预览 ≠ 精确的 struct/Tiptap 面:引用 [@key] 显示为原文、配图显示为占位、公式经 KaTeX 渲染。
 * 真源仍是结构体;这里纯展示。前置信息(title/abstract/keywords)从 document.md 顶部 frontmatter 抽出显示。
 * Level 1(逐工具调用)下 live.content 总是完整文件,故 frontmatter 完整可靠(不必处理半截)。
 */

function splitFrontMatter(md: string): { title: string; abstract: string; keywords: string; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { title: '', abstract: '', keywords: '', body: md };
  const head = m[1];
  const grab = (k: string) => {
    const r = head.match(new RegExp('^' + k + ':\\s*(.*)$', 'm'));
    return r ? r[1].trim() : '';
  };
  return { title: grab('title'), abstract: grab('abstract'), keywords: grab('keywords'), body: md.slice(m[0].length) };
}

// P1-1 逐 token 流式:内容可能是**半截文件**(正流式写入),结尾常停在未闭合的显示公式 / 代码围栏。
// 若原样喂 KaTeX/markdown 会渲成破碎公式、疯狂闪烁。这里砍掉尾部未闭合的**显示公式 $$** 与代码围栏,
// 只渲染到最近一个安全边界;下一帧补齐后自然续上。非流式(整份文件)时恒平衡,原样返回。
//
// 刻意**只处理 $$ 显示公式**,不碰行内单 $:正文里的货币「$5」、shell「$VAR」会让「奇数个 $ 就截断」
// 误吞掉后半段可见文本(review #6),而 KaTeX 对落单的 $ 本按字面渲染、危害很小。取舍下宁可偶发一帧
// 行内公式闪一下,也不吞正文。
function sanitizePartialMarkdown(md: string): string {
  let s = md;
  // 未闭合的代码围栏 ``` → 砍到最后一个围栏之前
  const fences = (s.match(/```/g) || []).length;
  if (fences % 2 === 1) s = s.slice(0, s.lastIndexOf('```'));
  // 未闭合的显示公式 $$ → 砍到最后一个 $$ 之前(奇数个 $$ = 有一个没闭合)
  const dd = (s.match(/\$\$/g) || []).length;
  if (dd % 2 === 1) s = s.slice(0, s.lastIndexOf('$$'));
  return s;
}

// 把受限 markdown 清成「像真实 LaTeX 输出」的可读预览:
//   ① [@key]/[@a; @b] → [1]/[1, 2] 编号,[@fig:x] → 图 N(与文末参考文献表同源编号)
//   ② 交叉引用锚 {#fig:x} 是 LaTeX 锚、非可见文本 → 去掉(否则标题/公式后拖着 {#sec:x} 很难看)
//   ③ 配图行 ![图](asset "caption") → 占位(asset 是资产 id,直接渲染会破图)
function cleanBody(body: string, numbering: CiteNumbering): string {
  return body
    .replace(/\[@([^\]]+)\]/g, (_all, inner) => citeDisplay(String(inner), numbering))
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_all, inner) => {
      const cap = String(inner).match(/"([^"]*)"/);
      return `*[配图${cap && cap[1] ? ' : ' + cap[1] : ''}]*`;
    })
    .replace(/[ \t]*\{#[a-zA-Z]+:[^}]+\}/g, '');
}

export const PrismLivePreview = memo(function PrismLivePreview({
  markdown,
  bibliography,
}: {
  markdown: string;
  bibliography?: Record<string, string>;
}) {
  const { title, abstract, keywords, body } = useMemo(() => splitFrontMatter(markdown), [markdown]);
  // 编号据**原始** body 建(含 {#锚} 与 [@key]),供行内替换 + 文末参考文献表同源。
  const numbering = useMemo(() => buildNumberingFromMarkdown(body), [body]);
  // 先砍掉流式半截的未闭合公式/围栏(防 KaTeX 闪烁),再做引用编号/锚清理/配图占位。
  const cleanedBody = useMemo(
    () => cleanBody(sanitizePartialMarkdown(body), numbering),
    [body, numbering]
  );
  return (
    <div className="relative">
      <div className="mx-auto max-w-[720px] px-12 py-10 font-serif text-14 text-foreground">
        {title && <p className="text-center text-24 font-bold">{title}</p>}
        {abstract && (
          <div className="mx-auto mt-6 max-w-[86%]">
            <p className="mb-1 text-center text-12 font-bold">摘要</p>
            <p className="indent-8 text-justify text-12 leading-paragraph">{abstract}</p>
          </div>
        )}
        {keywords && (
          <p className="mx-auto mt-2 max-w-[86%] text-12">
            <span className="font-bold">关键词:</span> {keywords}
          </p>
        )}
        <div className="mt-8">
          <MarkdownRenderer text={cleanedBody} className="!text-14" />
        </div>
      </div>
      {/* 参考文献编号列表(像真实 LaTeX 文末 References)—— 与正文行内 [N] 同源编号 */}
      <PrismReferencesList numbering={numbering} bibliography={bibliography} />
    </div>
  );
});
PrismLivePreview.displayName = ' PrismLivePreview';
