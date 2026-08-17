/** 从 Paper.externalIds 提取 DOI —— 兼容各上游大小写 */
export function extractPaperDoi(
  externalIds?: Record<string, unknown>,
): string | undefined {
  if (!externalIds) return undefined;
  for (const k of ['DOI', 'doi', 'Doi']) {
    const v = externalIds[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** 从 externalIds 提取 ArXiv id(若有) */
export function extractPaperArxivId(
  externalIds?: Record<string, unknown>,
): string | undefined {
  if (!externalIds) return undefined;
  for (const k of ['ArXiv', 'arxiv', 'ARXIV']) {
    const v = externalIds[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}
