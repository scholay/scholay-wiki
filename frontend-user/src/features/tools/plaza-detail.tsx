import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type PlazaDetail = {
  id: string;
  title: string;
  content: ReactNode;
} | null;

type PlazaDetailApi = {
  detail: PlazaDetail;
  setDetail: (next: PlazaDetail) => void;
};

const PlazaDetailContext = createContext<PlazaDetailApi | null>(null);

export function PlazaDetailProvider({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState<PlazaDetail>(null);
  const value = useMemo(() => ({ detail, setDetail }), [detail]);
  return (
    <PlazaDetailContext.Provider value={value}>
      {children}
    </PlazaDetailContext.Provider>
  );
}

export function usePlazaDetail(): PlazaDetailApi {
  const ctx = useContext(PlazaDetailContext);
  if (!ctx) {
    return { detail: null, setDetail: () => undefined };
  }
  return ctx;
}
