import type { RhinoClipId } from './rhino-clips';

/** 姿态:站 / 坐 —— 点击动作受姿态约束 */
export type RhinoPose = 'stand' | 'sit';

export type PoseAction = 'jump' | 'sit' | 'stand' | 'emote';

/** 各姿态允许的点击动作 */
export const POSE_CLICK_ACTIONS: Record<RhinoPose, readonly PoseAction[]> = {
  stand: ['jump', 'sit', 'emote'],
  sit: ['stand'],
};

export function pickPoseClickAction(pose: RhinoPose): PoseAction {
  const pool = POSE_CLICK_ACTIONS[pose];
  return pool[Math.floor(Math.random() * pool.length)] ?? 'emote';
}

/** 站立时点击的轻表情 */
export const STAND_EMOTE_CLIPS: readonly RhinoClipId[] = [
  'pet-wave',
  'pet-sigh',
  'nod-s',
  'wave-s',
  'confused-s',
  'celebrate-s',
  'shake-head-s',
] as const;

export function pickStandEmote(avoid?: RhinoClipId | null): RhinoClipId {
  const pool =
    avoid && STAND_EMOTE_CLIPS.length > 1
      ? STAND_EMOTE_CLIPS.filter((c) => c !== avoid)
      : STAND_EMOTE_CLIPS;
  return pool[Math.floor(Math.random() * pool.length)] ?? 'pet-wave';
}
