import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { StarterKit } from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Placeholder } from '@tiptap/extension-placeholder';
import 'katex/dist/katex.min.css';
import { cn } from '@/shared/lib/utils';
import { InlineMath, BlockMath, Citation, Figure, OpaqueBlock, StructBlockMeta } from './tiptap-extensions';
import { StructEditorToolbar } from './StructEditorToolbar';
import { DiffMarks, diffMarksKey } from './tiptap-diff-marks';
import { buildDiffDecorations } from '../lib/struct-diff-decorations';
import { bodyToTiptap, tiptapToBody, bodySignature, type PMNode } from '../lib/struct-tiptap';
import { buildNumberingFromBody } from '../lib/cite-render';
import { PrismReferencesList } from './PrismReferencesList';
import type { DocBlock, DocStruct } from '../api/prism';

/**
 * 所见即所得结构体编辑器(Scholay Prism)。真源永远是结构体 JSON;Tiptap 只是编辑层。
 * 用户在渲染文档上直接打字,永不见 LaTeX/markdown 标记;改动防抖回写结构体(onChange→父层保存)。
 * 前置信息(标题/摘要/关键词)是文章的一部分,用独立可编辑字段承载,不进 Tiptap 文档。
 */

export interface StructEditorHandle {
  /** 取当前编辑内容组装的结构体(供「保存并编译 / 插入图片公式」等动作即时读取,顺带清防抖)。 */
  flush: () => DocStruct | null;
  /** 在光标处插入一个引用节点 [@key](插入引用选择器用);随后防抖回写把 InlineCite 落进结构体。 */
  insertCitation: (key: string) => void;
  /** 本次 AI 改动的处数(0 = 无改动痕迹);供工具栏显示「改动 N 处 · 上/下一处」导航。 */
  changeCount: () => number;
  /** 跳到相对光标的下一处(dir=1)/上一处(dir=-1)AI 改动并滚动到视口。无改动则 no-op。 */
  goToChange: (dir: 1 | -1) => void;
}

function parseKeywords(s: string): string[] {
  return s
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// P1-3:把外部新正文**增量**同步进编辑器 —— 只替换「变化的中间那段」顶层块,保留公共前缀/后缀节点不动
// (免整棵 PM 树重建 → 不 remount 不变的 KaTeX/图/表、不丢滚动位置、diff 装饰更平滑)。**带安全网**:
// 算出的事务先在内存里核对结果 body 签名 == 目标签名,不一致(或任何异常)一律回落到整档 setContent
// (旧的已验证行为)→ 增量只是纯优化,永不可能改坏文档。返回是否走了增量路径(仅供调试)。
function applyBodyToEditor(
  editor: NonNullable<ReturnType<typeof useEditor>>,
  newBody: DocBlock[],
): void {
  const fallback = () => editor.commands.setContent(bodyToTiptap(newBody), { emitUpdate: false });
  try {
    const schema = editor.schema;
    // 目标 doc:经 schema.nodeFromJSON 走完整 PM 归一(相邻同 marks 的 text 会被合并),与 editor 活节点同规格。
    const targetDoc = schema.nodeFromJSON(bodyToTiptap(newBody) as object);
    const newNodes: ProseNode[] = [];
    targetDoc.forEach((n) => newNodes.push(n));
    const oldNodes: ProseNode[] = [];
    editor.state.doc.forEach((n) => oldNodes.push(n));
    // 公共前缀
    let p = 0;
    while (p < oldNodes.length && p < newNodes.length && oldNodes[p].eq(newNodes[p])) p++;
    // 公共后缀(不与前缀重叠)
    let s = 0;
    while (
      s < oldNodes.length - p &&
      s < newNodes.length - p &&
      oldNodes[oldNodes.length - 1 - s].eq(newNodes[newNodes.length - 1 - s])
    ) {
      s++;
    }
    // 顶层块起点位置 = 前 p 个块的 nodeSize 之和(PM 顶层子节点边界位置)。
    let from = 0;
    for (let i = 0; i < p; i++) from += oldNodes[i].nodeSize;
    let to = from;
    for (let i = p; i < oldNodes.length - s; i++) to += oldNodes[i].nodeSize;
    const middle = newNodes.slice(p, newNodes.length - s);
    const tr = editor.state.tr.replaceWith(from, to, middle);
    tr.setMeta('addToHistory', false); // 外部同步不进撤销栈
    // 安全网:替换后的 doc 与目标 doc **PM 级 eq** 比较(两侧都已 PM 归一,消除「相邻同 marks text 合并」
    // 导致的签名往返 false-negative —— review #1;否则 **a****b** 这类会永远回落 setContent、增量白做)。
    if (!tr.doc.eq(targetDoc)) {
      fallback();
      return;
    }
    editor.view.dispatch(tr);
  } catch {
    fallback();
  }
}

// 前置信息用的无边框自增高文本域(看起来是文章文字,不是表单框)。
function AutoGrow({
  value,
  onChange,
  editable,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`; // 动态尺寸,允许的内联 style 例外
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      disabled={!editable}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      // cn(tailwind-merge):调用方传的高亮底色(bg-brand-green/…)要能覆盖这里的 bg-transparent,
      // 纯字符串拼接会让两个 bg-* 同时存在、由 CSS 顺序决定(高亮经常输)——必须走 cn 才可靠。
      className={cn(
        'w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-faint disabled:cursor-default',
        className,
      )}
    />
  );
}

// 正文编辑区:覆盖成 LaTeX article 观感 —— 衬线、两端对齐、首行缩进、章节加粗、表格描边。
const bodyClass = [
  'font-serif text-14 leading-paragraph text-foreground',
  '[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[40vh]',
  '[&_.ProseMirror_p]:text-justify [&_.ProseMirror_p]:indent-8 [&_.ProseMirror_p]:my-2',
  '[&_.ProseMirror_h1]:mt-6 [&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h1]:text-20 [&_.ProseMirror_h1]:font-bold',
  '[&_.ProseMirror_h2]:mt-6 [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:text-16 [&_.ProseMirror_h2]:font-bold',
  '[&_.ProseMirror_h3]:mt-4 [&_.ProseMirror_h3]:mb-1.5 [&_.ProseMirror_h3]:text-14 [&_.ProseMirror_h3]:font-bold',
  '[&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6',
  '[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6',
  '[&_.ProseMirror_li]:my-0.5 [&_.ProseMirror_li>p]:indent-0 [&_.ProseMirror_li>p]:my-0',
  '[&_.ProseMirror_table]:my-3 [&_.ProseMirror_table]:mx-auto [&_.ProseMirror_table]:border-collapse',
  '[&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-border [&_.ProseMirror_td]:px-2 [&_.ProseMirror_td]:py-1 [&_.ProseMirror_td]:align-top',
  '[&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-border [&_.ProseMirror_th]:bg-surface-1 [&_.ProseMirror_th]:px-2 [&_.ProseMirror_th]:py-1 [&_.ProseMirror_th]:font-bold',
  // 空文档占位(Placeholder 扩展给首个空段挂 .is-editor-empty + data-placeholder)。
  '[&_.ProseMirror_.is-editor-empty]:before:pointer-events-none [&_.ProseMirror_.is-editor-empty]:before:float-left [&_.ProseMirror_.is-editor-empty]:before:h-0 [&_.ProseMirror_.is-editor-empty]:before:text-faint [&_.ProseMirror_.is-editor-empty]:before:content-[attr(data-placeholder)]',
].join(' ');

function today(): string {
  try {
    return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

export const StructEditor = forwardRef<
  StructEditorHandle,
  {
    doc: DocStruct;
    editable: boolean;
    onChange: (doc: DocStruct) => void;
    /** 顶部工具条的「插入图片 / 插入公式 / 插入引用」— 文档级动作(上传/落库/选文献)在父层,这里只是触发。 */
    onInsertImage?: () => void;
    onInsertMath?: () => void;
    onInsertCitation?: () => void;
    /** 本次 AI 改动的「改动前」结构体:据它在编辑器里原地标出增删痕迹(无则不标)。 */
    diffBaseline?: DocStruct | null;
    /** 用户一开始编辑就通知父层清掉本次改动标识(diff 只是标记,不设确认门)。 */
    onDiffDismiss?: () => void;
    /** 本次 AI 改动的**可导航锚点数**(与「上/下一处」跳转同源)。父层用它显示「改动 N 处」并决定是否显示导航,
     *  避免用另一条 diff 管道(块级 + 前置字段)算出的数与实际可跳站点对不上(review #2:纯前置字段改动会
     *  显示 N 处却按钮全哑)。0 = 正文无可跳改动。 */
    onDiffChangeCount?: (count: number) => void;
  }
>(
  function StructEditor(
    { doc, editable, onChange, onInsertImage, onInsertMath, onInsertCitation, diffBaseline, onDiffDismiss, onDiffChangeCount },
    ref,
  ) {
    const fm = doc.frontMatter ?? { title: '' };
    // 参考文献编号(与正文行内 [N] 同源 buildNumberingFromBody);只读展示,不进编辑器可编辑区。
    const refNumbering = useMemo(() => buildNumberingFromBody(doc.body ?? []), [doc.body]);
    const [title, setTitle] = useState(fm.title ?? '');
    const [abstract, setAbstract] = useState(fm.abstract ?? '');
    const [keywords, setKeywords] = useState((fm.keywords ?? []).join(', '));

    // 用 ref 让防抖回写读到最新值,而不触发重建。
    const docRef = useRef(doc);
    docRef.current = doc;
    const titleRef = useRef(title);
    titleRef.current = title;
    const abstractRef = useRef(abstract);
    abstractRef.current = abstract;
    const keywordsRef = useRef(keywords);
    keywordsRef.current = keywords;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const diffBaselineRef = useRef(diffBaseline);
    diffBaselineRef.current = diffBaseline;
    const onDiffDismissRef = useRef(onDiffDismiss);
    onDiffDismissRef.current = onDiffDismiss;
    const onDiffChangeCountRef = useRef(onDiffChangeCount);
    onDiffChangeCountRef.current = onDiffChangeCount;

    const timerRef = useRef<number | null>(null);
    // P1-3:外部改动**增量应用中**标志 —— 增量 replace 是真事务(会触发 onUpdate),但语义上是外部同步、
    // 不该当成用户编辑(否则 scheduleEmit 回存 + maybeDismissDiff 清掉刚要展示的 diff)。故 onUpdate 里跳过。
    const applyingExternalRef = useRef(false);
    // 自身保存回声:记最近一次 emit 的内容签名。save 往返后经 setQueryData 回灌的规范结构体会与它一致
    // → 跳过重置(防光标跳、也防覆盖用户在往返之间新打的字)。签名判回声比旧的自增计数器更稳:
    // 计数器在 save 失败/回声合并时会泄漏(残留 >0 → 之后真·外部改动被误吞)或误吞正当外部改动(评审 #4)。
    const lastEmittedSigRef = useRef<string | null>(null);

    // 用户一开始编辑(正文或前置字段)→ 通知父层清掉本次改动标识;diff 是纯标记,不是确认门。
    const maybeDismissDiff = () => {
      if (diffBaselineRef.current) onDiffDismissRef.current?.();
    };

    // 作者固定匿名(不再有作者/机构编辑逻辑)—— 与后端 projector 的 \author{Anonymous} 一致。
    const authors = 'Anonymous';

    const editor = useEditor({
      editable,
      immediatelyRender: true,
      extensions: [
        StarterKit.configure({ codeBlock: false, blockquote: false, horizontalRule: false, code: false, strike: false }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        InlineMath,
        BlockMath,
        Citation,
        Figure,
        OpaqueBlock,
        StructBlockMeta,
        DiffMarks,
        Placeholder.configure({ placeholder: '在此开始撰写正文…', showOnlyWhenEditable: true }),
      ],
      content: bodyToTiptap(doc.body ?? []),
      // onUpdate 只在用户/程序真正改文档时触发(setContent emitUpdate:false 不触发)→ 用户一编辑就清本次改动标识。
      onUpdate: () => {
        if (applyingExternalRef.current) return; // 外部改动增量应用中 → 不当用户编辑(不回存、不清 diff)
        scheduleEmit();
        maybeDismissDiff();
      },
      onBlur: () => flushPending(),
      editorProps: { attributes: { class: 'ProseMirror' } },
    });

    const buildDoc = (): DocStruct | null => {
      if (!editor) return null;
      const base = docRef.current;
      return {
        ...base,
        frontMatter: {
          ...base.frontMatter,
          title: titleRef.current,
          abstract: abstractRef.current,
          keywords: parseKeywords(keywordsRef.current),
        },
        body: tiptapToBody(editor.getJSON() as PMNode),
      };
    };

    // 结构体「内容签名」:正文 + 前置字段(标题/摘要/关键词)。用于把自身保存的回声与真·外部改动区分开。
    const emitSig = (d: DocStruct): string =>
      bodySignature(d.body ?? []) +
      ' ' +
      JSON.stringify([
        d.frontMatter?.title ?? '',
        d.frontMatter?.abstract ?? '',
        (d.frontMatter?.keywords ?? []).join(''),
      ]);

    const doEmit = () => {
      const next = buildDoc();
      if (!next) return;
      // 记下本次 emit 的内容签名:回声(save 往返后回灌的规范结构体)与它一致 → doc 变更时跳过重置。
      lastEmittedSigRef.current = emitSig(next);
      onChangeRef.current(next);
    };

    function scheduleEmit() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        doEmit();
      }, 800);
    }

    // 立即落库(失焦 / 主动动作时清防抖并回写)。
    function flushPending() {
      if (!timerRef.current) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      doEmit();
    }

    useImperativeHandle(ref, () => ({
      flush: () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return buildDoc();
      },
      insertCitation: (key: string) => {
        editor?.chain().focus().insertContent({ type: 'citation', attrs: { citeKey: key } }).run();
      },
      changeCount: () => changeAnchors().length,
      goToChange: (dir: 1 | -1) => {
        const anchors = changeAnchors();
        if (!editor || !anchors.length) return;
        const cur = editor.state.selection.from;
        const target =
          dir > 0
            ? (anchors.find((a) => a > cur) ?? anchors[0]) // 环绕:过末尾回到第一处
            : ([...anchors].reverse().find((a) => a < cur) ?? anchors[anchors.length - 1]);
        const pos = Math.min(Math.max(1, target), editor.state.doc.content.size);
        editor.chain().focus().setTextSelection(pos).scrollIntoView().run();
      },
    }));

    // P1-3 变更导航:本次 AI 改动的锚点位置(去重升序)。从 diff 装饰的 from 位置取(与就地绿加/红删同源)。
    function changeAnchors(): number[] {
      const baseline = diffBaselineRef.current?.body;
      if (!editor || !baseline) return [];
      try {
        const froms = buildDiffDecorations(editor.state.doc, baseline).map((d) => d.from);
        return [...new Set(froms)].sort((a, b) => a - b);
      } catch {
        return [];
      }
    }

    useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, []);

    // editable 变化(审阅态只读)→ 同步给编辑器。
    useEffect(() => {
      editor?.setEditable(editable);
    }, [editor, editable]);

    // doc 外部变更(agent 应用 / 换模板 / 插入)→ 重置编辑器与前置字段;自身保存回声跳过(防光标跳)。
    useEffect(() => {
      if (!editor) return;
      // 自身保存回声:本次进来的 doc 与最近一次 emit 内容一致 → 整体跳过重置(正文 + 前置字段一起),
      // 既防光标跳,也防覆盖用户在 save 往返之间新打的字(评审 #4)。
      if (emitSig(doc) === lastEmittedSigRef.current) return;
      const bodyIncoming = bodySignature(doc.body ?? []);
      const bodyCurrent = bodySignature(tiptapToBody(editor.getJSON() as PMNode));
      if (bodyIncoming !== bodyCurrent) {
        // P1-3:增量替换变化块(非整档重建);applying 标志让其真事务不被 onUpdate 当成用户编辑。
        applyingExternalRef.current = true;
        try {
          applyBodyToEditor(editor, doc.body ?? []);
        } finally {
          applyingExternalRef.current = false;
        }
      }
      const t = doc.frontMatter?.title ?? '';
      const a = doc.frontMatter?.abstract ?? '';
      const kw = doc.frontMatter?.keywords ?? [];
      if (t !== titleRef.current) setTitle(t);
      if (a !== abstractRef.current) setAbstract(a);
      if (kw.join('') !== parseKeywords(keywordsRef.current).join('')) setKeywords(kw.join(', '));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doc, editor]);

    // 本次改动原地 diff:只把 baseline(改动前正文块)塞进 DiffMarks 插件 state,装饰由插件的 decorations(state)
    // prop 按**当前 doc** 现算(见 tiptap-diff-marks.ts)。因此这里无需依赖 doc、无需管时序 —— baseline 一变就设,
    // 新内容 setContent 进来后 ProseMirror 会自动用新 doc 重算装饰。baseline 为空(用户已编辑/无改动)→ 设 null 清除。
    useEffect(() => {
      if (!editor) return;
      editor.view.dispatch(editor.state.tr.setMeta(diffMarksKey, diffBaseline?.body ?? null));
    }, [editor, diffBaseline]);

    // 向父层汇报**可导航锚点数**(与「上/下一处」同源)—— 放在同步/baseline effect 之后,读到的是已同步的
    // 编辑器 doc。父层据此显示「改动 N 处」并决定是否显示导航,保证「显示的数 == 能跳到的处数」。
    useEffect(() => {
      if (!editor) return;
      onDiffChangeCountRef.current?.(changeAnchors().length);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor, doc, diffBaseline]);

    const onFm = (setter: (v: string) => void) => (v: string) => {
      setter(v);
      scheduleEmit();
      maybeDismissDiff();
    };

    // 前置字段的本次改动高亮(textarea 无法做词级 diff,故字段级绿底+绿环标「此字段被 AI 改过」);
    // baseline 为空或用户已编辑则无。
    const bfm = diffBaseline?.frontMatter;
    const fmHi = 'rounded-4 bg-brand-green/15 ring-1 ring-inset ring-brand-green/40';
    const fmChanged = {
      title: !!bfm && (bfm.title ?? '') !== title,
      abstract: !!bfm && (bfm.abstract ?? '') !== abstract,
      keywords: !!bfm && (bfm.keywords ?? []).join(', ') !== keywords,
    };

    return (
      <div className="min-h-full">
        {/* Word 式格式工具条(编辑操作)——只读/审阅态不显示 */}
        {editable && (
          <StructEditorToolbar
            editor={editor}
            onInsertImage={onInsertImage}
            onInsertMath={onInsertMath}
            onInsertCitation={onInsertCitation}
          />
        )}

        <div className="mx-auto max-w-[720px] px-12 py-10 font-serif text-14 text-foreground">
          {/* 标题 / 作者 / 日期(标题可编辑) */}
        <AutoGrow
          value={title}
          onChange={onFm(setTitle)}
          editable={editable}
          placeholder="无标题"
          className={cn('text-center text-24 font-bold', fmChanged.title && fmHi)}
        />
        {authors && <p className="mt-3 text-center text-14">{authors}</p>}
        <p className="mt-1 text-center text-12 text-subtle">{today()}</p>

        {/* 摘要(可编辑):居中标题 + 两端对齐块 */}
        <div className="mx-auto mt-6 max-w-[86%]">
          <p className="mb-1 text-center text-12 font-bold">摘要</p>
          <AutoGrow
            value={abstract}
            onChange={onFm(setAbstract)}
            editable={editable}
            placeholder="在此填写摘要…"
            className={cn('indent-8 text-justify text-12 leading-paragraph', fmChanged.abstract && fmHi)}
          />
        </div>

        {/* 关键词(可编辑) */}
        <div className="mx-auto mt-2 flex max-w-[86%] items-baseline gap-1 text-12">
          <span className="shrink-0 font-bold">关键词:</span>
          <input
            value={keywords}
            disabled={!editable}
            onChange={(e) => onFm(setKeywords)(e.target.value)}
            placeholder="逗号分隔"
            className={cn('min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint disabled:cursor-default', fmChanged.keywords && fmHi)}
          />
        </div>

          {/* 正文:所见即所得 */}
          <div className={`mt-8 ${bodyClass}`}>
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* 参考文献编号列表(只读,像真实 LaTeX 文末 References)—— 在可编辑正文之外,据 bibliography 生成 */}
        <PrismReferencesList numbering={refNumbering} bibliography={doc.bibliography} />
      </div>
    );
  },
);
