import { useState, type ComponentType, type ReactNode } from 'react';
import { BookOpen, CircleHelp, FileText, Newspaper } from 'lucide-react';
import { FeatureBrandHeading } from '@/shared/components/FeatureBrandHeading';
import { RhinoSpeechBubble } from '@/shared/components/RhinoSpeechBubble';
import { cn } from '@/shared/lib/utils';
import {
  RHINO_CLAW_GREET,
  useRhinoAssistant,
} from '@/stores/rhino-assistant.store';
import { ClawNoviceTour } from './ClawNoviceTour';

export interface HeroSuggestion {
  icon: ComponentType<{ className?: string }>;
  label: string;
  prompt: string;
}

/**
 * 新对话空白态(桌面)—— 形态对齐 GPT / Claude / Codex 这类主流 AI 软件的新会话页:
 *   - 智能助手空态出完整 lockup,巢在右下角;其余功能空态出标题 + 图标占位。
 *   - 中央一个对话框(与对话中底部栏**同一个 ChatComposer**,样式一致)
 *   - 模板卡(制作PPT / 科研绘图 的「扑克牌扇」)放在**输入框下方**(见 TemplateCards)
 *   - 示例提问做成带图标的轻量 chip:点一下把提示词**填进输入框**(可改后再发,不直接发送)
 *
 * 布局容器:外层只负责纵向滚动,中层 `min-h-full items-center` 让整块「内容矮就居中、内容高就从顶部
 * 开始滚」。
 *
 * composer:已在 ClawPage 包好 layoutId(motion.div)的 ChatComposer 元素,这里只负责摆位 ——
 * 发出首条消息后,framer-motion 据该 layoutId 把对话框从这里平滑滑到底部停靠(见 ClawPage)。
 * onPickSuggestion:点 chip → ClawPage 调 composerRef.prefill。
 */
const SUGGESTIONS: HeroSuggestion[] = [
  { icon: BookOpen, label: '找一篇综述', prompt: '找一篇关于「Transformer 在医学影像中的应用」的综述' },
  { icon: FileText, label: '读 PDF 写摘要', prompt: '我待会上传一份 PDF,帮我写一段约 200 字的中文摘要' },
  { icon: Newspaper, label: '查期刊动态', prompt: 'Nature Methods 最近半年发了哪些 AI 相关的文章?' },
];

/** claw 空态默认文案 —— 供 ConversationWorkspace 的 claw 配置复用(单一真源,不漂移)。 */
export const clawHeroDefaults = {
  title: '智能助手',
  subtitle: '',
  suggestions: SUGGESTIONS,
};

const LINGXI_TITLE = '智能助手';

function ClawHelpHint() {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-label="了解智能助手"
        aria-expanded={open}
        onClick={(e) => {
          if (useRhinoAssistant.getState().tourGuiding) return;
          if (open) {
            close();
            return;
          }
          setOrigin({ x: e.clientX, y: e.clientY });
          setOpen(true);
        }}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-8',
          'text-faint transition-colors hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
        )}
      >
        <CircleHelp className="size-4" aria-hidden />
      </button>
      <RhinoSpeechBubble
        open={open}
        text={RHINO_CLAW_GREET}
        anchorPoint={origin}
        prompt={{
          confirmLabel: '确认',
          dismissLabel: '不用了',
          seconds: 5,
          onConfirm: () => {
            close();
            useRhinoAssistant.getState().requestClawTour();
          },
          onDismiss: close,
        }}
      />
    </>
  );
}

export function ClawHero({
  composer,
  onPickSuggestion,
  title,
  subtitle,
  suggestions = SUGGESTIONS,
  extra,
  aboveComposer,
  contentClassName = 'max-w-2xl',
  brandMark = false,
}: {
  composer: ReactNode;
  onPickSuggestion: (text: string) => void;
  /** 空态标题。传了则 Logo 右侧出功能名。 */
  title?: string;
  /** Other titles: horn mark if true. 智能助手 always shows the lockup. */
  brandMark?: boolean;
  /** 副标题(可选;空则不渲染)。 */
  subtitle?: string;
  suggestions?: HeroSuggestion[];
  /** 输入框**下方**的附加内容(模板卡扑克牌扇 / 换回对话模式条)。 */
  extra?: ReactNode;
  /** 输入框上方(如会话条),与 composer 同宽成组居中,中间留一档间距。 */
  aboveComposer?: ReactNode;
  /** 内容区最大宽度(默认 max-w-2xl;首页/搜索 hero 可传 max-w-3xl)。 */
  contentClassName?: string;
}) {
  const isLingxi = title === LINGXI_TITLE;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto overflow-x-clip">
      <div
        className={cn(
          'm-auto flex w-full flex-col items-center px-6 py-8',
          contentClassName,
        )}
      >
          {!isLingxi && title ? (
            <FeatureBrandHeading title={title} mark={brandMark} />
          ) : null}
          {subtitle ? (
            <p className="mt-1.5 text-center text-sm text-muted-foreground">{subtitle}</p>
          ) : null}

          <div
            className={cn(
              'flex w-full flex-col',
              isLingxi ? 'mt-2' : 'mt-6',
              aboveComposer && 'gap-3',
            )}
          >
            {aboveComposer}
            {isLingxi ? (
              <FeatureBrandHeading
                title={LINGXI_TITLE}
                mark
                trailing={<ClawHelpHint />}
                className="mb-8 w-full"
              />
            ) : null}
            {composer}
          </div>

          {/* 模板卡 —— 移到输入框**下方**,带封面动画诠释功能(制作PPT / 科研绘图);见 TemplateCards。 */}
          {extra && <div className="mt-5 w-full">{extra}</div>}

          <ClawNoviceTour />

          {suggestions.length > 0 ? (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestions.map(({ icon: Icon, label, prompt }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => onPickSuggestion(prompt)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-all hover:-translate-y-px hover:border-border-strong hover:text-foreground"
                >
                  <Icon className="size-3.5 text-faint" />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
      </div>
    </div>
  );
}
