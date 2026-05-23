import { useEffect, useRef } from 'react';

type HotkeyHandler = (e: KeyboardEvent) => void;

interface UseHotkeyOptions {
  enabled?: boolean;
  /** 默认在 input/textarea 内不触发,要触发设 true */
  enableOnFormTags?: boolean;
  /** 自动 preventDefault,默认 true */
  preventDefault?: boolean;
}

/**
 * 简洁热键绑定。组合用 "+",例:
 *   useHotkey('mod+k', () => openCmdK())
 *   useHotkey('esc', () => closeDialog())
 *   useHotkey(['mod+/', 'shift+?'], () => openShortcutsHelp())
 *
 * "mod" = mac 上的 ⌘、其他平台的 Ctrl。
 */
export function useHotkey(
  keys: string | string[],
  handler: HotkeyHandler,
  { enabled = true, enableOnFormTags = false, preventDefault = true }: UseHotkeyOptions = {}
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const list = Array.isArray(keys) ? keys : [keys];
    const normalized = list.map(parseKey);

    const isMac =
      typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform);

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const isForm =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        (e.target as HTMLElement | null)?.isContentEditable;
      if (isForm && !enableOnFormTags) return;

      for (const spec of normalized) {
        if (matches(spec, e, isMac)) {
          if (preventDefault) e.preventDefault();
          handlerRef.current(e);
          return;
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [JSON.stringify(keys), enabled, enableOnFormTags, preventDefault]);
}

interface ParsedKey {
  key: string;
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

function parseKey(raw: string): ParsedKey {
  const parts = raw.toLowerCase().split('+').map((s) => s.trim());
  const key = parts.pop() ?? '';
  return {
    key,
    mod: parts.includes('mod'),
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt') || parts.includes('option'),
    meta: parts.includes('cmd') || parts.includes('meta'),
  };
}

function matches(spec: ParsedKey, e: KeyboardEvent, isMac: boolean): boolean {
  const k = e.key.toLowerCase();
  if (k !== spec.key && !(spec.key === 'esc' && k === 'escape')) return false;

  const modPressed = isMac ? e.metaKey : e.ctrlKey;
  if (spec.mod && !modPressed) return false;
  if (!spec.mod && spec.ctrl !== e.ctrlKey) return false;
  if (!spec.mod && spec.meta !== e.metaKey) return false;
  if (spec.shift !== e.shiftKey) return false;
  if (spec.alt !== e.altKey) return false;
  return true;
}
