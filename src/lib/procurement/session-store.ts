"use client";

import { create } from "zustand";
import {
  clearProfileCache,
  readProfileCache,
  writeProfileCache,
} from "./profile-cache";
import type { ProcurementMe } from "./types";

export interface ProcurementHeaderUser {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
}

let cacheSyncEnabled = false;
let skipNextCacheWrite = false;

interface ProcurementSessionState {
  hasSession: boolean;
  user: ProcurementHeaderUser | null;
  profile: ProcurementMe | null;
  needsProfile: boolean;
  loadingProfile: boolean;
  clientStateVersion: number;
  requestId: number;
  applyServerSession: (present: boolean) => void;
  setSessionUser: (user: ProcurementHeaderUser) => void;
  setProfile: (profile: ProcurementMe) => void;
  patchProfile: (partial: Partial<ProcurementMe>) => void;
  markPendingProfile: () => void;
  clearSession: () => void;
  beginProfileFetch: (force?: boolean) => number | null;
  completeProfileFetch: (requestId: number, profile: ProcurementMe) => void;
  failProfileFetch: (requestId: number, sessionStillValid: boolean) => void;
}

export const useProcurementSessionStore = create<ProcurementSessionState>(
  (set, get) => ({
    hasSession: false,
    user: null,
    profile: null,
    needsProfile: false,
    loadingProfile: false,
    clientStateVersion: 0,
    requestId: 0,

    applyServerSession: (present) => {
      const state = get();
      if (state.clientStateVersion > 0) return;
      cacheSyncEnabled = true;
      if (!present) {
        clearProfileCache();
        if (!state.hasSession && !state.profile) return;
        set({
          hasSession: false,
          user: null,
          profile: null,
          needsProfile: false,
          loadingProfile: false,
          requestId: state.requestId + 1,
        });
        return;
      }
      if (state.hasSession) return;
      const cached = !state.user ? readProfileCache() : null;
      if (cached) {
        set({
          hasSession: true,
          user: cached.user,
          profile: cached.profile,
          needsProfile: true,
          loadingProfile: false,
          requestId: state.requestId + 1,
        });
        return;
      }
      set({
        hasSession: true,
        user: state.user,
        profile: state.profile,
        needsProfile: !state.user,
        loadingProfile: false,
        requestId: state.requestId + 1,
      });
    },

    setSessionUser: (user) =>
      set((state) => ({
        hasSession: true,
        user,
        profile: state.profile?.id === user.id ? state.profile : null,
        needsProfile: false,
        loadingProfile: false,
        clientStateVersion: state.clientStateVersion + 1,
        requestId: state.requestId + 1,
      })),

    setProfile: (profile) =>
      set((state) => ({
        hasSession: true,
        user: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          avatar: state.user?.id === profile.id ? state.user.avatar : null,
        },
        profile,
        needsProfile: false,
        loadingProfile: false,
      })),

    patchProfile: (partial) =>
      set((state) => {
        if (!state.profile) return {};
        const profile = { ...state.profile, ...partial };
        return {
          profile,
          user: state.user
            ? { ...state.user, name: profile.name, email: profile.email }
            : state.user,
        };
      }),

    markPendingProfile: () => {
      clearProfileCache();
      set((state) => ({
        hasSession: true,
        user: null,
        profile: null,
        needsProfile: true,
        loadingProfile: false,
        clientStateVersion: state.clientStateVersion + 1,
        requestId: state.requestId + 1,
      }));
    },

    clearSession: () => {
      clearProfileCache();
      set((state) => ({
        hasSession: false,
        user: null,
        profile: null,
        needsProfile: false,
        loadingProfile: false,
        clientStateVersion: state.clientStateVersion + 1,
        requestId: state.requestId + 1,
      }));
    },

    beginProfileFetch: (force = false) => {
      const state = get();
      if (
        !state.hasSession ||
        (!force && state.profile) ||
        state.loadingProfile
      ) {
        return null;
      }
      const requestId = state.requestId + 1;
      set({ loadingProfile: true, requestId });
      return requestId;
    },

    completeProfileFetch: (requestId, profile) =>
      set((state) => {
        if (!state.hasSession || state.requestId !== requestId) {
          return {};
        }
        return {
          user: {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            avatar: state.user?.id === profile.id ? state.user.avatar : null,
          },
          profile,
          needsProfile: false,
          loadingProfile: false,
        };
      }),

    failProfileFetch: (requestId, sessionStillValid) =>
      set((state) => {
        if (state.requestId !== requestId) return {};
        if (!sessionStillValid) {
          return {
            hasSession: false,
            user: null,
            profile: null,
            needsProfile: false,
            loadingProfile: false,
            clientStateVersion: state.clientStateVersion + 1,
            requestId: state.requestId + 1,
          };
        }
        return { needsProfile: false, loadingProfile: false };
      }),
  }),
);

/** Apply a cache update from another tab without echoing it back to storage. */
export function applyExternalProfileCache(
  user: ProcurementHeaderUser,
  profile: ProcurementMe | null,
) {
  skipNextCacheWrite = true;
  useProcurementSessionStore.setState((state) => ({
    hasSession: true,
    user,
    profile,
    needsProfile: false,
    loadingProfile: false,
    requestId: state.requestId + 1,
  }));
}

if (typeof window !== "undefined") {
  useProcurementSessionStore.subscribe((state) => {
    if (!cacheSyncEnabled) return;
    if (skipNextCacheWrite) {
      skipNextCacheWrite = false;
      return;
    }
    if (!state.hasSession || !state.user) {
      clearProfileCache();
      return;
    }
    writeProfileCache(state.user, state.profile);
  });
}
