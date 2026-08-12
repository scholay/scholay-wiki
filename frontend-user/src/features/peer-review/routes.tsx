import type { RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

/**
 * 智能审稿(`/peer-review`)路由:
 *
 *   /peer-review                  → SubmissionLandingPage(选 期刊 / 毕业)
 *   /peer-review/journal          → 期刊审稿 wizard (?step=1..4&id=...)
 *   /peer-review/thesis           → 毕业审稿 wizard (?step=1..4&id=...)
 *   /peer-review/records          → 工单总览
 *   /peer-review/records/:id      → 工单详情(三审 + 主审 4 tab)
 *
 * 全部包在 PeerReviewShell 下(侧栏 + outlet)。
 * Step 状态保留在 URL 的 `step` query 上,刷新 / 分享都保住进度。
 */
export const peerReviewRoutes: RouteObject[] = [
  {
    path: 'peer-review',
    element: lazyRoute(() => import('./layouts/PeerReviewShell'), 'PeerReviewShell'),
    children: [
      {
        index: true,
        element: lazyRoute(() => import('./pages/SubmissionLandingPage'), 'SubmissionLandingPage'),
      },
      {
        path: 'journal',
        element: lazyRoute(() => import('./pages/JournalWizardPage'), 'JournalWizardPage'),
      },
      {
        path: 'thesis',
        element: lazyRoute(() => import('./pages/ThesisWizardPage'), 'ThesisWizardPage'),
      },
      {
        path: 'records',
        element: lazyRoute(() => import('./pages/RecordsPage'), 'RecordsPage'),
      },
      {
        path: 'records/:id',
        element: lazyRoute(() => import('./pages/RecordDetailPage'), 'RecordDetailPage'),
      },
      {
        path: 'submitted/:id',
        element: lazyRoute(() => import('./pages/SubmitSuccessPage'), 'SubmitSuccessPage'),
      },
    ],
  },
];
