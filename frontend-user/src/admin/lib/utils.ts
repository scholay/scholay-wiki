/**
 * shadcn/ui 的 cn() 工具：合并 Tailwind class 并去重冲突
 * 用法：cn('px-2 py-1', condition && 'bg-red-500', { 'opacity-50': disabled })
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
