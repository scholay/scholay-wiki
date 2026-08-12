import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  CheckCheck,
  CircleHelp,
  Compass,
  EyeOff,
  GripHorizontal,
  Headphones,
  LayoutGrid,
  Mail,
  MessageCircle,
  MousePointerClick,
  Send,
  X,
} from "lucide-react";

const RHINO_FRAME = "/wiki/assets/rhino/pet-idle-frame-000.png";

type RhinoPanelMode =
  "chat" | "features" | "help" | "feedback" | "notifications";

const PANEL_MODES: ReadonlyArray<{
  id: RhinoPanelMode;
  label: string;
  icon: LucideIcon;
  badge?: string;
}> = [
  { id: "chat", label: "对话", icon: MessageCircle },
  { id: "features", label: "功能", icon: LayoutGrid },
  { id: "help", label: "帮助", icon: CircleHelp },
  { id: "feedback", label: "反馈", icon: Headphones },
  { id: "notifications", label: "通知", icon: Bell, badge: "2" },
];

/** product-mock 悬浮小犀牛的展开前入口；只呈现 hover 与收纳两种静态状态。 */
export function WikiEmbedRhinoAssistantEntry() {
  return (
    <div
      className="grid w-[min(100%,48rem)] gap-4 md:grid-cols-[minmax(0,1.35fr)_minmax(15rem,0.65fr)]"
      aria-hidden
      data-wiki-fixture="rhino-assistant-entry"
    >
      <section className="relative flex min-h-72 flex-col overflow-hidden rounded-12 border border-border bg-surface-card p-4">
        <p className="text-12 font-medium text-faint">悬浮入口 · 指针停留态</p>
        <div className="flex flex-1 flex-col items-center justify-center pt-3">
          <div className="rounded-12 border border-border bg-surface-1 p-1">
            <div className="flex items-center justify-center gap-1">
              <RhinoMenuItem icon={MessageCircle} label="对话" />
              <RhinoMenuItem icon={LayoutGrid} label="功能" />
              <RhinoMenuItem icon={CircleHelp} label="帮助" />
            </div>
            <div className="mt-1 flex items-center justify-center gap-1 border-t border-border-soft pt-1">
              <RhinoMenuItem icon={Headphones} label="反馈" />
              <RhinoMenuItem icon={Bell} label="通知" badge="2" />
              <RhinoMenuItem icon={EyeOff} label="隐藏" />
            </div>
          </div>
          <RhinoSprite className="mt-1 size-36" />
        </div>
        <p className="text-center text-12 leading-paragraph text-muted-foreground">
          单击互动，双击打开对话；角色和菜单可一起拖动。
        </p>
      </section>

      <section className="flex min-h-72 flex-col rounded-12 border border-border bg-surface-card p-4">
        <p className="text-12 font-medium text-faint">收纳入口 · 顶栏 Dock</p>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex h-12 w-full items-center gap-3 rounded-8 border border-border bg-surface-1 px-3">
            <span className="text-14 font-medium text-foreground">Scholay</span>
            <span className="ml-auto flex size-8 items-center justify-center rounded-8 bg-surface-2">
              <RhinoSprite className="size-8" />
            </span>
            <span className="flex size-8 items-center justify-center rounded-pill bg-foreground text-12 font-medium text-on-dark">
              研
            </span>
          </div>
          <div className="rounded-8 border border-border bg-surface-1 px-3 py-2 text-12 text-muted-foreground">
            放出牛犀犀
          </div>
        </div>
        <p className="text-center text-12 leading-paragraph text-muted-foreground">
          “隐藏”不会删除助手，顶栏头像旁会保留恢复入口。
        </p>
      </section>
    </div>
  );
}

/** 展开后的 560 × 420 帮助面板；复刻模式侧栏、帮助二级 Tab 和外置角色。 */
export function WikiEmbedRhinoAssistantHelpPanel() {
  return (
    <div
      className="relative w-[min(100%,44rem)] overflow-hidden rounded-12 border border-border bg-surface-2 p-4 pb-12 md:pl-24"
      aria-hidden
      data-wiki-fixture="rhino-assistant-help-panel"
    >
      <section className="ml-auto flex h-[26.25rem] w-[35rem] max-w-full flex-col overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay">
        <PanelHeader title="帮助" />
        <div className="flex min-h-0 flex-1">
          <RhinoModeRail active="help" />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border-soft px-3">
              {[
                ["拖点", true],
                ["功能", false],
                ["对话", false],
                ["导览", false],
              ].map(([label, active]) => (
                <span
                  key={String(label)}
                  className={`relative inline-flex h-full items-center px-3 text-12 font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {label}
                  {active ? (
                    <span className="absolute inset-x-2 bottom-0 h-px rounded-pill bg-brand-red" />
                  ) : null}
                </span>
              ))}
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-4">
              <p className="text-12 leading-paragraph text-muted-foreground">
                我是 Scholay
                的牛犀犀。展开后可以一起拖动；关掉窗口，我就收成角落里的小伙伴。
              </p>
              <div className="flex gap-3 rounded-8 border border-border bg-surface-1 p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-8 bg-success-soft text-brand-green">
                  <MousePointerClick className="size-4" />
                </span>
                <div>
                  <p className="text-14 font-medium text-foreground">
                    拖我 · 点我
                  </p>
                  <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
                    拖着走、点一下会坐趴跳。收起面板后我又变回悬浮的牛犀犀。
                  </p>
                </div>
              </div>
              <div className="flex gap-2 rounded-8 border border-dashed border-border p-3">
                <BookOpen className="mt-1 size-4 shrink-0 text-faint" />
                <p className="text-12 leading-paragraph text-muted-foreground">
                  上方可切换其它玩法说明，或开始“首页导览”。
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-8 border border-border bg-surface-card p-3">
                <span className="flex size-8 items-center justify-center rounded-8 bg-success-soft text-brand-green">
                  <Compass className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-12 font-medium text-foreground">
                    首页导览
                  </p>
                  <p className="mt-1 text-12 text-faint">
                    目前只覆盖首页；其他页面会提示先返回首页。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <RhinoSprite className="absolute bottom-1 left-1 size-32 md:left-3" />
    </div>
  );
}

/** 小犀牛助手内的通知与反馈代表态；两者沿用同一模式侧栏。 */
export function WikiEmbedRhinoAssistantSupportPanels() {
  return (
    <div
      className="grid w-[min(100%,60rem)] gap-4 lg:grid-cols-2"
      aria-hidden
      data-wiki-fixture="rhino-assistant-support-panels"
    >
      <RhinoServicePanel title="通知" active="notifications">
        <div className="flex h-10 items-center gap-1 border-b border-border-soft px-3">
          <span className="relative inline-flex h-full items-center px-3 text-12 font-medium text-foreground">
            全部
            <span className="absolute inset-x-2 bottom-0 h-px rounded-pill bg-brand-red" />
          </span>
          <span className="inline-flex h-full items-center gap-1 px-3 text-12 text-muted-foreground">
            未读
            <span className="rounded-pill bg-brand-red px-2 py-1 text-12 font-medium text-on-dark">
              2
            </span>
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-12 text-muted-foreground">
            <CheckCheck className="size-3" />
            全部已读
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Notice
            title="智能搜索任务已完成"
            copy="已整理 18 篇候选论文，可以继续核对并加入暂存区。"
            time="刚刚"
            unread
          />
          <Notice
            title="文献集分享已被接收"
            copy="对方已经打开你分享的文献集。"
            time="2 小时前"
          />
        </div>
      </RhinoServicePanel>

      <RhinoServicePanel title="反馈" active="feedback">
        <div className="flex h-10 items-center gap-1 border-b border-border-soft px-3">
          {[
            ["建议", true],
            ["Bug", false],
            ["其他", false],
          ].map(([label, active]) => (
            <span
              key={String(label)}
              className={`relative inline-flex h-full items-center px-3 text-12 font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}
            >
              {label}
              {active ? (
                <span className="absolute inset-x-2 bottom-0 h-px rounded-pill bg-brand-red" />
              ) : null}
            </span>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-3">
          <p className="text-12 text-muted-foreground">
            说说想法或问题，我们会认真看每一条。
          </p>
          <div>
            <p className="text-12 font-medium text-foreground">内容</p>
            <div className="mt-1 min-h-24 rounded-8 border border-border bg-surface-1 p-3 text-12 leading-paragraph text-faint">
              遇到的问题、改进想法，写清楚一点更好……
            </div>
            <div className="mt-1 flex justify-between text-12 text-faint">
              <span>至少 10 字</span>
              <span>0/2000</span>
            </div>
          </div>
          <div>
            <p className="text-12 font-medium text-foreground">回复邮箱</p>
            <div className="mt-1 flex h-10 items-center gap-2 rounded-8 border border-border bg-surface-1 px-3 text-12 text-faint">
              <Mail className="size-4" />
              name@example.com
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-border p-3">
          <span className="flex h-10 items-center justify-center gap-2 rounded-8 bg-foreground text-12 font-medium text-on-dark">
            <Send className="size-4" />
            提交反馈
          </span>
        </div>
      </RhinoServicePanel>
    </div>
  );
}

function RhinoSprite({ className }: { className: string }) {
  return (
    <img
      src={RHINO_FRAME}
      alt=""
      draggable={false}
      width={256}
      height={256}
      className={`object-contain ${className}`}
    />
  );
}

function RhinoMenuItem({
  icon: Icon,
  label,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  badge?: string;
}) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-pill px-2 text-12 font-medium text-foreground">
      <Icon className="size-3" />
      {label}
      {badge ? (
        <span className="rounded-pill bg-brand-red px-2 py-1 text-12 text-on-dark">
          {badge}
        </span>
      ) : null}
    </span>
  );
}

function PanelHeader({ title }: { title: string }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <GripHorizontal className="size-4 text-faint" />
      <p className="min-w-0 flex-1 text-12 font-medium text-foreground">
        {title}
      </p>
      <span className="flex size-8 items-center justify-center rounded-8 text-muted-foreground">
        <X className="size-4" />
      </span>
    </header>
  );
}

function RhinoModeRail({
  active,
  compact = false,
}: {
  active: (typeof PANEL_MODES)[number]["id"];
  compact?: boolean;
}) {
  return (
    <aside
      className={`${compact ? "w-24" : "w-[7.5rem]"} shrink-0 border-r border-border bg-surface-1 p-2`}
    >
      <div className="space-y-1">
        {PANEL_MODES.map(({ id, label, icon: Icon, badge }) => (
          <div
            key={id}
            className={`flex h-8 items-center gap-2 rounded-8 px-2 text-12 ${id === active ? "bg-surface-card font-medium text-brand-red shadow-raised" : "text-muted-foreground"}`}
          >
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {badge ? (
              <span className="rounded-pill bg-brand-red px-2 py-1 text-12 font-medium text-on-dark">
                {badge}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}

function RhinoServicePanel({
  title,
  active,
  children,
}: {
  title: string;
  active: "notifications" | "feedback";
  children: ReactNode;
}) {
  return (
    <section className="relative min-h-[26.25rem] overflow-hidden rounded-12 border border-border bg-surface-2 p-3 pb-10 pl-10">
      <div className="flex h-[24rem] min-w-0 flex-col overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay">
        <PanelHeader title={title} />
        <div className="flex min-h-0 flex-1">
          <RhinoModeRail active={active} compact />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
      <RhinoSprite className="absolute bottom-0 left-0 size-20" />
    </section>
  );
}

function Notice({
  title,
  copy,
  time,
  unread = false,
}: {
  title: string;
  copy: string;
  time: string;
  unread?: boolean;
}) {
  return (
    <article
      className={`flex gap-2 border-b border-border-soft p-3 ${unread ? "bg-danger-soft/40" : ""}`}
    >
      <span
        className={`mt-2 size-2 shrink-0 rounded-pill ${unread ? "bg-brand-red" : "bg-transparent"}`}
      />
      <div className="min-w-0">
        <p className="text-12 font-medium text-foreground">{title}</p>
        <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
          {copy}
        </p>
        <p className="mt-1 text-12 text-faint">{time}</p>
      </div>
    </article>
  );
}
