import { LandingTemplate } from '../components/LandingTemplate';
import { LANDINGS } from '../data/landings';

export function PrismLandingPage() {
  return <LandingTemplate feature={LANDINGS.prism} />;
}

export default PrismLandingPage;
