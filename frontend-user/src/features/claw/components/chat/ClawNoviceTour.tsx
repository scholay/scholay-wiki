import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { driver, type Driver, type PopoverDOM } from 'driver.js';
import 'driver.js/dist/driver.css';
import { RHINO_DISPLAY_PX } from '@/shared/mascot/rhino-display-size';
import { useMascotSprite } from '@/shared/mascot/useMascotSprite';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { useRhinoAssistant } from '@/stores/rhino-assistant.store';

/** Right pane keeps the original 360px copy column. */
const COPY_MIN_PX = 360;

function TourRhino({ stepKey }: { stepKey: number }) {
  const { frameSrc, play } = useMascotSprite('wave-s');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await play('wave-s');
      if (cancelled) return;
      await play('idle-s', { loop: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [play, stepKey]);

  return (
    <img
      src={frameSrc}
      alt={RHINO_NAME}
      width={RHINO_DISPLAY_PX}
      height={RHINO_DISPLAY_PX}
      draggable={false}
      className="pointer-events-none select-none drop-shadow-md"
    />
  );
}

/**
 * One bubble, two panes: left = rhino, right = title / copy / buttons.
 * Driver writes `display:block` inline each render — flex must be inline too.
 */
function ensureGuideSlot(wrapper: HTMLElement, popover: PopoverDOM): HTMLElement {
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'row';
  wrapper.style.alignItems = 'stretch';
  wrapper.style.padding = '0';
  wrapper.style.borderRadius = 'var(--radius-16)';
  wrapper.style.minWidth = `${RHINO_DISPLAY_PX + COPY_MIN_PX}px`;

  let body = wrapper.querySelector('[data-rhino-copy]') as HTMLElement | null;
  if (!body) {
    body = document.createElement('div');
    body.dataset.rhinoCopy = '';
    body.className = 'flex min-w-0 flex-1 flex-col p-4';
    body.style.minWidth = `${COPY_MIN_PX}px`;
    wrapper.appendChild(body);
  }
  for (const el of [popover.title, popover.description, popover.footer]) {
    if (el && el.parentElement !== body) body.appendChild(el);
  }

  let slot = wrapper.querySelector('[data-rhino-guide]') as HTMLElement | null;
  if (!slot) {
    slot = document.createElement('div');
    slot.dataset.rhinoGuide = '';
    slot.className = 'flex shrink-0 items-end justify-center self-stretch';
    slot.style.width = `${RHINO_DISPLAY_PX}px`;
    wrapper.insertBefore(slot, body);
  }
  return slot;
}

/**
 * 智能助手空态聚光灯 —— 牛犀犀进讲解气泡,按输入框 → 模型 → 技能 → 附件 → 模板卡走一遍。
 */
export function ClawNoviceTour() {
  const clawTourNonce = useRhinoAssistant((s) => s.clawTourNonce);
  const driverRef = useRef<Driver | null>(null);
  const [guideHost, setGuideHost] = useState<HTMLElement | null>(null);
  const [stepKey, setStepKey] = useState(0);

  useEffect(() => {
    if (clawTourNonce <= 0) return;

    driverRef.current?.destroy();
    useRhinoAssistant.getState().setTourGuiding(true);

    const candidates = [
      {
        element: '[data-tour="claw-composer"]',
        popover: {
          title: '从这里提问',
          description: '输入问题，Enter 发送。也可以把文件拖进来。',
          side: 'bottom' as const,
          align: 'center' as const,
        },
      },
      {
        element: '[data-tour="claw-model"]',
        popover: {
          title: '选择模型',
          description: '当前会话用哪颗模型，点这里切换。',
          side: 'top' as const,
          align: 'end' as const,
        },
      },
      {
        element: '[data-tour="claw-skills"]',
        popover: {
          title: '技能',
          description: '事先声明这轮对话要启用的能力。',
          side: 'top' as const,
          align: 'start' as const,
        },
      },
      {
        element: '[data-tour="claw-attach"]',
        popover: {
          title: '附件与引用',
          description: '上传文件，或从文献集引用论文。',
          side: 'top' as const,
          align: 'start' as const,
        },
      },
      {
        element: '[data-tour="claw-templates"]',
        popover: {
          title: '模板',
          description: '制作 PPT、科研绘图等，点一张卡就能套用。',
          side: 'top' as const,
          align: 'center' as const,
        },
      },
    ].filter((step) => {
      const el = document.querySelector(step.element);
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    if (candidates.length === 0) {
      useRhinoAssistant.getState().setTourGuiding(false);
      return;
    }

    let repositioning = false;
    const d = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayColor: 'rgba(31, 31, 35, 0.55)',
      stagePadding: 8,
      stageRadius: 12,
      nextBtnText: '下一步',
      prevBtnText: '上一步',
      doneBtnText: '完成',
      progressText: '{{current}} / {{total}}',
      popoverOffset: 16,
      popoverClass: 'overflow-visible !max-w-none !p-0 !rounded-16',
      onPopoverRender: (popover) => {
        setGuideHost(ensureGuideSlot(popover.wrapper, popover));
        setStepKey((n) => n + 1);
        if (repositioning) return;
        repositioning = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (driverRef.current === d) d.refresh();
            repositioning = false;
          });
        });
      },
      onDestroyed: () => {
        useRhinoAssistant.getState().setTourGuiding(false);
        setGuideHost(null);
      },
      steps: candidates,
    });
    driverRef.current = d;
    d.drive();

    return () => {
      d.destroy();
      if (driverRef.current === d) driverRef.current = null;
      useRhinoAssistant.getState().setTourGuiding(false);
      setGuideHost(null);
    };
  }, [clawTourNonce]);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
      useRhinoAssistant.getState().setTourGuiding(false);
    };
  }, []);

  if (!guideHost) return null;
  return createPortal(<TourRhino stepKey={stepKey} />, guideHost);
}
