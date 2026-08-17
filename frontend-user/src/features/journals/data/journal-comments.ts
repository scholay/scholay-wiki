import { useSyncExternalStore } from 'react';

export interface JournalComment {
  id: string;
  journalId: number;
  author: string;
  body: string;
  createdAt: string;
}

const AUTHORS = ['林研', '周予', '陈默', 'K. Patel', '王启明', '苏晚'];

const BODIES = [
  '审稿大约三个月，编辑回复及时，修回意见很具体。',
  'scope 卡得紧，偏方法的稿建议先写信问编辑。',
  'LaTeX 模板一次过，投稿系统比想象中顺。',
  'Desk reject 比例不低，封面信把贡献写清楚更稳。',
  '分区稳，适合毕业节点，但排队偏长。',
  '领域里更认这本的方法专栏，综述栏目相对难进。',
];

const extras = new Map<number, JournalComment[]>();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function seedFor(journalId: number): JournalComment[] {
  const n = 2 + (Math.abs(journalId) % 3);
  const out: JournalComment[] = [];
  for (let i = 0; i < n; i += 1) {
    const idx = (Math.abs(journalId) + i * 3) % BODIES.length;
    out.push({
      id: `seed-${journalId}-${i}`,
      journalId,
      author: AUTHORS[(idx + journalId) % AUTHORS.length],
      body: BODIES[idx],
      createdAt: new Date(Date.now() - (i + 1) * 86_400_000).toISOString(),
    });
  }
  return out;
}

export function getJournalComments(journalId: number): JournalComment[] {
  return [...seedFor(journalId), ...(extras.get(journalId) ?? [])];
}

export function addJournalComment(
  journalId: number,
  author: string,
  body: string,
): JournalComment {
  const comment: JournalComment = {
    id: `local-${journalId}-${Date.now()}`,
    journalId,
    author,
    body,
    createdAt: new Date().toISOString(),
  };
  extras.set(journalId, [...(extras.get(journalId) ?? []), comment]);
  emit();
  return comment;
}

export function useJournalComments(journalId: number): JournalComment[] {
  useSyncExternalStore(subscribe, () => version);
  return getJournalComments(journalId);
}
