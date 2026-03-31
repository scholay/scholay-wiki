export const formatNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString('zh-CN');
};

export const formatCompactNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return '0';
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(num);
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  if (months < 12) return `${months}个月前`;
  return `${years}年前`;
};

export const formatDate = (
  date: string | Date | null | undefined,
  format: 'full' | 'date' | 'time' | 'relative' | 'year' = 'date',
): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  switch (format) {
    case 'full':
      return d.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    case 'date':
      return d.toLocaleDateString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
      });
    case 'time':
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    case 'relative':
      return formatRelativeTime(d);
    case 'year':
      return String(d.getFullYear());
    default:
      return d.toLocaleDateString('zh-CN');
  }
};

export const truncateText = (text: string | null | undefined, maxLength = 100, suffix = '...'): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
};

export const formatAuthors = (authors: Array<{ name?: string } | string> | null | undefined, maxDisplay = 3): string => {
  if (!authors || authors.length === 0) return '';
  const names = authors.slice(0, maxDisplay).map((a) => (typeof a === 'string' ? a : a.name || ''));
  const remaining = authors.length - maxDisplay;
  if (remaining > 0) return names.join(', ') + ` 等${remaining}人`;
  return names.join(', ');
};

export const formatCitationCount = (count: number | null | undefined): string => {
  if (count === null || count === undefined) return '0';
  return formatCompactNumber(count);
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

export const formatPercentage = (value: number, total: number, decimals = 1): string => {
  if (!total) return '0%';
  return ((value / total) * 100).toFixed(decimals) + '%';
};
