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
import { useTranslations } from "next-intl";
interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
}
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText,
  cancelText,
}: DeleteConfirmDialogProps) {
  const t = useTranslations();
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? t("Confirm deletion")}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? t("This cannot be undone Continue?")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelText ?? t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive hover:bg-destructive/90 text-white"
          >
            {confirmText ?? t("Delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
