"use client";

import { getProcurementMe, ProcurementApiError } from "./client";
import { useProcurementSessionStore } from "./session-store";
import type { ProcurementMe } from "./types";

let inflight: Promise<ProcurementMe> | null = null;
let revalidatedThisLoad = false;

/**
 * Load the current procurement profile once and keep it in the session store.
 * Concurrent callers share the same request; `force` refreshes stale data
 * without bypassing an already-running request.
 */
export function loadProcurementProfile({
  force = false,
}: {
  force?: boolean;
} = {}): Promise<ProcurementMe> {
  const store = useProcurementSessionStore;
  const state = store.getState();
  if (!force && state.profile) return Promise.resolve(state.profile);
  if (inflight) return inflight;
  if (!state.hasSession) {
    return Promise.reject(new Error("No procurement session"));
  }

  const requestId = state.beginProfileFetch(force);
  if (requestId === null) {
    if (inflight) return inflight;
    const latestProfile = store.getState().profile;
    if (!force && latestProfile) return Promise.resolve(latestProfile);
    return Promise.reject(new Error("Profile request already in progress"));
  }

  const version = state.clientStateVersion;
  const request = getProcurementMe()
    .then((profile) => {
      const current = store.getState();
      if (!current.hasSession || current.clientStateVersion !== version) {
        throw new Error("Procurement session changed while loading profile");
      }
      current.completeProfileFetch(requestId, profile);
      return profile;
    })
    .catch((error: unknown) => {
      const current = store.getState();
      if (current.requestId === requestId) {
        const unauthorized =
          error instanceof ProcurementApiError && error.status === 401;
        current.failProfileFetch(requestId, !unauthorized);
      }
      throw error;
    })
    .finally(() => {
      if (inflight === request) inflight = null;
    });
  inflight = request;
  return request;
}

/**
 * Refresh the cached profile once per full page load. A later login in the
 * same SPA session (profile missing) is still allowed to revalidate.
 */
export function revalidateProcurementProfile(): Promise<ProcurementMe | null> {
  const state = useProcurementSessionStore.getState();
  if (!state.hasSession) return Promise.resolve(state.profile);
  if (revalidatedThisLoad && state.profile) {
    return Promise.resolve(state.profile);
  }
  revalidatedThisLoad = true;
  return loadProcurementProfile({ force: true });
}
