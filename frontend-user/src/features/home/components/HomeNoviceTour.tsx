import { useEffect, useRef } from 'react';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { RHINO_NAME } from '@/shared/mascot/rhino-name';
import { useRhinoAssistant } from '@/stores/rhino-assistant.store';

/**
 * 首页新手教程 —— 由犀牛「帮助」触发（driver.js）。
 * 仅在首页挂载；其它页点帮助会 toast 提示（见 FloatingRhinoAssistant）。
 */
export function HomeNoviceTour() {
  const tourNonce = useRhinoAssistant((s) => s.tourNonce);
  const driverRef = useRef<Driver | null>(null);

  useEffect(() => {
    if (tourNonce <= 0) return;

    driverRef.current?.destroy();

    const candidates = [
      {
        element: '[data-tour="home-brand"]',
        popover: {
          title: '欢迎来到 Scholay',
          description: '这里是学术搜索与 AI 助手的起点。先认识一下首页主区域。',
          side: 'bottom' as const,
          align: 'center' as const,
        },
      },
      {
        element: '[data-tour="home-composer"]',
        popover: {
          title: '从这里开始',
          description:
            '输入问题或关键词。智能助手会带你进对话；文献检索会进入结果页。',
          side: 'bottom' as const,
          align: 'center' as const,
        },
      },
      {
        element: '[data-tour="home-mode-switch"]',
        popover: {
          title: '切换检索方式',
          description:
            '点「智能搜索」或「文献搜索」切换输入方式；联网搜索与内部搜索即将推出。',
          side: 'bottom' as const,
          align: 'center' as const,
        },
      },
      {
        element: '[data-tour="rhino-assistant"]',
        popover: {
          title: RHINO_NAME,
          description:
            `拖我走动、点我互动。悬停菜单打开对话 / 功能 / 帮助；关掉面板我会收成${RHINO_NAME}。`,
          side: 'left' as const,
          align: 'center' as const,
        },
      },
    ].filter((step) => {
      const el = document.querySelector(step.element);
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    if (candidates.length === 0) return;

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
      steps: candidates,
    });
    driverRef.current = d;
    d.drive();

    return () => {
      d.destroy();
      if (driverRef.current === d) driverRef.current = null;
    };
  }, [tourNonce]);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  return null;
}
