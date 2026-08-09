import { create } from "zustand";
import {
  clearInviteCode,
  readInviteCandidate,
  saveInviteCode,
  type StoredInviteCandidate,
} from "@/shared/lib/invite-code";

const DAY_MS = 24 * 60 * 60 * 1000;

interface InviteCandidateState {
  candidate: StoredInviteCandidate | null;
  capture: (code: string, bindWindowDays?: number) => void;
  confirm: (
    code: string,
    inviterName?: string,
    bindWindowDays?: number,
  ) => void;
  setBindWindowDays: (days: number) => void;
  clear: () => void;
  refresh: () => void;
}

/**
 * 邀请候选码的内存态 + localStorage 投影。
 * http 拦截器仍直接读 localStorage，保证冷启动 / OAuth 整页往返也不丢；
 * React UI 读这个 store，保证编辑、取消后各个鉴权壳同帧更新。
 */
export const useInviteCandidate = create<InviteCandidateState>((set, get) => ({
  candidate: readInviteCandidate(),
  capture: (raw, bindWindowDays) => {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    saveInviteCode(code, { bindWindowDays });
    set({ candidate: readInviteCandidate() });
  },
  confirm: (raw, inviterName, bindWindowDays) => {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    const current = get().candidate;
    const sameCandidate = current?.code === code ? current : undefined;
    saveInviteCode(code, {
      inviterName,
      valid: true,
      bindWindowDays,
      capturedAt: sameCandidate?.ts,
      ...(bindWindowDays == null && sameCandidate?.expiresAt
        ? { expiresAt: sameCandidate.expiresAt }
        : {}),
    });
    set({ candidate: readInviteCandidate() });
  },
  setBindWindowDays: (days) => {
    const current = get().candidate;
    if (!current) return;
    const normalizedDays =
      Number.isFinite(days) && days > 0 ? Math.min(3650, Math.trunc(days)) : 30;
    if (current.expiresAt === current.ts + normalizedDays * DAY_MS) return;
    saveInviteCode(current.code, {
      inviterName: current.inviterName,
      valid: current.valid,
      capturedAt: current.ts,
      bindWindowDays: days,
    });
    set({ candidate: readInviteCandidate() });
  },
  clear: () => {
    clearInviteCode();
    set({ candidate: null });
  },
  refresh: () => set({ candidate: readInviteCandidate() }),
}));
