import { useEffect, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  RHINO_FLOAT_CHROME_CLS,
  RhinoFloatPortal,
  type RhinoFloatSide,
} from './RhinoFloatPortal';

export type RhinoSpeechPrompt = {
  confirmLabel: string;
  dismissLabel: string;
  seconds: number;
  onConfirm: () => void;
  onDismiss: () => void;
};

/**
 * Proactive speech bubble — same chrome as the hover menu.
 * Optional confirm / dismiss + countdown for the 智能助手 greet.
 */
export function RhinoSpeechBubble({
  open,
  text,
  portalAnchor,
  portalSide = 'top',
  anchorPoint,
  prompt,
  onActivate,
  onPointerEnter,
  onPointerLeave,
}: {
  open: boolean;
  text: string;
  portalAnchor?: RefObject<HTMLElement | null>;
  portalSide?: RhinoFloatSide;
  /** Place once at this viewport point. Does not track the pointer after that. */
  anchorPoint?: { x: number; y: number };
  prompt?: RhinoSpeechPrompt;
  onActivate?: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  const reduce = useReducedMotion();
  const [left, setLeft] = useState(prompt?.seconds ?? 0);
  const dismissRef = useRef(prompt?.onDismiss);
  dismissRef.current = prompt?.onDismiss;

  useEffect(() => {
    if (!open || !prompt) return;
    setLeft(prompt.seconds);
    const id = window.setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          window.clearInterval(id);
          dismissRef.current?.();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, text, prompt?.seconds]);

  return (
    <RhinoFloatPortal
      open={open}
      portalAnchor={portalAnchor}
      portalSide={portalSide}
      anchorPoint={anchorPoint}
      fallbackSize={{ w: 240, h: prompt ? 120 : 72 }}
    >
      <AnimatePresence>
        {open && text ? (
          <motion.div
            key="rhino-speech"
            role="status"
            aria-label={`${RHINO_NAME}说`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            className={cn(RHINO_FLOAT_CHROME_CLS, prompt ? 'max-w-[260px]' : 'max-w-[240px]')}
          >
            {prompt ? (
              <div className="px-2.5 py-2">
                <p className="text-12 leading-relaxed text-foreground">{text}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      prompt.onConfirm();
                    }}
                  >
                    {prompt.confirmLabel}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      prompt.onDismiss();
                    }}
                  >
                    {prompt.dismissLabel}
                  </Button>
                  <span
                    className="ml-auto tabular-nums text-12 text-faint"
                    aria-live="polite"
                  >
                    {left}
                  </span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onActivate?.();
                }}
                className={cn(
                  'block w-full rounded-8 px-2.5 py-2 text-left',
                  'text-12 leading-relaxed text-foreground',
                  'transition-colors hover:bg-muted/70',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                )}
              >
                {text}
              </button>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </RhinoFloatPortal>
  );
}
