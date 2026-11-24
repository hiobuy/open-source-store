"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon } from "lucide-react";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-primary ring-offset-background focus-visible:ring-ring data-checked:bg-primary data-checked:text-primary-foreground aria-invalid:border-destructive relative inline-flex size-4 shrink-0 items-center justify-center rounded-sm border transition-[background-color,border-color] after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="text-primary-foreground flex items-center justify-center [&>svg]:size-4"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
