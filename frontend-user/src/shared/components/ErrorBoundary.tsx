import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { reportClientError } from '@/shared/lib/client-error-reporter';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 自定义 fallback 渲染 — 不传则用默认 UI */
  fallback?: (err: Error, reset: () => void) => ReactNode;
  /** 额外业务回调 — 已默认把错误 POST 到后端 /log/client-error,这里留给埋点 / 跳转。 */
  onError?: (err: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 顶层错误兜底。挂在 router 的 errorElement / WorkspaceShell 包外都行。
 * onError 留出口给后续接 Sentry / SigNoz。
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 默认上报 —— 走 reportClientError 同步发到 /log/client-error,落 docker logs
    reportClientError({
      source: 'react-error-boundary',
      message: error.message,
      stack: (error.stack ?? '') + '\n\nComponent stack:' + (info.componentStack ?? ''),
    });
    this.props.onError?.(error, info);
    if (import.meta.env.DEV) console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" />
        </div>
        <h3 className="text-16 font-medium">页面没能正常打开</h3>
        <p className="max-w-md text-14 text-muted-foreground">
          点下方按钮可以重试,如果一直出错请刷新页面试试。
        </p>
        <Button variant="outline" size="sm" onClick={this.reset}>
          重试
        </Button>
      </div>
    );
  }
}
