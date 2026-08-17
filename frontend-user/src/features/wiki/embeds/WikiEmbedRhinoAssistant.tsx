import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CheckCheck,
  CircleHelp,
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
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

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

/** product-mock 悬浮小犀牛的展开前入口；冻结已登录、有 2 条未读的 hover 状态。 */
export function WikiEmbedRhinoAssistantEntry() {
  return (
    <div
      className="relative flex min-h-56 w-[min(100%,32rem)] items-end justify-center overflow-hidden px-4 pb-4 pt-24"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="rhino-assistant-entry"
    >
      <div className="relative size-28">
        <div className="absolute bottom-full left-1/2 z-raised mb-1 flex -translate-x-1/2 items-center justify-center">
          <div className="flex flex-col gap-1 whitespace-nowrap rounded-16 border border-border bg-surface-card p-1 shadow-overlay">
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
        </div>
        <RhinoSprite className="size-28" />
        <span className="absolute right-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-brand-red px-2 text-12 font-medium text-on-dark shadow-raised">
          2
        </span>
      </div>
    </div>
  );
}

/** `hidden === true` 时才出现的顶栏恢复入口；与悬浮角色互斥。 */
export function WikiEmbedRhinoAssistantDock() {
  return (
    <div
      className="flex min-h-32 w-[min(100%,16rem)] items-center justify-center"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="rhino-assistant-dock"
    >
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-12 bg-surface-2">
        <RhinoSprite className="size-7" />
      </span>
    </div>
  );
}

/** 展开后的 560 × 420 帮助面板；冻结在默认的「拖点」Tab。 */
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
            </div>
          </div>
        </div>
      </section>
      <RhinoSprite className="absolute bottom-1 left-1 size-32 md:left-3" />
    </div>
  );
}

/** 小犀牛助手内的通知列表；冻结已登录、有 2 条未读的单一状态。 */
export function WikiEmbedRhinoAssistantNotificationsPanel() {
  return (
    <RhinoServicePanel
      fixtureId="rhino-assistant-support-panels"
      title="通知"
      active="notifications"
    >
      <div className="flex h-10 items-center gap-1 border-b border-border-soft px-3">
        <span className="relative inline-flex h-full items-center px-3 text-12 font-medium text-foreground">
          全部
          <span className="absolute inset-x-2 bottom-0 h-px rounded-pill bg-brand-red" />
        </span>
        <span className="inline-flex h-full items-center gap-1 px-3 text-12 text-muted-foreground">
          未读
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-brand-red px-1 text-12 font-medium text-on-dark">
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
          title="智能搜论文任务已完成"
          copy="已整理 18 篇候选论文，可以继续核对并加入暂存区。"
          time="刚刚"
          unread
        />
        <Notice
          title="文献集分享已被接收"
          copy="对方已经打开你分享的文献集。"
          time="2 小时前"
          unread
        />
      </div>
    </RhinoServicePanel>
  );
}

/** 小犀牛助手内的精简反馈表单；只冻结尚未填写、尚未提交的状态。 */
export function WikiEmbedRhinoAssistantFeedbackPanel() {
  return (
    <RhinoServicePanel
      fixtureId="rhino-assistant-feedback-panel"
      title="反馈"
      active="feedback"
    >
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
            遇到的问题、改进想法，写清楚一点更好…
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
    <span className="inline-flex h-7 items-center gap-1 rounded-pill px-2 text-12 font-medium text-foreground">
      <Icon className="size-3.5" strokeWidth={2} />
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
  fixtureId,
  title,
  active,
  children,
}: {
  fixtureId:
    "rhino-assistant-support-panels" | "rhino-assistant-feedback-panel";
  title: string;
  active: "notifications" | "feedback";
  children: ReactNode;
}) {
  return (
    <section
      className="relative w-[min(100%,44rem)] overflow-hidden p-4 pb-12 md:pl-24"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture={fixtureId}
    >
      <div className="ml-auto flex h-[26.25rem] w-[35rem] max-w-full min-w-0 flex-col overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay">
        <PanelHeader title={title} />
        <div className="flex min-h-0 flex-1">
          <RhinoModeRail active={active} />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
      <RhinoSprite className="absolute bottom-1 left-1 size-28 md:left-3" />
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
