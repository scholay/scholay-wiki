import { LandingTemplate } from '../components/LandingTemplate';
import { LANDINGS } from '../data/landings';

export function PeerReviewLandingPage() {
  return <LandingTemplate feature={LANDINGS['peer-review']} />;
}

export default PeerReviewLandingPage;
