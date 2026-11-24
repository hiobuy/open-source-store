import type { CSSProperties, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";
export function ResponsiveContentFrame({
  children,
  className,
  style,
  containerRef,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  containerRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={containerRef}
      className={cn("site-container", className)}
      style={style}
    >
      {children}
    </div>
  );
}
