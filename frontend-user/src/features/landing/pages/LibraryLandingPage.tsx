import { LandingTemplate } from '../components/LandingTemplate';
import { LANDINGS } from '../data/landings';

export function LibraryLandingPage() {
  return <LandingTemplate feature={LANDINGS.library} />;
}

export default LibraryLandingPage;
