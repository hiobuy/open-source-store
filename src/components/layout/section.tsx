/**
 * Section - 基础容器组件
 * 用于包裹内容并提供统一的间距和最大宽度
 */
import { CSSProperties, forwardRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
export type SectionProps = {
  className?: string;
  children: ReactNode;
  maxWidth?: string;
  style?: CSSProperties;
};
export const Section = forwardRef<HTMLDivElement, SectionProps>(
  ({ children, className = "", maxWidth = "1280px", style = {} }, ref) => {
    return (
      <div
        className={cn("px-4 md:px-0", className)}
        style={{
          ...style,
        }}
        ref={ref}
      >
        <div className="mx-auto h-full w-full" style={{ maxWidth }}>
          {children}
        </div>
      </div>
    );
  },
);
Section.displayName = "Section";
