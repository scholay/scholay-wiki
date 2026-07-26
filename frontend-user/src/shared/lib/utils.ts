import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * twMerge 必须认识 globals.css 里的**自定义 scale**,否则后传的类覆盖不掉
 * 组件内置类(两个类都保留,谁生效看 CSS 源序 —— 实际踩坑:FavoritePaperButton
 * 内置 rounded-sm,调用方传 rounded-pill 想改圆形,默认 twMerge 不认识 pill,
 * 不去重 → 按钮仍是方角)。
 *
 * ⚠️ 2026-07 Figma 换真源后,圆角与字号改成了【数值命名】,
 *    Tailwind 原生完全不认识这批类名 —— 这里必须同步登记,否则
 *    「组件内置 rounded-8 + 调用方传 rounded-16」不会去重,退回源序赌运气。
 *    改 globals.css 的 token 命名时,【这个文件必须跟着改】。
 *
 * 项目自定义 scale(见 globals.css):
 *   - 圆角:   rounded-4/8/12/16/20/pill
 *   - 字号:   text-12/14/16/20/24/28 + text-body/caption + text-display-36/56
 *   - 行高:   leading-sans/display/serif/paragraph/display-tight
 *   - 字间距: tracking-code/brand
 *   - 层级:   z-base/raised/sticky/nav/scrim/overlay/modal/popover/tooltip/toast/fx
 *   - 阴影:   shadow-overlay/raised
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ['4', '8', '12', '16', '20', 'pill'] }],
      'font-size': [
        { text: ['12', '14', '16', '20', '24', '28', 'body', 'caption', 'display-36', 'display-56'] },
      ],
      leading: [{ leading: ['sans', 'display', 'serif', 'paragraph', 'display-tight'] }],
      tracking: [{ tracking: ['code', 'brand'] }],
      z: [
        {
          z: [
            'base', 'raised', 'sticky', 'nav', 'scrim',
            'overlay', 'modal', 'popover', 'tooltip', 'toast', 'fx',
          ],
        },
      ],
      shadow: [{ shadow: ['overlay', 'raised'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
