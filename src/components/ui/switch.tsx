"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Switch as SwitchPrimitive } from "radix-ui";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch focus-visible:ring-ring focus-visible:ring-offset-background data-checked:bg-primary data-unchecked:bg-input aria-invalid:border-destructive inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=default]:h-6 data-[size=default]:w-11 data-[size=sm]:h-4 data-[size=sm]:w-7",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="bg-background pointer-events-none block rounded-full shadow-lg transition-transform group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-5 group-data-[size=sm]/switch:data-checked:translate-x-3 data-unchecked:translate-x-0 group-data-[size=default]/switch:rtl:data-checked:-translate-x-5 group-data-[size=sm]/switch:rtl:data-checked:-translate-x-3"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
