"use client";

import { useEffect, useState } from "react";

interface Resource<T> {
  key: string | null;
  data: T | undefined;
  error: unknown;
  loading: boolean;
}
function initial<T>(key: string | null): Resource<T> {
  return { key, data: undefined, error: null, loading: key !== null };
}

/** Read-only resources reset with their inputs and ignore a previous request's result. */
export function useRemoteResource<T>(
  key: string | null,
  load: () => Promise<T>,
) {
  const [resource, setResource] = useState(() => initial<T>(key));
  if (resource.key !== key) setResource(initial<T>(key));
  useEffect(() => {
    if (key === null) return;
    let current = true;
    load().then(
      (data) => {
        if (current) setResource({ key, data, error: null, loading: false });
      },
      (error) => {
        if (current)
          setResource({ key, data: undefined, error, loading: false });
      },
    );
    return () => {
      current = false;
    };
  }, [key, load]);
  return resource;
}
