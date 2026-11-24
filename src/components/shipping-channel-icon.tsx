"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Keep unavailable carrier artwork from leaving a broken-image marker. */
export function ShippingChannelIcon({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) {
    return (
      <Truck
        aria-hidden="true"
        className={cn(className, "text-muted-foreground p-2")}
        strokeWidth={1.5}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
