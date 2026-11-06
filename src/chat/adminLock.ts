import { create } from "zustand";

/** The management page locks after this long without a management action; the server enforces the same rule. */
export const ADMIN_LOCK_MS = 5 * 60_000;

interface AdminLockState {
  locked: boolean;
  last: number;
}

export const useAdminLock = create<AdminLockState>(() => ({ locked: false, last: Date.now() }));

export const lockAdmin = (): void => useAdminLock.setState({ locked: true });
export const unlockedNow = (): void => useAdminLock.setState({ locked: false, last: Date.now() });
export const markAdminAction = (): void => useAdminLock.setState({ last: Date.now() });
