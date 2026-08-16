import { Navigate } from 'react-router-dom';

/** 旧「学术期刊」一级落地已并入文献搜索 Hub。 */
export function JournalHubPage() {
  return <Navigate to="/search" replace />;
}

export default JournalHubPage;
