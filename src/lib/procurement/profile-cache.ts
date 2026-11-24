import type { ProcurementHeaderUser } from "./session-store";
import type { ProcurementMe } from "./types";

export const PROFILE_CACHE_KEY = "procurement:profile";
const PROFILE_CACHE_VERSION = 1;

export type ProcurementProfileCache = {
  v: 1;
  user: ProcurementHeaderUser;
  profile: ProcurementMe | null;
  savedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHeaderUser(value: unknown): value is ProcurementHeaderUser {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    (value.avatar === undefined ||
      value.avatar === null ||
      typeof value.avatar === "string")
  );
}

function isProfile(value: unknown): value is ProcurementMe | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.email === "string"
  );
}

function removeInvalidCache() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {}
}

export function readProfileCache(): ProcurementProfileCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.v !== PROFILE_CACHE_VERSION ||
      !isHeaderUser(value.user) ||
      !isProfile(value.profile) ||
      typeof value.savedAt !== "number"
    ) {
      removeInvalidCache();
      return null;
    }
    return value as ProcurementProfileCache;
  } catch {
    removeInvalidCache();
    return null;
  }
}

export function writeProfileCache(
  user: ProcurementHeaderUser,
  profile: ProcurementMe | null,
) {
  if (typeof window === "undefined") return;
  try {
    const value: ProcurementProfileCache = {
      v: PROFILE_CACHE_VERSION,
      user,
      profile,
      savedAt: Date.now(),
    };
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(value));
  } catch {}
}

export function clearProfileCache() {
  if (typeof window === "undefined") return;
  removeInvalidCache();
}
