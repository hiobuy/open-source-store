"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { signOutOfProcurement } from "@/lib/procurement/client";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import { useCommonStore } from "@/lib/store/common";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function StorefrontLogoutDialog({
  open,
  onOpenChange,
  title,
  description,
  cancel,
  confirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancel: string;
  confirm: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;
    const session = useProcurementSessionStore.getState();
    if (!session.hasSession) {
      onOpenChange(false);
      router.replace("/");
      return;
    }

    setIsLoggingOut(true);
    try {
      const result = await signOutOfProcurement();
      if (result?.success === false) throw new Error("Sign out failed");
      session.clearSession();
      useCommonStore.getState().resetCustomerState();
      onOpenChange(false);
      router.replace("/");
    } catch {
      toast.error(t("The service is temporarily unavailable Please try again"));
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancel}</AlertDialogCancel>
          <AlertDialogAction
            aria-busy={isLoggingOut}
            className="relative"
            disabled={isLoggingOut}
            onClick={(event) => {
              event.preventDefault();
              void handleLogout();
            }}
          >
            <span className={isLoggingOut ? "opacity-0" : undefined}>
              {confirm}
            </span>
            {isLoggingOut && (
              <Spinner
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              />
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
