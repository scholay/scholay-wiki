import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BookOpen,
  Compass,
  LayoutGrid,
  MessageCircle,
  MousePointerClick,
} from 'lucide-react';
import { toast } from 'sonner';
import { RhinoSplitPane } from '@/shared/components/RhinoSplitPane';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useRhinoAssistant } from '@/stores/rhino-assistant.store';

const TIPS = [
  {
    id: 'drag',
    icon: MousePointerClick,
    menuLabel: '拖点',
    title: '拖我 · 点我',
    body: `拖着走、点一下会坐趴跳。收起面板后我又变回悬浮的${RHINO_NAME}。`,
  },
  {
    id: 'features',
    icon: LayoutGrid,
    menuLabel: '功能',
    title: '功能',
    body: '打开快捷入口：文献搜索、智能助手、写作、审稿等一键直达。',
  },
  {
    id: 'chat',
    icon: MessageCircle,
    menuLabel: '对话',
    title: '对话',
    body: '在这里轻量问答。更完整的研究对话去首页「智能助手」。',
  },
] as const;

type HelpSection = (typeof TIPS)[number]['id'] | 'tour';

/** Help content for the expanded rhino shell. */
export function RhinoHelpBody() {
  const location = useLocation();
  const requestTour = useRhinoAssistant((s) => s.requestTour);
  const [section, setSection] = useState<HelpSection>('drag');

  const startTour = () => {
    if (location.pathname !== '/') {
      toast.message('页面导览目前只覆盖首页', {
        description: '先回到首页再开始～',
      });
      return;
    }
    requestTour();
  };

  const activeTip = TIPS.find((t) => t.id === section);
  const TipIcon = activeTip?.icon;

  return (
    <RhinoSplitPane
      menu={[
        ...TIPS.map((t) => ({
          id: t.id,
          label: t.menuLabel,
          icon: t.icon,
        })),
        { id: 'tour', label: '导览', icon: Compass },
      ]}
      activeId={section}
      onSelect={(id) => setSection(id as HelpSection)}
    >
      <div className="flex h-full min-h-0 flex-col overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {section === 'tour' ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex gap-2.5 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-2">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-green/10 text-brand-green">
                <Compass className="size-3.5" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">首页导览</p>
                <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                  带你过一遍首页主入口。目前只覆盖首页；在其他页面会提示先回去。
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('mt-auto w-full gap-1.5')}
              onClick={startTour}
            >
              <Compass className="size-3.5" strokeWidth={2} />
              带我逛一遍首页
            </Button>
          </div>
        ) : activeTip && TipIcon ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              我是 Scholay 的{RHINO_NAME}。展开后可以一起拖动；关掉窗口，我就收成角落里的小伙伴。
            </p>
            <div className="flex gap-2.5 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-2.5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-green/10 text-brand-green">
                <TipIcon className="size-3.5" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {activeTip.title}
                </p>
                <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                  {activeTip.body}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-dashed border-border/70 px-2.5 py-2">
              <BookOpen
                className="mt-0.5 size-3.5 shrink-0 text-subtle"
                strokeWidth={2}
              />
              <p className="text-2xs leading-relaxed text-muted-foreground">
                左侧还能切换其它玩法说明，或开始「首页导览」。
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </RhinoSplitPane>
  );
}
