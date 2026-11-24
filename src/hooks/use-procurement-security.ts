"use client";

import { useCallback, useEffect, useState } from "react";
import { getPublicSecurity } from "@/lib/procurement/client";
import type { ProcurementSecurity } from "@/lib/procurement/types";

async function loadSecurity() {
  try {
    return await getPublicSecurity();
  } catch {
    return null;
  }
}

export function useProcurementSecurity() {
  const [security, setSecurity] = useState<ProcurementSecurity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void loadSecurity().then((next) => {
      if (!active) return;
      setSecurity(next);
      setError(!next);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    const next = await loadSecurity();
    setSecurity(next);
    setError(!next);
    setLoading(false);
  }, []);

  return { security, loading, error, reload };
}
