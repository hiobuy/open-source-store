"use client";

import { create } from "zustand";
import { getProcurementCartCount } from "./client";
import { procurementCartChanged } from "./purchase";
import { useProcurementSessionStore } from "./session-store";

interface ProcurementCartCountState {
  count: number;
  refresh: () => void;
}

let requestId = 0;

export const useProcurementCartCount = create<ProcurementCartCountState>(
  (set) => ({
    count: 0,
    refresh: () => {
      const id = ++requestId;
      if (!useProcurementSessionStore.getState().hasSession) {
        set({ count: 0 });
        return;
      }
      void getProcurementCartCount().then(
        ({ total }) => {
          if (id === requestId) set({ count: total });
        },
        () => {},
      );
    },
  }),
);

let listening = false;

function listenForCartCountChanges() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const refresh = () => useProcurementCartCount.getState().refresh();
  refresh();
  window.addEventListener(procurementCartChanged, refresh);
  useProcurementSessionStore.subscribe((state, previous) => {
    if (
      state.hasSession !== previous.hasSession ||
      state.clientStateVersion !== previous.clientStateVersion
    ) {
      refresh();
    }
  });
}

listenForCartCountChanges();
