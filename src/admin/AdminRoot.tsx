"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { ToastProvider } from "./components/toast";
import { BrandProvider } from "./lib/brand";
import { LocaleProvider } from "./lib/i18n";

/**
 * The admin is a browser-only React Router app: it reads window, localStorage
 * and document while rendering. Render it only after mount so the server and
 * the first client render both produce the same empty shell.
 */
export function AdminRoot() {
  const [mounted, setMounted] = useState(false);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <LocaleProvider>
            <BrandProvider>
              <App />
            </BrandProvider>
          </LocaleProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
