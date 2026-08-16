import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IDLE_AMBIENCE_CLIPS,
  RHINO_CLIPS,
  RUN_DIRS,
  rhinoFrameUrls,
  type RhinoClipId,
} from './rhino-clips';
import { RHINO_DIRS } from './rhino-direction';

const preloadCache = new Map<string, string[]>();

async function warm(urls: string[]) {
  await Promise.all(
    urls.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        }),
    ),
  );
}

export type PlayOverride = {
  loop?: boolean;
  fps?: number;
  /** 倒放(站↔坐 / 坐↔躺 用同一序列) */
  reverse?: boolean;
};

export function useMascotSprite(initial: RhinoClipId = 'pet-idle') {
  const [frameSrc, setFrameSrc] = useState(() => rhinoFrameUrls(initial)[0]);
  const clipRef = useRef<RhinoClipId>(initial);
  const urlsRef = useRef<string[]>(rhinoFrameUrls(initial));
  const indexRef = useRef(0);
  const loopRef = useRef(true);
  const reverseRef = useRef(false);
  const frameMsRef = useRef(1000 / RHINO_CLIPS[initial].fps);
  const playingRef = useRef(true);
  const rafRef = useRef(0);
  const timerRef = useRef(0);
  const endResolveRef = useRef<(() => void) | null>(null);

  const tick = useCallback((now: number) => {
    if (!playingRef.current) return;
    if (now - timerRef.current >= frameMsRef.current) {
      timerRef.current = now;
      const urls = urlsRef.current;
      const last = urls.length - 1;

      if (reverseRef.current) {
        indexRef.current -= 1;
        if (indexRef.current < 0) {
          if (loopRef.current) {
            indexRef.current = last;
          } else {
            playingRef.current = false;
            setFrameSrc(urls[0]);
            const done = endResolveRef.current;
            endResolveRef.current = null;
            done?.();
            return;
          }
        }
      } else {
        indexRef.current += 1;
        if (indexRef.current >= urls.length) {
          if (loopRef.current) {
            indexRef.current = 0;
          } else {
            playingRef.current = false;
            setFrameSrc(urls[Math.max(0, last)]);
            const done = endResolveRef.current;
            endResolveRef.current = null;
            done?.();
            return;
          }
        }
      }
      setFrameSrc(urls[indexRef.current]);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const play = useCallback(
    async (id: RhinoClipId, override?: PlayOverride) => {
      const meta = RHINO_CLIPS[id];
      if (!meta) throw new Error(`Unknown clip: ${id}`);
      const nextLoop = override?.loop ?? meta.loop;
      const nextFps = override?.fps ?? meta.fps;
      const nextReverse = override?.reverse ?? false;

      let urls = preloadCache.get(id);
      if (!urls) {
        urls = rhinoFrameUrls(id);
        preloadCache.set(id, urls);
        await warm(urls);
      }

      // 同帧序列、同方向循环中只调 fps → 不重头
      const sameSrc =
        playingRef.current &&
        loopRef.current &&
        nextLoop &&
        reverseRef.current === nextReverse &&
        urlsRef.current.length === urls.length &&
        urlsRef.current[0] === urls[0];
      if (sameSrc) {
        clipRef.current = id;
        urlsRef.current = urls;
        loopRef.current = nextLoop;
        frameMsRef.current = 1000 / nextFps;
        return;
      }

      endResolveRef.current?.();
      endResolveRef.current = null;

      clipRef.current = id;
      urlsRef.current = urls;
      loopRef.current = nextLoop;
      reverseRef.current = nextReverse;
      frameMsRef.current = 1000 / nextFps;
      indexRef.current = nextReverse ? urls.length - 1 : 0;
      setFrameSrc(urls[indexRef.current]);
      cancelAnimationFrame(rafRef.current);
      playingRef.current = true;
      timerRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);

      if (loopRef.current) return;
      await new Promise<void>((resolve) => {
        endResolveRef.current = resolve;
      });
    },
    [tick],
  );

  useEffect(() => {
    void play(initial);
    void warm(rhinoFrameUrls('pet-wave'));
    void warm(rhinoFrameUrls('pet-jump'));
    void warm(rhinoFrameUrls('sit-to-stand-s'));
    void warm(rhinoFrameUrls('sit-hold'));
    void warm(rhinoFrameUrls('celebrate-s'));
    for (const d of RHINO_DIRS) {
      void warm(rhinoFrameUrls(`loco-${d}`));
      void warm(rhinoFrameUrls(`face-${d}`));
    }
    for (const d of RUN_DIRS) {
      void warm(rhinoFrameUrls(`run-${d}`));
    }
    for (const id of IDLE_AMBIENCE_CLIPS) {
      void warm(rhinoFrameUrls(id));
    }
    return () => {
      playingRef.current = false;
      cancelAnimationFrame(rafRef.current);
      endResolveRef.current?.();
      endResolveRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { frameSrc, play, clipId: clipRef };
}
