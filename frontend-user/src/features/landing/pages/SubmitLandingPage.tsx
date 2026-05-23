import { LandingTemplate } from '../components/LandingTemplate';
import { LANDINGS } from '../data/landings';

export function SubmitLandingPage() {
  return <LandingTemplate feature={LANDINGS.submit} />;
}

export default SubmitLandingPage;
