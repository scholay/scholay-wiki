import { ComingSoonView } from '@/shared/components/ComingSoonView';
import { PeerReviewPreview } from '../components/PeerReviewPreview';

export function PeerReviewPage() {
  return (
    <ComingSoonView
      title="智能审稿"
      description="投稿前的模拟同行评审 · 三份不同视角的 AI 意见 · 期刊主编的真实审稿工单"
      preview={<PeerReviewPreview />}
    />
  );
}
