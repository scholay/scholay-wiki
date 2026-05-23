import { LandingTemplate } from '../components/LandingTemplate';
import { LANDINGS } from '../data/landings';

export function ClawLandingPage() {
  return <LandingTemplate feature={LANDINGS.claw} />;
}

export default ClawLandingPage;
