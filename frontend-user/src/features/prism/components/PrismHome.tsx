import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FileText, Loader2, PenTool, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useRegisterSidebarRail } from '@/stores/sidebar.store';
import { toApiError } from '@/shared/lib/http';
import { cn } from '@/shared/lib/utils';
import { CenteredLanding } from '@/shared/components/CenteredLanding';
import { FeatureBrandHeading } from '@/shared/components/FeatureBrandHeading';
import { FeatureGuideCards } from '@/shared/components/FeatureGuideCards';
import { useUrlState } from '@/shared/hooks';
import { useCreateProject, useProjects, type PrismProject } from '../api/prism';

const RECENT_LIMIT = 12;

/**
 * 智能写作主页 —— 主区居中标题 + 新建卡与近期项目单排横滑。
 * 选中某项目 → onOpen 进入工作区(那时 sidebar 换成文件目录+大纲)。
 */
export function PrismHome({ onOpen }: { onOpen: (id: number) => void }) {
  // 侧栏收起态的冗余入口(顶栏 rail chip):点击 = 展开 sidebar + 闪一下「项目」段。
  useRegisterSidebarRail([{ id: 'prism-projects', label: '项目', icon: PenTool, sectionId: 'prism-projects' }]);

  return <HomeMain onOpen={onOpen} />;
}

function HomeMain({ onOpen }: { onOpen: (id: number) => void }) {
  const [mode] = useUrlState('mode', '');
  const heading = mode === 'quick' ? '快速写作' : '高级写作';
  const create = useCreateProject();
  const { data: projects } = useProjects();
  const recent = recentProjects(projects);

  const onCreate = async (title: string) => {
    try {
      const res = await create.mutateAsync(title.trim() || '未命名项目');
      onOpen(res.project.id);
    } catch (e) {
      toast.error(toApiError(e).message || '新建项目失败');
    }
  };

  return (
    <CenteredLanding contentClassName="flex w-full max-w-3xl flex-col items-center">
      <FeatureBrandHeading as="h1" title={heading} mark={false} />
      <p className="mt-1.5 text-center text-12 text-muted-foreground">
        科研级 LaTeX 写作工作区 —— 实时编译预览、AI 定点改写润色、文献库一键 \cite
      </p>
      <div className="mt-6 w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain pb-1">
        <div className="flex w-max min-w-full justify-center gap-4">
          <NewProjectCard onCreate={onCreate} pending={create.isPending} />
          {recent.map((p) => (
            <RecentProjectCard key={p.id} project={p} onOpen={onOpen} />
          ))}
        </div>
      </div>
      <FeatureGuideCards topic={heading} wikiHref="/wiki/prism" />
    </CenteredLanding>
  );
}

function recentProjects(projects: PrismProject[] | undefined): PrismProject[] {
  if (!projects?.length) return [];
  return [...projects]
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, RECENT_LIMIT);
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function RecentProjectCard({
  project,
  onOpen,
}: {
  project: PrismProject;
  onOpen: (id: number) => void;
}) {
  const title = project.title || '未命名项目';
  const updated = formatUpdated(project.updated_at);
  return (
    <button
      type="button"
      onClick={() => onOpen(project.id)}
      title={title}
      className={cn(
        'flex h-36 w-60 shrink-0 snap-start flex-col justify-between rounded-16 border border-border bg-surface-card p-4 text-left',
        'transition-colors hover:border-foreground',
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-12 bg-surface-2">
        <FileText className="size-5 text-foreground" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-14 font-medium text-foreground">{title}</p>
        {updated ? (
          <p className="mt-1 text-12 text-faint">{updated} 更新</p>
        ) : null}
      </div>
    </button>
  );
}

/**
 * 新建卡 —— 两态。
 *
 * 静态:整卡只有居中的「+ / 新建项目」,与右侧的历史项目卡形成干净对比,
 *       不在首屏就把一个空输入框摆在用户面前(那会让这排卡片看起来像个表单)。
 * 点击:**原地**展开输入框,不跳转、不开弹窗 —— 焦点自动落进去,直接打字回车即建。
 *       Esc / 失焦且未输入 → 收回静态,不留下一个半开的空输入框。
 */
function NewProjectCard({
  onCreate,
  pending,
}: {
  onCreate: (title: string) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 展开后把焦点送进输入框 —— 少一次点击。放 effect 而不是 onClick 里直接 focus():
  // 那时 input 还没挂载(同一次 render 内 editing 才刚变 true)。
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const collapse = () => {
    setEditing(false);
    setTitle('');
  };

  // 卡片本体的几何/描边两态共用 —— 虚线描边把「待创建」与右侧实线的已有项目卡区分开,
  // 不靠颜色,色盲也分得清。
  const shell = cn(
    'flex h-36 w-60 shrink-0 snap-start flex-col rounded-16 border border-dashed border-border-strong bg-surface-card',
    'transition-colors focus-within:border-foreground hover:border-foreground'
  );

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="新建项目"
        className={cn(shell, 'items-center justify-center gap-3')}
      >
        {/* 「+」做成朱砂软底方块 —— 与右侧卡片的 FileText 同一套视觉语言,只是居中放大。 */}
        <span className="flex size-11 items-center justify-center rounded-12 bg-brand-red-soft">
          <Plus className="size-6 text-brand-red" strokeWidth={2.2} />
        </span>
        <span className="text-14 font-medium text-foreground">新建项目</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        onCreate(title);
      }}
      onKeyDown={(e) => {
        // Esc 收回。⚠️ 必须 stopPropagation:这张卡可能坐在 Dialog/Sheet 里,
        // 冒泡上去会顺手把外层浮层一起关掉。
        if (e.key === 'Escape') {
          e.stopPropagation();
          collapse();
        }
      }}
      onBlur={(e) => {
        // 只在焦点真的离开整张卡、且用户什么都没输入时才收回 ——
        // currentTarget.contains 挡住「input → 提交按钮」这种卡内移焦。
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (!title.trim() && !pending) collapse();
      }}
      className={cn(shell, 'justify-between p-4')}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-8 bg-brand-red-soft">
          <Plus className="size-3.5 text-brand-red" strokeWidth={2.4} />
        </span>
        <span className="text-14 font-medium text-foreground">新建项目</span>
      </div>

      {/* 输入行 —— 与全站「显式提交型」输入同构:回车与点按走同一条 onSubmit,
          且尾部有可见的提交按钮(只靠回车没有可发现性,这是本仓库做过的一轮修复)。 */}
      <div className="flex items-center gap-1 rounded-8 border border-border bg-surface-1 pl-2.5 pr-1 transition-colors focus-within:border-border-control">
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="项目名称"
          maxLength={80}
          enterKeyHint="done"
          disabled={pending}
          /* outline-none 合法:焦点可供性由外层的 focus-within:border-border-control 提供 */
          className="h-8 min-w-0 flex-1 bg-transparent text-12 text-foreground outline-none placeholder:text-faint disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="创建项目"
          title="创建项目"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-8 text-faint transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ArrowRight className="size-3.5" strokeWidth={2.2} />
          )}
        </button>
      </div>

      <span className="text-12 text-faint">留空也可创建,稍后可重命名</span>
    </form>
  );
}

