import { LandingTemplate } from '../components/LandingTemplate';
import { LANDINGS } from '../data/landings';

export function SearchLandingPage() {
  return <LandingTemplate feature={LANDINGS.search} />;
}

export default SearchLandingPage;
