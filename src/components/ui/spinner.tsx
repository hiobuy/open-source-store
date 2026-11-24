import { useTranslations as useUiTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const translateUi = useUiTranslations();

  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={translateUi.raw("Loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
