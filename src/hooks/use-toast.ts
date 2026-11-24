"use client";
import type { ReactNode } from "react";
import { toast as notify } from "sonner";
type Input = {
  title?: ReactNode;
  description?: ReactNode;
  variant?: "default" | "destructive";
};
export function toast({ title, description, variant }: Input) {
  const id = (variant === "destructive" ? notify.error : notify)(title, {
    description,
  });
  return { id, dismiss: () => notify.dismiss(id) };
}
export function useToast() {
  return { toast, dismiss: (id?: string | number) => notify.dismiss(id) };
}
