import { onCLS, onFCP, onINP, onLCP, onTTFB, type MetricType } from 'web-vitals';
import { trackEvent } from './track';

type DeviceClass = 'desktop' | 'mobile' | 'tablet';

/**
 * 将带 ID/slug 的路由收敛到低基数维度，避免在统计系统中泄露或爆炸用户内容。
 */
export function webVitalsRoute(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';

  // /m/feed/:id 和 /admin/users/:id 等只保留稳定的前两级。
  if ((segments[0] === 'm' || segments[0] === 'admin') && segments[1]) {
    return `/${segments[0]}/${segments[1]}`;
  }
  return `/${segments[0]}`;
}

export function webVitalsDevice(userAgent: string, viewportWidth: number): DeviceClass {
  if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(userAgent)) return 'mobile';
  if (viewportWidth > 0 && viewportWidth < 768) return 'mobile';
  if (viewportWidth >= 768 && viewportWidth < 1_024) return 'tablet';
  return 'desktop';
}

function metricRoute(metric: MetricType): string {
  if (metric.navigationURL) {
    try {
      return webVitalsRoute(new URL(metric.navigationURL, window.location.href).pathname);
    } catch {
      // 异常 URL 回退到当前路由。
    }
  }
  return webVitalsRoute(window.location.pathname);
}

function report(metric: MetricType): void {
  const scale = metric.name === 'CLS' ? 10_000 : 1;
  trackEvent('web_vital', {
    metric: metric.name,
    value: Math.round(metric.value * scale) / scale,
    delta: Math.round(metric.delta * scale) / scale,
    rating: metric.rating,
    route: metricRoute(metric),
    device: webVitalsDevice(navigator.userAgent, window.innerWidth),
    navigation_type: metric.navigationType,
  });
}

/**
 * 在 main.tsx 的 React render + idle 闸门后动态调用。传入 reportSoftNavs 以便
 * 支持 Soft Navigation API 的浏览器能按 SPA 路由分组。
 */
export function startWebVitals(): void {
  const options = { reportSoftNavs: true } as const;
  onCLS(report, options);
  onFCP(report, options);
  onINP(report, options);
  onLCP(report, options);
  onTTFB(report, options);
}
