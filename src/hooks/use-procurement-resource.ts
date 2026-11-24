"use client";

import { useCallback, useEffect, useState } from "react";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";

export function useProcurementResource<K, T>(
  load: (key: K) => Promise<T>,
  key: K | null,
) {
  const session = useProcurementSessionStore(
    (state) => state.clientStateVersion,
  );
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const [result, setResult] = useState<{
    key: K;
    session: number;
    version: number;
    data?: T;
    error?: Error;
  }>();

  useEffect(() => {
    if (key === null) return;
    let active = true;
    load(key).then(
      (data) => {
        if (active) setResult({ key, session, version, data });
      },
      (error: unknown) => {
        if (active) {
          setResult({
            key,
            session,
            version,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [key, load, session, version]);

  const current =
    result &&
    result.key === key &&
    result.session === session &&
    result.version === version
      ? result
      : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: key !== null && !current,
    reload,
  };
}
