import {
  forwardRef,
  useState,
  type ComponentType,
  type ReactElement,
} from 'react';
import {
  Globe,
  Grid3x3,
  MessageSquare,
  PanelRightOpen,
  Plus,
  Share2,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { QuickOpenPaperDialog } from '@/features/browser/components/QuickOpenPaperDialog';
import { useOpenPaperDetail } from '@/shared/hooks/useOpenInSearchPanel';
import {
  useSearchRightPanelStore,
  WORKSPACE_FUNCTION_LABEL,
  type RightPanelVariant,
} from '@/stores/search-right-panel.store';
import { cn } from '@/shared/lib/utils';

/** @deprecated 边缘吸附后不再预留右轨宽度;保留导出以免外部引用断裂。 */
export const FEATURE_HUB_RAIL_PX = 268;
/** @deprecated 同上。 */
export const FEATURE_HUB_RAIL_MAX_PX = 560;

/** 卡宽;收起态露出更多封面(别埋太深)。 */
const CARD_W_PX = 168;
const PEEK_PX = 112;
/** 封面高度 —— 文字叠在图上,不再另占标题条。 */
const CARD_H_PX = 72;

type Accent = {
  chip: string;
  focusRing: string;
};

type HubCard = {
  key: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  accent: Accent;
  Illustration: (p: { reduce: boolean }) => ReactElement;
  onClick?: () => void;
};

/**
 * 右侧拓展入口。
 *
 * - `search`:贴右缘滑出的功能名片(扩展区 / PDF Chat / 图谱 / 矩阵 / 浏览器)
 * - `assistant`:智能助手 / 文献集 —— 右上角小图标打开详情/产物扩展区(无边缘大卡)
 */
export function RightPanelFeatureHub({
  variant = 'search',
}: {
  variant?: RightPanelVariant;
}) {
  const setActiveFunction = useSearchRightPanelStore((s) => s.setActiveFunction);
  const infoTabs = useSearchRightPanelStore((s) => s.infoTabs);
  const setActiveInfoTab = useSearchRightPanelStore((s) => s.setActiveInfoTab);
  const openShell = useSearchRightPanelStore((s) => s.openShell);
  const openPaper = useOpenPaperDetail();
  const reduce = !!useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const assistant = variant === 'assistant';

  // 「扩展区」= 详情/产物壳;PDF Chat / 图谱 / 矩阵各自有独立名片,不要误开成 pdf-chat。
  const openExpansionArea = () => {
    const lastInfo = infoTabs.at(-1);
    if (lastInfo) setActiveInfoTab(lastInfo.id);
    else openShell();
  };

  if (assistant) {
    return (
      <aside
        aria-label="扩展区入口"
        className="pointer-events-none absolute inset-0 z-40"
      >
        <button
          type="button"
          onClick={openExpansionArea}
          title="打开右侧扩展区"
          aria-label="打开右侧扩展区"
          className={cn(
            'pointer-events-auto absolute right-3 top-3 inline-flex size-9 cursor-pointer items-center justify-center',
            'rounded-lg border border-border bg-background text-muted-foreground shadow-sm',
            'transition-colors hover:border-border-strong hover:bg-surface-1 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
          )}
        >
          <PanelRightOpen className="size-4" strokeWidth={2} />
        </button>
      </aside>
    );
  }

  const hubCard: HubCard = {
    key: 'hub',
    title: '扩展区',
    description: '打开右侧拓展区(论文详情 / 生成产物)',
    icon: Plus,
    accent: {
      chip: 'bg-foreground/10 text-foreground',
      focusRing: 'ring-foreground/25 border-foreground/40',
    },
    Illustration: HubIllustration,
    onClick: openExpansionArea,
  };

  const functionCards: HubCard[] = [
    {
      key: 'pdf-chat',
      title: WORKSPACE_FUNCTION_LABEL['pdf-chat'],
      description: '针对工作区 PDF 提问与解读',
      icon: MessageSquare,
      accent: {
        chip: 'bg-brand-amber/10 text-brand-amber',
        focusRing: 'ring-brand-amber/35 border-brand-amber/50',
      },
      Illustration: PdfChatIllustration,
      onClick: () => setActiveFunction('pdf-chat'),
    },
    {
      key: 'citation-graph',
      title: WORKSPACE_FUNCTION_LABEL['citation-graph'],
      description: '可视化文献引用与关联',
      icon: Share2,
      accent: {
        chip: 'bg-brand-green/10 text-brand-green',
        focusRing: 'ring-brand-green/35 border-brand-green/50',
      },
      Illustration: GraphIllustration,
      onClick: () => setActiveFunction('citation-graph'),
    },
    {
      key: 'matrix',
      title: WORKSPACE_FUNCTION_LABEL.matrix,
      description: '多维度 AI 对比表',
      icon: Grid3x3,
      accent: {
        chip: 'bg-foreground/10 text-foreground',
        focusRing: 'ring-foreground/25 border-foreground/40',
      },
      Illustration: MatrixIllustration,
      onClick: () => setActiveFunction('matrix'),
    },
  ];

  const browserCard: HubCard = {
    key: 'browser',
    title: '浏览器',
    description: '搜索并打开论文详情',
    icon: Globe,
    accent: {
      chip: 'bg-brand-blue/10 text-brand-blue',
      focusRing: 'ring-brand-blue/35 border-brand-blue/50',
    },
    Illustration: BrowserIllustration,
  };

  return (
    <aside
      aria-label="工作区拓展入口"
      className="pointer-events-none absolute inset-y-0 right-0 z-30 flex items-center"
    >
      <div
        className="flex flex-col py-5"
        onMouseLeave={() => setHovered(null)}
      >
        <EdgeTemplateCard
          card={hubCard}
          reduce={reduce}
          focused={hovered === hubCard.key}
          onHover={() => setHovered(hubCard.key)}
        />

        <div className="mt-4 flex flex-col gap-2">
          {functionCards.map((card) => (
            <EdgeTemplateCard
              key={card.key}
              card={card}
              reduce={reduce}
              focused={hovered === card.key}
              onHover={() => setHovered(card.key)}
            />
          ))}

          <QuickOpenPaperDialog align="end" onPickPaper={openPaper}>
            <EdgeTemplateCard
              card={browserCard}
              reduce={reduce}
              focused={hovered === browserCard.key}
              onHover={() => setHovered(browserCard.key)}
            />
          </QuickOpenPaperDialog>
        </div>
      </div>
    </aside>
  );
}

const EdgeTemplateCard = forwardRef<
  HTMLButtonElement,
  {
    card: HubCard;
    reduce: boolean;
    focused: boolean;
    onHover: () => void;
  }
>(function EdgeTemplateCard({ card, reduce, focused, onHover }, ref) {
  const { title, description, accent, Illustration, onClick } = card;
  const peekX = CARD_W_PX - PEEK_PX;

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      title={description ? `${title} · ${description}` : title}
      aria-label={title}
      onHoverStart={onHover}
      onFocus={onHover}
      initial={false}
      animate={{
        x: focused ? 0 : peekX,
        scale: reduce ? 1 : focused ? 1.04 : 1,
        y: reduce ? 0 : focused ? -4 : 0,
      }}
      transition={
        reduce
          ? { duration: 0.15 }
          : { type: 'spring', stiffness: 260, damping: 22, mass: 0.6 }
      }
      style={{ width: CARD_W_PX }}
      className={cn(
        'pointer-events-auto overflow-hidden rounded-xl border bg-background text-left shadow-sm outline-none',
        'transition-[border-color,box-shadow]',
        focused ? cn('z-10 ring-2', accent.focusRing) : 'z-0 border-border',
      )}
    >
      {/* 一体窄顶栏 + 封面;无图标/描述 */}
      <span className="block truncate border-b border-border/60 bg-surface-1 px-2.5 py-1 text-2xs font-semibold leading-none text-foreground">
        {title}
      </span>
      <span
        style={{ height: CARD_H_PX }}
        className="relative block w-full overflow-hidden"
      >
        <span className="absolute inset-0 bg-surface-2">
          <Illustration reduce={reduce} />
        </span>
      </span>
    </motion.button>
  );
});

/* ── 封面插画(风格对齐 TemplateCards) ─────────────────────────────── */

/** 扩展区 —— 深色舞台上叠层面板滑出(呼应 DeckIllustration)。 */
function HubIllustration({ reduce }: { reduce: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#111c30] via-[#0a1019] to-[#05070a]">
      <div className="pointer-events-none absolute -right-4 -top-6 size-20 rounded-full bg-brand-amber/15 blur-2xl" />
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-md bg-white/10 ring-1 ring-white/15"
          style={{
            width: `${58 - i * 6}%`,
            height: `${52 - i * 4}%`,
            left: `${18 + i * 8}%`,
            top: `${22 + i * 6}%`,
          }}
          initial={reduce ? false : { x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 - i * 0.15 }}
          transition={
            reduce
              ? { duration: 0 }
              : { duration: 0.45, delay: 0.1 + i * 0.1, ease: 'easeOut' }
          }
        />
      ))}
      <motion.div
        className="absolute bottom-2.5 right-3 flex size-5 items-center justify-center rounded-md bg-white/15 text-white ring-1 ring-white/25"
        initial={reduce ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={
          reduce
            ? { duration: 0 }
            : { type: 'spring', stiffness: 320, damping: 18, delay: 0.4 }
        }
      >
        <Plus className="size-3" strokeWidth={2.5} />
      </motion.div>
    </div>
  );
}

function PdfChatIllustration({ reduce }: { reduce: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-brand-amber/10 via-surface-1 to-background">
      <div className="absolute left-2.5 top-1/2 h-[70%] w-[34%] -translate-y-1/2 rounded-sm bg-background shadow-sm ring-1 ring-border">
        <div className="space-y-1 p-1.5">
          {[0.9, 0.7, 0.8, 0.55].map((w, i) => (
            <div
              key={i}
              className="h-1 rounded-full bg-foreground/12"
              style={{ width: `${w * 100}%` }}
            />
          ))}
        </div>
      </div>
      <div className="absolute right-2.5 top-1/2 flex w-[44%] -translate-y-1/2 flex-col gap-1.5">
        {[
          { cls: 'self-start bg-brand-amber/25', w: '85%' },
          { cls: 'self-end bg-background ring-1 ring-border', w: '70%' },
          { cls: 'self-start bg-brand-amber/25', w: '60%' },
        ].map((b, i) => (
          <motion.div
            key={i}
            className={cn('h-2.5 rounded-pill', b.cls)}
            style={{ width: b.w }}
            initial={{ opacity: reduce ? 1 : 0, x: reduce ? 0 : 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.35, delay: 0.15 + i * 0.12 }
            }
          />
        ))}
      </div>
    </div>
  );
}

function GraphIllustration({ reduce }: { reduce: boolean }) {
  const nodes = [
    { x: 28, y: 32 },
    { x: 70, y: 22 },
    { x: 78, y: 58 },
    { x: 38, y: 68 },
    { x: 52, y: 44 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-surface-1 to-background">
      <svg viewBox="0 0 100 80" className="h-full w-full" aria-hidden>
        {[
          [0, 4],
          [1, 4],
          [2, 4],
          [3, 4],
          [0, 1],
          [1, 2],
        ].map(([a, b], i) => (
          <motion.line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            className="stroke-current text-brand-green/35"
            strokeWidth="1.2"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.5, delay: 0.1 + i * 0.06 }
            }
          />
        ))}
        {nodes.map((n, i) => (
          <motion.circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={i === 4 ? 4.5 : 3.2}
            className={
              i === 4
                ? 'fill-current text-brand-green'
                : 'fill-current text-brand-green/50'
            }
            initial={{ opacity: reduce ? 1 : 0, scale: reduce ? 1 : 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.3, delay: 0.25 + i * 0.08 }
            }
          />
        ))}
      </svg>
    </div>
  );
}

function MatrixIllustration({ reduce }: { reduce: boolean }) {
  const cells = [
    [1, 0, 1, 0],
    [0, 1, 1, 1],
    [1, 1, 0, 1],
  ];
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-surface-1 to-background p-2.5">
      <div className="flex h-full flex-col gap-1">
        {cells.map((row, ri) => (
          <div key={ri} className="flex flex-1 gap-1">
            {row.map((on, ci) => (
              <motion.div
                key={`${ri}-${ci}`}
                className={cn(
                  'flex-1 rounded-sm ring-1 ring-border',
                  on ? 'bg-foreground/70' : 'bg-background',
                )}
                initial={{ opacity: reduce ? 1 : 0, scale: reduce ? 1 : 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : {
                        duration: 0.28,
                        delay: 0.1 + (ri * 4 + ci) * 0.04,
                        ease: 'easeOut',
                      }
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function BrowserIllustration({ reduce }: { reduce: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-brand-blue/10 via-surface-1 to-background p-2.5">
      <motion.div
        className="flex h-full flex-col overflow-hidden rounded-md bg-background shadow-sm ring-1 ring-border"
        initial={reduce ? false : { y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
      >
        <div className="flex h-3 items-center gap-1 border-b border-border-soft px-1.5">
          <span className="size-1 rounded-full bg-brand-red/70" />
          <span className="size-1 rounded-full bg-brand-amber/70" />
          <span className="size-1 rounded-full bg-brand-green/70" />
          <span className="ml-1 h-1 flex-1 rounded-pill bg-surface-2" />
        </div>
        <div className="space-y-1 p-1.5">
          {[0.9, 0.65, 0.8].map((w, i) => (
            <motion.div
              key={i}
              className="h-1 rounded-full bg-brand-blue/25"
              initial={{ width: reduce ? `${w * 100}%` : 0 }}
              animate={{ width: `${w * 100}%` }}
              transition={
                reduce
                  ? { duration: 0 }
                  : { duration: 0.4, delay: 0.2 + i * 0.1 }
              }
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
