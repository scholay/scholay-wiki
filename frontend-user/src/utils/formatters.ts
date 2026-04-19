import {
  formatDistanceToNow,
  format as fnsFormat,
  isValid,
  parseISO,
  getYear,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';

export const formatNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString('zh-CN');
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatRelativeTime = (date: Date): string => {
  return formatDistanceToNow(date, { addSuffix: true, locale: zhCN });
};

const toDate = (date: string | Date | null | undefined): Date | null => {
  if (!date) return null;
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isValid(d) ? d : null;
};

export const formatDate = (
  date: string | Date | null | undefined,
  format: 'full' | 'date' | 'time' | 'relative' | 'year' = 'date',
): string => {
  const d = toDate(date);
  if (!d) return '';

  switch (format) {
    case 'full':
      return fnsFormat(d, 'yyyy/MM/dd HH:mm', { locale: zhCN });
    case 'date':
      return fnsFormat(d, 'yyyy/MM/dd', { locale: zhCN });
    case 'time':
      return fnsFormat(d, 'HH:mm', { locale: zhCN });
    case 'relative':
      return formatRelativeTime(d);
    case 'year':
      return String(getYear(d));
    default:
      return fnsFormat(d, 'yyyy/MM/dd', { locale: zhCN });
  }
};

export const truncateText = (text: string | null | undefined, maxLength = 100, suffix = '...'): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
};

export const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`;
};

