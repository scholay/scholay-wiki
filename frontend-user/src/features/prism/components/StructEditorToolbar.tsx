import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Image as ImageIcon,
  Sigma,
  AtSign,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * 编辑区顶部的「Word 式」格式工具条(Scholay Prism)。
 * 只放**编辑操作**(加粗/斜体/标题/列表 + 插入图片/公式);编译、导出、历史等**文档级**动作在外层 header。
 * 激活态用 useEditorState 订阅编辑器事务(选区/内容变化即时反映),避免整棵编辑器重渲染。
 * onMouseDown preventDefault:点按钮时不抢走编辑器焦点、不清空选区。
 */

function TB({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded-8 text-subtle transition-colors',
        'hover:bg-surface-2 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent',
        active && 'bg-surface-2 text-foreground',
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-4 w-px shrink-0 bg-border-separator" />;

export function StructEditorToolbar({
  editor,
  onInsertImage,
  onInsertMath,
  onInsertCitation,
}: {
  editor: Editor | null;
  onInsertImage?: () => void;
  onInsertMath?: () => void;
  onInsertCitation?: () => void;
}) {
  const st = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed?.isActive('bold') ?? false,
      italic: ed?.isActive('italic') ?? false,
      h1: ed?.isActive('heading', { level: 1 }) ?? false,
      h2: ed?.isActive('heading', { level: 2 }) ?? false,
      h3: ed?.isActive('heading', { level: 3 }) ?? false,
      ul: ed?.isActive('bulletList') ?? false,
      ol: ed?.isActive('orderedList') ?? false,
      hasSel: ed ? !ed.state.selection.empty : false,
    }),
  });

  if (!editor) return null;
  const run = (fn: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => () =>
    fn(editor.chain().focus()).run();

  return (
    <div className="sticky top-0 z-raised flex flex-wrap items-center gap-0.5 border-b border-border bg-background/95 px-3 py-1.5 backdrop-blur">
      <TB active={st?.bold} title="加粗" onClick={run((c) => c.toggleBold())}>
        <Bold className="size-3.5" />
      </TB>
      <TB active={st?.italic} title="斜体" onClick={run((c) => c.toggleItalic())}>
        <Italic className="size-3.5" />
      </TB>
      <Sep />
      <TB active={st?.h1} title="标题 1" onClick={run((c) => c.toggleHeading({ level: 1 }))}>
        <Heading1 className="size-3.5" />
      </TB>
      <TB active={st?.h2} title="标题 2" onClick={run((c) => c.toggleHeading({ level: 2 }))}>
        <Heading2 className="size-3.5" />
      </TB>
      <TB active={st?.h3} title="标题 3" onClick={run((c) => c.toggleHeading({ level: 3 }))}>
        <Heading3 className="size-3.5" />
      </TB>
      <Sep />
      <TB active={st?.ul} title="无序列表" onClick={run((c) => c.toggleBulletList())}>
        <List className="size-3.5" />
      </TB>
      <TB active={st?.ol} title="有序列表" onClick={run((c) => c.toggleOrderedList())}>
        <ListOrdered className="size-3.5" />
      </TB>
      {(onInsertImage || onInsertMath || onInsertCitation) && <Sep />}
      {onInsertImage && (
        <TB title="插入图片" onClick={onInsertImage}>
          <ImageIcon className="size-3.5" />
        </TB>
      )}
      {onInsertMath && (
        <TB title="插入公式" onClick={onInsertMath}>
          <Sigma className="size-3.5" />
        </TB>
      )}
      {onInsertCitation && (
        <TB title="插入引用(从文献库)" onClick={onInsertCitation}>
          <AtSign className="size-3.5" />
        </TB>
      )}
    </div>
  );
}
StructEditorToolbar.displayName = 'StructEditorToolbar';
