import {
  WandSparkles,
  PenLine,
  FileText,
  Type,
  Languages,
  AlignLeft,
  Scissors,
  Expand,
  RefreshCw,
  Package,
  ClipboardPaste,
  Calculator,
  Globe,
  ArrowUpRight,
  UserPen,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/lib/utils';
import { trackEvent } from '@/shared/lib/track';

/**
 * 写作能力菜单(V4 UI 重做 v2:分级 + 图形化 + 低文字密度)。
 *   · 空对话:智能起草卡(唯一带说明的元素)+ 6 宫格图标磁贴 —— 零描述文字,开聊即让位;
 *   · 有对话:composer ✨ 按钮 → 二级菜单(顶层只有 4 个分类 + 引导 + 画像行,子菜单按需展开)。
 * 预填类:模板指令填进输入框由用户补空确认(不直发);向导类:打开对应工作流弹层。
 */

export type WorkflowKey = 'revision' | 'translate' | 'numbers';

/** 写作画像状态(默认 AI 自动识别;控制收进输入框区,不占 header)。 */
export interface ProfileControl {
  name: string;
  source: string; // default | planner | user
  detecting?: boolean;
  onDetect: () => void;
  onPick: () => void;
}

export interface WritingMenuProps {
  onPrefill: (instr: string) => void;
  onWorkflow: (key: WorkflowKey) => void;
  stubSection?: string;
  profile?: ProfileControl;
  disabled?: boolean;
}

interface MenuItem {
  key: string;
  label: string;
  hint: string; // 降级为 hover tooltip,不占版面
  icon: typeof PenLine;
  kind: 'prefill' | 'workflow';
  instr?: string;
  workflow?: WorkflowKey;
}

interface MenuGroup {
  key: string;
  title: string;
  icon: typeof PenLine;
  /** 分类视觉身份(图形化):图标色 + 色底(只用 token 色)。 */
  iconCls: string;
  chipCls: string;
  items: MenuItem[];
}

const GROUPS: MenuGroup[] = [
  {
    key: 'draft', title: '起草', icon: PenLine, iconCls: 'text-brand-green', chipCls: 'bg-brand-green/10',
    items: [
      {
        key: 'expand', label: '扩写此节', hint: '补动机、机制与例证,不注水', icon: Expand, kind: 'prefill',
        instr: '请扩写《__节名__》:补充动机、机制与例证(不是注水),保持已有论点与引用位置不变。',
      },
      {
        key: 'abstract', label: '生成摘要', hint: '从成稿派生,数字必有出处', icon: FileText, kind: 'prefill',
        instr: '请根据当前成稿重写摘要(五槽:背景一句/目的/方法/关键结果带数字/意义)。摘要里的每个数字必须在正文有出处,不得新造数字。',
      },
      {
        key: 'titles', label: '标题候选', hint: '5 个可检索的候选,不改正文', icon: Type, kind: 'prefill',
        instr: '请为这篇论文拟 5 个候选标题(信息型为主,含关键变量与方法、可检索),每个配一句理由。只列候选,不要改动正文。',
      },
      {
        key: 'bilingual-abstract', label: '中英对照摘要', hint: '双语一致,先出候选', icon: Globe, kind: 'prefill',
        instr: '请生成中英对照摘要:先按成稿写英文 abstract,再给信息一致的中文摘要;数字须与正文一致。先以候选形式给出,不要直接写入正文。',
      },
    ],
  },
  {
    key: 'polish', title: '润色', icon: AlignLeft, iconCls: 'text-subtle', chipCls: 'bg-surface-2',
    items: [
      {
        key: 'polish-all', label: '全文分批润色', hint: '按节推进,每批确认', icon: AlignLeft, kind: 'prefill',
        instr: '请开始全文润色:按节分批,本轮只润色前两节(重点:句子清晰与段落衔接,不改论点不动引用);完成后停下,等我确认再继续下一批。',
      },
      {
        key: 'rewrite', label: '改写此段', hint: '轻/中/重三档,保事实与引用', icon: RefreshCw, kind: 'prefill',
        instr: '请【轻度/中度/重度——选一档】改写以下段落,保持事实、数字与引用位置不变:\n__粘贴要改写的段落__',
      },
      {
        key: 'compress', label: '压缩篇幅', hint: '删冗余,不删论点与限定', icon: Scissors, kind: 'prefill',
        instr: '请把《__节名/全文__》压缩到约 __ 词:删教程式铺垫与冗余表达,不删论点、限定词与引用。',
      },
    ],
  },
  {
    key: 'translate', title: '翻译', icon: Languages, iconCls: 'text-brand-amber', chipCls: 'bg-warning-soft',
    items: [
      {
        key: 'translate-section', label: '翻译此节', hint: '直译→润色,数字引用键保真', icon: Languages, kind: 'prefill',
        instr: '请把《__节名__》翻译成英文:先忠实直译、再单语润色去翻译腔;数字/单位/引用键逐一保真;本轮只译这一节。',
      },
      { key: 'translate', label: '整篇翻译', hint: '三步向导 · 术语表', icon: Globe, kind: 'workflow', workflow: 'translate' },
    ],
  },
  {
    key: 'submit', title: '投稿与工具', icon: Package, iconCls: 'text-brand-red', chipCls: 'bg-danger-soft',
    items: [
      { key: 'revision', label: '意见回应', hint: '拆条 · 逐条改稿 · 回应信', icon: ClipboardPaste, kind: 'workflow', workflow: 'revision' },
      {
        key: 'submission-pack', label: '投稿材料', hint: 'cover letter / highlights / 声明', icon: Package, kind: 'prefill',
        instr: '请起草投稿材料的《__cover letter / highlights / 作者贡献声明(选一件)__》;涉及真实姓名/编号/基金号一律留占位由我填。',
      },
      { key: 'numbers', label: '数字校验', hint: '生成段数字 ⊆ 源数据', icon: Calculator, kind: 'workflow', workflow: 'numbers' },
    ],
  },
];

function nudgeInstr(stub: string): string {
  return `请起草《${stub}》一节:先给出该节的主题句骨架(每段一句论点),我确认结构后再成文;不确定的事实/数字用 %TODO 占位,绝不编造。`;
}

function fire(item: MenuItem, props: WritingMenuProps, origin: string) {
  trackEvent('prism_quick_action', { action: item.key, origin });
  if (item.kind === 'workflow' && item.workflow) props.onWorkflow(item.workflow);
  else if (item.instr) props.onPrefill(item.instr);
}

/** 分类色图标 chip(图形化的最小单位)。 */
function IconChip({ icon: Icon, iconCls, chipCls, size = 'md' }: { icon: typeof PenLine; iconCls: string; chipCls: string; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-8', chipCls, size === 'lg' ? 'size-8' : 'size-6')}>
      <Icon className={cn(iconCls, size === 'lg' ? 'size-4' : 'size-3.5')} />
    </span>
  );
}

/** composer 内的 ✨ 按钮 + 二级菜单(顶层 = 引导 + 4 分类 + 画像行;子项按需展开)。 */
export function PrismWritingMenuButton(props: WritingMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="写作能力(起草 / 润色 / 翻译 / 投稿)"
          disabled={props.disabled}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-8 text-muted-foreground transition-colors',
            'hover:bg-surface-2 hover:text-foreground disabled:opacity-40 data-[state=open]:bg-surface-2 data-[state=open]:text-foreground',
          )}
        >
          <WandSparkles className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-52">
        {/* 智能引导:有骨架节时置顶(唯一动态项) */}
        {props.stubSection && (
          <>
            <DropdownMenuItem
              onSelect={() => {
                trackEvent('prism_quick_action', { action: 'next-section', origin: 'menu' });
                props.onPrefill(nudgeInstr(props.stubSection!));
              }}
              className="gap-2"
            >
              <IconChip icon={PenLine} iconCls="text-brand-green" chipCls="bg-brand-green/10" />
              <span className="min-w-0 flex-1 truncate text-xs font-bold">起草《{props.stubSection}》</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* 4 个分类:hover 展开子菜单(分级;顶层不铺任何子项) */}
        {GROUPS.map((g) => (
          <DropdownMenuSub key={g.key}>
            <DropdownMenuSubTrigger className="gap-2">
              <IconChip icon={g.icon} iconCls={g.iconCls} chipCls={g.chipCls} />
              <span className="text-xs">{g.title}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              {g.items.map((item) => (
                <DropdownMenuItem key={item.key} onSelect={() => fire(item, props, 'menu')} title={item.hint} className="gap-2">
                  <item.icon className={cn('size-3.5 shrink-0', g.iconCls)} />
                  <span className="min-w-0 flex-1 truncate text-xs">{item.label}</span>
                  {item.kind === 'workflow' && <ArrowUpRight className="size-3 shrink-0 text-faint" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}

        {/* 画像行(footer):默认 AI 自动识别,这里查看/更换 */}
        {props.profile && (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <UserPen className="size-3.5 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground" title={props.profile.name}>
                {props.profile.detecting ? '识别中…' : props.profile.name || '画像未识别'}
              </span>
              <button
                type="button"
                disabled={props.profile.detecting}
                onClick={() => props.profile!.onDetect()}
                title="根据当前稿件重新识别文体/学科"
                className="shrink-0 rounded-4 p-1 text-faint transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
              >
                {props.profile.detecting ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              </button>
              <button
                type="button"
                onClick={() => props.profile!.onPick()}
                className="shrink-0 rounded-4 px-1 py-0.5 text-2xs text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                更换
              </button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 空对话引导区:智能起草卡(唯一带说明的)+ 6 宫格图标磁贴(零描述);开聊即消失。 */
export function PrismChatEmptyState(props: WritingMenuProps) {
  // 6 宫格精选:每格 = 分类色图标 + 短标签(全集在 ✨ 菜单)。
  const tiles: { item: MenuItem; g: MenuGroup }[] = [
    { item: GROUPS[0].items[1], g: GROUPS[0] }, // 生成摘要
    { item: GROUPS[1].items[0], g: GROUPS[1] }, // 全文分批润色
    { item: GROUPS[2].items[1], g: GROUPS[2] }, // 整篇翻译
    { item: GROUPS[3].items[0], g: GROUPS[3] }, // 意见回应
    { item: GROUPS[3].items[1], g: GROUPS[3] }, // 投稿材料
    { item: GROUPS[3].items[2], g: GROUPS[3] }, // 数字校验
  ];
  const tileLabel: Record<string, string> = {
    abstract: '生成摘要', 'polish-all': '全文润色', translate: '整篇翻译',
    revision: '意见回应', 'submission-pack': '投稿材料', numbers: '数字校验',
  };
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-6">
      <div className="w-full max-w-xs">
        <p className="text-center text-md font-bold text-foreground">想从哪里开始?</p>

        {/* 智能引导卡:唯一带一句说明的元素 */}
        {props.stubSection && (
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => {
              trackEvent('prism_quick_action', { action: 'next-section', origin: 'empty' });
              props.onPrefill(nudgeInstr(props.stubSection!));
            }}
            className={cn(
              'mt-4 flex w-full items-center gap-2.5 rounded-16 border border-brand-green/30 bg-brand-green/5 px-3 py-2.5 text-left transition-colors',
              'hover:bg-brand-green/10 disabled:opacity-50',
            )}
          >
            <IconChip icon={PenLine} iconCls="text-brand-green" chipCls="bg-brand-green/10" size="lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-foreground">起草《{props.stubSection}》</span>
              <span className="block text-2xs text-muted-foreground">这一节还是空的,建议从它开始</span>
            </span>
          </button>
        )}

        {/* 6 宫格:图标磁贴,零描述文字 */}
        <div className={cn('grid grid-cols-3 gap-1.5', props.stubSection ? 'mt-2' : 'mt-4')}>
          {tiles.map(({ item, g }) => (
            <button
              key={item.key}
              type="button"
              disabled={props.disabled}
              title={item.hint}
              onClick={() => fire(item, props, 'empty')}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-12 border border-border py-3 transition-colors',
                'hover:border-border-strong hover:bg-surface-1 disabled:opacity-50',
              )}
            >
              <IconChip icon={item.icon} iconCls={g.iconCls} chipCls={g.chipCls} size="lg" />
              <span className="text-2xs text-subtle">{tileLabel[item.key] ?? item.label}</span>
            </button>
          ))}
        </div>

        {/* 脚注一行:更多入口 + 画像状态(合并,减字) */}
        <p className="mt-3 flex items-center justify-center gap-1 text-center text-2xs text-faint">
          更多在 <WandSparkles className="inline size-3" />
          {props.profile && (
            <>
              <span className="mx-0.5 text-border-separator">·</span>
              {props.profile.detecting ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> 识别画像…
                </span>
              ) : (
                <span className="truncate">{props.profile.name || '画像未识别'}</span>
              )}
              {!props.profile.detecting && (
                <button
                  type="button"
                  onClick={() => props.profile!.onPick()}
                  className="underline decoration-border-strong underline-offset-2 transition-colors hover:text-foreground"
                >
                  更换
                </button>
              )}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
