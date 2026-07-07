import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
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
import { bodyToTiptap, tiptapToBody, bodySignature, type PMNode } from '../lib/struct-tiptap';
import type { DocStruct } from '../api/prism';

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
}

function parseKeywords(s: string): string[] {
  return s
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
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
  'font-serif text-md leading-relaxed text-foreground',
  '[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[40vh]',
  '[&_.ProseMirror_p]:text-justify [&_.ProseMirror_p]:indent-8 [&_.ProseMirror_p]:my-2',
  '[&_.ProseMirror_h1]:mt-6 [&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h1]:text-xl [&_.ProseMirror_h1]:font-bold',
  '[&_.ProseMirror_h2]:mt-6 [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-bold',
  '[&_.ProseMirror_h3]:mt-4 [&_.ProseMirror_h3]:mb-1.5 [&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-bold',
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
  }
>(
  function StructEditor({ doc, editable, onChange, onInsertImage, onInsertMath, onInsertCitation, diffBaseline, onDiffDismiss }, ref) {
    const fm = doc.frontMatter ?? { title: '' };
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

    const timerRef = useRef<number | null>(null);
    const pendingRef = useRef(0); // 自身保存回声计数:>0 时下一次 doc 变更不重置编辑器

    // 用户一开始编辑(正文或前置字段)→ 通知父层清掉本次改动标识;diff 是纯标记,不是确认门。
    const maybeDismissDiff = () => {
      if (diffBaselineRef.current) onDiffDismissRef.current?.();
    };

    const authors = (fm.authors ?? [])
      .map((a) => [a.given, a.family].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(', ');

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

    const doEmit = () => {
      const next = buildDoc();
      if (!next) return;
      pendingRef.current += 1;
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
    }));

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
      if (pendingRef.current > 0) {
        pendingRef.current -= 1;
        return;
      }
      const bodyIncoming = bodySignature(doc.body ?? []);
      const bodyCurrent = bodySignature(tiptapToBody(editor.getJSON() as PMNode));
      if (bodyIncoming !== bodyCurrent) {
        editor.commands.setContent(bodyToTiptap(doc.body ?? []), { emitUpdate: false });
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

    const onFm = (setter: (v: string) => void) => (v: string) => {
      setter(v);
      scheduleEmit();
      maybeDismissDiff();
    };

    // 前置字段的本次改动高亮(textarea 无法做词级 diff,故字段级绿底+绿环标「此字段被 AI 改过」);
    // baseline 为空或用户已编辑则无。
    const bfm = diffBaseline?.frontMatter;
    const fmHi = 'rounded bg-brand-green/15 ring-1 ring-inset ring-brand-green/40';
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

        <div className="mx-auto max-w-[720px] px-12 py-10 font-serif text-md text-foreground">
          {/* 标题 / 作者 / 日期(标题可编辑) */}
        <AutoGrow
          value={title}
          onChange={onFm(setTitle)}
          editable={editable}
          placeholder="无标题"
          className={cn('text-center text-2xl font-bold leading-snug', fmChanged.title && fmHi)}
        />
        {authors && <p className="mt-3 text-center text-base">{authors}</p>}
        <p className="mt-1 text-center text-sm text-subtle">{today()}</p>

        {/* 摘要(可编辑):居中标题 + 两端对齐块 */}
        <div className="mx-auto mt-6 max-w-[86%]">
          <p className="mb-1 text-center text-sm font-bold">摘要</p>
          <AutoGrow
            value={abstract}
            onChange={onFm(setAbstract)}
            editable={editable}
            placeholder="在此填写摘要…"
            className={cn('indent-8 text-justify text-sm leading-relaxed', fmChanged.abstract && fmHi)}
          />
        </div>

        {/* 关键词(可编辑) */}
        <div className="mx-auto mt-2 flex max-w-[86%] items-baseline gap-1 text-sm">
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
      </div>
    );
  },
);
