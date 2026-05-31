import type { RouteObject } from 'react-router-dom';

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
    lazy: () =>
      import('./layouts/PeerReviewShell').then((m) => ({
        Component: m.PeerReviewShell,
      })),
    children: [
      {
        index: true,
        lazy: () =>
          import('./pages/SubmissionLandingPage').then((m) => ({
            Component: m.SubmissionLandingPage,
          })),
      },
      {
        path: 'journal',
        lazy: () =>
          import('./pages/JournalWizardPage').then((m) => ({
            Component: m.JournalWizardPage,
          })),
      },
      {
        path: 'thesis',
        lazy: () =>
          import('./pages/ThesisWizardPage').then((m) => ({
            Component: m.ThesisWizardPage,
          })),
      },
      {
        path: 'records',
        lazy: () =>
          import('./pages/RecordsPage').then((m) => ({
            Component: m.RecordsPage,
          })),
      },
      {
        path: 'records/:id',
        lazy: () =>
          import('./pages/RecordDetailPage').then((m) => ({
            Component: m.RecordDetailPage,
          })),
      },
      {
        path: 'submitted/:id',
        lazy: () =>
          import('./pages/SubmitSuccessPage').then((m) => ({
            Component: m.SubmitSuccessPage,
          })),
      },
    ],
  },
];
