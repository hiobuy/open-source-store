"use client";

import { useCallback, useState } from "react";
import { signOutOfProcurement } from "@/lib/procurement/client";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import type { ProcurementSignedInUser } from "@/lib/procurement/types";

export function useProcurementSession() {
  const [user, setUser] = useState<ProcurementSignedInUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const result = await signOutOfProcurement();
      if (result?.success === false) {
        throw new Error("The session is still active");
      }
      useProcurementSessionStore.getState().clearSession();
      setUser(null);
    } finally {
      setSigningOut(false);
    }
  }, []);

  return { user, signingOut, setUser, signOut };
}
