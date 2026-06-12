import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * twMerge 必须认识 globals.css 里的**自定义 scale**,否则后传的类覆盖不掉
 * 组件内置类(两个类都保留,谁生效看 CSS 源序 —— 实际踩坑:FavoritePaperButton
 * 内置 rounded-sm,调用方传 rounded-pill 想改圆形,默认 twMerge 不认识 pill,
 * 不去重 → 按钮仍是方角)。
 *
 * 项目自定义(见 globals.css design token):
 *   - 圆角: rounded-pill (9999)
 *   - 字号: text-2xs (10) / text-md (14) —— 8 档里非 Tailwind 默认的两个
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ['pill'] }],
      'font-size': [{ text: ['2xs', 'md'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
